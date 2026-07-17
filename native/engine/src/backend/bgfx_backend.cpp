#include "bgfx_backend.h"
#include "ily/resource_manager.h"
#include "ily/resources.h"
#include "renderer/shader_loader.h"
#include <bgfx/bgfx.h>
#include <bgfx/platform.h>
#include <bx/bx.h>
#include <mutex>
#include <cstring>
#include <cmath>
#include <iostream>

#ifdef _WIN32
#include <windows.h>
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
    bgfx::UniformHandle m_texColorSampler = BGFX_INVALID_HANDLE;
    mutable std::mutex m_mutex;
    bool m_initialized = false;

#ifdef _WIN32
    HWND m_dummyHwnd = nullptr;
#endif
};

struct SpriteVertex {
    float x, y, z;
    float u, v;
    uint32_t color;
};

static bgfx::VertexLayout s_spriteVertexLayout;
static bool s_layoutInitialized = false;

BgfxBackend::BgfxBackend() : m_impl(std::make_unique<Impl>()) {}

BgfxBackend::~BgfxBackend() {
    Shutdown();
}

IlyResult BgfxBackend::Initialize(const IlyEngineConfig& config) {
    ILY_PROFILE_SCOPE("BgfxBackend::Initialize");
    std::lock_guard<std::mutex> lock(m_impl->m_mutex);

    uint32_t width = config.width == 0 ? 1 : config.width;
    uint32_t height = config.height == 0 ? 1 : config.height;

    m_impl->m_width = width;
    m_impl->m_height = height;

    if (m_impl->m_initialized) {
        bgfx::reset(width, height, BGFX_RESET_NONE);
        bgfx::setViewRect(0, 0, 0, static_cast<uint16_t>(width), static_cast<uint16_t>(height));
        return ILY_SUCCESS;
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
    init.type = bgfx::RendererType::Vulkan;
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

    bgfx::setViewClear(0, BGFX_CLEAR_COLOR | BGFX_CLEAR_DEPTH, 0x1e1e1eff, 1.0f, 0);
    bgfx::setViewRect(0, 0, 0, width, height);
    bgfx::setDebug(BGFX_DEBUG_TEXT);

    // Sampler uniform is shared by every quad draw; create it once here rather
    // than per-DrawQuad. Destroyed in Shutdown().
    m_impl->m_texColorSampler = bgfx::createUniform("s_texColor", bgfx::UniformType::Sampler);

    // Compile/load our textured quad sprite shader program
    m_impl->m_spriteProgram = CreateSpriteProgram();

    return ILY_SUCCESS;
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

    if (bgfx::isValid(m_impl->m_texColorSampler)) {
        bgfx::destroy(m_impl->m_texColorSampler);
        m_impl->m_texColorSampler = BGFX_INVALID_HANDLE;
    }

    m_impl->m_resourceManager.Clear();

    bgfx::shutdown();
    m_impl->m_initialized = false;

#ifdef _WIN32
    if (m_impl->m_dummyHwnd) {
        destroy_dummy_window(m_impl->m_dummyHwnd);
        m_impl->m_dummyHwnd = nullptr;
    }
#endif
}

IlyResult BgfxBackend::BeginFrame() {
    ILY_PROFILE_SCOPE("BgfxBackend::BeginFrame");
    bgfx::setViewRect(0, 0, 0, static_cast<uint16_t>(m_impl->m_width), static_cast<uint16_t>(m_impl->m_height));
    bgfx::touch(0);
    return ILY_SUCCESS;
}

IlyResult BgfxBackend::EndFrame() {
    ILY_PROFILE_SCOPE("BgfxBackend::EndFrame");
    
    // Print debug text stats
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
    
    bgfx::frame();
    return ILY_SUCCESS;
}

void BgfxBackend::Clear(float r, float g, float b, float a) {
    ILY_PROFILE_SCOPE("BgfxBackend::Clear");
    uint32_t clearColor = (static_cast<uint8_t>(r * 255.0f) << 24) |
                          (static_cast<uint8_t>(g * 255.0f) << 16) |
                          (static_cast<uint8_t>(b * 255.0f) << 8)  |
                          (static_cast<uint8_t>(a * 255.0f));
    bgfx::setViewClear(0, BGFX_CLEAR_COLOR | BGFX_CLEAR_DEPTH, clearColor, 1.0f, 0);
}

ResourceHandle BgfxBackend::CreateTexture(uint32_t width, uint32_t height, const void* data) {
    ILY_PROFILE_SCOPE("BgfxBackend::CreateTexture");
    bgfx::TextureHandle handle = BGFX_INVALID_HANDLE;
    if (data) {
        const bgfx::Memory* mem = bgfx::copy(data, width * height * 4);
        handle = bgfx::createTexture2D(
            static_cast<uint16_t>(width),
            static_cast<uint16_t>(height),
            false,
            1,
            bgfx::TextureFormat::RGBA8,
            BGFX_TEXTURE_NONE | BGFX_SAMPLER_U_CLAMP | BGFX_SAMPLER_V_CLAMP,
            mem
        );
    } else {
        handle = bgfx::createTexture2D(
            static_cast<uint16_t>(width),
            static_cast<uint16_t>(height),
            false,
            1,
            bgfx::TextureFormat::RGBA8,
            BGFX_TEXTURE_NONE | BGFX_SAMPLER_U_CLAMP | BGFX_SAMPLER_V_CLAMP,
            nullptr
        );
    }

    if (!bgfx::isValid(handle)) {
        return ILY_INVALID_HANDLE;
    }

    std::lock_guard<std::mutex> lock(m_impl->m_mutex);
    auto texResource = std::make_shared<TextureResource>(width, height, bgfx::TextureFormat::RGBA8, handle);
    return m_impl->m_resourceManager.Create(ResourceType::Texture, texResource);
}

void BgfxBackend::DestroyTexture(ResourceHandle handle) {
    ILY_PROFILE_SCOPE("BgfxBackend::DestroyTexture");
    std::lock_guard<std::mutex> lock(m_impl->m_mutex);
    m_impl->m_resourceManager.Destroy(handle);
}

IlyResult BgfxBackend::UpdateTexture(ResourceHandle handle, const void* data) {
    ILY_PROFILE_SCOPE("BgfxBackend::UpdateTexture");
    if (!data) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
    std::lock_guard<std::mutex> lock(m_impl->m_mutex);
    auto tex = m_impl->m_resourceManager.GetAs<TextureResource>(handle);
    if (!tex) {
        return ILY_ERROR_NOT_FOUND;
    }
    
    const bgfx::Memory* mem = bgfx::copy(data, tex->GetWidth() * tex->GetHeight() * 4);
    bgfx::updateTexture2D(tex->GetHandle(), 0, 0, 0, 0, 
                          static_cast<uint16_t>(tex->GetWidth()), 
                          static_cast<uint16_t>(tex->GetHeight()), 
                          mem);
    return ILY_SUCCESS;
}

IlyResult BgfxBackend::DrawQuad(ResourceHandle textureHandle, const IlyTransform& transform, float opacity, IlyBlendMode blendMode) {
    ILY_PROFILE_SCOPE("BgfxBackend::DrawQuad");
    
    std::lock_guard<std::mutex> lock(m_impl->m_mutex);
    if (!m_impl->m_initialized) {
        return ILY_ERROR_INITIALIZATION_FAILED;
    }

    auto tex = m_impl->m_resourceManager.GetAs<TextureResource>(textureHandle);
    if (!tex) {
        return ILY_ERROR_NOT_FOUND;
    }

    // Initialize vertex layout if needed
    if (!s_layoutInitialized) {
        s_spriteVertexLayout.begin()
            .add(bgfx::Attrib::Position, 3, bgfx::AttribType::Float)
            .add(bgfx::Attrib::TexCoord0, 2, bgfx::AttribType::Float)
            .add(bgfx::Attrib::Color0, 4, bgfx::AttribType::Uint8, true)
            .end();
        s_layoutInitialized = true;
    }

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
            state |= BGFX_STATE_BLEND_NORMAL;
            break;
        case ILY_BLEND_ALPHA:
            state |= BGFX_STATE_BLEND_ALPHA;
            break;
        case ILY_BLEND_ADD:
            state |= BGFX_STATE_BLEND_ADD;
            break;
        case ILY_BLEND_MULTIPLY:
            state |= BGFX_STATE_BLEND_MULTIPLY;
            break;
        case ILY_BLEND_SCREEN:
            state |= BGFX_STATE_BLEND_SCREEN;
            break;
        default:
            state |= BGFX_STATE_BLEND_ALPHA;
            break;
    }

    bgfx::setState(state);

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

} // namespace ily
