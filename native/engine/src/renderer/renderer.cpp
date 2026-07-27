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

int32_t Renderer::CreateOutput(uint32_t width, uint32_t height) {
    ILY_PROFILE_SCOPE("Renderer::CreateOutput");
    if (!m_threadRunning) return -1;
    auto promise = std::make_shared<std::promise<int32_t>>();
    auto future = promise->get_future();
    RenderThreadCommand cmd{};
    cmd.type = RenderCommandType::CreateOutput;
    cmd.width = width;
    cmd.height = height;
    cmd.outputPromise = promise;
    m_commandQueue.Push(cmd);
    return future.get();
}

void Renderer::DestroyOutput(uint32_t outputIndex) {
    ILY_PROFILE_SCOPE("Renderer::DestroyOutput");
    if (!m_threadRunning) return;
    RenderThreadCommand cmd{};
    cmd.type = RenderCommandType::DestroyOutput;
    cmd.outputIndex = outputIndex;
    m_commandQueue.Push(cmd);
}

void Renderer::SetRenderGraphForOutput(uint32_t outputIndex, std::shared_ptr<RenderGraph> graph) {
    ILY_PROFILE_SCOPE("Renderer::SetRenderGraphForOutput");
    if (!m_threadRunning) return;
    RenderThreadCommand cmd{};
    cmd.type = RenderCommandType::SetRenderGraphForOutput;
    cmd.outputIndex = outputIndex;
    cmd.renderGraph = graph;
    m_commandQueue.Push(cmd);
}

IlyResult Renderer::ReadPixelsFromOutput(uint32_t outputIndex, void* dst, uint32_t dstSize, uint32_t* outWidth, uint32_t* outHeight) {
    ILY_PROFILE_SCOPE("Renderer::ReadPixelsFromOutput");
    if (!m_threadRunning) return ILY_ERROR_INITIALIZATION_FAILED;
    auto promise = std::make_shared<std::promise<IlyResult>>();
    auto future = promise->get_future();
    RenderThreadCommand cmd{};
    cmd.type = RenderCommandType::ReadPixels;
    cmd.outputIndex = outputIndex;
    cmd.readbackDst = dst;
    cmd.readbackSize = dstSize;
    cmd.readbackOutWidth = outWidth;
    cmd.readbackOutHeight = outHeight;
    cmd.promise = promise;
    m_commandQueue.Push(cmd);
    return future.get();
}

IlyResult Renderer::GetSharedOutputTextureForOutput(uint32_t outputIndex, void** outHandle, uint32_t* outWidth, uint32_t* outHeight) {
    ILY_PROFILE_SCOPE("Renderer::GetSharedOutputTextureForOutput");
    if (!m_threadRunning) return ILY_ERROR_INITIALIZATION_FAILED;
    auto promise = std::make_shared<std::promise<IlyResult>>();
    auto future = promise->get_future();
    RenderThreadCommand cmd{};
    cmd.type = RenderCommandType::GetSharedOutputTexture;
    cmd.outputIndex = outputIndex;
    cmd.sharedOutputHandle = outHandle;
    cmd.sharedOutputWidth = outWidth;
    cmd.sharedOutputHeight = outHeight;
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

IlyResult Renderer::DrawQuad(ResourceHandle textureHandle, const IlyTransform& transform, float opacity, IlyBlendMode blendMode, const IlyChromaKey* chroma, const IlyColorAdjust* colorAdjust, float cornerRadius, float blurSigma, const IlyCircleMask* circleMask, ResourceHandle maskTexture, const float* maskTransform) {
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
    if (maskTransform) {
        cmd.maskTransform[0] = maskTransform[0];
        cmd.maskTransform[1] = maskTransform[1];
        cmd.maskTransform[2] = maskTransform[2];
        cmd.maskTransform[3] = maskTransform[3];
    }
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
    // Graphs for outputs beyond the engine's own, indexed by output id.
    std::vector<std::shared_ptr<RenderGraph>> secondaryGraphs;

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
                case RenderCommandType::CreateOutput: {
                    IRenderBackend* backend = m_device.GetBackend();
                    const int32_t index = backend
                        ? backend->CreateOutput(cmd.width, cmd.height)
                        : -1;
                    if (cmd.outputPromise) {
                        cmd.outputPromise->set_value(index);
                    }
                    break;
                }
                case RenderCommandType::DestroyOutput: {
                    if (IRenderBackend* backend = m_device.GetBackend()) {
                        backend->DestroyOutput(cmd.outputIndex);
                    }
                    if (cmd.outputIndex < secondaryGraphs.size()) {
                        secondaryGraphs[cmd.outputIndex] = nullptr;
                    }
                    break;
                }
                case RenderCommandType::SetRenderGraphForOutput: {
                    if (cmd.outputIndex == 0) {
                        activeGraph = cmd.renderGraph;
                    } else {
                        if (cmd.outputIndex >= secondaryGraphs.size()) {
                            secondaryGraphs.resize(cmd.outputIndex + 1);
                        }
                        secondaryGraphs[cmd.outputIndex] = cmd.renderGraph;
                    }
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
                    IlyResult res = m_device.DrawQuad(cmd.handle, cmd.transform, cmd.opacity, cmd.blendMode, &cmd.chromaKey, &cmd.colorAdjust, cmd.cornerRadius, cmd.blurSigma, &cmd.circleMask, cmd.maskTexture, cmd.maskTransform);
                    if (cmd.promise) {
                        cmd.promise->set_value(res);
                    }
                    break;
                }
                case RenderCommandType::GetSharedOutputTexture: {
                    IRenderBackend* backend = m_device.GetBackend();
                    IlyResult res = backend
                        ? backend->GetSharedOutputTextureForOutput(
                              cmd.outputIndex, cmd.sharedOutputHandle,
                              cmd.sharedOutputWidth, cmd.sharedOutputHeight)
                        : ILY_ERROR_INITIALIZATION_FAILED;
                    if (cmd.promise) {
                        cmd.promise->set_value(res);
                    }
                    break;
                }
                case RenderCommandType::ReadPixels: {
                    IRenderBackend* backend = m_device.GetBackend();
                    IlyResult res = backend
                        ? backend->ReadPixelsFromOutput(cmd.outputIndex, cmd.readbackDst, cmd.readbackSize,
                                                        cmd.readbackOutWidth, cmd.readbackOutHeight)
                        : ILY_ERROR_INITIALIZATION_FAILED;
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
                IRenderBackend* backend = m_device.GetBackend();
                // Every output composites inside this one frame, sharing the
                // engine's textures; EndFrame then encodes them all.
                if (backend) backend->SetActiveOutput(0);
                if (activeGraph) {
                    activeGraph->Execute(backend);
                }
                for (uint32_t outputIndex = 1; outputIndex < secondaryGraphs.size(); ++outputIndex) {
                    if (!secondaryGraphs[outputIndex] || !backend) continue;
                    backend->SetActiveOutput(outputIndex);
                    secondaryGraphs[outputIndex]->Execute(backend);
                }
                if (backend) backend->SetActiveOutput(0);
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
