#define MINIAUDIO_IMPLEMENTATION
#include "miniaudio.h"
#include <napi.h>
#include <thread>
#include "SpscQueue.h"

SpscQueue<float> audioQueue(65536); // Increased buffer for JS jitter headroom 
std::atomic<uint64_t> total_samples_processed{0};
std::atomic<bool> is_running{false};

ma_device device;
Napi::ThreadSafeFunction tsfn;
std::thread polling_thread;

// Real-time audio callback: Strict rules apply (No blocking, no allocations)
void data_callback(ma_device* pDevice, void* pOutput, const void* pInput, ma_uint32 frameCount) {
    if (pInput == nullptr) return;

    // 1. Zero-Latency Direct Monitoring: Route mic directly back to headphones
    if (pOutput!= nullptr) {
        memcpy(pOutput, pInput, frameCount * pDevice->playback.channels * sizeof(float));
    }

    // 2. Broadcast Routing: Push a copy of the samples to the lock-free queue
    uint32_t sampleCount = frameCount * pDevice->capture.channels;
    audioQueue.push((const float*)pInput, sampleCount);
    
    // 3. Audio Master Clock: Tally the exact number of frames processed
    total_samples_processed.fetch_add(frameCount, std::memory_order_relaxed);
}

// Background thread: Safely moves data into the Node.js V8 engine
void PollingThread() {
    float tempBuffer[4096]; // Larger chunks to reduce IPC overhead
    while (is_running.load()) {
        size_t samplesRead = audioQueue.pop(tempBuffer, 4096);
        if (samplesRead > 0) {
            uint64_t current_clock = total_samples_processed.load(std::memory_order_relaxed);
            
            // We must copy the data into a container that can be safely captured by the TSFS callback
            std::vector<float> dataCopy(tempBuffer, tempBuffer + samplesRead);
            
            tsfn.BlockingCall([dataCopy, current_clock](Napi::Env env, Napi::Function jsCallback) {
                Napi::Float32Array jsArray = Napi::Float32Array::New(env, dataCopy.size());
                memcpy(jsArray.Data(), dataCopy.data(), dataCopy.size() * sizeof(float));
                
                Napi::Object payload = Napi::Object::New(env);
                payload.Set("audio", jsArray);
                payload.Set("totalSamples", current_clock);
                
                jsCallback.Call({ payload });
            });
        } else {
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
        }
    }
}

Napi::Value StartEngine(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsFunction()) {
        Napi::TypeError::New(env, "Callback function expected").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    Napi::Function callback = info[0].As<Napi::Function>();
    tsfn = Napi::ThreadSafeFunction::New(env, callback, "AudioCallback", 0, 1);

    ma_device_config deviceConfig = ma_device_config_init(ma_device_type_duplex);
    deviceConfig.capture.pDeviceID = NULL;
    deviceConfig.capture.format    = ma_format_f32;
    deviceConfig.capture.channels  = 2;
    deviceConfig.capture.shareMode = ma_share_mode_exclusive;

    deviceConfig.playback.pDeviceID = NULL;
    deviceConfig.playback.format    = ma_format_f32;
    deviceConfig.playback.channels  = 2;
    deviceConfig.playback.shareMode = ma_share_mode_exclusive;

    deviceConfig.sampleRate         = 48000;
    deviceConfig.dataCallback       = data_callback;
    deviceConfig.periodSizeInFrames = 480; // 10ms: Balanced for JS reliability

    // Elevate thread to Pro Audio priority via Windows MMCSS
    deviceConfig.wasapi.usage = ma_wasapi_usage_pro_audio;

    if (ma_device_init(NULL, &deviceConfig, &device)!= MA_SUCCESS) {
        Napi::Error::New(env, "Failed to initialize audio device").ThrowAsJavaScriptException();
        return env.Null();
    }

    is_running.store(true);
    ma_device_start(&device);
    polling_thread = std::thread(PollingThread);

    return Napi::Boolean::New(env, true);
}

Napi::Value StopEngine(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    is_running.store(false);
    ma_device_stop(&device);
    ma_device_uninit(&device);
    if (polling_thread.joinable()) {
        polling_thread.join();
    }
    tsfn.Release();
    return env.Null();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("start", Napi::Function::New(env, StartEngine));
    exports.Set("stop", Napi::Function::New(env, StopEngine));
    return exports;
}

NODE_API_MODULE(audio_engine, Init)