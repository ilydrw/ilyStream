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

    virtual ResourceHandle CreateTexture(uint32_t width, uint32_t height, const void* data, uint32_t byteLength, bool isBGRA = false) = 0;
    virtual void DestroyTexture(ResourceHandle handle) = 0;
    virtual IlyResult UpdateTexture(ResourceHandle handle, const void* data, uint32_t byteLength, bool isBGRA = false) = 0;

    virtual IlyResult DrawQuad(ResourceHandle textureHandle, const IlyTransform& transform, float opacity, IlyBlendMode blendMode) = 0;
    virtual ResourceHandle CreateSpriteProgramHandle() = 0;

    // Copy the most recently rendered offscreen frame into dst as tightly packed
    // RGBA8 (width*height*4 bytes). Fills outWidth/outHeight with the surface
    // size. Blocks briefly while the GPU readback completes.
    virtual IlyResult ReadPixels(void* dst, uint32_t dstSize, uint32_t* outWidth, uint32_t* outHeight) = 0;
    
    // Capabilities Query
    using RendererCapabilities = IlyRendererCapabilities;
    virtual RendererCapabilities capabilities() const = 0;
    virtual IlyRendererCapabilities GetCapabilities() const = 0;
};

} // namespace ily
