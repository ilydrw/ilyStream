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
#include <vector>

#ifdef _WIN32
#include <d3d11.h>
#include <d3d11_1.h>
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

// Views execute in ascending id order each frame: blur pre-passes first (a
// 3-view chain per blurred layer), then the composite, the SDR output encode,
// and finally the readback blit. Each output owns one such block, so output 0
// keeps the original ids (blur 0-23, composite 24, output 25, blit 26) and any
// further output follows in its own range.
static constexpr uint16_t kViewBlurCount = 24; // up to 8 blurred layers per frame
static constexpr uint16_t kViewsPerOutput = kViewBlurCount + 3;
// bgfx's default view budget; outputs are refused rather than allowed to
// collide with another output's view block.
static constexpr uint16_t kMaxViews = 256;

namespace {

// One sprite-shader draw into an arbitrary view/target. The normal composite
// draw and the blur pipeline's stage passes all go through SubmitSpriteDraw
// with one of these.
struct SpriteDrawParams {
    uint16_t viewId = 0;
    float targetWidth = 0.0f;
    float targetHeight = 0.0f;
    bgfx::TextureHandle texture = BGFX_INVALID_HANDLE;
    float texWidth = 0.0f;
    float texHeight = 0.0f;
    IlyTransform transform{};
    float opacity = 1.0f;
    IlyBlendMode blendMode = ILY_BLEND_ALPHA;
    bool blendEnabled = true;
    const IlyChromaKey* chroma = nullptr;
    const IlyColorAdjust* colorAdjust = nullptr;
    float cornerRadius = 0.0f;
    const IlyCircleMask* circleMask = nullptr;
    bgfx::TextureHandle maskTexture = BGFX_INVALID_HANDLE;
    float maskTransform[4] = {0.0f, 0.0f, 1.0f, 1.0f};
    float sourceParams[4] = {0.0f, 0.0f, 0.0f, 1.0f};
    bool encodeSrgbOutput = false;
};

} // namespace

struct BgfxBackend::Impl {
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
    // Per-draw color adjust: u_colorMatR/G/B = one 3x4 matrix row each
    // (mR, mG, mB, offset), u_colorAdjust = (enabled, alphaMul, unused, unused).
    bgfx::UniformHandle m_colorMatRUniform = BGFX_INVALID_HANDLE;
    bgfx::UniformHandle m_colorMatGUniform = BGFX_INVALID_HANDLE;
    bgfx::UniformHandle m_colorMatBUniform = BGFX_INVALID_HANDLE;
    bgfx::UniformHandle m_colorAdjustUniform = BGFX_INVALID_HANDLE;
    // Per-draw rounded corners: u_cornerRadius = (radiusPx, quadWpx, quadHpx,
    // enabled), u_cornerRect = the quad's texcoord bounds (u0, v0, u1, v1) so
    // the shader can recover quad-local UVs from v_texcoord0 under crop.
    bgfx::UniformHandle m_cornerRadiusUniform = BGFX_INVALID_HANDLE;
    bgfx::UniformHandle m_cornerRectUniform = BGFX_INVALID_HANDLE;
    bgfx::UniformHandle m_circleMaskUniform = BGFX_INVALID_HANDLE;
    // Per-draw image mask: s_maskTex (slot 1) sampled in quad-local UV, its
    // alpha multiplied into the layer. u_maskParams = (enabled, 0, 0, 0).
    bgfx::UniformHandle m_maskSampler = BGFX_INVALID_HANDLE;
    bgfx::UniformHandle m_maskParamsUniform = BGFX_INVALID_HANDLE;
    // Maps quad UV -> layout-rect UV for letterboxed fits (offset.xy, scale.zw).
    bgfx::UniformHandle m_maskTransformUniform = BGFX_INVALID_HANDLE;
    // Blur pipeline: separable Gaussian over pooled padded intermediates.
    // u_blurParams = (stepU, stepV, 0, 0), u_blurWeights = 13 kernel weights.
    bgfx::ProgramHandle m_blurProgram = BGFX_INVALID_HANDLE;
    bgfx::UniformHandle m_blurParamsUniform = BGFX_INVALID_HANDLE;
    bgfx::UniformHandle m_blurWeightsUniform = BGFX_INVALID_HANDLE;

    // Pooled ping/pong RGBA16F targets for blur chains, reused across frames
    // and evicted after sitting unused for a while.
    struct BlurTarget {
        uint32_t width = 0;
        uint32_t height = 0;
        bgfx::FrameBufferHandle fbA = BGFX_INVALID_HANDLE;
        bgfx::TextureHandle texA = BGFX_INVALID_HANDLE;
        bgfx::FrameBufferHandle fbB = BGFX_INVALID_HANDLE;
        bgfx::TextureHandle texB = BGFX_INVALID_HANDLE;
        uint64_t lastUsedFrame = 0;
        bool usedThisFrame = false;
    };
    std::vector<BlurTarget> m_blurTargets;
    uint64_t m_frameIndex = 0;

    BlurTarget* AcquireBlurTarget(uint32_t width, uint32_t height);
    void EvictStaleBlurTargets();
    void DestroyBlurTargets();
    IlyResult SubmitSpriteDraw(const SpriteDrawParams& params);
    void SubmitBlurPass(uint16_t viewId, bgfx::TextureHandle sourceTex, uint32_t width, uint32_t height, bool horizontal, float sigma);
    IlyOutputColorConfig m_outputColor = IlyDefaultSdrOutputColor();

    // View 0 composites into a linear RGBA16F working surface. View 1 encodes
    // that surface into the RGBA8 presentation texture shared with Electron.
    // Readback always copies the presentation texture, never the linear target.
    // Everything that is per-OUTPUT rather than per-engine. One instance today
    // (the program output); the surrounding code addresses it only through
    // Out(), so adding further outputs is a matter of growing m_outputs.
    struct OutputTarget {
        // Index doubles as the caller-facing output id, so a destroyed output
        // keeps its slot rather than shifting the ones after it.
        bool valid = true;
        uint32_t width = 1280;
        uint32_t height = 720;
        bgfx::TextureHandle compositeColorTex = BGFX_INVALID_HANDLE;
        bgfx::FrameBufferHandle compositeFb = BGFX_INVALID_HANDLE;
        bgfx::TextureHandle offscreenColorTex = BGFX_INVALID_HANDLE;
        bgfx::FrameBufferHandle offscreenFb = BGFX_INVALID_HANDLE;
        bgfx::TextureHandle readbackTex = BGFX_INVALID_HANDLE;
        uint16_t nextBlurView = 0;
        uint16_t viewBlurBase = 0;
        uint16_t viewComposite = kViewBlurCount;
        uint16_t viewOutput = kViewBlurCount + 1;
        uint16_t viewBlit = kViewBlurCount + 2;
#ifdef _WIN32
        ID3D11Texture2D* sharedOutputTexture = nullptr;
        HANDLE sharedOutputHandle = nullptr;
#endif

        void AssignViews(size_t index) {
            const uint16_t base = static_cast<uint16_t>(index * kViewsPerOutput);
            viewBlurBase = base;
            viewComposite = static_cast<uint16_t>(base + kViewBlurCount);
            viewOutput = static_cast<uint16_t>(viewComposite + 1);
            viewBlit = static_cast<uint16_t>(viewOutput + 1);
        }
    };

    std::vector<OutputTarget> m_outputs{OutputTarget{}};
    size_t m_activeOutput = 0;
    OutputTarget& Out() { return m_outputs[m_activeOutput]; }
    const OutputTarget& Out() const { return m_outputs[m_activeOutput]; }

    mutable std::mutex m_mutex;
    bool m_initialized = false;
    // Adapter bgfx actually picked, captured at init (packed LUID). Native
    // capture sources must create their D3D11 device on THIS adapter or their
    // shared textures silently never propagate into the compositor.
    uint64_t m_adapterLuid = 0;
    bool m_adapterLuidValid = false;
    bool m_debugStats = false;
    bool m_frameHasHdrSource = false;

#ifdef _WIN32
    HWND m_dummyHwnd = nullptr;
    std::unordered_map<ResourceHandle, ID3D11Texture2D*> m_importedSharedTextures;

    void ReleaseSharedOutputTexture() {
        for (auto& target : m_outputs) {
            if (target.sharedOutputHandle) {
                CloseHandle(target.sharedOutputHandle);
                target.sharedOutputHandle = nullptr;
            }
            if (target.sharedOutputTexture) {
                target.sharedOutputTexture->Release();
                target.sharedOutputTexture = nullptr;
            }
        }
    }

    bool CreateSharedOutputTexture(OutputTarget& target, uint32_t width, uint32_t height) {
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

        target.offscreenColorTex = textureHandle;
        target.sharedOutputTexture = outputTexture;
        target.sharedOutputHandle = outputHandle;
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
    void CreateOffscreenTargets(OutputTarget& target, uint32_t width, uint32_t height) {
        const bgfx::TextureHandle previousComposite = target.compositeColorTex;
        const bgfx::FrameBufferHandle previousCompositeFramebuffer = target.compositeFb;
        const bgfx::TextureHandle previousColor = target.offscreenColorTex;
        const bgfx::FrameBufferHandle previousFramebuffer = target.offscreenFb;
        const bgfx::TextureHandle previousReadback = target.readbackTex;
        target.width = width;
        target.height = height;
        target.compositeColorTex = BGFX_INVALID_HANDLE;
        target.compositeFb = BGFX_INVALID_HANDLE;
        target.offscreenColorTex = BGFX_INVALID_HANDLE;
        target.offscreenFb = BGFX_INVALID_HANDLE;
        target.readbackTex = BGFX_INVALID_HANDLE;

#ifdef _WIN32
        ID3D11Texture2D* previousSharedOutputTexture = target.sharedOutputTexture;
        HANDLE previousSharedOutputHandle = target.sharedOutputHandle;
        target.sharedOutputTexture = nullptr;
        target.sharedOutputHandle = nullptr;
        CreateSharedOutputTexture(target, width, height);
#endif

        // Preserve the normal offscreen target as a portable fallback when the
        // native shared texture path is unsupported by the backend or driver.
        if (!bgfx::isValid(target.offscreenColorTex)) {
            target.offscreenColorTex = bgfx::createTexture2D(
                static_cast<uint16_t>(width), static_cast<uint16_t>(height), false, 1,
                bgfx::TextureFormat::RGBA8,
                BGFX_TEXTURE_RT | BGFX_SAMPLER_U_CLAMP | BGFX_SAMPLER_V_CLAMP);
        }

        target.compositeColorTex = bgfx::createTexture2D(
            static_cast<uint16_t>(width), static_cast<uint16_t>(height), false, 1,
            bgfx::TextureFormat::RGBA16F,
            BGFX_TEXTURE_RT | BGFX_SAMPLER_U_CLAMP | BGFX_SAMPLER_V_CLAMP);
        if (!bgfx::isValid(target.compositeColorTex)) {
            std::cerr << "[ily-engine] RGBA16F composite target creation failed" << std::endl;
        }

        if (bgfx::isValid(target.compositeColorTex)) {
            target.compositeFb = bgfx::createFrameBuffer(1, &target.compositeColorTex, false);
        }
        if (bgfx::isValid(target.offscreenColorTex)) {
            target.offscreenFb = bgfx::createFrameBuffer(1, &target.offscreenColorTex, false);
        }

        target.readbackTex = bgfx::createTexture2D(
            static_cast<uint16_t>(width), static_cast<uint16_t>(height), false, 1,
            bgfx::TextureFormat::RGBA8,
            BGFX_TEXTURE_BLIT_DST | BGFX_TEXTURE_READ_BACK);

        if (bgfx::isValid(target.compositeFb)) bgfx::setViewFrameBuffer(target.viewComposite, target.compositeFb);
        if (bgfx::isValid(target.offscreenFb)) bgfx::setViewFrameBuffer(target.viewOutput, target.offscreenFb);

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

    void DestroyOutputTarget(OutputTarget& target) {
#ifdef _WIN32
        if (target.sharedOutputHandle) {
            CloseHandle(target.sharedOutputHandle);
            target.sharedOutputHandle = nullptr;
        }
        if (target.sharedOutputTexture) {
            target.sharedOutputTexture->Release();
            target.sharedOutputTexture = nullptr;
        }
#endif
        if (bgfx::isValid(target.compositeFb)) {
            bgfx::destroy(target.compositeFb);
            target.compositeFb = BGFX_INVALID_HANDLE;
        }
        if (bgfx::isValid(target.compositeColorTex)) {
            bgfx::destroy(target.compositeColorTex);
            target.compositeColorTex = BGFX_INVALID_HANDLE;
        }
        if (bgfx::isValid(target.offscreenFb)) {
            bgfx::destroy(target.offscreenFb);
            target.offscreenFb = BGFX_INVALID_HANDLE;
        }
        if (bgfx::isValid(target.offscreenColorTex)) {
            bgfx::destroy(target.offscreenColorTex);
            target.offscreenColorTex = BGFX_INVALID_HANDLE;
        }
        if (bgfx::isValid(target.readbackTex)) {
            bgfx::destroy(target.readbackTex);
            target.readbackTex = BGFX_INVALID_HANDLE;
        }
        target.valid = false;
    }

    void DestroyOffscreenTargets() {
        for (auto& target : m_outputs) {
            if (bgfx::isValid(target.compositeFb)) {
                bgfx::destroy(target.compositeFb);
                target.compositeFb = BGFX_INVALID_HANDLE;
            }
            if (bgfx::isValid(target.compositeColorTex)) {
                bgfx::destroy(target.compositeColorTex);
                target.compositeColorTex = BGFX_INVALID_HANDLE;
            }
            if (bgfx::isValid(target.offscreenFb)) {
                bgfx::destroy(target.offscreenFb);
                target.offscreenFb = BGFX_INVALID_HANDLE;
            }
            if (bgfx::isValid(target.offscreenColorTex)) {
                bgfx::destroy(target.offscreenColorTex);
                target.offscreenColorTex = BGFX_INVALID_HANDLE;
            }
            if (bgfx::isValid(target.readbackTex)) {
                bgfx::destroy(target.readbackTex);
                target.readbackTex = BGFX_INVALID_HANDLE;
            }
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

    m_impl->m_activeOutput = 0;
    m_impl->Out().AssignViews(0);
    m_impl->Out().width = width;
    m_impl->Out().height = height;
    m_impl->m_debugStats = config.enableValidation;
    m_impl->m_outputColor = config.outputColor;

    if (m_impl->m_initialized) {
        bgfx::reset(width, height, BGFX_RESET_NONE);
        bgfx::setViewRect(m_impl->Out().viewComposite, 0, 0, static_cast<uint16_t>(width), static_cast<uint16_t>(height));
        bgfx::setViewRect(m_impl->Out().viewOutput, 0, 0, static_cast<uint16_t>(width), static_cast<uint16_t>(height));
        bgfx::setDebug(m_impl->m_debugStats ? BGFX_DEBUG_TEXT : BGFX_DEBUG_NONE);
        // Offscreen targets are sized to the surface, so recreate them on resize.
        m_impl->CreateOffscreenTargets(m_impl->Out(), width, height);
        return bgfx::isValid(m_impl->Out().compositeFb) && bgfx::isValid(m_impl->Out().offscreenFb)
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

#if defined(_WIN32)
    // Record which adapter bgfx bound to, while we are on the render thread.
    if (const bgfx::InternalData* internalData = bgfx::getInternalData()) {
        if (internalData->context) {
            IDXGIDevice* dxgiDevice = nullptr;
            if (SUCCEEDED(static_cast<ID3D11Device*>(internalData->context)
                    ->QueryInterface(__uuidof(IDXGIDevice),
                                     reinterpret_cast<void**>(&dxgiDevice)))
                && dxgiDevice) {
                IDXGIAdapter* adapter = nullptr;
                if (SUCCEEDED(dxgiDevice->GetAdapter(&adapter)) && adapter) {
                    DXGI_ADAPTER_DESC adapterDesc{};
                    if (SUCCEEDED(adapter->GetDesc(&adapterDesc))) {
                        m_impl->m_adapterLuid =
                            (static_cast<uint64_t>(
                                 static_cast<uint32_t>(adapterDesc.AdapterLuid.HighPart)) << 32)
                            | static_cast<uint64_t>(adapterDesc.AdapterLuid.LowPart);
                        m_impl->m_adapterLuidValid = true;
                    }
                    adapter->Release();
                }
                dxgiDevice->Release();
            }
        }
    }
#endif

    const float defaultBackground = SrgbToLinear(30.0f / 255.0f);
    bgfx::setPaletteColor(0, defaultBackground, defaultBackground, defaultBackground, 1.0f);
    bgfx::setViewClear(m_impl->Out().viewComposite, BGFX_CLEAR_COLOR | BGFX_CLEAR_DEPTH, 1.0f, 0, 0);
    bgfx::setViewClear(m_impl->Out().viewOutput, BGFX_CLEAR_COLOR, 0x000000ff, 1.0f, 0);
    bgfx::setViewRect(m_impl->Out().viewComposite, 0, 0, width, height);
    bgfx::setViewRect(m_impl->Out().viewOutput, 0, 0, width, height);
    bgfx::setDebug(m_impl->m_debugStats ? BGFX_DEBUG_TEXT : BGFX_DEBUG_NONE);

    // Sampler uniform is shared by every quad draw; create it once here rather
    // than per-DrawQuad. Destroyed in Shutdown().
    m_impl->m_texColorSampler = bgfx::createUniform("s_texColor", bgfx::UniformType::Sampler);
    m_impl->m_sourceColorUniform = bgfx::createUniform("u_sourceColor", bgfx::UniformType::Vec4);
    m_impl->m_outputColorUniform = bgfx::createUniform("u_outputColor", bgfx::UniformType::Vec4);
    m_impl->m_chromaKeyUniform = bgfx::createUniform("u_chromaKey", bgfx::UniformType::Vec4);
    m_impl->m_chromaParamsUniform = bgfx::createUniform("u_chromaParams", bgfx::UniformType::Vec4);
    m_impl->m_colorMatRUniform = bgfx::createUniform("u_colorMatR", bgfx::UniformType::Vec4);
    m_impl->m_colorMatGUniform = bgfx::createUniform("u_colorMatG", bgfx::UniformType::Vec4);
    m_impl->m_colorMatBUniform = bgfx::createUniform("u_colorMatB", bgfx::UniformType::Vec4);
    m_impl->m_colorAdjustUniform = bgfx::createUniform("u_colorAdjust", bgfx::UniformType::Vec4);
    m_impl->m_cornerRadiusUniform = bgfx::createUniform("u_cornerRadius", bgfx::UniformType::Vec4);
    m_impl->m_cornerRectUniform = bgfx::createUniform("u_cornerRect", bgfx::UniformType::Vec4);
    m_impl->m_circleMaskUniform = bgfx::createUniform("u_circleMask", bgfx::UniformType::Vec4);
    m_impl->m_maskSampler = bgfx::createUniform("s_maskTex", bgfx::UniformType::Sampler);
    m_impl->m_maskParamsUniform = bgfx::createUniform("u_maskParams", bgfx::UniformType::Vec4);
    m_impl->m_maskTransformUniform = bgfx::createUniform("u_maskTransform", bgfx::UniformType::Vec4);
    m_impl->m_blurParamsUniform = bgfx::createUniform("u_blurParams", bgfx::UniformType::Vec4);
    m_impl->m_blurWeightsUniform = bgfx::createUniform("u_blurWeights", bgfx::UniformType::Vec4, 4);

    // Compile/load our textured quad sprite shader program
    m_impl->m_spriteProgram = CreateSpriteProgram();
    m_impl->m_outputProgram = CreateSdrOutputProgram();
    m_impl->m_blurProgram = CreateBlurProgram();

    if (!bgfx::isValid(m_impl->m_spriteProgram) || !bgfx::isValid(m_impl->m_outputProgram) ||
        !bgfx::isValid(m_impl->m_blurProgram)) {
        return ILY_ERROR_INITIALIZATION_FAILED;
    }

    // Render offscreen; the composite view targets this framebuffer instead of
    // the window.
    m_impl->CreateOffscreenTargets(m_impl->Out(), width, height);
    return bgfx::isValid(m_impl->Out().compositeFb) && bgfx::isValid(m_impl->Out().offscreenFb)
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
    if (bgfx::isValid(m_impl->m_colorMatRUniform)) {
        bgfx::destroy(m_impl->m_colorMatRUniform);
        m_impl->m_colorMatRUniform = BGFX_INVALID_HANDLE;
    }
    if (bgfx::isValid(m_impl->m_colorMatGUniform)) {
        bgfx::destroy(m_impl->m_colorMatGUniform);
        m_impl->m_colorMatGUniform = BGFX_INVALID_HANDLE;
    }
    if (bgfx::isValid(m_impl->m_colorMatBUniform)) {
        bgfx::destroy(m_impl->m_colorMatBUniform);
        m_impl->m_colorMatBUniform = BGFX_INVALID_HANDLE;
    }
    if (bgfx::isValid(m_impl->m_colorAdjustUniform)) {
        bgfx::destroy(m_impl->m_colorAdjustUniform);
        m_impl->m_colorAdjustUniform = BGFX_INVALID_HANDLE;
    }
    if (bgfx::isValid(m_impl->m_cornerRadiusUniform)) {
        bgfx::destroy(m_impl->m_cornerRadiusUniform);
        m_impl->m_cornerRadiusUniform = BGFX_INVALID_HANDLE;
    }
    if (bgfx::isValid(m_impl->m_cornerRectUniform)) {
        bgfx::destroy(m_impl->m_cornerRectUniform);
        m_impl->m_cornerRectUniform = BGFX_INVALID_HANDLE;
    }
    if (bgfx::isValid(m_impl->m_circleMaskUniform)) {
        bgfx::destroy(m_impl->m_circleMaskUniform);
        m_impl->m_circleMaskUniform = BGFX_INVALID_HANDLE;
    }
    if (bgfx::isValid(m_impl->m_maskSampler)) {
        bgfx::destroy(m_impl->m_maskSampler);
        m_impl->m_maskSampler = BGFX_INVALID_HANDLE;
    }
    if (bgfx::isValid(m_impl->m_maskParamsUniform)) {
        bgfx::destroy(m_impl->m_maskParamsUniform);
        m_impl->m_maskParamsUniform = BGFX_INVALID_HANDLE;
    }
    if (bgfx::isValid(m_impl->m_maskTransformUniform)) {
        bgfx::destroy(m_impl->m_maskTransformUniform);
        m_impl->m_maskTransformUniform = BGFX_INVALID_HANDLE;
    }
    if (bgfx::isValid(m_impl->m_blurProgram)) {
        bgfx::destroy(m_impl->m_blurProgram);
        m_impl->m_blurProgram = BGFX_INVALID_HANDLE;
    }
    if (bgfx::isValid(m_impl->m_blurParamsUniform)) {
        bgfx::destroy(m_impl->m_blurParamsUniform);
        m_impl->m_blurParamsUniform = BGFX_INVALID_HANDLE;
    }
    if (bgfx::isValid(m_impl->m_blurWeightsUniform)) {
        bgfx::destroy(m_impl->m_blurWeightsUniform);
        m_impl->m_blurWeightsUniform = BGFX_INVALID_HANDLE;
    }
    m_impl->DestroyBlurTargets();

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
    for (auto& target : m_impl->m_outputs) {
        bgfx::setViewRect(target.viewComposite, 0, 0, static_cast<uint16_t>(target.width), static_cast<uint16_t>(target.height));
        bgfx::setViewRect(target.viewOutput, 0, 0, static_cast<uint16_t>(target.width), static_cast<uint16_t>(target.height));
        bgfx::touch(target.viewComposite);
        target.nextBlurView = target.viewBlurBase;
    }
    for (auto& target : m_impl->m_blurTargets) {
        target.usedThisFrame = false;
    }
    return ILY_SUCCESS;
}

IlyResult BgfxBackend::EndFrame() {
    ILY_PROFILE_SCOPE("BgfxBackend::EndFrame");

    EnsureSpriteVertexLayout();
    // Every output's encode pass runs inside THIS bgfx frame — one submit for
    // all of them, which is the reason outputs share an engine at all.
    IlyResult result = ILY_SUCCESS;
    for (size_t index = 0; index < m_impl->m_outputs.size(); ++index) {
        if (!m_impl->m_outputs[index].valid) continue;
        const IlyResult passResult = SubmitOutputPass(&m_impl->m_outputs[index]);
        if (passResult != ILY_SUCCESS) result = passResult;
    }

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

    m_impl->EvictStaleBlurTargets();
    m_impl->m_frameIndex += 1;
    bgfx::frame();
    return result;
}

/** Encode one output's linear composite into its presentation texture. */
IlyResult BgfxBackend::SubmitOutputPass(void* outputTarget) {
    auto& output = *static_cast<Impl::OutputTarget*>(outputTarget);
    if (!bgfx::isValid(output.compositeColorTex) ||
        !bgfx::isValid(m_impl->m_outputProgram) ||
        bgfx::getAvailTransientVertexBuffer(4, s_spriteVertexLayout) < 4 ||
        bgfx::getAvailTransientIndexBuffer(6) < 6) {
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
    bgfx::setTexture(0, m_impl->m_texColorSampler, output.compositeColorTex);
    bgfx::setVertexBuffer(0, &outputVertices);
    bgfx::setIndexBuffer(&outputIndices);
    bgfx::setState(BGFX_STATE_WRITE_RGB | BGFX_STATE_WRITE_A);
    bgfx::submit(output.viewOutput, m_impl->m_outputProgram);
    return ILY_SUCCESS;
}

int32_t BgfxBackend::CreateOutput(uint32_t width, uint32_t height) {
    ILY_PROFILE_SCOPE("BgfxBackend::CreateOutput");
    if (width == 0 || height == 0 || width > UINT16_MAX || height > UINT16_MAX) {
        return -1;
    }
    std::lock_guard<std::mutex> lock(m_impl->m_mutex);
    if (!m_impl->m_initialized) return -1;

    // Reuse a destroyed slot when there is one; ids stay stable either way.
    size_t index = m_impl->m_outputs.size();
    for (size_t candidate = 0; candidate < m_impl->m_outputs.size(); ++candidate) {
        if (!m_impl->m_outputs[candidate].valid) { index = candidate; break; }
    }
    if (index == m_impl->m_outputs.size()) {
        // Views are a fixed budget; refuse rather than colliding with another
        // output's block.
        if ((index + 1) * kViewsPerOutput > kMaxViews) return -1;
        m_impl->m_outputs.emplace_back();
    }

    Impl::OutputTarget& target = m_impl->m_outputs[index];
    target = Impl::OutputTarget{};
    target.AssignViews(index);
    bgfx::setViewClear(target.viewComposite, BGFX_CLEAR_COLOR | BGFX_CLEAR_DEPTH, 1.0f, 0, 0);
    bgfx::setViewClear(target.viewOutput, BGFX_CLEAR_COLOR, 0x000000ff, 1.0f, 0);
    m_impl->CreateOffscreenTargets(target, width, height);
    if (!bgfx::isValid(target.compositeFb) || !bgfx::isValid(target.offscreenFb)) {
        target.valid = false;
        return -1;
    }
    return static_cast<int32_t>(index);
}

void BgfxBackend::DestroyOutput(uint32_t outputIndex) {
    ILY_PROFILE_SCOPE("BgfxBackend::DestroyOutput");
    std::lock_guard<std::mutex> lock(m_impl->m_mutex);
    // Output 0 belongs to the engine itself and lives until Shutdown.
    if (outputIndex == 0 || outputIndex >= m_impl->m_outputs.size()) return;
    m_impl->DestroyOutputTarget(m_impl->m_outputs[outputIndex]);
}

void BgfxBackend::SetActiveOutput(uint32_t outputIndex) {
    std::lock_guard<std::mutex> lock(m_impl->m_mutex);
    if (outputIndex >= m_impl->m_outputs.size() || !m_impl->m_outputs[outputIndex].valid) return;
    m_impl->m_activeOutput = outputIndex;
}

uint32_t BgfxBackend::OutputCount() const {
    std::lock_guard<std::mutex> lock(m_impl->m_mutex);
    return static_cast<uint32_t>(m_impl->m_outputs.size());
}

void BgfxBackend::Clear(float r, float g, float b, float a) {
    ILY_PROFILE_SCOPE("BgfxBackend::Clear");
    bgfx::setPaletteColor(0, SrgbToLinear(r), SrgbToLinear(g), SrgbToLinear(b), a);
    for (const auto& target : m_impl->m_outputs) {
        bgfx::setViewClear(target.viewComposite, BGFX_CLEAR_COLOR | BGFX_CLEAR_DEPTH, 1.0f, 0, 0);
    }
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

bool BgfxBackend::GetAdapterLuid(uint64_t* outLuid) const {
    if (!outLuid) return false;
    std::lock_guard<std::mutex> lock(m_impl->m_mutex);
    if (!m_impl->m_adapterLuidValid) return false;
    *outLuid = m_impl->m_adapterLuid;
    return true;
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

    // Two incompatible flavours of shared handle reach this function, and the
    // API that opens one rejects the other:
    //   - NT handles (D3D11_RESOURCE_MISC_SHARED_NTHANDLE, produced by
    //     CreateSharedHandle) need OpenSharedResource1. Chromium's offscreen
    //     browser-source textures are these.
    //   - Legacy handles (D3D11_RESOURCE_MISC_SHARED) need OpenSharedResource.
    // Try the NT path first, then fall back, so both kinds of producer work.
    HRESULT hr = E_FAIL;
    ID3D11Device1* device1 = nullptr;
    if (SUCCEEDED(device->QueryInterface(__uuidof(ID3D11Device1), reinterpret_cast<void**>(&device1))) && device1) {
        hr = device1->OpenSharedResource1(
            static_cast<HANDLE>(sharedHandle),
            __uuidof(ID3D11Texture2D),
            reinterpret_cast<void**>(&importedTexture));
        device1->Release();
    }

    if (FAILED(hr) || !importedTexture) {
        importedTexture = nullptr;
        hr = device->OpenSharedResource(
            static_cast<HANDLE>(sharedHandle),
            __uuidof(ID3D11Texture2D),
            reinterpret_cast<void**>(&importedTexture));
    }

    if (FAILED(hr) || !importedTexture) {
        std::cerr << "[ily-engine] shared texture open failed: 0x"
                  << std::hex << hr << std::dec << std::endl;
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

    // NO BGFX_TEXTURE_SRGB here, deliberately. bgfx::overrideInternal swaps in
    // the imported ID3D11Texture2D, and an _SRGB shader-resource view cannot be
    // created over a plain (non-typeless) B8G8R8A8_UNORM resource — the texture
    // then samples as black, silently. The sprite shader does the sRGB decode
    // instead (transfer mode 5). Filtering therefore happens in gamma space,
    // which matches what the canvas compositor does anyway.
    const bool shaderDecodeSrgb = colorDescription.transfer == ILY_TRANSFER_SRGB;
    bgfx::TextureHandle handle = bgfx::createTexture2D(
        static_cast<uint16_t>(width),
        static_cast<uint16_t>(height),
        false,
        1,
        bgfxFormat,
        BGFX_SAMPLER_U_CLAMP | BGFX_SAMPLER_V_CLAMP,
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

    auto texResource = std::make_shared<TextureResource>(width, height, bgfxFormat, handle, colorDescription, alphaMode, sdrWhiteNits, shaderDecodeSrgb);
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

BgfxBackend::Impl::BlurTarget* BgfxBackend::Impl::AcquireBlurTarget(uint32_t width, uint32_t height) {
    for (auto& target : m_blurTargets) {
        if (!target.usedThisFrame && target.width == width && target.height == height) {
            target.usedThisFrame = true;
            target.lastUsedFrame = m_frameIndex;
            return &target;
        }
    }

    const uint64_t flags = BGFX_TEXTURE_RT | BGFX_SAMPLER_U_CLAMP | BGFX_SAMPLER_V_CLAMP;
    BlurTarget target;
    target.width = width;
    target.height = height;
    target.texA = bgfx::createTexture2D(static_cast<uint16_t>(width), static_cast<uint16_t>(height), false, 1, bgfx::TextureFormat::RGBA16F, flags);
    target.texB = bgfx::createTexture2D(static_cast<uint16_t>(width), static_cast<uint16_t>(height), false, 1, bgfx::TextureFormat::RGBA16F, flags);
    if (!bgfx::isValid(target.texA) || !bgfx::isValid(target.texB)) {
        if (bgfx::isValid(target.texA)) bgfx::destroy(target.texA);
        if (bgfx::isValid(target.texB)) bgfx::destroy(target.texB);
        return nullptr;
    }
    target.fbA = bgfx::createFrameBuffer(1, &target.texA, false);
    target.fbB = bgfx::createFrameBuffer(1, &target.texB, false);
    if (!bgfx::isValid(target.fbA) || !bgfx::isValid(target.fbB)) {
        if (bgfx::isValid(target.fbA)) bgfx::destroy(target.fbA);
        if (bgfx::isValid(target.fbB)) bgfx::destroy(target.fbB);
        bgfx::destroy(target.texA);
        bgfx::destroy(target.texB);
        return nullptr;
    }
    target.usedThisFrame = true;
    target.lastUsedFrame = m_frameIndex;
    m_blurTargets.push_back(target);
    return &m_blurTargets.back();
}

void BgfxBackend::Impl::EvictStaleBlurTargets() {
    // Sizes track layer layouts, which rarely change; drop pairs that have sat
    // unused for a while (~5s at 60fps) so resizes do not accumulate targets.
    constexpr uint64_t kStaleFrames = 300;
    for (size_t i = m_blurTargets.size(); i-- > 0;) {
        BlurTarget& target = m_blurTargets[i];
        if (!target.usedThisFrame && m_frameIndex - target.lastUsedFrame > kStaleFrames) {
            bgfx::destroy(target.fbA);
            bgfx::destroy(target.fbB);
            bgfx::destroy(target.texA);
            bgfx::destroy(target.texB);
            m_blurTargets.erase(m_blurTargets.begin() + static_cast<ptrdiff_t>(i));
        }
    }
}

void BgfxBackend::Impl::DestroyBlurTargets() {
    for (auto& target : m_blurTargets) {
        if (bgfx::isValid(target.fbA)) bgfx::destroy(target.fbA);
        if (bgfx::isValid(target.fbB)) bgfx::destroy(target.fbB);
        if (bgfx::isValid(target.texA)) bgfx::destroy(target.texA);
        if (bgfx::isValid(target.texB)) bgfx::destroy(target.texB);
    }
    m_blurTargets.clear();
}

IlyResult BgfxBackend::Impl::SubmitSpriteDraw(const SpriteDrawParams& params) {
    EnsureSpriteVertexLayout();
    if (bgfx::getAvailTransientVertexBuffer(4, s_spriteVertexLayout) < 4 ||
        bgfx::getAvailTransientIndexBuffer(6) < 6) {
        return ILY_ERROR_RENDER_FAILED;
    }

    bgfx::TransientVertexBuffer tvb;
    bgfx::allocTransientVertexBuffer(&tvb, 4, s_spriteVertexLayout);

    bgfx::TransientIndexBuffer tib;
    bgfx::allocTransientIndexBuffer(&tib, 6);

    const IlyTransform& transform = params.transform;

    float u0 = transform.crop.left;
    float v0 = transform.crop.top;
    float u1 = transform.crop.right == 0.0f ? 1.0f : transform.crop.right;
    float v1 = transform.crop.bottom == 0.0f ? 1.0f : transform.crop.bottom;

    float width = params.texWidth * (u1 - u0);
    float height = params.texHeight * (v1 - v0);

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

    float viewWidth = params.targetWidth;
    float viewHeight = params.targetHeight;

    // Compute vertex color: tint with overall opacity
    float finalOpacity = transform.opacity * params.opacity;
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

    // Set state. Intermediate stage-1 renders overwrite a transparent-cleared
    // target, so they skip blending to preserve exact premultiplied values.
    uint64_t state = BGFX_STATE_WRITE_RGB | BGFX_STATE_WRITE_A | BGFX_STATE_MSAA;

    if (params.blendEnabled) {
        switch (params.blendMode) {
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
    }

    bgfx::setState(state);

    bgfx::setUniform(m_sourceColorUniform, params.sourceParams);

    const IlyChromaKey* chroma = params.chroma;
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
    bgfx::setUniform(m_chromaKeyUniform, chromaKeyParams);
    bgfx::setUniform(m_chromaParamsUniform, chromaBandParams);

    // Color adjust: uniforms persist across submits, so set them every draw
    // (identity when disabled) exactly like the chroma uniforms above. The
    // third u_colorAdjust component asks the shader to re-encode its output to
    // sRGB gamma (blur intermediates only).
    const IlyColorAdjust* colorAdjust = params.colorAdjust;
    const bool colorAdjustEnabled = colorAdjust && colorAdjust->enabled;
    static const float kIdentityRows[3][4] = {
        {1.0f, 0.0f, 0.0f, 0.0f},
        {0.0f, 1.0f, 0.0f, 0.0f},
        {0.0f, 0.0f, 1.0f, 0.0f}
    };
    const float* rowR = colorAdjustEnabled ? &colorAdjust->matrix[0] : kIdentityRows[0];
    const float* rowG = colorAdjustEnabled ? &colorAdjust->matrix[4] : kIdentityRows[1];
    const float* rowB = colorAdjustEnabled ? &colorAdjust->matrix[8] : kIdentityRows[2];
    const float colorAdjustParams[4] = {
        colorAdjustEnabled ? 1.0f : 0.0f,
        colorAdjustEnabled ? colorAdjust->alpha : 1.0f,
        params.encodeSrgbOutput ? 1.0f : 0.0f,
        0.0f
    };
    bgfx::setUniform(m_colorMatRUniform, rowR);
    bgfx::setUniform(m_colorMatGUniform, rowG);
    bgfx::setUniform(m_colorMatBUniform, rowB);
    bgfx::setUniform(m_colorAdjustUniform, colorAdjustParams);

    // Rounded corners: an SDF mask evaluated in quad-local space, so the
    // shader needs the quad's on-screen pixel size and the texcoord bounds
    // (the vertex UVs span the crop rect, not 0..1).
    const float quadWidthPx = width * std::fabs(transform.scale.x);
    const float quadHeightPx = height * std::fabs(transform.scale.y);
    const bool cornerEnabled = params.cornerRadius > 0.0f && quadWidthPx > 0.0f && quadHeightPx > 0.0f;
    const float cornerRadiusParams[4] = {
        cornerEnabled ? params.cornerRadius : 0.0f,
        quadWidthPx,
        quadHeightPx,
        cornerEnabled ? 1.0f : 0.0f
    };
    const float cornerRectParams[4] = { u0, v0, u1, v1 };
    bgfx::setUniform(m_cornerRadiusUniform, cornerRadiusParams);
    bgfx::setUniform(m_cornerRectUniform, cornerRectParams);

    // Circle mask (focus-circle sharp region), quad-local px, texcoord
    // orientation. Reuses the corner uniforms for quad size/texcoord bounds.
    const IlyCircleMask* circleMask = params.circleMask;
    const bool circleEnabled = circleMask && circleMask->enabled &&
        circleMask->radius > 0.0f && quadWidthPx > 0.0f && quadHeightPx > 0.0f;
    const float circleMaskParams[4] = {
        circleEnabled ? circleMask->x : 0.0f,
        circleEnabled ? circleMask->y : 0.0f,
        circleEnabled ? circleMask->radius : 0.0f,
        circleEnabled ? 1.0f : 0.0f
    };
    bgfx::setUniform(m_circleMaskUniform, circleMaskParams);

    // Image mask: alpha of s_maskTex (slot 1) multiplied into the layer,
    // stretched across the quad. Bind a valid texture even when disabled (the
    // main texture, harmlessly) so the sampler is never left dangling.
    const bool maskEnabled = bgfx::isValid(params.maskTexture);
    const float maskParams[4] = { maskEnabled ? 1.0f : 0.0f, 0.0f, 0.0f, 0.0f };
    bgfx::setUniform(m_maskParamsUniform, maskParams);
    // Maps this quad's UV into the layout rect the masks are positioned in
    // (identity when the quad fills the rect; a letterbox for contain fits).
    bgfx::setUniform(m_maskTransformUniform, params.maskTransform);

    // Bind texture using the shared, pre-created sampler uniform.
    bgfx::setTexture(0, m_texColorSampler, params.texture);
    bgfx::setTexture(1, m_maskSampler, maskEnabled ? params.maskTexture : params.texture);

    // Submit transient buffers
    bgfx::setVertexBuffer(0, &tvb);
    bgfx::setIndexBuffer(&tib);

    // Submit draw call
    bgfx::submit(params.viewId, m_spriteProgram);

    return ILY_SUCCESS;
}

void BgfxBackend::Impl::SubmitBlurPass(uint16_t viewId, bgfx::TextureHandle sourceTex, uint32_t width, uint32_t height, bool horizontal, float sigma) {
    EnsureSpriteVertexLayout();
    if (bgfx::getAvailTransientVertexBuffer(4, s_spriteVertexLayout) < 4 ||
        bgfx::getAvailTransientIndexBuffer(6) < 6) {
        return;
    }

    bgfx::TransientVertexBuffer tvb;
    bgfx::TransientIndexBuffer tib;
    bgfx::allocTransientVertexBuffer(&tvb, 4, s_spriteVertexLayout);
    bgfx::allocTransientIndexBuffer(&tib, 6);

    SpriteVertex* verts = reinterpret_cast<SpriteVertex*>(tvb.data);
    verts[0] = {-1.0f, 1.0f, 0.0f, 0.0f, 0.0f, 0xffffffff};
    verts[1] = { 1.0f, 1.0f, 0.0f, 1.0f, 0.0f, 0xffffffff};
    verts[2] = { 1.0f,-1.0f, 0.0f, 1.0f, 1.0f, 0xffffffff};
    verts[3] = {-1.0f,-1.0f, 0.0f, 0.0f, 1.0f, 0xffffffff};
    uint16_t* indices = reinterpret_cast<uint16_t*>(tib.data);
    indices[0] = 0;
    indices[1] = 1;
    indices[2] = 2;
    indices[3] = 0;
    indices[4] = 2;
    indices[5] = 3;

    // Normalized Gaussian weights for the fixed 25-tap kernel; the tail decays
    // to zero for small sigmas, so undersized blurs cost nothing extra.
    double raw[13];
    const double twoSigmaSq = 2.0 * static_cast<double>(sigma) * static_cast<double>(sigma);
    for (int i = 0; i <= 12; ++i) {
        raw[i] = twoSigmaSq > 0.0 ? std::exp(-static_cast<double>(i * i) / twoSigmaSq) : (i == 0 ? 1.0 : 0.0);
    }
    double sum = raw[0];
    for (int i = 1; i <= 12; ++i) sum += 2.0 * raw[i];
    float weights[16] = {0};
    for (int i = 0; i <= 12; ++i) weights[i] = static_cast<float>(raw[i] / sum);

    const float blurParams[4] = {
        horizontal ? 1.0f / static_cast<float>(width) : 0.0f,
        horizontal ? 0.0f : 1.0f / static_cast<float>(height),
        0.0f,
        0.0f
    };
    bgfx::setUniform(m_blurParamsUniform, blurParams);
    bgfx::setUniform(m_blurWeightsUniform, weights, 4);
    bgfx::setTexture(0, m_texColorSampler, sourceTex);
    bgfx::setState(BGFX_STATE_WRITE_RGB | BGFX_STATE_WRITE_A);
    bgfx::setVertexBuffer(0, &tvb);
    bgfx::setIndexBuffer(&tib);
    bgfx::submit(viewId, m_blurProgram);
}

IlyResult BgfxBackend::DrawQuad(ResourceHandle textureHandle, const IlyTransform& transform, float opacity, IlyBlendMode blendMode, const IlyChromaKey* chroma, const IlyColorAdjust* colorAdjust, float cornerRadius, float blurSigma, const IlyCircleMask* circleMask, ResourceHandle maskTexture, const float* maskTransform) {
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

    float transferMode = 0.0f;
    const IlyColorDescription& sourceColor = tex->GetColorDescription();
    if (sourceColor.transfer == ILY_TRANSFER_BT709) transferMode = 1.0f;
    if (sourceColor.transfer == ILY_TRANSFER_PQ) transferMode = 2.0f;
    if (sourceColor.transfer == ILY_TRANSFER_HLG) transferMode = 3.0f;
    // Imported shared textures sample as raw sRGB (see
    // CreateSharedTextureFromHandle) — the shader decodes them.
    if (tex->NeedsShaderSrgbDecode()) transferMode = 5.0f;
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

    SpriteDrawParams draw;
    draw.viewId = m_impl->Out().viewComposite;
    draw.targetWidth = static_cast<float>(m_impl->Out().width);
    draw.targetHeight = static_cast<float>(m_impl->Out().height);
    draw.texture = tex->GetHandle();
    draw.texWidth = static_cast<float>(tex->GetWidth());
    draw.texHeight = static_cast<float>(tex->GetHeight());
    draw.transform = transform;
    draw.opacity = opacity;
    draw.blendMode = blendMode;
    draw.blendEnabled = true;
    draw.chroma = chroma;
    draw.colorAdjust = colorAdjust;
    draw.cornerRadius = cornerRadius;
    draw.circleMask = circleMask;
    // Resolve the optional image-mask texture; an unknown/invalid handle simply
    // leaves the mask disabled rather than failing the whole draw.
    if (maskTexture != ILY_INVALID_HANDLE) {
        auto maskTex = m_impl->m_resourceManager.GetAs<TextureResource>(maskTexture);
        if (maskTex) {
            draw.maskTexture = maskTex->GetHandle();
        }
    }
    // A positive UV scale is required (the shader divides by it); anything else
    // — including a value-initialized {0,0,0,0} from a direct IlyLayer — falls
    // back to the identity default so masks map 1:1 onto a quad-filling layer.
    if (maskTransform && maskTransform[2] > 0.0f && maskTransform[3] > 0.0f) {
        draw.maskTransform[0] = maskTransform[0];
        draw.maskTransform[1] = maskTransform[1];
        draw.maskTransform[2] = maskTransform[2];
        draw.maskTransform[3] = maskTransform[3];
    }
    draw.sourceParams[0] = transferMode;
    draw.sourceParams[1] = sourceColor.primaries == ILY_COLOR_PRIMARIES_BT2020 ? 1.0f : 0.0f;
    draw.sourceParams[2] = static_cast<float>(tex->GetAlphaMode());
    draw.sourceParams[3] = sourceScale;
    draw.encodeSrgbOutput = false;

    // Blurred layers render through a padded intermediate: stage 1 draws the
    // keyed/color-adjusted source into a transparent-padded RGBA16F target
    // (re-encoded to sRGB gamma, the space CSS blur() works in), a separable
    // Gaussian runs H then V, and the composite pass draws the blurred result
    // cropped back to the unpadded quad — matching the canvas, whose default
    // rect shape path clips blur bleed at the layout rect.
    //
    // The 25-tap kernel only reaches 3*sigma for sigma <= 4, so larger blurs
    // (the focus-circle effect goes to 40px) render the intermediate DOWNSAMPLED
    // by an integer factor — Skia's trick: the per-texel sigma stays <= 4 while
    // still covering the full requested radius, and the composite upsamples the
    // small blurred result bilinearly (the blur targets sample linear).
    const float requestedSigma = std::min(blurSigma, 64.0f);
    const int downscale = std::max(1, static_cast<int>(std::ceil(requestedSigma / 4.0f)));
    const float sigma = requestedSigma / static_cast<float>(downscale);
    if (requestedSigma >= 0.05f && bgfx::isValid(m_impl->m_blurProgram)) {
        const float cropU0 = transform.crop.left;
        const float cropV0 = transform.crop.top;
        const float cropU1 = transform.crop.right == 0.0f ? 1.0f : transform.crop.right;
        const float cropV1 = transform.crop.bottom == 0.0f ? 1.0f : transform.crop.bottom;
        const float croppedWidth = draw.texWidth * (cropU1 - cropU0);
        const float croppedHeight = draw.texHeight * (cropV1 - cropV0);
        const float quadWidth = croppedWidth * std::fabs(transform.scale.x);
        const float quadHeight = croppedHeight * std::fabs(transform.scale.y);
        // Intermediate geometry in DOWNSAMPLED texels (1 texel = downscale px).
        const float dsQuadWidth = quadWidth / static_cast<float>(downscale);
        const float dsQuadHeight = quadHeight / static_cast<float>(downscale);
        const int padding = static_cast<int>(std::ceil(3.0f * sigma));
        const uint32_t paddedWidth = static_cast<uint32_t>(std::ceil(dsQuadWidth)) + 2 * padding;
        const uint32_t paddedHeight = static_cast<uint32_t>(std::ceil(dsQuadHeight)) + 2 * padding;

        if (quadWidth >= 1.0f && quadHeight >= 1.0f &&
            dsQuadWidth >= 1.0f && dsQuadHeight >= 1.0f &&
            croppedWidth >= 1.0f && croppedHeight >= 1.0f &&
            paddedWidth <= 8192 && paddedHeight <= 8192 &&
            m_impl->Out().nextBlurView + 3 <= m_impl->Out().viewComposite) {
            Impl::BlurTarget* target = m_impl->AcquireBlurTarget(paddedWidth, paddedHeight);
            if (target) {
                const uint16_t viewStage1 = m_impl->Out().nextBlurView++;
                const uint16_t viewBlurH = m_impl->Out().nextBlurView++;
                const uint16_t viewBlurV = m_impl->Out().nextBlurView++;

                bgfx::setViewFrameBuffer(viewStage1, target->fbA);
                bgfx::setViewRect(viewStage1, 0, 0, static_cast<uint16_t>(paddedWidth), static_cast<uint16_t>(paddedHeight));
                bgfx::setViewClear(viewStage1, BGFX_CLEAR_COLOR, 0x00000000, 1.0f, 0);

                SpriteDrawParams stage1 = draw;
                stage1.viewId = viewStage1;
                stage1.targetWidth = static_cast<float>(paddedWidth);
                stage1.targetHeight = static_cast<float>(paddedHeight);
                stage1.blendEnabled = false;
                stage1.cornerRadius = 0.0f;
                stage1.circleMask = nullptr;
                stage1.maskTexture = BGFX_INVALID_HANDLE;
                stage1.encodeSrgbOutput = true;
                stage1.opacity = 1.0f;
                stage1.transform.position = {static_cast<float>(padding) + dsQuadWidth * 0.5f, static_cast<float>(padding) + dsQuadHeight * 0.5f, 0.0f};
                stage1.transform.rotation = {0.0f, 0.0f, 0.0f};
                stage1.transform.scale = {dsQuadWidth / croppedWidth, dsQuadHeight / croppedHeight, 1.0f};
                stage1.transform.anchor = {0.0f, 0.0f};
                stage1.transform.pivot = {0.5f, 0.5f};
                stage1.transform.opacity = 1.0f;

                if (m_impl->SubmitSpriteDraw(stage1) == ILY_SUCCESS) {
                    bgfx::setViewFrameBuffer(viewBlurH, target->fbB);
                    bgfx::setViewRect(viewBlurH, 0, 0, static_cast<uint16_t>(paddedWidth), static_cast<uint16_t>(paddedHeight));
                    bgfx::setViewClear(viewBlurH, BGFX_CLEAR_NONE);
                    m_impl->SubmitBlurPass(viewBlurH, target->texA, paddedWidth, paddedHeight, true, sigma);

                    bgfx::setViewFrameBuffer(viewBlurV, target->fbA);
                    bgfx::setViewRect(viewBlurV, 0, 0, static_cast<uint16_t>(paddedWidth), static_cast<uint16_t>(paddedHeight));
                    bgfx::setViewClear(viewBlurV, BGFX_CLEAR_NONE);
                    m_impl->SubmitBlurPass(viewBlurV, target->texB, paddedWidth, paddedHeight, false, sigma);

                    // Composite the blurred intermediate under the ORIGINAL
                    // transform: same center/rotation/pivot, scaled up by the
                    // downscale factor (1 intermediate texel = downscale output
                    // px), with a crop that trims the transparent padding off.
                    SpriteDrawParams composite = draw;
                    composite.texture = target->texA;
                    composite.texWidth = static_cast<float>(paddedWidth);
                    composite.texHeight = static_cast<float>(paddedHeight);
                    composite.chroma = nullptr;
                    composite.colorAdjust = nullptr;
                    composite.transform.scale = {
                        (transform.scale.x < 0.0f ? -1.0f : 1.0f) * static_cast<float>(downscale),
                        (transform.scale.y < 0.0f ? -1.0f : 1.0f) * static_cast<float>(downscale),
                        1.0f
                    };
                    composite.transform.crop = {
                        static_cast<float>(padding) / static_cast<float>(paddedWidth),
                        static_cast<float>(padding) / static_cast<float>(paddedHeight),
                        (static_cast<float>(padding) + dsQuadWidth) / static_cast<float>(paddedWidth),
                        (static_cast<float>(padding) + dsQuadHeight) / static_cast<float>(paddedHeight)
                    };
                    composite.sourceParams[0] = 4.0f; // shader sRGB decode (blur intermediate)
                    composite.sourceParams[1] = 0.0f;
                    composite.sourceParams[2] = static_cast<float>(ILY_ALPHA_PREMULTIPLIED);
                    composite.sourceParams[3] = 1.0f;
                    return m_impl->SubmitSpriteDraw(composite);
                }
                // Stage 1 failed; fall through to the direct unblurred draw.
            }
        }
    }

    return m_impl->SubmitSpriteDraw(draw);
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
    return GetSharedOutputTextureForOutput(0, outHandle, outWidth, outHeight);
}

IlyResult BgfxBackend::GetSharedOutputTextureForOutput(uint32_t outputIndex, void** outHandle, uint32_t* outWidth, uint32_t* outHeight) {
    ILY_PROFILE_SCOPE("BgfxBackend::GetSharedOutputTexture");
    if (!outHandle) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }

    std::lock_guard<std::mutex> lock(m_impl->m_mutex);
    if (!m_impl->m_initialized) {
        return ILY_ERROR_INITIALIZATION_FAILED;
    }
    if (outputIndex >= m_impl->m_outputs.size() || !m_impl->m_outputs[outputIndex].valid) {
        return ILY_ERROR_NOT_FOUND;
    }
    auto& output = m_impl->m_outputs[outputIndex];

#ifdef _WIN32
    if (!output.sharedOutputHandle) {
        return ILY_ERROR_NOT_SUPPORTED;
    }
    *outHandle = output.sharedOutputHandle;
    if (outWidth) *outWidth = output.width;
    if (outHeight) *outHeight = output.height;
    return ILY_SUCCESS;
#else
    (void)outWidth;
    (void)outHeight;
    return ILY_ERROR_NOT_SUPPORTED;
#endif
}

IlyResult BgfxBackend::ReadPixels(void* dst, uint32_t dstSize, uint32_t* outWidth, uint32_t* outHeight) {
    return ReadPixelsFromOutput(0, dst, dstSize, outWidth, outHeight);
}

IlyResult BgfxBackend::ReadPixelsFromOutput(uint32_t outputIndex, void* dst, uint32_t dstSize, uint32_t* outWidth, uint32_t* outHeight) {
    ILY_PROFILE_SCOPE("BgfxBackend::ReadPixels");
    std::lock_guard<std::mutex> lock(m_impl->m_mutex);

    if (!m_impl->m_initialized) {
        return ILY_ERROR_INITIALIZATION_FAILED;
    }
    if (!dst) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
    if (outputIndex >= m_impl->m_outputs.size() || !m_impl->m_outputs[outputIndex].valid) {
        return ILY_ERROR_NOT_FOUND;
    }
    auto& output = m_impl->m_outputs[outputIndex];

    const uint32_t width = output.width;
    const uint32_t height = output.height;
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
    if (!bgfx::isValid(output.offscreenColorTex) || !bgfx::isValid(output.readbackTex)) {
        return ILY_ERROR_INITIALIZATION_FAILED;
    }

    // Copy the offscreen color target into the CPU-readable texture, then read
    // it back. readTexture reports the frame at which dst will be populated;
    // pump frames (bounded) until we reach it.
    const bgfx::ViewId kBlitView = output.viewBlit;
    bgfx::blit(kBlitView, output.readbackTex, 0, 0, output.offscreenColorTex);
    const uint32_t frameAvailable = bgfx::readTexture(output.readbackTex, dst);

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
