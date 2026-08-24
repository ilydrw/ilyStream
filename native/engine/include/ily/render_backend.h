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

    // chroma and colorAdjust are optional (nullptr or enabled=false disables
    // each); cornerRadius <= 0 disables the rounded-corner mask, blurSigma <= 0
    // disables the Gaussian blur pipeline, circleMask (nullptr or enabled=false)
    // disables the focus-circle sharp-region mask, maskTexture
    // (ILY_INVALID_HANDLE) disables the image-mask alpha multiply, and
    // maskTransform (nullptr = identity) maps the quad's UV into the layout rect
    // the masks are positioned in (non-identity for letterboxed contain fits).
    virtual IlyResult DrawQuad(ResourceHandle textureHandle, const IlyTransform& transform, float opacity, IlyBlendMode blendMode, const IlyChromaKey* chroma = nullptr, const IlyColorAdjust* colorAdjust = nullptr, float cornerRadius = 0.0f, float blurSigma = 0.0f, const IlyCircleMask* circleMask = nullptr, ResourceHandle maskTexture = ILY_INVALID_HANDLE, const float* maskTransform = nullptr) = 0;
    virtual ResourceHandle CreateSpriteProgramHandle() = 0;

    // Return the engine-owned native handle for the compositor output texture.
    // The handle remains valid until the backend is resized or shut down and
    // must not be closed by the caller.
    virtual IlyResult GetSharedOutputTexture(void** outHandle, uint32_t* outWidth, uint32_t* outHeight) = 0;

    // Copy the most recently rendered offscreen frame into dst as tightly packed
    // RGBA8 (width*height*4 bytes). Fills outWidth/outHeight with the surface
    // size. Blocks briefly while the GPU readback completes.
    virtual IlyResult ReadPixels(void* dst, uint32_t dstSize, uint32_t* outWidth, uint32_t* outHeight) = 0;
    
    // Additional compositor outputs on this backend. Output 0 always exists and
    // is the engine's own; further outputs render the same textures at their own
    // size (e.g. a 9:16 output beside the 16:9 program), each with its own layer
    // list, and all encode inside a single GPU frame. Returns the output's index
    // or -1. Backends without multi-output support refuse politely.
    virtual int32_t CreateOutput(uint32_t width, uint32_t height) { (void)width; (void)height; return -1; }
    virtual void DestroyOutput(uint32_t outputIndex) { (void)outputIndex; }
    // Which output subsequent DrawQuad calls composite into.
    virtual void SetActiveOutput(uint32_t outputIndex) { (void)outputIndex; }
    virtual uint32_t OutputCount() const { return 1; }
    virtual IlyResult ReadPixelsFromOutput(uint32_t outputIndex, void* dst, uint32_t dstSize, uint32_t* outWidth, uint32_t* outHeight) {
        return outputIndex == 0 ? ReadPixels(dst, dstSize, outWidth, outHeight) : ILY_ERROR_NOT_FOUND;
    }
    virtual IlyResult GetSharedOutputTextureForOutput(uint32_t outputIndex, void** outHandle, uint32_t* outWidth, uint32_t* outHeight) {
        return outputIndex == 0 ? GetSharedOutputTexture(outHandle, outWidth, outHeight) : ILY_ERROR_NOT_FOUND;
    }

    // Dedicated broadcast Program export. This is deliberately separate from
    // GetSharedOutputTexture: Electron keeps its persistent presentation
    // texture while external consumers use a bounded keyed-mutex pool.
    virtual IlyResult GetProgramExportDescriptor(IlyProgramExportDescriptor* outDescriptor) {
        (void)outDescriptor;
        return ILY_ERROR_NOT_SUPPORTED;
    }
    virtual IlyResult SetProgramExportEnabled(bool enabled) {
        (void)enabled;
        return ILY_ERROR_NOT_SUPPORTED;
    }
    virtual IlyResult DuplicateProgramExportHandles(
        uint32_t targetProcessId,
        uint64_t expectedGeneration,
        uint32_t expectedSlotCount,
        IlyProgramExportDuplicatedHandles* outHandles) {
        (void)targetProcessId;
        (void)expectedGeneration;
        (void)expectedSlotCount;
        (void)outHandles;
        return ILY_ERROR_NOT_SUPPORTED;
    }

    // Packed LUID (high << 32 | low) of the GPU adapter the backend is running
    // on, when the platform has one. Native capture sources must create their
    // own D3D11 device on this adapter: a shared texture created on a different
    // adapter can still be opened, but its contents never reach the compositor
    // (the layer just composites black).
    virtual bool GetAdapterLuid(uint64_t* outLuid) const { (void)outLuid; return false; }

    // Capabilities Query
    using RendererCapabilities = IlyRendererCapabilities;
    virtual RendererCapabilities capabilities() const = 0;
    virtual IlyRendererCapabilities GetCapabilities() const = 0;
};

} // namespace ily
