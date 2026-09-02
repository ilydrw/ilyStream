#define MINIAUDIO_IMPLEMENTATION
#include "audio_capture_core.h"
#include "third_party/miniaudio.h"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstring>
#include <limits>
#include <memory>
#include <mutex>
#include <thread>
#include <utility>

#include "SpscQueue.h"
#include "../program-transport/program-audio-ring.hpp"

#ifdef _WIN32
#include <windows.h>
#endif

namespace ily::audio {
namespace {

constexpr std::size_t kQueueSamples = 96000;
constexpr std::uint32_t kChunkFrames = 1024;

struct CaptureSession {
    ma_context context{};
    ma_device device{};
    bool contextReady = false;
    bool deviceReady = false;
    std::unique_ptr<SpscQueue<float>> queue;
    std::atomic<bool> running{false};
    std::atomic<std::uint64_t> framesCaptured{0};
    std::atomic<std::uint64_t> framesDropped{0};
    std::uint32_t channels = 2;
    std::uint32_t sampleRate = 48000;
    CaptureFrameCallback callback;
    std::thread pump;
};

std::mutex g_sessionMutex;
std::unique_ptr<CaptureSession> g_session;

std::string DeviceIdToString(const ma_device_id& id) {
#ifdef _WIN32
    std::wstring wide(id.wasapi);
    if (wide.empty()) return {};
    const int length = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, wide.data(),
        static_cast<int>(wide.size()), nullptr, 0, nullptr, nullptr);
    if (length <= 0) return {};
    std::string result(static_cast<std::size_t>(length), '\0');
    return WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, wide.data(),
        static_cast<int>(wide.size()), result.data(), length, nullptr, nullptr) == length
        ? result : std::string{};
#elif defined(__APPLE__)
    // CoreAudio IDs are stable string identifiers. Do not stringify the whole
    // union: its unused bytes contain embedded NULs and cannot round-trip from
    // the renderer or an environment variable.
    return std::string(id.coreaudio);
#elif defined(__linux__)
    // Depending on the selected miniaudio backend, Linux exposes either a
    // PulseAudio or ALSA name in the union. Prefix it to avoid collisions when
    // both APIs enumerate the same machine. JACK uses the default device only.
    if (id.pulse[0] != '\0') return std::string("pulse:") + id.pulse;
    if (id.alsa[0] != '\0') return std::string("alsa:") + id.alsa;
    return id.jack != 0 ? std::string("jack:") + std::to_string(id.jack) : std::string("default");
#endif
}

CaptureStatus StatusOf(const CaptureSession* session) {
    if (!session) return {};
    return {session->running.load(std::memory_order_acquire),
        session->framesCaptured.load(std::memory_order_relaxed),
        session->framesDropped.load(std::memory_order_relaxed),
        session->sampleRate, session->channels};
}

void DataCallback(ma_device* device, void*, const void* input, ma_uint32 frameCount) {
    auto* session = static_cast<CaptureSession*>(device->pUserData);
    if (!session || !input || frameCount == 0) return;
    const std::size_t count = static_cast<std::size_t>(frameCount) * device->capture.channels;
    if (!session->queue->push(static_cast<const float*>(input), count)) {
        session->framesDropped.fetch_add(frameCount, std::memory_order_relaxed);
        return;
    }
    session->framesCaptured.fetch_add(frameCount, std::memory_order_relaxed);
}

void PumpThread(CaptureSession* session) {
    const std::size_t chunkSamples = static_cast<std::size_t>(kChunkFrames) * session->channels;
    std::vector<float> scratch(chunkSamples);
    while (session->running.load(std::memory_order_acquire)) {
        const std::size_t count = session->queue->pop(scratch.data(), chunkSamples);
        if (count == 0) {
            std::this_thread::sleep_for(std::chrono::milliseconds(2));
            continue;
        }
        if (session->callback && !session->callback(scratch.data(), count, StatusOf(session))) {
            session->running.store(false, std::memory_order_release);
            break;
        }
    }
}

CaptureStatus TeardownLocked() {
    if (!g_session) return {};
    CaptureStatus status = StatusOf(g_session.get());
    status.running = false;
    g_session->running.store(false, std::memory_order_release);
    if (g_session->pump.joinable()) g_session->pump.join();
    if (g_session->deviceReady) ma_device_uninit(&g_session->device);
    if (g_session->contextReady) ma_context_uninit(&g_session->context);
    g_session.reset();
    return status;
}

#ifdef _WIN32
struct ProgramAudioTransport {
    HANDLE mapping = nullptr;
    void* view = nullptr;
    ilystream::program_transport::ProgramAudioRingHeader* header = nullptr;
    float* samples = nullptr;
};
std::mutex g_programAudioMutex;
std::unique_ptr<ProgramAudioTransport> g_programAudio;

void StopProgramAudioTransportLocked() {
    if (!g_programAudio) return;
    if (g_programAudio->header) {
        auto* sequence = reinterpret_cast<volatile LONG64*>(&g_programAudio->header->publishSequence);
        InterlockedIncrement64(sequence);
        g_programAudio->header->magic = 0;
        MemoryBarrier();
        InterlockedIncrement64(sequence);
    }
    if (g_programAudio->view) UnmapViewOfFile(g_programAudio->view);
    if (g_programAudio->mapping) CloseHandle(g_programAudio->mapping);
    g_programAudio.reset();
}

bool IsValidRingName(const std::string& value) {
    constexpr const char* prefix = "Local\\ilyStream.Program.Audio.";
    constexpr std::size_t prefixLength = 30;
    if (value.size() <= prefixLength || value.size() > prefixLength + 64 ||
        value.compare(0, prefixLength, prefix) != 0) return false;
    for (std::size_t i = prefixLength; i < value.size(); ++i) {
        const unsigned char ch = static_cast<unsigned char>(value[i]);
        if (!((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') ||
              (ch >= '0' && ch <= '9') || ch == '.' || ch == '_' || ch == '-')) return false;
    }
    return true;
}

std::wstring Utf8ToWide(const std::string& value) {
    if (value.empty()) return {};
    const int length = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(),
        static_cast<int>(value.size()), nullptr, 0);
    if (length <= 0) return {};
    std::wstring result(static_cast<std::size_t>(length), L'\0');
    return MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(),
        static_cast<int>(value.size()), result.data(), length) == length ? result : std::wstring{};
}
#endif

} // namespace

bool ListCaptureDevices(std::vector<CaptureDevice>& devices, std::string& error) {
    devices.clear();
    ma_context context{};
    if (ma_context_init(nullptr, 0, nullptr, &context) != MA_SUCCESS) {
        error = "Failed to initialize audio context";
        return false;
    }
    ma_device_info* infos = nullptr;
    ma_uint32 count = 0;
    if (ma_context_get_devices(&context, nullptr, nullptr, &infos, &count) != MA_SUCCESS) {
        ma_context_uninit(&context);
        error = "Failed to enumerate capture devices";
        return false;
    }
    devices.reserve(count);
    for (ma_uint32 i = 0; i < count; ++i) {
        devices.push_back({DeviceIdToString(infos[i].id), infos[i].name, infos[i].isDefault != 0});
    }
    ma_context_uninit(&context);
    error.clear();
    return true;
}

bool StartCapture(const CaptureOptions& options, CaptureFrameCallback callback,
                  CaptureSessionInfo& info, std::string& error) {
    std::lock_guard<std::mutex> lock(g_sessionMutex);
    if (g_session) { error = "Capture already running"; return false; }
    if (options.channels == 0 || options.channels > 8 || options.sampleRate < 8000) {
        error = "Unsupported channels/sampleRate";
        return false;
    }
    auto session = std::make_unique<CaptureSession>();
    session->sampleRate = options.sampleRate;
    session->channels = options.channels;
    session->callback = std::move(callback);
    session->queue = std::make_unique<SpscQueue<float>>(kQueueSamples);
    if (ma_context_init(nullptr, 0, nullptr, &session->context) != MA_SUCCESS) {
        error = "Failed to initialize audio context";
        return false;
    }
    session->contextReady = true;
    ma_device_config config = ma_device_config_init(ma_device_type_capture);
    config.capture.format = ma_format_f32;
    config.capture.channels = session->channels;
    config.sampleRate = session->sampleRate;
    config.dataCallback = DataCallback;
    config.pUserData = session.get();
#ifdef _WIN32
    config.wasapi.usage = ma_wasapi_usage_pro_audio;
#endif
    ma_device_id deviceId{};
    bool haveDeviceId = false;
    if (!options.deviceId.empty()) {
        ma_device_info* infos = nullptr;
        ma_uint32 count = 0;
        if (ma_context_get_devices(&session->context, nullptr, nullptr, &infos, &count) == MA_SUCCESS) {
            for (ma_uint32 i = 0; i < count; ++i) {
                const std::string enumeratedId = DeviceIdToString(infos[i].id);
                if (enumeratedId == options.deviceId ||
                    // Accept the unprefixed name used by older builds so
                    // existing saved device selections keep working.
                    (enumeratedId.rfind("pulse:", 0) == 0 &&
                     options.deviceId == enumeratedId.substr(6)) ||
                    (enumeratedId.rfind("alsa:", 0) == 0 &&
                     options.deviceId == enumeratedId.substr(5))) {
                    deviceId = infos[i].id;
                    haveDeviceId = true;
                    break;
                }
            }
        }
        if (!haveDeviceId) {
            ma_context_uninit(&session->context);
            error = "Capture device not found: " + options.deviceId;
            return false;
        }
    }
    if (haveDeviceId) config.capture.pDeviceID = &deviceId;
    bool usedExclusive = false;
    ma_result result = MA_ERROR;
    if (options.exclusive) {
        config.capture.shareMode = ma_share_mode_exclusive;
        result = ma_device_init(&session->context, &config, &session->device);
        usedExclusive = result == MA_SUCCESS;
    }
    if (result != MA_SUCCESS) {
        config.capture.shareMode = ma_share_mode_shared;
        result = ma_device_init(&session->context, &config, &session->device);
    }
    if (result != MA_SUCCESS) {
        ma_context_uninit(&session->context);
        error = "Failed to open capture device";
        return false;
    }
    session->deviceReady = true;
    session->channels = session->device.capture.channels;
    session->sampleRate = session->device.sampleRate;
    session->running.store(true, std::memory_order_release);
    if (ma_device_start(&session->device) != MA_SUCCESS) {
        session->running.store(false, std::memory_order_release);
        ma_device_uninit(&session->device);
        ma_context_uninit(&session->context);
        error = "Failed to start capture device";
        return false;
    }
    CaptureSession* raw = session.get();
    session->pump = std::thread(PumpThread, raw);
    info = {raw->sampleRate, raw->channels, usedExclusive, kChunkFrames};
    g_session = std::move(session);
    error.clear();
    return true;
}

CaptureStatus StopCapture() {
    std::lock_guard<std::mutex> lock(g_sessionMutex);
    return TeardownLocked();
}

CaptureStatus GetCaptureStatus() {
    std::lock_guard<std::mutex> lock(g_sessionMutex);
    return StatusOf(g_session.get());
}

bool StartProgramAudioTransport(const ProgramAudioTransportOptions& options, std::string& error) {
#ifdef _WIN32
    if (!IsValidRingName(options.ringName) || options.generation == 0 ||
        options.sampleRate != 48000 || options.channels != 2 || options.blockFrames == 0 ||
        options.blockFrames > 4096 || options.capacityFrames < options.blockFrames ||
        options.capacityFrames > 480000 || options.capacityFrames % options.blockFrames != 0) {
        error = "Invalid Program audio transport options";
        return false;
    }
    const std::uint64_t sampleBytes = static_cast<std::uint64_t>(options.capacityFrames) *
        options.channels * sizeof(float);
    const std::uint64_t mappingBytes =
        ilystream::program_transport::kProgramAudioRingHeaderBytes + sampleBytes;
    if (mappingBytes > std::numeric_limits<std::uint32_t>::max()) {
        error = "Program audio ring is too large";
        return false;
    }
    const std::wstring wideName = Utf8ToWide(options.ringName);
    if (wideName.empty()) { error = "Program audio ring name is not valid UTF-8"; return false; }
    std::lock_guard<std::mutex> lock(g_programAudioMutex);
    StopProgramAudioTransportLocked();
    HANDLE mapping = CreateFileMappingW(INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE,
        static_cast<DWORD>(mappingBytes >> 32U), static_cast<DWORD>(mappingBytes), wideName.c_str());
    if (!mapping) { error = "Could not create the Program audio ring"; return false; }
    if (GetLastError() == ERROR_ALREADY_EXISTS) {
        CloseHandle(mapping);
        error = "Program audio ring name is already in use";
        return false;
    }
    void* view = MapViewOfFile(mapping, FILE_MAP_ALL_ACCESS, 0, 0, static_cast<SIZE_T>(mappingBytes));
    if (!view) {
        CloseHandle(mapping);
        error = "Could not map the Program audio ring";
        return false;
    }
    std::memset(view, 0, static_cast<std::size_t>(mappingBytes));
    auto transport = std::make_unique<ProgramAudioTransport>();
    transport->mapping = mapping;
    transport->view = view;
    transport->header = static_cast<ilystream::program_transport::ProgramAudioRingHeader*>(view);
    transport->samples = reinterpret_cast<float*>(static_cast<std::uint8_t*>(view) +
        ilystream::program_transport::kProgramAudioRingHeaderBytes);
    auto* header = transport->header;
    header->magic = ilystream::program_transport::kProgramAudioRingMagic;
    header->version = ilystream::program_transport::kProgramAudioRingVersion;
    header->headerBytes = static_cast<std::uint16_t>(ilystream::program_transport::kProgramAudioRingHeaderBytes);
    header->mappingBytes = static_cast<std::uint32_t>(mappingBytes);
    header->sampleRate = options.sampleRate;
    header->channels = static_cast<std::uint16_t>(options.channels);
    header->format = ilystream::program_transport::kProgramAudioFormatF32Interleaved;
    header->capacityFrames = options.capacityFrames;
    header->blockFrames = options.blockFrames;
    header->generation = options.generation;
    g_programAudio = std::move(transport);
    error.clear();
    return true;
#else
    (void)options;
    error = "Program audio transport is only available on Windows";
    return false;
#endif
}

bool PushProgramAudio(const void* bytes, std::size_t byteLength, std::uint64_t timestampNs) {
#ifdef _WIN32
    if (!bytes || byteLength == 0 || timestampNs == 0) return false;
    std::lock_guard<std::mutex> lock(g_programAudioMutex);
    if (!g_programAudio || !g_programAudio->header ||
        g_programAudio->header->magic != ilystream::program_transport::kProgramAudioRingMagic) return false;
    auto* header = g_programAudio->header;
    const std::size_t bytesPerFrame = static_cast<std::size_t>(header->channels) * sizeof(float);
    if (byteLength % bytesPerFrame != 0) return false;
    const std::size_t frameCount = byteLength / bytesPerFrame;
    if (frameCount > header->blockFrames) return false;
    const auto* input = static_cast<const float*>(bytes);
    const std::uint64_t writeFrame = header->writeFrame;
    const std::size_t firstFrame = static_cast<std::size_t>(writeFrame % header->capacityFrames);
    const std::size_t firstCount = std::min(frameCount,
        static_cast<std::size_t>(header->capacityFrames) - firstFrame);
    auto* sequence = reinterpret_cast<volatile LONG64*>(&header->publishSequence);
    InterlockedIncrement64(sequence);
    std::memcpy(g_programAudio->samples + firstFrame * header->channels, input,
        firstCount * bytesPerFrame);
    if (firstCount < frameCount) {
        std::memcpy(g_programAudio->samples, input + firstCount * header->channels,
            (frameCount - firstCount) * bytesPerFrame);
    }
    header->anchorFrame = writeFrame;
    header->anchorTimestampNs = timestampNs;
    header->writeFrame = writeFrame + frameCount;
    header->oldestFrame = header->writeFrame > header->capacityFrames
        ? header->writeFrame - header->capacityFrames : 0;
    MemoryBarrier();
    InterlockedIncrement64(sequence);
    return true;
#else
    (void)bytes; (void)byteLength; (void)timestampNs;
    return false;
#endif
}

void StopProgramAudioTransport() {
#ifdef _WIN32
    std::lock_guard<std::mutex> lock(g_programAudioMutex);
    StopProgramAudioTransportLocked();
#endif
}

} // namespace ily::audio
