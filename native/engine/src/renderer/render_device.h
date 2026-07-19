#pragma once

#include "ily/render_backend.h"
#include <memory>
#include <mutex>

namespace ily {

class ILY_API RenderDevice {
public:
    RenderDevice();
    ~RenderDevice();

    IlyResult Initialize(const IlyEngineConfig& config);
    void Shutdown();

    IlyResult BeginFrame();
    IlyResult EndFrame();

    void Clear(float r, float g, float b, float a);

    ResourceHandle CreateTexture(uint32_t width, uint32_t height, const void* data, uint32_t byteLength, bool isBGRA = false, const IlyColorDescription& color = IlySrgbFullColor(), IlyAlphaMode alphaMode = ILY_ALPHA_STRAIGHT);
    ResourceHandle CreateSharedTextureFromHandle(uint32_t width, uint32_t height, void* sharedHandle, IlyPixelFormat format = ILY_PIXEL_FORMAT_BGRA8, const IlyColorDescription& color = IlySrgbFullColor(), IlyAlphaMode alphaMode = ILY_ALPHA_OPAQUE, float sdrWhiteNits = 0.0f);
    void DestroyTexture(ResourceHandle handle);
    IlyResult UpdateTexture(ResourceHandle handle, const void* data, uint32_t byteLength, bool isBGRA = false);

    IlyResult DrawQuad(ResourceHandle textureHandle, const IlyTransform& transform, float opacity, IlyBlendMode blendMode, const IlyChromaKey* chroma = nullptr);

    IlyResult GetSharedOutputTexture(void** outHandle, uint32_t* outWidth, uint32_t* outHeight);
    IlyResult ReadPixels(void* dst, uint32_t dstSize, uint32_t* outWidth, uint32_t* outHeight);

    IRenderBackend::RendererCapabilities GetCapabilities() const;
    
    IRenderBackend* GetBackend() const { return m_backend.get(); }

private:
    std::unique_ptr<IRenderBackend> m_backend;
    mutable std::mutex m_mutex;
    bool m_initialized = false;
};

} // namespace ily
