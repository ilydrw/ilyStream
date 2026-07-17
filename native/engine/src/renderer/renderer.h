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
    DestroyTexture,
    CreateSpriteProgram,
    DrawQuad
};

struct RenderThreadCommand {
    RenderCommandType type;
    IlyEngineConfig config;
    uint32_t width;
    uint32_t height;
    const void* textureData;
    ResourceHandle handle;
    IlyTransform transform;
    float opacity;
    IlyBlendMode blendMode;
    std::shared_ptr<RenderGraph> renderGraph;
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
    ResourceHandle CreateTexture(uint32_t width, uint32_t height, const void* data);
    void DestroyTexture(ResourceHandle handle);
    ResourceHandle CreateSpriteProgram();
    IlyResult DrawQuad(ResourceHandle textureHandle, const IlyTransform& transform, float opacity, IlyBlendMode blendMode);

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
