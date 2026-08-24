/**
 * Native audio capture for ilyStream.
 *
 * Captures a device on a real-time audio thread and hands PCM to main over a
 * lock-free queue, so broadcast audio does not have to travel through a
 * renderer WebAudio graph to reach the encoder.
 *
 * Shared mode is the default deliberately. Exclusive mode has lower latency but
 * takes the device away from every other application — for a streamer that
 * means Discord and the browser go silent — and it fails outright on plenty of
 * consumer hardware. Callers may opt in, and it falls back rather than failing.
 */
#define MINIAUDIO_IMPLEMENTATION
#include "third_party/miniaudio.h"

#include <napi.h>

#include <atomic>
#include <algorithm>
#include <cstring>
#include <limits>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include "SpscQueue.h"
#include "../program-transport/program-audio-ring.hpp"

#ifdef _WIN32
#include <windows.h>
#endif

namespace {

// Roughly a second of stereo 48k. The producer is real-time and the consumer is
// a normal thread, so this only has to absorb scheduler jitter, not backlog.
constexpr size_t kQueueSamples = 96000;
// Delivered chunk size. 1024 frames matches the AAC frame size the encoder
// wants, so main can forward without re-chunking.
constexpr size_t kChunkFrames = 1024;

struct CaptureSession {
    ma_context context{};
    ma_device device{};
    bool contextReady = false;
    bool deviceReady = false;

    std::unique_ptr<SpscQueue<float>> queue;
    std::atomic<bool> running{false};
    std::atomic<uint64_t> framesCaptured{0};
    // Frames the real-time callback had to drop because the consumer fell
    // behind. Surfaced to JS: silent overrun would read as clean audio.
    std::atomic<uint64_t> framesDropped{0};

    uint32_t channels = 2;
    uint32_t sampleRate = 48000;
    bool exclusive = false;

    std::thread pump;
    Napi::ThreadSafeFunction tsfn;
};

std::mutex g_sessionMutex;
std::unique_ptr<CaptureSession> g_session;

#ifdef _WIN32
struct ProgramAudioTransport {
    HANDLE mapping = nullptr;
    void* view = nullptr;
    ilystream::program_transport::ProgramAudioRingHeader* header = nullptr;
    float* samples = nullptr;
    std::wstring ringName;
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

bool IsValidProgramAudioRingName(const std::string& value) {
    constexpr const char* prefix = "Local\\ilyStream.Program.Audio.";
    constexpr size_t prefixLength = 30;
    if (value.size() <= prefixLength || value.size() > prefixLength + 64 ||
        value.compare(0, prefixLength, prefix) != 0) {
        return false;
    }
    for (size_t index = prefixLength; index < value.size(); ++index) {
        const unsigned char ch = static_cast<unsigned char>(value[index]);
        const bool allowed = (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') ||
                             (ch >= '0' && ch <= '9') || ch == '.' || ch == '_' || ch == '-';
        if (!allowed) return false;
    }
    return true;
}

std::wstring Utf8ToWide(const std::string& value) {
    if (value.empty()) return {};
    const int length = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(),
                                           static_cast<int>(value.size()), nullptr, 0);
    if (length <= 0) return {};
    std::wstring wide(static_cast<size_t>(length), L'\0');
    if (MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(),
                            static_cast<int>(value.size()), wide.data(), length) != length) {
        return {};
    }
    return wide;
}

bool ReadUint64(const Napi::Value& value, std::uint64_t& out) {
    if (!value.IsBigInt()) return false;
    bool lossless = false;
    out = value.As<Napi::BigInt>().Uint64Value(&lossless);
    return lossless;
}

Napi::Value StartProgramAudioTransport(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "Expected a Program audio transport options object")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Object options = info[0].As<Napi::Object>();
    if (!options.Has("ringName") || !options.Get("ringName").IsString() ||
        !options.Has("generation") || !options.Has("sampleRate") ||
        !options.Has("channels") || !options.Has("capacityFrames") ||
        !options.Has("blockFrames")) {
        Napi::TypeError::New(env, "Incomplete Program audio transport options")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    const std::string ringName = options.Get("ringName").As<Napi::String>().Utf8Value();
    std::uint64_t generation = 0;
    const std::uint32_t sampleRate = options.Get("sampleRate").As<Napi::Number>().Uint32Value();
    const std::uint32_t channels = options.Get("channels").As<Napi::Number>().Uint32Value();
    const std::uint32_t capacityFrames = options.Get("capacityFrames").As<Napi::Number>().Uint32Value();
    const std::uint32_t blockFrames = options.Get("blockFrames").As<Napi::Number>().Uint32Value();

    if (!IsValidProgramAudioRingName(ringName) ||
        !ReadUint64(options.Get("generation"), generation) || generation == 0 ||
        sampleRate != 48000 || channels != 2 || blockFrames == 0 || blockFrames > 4096 ||
        capacityFrames < blockFrames || capacityFrames > 480000 ||
        capacityFrames % blockFrames != 0) {
        Napi::TypeError::New(env, "Invalid Program audio transport options")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    const std::uint64_t sampleBytes = static_cast<std::uint64_t>(capacityFrames) * channels * sizeof(float);
    const std::uint64_t mappingBytes = ilystream::program_transport::kProgramAudioRingHeaderBytes + sampleBytes;
    if (mappingBytes > std::numeric_limits<std::uint32_t>::max()) {
        Napi::RangeError::New(env, "Program audio ring is too large").ThrowAsJavaScriptException();
        return env.Null();
    }

    const std::wstring wideName = Utf8ToWide(ringName);
    if (wideName.empty()) {
        Napi::TypeError::New(env, "Program audio ring name is not valid UTF-8")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    std::lock_guard<std::mutex> lock(g_programAudioMutex);
    StopProgramAudioTransportLocked();

    HANDLE mapping = CreateFileMappingW(INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE,
                                        static_cast<DWORD>(mappingBytes >> 32U),
                                        static_cast<DWORD>(mappingBytes & 0xffffffffU), wideName.c_str());
    if (!mapping) {
        Napi::Error::New(env, "Could not create the Program audio ring")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    if (GetLastError() == ERROR_ALREADY_EXISTS) {
        CloseHandle(mapping);
        Napi::Error::New(env, "Program audio ring name is already in use")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    void* view = MapViewOfFile(mapping, FILE_MAP_ALL_ACCESS, 0, 0, static_cast<SIZE_T>(mappingBytes));
    if (!view) {
        CloseHandle(mapping);
        Napi::Error::New(env, "Could not map the Program audio ring")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    std::memset(view, 0, static_cast<size_t>(mappingBytes));
    auto transport = std::make_unique<ProgramAudioTransport>();
    transport->mapping = mapping;
    transport->view = view;
    transport->header = static_cast<ilystream::program_transport::ProgramAudioRingHeader*>(view);
    transport->samples = reinterpret_cast<float*>(
        static_cast<std::uint8_t*>(view) + ilystream::program_transport::kProgramAudioRingHeaderBytes);
    transport->ringName = wideName;

    transport->header->magic = ilystream::program_transport::kProgramAudioRingMagic;
    transport->header->version = ilystream::program_transport::kProgramAudioRingVersion;
    transport->header->headerBytes = static_cast<std::uint16_t>(
        ilystream::program_transport::kProgramAudioRingHeaderBytes);
    transport->header->mappingBytes = static_cast<std::uint32_t>(mappingBytes);
    transport->header->sampleRate = sampleRate;
    transport->header->channels = static_cast<std::uint16_t>(channels);
    transport->header->format = ilystream::program_transport::kProgramAudioFormatF32Interleaved;
    transport->header->capacityFrames = capacityFrames;
    transport->header->blockFrames = blockFrames;
    transport->header->generation = generation;
    g_programAudio = std::move(transport);

    Napi::Object result = Napi::Object::New(env);
    result.Set("ringName", Napi::String::New(env, ringName));
    result.Set("generation", Napi::BigInt::New(env, generation));
    result.Set("sampleRate", Napi::Number::New(env, sampleRate));
    result.Set("channels", Napi::Number::New(env, channels));
    result.Set("capacityFrames", Napi::Number::New(env, capacityFrames));
    result.Set("blockFrames", Napi::Number::New(env, blockFrames));
    return result;
}

Napi::Value PushProgramAudio(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsBuffer()) {
        Napi::TypeError::New(env, "Expected (Buffer, timestampNs)").ThrowAsJavaScriptException();
        return Napi::Boolean::New(env, false);
    }

    std::uint64_t timestampNs = 0;
    if (!ReadUint64(info[1], timestampNs) || timestampNs == 0) {
        Napi::TypeError::New(env, "Program audio timestamp must be a positive bigint")
            .ThrowAsJavaScriptException();
        return Napi::Boolean::New(env, false);
    }

    const auto pcm = info[0].As<Napi::Buffer<std::uint8_t>>();
    std::lock_guard<std::mutex> lock(g_programAudioMutex);
    if (!g_programAudio || !g_programAudio->header ||
        g_programAudio->header->magic != ilystream::program_transport::kProgramAudioRingMagic) {
        return Napi::Boolean::New(env, false);
    }

    auto* header = g_programAudio->header;
    const size_t bytesPerFrame = static_cast<size_t>(header->channels) * sizeof(float);
    if (pcm.Length() == 0 || pcm.Length() % bytesPerFrame != 0) {
        return Napi::Boolean::New(env, false);
    }

    size_t frameCount = pcm.Length() / bytesPerFrame;
    if (frameCount > header->blockFrames) return Napi::Boolean::New(env, false);

    const float* input = reinterpret_cast<const float*>(pcm.Data());
    std::uint64_t writeFrame = header->writeFrame;
    if (frameCount > header->capacityFrames) {
        const size_t skipped = frameCount - header->capacityFrames;
        input += skipped * header->channels;
        frameCount = header->capacityFrames;
        header->framesDropped += skipped;
    }

    auto* sequence = reinterpret_cast<volatile LONG64*>(&header->publishSequence);
    InterlockedIncrement64(sequence);

    const size_t firstFrame = static_cast<size_t>(writeFrame % header->capacityFrames);
    const size_t firstCount = std::min(frameCount, static_cast<size_t>(header->capacityFrames) - firstFrame);
    std::memcpy(g_programAudio->samples + firstFrame * header->channels, input,
                firstCount * bytesPerFrame);
    if (firstCount < frameCount) {
        std::memcpy(g_programAudio->samples, input + firstCount * header->channels,
                    (frameCount - firstCount) * bytesPerFrame);
    }

    header->anchorFrame = writeFrame;
    header->anchorTimestampNs = timestampNs;
    writeFrame += frameCount;
    header->writeFrame = writeFrame;
    header->oldestFrame = writeFrame > header->capacityFrames
        ? writeFrame - header->capacityFrames
        : 0;
    MemoryBarrier();
    InterlockedIncrement64(sequence);
    return Napi::Boolean::New(env, true);
}

Napi::Value StopProgramAudioTransport(const Napi::CallbackInfo& info) {
    std::lock_guard<std::mutex> lock(g_programAudioMutex);
    StopProgramAudioTransportLocked();
    return info.Env().Undefined();
}
#endif

void DataCallback(ma_device* device, void* /*output*/, const void* input, ma_uint32 frameCount) {
    auto* session = static_cast<CaptureSession*>(device->pUserData);
    if (!session || !input || frameCount == 0) return;

    const size_t sampleCount = static_cast<size_t>(frameCount) * device->capture.channels;
    if (!session->queue->push(static_cast<const float*>(input), sampleCount)) {
        session->framesDropped.fetch_add(frameCount, std::memory_order_relaxed);
        return;
    }
    session->framesCaptured.fetch_add(frameCount, std::memory_order_relaxed);
}

/** Moves PCM off the audio thread and into JS. Never touches V8 directly. */
void PumpThread(CaptureSession* session) {
    const size_t chunkSamples = kChunkFrames * session->channels;
    std::vector<float> scratch(chunkSamples);

    while (session->running.load(std::memory_order_acquire)) {
        const size_t got = session->queue->pop(scratch.data(), chunkSamples);
        if (got == 0) {
            std::this_thread::sleep_for(std::chrono::milliseconds(2));
            continue;
        }

        std::vector<float> chunk(scratch.begin(), scratch.begin() + got);
        const uint64_t captured = session->framesCaptured.load(std::memory_order_relaxed);
        const uint64_t dropped = session->framesDropped.load(std::memory_order_relaxed);

        auto status = session->tsfn.BlockingCall(
            [chunk = std::move(chunk), captured, dropped](Napi::Env env, Napi::Function callback) {
                Napi::Float32Array pcm = Napi::Float32Array::New(env, chunk.size());
                std::memcpy(pcm.Data(), chunk.data(), chunk.size() * sizeof(float));

                Napi::Object payload = Napi::Object::New(env);
                payload.Set("pcm", pcm);
                payload.Set("framesCaptured", Napi::Number::New(env, static_cast<double>(captured)));
                payload.Set("framesDropped", Napi::Number::New(env, static_cast<double>(dropped)));
                callback.Call({payload});
            });

        if (status != napi_ok) break;
    }
}

void TeardownLocked() {
    if (!g_session) return;

    g_session->running.store(false, std::memory_order_release);
    if (g_session->pump.joinable()) g_session->pump.join();
    if (g_session->deviceReady) {
        ma_device_uninit(&g_session->device);
        g_session->deviceReady = false;
    }
    if (g_session->contextReady) {
        ma_context_uninit(&g_session->context);
        g_session->contextReady = false;
    }
    if (g_session->tsfn) g_session->tsfn.Release();
    g_session.reset();
}

std::string DeviceIdToString(const ma_device_id& id) {
#ifdef _WIN32
    // WASAPI ids are wide strings; narrow them for the JS boundary.
    std::wstring wide(id.wasapi);
    std::string out;
    out.reserve(wide.size());
    for (wchar_t ch : wide) out.push_back(static_cast<char>(ch & 0x7f));
    return out;
#else
    return std::string(reinterpret_cast<const char*>(&id), sizeof(id));
#endif
}

// listCaptureDevices() -> [{ id, name, isDefault }]
Napi::Value ListCaptureDevices(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    ma_context context;
    if (ma_context_init(nullptr, 0, nullptr, &context) != MA_SUCCESS) {
        Napi::Error::New(env, "Failed to initialize audio context").ThrowAsJavaScriptException();
        return env.Null();
    }

    ma_device_info* captureInfos = nullptr;
    ma_uint32 captureCount = 0;
    if (ma_context_get_devices(&context, nullptr, nullptr, &captureInfos, &captureCount) != MA_SUCCESS) {
        ma_context_uninit(&context);
        Napi::Error::New(env, "Failed to enumerate capture devices").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Array result = Napi::Array::New(env, captureCount);
    for (ma_uint32 i = 0; i < captureCount; ++i) {
        Napi::Object entry = Napi::Object::New(env);
        entry.Set("id", Napi::String::New(env, DeviceIdToString(captureInfos[i].id)));
        entry.Set("name", Napi::String::New(env, captureInfos[i].name));
        entry.Set("isDefault", Napi::Boolean::New(env, captureInfos[i].isDefault != 0));
        result.Set(i, entry);
    }

    ma_context_uninit(&context);
    return result;
}

// startCapture({ deviceId?, sampleRate?, channels?, exclusive? }, onPcm) -> Object
Napi::Value StartCapture(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsFunction()) {
        Napi::TypeError::New(env, "Expected (Object, Function)").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::lock_guard<std::mutex> lock(g_sessionMutex);
    if (g_session) {
        Napi::Error::New(env, "Capture already running").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Object options = info[0].As<Napi::Object>();
    auto session = std::make_unique<CaptureSession>();
    session->sampleRate = options.Has("sampleRate")
        ? options.Get("sampleRate").As<Napi::Number>().Uint32Value() : 48000;
    session->channels = options.Has("channels")
        ? options.Get("channels").As<Napi::Number>().Uint32Value() : 2;
    session->exclusive = options.Has("exclusive")
        && options.Get("exclusive").As<Napi::Boolean>().Value();

    if (session->channels == 0 || session->channels > 8 || session->sampleRate < 8000) {
        Napi::TypeError::New(env, "Unsupported channels/sampleRate").ThrowAsJavaScriptException();
        return env.Null();
    }

    session->queue = std::make_unique<SpscQueue<float>>(kQueueSamples);

    if (ma_context_init(nullptr, 0, nullptr, &session->context) != MA_SUCCESS) {
        Napi::Error::New(env, "Failed to initialize audio context").ThrowAsJavaScriptException();
        return env.Null();
    }
    session->contextReady = true;

    ma_device_config config = ma_device_config_init(ma_device_type_capture);
    config.capture.format = ma_format_f32;
    config.capture.channels = session->channels;
    config.sampleRate = session->sampleRate;
    config.dataCallback = DataCallback;
    config.pUserData = session.get();
#ifdef _WIN32
    // Pro Audio raises the capture thread to MMCSS, which is what keeps the
    // callback off the general scheduler during a busy render frame.
    config.wasapi.usage = ma_wasapi_usage_pro_audio;
#endif

    ma_device_id deviceId{};
    bool haveDeviceId = false;
    if (options.Has("deviceId") && options.Get("deviceId").IsString()) {
        const std::string wanted = options.Get("deviceId").As<Napi::String>().Utf8Value();
        if (!wanted.empty()) {
            ma_device_info* captureInfos = nullptr;
            ma_uint32 captureCount = 0;
            if (ma_context_get_devices(&session->context, nullptr, nullptr, &captureInfos, &captureCount) == MA_SUCCESS) {
                for (ma_uint32 i = 0; i < captureCount; ++i) {
                    if (DeviceIdToString(captureInfos[i].id) == wanted) {
                        deviceId = captureInfos[i].id;
                        haveDeviceId = true;
                        break;
                    }
                }
            }
            if (!haveDeviceId) {
                ma_context_uninit(&session->context);
                Napi::Error::New(env, "Capture device not found: " + wanted).ThrowAsJavaScriptException();
                return env.Null();
            }
        }
    }
    if (haveDeviceId) config.capture.pDeviceID = &deviceId;

    bool usedExclusive = false;
    ma_result result = MA_ERROR;
    if (session->exclusive) {
        config.capture.shareMode = ma_share_mode_exclusive;
        result = ma_device_init(&session->context, &config, &session->device);
        usedExclusive = (result == MA_SUCCESS);
    }
    if (result != MA_SUCCESS) {
        // Exclusive mode is unavailable on a great deal of hardware, and a
        // stream that silently fails to capture is worse than one that shares.
        config.capture.shareMode = ma_share_mode_shared;
        result = ma_device_init(&session->context, &config, &session->device);
        usedExclusive = false;
    }
    if (result != MA_SUCCESS) {
        ma_context_uninit(&session->context);
        Napi::Error::New(env, "Failed to open capture device").ThrowAsJavaScriptException();
        return env.Null();
    }
    session->deviceReady = true;

    // The device may not have honoured the requested format.
    session->channels = session->device.capture.channels;
    session->sampleRate = session->device.sampleRate;

    session->tsfn = Napi::ThreadSafeFunction::New(
        env, info[1].As<Napi::Function>(), "ilyAudioCapture", 0, 1);
    session->running.store(true, std::memory_order_release);

    if (ma_device_start(&session->device) != MA_SUCCESS) {
        session->running.store(false, std::memory_order_release);
        session->tsfn.Release();
        ma_device_uninit(&session->device);
        ma_context_uninit(&session->context);
        Napi::Error::New(env, "Failed to start capture device").ThrowAsJavaScriptException();
        return env.Null();
    }

    CaptureSession* raw = session.get();
    session->pump = std::thread(PumpThread, raw);
    g_session = std::move(session);

    Napi::Object out = Napi::Object::New(env);
    out.Set("sampleRate", Napi::Number::New(env, raw->sampleRate));
    out.Set("channels", Napi::Number::New(env, raw->channels));
    out.Set("exclusive", Napi::Boolean::New(env, usedExclusive));
    out.Set("chunkFrames", Napi::Number::New(env, static_cast<double>(kChunkFrames)));
    return out;
}

// stopCapture() -> { framesCaptured, framesDropped }
Napi::Value StopCapture(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::lock_guard<std::mutex> lock(g_sessionMutex);

    Napi::Object out = Napi::Object::New(env);
    if (!g_session) {
        out.Set("framesCaptured", Napi::Number::New(env, 0));
        out.Set("framesDropped", Napi::Number::New(env, 0));
        return out;
    }

    out.Set("framesCaptured",
            Napi::Number::New(env, static_cast<double>(g_session->framesCaptured.load())));
    out.Set("framesDropped",
            Napi::Number::New(env, static_cast<double>(g_session->framesDropped.load())));
    TeardownLocked();
    return out;
}

// getStatus() -> { running, framesCaptured, framesDropped, sampleRate, channels }
Napi::Value GetStatus(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::lock_guard<std::mutex> lock(g_sessionMutex);

    Napi::Object out = Napi::Object::New(env);
    out.Set("running", Napi::Boolean::New(env, g_session != nullptr));
    out.Set("framesCaptured",
            Napi::Number::New(env, g_session ? static_cast<double>(g_session->framesCaptured.load()) : 0));
    out.Set("framesDropped",
            Napi::Number::New(env, g_session ? static_cast<double>(g_session->framesDropped.load()) : 0));
    out.Set("sampleRate", Napi::Number::New(env, g_session ? g_session->sampleRate : 0));
    out.Set("channels", Napi::Number::New(env, g_session ? g_session->channels : 0));
    return out;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("listCaptureDevices", Napi::Function::New(env, ListCaptureDevices));
    exports.Set("startCapture", Napi::Function::New(env, StartCapture));
    exports.Set("stopCapture", Napi::Function::New(env, StopCapture));
    exports.Set("getStatus", Napi::Function::New(env, GetStatus));
#ifdef _WIN32
    exports.Set("startProgramAudioTransport", Napi::Function::New(env, StartProgramAudioTransport));
    exports.Set("pushProgramAudio", Napi::Function::New(env, PushProgramAudio));
    exports.Set("stopProgramAudioTransport", Napi::Function::New(env, StopProgramAudioTransport));
#endif
    return exports;
}

} // namespace

NODE_API_MODULE(ilystream_audio, Init)
