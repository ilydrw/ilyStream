#include "renderer.h"

namespace ily {

Renderer::Renderer() {}

Renderer::~Renderer() {
    Stop();
}

IlyResult Renderer::Start() {
    ILY_PROFILE_SCOPE("Renderer::Start");
    if (m_threadRunning.exchange(true)) {
        return ILY_SUCCESS; // Already running
    }
    m_renderThread = std::thread(&Renderer::RenderThreadLoop, this);
    return ILY_SUCCESS;
}

void Renderer::Stop() {
    ILY_PROFILE_SCOPE("Renderer::Stop");
    if (!m_threadRunning.exchange(false)) {
        return; // Already stopped
    }
    RenderThreadCommand cmd{};
    cmd.type = RenderCommandType::StopThread;
    m_commandQueue.Push(cmd);
    if (m_renderThread.joinable()) {
        m_renderThread.join();
    }
    m_commandQueue.Clear();
}

IlyResult Renderer::Initialize(const IlyEngineConfig& config) {
    ILY_PROFILE_SCOPE("Renderer::Initialize");
    if (!m_threadRunning) {
        return ILY_ERROR_INITIALIZATION_FAILED;
    }
    auto promise = std::make_shared<std::promise<IlyResult>>();
    auto future = promise->get_future();

    RenderThreadCommand cmd{};
    cmd.type = RenderCommandType::Initialize;
    cmd.config = config;
    cmd.promise = promise;

    m_commandQueue.Push(cmd);
    return future.get();
}

void Renderer::Shutdown() {
    ILY_PROFILE_SCOPE("Renderer::Shutdown");
    if (!m_threadRunning) {
        return;
    }
    auto promise = std::make_shared<std::promise<IlyResult>>();
    auto future = promise->get_future();

    RenderThreadCommand cmd{};
    cmd.type = RenderCommandType::Shutdown;
    cmd.promise = promise;

    m_commandQueue.Push(cmd);
    future.get();
}

IlyResult Renderer::Resize(uint32_t width, uint32_t height) {
    ILY_PROFILE_SCOPE("Renderer::Resize");
    if (!m_threadRunning) {
        return ILY_ERROR_INITIALIZATION_FAILED;
    }
    auto promise = std::make_shared<std::promise<IlyResult>>();
    auto future = promise->get_future();

    RenderThreadCommand cmd{};
    cmd.type = RenderCommandType::Resize;
    cmd.width = width;
    cmd.height = height;
    cmd.promise = promise;

    m_commandQueue.Push(cmd);
    return future.get();
}

void Renderer::SetRenderGraph(std::shared_ptr<RenderGraph> graph) {
    ILY_PROFILE_SCOPE("Renderer::SetRenderGraph");
    if (!m_threadRunning) {
        return;
    }
    RenderThreadCommand cmd{};
    cmd.type = RenderCommandType::SetRenderGraph;
    cmd.renderGraph = graph;
    m_commandQueue.Push(cmd);
}

ResourceHandle Renderer::CreateTexture(uint32_t width, uint32_t height, const void* data, uint32_t byteLength, bool isBGRA, const IlyColorDescription& color, IlyAlphaMode alphaMode) {
    if (!m_threadRunning) return ILY_INVALID_HANDLE;
    auto promise = std::make_shared<std::promise<ResourceHandle>>();
    auto future = promise->get_future();
    RenderThreadCommand cmd{};
    cmd.type = RenderCommandType::CreateTexture;
    cmd.width = width;
    cmd.height = height;
    cmd.textureData = data;
    cmd.textureDataSize = byteLength;
    cmd.isBGRA = isBGRA;
    cmd.colorDescription = color;
    cmd.alphaMode = alphaMode;
    cmd.handlePromise = promise;
    m_commandQueue.Push(cmd);
    return future.get();
}

ResourceHandle Renderer::CreateSharedTextureFromHandle(uint32_t width, uint32_t height, void* sharedHandle, IlyPixelFormat format, const IlyColorDescription& color, IlyAlphaMode alphaMode, float sdrWhiteNits) {
    if (!m_threadRunning) return ILY_INVALID_HANDLE;
    auto promise = std::make_shared<std::promise<ResourceHandle>>();
    auto future = promise->get_future();
    RenderThreadCommand cmd{};
    cmd.type = RenderCommandType::CreateSharedTexture;
    cmd.width = width;
    cmd.height = height;
    cmd.sharedTextureHandle = sharedHandle;
    cmd.pixelFormat = format;
    cmd.colorDescription = color;
    cmd.alphaMode = alphaMode;
    cmd.sdrWhiteNits = sdrWhiteNits;
    cmd.handlePromise = promise;
    m_commandQueue.Push(cmd);
    return future.get();
}

IlyResult Renderer::UpdateTexture(ResourceHandle handle, const void* data, uint32_t byteLength, bool isBGRA) {
    if (!m_threadRunning) return ILY_ERROR_INITIALIZATION_FAILED;
    auto promise = std::make_shared<std::promise<IlyResult>>();
    auto future = promise->get_future();
    RenderThreadCommand cmd{};
    cmd.type = RenderCommandType::UpdateTexture;
    cmd.handle = handle;
    cmd.textureData = data;
    cmd.textureDataSize = byteLength;
    cmd.isBGRA = isBGRA;
    cmd.promise = promise;
    m_commandQueue.Push(cmd);
    return future.get();
}

void Renderer::DestroyTexture(ResourceHandle handle) {
    if (!m_threadRunning) return;
    auto promise = std::make_shared<std::promise<IlyResult>>();
    auto future = promise->get_future();
    RenderThreadCommand cmd{};
    cmd.type = RenderCommandType::DestroyTexture;
    cmd.handle = handle;
    cmd.promise = promise;
    m_commandQueue.Push(cmd);
    future.get();
}

ResourceHandle Renderer::CreateSpriteProgram() {
    if (!m_threadRunning) return ILY_INVALID_HANDLE;
    auto promise = std::make_shared<std::promise<ResourceHandle>>();
    auto future = promise->get_future();
    RenderThreadCommand cmd{};
    cmd.type = RenderCommandType::CreateSpriteProgram;
    cmd.handlePromise = promise;
    m_commandQueue.Push(cmd);
    return future.get();
}

IlyResult Renderer::DrawQuad(ResourceHandle textureHandle, const IlyTransform& transform, float opacity, IlyBlendMode blendMode, const IlyChromaKey* chroma, const IlyColorAdjust* colorAdjust, float cornerRadius, float blurSigma, const IlyCircleMask* circleMask, ResourceHandle maskTexture) {
    if (!m_threadRunning) return ILY_ERROR_INITIALIZATION_FAILED;
    auto promise = std::make_shared<std::promise<IlyResult>>();
    auto future = promise->get_future();
    RenderThreadCommand cmd{};
    cmd.type = RenderCommandType::DrawQuad;
    cmd.handle = textureHandle;
    cmd.transform = transform;
    cmd.opacity = opacity;
    cmd.blendMode = blendMode;
    if (chroma) cmd.chromaKey = *chroma;
    if (colorAdjust) cmd.colorAdjust = *colorAdjust;
    cmd.cornerRadius = cornerRadius;
    cmd.blurSigma = blurSigma;
    if (circleMask) cmd.circleMask = *circleMask;
    cmd.maskTexture = maskTexture;
    cmd.promise = promise;
    m_commandQueue.Push(cmd);
    return future.get();
}

IlyResult Renderer::GetSharedOutputTexture(void** outHandle, uint32_t* outWidth, uint32_t* outHeight) {
    if (!m_threadRunning) return ILY_ERROR_INITIALIZATION_FAILED;
    auto promise = std::make_shared<std::promise<IlyResult>>();
    auto future = promise->get_future();
    RenderThreadCommand cmd{};
    cmd.type = RenderCommandType::GetSharedOutputTexture;
    cmd.sharedOutputHandle = outHandle;
    cmd.sharedOutputWidth = outWidth;
    cmd.sharedOutputHeight = outHeight;
    cmd.promise = promise;
    m_commandQueue.Push(cmd);
    return future.get();
}

IlyResult Renderer::ReadPixels(void* dst, uint32_t dstSize, uint32_t* outWidth, uint32_t* outHeight) {
    if (!m_threadRunning) return ILY_ERROR_INITIALIZATION_FAILED;
    auto promise = std::make_shared<std::promise<IlyResult>>();
    auto future = promise->get_future();
    RenderThreadCommand cmd{};
    cmd.type = RenderCommandType::ReadPixels;
    cmd.readbackDst = dst;
    cmd.readbackSize = dstSize;
    cmd.readbackOutWidth = outWidth;
    cmd.readbackOutHeight = outHeight;
    cmd.promise = promise;
    m_commandQueue.Push(cmd);
    return future.get();
}

void Renderer::RenderThreadLoop() {
    using Clock = std::chrono::steady_clock;

    FrameScheduler scheduler;
    bool running = true;
    bool rendering = false;
    IlyEngineConfig activeConfig{};
    std::shared_ptr<RenderGraph> activeGraph = nullptr;

    // We pace frames ourselves against this deadline instead of blocking inside
    // the render call (vsync is disabled on the offscreen surface). This keeps
    // the thread free to service queued commands between frames.
    Clock::time_point nextFrameTime = Clock::now();
    auto frameBudget = [&activeConfig]() -> Clock::duration {
        const uint32_t fps = activeConfig.fps > 0 ? activeConfig.fps : 60;
        return std::chrono::duration_cast<Clock::duration>(
            std::chrono::duration<double>(1.0 / static_cast<double>(fps)));
    };

    while (running) {
        // Drain every queued command without blocking. Resource work (texture /
        // shader create+destroy, draws) is serviced here the moment it arrives,
        // decoupled from the frame cadence below.
        RenderThreadCommand cmd;
        while (m_commandQueue.Pop(cmd, /*block*/ false)) {
            switch (cmd.type) {
                case RenderCommandType::Initialize: {
                    activeConfig = cmd.config;
                    IlyResult res = m_device.Initialize(activeConfig);
                    scheduler.Reset();
                    rendering = (res == ILY_SUCCESS);
                    nextFrameTime = Clock::now();
                    if (cmd.promise) {
                        cmd.promise->set_value(res);
                    }
                    break;
                }
                case RenderCommandType::Shutdown: {
                    m_device.Shutdown();
                    rendering = false;
                    activeGraph = nullptr;
                    if (cmd.promise) {
                        cmd.promise->set_value(ILY_SUCCESS);
                    }
                    break;
                }
                case RenderCommandType::Resize: {
                    activeConfig.width = cmd.width;
                    activeConfig.height = cmd.height;
                    IlyResult res = m_device.Initialize(activeConfig);
                    if (cmd.promise) {
                        cmd.promise->set_value(res);
                    }
                    break;
                }
                case RenderCommandType::SetRenderGraph: {
                    activeGraph = cmd.renderGraph;
                    break;
                }
                case RenderCommandType::StopThread: {
                    running = false;
                    break;
                }
                case RenderCommandType::CreateTexture: {
                    ResourceHandle tex = m_device.CreateTexture(cmd.width, cmd.height, cmd.textureData, cmd.textureDataSize, cmd.isBGRA, cmd.colorDescription, cmd.alphaMode);
                    if (cmd.handlePromise) {
                        cmd.handlePromise->set_value(tex);
                    }
                    break;
                }
                case RenderCommandType::CreateSharedTexture: {
                    ResourceHandle tex = m_device.CreateSharedTextureFromHandle(cmd.width, cmd.height, cmd.sharedTextureHandle, cmd.pixelFormat, cmd.colorDescription, cmd.alphaMode, cmd.sdrWhiteNits);
                    if (cmd.handlePromise) {
                        cmd.handlePromise->set_value(tex);
                    }
                    break;
                }
                case RenderCommandType::UpdateTexture: {
                    IlyResult res = m_device.UpdateTexture(cmd.handle, cmd.textureData, cmd.textureDataSize, cmd.isBGRA);
                    if (cmd.promise) {
                        cmd.promise->set_value(res);
                    }
                    break;
                }
                case RenderCommandType::DestroyTexture: {
                    m_device.DestroyTexture(cmd.handle);
                    if (cmd.promise) {
                        cmd.promise->set_value(ILY_SUCCESS);
                    }
                    break;
                }
                case RenderCommandType::CreateSpriteProgram: {
                    ResourceHandle program = m_device.GetBackend() ? m_device.GetBackend()->CreateSpriteProgramHandle() : ILY_INVALID_HANDLE;
                    if (cmd.handlePromise) {
                        cmd.handlePromise->set_value(program);
                    }
                    break;
                }
                case RenderCommandType::DrawQuad: {
                    IlyResult res = m_device.DrawQuad(cmd.handle, cmd.transform, cmd.opacity, cmd.blendMode, &cmd.chromaKey, &cmd.colorAdjust, cmd.cornerRadius, cmd.blurSigma, &cmd.circleMask, cmd.maskTexture);
                    if (cmd.promise) {
                        cmd.promise->set_value(res);
                    }
                    break;
                }
                case RenderCommandType::GetSharedOutputTexture: {
                    IlyResult res = m_device.GetSharedOutputTexture(
                        cmd.sharedOutputHandle, cmd.sharedOutputWidth, cmd.sharedOutputHeight);
                    if (cmd.promise) {
                        cmd.promise->set_value(res);
                    }
                    break;
                }
                case RenderCommandType::ReadPixels: {
                    IlyResult res = m_device.ReadPixels(cmd.readbackDst, cmd.readbackSize,
                                                        cmd.readbackOutWidth, cmd.readbackOutHeight);
                    if (cmd.promise) {
                        cmd.promise->set_value(res);
                    }
                    break;
                }
            }
            if (!running) {
                break;
            }
        }

        if (!running) {
            break;
        }

        if (rendering) {
            const Clock::time_point now = Clock::now();
            if (now >= nextFrameTime) {
                scheduler.StartFrame();

                m_device.BeginFrame();
                if (activeGraph) {
                    activeGraph->Execute(m_device.GetBackend());
                }
                m_device.EndFrame();

                const Clock::duration budget = frameBudget();
                nextFrameTime += budget;
                // If we fell far behind (long stall), resync instead of racing
                // through a backlog of frames to catch up.
                if (nextFrameTime + budget * 5 < now) {
                    nextFrameTime = now + budget;
                }
            } else {
                // Wait for the next frame deadline, but wake immediately if a
                // command arrives so resource work never waits a whole frame.
                m_commandQueue.WaitUntil(nextFrameTime);
            }
        } else {
            // Idle (not initialized or shut down): block until work arrives.
            m_commandQueue.WaitForWork();
        }
    }

    m_device.Shutdown();
}

} // namespace ily
