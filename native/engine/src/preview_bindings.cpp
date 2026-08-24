#include <napi.h>
#include <windows.h>
#include <iostream>
#include "ily/shared_ring_buffer.h"

using namespace ily;

class PreviewReader : public Napi::ObjectWrap<PreviewReader> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports) {
        Napi::Function func = DefineClass(env, "PreviewReader", {
            InstanceMethod("readLatestFrame", &PreviewReader::ReadLatestFrame),
            InstanceMethod("close", &PreviewReader::Close)
        });

        Napi::FunctionReference* constructor = new Napi::FunctionReference();
        *constructor = Napi::Persistent(func);
        env.SetInstanceData(constructor);

        exports.Set("PreviewReader", func);
        return exports;
    }

    PreviewReader(const Napi::CallbackInfo& info) : Napi::ObjectWrap<PreviewReader>(info) {
        Napi::Env env = info.Env();
        m_mapHandle = nullptr;
        m_sharedBuffer = nullptr;

        if (info.Length() < 1 || !info[0].IsString()) {
            Napi::TypeError::New(env, "String map name expected").ThrowAsJavaScriptException();
            return;
        }

        std::string mapName = info[0].As<Napi::String>().Utf8Value();
        
        m_mapHandle = OpenFileMappingA(FILE_MAP_READ, FALSE, mapName.c_str());
        if (!m_mapHandle) {
            Napi::Error::New(env, "Failed to open shared memory: " + mapName).ThrowAsJavaScriptException();
            return;
        }

        m_sharedBuffer = static_cast<SharedRingBuffer*>(MapViewOfFile(m_mapHandle, FILE_MAP_READ, 0, 0, sizeof(SharedRingBuffer)));
        if (!m_sharedBuffer) {
            CloseHandle(m_mapHandle);
            m_mapHandle = nullptr;
            Napi::Error::New(env, "Failed to map view of file: " + mapName).ThrowAsJavaScriptException();
            return;
        }
    }

    ~PreviewReader() {
        CloseInternal();
    }

private:
    Napi::Value ReadLatestFrame(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();

        if (!m_sharedBuffer) {
            return env.Null();
        }

        // Lock-free read
        uint64_t seq = m_sharedBuffer->writeSequence.load(std::memory_order_acquire);
        if (seq == 0) {
            return env.Null(); // No frames written yet
        }

        uint32_t slotIdx = seq % RING_BUFFER_SLOTS;
        const FrameSlot& slot = m_sharedBuffer->slots[slotIdx];

        uint64_t slotSeq = slot.sequence.load(std::memory_order_acquire);
        if (slotSeq != seq) {
            // Reader got lapped or slot not fully published
            return env.Null();
        }

        if (slot.width == 0 || slot.height == 0) {
            return env.Null();
        }

        const uint64_t byteSize64 = static_cast<uint64_t>(slot.width) * static_cast<uint64_t>(slot.height) * 4;
        if (byteSize64 == 0 || byteSize64 > MAX_FRAME_BYTES) {
            return env.Null();
        }
        uint32_t byteSize = static_cast<uint32_t>(byteSize64);
        
        // Ensure buffer fits
        if (info.Length() >= 1 && info[0].IsBuffer()) {
            auto outBuffer = info[0].As<Napi::Buffer<uint8_t>>();
            if (outBuffer.Length() < byteSize) {
                Napi::Error::New(env, "Buffer too small").ThrowAsJavaScriptException();
                return env.Null();
            }
            uint32_t* dest32 = reinterpret_cast<uint32_t*>(outBuffer.Data());
            const uint32_t* src32 = reinterpret_cast<const uint32_t*>(slot.pixels);
            for (uint32_t i = 0; i < byteSize / 4; ++i) {
                uint32_t p = src32[i];
                uint8_t b = p & 0xFF;
                uint8_t g = (p >> 8) & 0xFF;
                uint8_t r = (p >> 16) & 0xFF;
                
                dest32[i] = 0xFF000000 | (b << 16) | (g << 8) | r;
            }
            
            // Double check sequence to ensure we didn't get torn data while copying
            std::atomic_thread_fence(std::memory_order_acquire);
            if (slot.sequence.load(std::memory_order_relaxed) != seq) {
                // Reader was lapped during copy, data is corrupted!
                return env.Null();
            }

            Napi::Object result = Napi::Object::New(env);
            result.Set("width", slot.width);
            result.Set("height", slot.height);
            return result;
        } else {
            // Allocate new buffer if none provided
            Napi::Buffer<uint8_t> outBuffer = Napi::Buffer<uint8_t>::New(env, byteSize);
            uint32_t* dest32 = reinterpret_cast<uint32_t*>(outBuffer.Data());
            const uint32_t* src32 = reinterpret_cast<const uint32_t*>(slot.pixels);
            for (uint32_t i = 0; i < byteSize / 4; ++i) {
                uint32_t p = src32[i];
                uint8_t b = p & 0xFF;
                uint8_t g = (p >> 8) & 0xFF;
                uint8_t r = (p >> 16) & 0xFF;
                dest32[i] = 0xFF000000 | (b << 16) | (g << 8) | r;
            }
            
            std::atomic_thread_fence(std::memory_order_acquire);
            if (slot.sequence.load(std::memory_order_relaxed) != seq) {
                return env.Null();
            }

            Napi::Object result = Napi::Object::New(env);
            result.Set("width", slot.width);
            result.Set("height", slot.height);
            result.Set("data", outBuffer);
            return result;
        }
    }

    Napi::Value Close(const Napi::CallbackInfo& info) {
        CloseInternal();
        return info.Env().Undefined();
    }

    void CloseInternal() {
        if (m_sharedBuffer) {
            UnmapViewOfFile(m_sharedBuffer);
            m_sharedBuffer = nullptr;
        }
        if (m_mapHandle) {
            CloseHandle(m_mapHandle);
            m_mapHandle = nullptr;
        }
    }

    HANDLE m_mapHandle;
    SharedRingBuffer* m_sharedBuffer;
};

static Napi::Object Init(Napi::Env env, Napi::Object exports) {
    PreviewReader::Init(env, exports);
    return exports;
}

NODE_API_MODULE(ilystream_preview, Init)
