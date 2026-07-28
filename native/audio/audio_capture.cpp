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
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include "SpscQueue.h"

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
    return exports;
}

} // namespace

NODE_API_MODULE(ilystream_audio, Init)
