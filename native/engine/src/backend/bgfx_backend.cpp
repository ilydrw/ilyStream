#include "bgfx_backend.h"
#include "ily/resource_manager.h"
#include "ily/resources.h"
#include "renderer/shader_loader.h"
#include <bgfx/bgfx.h>
#include <bgfx/platform.h>
#include <bx/bx.h>
#include <mutex>
#include <cstdint>
#include <cstring>
#include <cmath>
#include <iostream>
#include <unordered_map>

#ifdef _WIN32
#include <d3d11.h>
#include <dxgi1_2.h>
#include <windows.h>
#pragma comment(lib, "d3d11.lib")
static HWND create_dummy_window() {
    WNDCLASSEXA wc = {0};
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = DefWindowProcA;
    wc.hInstance = GetModuleHandleA(nullptr);
    wc.lpszClassName = "ilyStreamDummyWindow";
    RegisterClassExA(&wc);
    HWND hwnd = CreateWindowExA(
        0,
        wc.lpszClassName,
        "ilyStream Dummy",
        WS_OVERLAPPEDWINDOW,
        CW_USEDEFAULT, CW_USEDEFAULT,
        640, 480,
        nullptr, nullptr,
        wc.hInstance, nullptr
    );
    return hwnd;
}
static void destroy_dummy_window(HWND hwnd) {
    if (hwnd) {
        DestroyWindow(hwnd);
        UnregisterClassA("ilyStreamDummyWindow", GetModuleHandleA(nullptr));
    }
}
#endif

namespace ily {

struct BgfxBackend::Impl {
    uint32_t m_width = 1280;
    uint32_t m_height = 720;
    ResourceManager m_resourceManager;
    bgfx::ProgramHandle m_spriteProgram = BGFX_INVALID_HANDLE;
    bgfx::ProgramHandle m_outputProgram = BGFX_INVALID_HANDLE;
    bgfx::UniformHandle m_texColorSampler = BGFX_INVALID_HANDLE;
    bgfx::UniformHandle m_sourceColorUniform = BGFX_INVALID_HANDLE;
    bgfx::UniformHandle m_outputColorUniform = BGFX_INVALID_HANDLE;
    // Per-draw chroma key: u_chromaKey = (keyR, keyG, keyB, similarity),
    // u_chromaParams = (smoothness, spill, enabled, unused).
    bgfx::UniformHandle m_chromaKeyUniform = BGFX_INVALID_HANDLE;
    bgfx::UniformHandle m_chromaParamsUniform = BGFX_INVALID_HANDLE;
    IlyOutputColorConfig m_outputColor = IlyDefaultSdrOutputColor();

    // View 0 composites into a linear RGBA16F working surface. View 1 encodes
    // that surface into the RGBA8 presentation texture shared with Electron.
    // Readback always copies the presentation texture, never the linear target.
    bgfx::TextureHandle m_compositeColorTex = BGFX_INVALID_HANDLE;
    bgfx::FrameBufferHandle m_compositeFb = BGFX_INVALID_HANDLE;
    bgfx::TextureHandle m_offscreenColorTex = BGFX_INVALID_HANDLE;
    bgfx::FrameBufferHandle m_offscreenFb = BGFX_INVALID_HANDLE;
    bgfx::TextureHandle m_readbackTex = BGFX_INVALID_HANDLE;

    mutable std::mutex m_mutex;
    bool m_initialized = false;
    bool m_debugStats = false;
    bool m_frameHasHdrSource = false;

#ifdef _WIN32
    HWND m_dummyHwnd = nullptr;
    ID3D11Texture2D* m_sharedOutputTexture = nullptr;
    HANDLE m_sharedOutputHandle = nullptr;
    std::unordered_map<ResourceHandle, ID3D11Texture2D*> m_importedSharedTextures;

    void ReleaseSharedOutputTexture() {
        if (m_sharedOutputHandle) {
            CloseHandle(m_sharedOutputHandle);
            m_sharedOutputHandle = nullptr;
        }
        if (m_sharedOutputTexture) {
            m_sharedOutputTexture->Release();
            m_sharedOutputTexture = nullptr;
        }
    }

    bool CreateSharedOutputTexture(uint32_t width, uint32_t height) {
        if (bgfx::getRendererType() != bgfx::RendererType::Direct3D11) {
            return false;
        }

        const bgfx::InternalData* internalData = bgfx::getInternalData();
        if (!internalData || !internalData->context) {
            return false;
        }

        ID3D11Device* device = static_cast<ID3D11Device*>(internalData->context);
        D3D11_TEXTURE2D_DESC desc{};
        desc.Width = width;
        desc.Height = height;
        desc.MipLevels = 1;
        desc.ArraySize = 1;
        desc.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
        desc.SampleDesc.Count = 1;
        desc.Usage = D3D11_USAGE_DEFAULT;
        desc.BindFlags = D3D11_BIND_RENDER_TARGET | D3D11_BIND_SHADER_RESOURCE;
        desc.MiscFlags = D3D11_RESOURCE_MISC_SHARED |
                         D3D11_RESOURCE_MISC_SHARED_NTHANDLE;

        ID3D11Texture2D* outputTexture = nullptr;
        HRESULT hr = device->CreateTexture2D(&desc, nullptr, &outputTexture);
        if (FAILED(hr) || !outputTexture) {
            std::cerr << "[ily-engine] shared output CreateTexture2D failed: 0x"
                      << std::hex << static_cast<uint32_t>(hr) << std::dec << std::endl;
            return false;
        }

        IDXGIResource1* dxgiResource = nullptr;
        hr = outputTexture->QueryInterface(
            __uuidof(IDXGIResource1), reinterpret_cast<void**>(&dxgiResource));
        if (FAILED(hr) || !dxgiResource) {
            std::cerr << "[ily-engine] shared output IDXGIResource1 query failed: 0x"
                      << std::hex << static_cast<uint32_t>(hr) << std::dec << std::endl;
            outputTexture->Release();
            return false;
        }

        HANDLE outputHandle = nullptr;
        hr = dxgiResource->CreateSharedHandle(
            nullptr,
            DXGI_SHARED_RESOURCE_READ | DXGI_SHARED_RESOURCE_WRITE,
            nullptr,
            &outputHandle);
        dxgiResource->Release();
        if (FAILED(hr) || !outputHandle) {
            std::cerr << "[ily-engine] shared output CreateSharedHandle failed: 0x"
                      << std::hex << static_cast<uint32_t>(hr) << std::dec << std::endl;
            outputTexture->Release();
            return false;
        }

        bgfx::TextureHandle textureHandle = bgfx::createTexture2D(
            static_cast<uint16_t>(width), static_cast<uint16_t>(height), false, 1,
            bgfx::TextureFormat::RGBA8,
            BGFX_TEXTURE_RT | BGFX_SAMPLER_U_CLAMP | BGFX_SAMPLER_V_CLAMP);
        if (!bgfx::isValid(textureHandle)) {
            CloseHandle(outputHandle);
            outputTexture->Release();
            return false;
        }

        // overrideInternal operates on the renderer-side texture object. Pump
        // the resource-create command through bgfx before replacing its D3D11
        // allocation with the NT-shareable texture.
        bgfx::frame();
        bgfx::frame();
        if (bgfx::overrideInternal(textureHandle, reinterpret_cast<uintptr_t>(outputTexture)) == 0) {
            std::cerr << "[ily-engine] shared output bgfx override failed" << std::endl;
            bgfx::destroy(textureHandle);
            CloseHandle(outputHandle);
            outputTexture->Release();
            return false;
        }

        m_offscreenColorTex = textureHandle;
        m_sharedOutputTexture = outputTexture;
        m_sharedOutputHandle = outputHandle;
        return true;
    }

    void ReleaseImportedSharedTexture(ResourceHandle handle) {
        auto it = m_importedSharedTextures.find(handle);
        if (it == m_importedSharedTextures.end()) {
            return;
        }
        if (it->second) {
            it->second->Release();
        }
        m_importedSharedTextures.erase(it);
    }

    void ReleaseAllImportedSharedTextures() {
        for (auto& entry : m_importedSharedTextures) {
            if (entry.second) {
                entry.second->Release();
            }
        }
        m_importedSharedTextures.clear();
    }
#endif

    // (Re)create the offscreen and readback targets at the given size and point
    // view 0 at the offscreen framebuffer. Caller must hold m_mutex.
    void CreateOffscreenTargets(uint32_t width, uint32_t height) {
        const bgfx::TextureHandle previousComposite = m_compositeColorTex;
        const bgfx::FrameBufferHandle previousCompositeFramebuffer = m_compositeFb;
        const bgfx::TextureHandle previousColor = m_offscreenColorTex;
        const bgfx::FrameBufferHandle previousFramebuffer = m_offscreenFb;
        const bgfx::TextureHandle previousReadback = m_readbackTex;
        m_compositeColorTex = BGFX_INVALID_HANDLE;
        m_compositeFb = BGFX_INVALID_HANDLE;
        m_offscreenColorTex = BGFX_INVALID_HANDLE;
        m_offscreenFb = BGFX_INVALID_HANDLE;
        m_readbackTex = BGFX_INVALID_HANDLE;

#ifdef _WIN32
        ID3D11Texture2D* previousSharedOutputTexture = m_sharedOutputTexture;
        HANDLE previousSharedOutputHandle = m_sharedOutputHandle;
        m_sharedOutputTexture = nullptr;
        m_sharedOutputHandle = nullptr;
        CreateSharedOutputTexture(width, height);
#endif

        // Preserve the normal offscreen target as a portable fallback when the
        // native shared texture path is unsupported by the backend or driver.
        if (!bgfx::isValid(m_offscreenColorTex)) {
            m_offscreenColorTex = bgfx::createTexture2D(
                static_cast<uint16_t>(width), static_cast<uint16_t>(height), false, 1,
                bgfx::TextureFormat::RGBA8,
                BGFX_TEXTURE_RT | BGFX_SAMPLER_U_CLAMP | BGFX_SAMPLER_V_CLAMP);
        }

        m_compositeColorTex = bgfx::createTexture2D(
            static_cast<uint16_t>(width), static_cast<uint16_t>(height), false, 1,
            bgfx::TextureFormat::RGBA16F,
            BGFX_TEXTURE_RT | BGFX_SAMPLER_U_CLAMP | BGFX_SAMPLER_V_CLAMP);
        if (!bgfx::isValid(m_compositeColorTex)) {
            std::cerr << "[ily-engine] RGBA16F composite target creation failed" << std::endl;
        }

        if (bgfx::isValid(m_compositeColorTex)) {
            m_compositeFb = bgfx::createFrameBuffer(1, &m_compositeColorTex, false);
        }
        if (bgfx::isValid(m_offscreenColorTex)) {
            m_offscreenFb = bgfx::createFrameBuffer(1, &m_offscreenColorTex, false);
        }

        m_readbackTex = bgfx::createTexture2D(
            static_cast<uint16_t>(width), static_cast<uint16_t>(height), false, 1,
            bgfx::TextureFormat::RGBA8,
            BGFX_TEXTURE_BLIT_DST | BGFX_TEXTURE_READ_BACK);

        if (bgfx::isValid(m_compositeFb)) bgfx::setViewFrameBuffer(0, m_compositeFb);
        if (bgfx::isValid(m_offscreenFb)) bgfx::setViewFrameBuffer(1, m_offscreenFb);

        // Point the view at the replacement before retiring the previous
        // framebuffer. This prevents bgfx from submitting a frame against a
        // framebuffer whose external D3D11 allocation was already released.
        if (bgfx::isValid(previousCompositeFramebuffer)) bgfx::destroy(previousCompositeFramebuffer);
        if (bgfx::isValid(previousComposite)) bgfx::destroy(previousComposite);
        if (bgfx::isValid(previousFramebuffer)) bgfx::destroy(previousFramebuffer);
        if (bgfx::isValid(previousColor)) bgfx::destroy(previousColor);
        if (bgfx::isValid(previousReadback)) bgfx::destroy(previousReadback);

#ifdef _WIN32
        if (previousSharedOutputTexture) {
            bgfx::frame();
            bgfx::frame();
            if (previousSharedOutputHandle) CloseHandle(previousSharedOutputHandle);
            previousSharedOutputTexture->Release();
        }
#endif
    }

    void DestroyOffscreenTargets() {
        if (bgfx::isValid(m_compositeFb)) {
            bgfx::destroy(m_compositeFb);
            m_compositeFb = BGFX_INVALID_HANDLE;
        }
        if (bgfx::isValid(m_compositeColorTex)) {
            bgfx::destroy(m_compositeColorTex);
            m_compositeColorTex = BGFX_INVALID_HANDLE;
        }
        if (bgfx::isValid(m_offscreenFb)) {
            bgfx::destroy(m_offscreenFb);
            m_offscreenFb = BGFX_INVALID_HANDLE;
        }
        if (bgfx::isValid(m_offscreenColorTex)) {
            bgfx::destroy(m_offscreenColorTex);
            m_offscreenColorTex = BGFX_INVALID_HANDLE;
        }
        if (bgfx::isValid(m_readbackTex)) {
            bgfx::destroy(m_readbackTex);
            m_readbackTex = BGFX_INVALID_HANDLE;
        }
    }
};

struct SpriteVertex {
    float x, y, z;
    float u, v;
    uint32_t color;
};

static bgfx::VertexLayout s_spriteVertexLayout;
static bool s_layoutInitialized = false;

static void EnsureSpriteVertexLayout() {
    if (s_layoutInitialized) return;
    s_spriteVertexLayout.begin()
        .add(bgfx::Attrib::Position, 3, bgfx::AttribType::Float)
        .add(bgfx::Attrib::TexCoord0, 2, bgfx::AttribType::Float)
        .add(bgfx::Attrib::Color0, 4, bgfx::AttribType::Uint8, true)
        .end();
    s_layoutInitialized = true;
}

static float SrgbToLinear(float value) {
    value = std::max(0.0f, std::min(1.0f, value));
    return value <= 0.04045f
        ? value / 12.92f
        : std::pow((value + 0.055f) / 1.055f, 2.4f);
}

BgfxBackend::BgfxBackend() : m_impl(std::make_unique<Impl>()) {}

BgfxBackend::~BgfxBackend() {
    Shutdown();
}

IlyResult BgfxBackend::Initialize(const IlyEngineConfig& config) {
    ILY_PROFILE_SCOPE("BgfxBackend::Initialize");
    std::lock_guard<std::mutex> lock(m_impl->m_mutex);

    uint32_t width = config.width == 0 ? 1 : config.width;
    uint32_t height = config.height == 0 ? 1 : config.height;
    if (width > UINT16_MAX || height > UINT16_MAX) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }

    m_impl->m_width = width;
    m_impl->m_height = height;
    m_impl->m_debugStats = config.enableValidation;
    m_impl->m_outputColor = config.outputColor;

    if (m_impl->m_initialized) {
        bgfx::reset(width, height, BGFX_RESET_NONE);
        bgfx::setViewRect(0, 0, 0, static_cast<uint16_t>(width), static_cast<uint16_t>(height));
        bgfx::setViewRect(1, 0, 0, static_cast<uint16_t>(width), static_cast<uint16_t>(height));
        bgfx::setDebug(m_impl->m_debugStats ? BGFX_DEBUG_TEXT : BGFX_DEBUG_NONE);
        // Offscreen targets are sized to the surface, so recreate them on resize.
        m_impl->CreateOffscreenTargets(width, height);
        return bgfx::isValid(m_impl->m_compositeFb) && bgfx::isValid(m_impl->m_offscreenFb)
            ? ILY_SUCCESS
            : ILY_ERROR_RENDER_FAILED;
    }

#ifdef _WIN32
    if (!m_impl->m_dummyHwnd) {
        m_impl->m_dummyHwnd = create_dummy_window();
    }
#endif

    bgfx::Init init;
#if defined(_WIN32)
    init.type = bgfx::RendererType::Direct3D11;
    init.platformData.nwh = m_impl->m_dummyHwnd;
#elif defined(__APPLE__)
    init.type = bgfx::RendererType::Metal;
#else
    init.type = bgfx::RendererType::Direct3D11;
#endif
    init.resolution.width = width;
    init.resolution.height = height;
    // No vsync: this is an offscreen compositor surface and the render thread
    // paces frames itself (see Renderer::RenderThreadLoop). vsync here would
    // block bgfx::frame() and starve queued resource commands.
    init.resolution.reset = BGFX_RESET_NONE;

    if (!bgfx::init(init)) {
        return ILY_ERROR_INITIALIZATION_FAILED;
    }

    m_impl->m_initialized = true;

    const float defaultBackground = SrgbToLinear(30.0f / 255.0f);
    bgfx::setPaletteColor(0, defaultBackground, defaultBackground, defaultBackground, 1.0f);
    bgfx::setViewClear(0, BGFX_CLEAR_COLOR | BGFX_CLEAR_DEPTH, 1.0f, 0, 0);
    bgfx::setViewClear(1, BGFX_CLEAR_COLOR, 0x000000ff, 1.0f, 0);
    bgfx::setViewRect(0, 0, 0, width, height);
    bgfx::setViewRect(1, 0, 0, width, height);
    bgfx::setDebug(m_impl->m_debugStats ? BGFX_DEBUG_TEXT : BGFX_DEBUG_NONE);

    // Sampler uniform is shared by every quad draw; create it once here rather
    // than per-DrawQuad. Destroyed in Shutdown().
    m_impl->m_texColorSampler = bgfx::createUniform("s_texColor", bgfx::UniformType::Sampler);
    m_impl->m_sourceColorUniform = bgfx::createUniform("u_sourceColor", bgfx::UniformType::Vec4);
    m_impl->m_outputColorUniform = bgfx::createUniform("u_outputColor", bgfx::UniformType::Vec4);
    m_impl->m_chromaKeyUniform = bgfx::createUniform("u_chromaKey", bgfx::UniformType::Vec4);
    m_impl->m_chromaParamsUniform = bgfx::createUniform("u_chromaParams", bgfx::UniformType::Vec4);

    // Compile/load our textured quad sprite shader program
    m_impl->m_spriteProgram = CreateSpriteProgram();
    m_impl->m_outputProgram = CreateSdrOutputProgram();

    if (!bgfx::isValid(m_impl->m_spriteProgram) || !bgfx::isValid(m_impl->m_outputProgram)) {
        return ILY_ERROR_INITIALIZATION_FAILED;
    }

    // Render offscreen; view 0 targets this framebuffer instead of the window.
    m_impl->CreateOffscreenTargets(width, height);
    return bgfx::isValid(m_impl->m_compositeFb) && bgfx::isValid(m_impl->m_offscreenFb)
        ? ILY_SUCCESS
        : ILY_ERROR_RENDER_FAILED;
}

void BgfxBackend::Shutdown() {
    ILY_PROFILE_SCOPE("BgfxBackend::Shutdown");
    std::lock_guard<std::mutex> lock(m_impl->m_mutex);

    if (!m_impl->m_initialized) {
        return;
    }

    if (bgfx::isValid(m_impl->m_spriteProgram)) {
        bgfx::destroy(m_impl->m_spriteProgram);
        m_impl->m_spriteProgram = BGFX_INVALID_HANDLE;
    }

    if (bgfx::isValid(m_impl->m_outputProgram)) {
        bgfx::destroy(m_impl->m_outputProgram);
        m_impl->m_outputProgram = BGFX_INVALID_HANDLE;
    }

    if (bgfx::isValid(m_impl->m_texColorSampler)) {
        bgfx::destroy(m_impl->m_texColorSampler);
        m_impl->m_texColorSampler = BGFX_INVALID_HANDLE;
    }
    if (bgfx::isValid(m_impl->m_sourceColorUniform)) {
        bgfx::destroy(m_impl->m_sourceColorUniform);
        m_impl->m_sourceColorUniform = BGFX_INVALID_HANDLE;
    }
    if (bgfx::isValid(m_impl->m_outputColorUniform)) {
        bgfx::destroy(m_impl->m_outputColorUniform);
        m_impl->m_outputColorUniform = BGFX_INVALID_HANDLE;
    }
    if (bgfx::isValid(m_impl->m_chromaKeyUniform)) {
        bgfx::destroy(m_impl->m_chromaKeyUniform);
        m_impl->m_chromaKeyUniform = BGFX_INVALID_HANDLE;
    }
    if (bgfx::isValid(m_impl->m_chromaParamsUniform)) {
        bgfx::destroy(m_impl->m_chromaParamsUniform);
        m_impl->m_chromaParamsUniform = BGFX_INVALID_HANDLE;
    }

    m_impl->DestroyOffscreenTargets();

    m_impl->m_resourceManager.Clear();

    bgfx::shutdown();
    m_impl->m_initialized = false;

#ifdef _WIN32
    m_impl->ReleaseAllImportedSharedTextures();
    m_impl->ReleaseSharedOutputTexture();
    if (m_impl->m_dummyHwnd) {
        destroy_dummy_window(m_impl->m_dummyHwnd);
        m_impl->m_dummyHwnd = nullptr;
    }
#endif
}

IlyResult BgfxBackend::BeginFrame() {
    ILY_PROFILE_SCOPE("BgfxBackend::BeginFrame");
    m_impl->m_frameHasHdrSource = false;
    bgfx::setViewRect(0, 0, 0, static_cast<uint16_t>(m_impl->m_width), static_cast<uint16_t>(m_impl->m_height));
    bgfx::setViewRect(1, 0, 0, static_cast<uint16_t>(m_impl->m_width), static_cast<uint16_t>(m_impl->m_height));
    bgfx::touch(0);
    return ILY_SUCCESS;
}

IlyResult BgfxBackend::EndFrame() {
    ILY_PROFILE_SCOPE("BgfxBackend::EndFrame");

    EnsureSpriteVertexLayout();
    if (!bgfx::isValid(m_impl->m_compositeColorTex) ||
        !bgfx::isValid(m_impl->m_outputProgram) ||
        bgfx::getAvailTransientVertexBuffer(4, s_spriteVertexLayout) < 4 ||
        bgfx::getAvailTransientIndexBuffer(6) < 6) {
        bgfx::frame();
        return ILY_ERROR_RENDER_FAILED;
    }

    bgfx::TransientVertexBuffer outputVertices;
    bgfx::TransientIndexBuffer outputIndices;
    bgfx::allocTransientVertexBuffer(&outputVertices, 4, s_spriteVertexLayout);
    bgfx::allocTransientIndexBuffer(&outputIndices, 6);

    SpriteVertex* vertices = reinterpret_cast<SpriteVertex*>(outputVertices.data);
    vertices[0] = {-1.0f, 1.0f, 0.0f, 0.0f, 0.0f, 0xffffffff};
    vertices[1] = { 1.0f, 1.0f, 0.0f, 1.0f, 0.0f, 0xffffffff};
    vertices[2] = { 1.0f,-1.0f, 0.0f, 1.0f, 1.0f, 0xffffffff};
    vertices[3] = {-1.0f,-1.0f, 0.0f, 0.0f, 1.0f, 0xffffffff};
    uint16_t* indices = reinterpret_cast<uint16_t*>(outputIndices.data);
    indices[0] = 0;
    indices[1] = 1;
    indices[2] = 2;
    indices[3] = 0;
    indices[4] = 2;
    indices[5] = 3;

    const float outputParams[4] = {
        m_impl->m_outputColor.color.transfer == ILY_TRANSFER_BT709 ? 1.0f : 0.0f,
        m_impl->m_outputColor.sdrWhiteNits,
        m_impl->m_outputColor.hdrNominalPeakNits,
        m_impl->m_frameHasHdrSource ? 1.0f : 0.0f
    };
    bgfx::setUniform(m_impl->m_outputColorUniform, outputParams);
    bgfx::setTexture(0, m_impl->m_texColorSampler, m_impl->m_compositeColorTex);
    bgfx::setVertexBuffer(0, &outputVertices);
    bgfx::setIndexBuffer(&outputIndices);
    bgfx::setState(BGFX_STATE_WRITE_RGB | BGFX_STATE_WRITE_A);
    bgfx::submit(1, m_impl->m_outputProgram);

    if (m_impl->m_debugStats) {
        bgfx::dbgTextClear();
        const bgfx::Stats* stats = bgfx::getStats();
        double toMsCpu = 1000.0 / stats->cpuTimerFreq;
        double toMsGpu = stats->gpuTimerFreq > 0 ? 1000.0 / stats->gpuTimerFreq : 0.0;

        double cpuMs = double(stats->cpuTimeFrame) * toMsCpu;
        double gpuMs = double(stats->gpuTimeEnd - stats->gpuTimeBegin) * toMsGpu;
        double fps = cpuMs > 0.0 ? 1000.0 / cpuMs : 0.0;

        bgfx::dbgTextPrintf(1, 1, 0x0f, "GPU: %s", bgfx::getRendererName(bgfx::getRendererType()));
        bgfx::dbgTextPrintf(1, 2, 0x0f, "FPS: %.2f (CPU: %.2f ms, GPU: %.2f ms)", fps, cpuMs, gpuMs);
        bgfx::dbgTextPrintf(1, 3, 0x0f, "Draw Calls: %u", stats->numDraw);

        double gpuMemMb = double(stats->gpuMemoryUsed) / (1024.0 * 1024.0);
        double gpuMemMaxMb = double(stats->gpuMemoryMax) / (1024.0 * 1024.0);
        bgfx::dbgTextPrintf(1, 4, 0x0f, "GPU Mem: %.2f MB / %.2f MB", gpuMemMb, gpuMemMaxMb);
    }
    
    bgfx::frame();
    return ILY_SUCCESS;
}

void BgfxBackend::Clear(float r, float g, float b, float a) {
    ILY_PROFILE_SCOPE("BgfxBackend::Clear");
    bgfx::setPaletteColor(0, SrgbToLinear(r), SrgbToLinear(g), SrgbToLinear(b), a);
    bgfx::setViewClear(0, BGFX_CLEAR_COLOR | BGFX_CLEAR_DEPTH, 1.0f, 0, 0);
}

ResourceHandle BgfxBackend::CreateTexture(uint32_t width, uint32_t height, const void* data, uint32_t byteLength, bool isBGRA, const IlyColorDescription& colorDescription, IlyAlphaMode alphaMode) {
    ILY_PROFILE_SCOPE("BgfxBackend::CreateTexture");
    if (width == 0 || height == 0 || width > UINT16_MAX || height > UINT16_MAX) {
        return ILY_INVALID_HANDLE;
    }

    bgfx::TextureHandle handle = BGFX_INVALID_HANDLE;
    if (data) {
        const uint64_t required64 = static_cast<uint64_t>(width) * static_cast<uint64_t>(height) * 4;
        if (required64 > UINT32_MAX || byteLength < required64) {
            return ILY_INVALID_HANDLE;
        }
        const uint32_t required = static_cast<uint32_t>(required64);
        const uint64_t textureFlags = BGFX_SAMPLER_U_CLAMP | BGFX_SAMPLER_V_CLAMP |
            (colorDescription.transfer == ILY_TRANSFER_SRGB ? BGFX_TEXTURE_SRGB : BGFX_TEXTURE_NONE);
        handle = bgfx::createTexture2D(
            static_cast<uint16_t>(width),
            static_cast<uint16_t>(height),
            false,
            1,
            isBGRA ? bgfx::TextureFormat::BGRA8 : bgfx::TextureFormat::RGBA8,
            textureFlags,
            nullptr
        );
        if (bgfx::isValid(handle)) {
            const bgfx::Memory* mem = bgfx::copy(data, required);
            bgfx::updateTexture2D(handle, 0, 0, 0, 0,
                                  static_cast<uint16_t>(width),
                                  static_cast<uint16_t>(height),
                                  mem);
        }
    } else {
        const uint64_t textureFlags = BGFX_SAMPLER_U_CLAMP | BGFX_SAMPLER_V_CLAMP |
            (colorDescription.transfer == ILY_TRANSFER_SRGB ? BGFX_TEXTURE_SRGB : BGFX_TEXTURE_NONE);
        handle = bgfx::createTexture2D(
            static_cast<uint16_t>(width),
            static_cast<uint16_t>(height),
            false,
            1,
            isBGRA ? bgfx::TextureFormat::BGRA8 : bgfx::TextureFormat::RGBA8,
            textureFlags,
            nullptr
        );
    }

    if (!bgfx::isValid(handle)) {
        return ILY_INVALID_HANDLE;
    }

    std::lock_guard<std::mutex> lock(m_impl->m_mutex);
    auto texResource = std::make_shared<TextureResource>(width, height, isBGRA ? bgfx::TextureFormat::BGRA8 : bgfx::TextureFormat::RGBA8, handle, colorDescription, alphaMode);
    return m_impl->m_resourceManager.Create(ResourceType::Texture, texResource);
}

ResourceHandle BgfxBackend::CreateSharedTextureFromHandle(uint32_t width, uint32_t height, void* sharedHandle, IlyPixelFormat pixelFormat, const IlyColorDescription& colorDescription, IlyAlphaMode alphaMode, float sdrWhiteNits) {
    ILY_PROFILE_SCOPE("BgfxBackend::CreateSharedTextureFromHandle");
    if (width == 0 || height == 0 || width > UINT16_MAX || height > UINT16_MAX || !sharedHandle) {
        return ILY_INVALID_HANDLE;
    }

#ifdef _WIN32
    std::lock_guard<std::mutex> lock(m_impl->m_mutex);
    if (!m_impl->m_initialized || bgfx::getRendererType() != bgfx::RendererType::Direct3D11) {
        return ILY_INVALID_HANDLE;
    }

    const bgfx::InternalData* internalData = bgfx::getInternalData();
    if (!internalData || !internalData->context) {
        return ILY_INVALID_HANDLE;
    }

    ID3D11Device* device = static_cast<ID3D11Device*>(internalData->context);
    ID3D11Texture2D* importedTexture = nullptr;
    HRESULT hr = device->OpenSharedResource(
        static_cast<HANDLE>(sharedHandle),
        __uuidof(ID3D11Texture2D),
        reinterpret_cast<void**>(&importedTexture));
    if (FAILED(hr) || !importedTexture) {
        return ILY_INVALID_HANDLE;
    }

    bgfx::TextureFormat::Enum bgfxFormat = bgfx::TextureFormat::BGRA8;
    if (pixelFormat == ILY_PIXEL_FORMAT_RGBA16F) bgfxFormat = bgfx::TextureFormat::RGBA16F;
    if (pixelFormat == ILY_PIXEL_FORMAT_R10G10B10A2) bgfxFormat = bgfx::TextureFormat::RGB10A2;
    if (pixelFormat != ILY_PIXEL_FORMAT_BGRA8 &&
        pixelFormat != ILY_PIXEL_FORMAT_RGBA16F &&
        pixelFormat != ILY_PIXEL_FORMAT_R10G10B10A2) {
        importedTexture->Release();
        return ILY_INVALID_HANDLE;
    }

    bgfx::TextureHandle handle = bgfx::createTexture2D(
        static_cast<uint16_t>(width),
        static_cast<uint16_t>(height),
        false,
        1,
        bgfxFormat,
        BGFX_SAMPLER_U_CLAMP | BGFX_SAMPLER_V_CLAMP |
            (colorDescription.transfer == ILY_TRANSFER_SRGB ? BGFX_TEXTURE_SRGB : BGFX_TEXTURE_NONE),
        nullptr);

    if (!bgfx::isValid(handle)) {
        importedTexture->Release();
        return ILY_INVALID_HANDLE;
    }

    bgfx::frame();
    bgfx::frame();
    if (bgfx::overrideInternal(handle, reinterpret_cast<uintptr_t>(importedTexture)) == 0) {
        bgfx::destroy(handle);
        importedTexture->Release();
        return ILY_INVALID_HANDLE;
    }

    auto texResource = std::make_shared<TextureResource>(width, height, bgfxFormat, handle, colorDescription, alphaMode, sdrWhiteNits);
    ResourceHandle resourceHandle = m_impl->m_resourceManager.Create(ResourceType::Texture, texResource);
    m_impl->m_importedSharedTextures[resourceHandle] = importedTexture;
    return resourceHandle;
#else
    return ILY_INVALID_HANDLE;
#endif
}

void BgfxBackend::DestroyTexture(ResourceHandle handle) {
    ILY_PROFILE_SCOPE("BgfxBackend::DestroyTexture");
    std::lock_guard<std::mutex> lock(m_impl->m_mutex);
    bool destroyed = m_impl->m_resourceManager.Destroy(handle);
#ifdef _WIN32
    if (destroyed) {
        m_impl->ReleaseImportedSharedTexture(handle);
    }
#endif
}

IlyResult BgfxBackend::UpdateTexture(ResourceHandle handle, const void* data, uint32_t byteLength, bool isBGRA) {
    ILY_PROFILE_SCOPE("BgfxBackend::UpdateTexture");
    if (!data) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
    std::lock_guard<std::mutex> lock(m_impl->m_mutex);
    auto tex = m_impl->m_resourceManager.GetAs<TextureResource>(handle);
    if (!tex) {
        return ILY_ERROR_NOT_FOUND;
    }

    const uint64_t required64 = static_cast<uint64_t>(tex->GetWidth()) * static_cast<uint64_t>(tex->GetHeight()) * 4;
    if (required64 > UINT32_MAX || byteLength < required64) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }

    const uint32_t required = static_cast<uint32_t>(required64);
    const bgfx::Memory* mem = bgfx::copy(data, required);
    bgfx::updateTexture2D(tex->GetHandle(), 0, 0, 0, 0, 
                          static_cast<uint16_t>(tex->GetWidth()), 
                          static_cast<uint16_t>(tex->GetHeight()), 
                          mem);
    return ILY_SUCCESS;
}

IlyResult BgfxBackend::DrawQuad(ResourceHandle textureHandle, const IlyTransform& transform, float opacity, IlyBlendMode blendMode, const IlyChromaKey* chroma) {
    ILY_PROFILE_SCOPE("BgfxBackend::DrawQuad");
    if (!transform.visibility || transform.opacity <= 0.0f || opacity <= 0.0f) {
        return ILY_SUCCESS;
    }
    
    std::lock_guard<std::mutex> lock(m_impl->m_mutex);
    if (!m_impl->m_initialized) {
        return ILY_ERROR_INITIALIZATION_FAILED;
    }

    auto tex = m_impl->m_resourceManager.GetAs<TextureResource>(textureHandle);
    if (!tex) {
        return ILY_ERROR_NOT_FOUND;
    }

    EnsureSpriteVertexLayout();

    // Check transient buffers availability
    if (bgfx::getAvailTransientVertexBuffer(4, s_spriteVertexLayout) < 4 ||
        bgfx::getAvailTransientIndexBuffer(6) < 6) {
        return ILY_ERROR_RENDER_FAILED;
    }

    bgfx::TransientVertexBuffer tvb;
    bgfx::allocTransientVertexBuffer(&tvb, 4, s_spriteVertexLayout);

    bgfx::TransientIndexBuffer tib;
    bgfx::allocTransientIndexBuffer(&tib, 6);

    // Fill vertices
    float texWidth = static_cast<float>(tex->GetWidth());
    float texHeight = static_cast<float>(tex->GetHeight());

    float u0 = transform.crop.left;
    float v0 = transform.crop.top;
    float u1 = transform.crop.right == 0.0f ? 1.0f : transform.crop.right;
    float v1 = transform.crop.bottom == 0.0f ? 1.0f : transform.crop.bottom;

    float width = texWidth * (u1 - u0);
    float height = texHeight * (v1 - v0);

    float localPts[4][2] = {
        { 0.0f, 0.0f },
        { width, 0.0f },
        { width, height },
        { 0.0f, height }
    };

    float pivotX = transform.pivot.x * width;
    float pivotY = transform.pivot.y * height;

    float anchorX = transform.anchor.x * width;
    float anchorY = transform.anchor.y * height;

    float rad = transform.rotation.z * 3.14159265f / 180.0f;
    float cosR = std::cos(rad);
    float sinR = std::sin(rad);

    float viewWidth = static_cast<float>(m_impl->m_width);
    float viewHeight = static_cast<float>(m_impl->m_height);

    // Compute vertex color: tint with overall opacity
    float finalOpacity = transform.opacity * opacity;
    if (finalOpacity < 0.0f) finalOpacity = 0.0f;
    if (finalOpacity > 1.0f) finalOpacity = 1.0f;
    uint8_t alphaByte = static_cast<uint8_t>(finalOpacity * 255.0f);
    uint32_t color = (alphaByte << 24) | 0x00FFFFFF; // ABGR format (bgfx uses ABGR on DirectX)

    SpriteVertex* verts = reinterpret_cast<SpriteVertex*>(tvb.data);
    
    // UV corners
    float uvs[4][2] = {
        { u0, v0 },
        { u1, v0 },
        { u1, v1 },
        { u0, v1 }
    };

    for (int i = 0; i < 4; ++i) {
        // Offset by pivot and anchor
        float lx = localPts[i][0] - pivotX - anchorX;
        float ly = localPts[i][1] - pivotY - anchorY;

        // Scale
        lx *= transform.scale.x;
        ly *= transform.scale.y;

        // Rotate
        float rx = lx * cosR - ly * sinR;
        float ry = lx * sinR + ly * cosR;

        // Translate
        float sx = rx + transform.position.x;
        float sy = ry + transform.position.y;

        // Screen space to NDC
        float ndcX = (sx / viewWidth) * 2.0f - 1.0f;
        float ndcY = 1.0f - (sy / viewHeight) * 2.0f;

        verts[i].x = ndcX;
        verts[i].y = ndcY;
        verts[i].z = transform.position.z;
        verts[i].u = uvs[i][0];
        verts[i].v = uvs[i][1];
        verts[i].color = color;
    }

    // Fill indices: 2 triangles
    uint16_t* indices = reinterpret_cast<uint16_t*>(tib.data);
    indices[0] = 0;
    indices[1] = 1;
    indices[2] = 2;
    indices[3] = 0;
    indices[4] = 2;
    indices[5] = 3;

    // Set state
    uint64_t state = BGFX_STATE_WRITE_RGB | BGFX_STATE_WRITE_A | BGFX_STATE_MSAA;
    
    switch (blendMode) {
        case ILY_BLEND_NORMAL:
        case ILY_BLEND_ALPHA:
            state |= BGFX_STATE_BLEND_FUNC_SEPARATE(
                BGFX_STATE_BLEND_ONE,
                BGFX_STATE_BLEND_INV_SRC_ALPHA,
                BGFX_STATE_BLEND_ONE,
                BGFX_STATE_BLEND_INV_SRC_ALPHA);
            break;
        case ILY_BLEND_ADD:
            state |= BGFX_STATE_BLEND_FUNC_SEPARATE(
                BGFX_STATE_BLEND_ONE,
                BGFX_STATE_BLEND_ONE,
                BGFX_STATE_BLEND_ONE,
                BGFX_STATE_BLEND_INV_SRC_ALPHA);
            break;
        case ILY_BLEND_MULTIPLY:
            state |= BGFX_STATE_BLEND_FUNC_SEPARATE(
                BGFX_STATE_BLEND_DST_COLOR,
                BGFX_STATE_BLEND_INV_SRC_ALPHA,
                BGFX_STATE_BLEND_ONE,
                BGFX_STATE_BLEND_INV_SRC_ALPHA);
            break;
        case ILY_BLEND_SCREEN:
            state |= BGFX_STATE_BLEND_FUNC_SEPARATE(
                BGFX_STATE_BLEND_ONE,
                BGFX_STATE_BLEND_INV_SRC_COLOR,
                BGFX_STATE_BLEND_ONE,
                BGFX_STATE_BLEND_INV_SRC_ALPHA);
            break;
        default:
            state |= BGFX_STATE_BLEND_NORMAL;
            break;
    }

    bgfx::setState(state);

    float transferMode = 0.0f;
    const IlyColorDescription& sourceColor = tex->GetColorDescription();
    if (sourceColor.transfer == ILY_TRANSFER_BT709) transferMode = 1.0f;
    if (sourceColor.transfer == ILY_TRANSFER_PQ) transferMode = 2.0f;
    if (sourceColor.transfer == ILY_TRANSFER_HLG) transferMode = 3.0f;
    float sourceScale = 1.0f;
    if (sourceColor.transfer == ILY_TRANSFER_PQ) {
        sourceScale = 10000.0f / std::max(1.0f, m_impl->m_outputColor.sdrWhiteNits);
    } else if (sourceColor.transfer == ILY_TRANSFER_HLG) {
        sourceScale = m_impl->m_outputColor.hdrNominalPeakNits /
            std::max(1.0f, m_impl->m_outputColor.sdrWhiteNits);
    } else if (sourceColor.transfer == ILY_TRANSFER_LINEAR &&
               tex->GetFormat() == bgfx::TextureFormat::RGBA16F) {
        const float sourceSdrWhiteNits = tex->GetSdrWhiteNits();
        sourceScale = sourceSdrWhiteNits > 0.0f
            ? 80.0f / sourceSdrWhiteNits
            : 80.0f / std::max(1.0f, m_impl->m_outputColor.sdrWhiteNits);
    }
    const bool hdrSource = sourceColor.transfer == ILY_TRANSFER_PQ ||
        sourceColor.transfer == ILY_TRANSFER_HLG ||
        (sourceColor.transfer == ILY_TRANSFER_LINEAR && tex->GetFormat() == bgfx::TextureFormat::RGBA16F);
    m_impl->m_frameHasHdrSource = m_impl->m_frameHasHdrSource || hdrSource;
    const float sourceParams[4] = {
        transferMode,
        sourceColor.primaries == ILY_COLOR_PRIMARIES_BT2020 ? 1.0f : 0.0f,
        static_cast<float>(tex->GetAlphaMode()),
        sourceScale
    };
    bgfx::setUniform(m_impl->m_sourceColorUniform, sourceParams);

    const bool chromaEnabled = chroma && chroma->enabled;
    const float chromaKeyParams[4] = {
        chromaEnabled ? chroma->keyR : 0.0f,
        chromaEnabled ? chroma->keyG : 0.0f,
        chromaEnabled ? chroma->keyB : 0.0f,
        chromaEnabled ? chroma->similarity : 0.0f
    };
    const float chromaBandParams[4] = {
        chromaEnabled ? chroma->smoothness : 0.0f,
        chromaEnabled ? chroma->spill : 0.0f,
        chromaEnabled ? 1.0f : 0.0f,
        0.0f
    };
    bgfx::setUniform(m_impl->m_chromaKeyUniform, chromaKeyParams);
    bgfx::setUniform(m_impl->m_chromaParamsUniform, chromaBandParams);

    // Bind texture using the shared, pre-created sampler uniform.
    bgfx::setTexture(0, m_impl->m_texColorSampler, tex->GetHandle());

    // Submit transient buffers
    bgfx::setVertexBuffer(0, &tvb);
    bgfx::setIndexBuffer(&tib);

    // Submit draw call
    bgfx::submit(0, m_impl->m_spriteProgram);

    return ILY_SUCCESS;
}

BgfxBackend::RendererCapabilities BgfxBackend::capabilities() const {
    std::lock_guard<std::mutex> lock(m_impl->m_mutex);
    RendererCapabilities caps{};
    caps.supportsNPOT = true;
    caps.supportsRenderToTexture = true;
    caps.maxTextureSize = 8192;
    std::strncpy(caps.apiName, bgfx::getRendererName(bgfx::getRendererType()), sizeof(caps.apiName) - 1);
    return caps;
}

IlyRendererCapabilities BgfxBackend::GetCapabilities() const {
    return capabilities();
}

ResourceManager& BgfxBackend::GetResourceManager() {
    return m_impl->m_resourceManager;
}

void BgfxBackend::SetActiveSpriteProgram(ResourceHandle programHandle) {
    auto shader = m_impl->m_resourceManager.GetAs<ShaderResource>(programHandle);
    if (shader) {
        m_impl->m_spriteProgram = shader->GetProgram();
    }
}

ResourceHandle BgfxBackend::CreateSpriteProgramHandle() {
    std::lock_guard<std::mutex> lock(m_impl->m_mutex);
    bgfx::ProgramHandle program = CreateSpriteProgram();
    if (!bgfx::isValid(program)) {
        return ILY_INVALID_HANDLE;
    }
    auto shaderRes = std::make_shared<ShaderResource>(program);
    ResourceHandle handle = m_impl->m_resourceManager.Create(ResourceType::Shader, shaderRes);
    m_impl->m_spriteProgram = program;
    return handle;
}

IlyResult BgfxBackend::GetSharedOutputTexture(void** outHandle, uint32_t* outWidth, uint32_t* outHeight) {
    ILY_PROFILE_SCOPE("BgfxBackend::GetSharedOutputTexture");
    if (!outHandle) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }

    std::lock_guard<std::mutex> lock(m_impl->m_mutex);
    if (!m_impl->m_initialized) {
        return ILY_ERROR_INITIALIZATION_FAILED;
    }

#ifdef _WIN32
    if (!m_impl->m_sharedOutputHandle) {
        return ILY_ERROR_NOT_SUPPORTED;
    }
    *outHandle = m_impl->m_sharedOutputHandle;
    if (outWidth) *outWidth = m_impl->m_width;
    if (outHeight) *outHeight = m_impl->m_height;
    return ILY_SUCCESS;
#else
    (void)outWidth;
    (void)outHeight;
    return ILY_ERROR_NOT_SUPPORTED;
#endif
}

IlyResult BgfxBackend::ReadPixels(void* dst, uint32_t dstSize, uint32_t* outWidth, uint32_t* outHeight) {
    ILY_PROFILE_SCOPE("BgfxBackend::ReadPixels");
    std::lock_guard<std::mutex> lock(m_impl->m_mutex);

    if (!m_impl->m_initialized) {
        return ILY_ERROR_INITIALIZATION_FAILED;
    }
    if (!dst) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }

    const uint32_t width = m_impl->m_width;
    const uint32_t height = m_impl->m_height;
    if (outWidth) *outWidth = width;
    if (outHeight) *outHeight = height;

    const uint64_t required64 = static_cast<uint64_t>(width) * static_cast<uint64_t>(height) * 4;
    if (required64 > UINT32_MAX) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
    const uint32_t required = static_cast<uint32_t>(required64);
    if (dstSize < required) {
        return ILY_ERROR_OUT_OF_MEMORY;
    }

    const bgfx::Caps* caps = bgfx::getCaps();
    if (!(caps->supported & BGFX_CAPS_TEXTURE_BLIT) ||
        !(caps->supported & BGFX_CAPS_TEXTURE_READ_BACK)) {
        return ILY_ERROR_NOT_SUPPORTED;
    }
    if (!bgfx::isValid(m_impl->m_offscreenColorTex) || !bgfx::isValid(m_impl->m_readbackTex)) {
        return ILY_ERROR_INITIALIZATION_FAILED;
    }

    // Copy the offscreen color target into the CPU-readable texture, then read
    // it back. readTexture reports the frame at which dst will be populated;
    // pump frames (bounded) until we reach it.
    const bgfx::ViewId kBlitView = 2;
    bgfx::blit(kBlitView, m_impl->m_readbackTex, 0, 0, m_impl->m_offscreenColorTex);
    const uint32_t frameAvailable = bgfx::readTexture(m_impl->m_readbackTex, dst);

    uint32_t current = bgfx::frame();
    for (int i = 0; i < 8 && current < frameAvailable; ++i) {
        current = bgfx::frame();
    }
    if (current < frameAvailable) {
        return ILY_ERROR_RENDER_FAILED;
    }
    return ILY_SUCCESS;
}

} // namespace ily
