#include "render_device.h"
#include "backend/bgfx_backend.h"

namespace ily {

RenderDevice::RenderDevice() : m_backend(std::make_unique<BgfxBackend>()) {}

RenderDevice::~RenderDevice() {
    Shutdown();
}

IlyResult RenderDevice::Initialize(const IlyEngineConfig& config) {
    ILY_PROFILE_SCOPE("RenderDevice::Initialize");
    std::lock_guard<std::mutex> lock(m_mutex);
    IlyResult res = m_backend->Initialize(config);
    if (res == ILY_SUCCESS) {
        m_initialized = true;
    }
    return res;
}

void RenderDevice::Shutdown() {
    ILY_PROFILE_SCOPE("RenderDevice::Shutdown");
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_initialized) {
        return;
    }
    m_backend->Shutdown();
    m_initialized = false;
}

IlyResult RenderDevice::BeginFrame() {
    ILY_PROFILE_SCOPE("RenderDevice::BeginFrame");
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_initialized) return ILY_ERROR_INITIALIZATION_FAILED;
    return m_backend->BeginFrame();
}

IlyResult RenderDevice::EndFrame() {
    ILY_PROFILE_SCOPE("RenderDevice::EndFrame");
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_initialized) return ILY_ERROR_INITIALIZATION_FAILED;
    return m_backend->EndFrame();
}

void RenderDevice::Clear(float r, float g, float b, float a) {
    ILY_PROFILE_SCOPE("RenderDevice::Clear");
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_initialized) return;
    m_backend->Clear(r, g, b, a);
}

ResourceHandle RenderDevice::CreateTexture(uint32_t width, uint32_t height, const void* data, uint32_t byteLength, bool isBGRA, const IlyColorDescription& color, IlyAlphaMode alphaMode) {
    ILY_PROFILE_SCOPE("RenderDevice::CreateTexture");
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_initialized) return ILY_INVALID_HANDLE;
    return m_backend->CreateTexture(width, height, data, byteLength, isBGRA, color, alphaMode);
}

ResourceHandle RenderDevice::CreateSharedTextureFromHandle(uint32_t width, uint32_t height, void* sharedHandle, IlyPixelFormat format, const IlyColorDescription& color, IlyAlphaMode alphaMode, float sdrWhiteNits) {
    ILY_PROFILE_SCOPE("RenderDevice::CreateSharedTextureFromHandle");
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_initialized) return ILY_INVALID_HANDLE;
    return m_backend->CreateSharedTextureFromHandle(width, height, sharedHandle, format, color, alphaMode, sdrWhiteNits);
}

void RenderDevice::DestroyTexture(ResourceHandle handle) {
    ILY_PROFILE_SCOPE("RenderDevice::DestroyTexture");
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_initialized) return;
    m_backend->DestroyTexture(handle);
}

IlyResult RenderDevice::UpdateTexture(ResourceHandle handle, const void* data, uint32_t byteLength, bool isBGRA) {
    ILY_PROFILE_SCOPE("RenderDevice::UpdateTexture");
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_initialized) return ILY_ERROR_INITIALIZATION_FAILED;
    return m_backend->UpdateTexture(handle, data, byteLength, isBGRA);
}

IlyResult RenderDevice::DrawQuad(ResourceHandle textureHandle, const IlyTransform& transform, float opacity, IlyBlendMode blendMode, const IlyChromaKey* chroma) {
    ILY_PROFILE_SCOPE("RenderDevice::DrawQuad");
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_initialized) return ILY_ERROR_INITIALIZATION_FAILED;
    return m_backend->DrawQuad(textureHandle, transform, opacity, blendMode, chroma);
}

IlyResult RenderDevice::GetSharedOutputTexture(void** outHandle, uint32_t* outWidth, uint32_t* outHeight) {
    ILY_PROFILE_SCOPE("RenderDevice::GetSharedOutputTexture");
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_initialized) return ILY_ERROR_INITIALIZATION_FAILED;
    return m_backend->GetSharedOutputTexture(outHandle, outWidth, outHeight);
}

IlyResult RenderDevice::ReadPixels(void* dst, uint32_t dstSize, uint32_t* outWidth, uint32_t* outHeight) {
    ILY_PROFILE_SCOPE("RenderDevice::ReadPixels");
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_initialized) return ILY_ERROR_INITIALIZATION_FAILED;
    return m_backend->ReadPixels(dst, dstSize, outWidth, outHeight);
}

IRenderBackend::RendererCapabilities RenderDevice::GetCapabilities() const {
    ILY_PROFILE_SCOPE("RenderDevice::GetCapabilities");
    std::lock_guard<std::mutex> lock(m_mutex);
    if (!m_initialized) return IRenderBackend::RendererCapabilities{};
    return m_backend->capabilities();
}

} // namespace ily
