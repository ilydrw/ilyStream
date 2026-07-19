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

    virtual ResourceHandle CreateTexture(
        uint32_t width,
        uint32_t height,
        const void* data,
        uint32_t byteLength,
        bool isBGRA = false,
        const IlyColorDescription& color = IlySrgbFullColor(),
        IlyAlphaMode alphaMode = ILY_ALPHA_STRAIGHT) = 0;
    virtual ResourceHandle CreateSharedTextureFromHandle(
        uint32_t width,
        uint32_t height,
        void* sharedHandle,
        IlyPixelFormat format = ILY_PIXEL_FORMAT_BGRA8,
        const IlyColorDescription& color = IlySrgbFullColor(),
        IlyAlphaMode alphaMode = ILY_ALPHA_OPAQUE,
        float sdrWhiteNits = 0.0f) = 0;
    virtual void DestroyTexture(ResourceHandle handle) = 0;
    virtual IlyResult UpdateTexture(ResourceHandle handle, const void* data, uint32_t byteLength, bool isBGRA = false) = 0;

    // chroma is optional (nullptr or enabled=false disables keying).
    virtual IlyResult DrawQuad(ResourceHandle textureHandle, const IlyTransform& transform, float opacity, IlyBlendMode blendMode, const IlyChromaKey* chroma = nullptr) = 0;
    virtual ResourceHandle CreateSpriteProgramHandle() = 0;

    // Return the engine-owned native handle for the compositor output texture.
    // The handle remains valid until the backend is resized or shut down and
    // must not be closed by the caller.
    virtual IlyResult GetSharedOutputTexture(void** outHandle, uint32_t* outWidth, uint32_t* outHeight) = 0;

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
