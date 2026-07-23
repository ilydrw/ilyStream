#pragma once

#include "ily/types.h"
#include "ily/render_graph.h"
#include "render_device.h"
#include "frame_scheduler.h"
#include <thread>
#include <queue>
#include <mutex>
#include <condition_variable>
#include <chrono>
#include <memory>
#include <future>
#include <atomic>

namespace ily {

enum class RenderCommandType {
    Initialize,
    Shutdown,
    Resize,
    SetRenderGraph,
    StopThread,
    CreateTexture,
    CreateSharedTexture,
    UpdateTexture,
    DestroyTexture,
    CreateSpriteProgram,
    DrawQuad,
    GetSharedOutputTexture,
    ReadPixels
};

// Represents a command enqueued for the dedicated render thread.
//
// MEMORY SAFETY INVARIANTS FOR RAW POINTERS:
// The fields `textureData`, `sharedOutputHandle`, `sharedOutputWidth`,
// `sharedOutputHeight`, `readbackDst`, `readbackOutWidth`, and
// `readbackOutHeight` are raw pointers passed from the caller thread (e.g. JS/V8).
// These pointers are SAFE to use by the render thread ONLY because the enqueueing 
// methods (e.g. CreateTexture, UpdateTexture, ReadPixels) are synchronous 
// blocking operations. The caller thread explicitly blocks on the associated 
// `std::promise` until the render thread executes the command and sets the result. 
// Thus, the caller's stack or heap allocations remain valid and cannot be 
// garbage-collected or deallocated while the render thread processes the command.
// Do not use these pointers in fire-and-forget (non-blocking) commands.
struct RenderThreadCommand {
    RenderCommandType type;
    IlyEngineConfig config;
    uint32_t width;
    uint32_t height;
    const void* textureData;
    uint32_t textureDataSize;
    void* sharedTextureHandle = nullptr;
    bool isBGRA;
    IlyPixelFormat pixelFormat = ILY_PIXEL_FORMAT_UNKNOWN;
    IlyColorDescription colorDescription = IlySrgbFullColor();
    IlyAlphaMode alphaMode = ILY_ALPHA_STRAIGHT;
    float sdrWhiteNits = 0.0f;
    ResourceHandle handle;
    IlyTransform transform;
    float opacity;
    IlyBlendMode blendMode;
    IlyChromaKey chromaKey{};
    IlyColorAdjust colorAdjust{};
    float cornerRadius = 0.0f;
    float blurSigma = 0.0f;
    IlyCircleMask circleMask{};
    ResourceHandle maskTexture = ILY_INVALID_HANDLE;
    std::shared_ptr<RenderGraph> renderGraph;
    void** sharedOutputHandle = nullptr;
    uint32_t* sharedOutputWidth = nullptr;
    uint32_t* sharedOutputHeight = nullptr;
    // Readback destination (ReadPixels): caller-owned buffer + size and optional
    // out-params for the surface dimensions.
    void* readbackDst = nullptr;
    uint32_t readbackSize = 0;
    uint32_t* readbackOutWidth = nullptr;
    uint32_t* readbackOutHeight = nullptr;
    std::shared_ptr<std::promise<IlyResult>> promise;
    std::shared_ptr<std::promise<ResourceHandle>> handlePromise;
};

class ILY_API Renderer {
public:
    Renderer();
    ~Renderer();

    IlyResult Start();
    void Stop();

    IlyResult Initialize(const IlyEngineConfig& config);
    void Shutdown();

    IlyResult Resize(uint32_t width, uint32_t height);
    void SetRenderGraph(std::shared_ptr<RenderGraph> graph);
    
    // Thread-safe Render Queue helpers
    ResourceHandle CreateTexture(uint32_t width, uint32_t height, const void* data, uint32_t byteLength, bool isBGRA = false, const IlyColorDescription& color = IlySrgbFullColor(), IlyAlphaMode alphaMode = ILY_ALPHA_STRAIGHT);
    ResourceHandle CreateSharedTextureFromHandle(uint32_t width, uint32_t height, void* sharedHandle, IlyPixelFormat format = ILY_PIXEL_FORMAT_BGRA8, const IlyColorDescription& color = IlySrgbFullColor(), IlyAlphaMode alphaMode = ILY_ALPHA_OPAQUE, float sdrWhiteNits = 0.0f);
    IlyResult UpdateTexture(ResourceHandle handle, const void* data, uint32_t byteLength, bool isBGRA = false);
    void DestroyTexture(ResourceHandle handle);
    ResourceHandle CreateSpriteProgram();
    IlyResult DrawQuad(ResourceHandle textureHandle, const IlyTransform& transform, float opacity, IlyBlendMode blendMode, const IlyChromaKey* chroma = nullptr, const IlyColorAdjust* colorAdjust = nullptr, float cornerRadius = 0.0f, float blurSigma = 0.0f, const IlyCircleMask* circleMask = nullptr, ResourceHandle maskTexture = ILY_INVALID_HANDLE);
    IlyResult GetSharedOutputTexture(void** outHandle, uint32_t* outWidth, uint32_t* outHeight);
    IlyResult ReadPixels(void* dst, uint32_t dstSize, uint32_t* outWidth, uint32_t* outHeight);

    RenderDevice& GetDevice() { return m_device; }

private:
    void RenderThreadLoop();

    class CommandQueue {
    public:
        void Push(const RenderThreadCommand& cmd) {
            std::lock_guard<std::mutex> lock(m_mutex);
            m_queue.push(cmd);
            m_cv.notify_one();
        }

        bool Pop(RenderThreadCommand& cmd, bool block) {
            std::unique_lock<std::mutex> lock(m_mutex);
            if (block) {
                m_cv.wait(lock, [this] { return !m_queue.empty(); });
            } else {
                if (m_queue.empty()) {
                    return false;
                }
            }
            cmd = m_queue.front();
            m_queue.pop();
            return true;
        }

        // Block until a command is queued. Used by the render thread when it is
        // idle (not yet initialized / after shutdown) so it consumes no CPU.
        void WaitForWork() {
            std::unique_lock<std::mutex> lock(m_mutex);
            m_cv.wait(lock, [this] { return !m_queue.empty(); });
        }

        // Wait until either a command is queued or the deadline passes. Lets the
        // render thread pace frames to a deadline while still servicing incoming
        // commands the instant they arrive, instead of sleeping a whole frame.
        void WaitUntil(std::chrono::steady_clock::time_point deadline) {
            std::unique_lock<std::mutex> lock(m_mutex);
            m_cv.wait_until(lock, deadline, [this] { return !m_queue.empty(); });
        }

        void Clear() {
            std::lock_guard<std::mutex> lock(m_mutex);
            while (!m_queue.empty()) {
                m_queue.pop();
            }
        }

    private:
        std::queue<RenderThreadCommand> m_queue;
        std::mutex m_mutex;
        std::condition_variable m_cv;
    };

    RenderDevice m_device;
    CommandQueue m_commandQueue;
    std::thread m_renderThread;
    std::atomic<bool> m_threadRunning{false};
};

} // namespace ily
