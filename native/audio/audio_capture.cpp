#include "audio_capture_core.h"
#include "shared_audio_ring.h"
#include <napi.h>

#include <atomic>
#include <chrono>
#include <cstring>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <utility>
#include <vector>

namespace {

std::mutex g_bridgeMutex;
std::shared_ptr<Napi::ThreadSafeFunction> g_captureBridge;

struct SharedReaderSession {
    std::unique_ptr<ily::audio::SharedAudioRingReader> reader;
    std::shared_ptr<Napi::ThreadSafeFunction> bridge;
    std::atomic<bool> running{true};
    std::atomic<std::uint64_t> framesCaptured{0};
    std::atomic<std::uint64_t> framesDropped{0};
    std::uint32_t sampleRate = 0;
    std::uint32_t channels = 0;
    std::uint32_t blockFrames = 0;
    std::thread pump;
};

std::mutex g_sharedReaderMutex;
std::unique_ptr<SharedReaderSession> g_sharedReader;

struct SharedWriterSession {
    ily::audio::SharedAudioRingOptions options;
    std::unique_ptr<ily::audio::SharedAudioRingWriter> writer;
};

std::mutex g_sharedWriterMutex;
std::unordered_map<std::string, SharedWriterSession> g_sharedWriters;

Napi::Object StatusObject(Napi::Env env, const ily::audio::CaptureStatus& status) {
    Napi::Object result = Napi::Object::New(env);
    result.Set("running", status.running);
    result.Set("framesCaptured", static_cast<double>(status.framesCaptured));
    result.Set("framesDropped", static_cast<double>(status.framesDropped));
    result.Set("sampleRate", status.sampleRate);
    result.Set("channels", status.channels);
    result.Set("backend", status.backend);
    return result;
}

bool ReadUint64(const Napi::Value& value, std::uint64_t& output) {
    if (!value.IsBigInt()) return false;
    bool lossless = false;
    output = value.As<Napi::BigInt>().Uint64Value(&lossless);
    return lossless;
}

ily::audio::SharedAudioRingOptions ReadSharedRingOptions(const Napi::Object& input) {
    ily::audio::SharedAudioRingOptions options;
    if (input.Has("ringName") && input.Get("ringName").IsString()) {
        options.ringName = input.Get("ringName").As<Napi::String>().Utf8Value();
    }
    if (input.Has("generation")) ReadUint64(input.Get("generation"), options.generation);
    if (input.Has("sampleRate")) options.sampleRate = input.Get("sampleRate").As<Napi::Number>().Uint32Value();
    if (input.Has("channels")) options.channels = input.Get("channels").As<Napi::Number>().Uint32Value();
    if (input.Has("capacityFrames")) options.capacityFrames = input.Get("capacityFrames").As<Napi::Number>().Uint32Value();
    if (input.Has("blockFrames")) options.blockFrames = input.Get("blockFrames").As<Napi::Number>().Uint32Value();
    return options;
}

Napi::Object SharedReaderStatusObject(Napi::Env env, const SharedReaderSession* session) {
    Napi::Object result = Napi::Object::New(env);
    result.Set("running", session && session->running.load(std::memory_order_acquire));
    result.Set("framesCaptured", static_cast<double>(session
        ? session->framesCaptured.load(std::memory_order_relaxed) : 0));
    result.Set("framesDropped", static_cast<double>(session
        ? session->framesDropped.load(std::memory_order_relaxed) : 0));
    result.Set("sampleRate", session ? session->sampleRate : 0);
    result.Set("channels", session ? session->channels : 0);
    return result;
}

void PumpSharedReader(SharedReaderSession* session) {
    auto lastDataAt = std::chrono::steady_clock::now();
    while (session->running.load(std::memory_order_acquire)) {
        std::vector<float> samples;
        ily::audio::SharedAudioReadStatus status;
        const auto result = session->reader->Read(session->blockFrames, samples, status);
        if (result == ily::audio::SharedAudioReadResult::closed ||
            result == ily::audio::SharedAudioReadResult::error) {
            session->running.store(false, std::memory_order_release);
            break;
        }
        if (result == ily::audio::SharedAudioReadResult::noData) {
            if (std::chrono::steady_clock::now() - lastDataAt > std::chrono::seconds(2)) {
                session->running.store(false, std::memory_order_release);
                break;
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(2));
            continue;
        }
        lastDataAt = std::chrono::steady_clock::now();
        session->framesCaptured.store(status.writeFrame, std::memory_order_relaxed);
        session->framesDropped.store(status.producerFramesDropped + status.framesSkipped,
            std::memory_order_relaxed);
        const std::uint64_t framesCaptured = status.writeFrame;
        const std::uint64_t framesDropped = status.producerFramesDropped + status.framesSkipped;
        const napi_status callStatus = session->bridge->BlockingCall(
            [samples = std::move(samples), framesCaptured, framesDropped](
                Napi::Env callbackEnv, Napi::Function callback) {
                Napi::Float32Array pcm = Napi::Float32Array::New(callbackEnv, samples.size());
                std::memcpy(pcm.Data(), samples.data(), samples.size() * sizeof(float));
                Napi::Object payload = Napi::Object::New(callbackEnv);
                payload.Set("pcm", pcm);
                payload.Set("framesCaptured", static_cast<double>(framesCaptured));
                payload.Set("framesDropped", static_cast<double>(framesDropped));
                callback.Call({payload});
            });
        if (callStatus != napi_ok) {
            session->running.store(false, std::memory_order_release);
            break;
        }
    }
}

Napi::Value ListCaptureDevices(const Napi::CallbackInfo& info) {
    std::vector<ily::audio::CaptureDevice> devices;
    std::string error;
    if (!ily::audio::ListCaptureDevices(devices, error)) {
        Napi::Error::New(info.Env(), error).ThrowAsJavaScriptException();
        return info.Env().Null();
    }
    Napi::Array result = Napi::Array::New(info.Env(), devices.size());
    for (std::size_t index = 0; index < devices.size(); ++index) {
        Napi::Object item = Napi::Object::New(info.Env());
        item.Set("id", devices[index].id);
        item.Set("name", devices[index].name);
        item.Set("isDefault", devices[index].isDefault);
        item.Set("backend", devices[index].backend);
        result.Set(index, item);
    }
    return result;
}

Napi::Value StartCapture(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsFunction()) {
        Napi::TypeError::New(env, "Expected (Object, Function)").ThrowAsJavaScriptException();
        return env.Null();
    }
    Napi::Object input = info[0].As<Napi::Object>();
    ily::audio::CaptureOptions options;
    if (input.Has("deviceId") && input.Get("deviceId").IsString()) {
        options.deviceId = input.Get("deviceId").As<Napi::String>().Utf8Value();
    }
    if (input.Has("backend") && input.Get("backend").IsString()) {
        options.backend = input.Get("backend").As<Napi::String>().Utf8Value();
    }
    if (input.Has("sampleRate")) options.sampleRate = input.Get("sampleRate").As<Napi::Number>().Uint32Value();
    if (input.Has("channels")) options.channels = input.Get("channels").As<Napi::Number>().Uint32Value();
    if (input.Has("exclusive")) options.exclusive = input.Get("exclusive").ToBoolean().Value();

    auto bridge = std::make_shared<Napi::ThreadSafeFunction>(Napi::ThreadSafeFunction::New(
        env, info[1].As<Napi::Function>(), "ilyAudioCapture", 0, 1));
    ily::audio::CaptureSessionInfo sessionInfo;
    std::string error;
    const bool started = ily::audio::StartCapture(options,
        [bridge](const float* samples, std::size_t count, const ily::audio::CaptureStatus& status) {
            std::vector<float> frame(samples, samples + count);
            return bridge->BlockingCall(
                [frame = std::move(frame), status](Napi::Env callbackEnv, Napi::Function callback) {
                    Napi::Float32Array pcm = Napi::Float32Array::New(callbackEnv, frame.size());
                    std::memcpy(pcm.Data(), frame.data(), frame.size() * sizeof(float));
                    Napi::Object payload = Napi::Object::New(callbackEnv);
                    payload.Set("pcm", pcm);
                    payload.Set("framesCaptured", static_cast<double>(status.framesCaptured));
                    payload.Set("framesDropped", static_cast<double>(status.framesDropped));
                    callback.Call({payload});
                }) == napi_ok;
        }, sessionInfo, error);
    if (!started) {
        bridge->Release();
        Napi::Error::New(env, error).ThrowAsJavaScriptException();
        return env.Null();
    }
    {
        std::lock_guard<std::mutex> lock(g_bridgeMutex);
        g_captureBridge = bridge;
    }
    Napi::Object result = Napi::Object::New(env);
    result.Set("sampleRate", sessionInfo.sampleRate);
    result.Set("channels", sessionInfo.channels);
    result.Set("exclusive", sessionInfo.exclusive);
    result.Set("chunkFrames", sessionInfo.chunkFrames);
    result.Set("backend", sessionInfo.backend);
    return result;
}

Napi::Value StopCapture(const Napi::CallbackInfo& info) {
    std::shared_ptr<Napi::ThreadSafeFunction> bridge;
    {
        std::lock_guard<std::mutex> lock(g_bridgeMutex);
        bridge = std::move(g_captureBridge);
    }
    // A capture callback may be waiting in BlockingCall for this JS thread.
    // Abort first so native teardown can join its pump without deadlocking.
    if (bridge) bridge->Abort();
    const auto status = ily::audio::StopCapture();
    Napi::Object result = Napi::Object::New(info.Env());
    result.Set("framesCaptured", static_cast<double>(status.framesCaptured));
    result.Set("framesDropped", static_cast<double>(status.framesDropped));
    return result;
}

Napi::Value GetStatus(const Napi::CallbackInfo& info) {
    return StatusObject(info.Env(), ily::audio::GetCaptureStatus());
}

Napi::Value StartProgramAudioTransport(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "Expected a Program audio transport options object").ThrowAsJavaScriptException();
        return env.Null();
    }
    Napi::Object input = info[0].As<Napi::Object>();
    ily::audio::ProgramAudioTransportOptions options;
    if (input.Has("ringName") && input.Get("ringName").IsString()) {
        options.ringName = input.Get("ringName").As<Napi::String>().Utf8Value();
    }
    if (!input.Has("generation") || !ReadUint64(input.Get("generation"), options.generation)) {
        Napi::TypeError::New(env, "Program audio generation must be a bigint").ThrowAsJavaScriptException();
        return env.Null();
    }
    if (input.Has("sampleRate")) options.sampleRate = input.Get("sampleRate").As<Napi::Number>().Uint32Value();
    if (input.Has("channels")) options.channels = input.Get("channels").As<Napi::Number>().Uint32Value();
    if (input.Has("capacityFrames")) options.capacityFrames = input.Get("capacityFrames").As<Napi::Number>().Uint32Value();
    if (input.Has("blockFrames")) options.blockFrames = input.Get("blockFrames").As<Napi::Number>().Uint32Value();
    std::string error;
    if (!ily::audio::StartProgramAudioTransport(options, error)) {
        Napi::Error::New(env, error).ThrowAsJavaScriptException();
        return env.Null();
    }
    Napi::Object result = Napi::Object::New(env);
    result.Set("ringName", options.ringName);
    result.Set("generation", Napi::BigInt::New(env, options.generation));
    result.Set("sampleRate", options.sampleRate);
    result.Set("channels", options.channels);
    result.Set("capacityFrames", options.capacityFrames);
    result.Set("blockFrames", options.blockFrames);
    return result;
}

Napi::Value PushProgramAudio(const Napi::CallbackInfo& info) {
    if (info.Length() < 2 || !info[0].IsBuffer()) {
        Napi::TypeError::New(info.Env(), "Expected (Buffer, timestampNs)").ThrowAsJavaScriptException();
        return Napi::Boolean::New(info.Env(), false);
    }
    std::uint64_t timestampNs = 0;
    if (!ReadUint64(info[1], timestampNs)) {
        Napi::TypeError::New(info.Env(), "Program audio timestamp must be a bigint").ThrowAsJavaScriptException();
        return Napi::Boolean::New(info.Env(), false);
    }
    const auto pcm = info[0].As<Napi::Buffer<std::uint8_t>>();
    return Napi::Boolean::New(info.Env(),
        ily::audio::PushProgramAudio(pcm.Data(), pcm.Length(), timestampNs));
}

Napi::Value StopProgramAudioTransport(const Napi::CallbackInfo& info) {
    ily::audio::StopProgramAudioTransport();
    return info.Env().Undefined();
}

Napi::Value StartSharedCaptureReader(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsFunction()) {
        Napi::TypeError::New(env, "Expected shared capture options and a callback").ThrowAsJavaScriptException();
        return env.Null();
    }
    const auto options = ReadSharedRingOptions(info[0].As<Napi::Object>());
    if (!ily::audio::IsValidSharedAudioRingOptions(options)) {
        Napi::TypeError::New(env, "Shared capture options are invalid").ThrowAsJavaScriptException();
        return env.Null();
    }
    {
        std::lock_guard<std::mutex> lock(g_sharedReaderMutex);
        if (g_sharedReader) {
            Napi::Error::New(env, "A shared capture reader is already running").ThrowAsJavaScriptException();
            return env.Null();
        }
    }
    std::string error;
    auto reader = ily::audio::SharedAudioRingReader::Open(options, error);
    if (!reader) {
        Napi::Error::New(env, error).ThrowAsJavaScriptException();
        return env.Null();
    }
    auto session = std::make_unique<SharedReaderSession>();
    session->reader = std::move(reader);
    session->bridge = std::make_shared<Napi::ThreadSafeFunction>(Napi::ThreadSafeFunction::New(
        env, info[1].As<Napi::Function>(), "ilySharedAudioCapture", 0, 1));
    session->sampleRate = options.sampleRate;
    session->channels = options.channels;
    session->blockFrames = options.blockFrames;
    session->pump = std::thread(PumpSharedReader, session.get());
    {
        std::lock_guard<std::mutex> lock(g_sharedReaderMutex);
        g_sharedReader = std::move(session);
    }
    Napi::Object result = Napi::Object::New(env);
    result.Set("sampleRate", options.sampleRate);
    result.Set("channels", options.channels);
    result.Set("exclusive", info[0].As<Napi::Object>().Get("exclusive").ToBoolean().Value());
    result.Set("chunkFrames", options.blockFrames);
    return result;
}

Napi::Value StopSharedCaptureReader(const Napi::CallbackInfo& info) {
    std::unique_ptr<SharedReaderSession> session;
    {
        std::lock_guard<std::mutex> lock(g_sharedReaderMutex);
        session = std::move(g_sharedReader);
    }
    if (!session) return SharedReaderStatusObject(info.Env(), nullptr);
    session->running.store(false, std::memory_order_release);
    session->bridge->Abort();
    if (session->pump.joinable()) session->pump.join();
    return SharedReaderStatusObject(info.Env(), session.get());
}

Napi::Value GetSharedCaptureReaderStatus(const Napi::CallbackInfo& info) {
    std::lock_guard<std::mutex> lock(g_sharedReaderMutex);
    return SharedReaderStatusObject(info.Env(), g_sharedReader.get());
}

Napi::Value CreateSharedMixerSourceWriter(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "Expected shared mixer source options").ThrowAsJavaScriptException();
        return env.Null();
    }
    const auto options = ReadSharedRingOptions(info[0].As<Napi::Object>());
    constexpr const char* prefix = "Local\\ilyStream.Mixer.Source.";
    if (!ily::audio::IsValidSharedAudioRingOptions(options) || options.channels != 2 ||
        options.ringName.rfind(prefix, 0) != 0) {
        Napi::TypeError::New(env, "Shared mixer source options are invalid").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::lock_guard<std::mutex> lock(g_sharedWriterMutex);
    if (g_sharedWriters.size() >= 64 || g_sharedWriters.find(options.ringName) != g_sharedWriters.end()) {
        Napi::Error::New(env, "Shared mixer source writer limit or duplicate reached").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::string error;
    auto writer = ily::audio::SharedAudioRingWriter::Create(options, error);
    if (!writer) {
        Napi::Error::New(env, error).ThrowAsJavaScriptException();
        return env.Null();
    }
    g_sharedWriters.emplace(options.ringName, SharedWriterSession{options, std::move(writer)});
    return Napi::Boolean::New(env, true);
}

Napi::Value PushSharedMixerSource(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 3 || !info[0].IsString() || !info[1].IsBuffer()) {
        Napi::TypeError::New(env, "Expected (ringName, Buffer, timestampNs)").ThrowAsJavaScriptException();
        return Napi::Boolean::New(env, false);
    }
    std::uint64_t timestampNs = 0;
    if (!ReadUint64(info[2], timestampNs)) {
        Napi::TypeError::New(env, "Mixer source timestamp must be a bigint").ThrowAsJavaScriptException();
        return Napi::Boolean::New(env, false);
    }
    const std::string ringName = info[0].As<Napi::String>().Utf8Value();
    const auto pcm = info[1].As<Napi::Buffer<std::uint8_t>>();
    if (pcm.Length() == 0 || pcm.Length() % (2 * sizeof(float)) != 0) {
        return Napi::Boolean::New(env, false);
    }
    std::lock_guard<std::mutex> lock(g_sharedWriterMutex);
    const auto found = g_sharedWriters.find(ringName);
    if (found == g_sharedWriters.end()) return Napi::Boolean::New(env, false);
    return Napi::Boolean::New(env, found->second.writer->Publish(
        reinterpret_cast<const float*>(pcm.Data()), pcm.Length() / sizeof(float), timestampNs));
}

Napi::Value CloseSharedMixerSourceWriter(const Napi::CallbackInfo& info) {
    if (info.Length() < 1 || !info[0].IsString()) return Napi::Boolean::New(info.Env(), false);
    const std::string ringName = info[0].As<Napi::String>().Utf8Value();
    std::lock_guard<std::mutex> lock(g_sharedWriterMutex);
    const auto found = g_sharedWriters.find(ringName);
    if (found == g_sharedWriters.end()) return Napi::Boolean::New(info.Env(), false);
    found->second.writer->Close();
    g_sharedWriters.erase(found);
    return Napi::Boolean::New(info.Env(), true);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("listCaptureDevices", Napi::Function::New(env, ListCaptureDevices));
    exports.Set("startCapture", Napi::Function::New(env, StartCapture));
    exports.Set("stopCapture", Napi::Function::New(env, StopCapture));
    exports.Set("getStatus", Napi::Function::New(env, GetStatus));
    exports.Set("startProgramAudioTransport", Napi::Function::New(env, StartProgramAudioTransport));
    exports.Set("pushProgramAudio", Napi::Function::New(env, PushProgramAudio));
    exports.Set("stopProgramAudioTransport", Napi::Function::New(env, StopProgramAudioTransport));
    exports.Set("startSharedCaptureReader", Napi::Function::New(env, StartSharedCaptureReader));
    exports.Set("stopSharedCaptureReader", Napi::Function::New(env, StopSharedCaptureReader));
    exports.Set("getSharedCaptureReaderStatus", Napi::Function::New(env, GetSharedCaptureReaderStatus));
    exports.Set("createSharedMixerSourceWriter", Napi::Function::New(env, CreateSharedMixerSourceWriter));
    exports.Set("pushSharedMixerSource", Napi::Function::New(env, PushSharedMixerSource));
    exports.Set("closeSharedMixerSourceWriter", Napi::Function::New(env, CloseSharedMixerSourceWriter));
    return exports;
}

} // namespace

NODE_API_MODULE(ilystream_audio, Init)
