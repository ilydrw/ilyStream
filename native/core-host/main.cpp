#include "protocol.h"
#include "audio_capture_core.h"
#include "program_mixer_core.h"
#include "program_mixer_transport.h"
#include "shared_audio_ring.h"
#include "mixer-transport-config.h"
#include "ily/engine.h"

#include <windows.h>
#include <sddl.h>
#include <bcrypt.h>

#include <array>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstring>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <memory>
#include <string>
#include <unordered_set>
#include <vector>

namespace {

std::atomic<bool> g_engineInitialized{false};
std::shared_ptr<ily::audio::SharedAudioRingWriter> g_captureRing;
std::unique_ptr<ily::audio::ProgramMixerTransport> g_mixerTransport;

bool RandomBytes(void* output, std::size_t length) {
    return BCryptGenRandom(nullptr, static_cast<PUCHAR>(output), static_cast<ULONG>(length),
        BCRYPT_USE_SYSTEM_PREFERRED_RNG) == 0;
}

std::string RandomHex(std::size_t bytes) {
    std::vector<std::uint8_t> random(bytes);
    if (!RandomBytes(random.data(), random.size())) return {};
    constexpr char digits[] = "0123456789abcdef";
    std::string result(bytes * 2, '0');
    for (std::size_t index = 0; index < bytes; ++index) {
        result[index * 2] = digits[random[index] >> 4U];
        result[index * 2 + 1] = digits[random[index] & 0x0fU];
    }
    return result;
}

std::uint64_t RandomGeneration() {
    std::uint64_t value = 0;
    return RandomBytes(&value, sizeof(value)) && value != 0 ? value : 0;
}

std::string EnvironmentValue(const char* name) {
    const char* value = std::getenv(name);
    return value ? value : "";
}

bool IsValidPipeSuffix(const std::string& value) {
    if (value.size() < 8 || value.size() > 96) return false;
    for (const unsigned char ch : value) {
        if (!((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') ||
              (ch >= '0' && ch <= '9') || ch == '.' || ch == '_' || ch == '-')) return false;
    }
    return true;
}

std::wstring WidenAscii(const std::string& value) {
    return std::wstring(value.begin(), value.end());
}

struct LocalMemoryDeleter {
    void operator()(void* value) const { if (value) LocalFree(value); }
};

bool BuildPipeSecurity(SECURITY_ATTRIBUTES& attributes, std::unique_ptr<void, LocalMemoryDeleter>& owner) {
    HANDLE token = nullptr;
    if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) return false;
    DWORD length = 0;
    GetTokenInformation(token, TokenUser, nullptr, 0, &length);
    std::vector<std::uint8_t> buffer(length);
    const bool gotUser = GetTokenInformation(token, TokenUser, buffer.data(), length, &length) != FALSE;
    CloseHandle(token);
    if (!gotUser) return false;

    LPWSTR sid = nullptr;
    const auto* user = reinterpret_cast<const TOKEN_USER*>(buffer.data());
    if (!ConvertSidToStringSidW(user->User.Sid, &sid)) return false;
    std::unique_ptr<void, LocalMemoryDeleter> sidOwner(sid);
    const std::wstring sddl = L"D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GA;;;" +
        std::wstring(sid) + L")";
    PSECURITY_DESCRIPTOR descriptor = nullptr;
    if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl.c_str(), SDDL_REVISION_1, &descriptor, nullptr)) return false;
    owner.reset(descriptor);
    attributes = {sizeof(SECURITY_ATTRIBUTES), descriptor, FALSE};
    return true;
}

bool WriteLine(HANDLE pipe, const std::string& line) {
    const std::string payload = line + "\n";
    DWORD written = 0;
    return WriteFile(pipe, payload.data(), static_cast<DWORD>(payload.size()), &written, nullptr) &&
        written == payload.size();
}

constexpr std::size_t kMaxMixerSources = 64;
constexpr std::size_t kMaxMixerLayerIds = 128;
constexpr std::uint64_t kMaxSafeJsonInteger = 9007199254740991ULL;

bool IsValidMixerId(const std::string& id) {
    if (id.empty() || id.size() > 128) return false;
    for (const unsigned char ch : id) {
        if (ch < 0x20 || ch > 0x7e) return false;
    }
    return true;
}

double RequiredFiniteNumber(const nlohmann::json& object, const char* field,
                            double minimum, double maximum) {
    if (!object.contains(field) || !object.at(field).is_number()) {
        throw std::runtime_error(std::string("Mixer field must be numeric: ") + field);
    }
    const double value = object.at(field).get<double>();
    if (!std::isfinite(value) || value < minimum || value > maximum) {
        throw std::runtime_error(std::string("Mixer field is out of range: ") + field);
    }
    return value;
}

bool RequiredBoolean(const nlohmann::json& object, const char* field) {
    if (!object.contains(field) || !object.at(field).is_boolean()) {
        throw std::runtime_error(std::string("Mixer field must be boolean: ") + field);
    }
    return object.at(field).get<bool>();
}

std::unordered_set<std::string> ParseMixerIdSet(const nlohmann::json& object,
                                                const char* field) {
    if (!object.contains(field) || !object.at(field).is_array() ||
        object.at(field).size() > kMaxMixerLayerIds) {
        throw std::runtime_error(std::string("Invalid mixer ID list: ") + field);
    }
    std::unordered_set<std::string> result;
    for (const auto& item : object.at(field)) {
        if (!item.is_string()) throw std::runtime_error("Mixer IDs must be strings");
        const std::string id = item.get<std::string>();
        if (!IsValidMixerId(id) || !result.insert(id).second) {
            throw std::runtime_error("Mixer IDs must be unique printable strings");
        }
    }
    return result;
}

nlohmann::json EvaluateMixerPolicy(const nlohmann::json& params) {
    using nlohmann::json;
    if (!params.is_object()) throw std::runtime_error("Mixer parameters must be an object");
    if (!params.contains("sequence") ||
        !(params.at("sequence").is_number_unsigned() || params.at("sequence").is_number_integer())) {
        throw std::runtime_error("Mixer sequence must be an integer");
    }
    const std::int64_t signedSequence = params.at("sequence").get<std::int64_t>();
    if (signedSequence <= 0 || static_cast<std::uint64_t>(signedSequence) > kMaxSafeJsonInteger) {
        throw std::runtime_error("Mixer sequence is out of range");
    }
    if (!params.contains("sources") || !params.at("sources").is_array() ||
        params.at("sources").size() > kMaxMixerSources) {
        throw std::runtime_error("Mixer sources must be a bounded array");
    }

    std::vector<ily::audio::MixerSourcePolicy> sources;
    sources.reserve(params.at("sources").size());
    std::unordered_set<std::string> sourceIds;
    for (const auto& item : params.at("sources")) {
        if (!item.is_object() || !item.contains("id") || !item.at("id").is_string()) {
            throw std::runtime_error("Mixer source must be an object with an ID");
        }
        ily::audio::MixerSourcePolicy source;
        source.id = item.at("id").get<std::string>();
        if (!IsValidMixerId(source.id) || !sourceIds.insert(source.id).second) {
            throw std::runtime_error("Mixer source IDs must be unique printable strings");
        }
        source.volume = static_cast<float>(RequiredFiniteNumber(item, "volume", 0.0, 2.0));
        source.pan = static_cast<float>(RequiredFiniteNumber(item, "pan", -1.0, 1.0));
        source.muted = RequiredBoolean(item, "muted");
        source.solo = RequiredBoolean(item, "solo");
        source.mono = RequiredBoolean(item, "mono");
        const bool claimedGlobal = RequiredBoolean(item, "global");
        source.global = source.id == "soundboard" || source.id == "tts-audio";
        if (claimedGlobal != source.global) throw std::runtime_error("Invalid global mixer source claim");
        if (!item.contains("monitoringMode") || !item.at("monitoringMode").is_string()) {
            throw std::runtime_error("Mixer monitoring mode is required");
        }
        const std::string monitoring = item.at("monitoringMode").get<std::string>();
        if (monitoring == "off") source.monitoring = ily::audio::MonitoringMode::off;
        else if (monitoring == "monitorOnly") source.monitoring = ily::audio::MonitoringMode::monitorOnly;
        else if (monitoring == "monitorAndOutput") source.monitoring = ily::audio::MonitoringMode::monitorAndOutput;
        else throw std::runtime_error("Invalid mixer monitoring mode");
        sources.push_back(std::move(source));
    }

    ily::audio::MixerRoutingPolicy policy;
    policy.activeLayerIds = ParseMixerIdSet(params, "activeLayerIds");
    policy.retainedLayerIds = ParseMixerIdSet(params, "retainedLayerIds");
    if (params.contains("transition")) {
        const auto& transition = params.at("transition");
        if (!transition.is_object()) throw std::runtime_error("Mixer transition must be an object");
        policy.transition.active = RequiredBoolean(transition, "active");
        if (!transition.contains("type") || !transition.at("type").is_string()) {
            throw std::runtime_error("Mixer transition type is required");
        }
        const std::string type = transition.at("type").get<std::string>();
        if (type != "fade" && type != "stinger") throw std::runtime_error("Invalid mixer transition type");
        policy.transition.fade = type == "fade";
        policy.transition.progress = static_cast<float>(RequiredFiniteNumber(transition, "progress", 0.0, 1.0));
        policy.transition.fromLayerIds = ParseMixerIdSet(transition, "fromLayerIds");
        policy.transition.toLayerIds = ParseMixerIdSet(transition, "toLayerIds");
    }

    json routes = json::array();
    for (const auto& route : ily::audio::EvaluateProgramRoutes(sources, policy)) {
        routes.push_back({{"id", route.id}, {"eligible", route.eligible}, {"output", route.output},
            {"sceneGain", route.sceneGain}, {"effectiveGain", route.effectiveGain}});
    }
    return {{"sequence", signedSequence}, {"routes", std::move(routes)}};
}

nlohmann::json MixerTransportStatusJson(const ily::audio::ProgramMixerTransportStatus& status) {
    return {{"running", status.running}, {"blocksMixed", status.blocksMixed},
        {"framesMixed", status.framesMixed}, {"sourceUnderruns", status.sourceUnderruns},
        {"sourceFramesSkipped", status.sourceFramesSkipped},
        {"masterDsp", {{"enabled", status.masterDsp.enabled},
            {"processedFrames", status.masterDsp.processedFrames},
            {"clippedFrames", status.masterDsp.clippedFrames},
            {"maxInputPeak", status.masterDsp.maxInputPeak},
            {"maxOutputPeak", status.masterDsp.maxOutputPeak},
            {"maxGainReductionDb", status.masterDsp.maxGainReductionDb}}}};
}

std::uint64_t ParseGenerationText(const nlohmann::json& value) {
    if (!value.is_string()) throw std::runtime_error("Mixer ring generation must be a string");
    const std::string text = value.get<std::string>();
    if (text.empty() || text.size() > 20 || text[0] == '0') {
        throw std::runtime_error("Invalid mixer ring generation");
    }
    std::uint64_t result = 0;
    for (const char character : text) {
        if (character < '0' || character > '9') throw std::runtime_error("Invalid mixer ring generation");
        const std::uint64_t digit = static_cast<std::uint64_t>(character - '0');
        if (result > ((std::numeric_limits<std::uint64_t>::max)() - digit) / 10) {
            throw std::runtime_error("Mixer ring generation is out of range");
        }
        result = result * 10 + digit;
    }
    if (result == 0) throw std::runtime_error("Invalid mixer ring generation");
    return result;
}

nlohmann::json StartMixerTransport(const nlohmann::json& params) {
    using nlohmann::json;
    if (g_mixerTransport) throw std::runtime_error("Program mixer transport is already running");
    if (!params.is_object() || !params.contains("sources") || !params.at("sources").is_array() ||
        params.at("sources").empty() || params.at("sources").size() > kMaxMixerSources) {
        throw std::runtime_error("Mixer transport sources must be a bounded non-empty array");
    }
    constexpr std::uint32_t sampleRate = 48000;
    constexpr std::uint32_t channels = 2;
    constexpr std::uint32_t blockFrames = 1024;
    constexpr std::uint32_t capacityFrames = 96256;
    ily::audio::ProgramMixerTransportOptions options;
    std::unordered_set<std::string> ids;
    std::unordered_set<std::string> ringNames;
    for (const auto& item : params.at("sources")) {
        if (!item.is_object() || !item.contains("id") || !item.at("id").is_string() ||
            !item.contains("ringName") || !item.at("ringName").is_string() ||
            !item.contains("generation")) {
            throw std::runtime_error("Invalid mixer transport source");
        }
        ily::audio::ProgramMixerTransportSource source;
        source.id = item.at("id").get<std::string>();
        const std::string ringName = item.at("ringName").get<std::string>();
        constexpr const char* sourcePrefix = "Local\\ilyStream.Mixer.Source.";
        if (!IsValidMixerId(source.id) || !ids.insert(source.id).second ||
            ringName.rfind(sourcePrefix, 0) != 0 || !ringNames.insert(ringName).second) {
            throw std::runtime_error("Invalid or duplicate mixer transport identity");
        }
        source.ring = {ringName, ParseGenerationText(item.at("generation")), sampleRate,
            channels, capacityFrames, blockFrames};
        if (!ily::audio::IsValidSharedAudioRingOptions(source.ring)) {
            throw std::runtime_error("Invalid mixer source ring descriptor");
        }
        source.gain = static_cast<float>(RequiredFiniteNumber(item, "gain", 0.0, 2.0));
        source.pan = static_cast<float>(RequiredFiniteNumber(item, "pan", -1.0, 1.0));
        source.mono = RequiredBoolean(item, "mono");
        options.sources.push_back(std::move(source));
    }
    const std::uint64_t outputGeneration = RandomGeneration();
    const std::string outputSuffix = RandomHex(16);
    if (outputGeneration == 0 || outputSuffix.empty()) {
        throw std::runtime_error("Could not create mixer output identity");
    }
    options.outputRing = {"Local\\ilyStream.Program.Audio.NativeMixer." + outputSuffix,
        outputGeneration, sampleRate, channels, capacityFrames, blockFrames};
    options.masterDsp = ily::core_host::ParseMasterDspConfig(params);
    std::string error;
    auto transport = ily::audio::ProgramMixerTransport::Start(options, error);
    if (!transport) throw std::runtime_error(error);
    g_mixerTransport = std::move(transport);
    return {{"transport", "shared-memory-v1"}, {"format", "f32-interleaved"},
        {"ringName", options.outputRing.ringName},
        {"generation", std::to_string(outputGeneration)}, {"sampleRate", sampleRate},
        {"channels", channels}, {"capacityFrames", capacityFrames},
        {"blockFrames", blockFrames}, {"sourceCount", options.sources.size()}};
}

ily::core_host::HostOperations BuildOperations() {
    using nlohmann::json;
    return {
        [] { return json{{"pid", GetCurrentProcessId()}, {"engineInitialized", g_engineInitialized.load()}}; },
        [] {
            if (!g_engineInitialized.exchange(true)) {
                const IlyResult result = IlyInitializeSystem();
                if (result != ILY_SUCCESS) {
                    g_engineInitialized.store(false);
                    throw std::runtime_error("Native engine initialization failed");
                }
            }
            return json{{"initialized", true}};
        },
        [] {
            if (g_engineInitialized.exchange(false)) IlyShutdownSystem();
            return json{{"initialized", false}};
        },
        [] {
            std::vector<ily::audio::CaptureDevice> devices;
            std::string error;
            if (!ily::audio::ListCaptureDevices(devices, error)) throw std::runtime_error(error);
            json result = json::array();
            for (const auto& device : devices) {
                result.push_back({{"id", device.id}, {"name", device.name},
                    {"isDefault", device.isDefault}, {"backend", device.backend}});
            }
            return result;
        },
        [] {
            const auto status = ily::audio::GetCaptureStatus();
            return json{{"running", status.running}, {"framesCaptured", status.framesCaptured},
                {"framesDropped", status.framesDropped}, {"sampleRate", status.sampleRate},
                {"channels", status.channels}, {"backend", status.backend}};
        },
        [](const json& params) {
            if (ily::audio::GetCaptureStatus().running) {
                throw std::runtime_error("Audio capture is already running");
            }
            ily::audio::CaptureOptions options;
            options.deviceId = params.value("deviceId", "");
            options.backend = params.value("backend", "auto");
            options.sampleRate = params.value("sampleRate", 48000U);
            options.channels = params.value("channels", 2U);
            options.exclusive = params.value("exclusive", false);
            constexpr std::uint32_t blockFrames = 1024;
            const std::uint32_t requestedCapacity = options.sampleRate > 240000
                ? 480000 : options.sampleRate * 2;
            const std::uint32_t capacityFrames = std::max<std::uint32_t>(blockFrames,
                std::min<std::uint32_t>(480000 / blockFrames,
                    (requestedCapacity + blockFrames - 1) / blockFrames) * blockFrames);
            const std::uint64_t generation = RandomGeneration();
            const std::string suffix = RandomHex(16);
            if (generation == 0 || suffix.empty()) {
                throw std::runtime_error("Could not create capture transport identity");
            }
            ily::audio::SharedAudioRingOptions ringOptions{
                "Local\\ilyStream.Capture.Audio." + suffix,
                generation,
                options.sampleRate,
                options.channels,
                capacityFrames,
                blockFrames
            };
            std::string error;
            auto createdRing = ily::audio::SharedAudioRingWriter::Create(ringOptions, error);
            if (!createdRing) throw std::runtime_error(error);
            auto ring = std::shared_ptr<ily::audio::SharedAudioRingWriter>(std::move(createdRing));
            ily::audio::CaptureSessionInfo info;
            if (!ily::audio::StartCapture(options,
                    [ring, sampleRate = options.sampleRate, channels = options.channels](
                        const float* samples, std::size_t sampleCount,
                        const ily::audio::CaptureStatus& status) {
                        const std::uint64_t nowNs = static_cast<std::uint64_t>(
                            std::chrono::duration_cast<std::chrono::nanoseconds>(
                                std::chrono::steady_clock::now().time_since_epoch()).count());
                        const std::uint64_t frames = sampleCount / channels;
                        const std::uint64_t durationNs = frames * 1000000000ULL / sampleRate;
                        const std::uint64_t timestampNs = nowNs > durationNs ? nowNs - durationNs : 1;
                        return ring->Publish(samples, sampleCount, timestampNs, status.framesDropped);
                    },
                    info, error)) throw std::runtime_error(error);
            if (info.sampleRate != options.sampleRate || info.channels != options.channels) {
                ily::audio::StopCapture();
                throw std::runtime_error("Capture device did not negotiate the requested PCM format");
            }
            g_captureRing = ring;
            return json{{"sampleRate", info.sampleRate}, {"channels", info.channels},
                {"exclusive", info.exclusive}, {"chunkFrames", info.chunkFrames},
                {"backend", info.backend},
                {"transport", "shared-memory-v1"}, {"format", "f32-interleaved"},
                {"ringName", ringOptions.ringName}, {"generation", std::to_string(generation)},
                {"capacityFrames", ringOptions.capacityFrames}, {"blockFrames", ringOptions.blockFrames}};
        },
        [] {
            const auto status = ily::audio::StopCapture();
            g_captureRing.reset();
            return json{{"framesCaptured", status.framesCaptured},
                {"framesDropped", status.framesDropped}};
        },
        [](const json& params) { return EvaluateMixerPolicy(params); },
        [](const json& params) { return StartMixerTransport(params); },
        [] { return MixerTransportStatusJson(g_mixerTransport ? g_mixerTransport->GetStatus() : ily::audio::ProgramMixerTransportStatus{}); },
        [] {
            const auto status = g_mixerTransport ? g_mixerTransport->Stop() : ily::audio::ProgramMixerTransportStatus{};
            g_mixerTransport.reset();
            return MixerTransportStatusJson(status);
        }
    };
}

void Cleanup() {
    if (g_mixerTransport) g_mixerTransport->Stop();
    g_mixerTransport.reset();
    ily::audio::StopCapture();
    g_captureRing.reset();
    ily::audio::StopProgramAudioTransport();
    if (g_engineInitialized.exchange(false)) IlyShutdownSystem();
}

} // namespace

int wmain() {
    const std::string suffix = EnvironmentValue("ILYSTREAM_CORE_PIPE");
    const std::string capability = EnvironmentValue("ILYSTREAM_CORE_CAPABILITY");
    _putenv_s("ILYSTREAM_CORE_PIPE", "");
    _putenv_s("ILYSTREAM_CORE_CAPABILITY", "");
    if (!IsValidPipeSuffix(suffix) || capability.size() < 32 || capability.size() > 256) {
        std::cerr << "Native core host requires a valid pipe name and capability.\n";
        return 2;
    }

    SECURITY_ATTRIBUTES security{};
    std::unique_ptr<void, LocalMemoryDeleter> descriptor;
    if (!BuildPipeSecurity(security, descriptor)) {
        std::cerr << "Could not establish the named-pipe security descriptor.\n";
        return 3;
    }
    const std::wstring pipeName = L"\\\\.\\pipe\\" + WidenAscii(suffix);
    bool shouldExit = false;
    while (!shouldExit) {
        HANDLE pipe = CreateNamedPipeW(pipeName.c_str(), PIPE_ACCESS_DUPLEX,
            PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
            1, static_cast<DWORD>(ily::core_host::kMaxRequestBytes),
            static_cast<DWORD>(ily::core_host::kMaxRequestBytes), 0, &security);
        if (pipe == INVALID_HANDLE_VALUE) { Cleanup(); return 4; }
        const bool connected = ConnectNamedPipe(pipe, nullptr) || GetLastError() == ERROR_PIPE_CONNECTED;
        if (!connected) { CloseHandle(pipe); continue; }

        ily::core_host::ProtocolSession session(capability, BuildOperations());
        std::string pending;
        std::vector<char> buffer(4096);
        while (!session.ShouldExit()) {
            DWORD read = 0;
            if (!ReadFile(pipe, buffer.data(), static_cast<DWORD>(buffer.size()), &read, nullptr) || read == 0) break;
            pending.append(buffer.data(), read);
            if (pending.size() > ily::core_host::kMaxRequestBytes) {
                WriteLine(pipe, R"({"id":null,"ok":false,"error":"Request too large"})");
                break;
            }
            std::size_t newline = 0;
            while ((newline = pending.find('\n')) != std::string::npos) {
                std::string line = pending.substr(0, newline);
                pending.erase(0, newline + 1);
                if (!line.empty() && line.back() == '\r') line.pop_back();
                if (!WriteLine(pipe, session.HandleLine(line))) break;
                if (session.ShouldExit()) break;
            }
        }
        shouldExit = session.ShouldExit();
        FlushFileBuffers(pipe);
        DisconnectNamedPipe(pipe);
        CloseHandle(pipe);
    }
    Cleanup();
    return 0;
}
