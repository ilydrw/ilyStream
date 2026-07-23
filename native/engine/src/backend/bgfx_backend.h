#pragma once

#include "ily/render_backend.h"
#include "ily/resource_manager.h"
#include <memory>

namespace ily {

class BgfxBackend : public IRenderBackend {
public:
    BgfxBackend();
    ~BgfxBackend() override;

    IlyResult Initialize(const IlyEngineConfig& config) override;
    void Shutdown() override;

    IlyResult BeginFrame() override;
    IlyResult EndFrame() override;

    void Clear(float r, float g, float b, float a) override;

    ResourceHandle CreateTexture(uint32_t width, uint32_t height, const void* data, uint32_t byteLength, bool isBGRA, const IlyColorDescription& color, IlyAlphaMode alphaMode) override;
    ResourceHandle CreateSharedTextureFromHandle(uint32_t width, uint32_t height, void* sharedHandle, IlyPixelFormat format, const IlyColorDescription& color, IlyAlphaMode alphaMode, float sdrWhiteNits) override;
    void DestroyTexture(ResourceHandle handle) override;
    IlyResult UpdateTexture(ResourceHandle handle, const void* data, uint32_t byteLength, bool isBGRA = false) override;

    IlyResult DrawQuad(ResourceHandle textureHandle, const IlyTransform& transform, float opacity, IlyBlendMode blendMode, const IlyChromaKey* chroma = nullptr, const IlyColorAdjust* colorAdjust = nullptr, float cornerRadius = 0.0f, float blurSigma = 0.0f, const IlyCircleMask* circleMask = nullptr, ResourceHandle maskTexture = ILY_INVALID_HANDLE, const float* maskTransform = nullptr) override;
    ResourceHandle CreateSpriteProgramHandle() override;

    IlyResult GetSharedOutputTexture(void** outHandle, uint32_t* outWidth, uint32_t* outHeight) override;
    IlyResult ReadPixels(void* dst, uint32_t dstSize, uint32_t* outWidth, uint32_t* outHeight) override;
    
    RendererCapabilities capabilities() const override;
    IlyRendererCapabilities GetCapabilities() const override;

    ResourceManager& GetResourceManager();
    void SetActiveSpriteProgram(ResourceHandle programHandle);

private:
    struct Impl;
    std::unique_ptr<Impl> m_impl;
};

} // namespace ily
