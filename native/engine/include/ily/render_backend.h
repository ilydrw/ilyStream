#pragma once

#include "ily/types.h"

namespace ily {

class IRenderBackend {
public:
    virtual ~IRenderBackend() = default;

    virtual IlyResult Initialize(const IlyEngineConfig& config) = 0;
    virtual void Shutdown() = 0;

    virtual IlyResult BeginFrame() = 0;
    virtual IlyResult EndFrame() = 0;

    virtual void Clear(float r, float g, float b, float a) = 0;

    virtual ResourceHandle CreateTexture(uint32_t width, uint32_t height, const void* data) = 0;
    virtual void DestroyTexture(ResourceHandle handle) = 0;
    virtual IlyResult UpdateTexture(ResourceHandle handle, const void* data) = 0;

    virtual IlyResult DrawQuad(ResourceHandle textureHandle, const IlyTransform& transform, float opacity, IlyBlendMode blendMode) = 0;
    virtual ResourceHandle CreateSpriteProgramHandle() = 0;
    
    // Capabilities Query
    using RendererCapabilities = IlyRendererCapabilities;
    virtual RendererCapabilities capabilities() const = 0;
    virtual IlyRendererCapabilities GetCapabilities() const = 0;
};

} // namespace ily
