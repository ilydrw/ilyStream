#pragma once

#include <stdint.h>
#include <stdbool.h>

#if defined(_WIN32) || defined(__CYGWIN__)
    #ifdef ILY_ENGINE_BUILD_DLL
        #define ILY_API __declspec(dllexport)
    #else
        #define ILY_API __declspec(dllimport)
    #endif
#else
    #if __GNUC__ >= 4
        #define ILY_API __attribute__ ((visibility ("default")))
    #else
        #define ILY_API
    #endif
#endif

#ifdef __cplusplus
extern "C" {
#endif

typedef enum IlyResult {
    ILY_SUCCESS = 0,
    ILY_ERROR_INVALID_ARGUMENT = -1,
    ILY_ERROR_OUT_OF_MEMORY = -2,
    ILY_ERROR_NOT_FOUND = -3,
    ILY_ERROR_ALREADY_EXISTS = -4,
    ILY_ERROR_INITIALIZATION_FAILED = -5,
    ILY_ERROR_RENDER_FAILED = -6,
    ILY_ERROR_NOT_SUPPORTED = -7,
    ILY_ERROR_UNKNOWN = -99
} IlyResult;

typedef enum IlyBlendMode {
    ILY_BLEND_NORMAL = 0,
    ILY_BLEND_ALPHA = 1,
    ILY_BLEND_ADD = 2,
    ILY_BLEND_MULTIPLY = 3,
    ILY_BLEND_SCREEN = 4
} IlyBlendMode;

typedef enum IlyPixelFormat {
    ILY_PIXEL_FORMAT_UNKNOWN = 0,
    ILY_PIXEL_FORMAT_RGBA8 = 1,
    ILY_PIXEL_FORMAT_BGRA8 = 2,
    ILY_PIXEL_FORMAT_RGBA16F = 3,
    ILY_PIXEL_FORMAT_R10G10B10A2 = 4,
    ILY_PIXEL_FORMAT_NV12 = 5,
    ILY_PIXEL_FORMAT_P010 = 6
} IlyPixelFormat;

typedef enum IlyColorPrimaries {
    ILY_COLOR_PRIMARIES_UNSPECIFIED = 0,
    ILY_COLOR_PRIMARIES_BT709 = 1,
    ILY_COLOR_PRIMARIES_BT2020 = 2
} IlyColorPrimaries;

typedef enum IlyTransferFunction {
    ILY_TRANSFER_UNSPECIFIED = 0,
    ILY_TRANSFER_SRGB = 1,
    ILY_TRANSFER_BT709 = 2,
    ILY_TRANSFER_LINEAR = 3,
    ILY_TRANSFER_PQ = 4,
    ILY_TRANSFER_HLG = 5
} IlyTransferFunction;

typedef enum IlyMatrixCoefficients {
    ILY_MATRIX_UNSPECIFIED = 0,
    ILY_MATRIX_RGB = 1,
    ILY_MATRIX_BT601 = 2,
    ILY_MATRIX_BT709 = 3,
    ILY_MATRIX_BT2020_NCL = 4
} IlyMatrixCoefficients;

typedef enum IlyColorRange {
    ILY_COLOR_RANGE_UNSPECIFIED = 0,
    ILY_COLOR_RANGE_FULL = 1,
    ILY_COLOR_RANGE_LIMITED = 2
} IlyColorRange;

typedef enum IlyAlphaMode {
    ILY_ALPHA_OPAQUE = 0,
    ILY_ALPHA_STRAIGHT = 1,
    ILY_ALPHA_PREMULTIPLIED = 2
} IlyAlphaMode;

typedef struct IlyColorDescription {
    IlyColorPrimaries primaries;
    IlyTransferFunction transfer;
    IlyMatrixCoefficients matrix;
    IlyColorRange range;
} IlyColorDescription;

typedef struct IlyTextureDesc {
    uint32_t width;
    uint32_t height;
    IlyPixelFormat format;
    IlyColorDescription color;
    IlyAlphaMode alphaMode;
} IlyTextureDesc;

typedef struct IlyOutputColorConfig {
    IlyPixelFormat format;
    IlyColorDescription color;
    float sdrWhiteNits;
    float hdrNominalPeakNits;
} IlyOutputColorConfig;

typedef struct IlyScreenCaptureInfo {
    uint32_t width;
    uint32_t height;
    IlyPixelFormat format;
    IlyColorDescription color;
    bool hdr;
    float sdrWhiteNits;
    float maxLuminance;
    float maxFullFrameLuminance;
} IlyScreenCaptureInfo;

typedef struct IlyScreenCaptureDisplayInfo {
    uint32_t index;
    char deviceName[32];
    int32_t left;
    int32_t top;
    int32_t right;
    int32_t bottom;
    bool hdr;
} IlyScreenCaptureDisplayInfo;


typedef struct ResourceHandle {
    uint32_t index;
    uint32_t generation;
} ResourceHandle;

#ifdef __cplusplus
#define ILY_INVALID_HANDLE ResourceHandle{0xFFFFFFFF, 0}
#else
#define ILY_INVALID_HANDLE ((ResourceHandle){0xFFFFFFFF, 0})
#endif

typedef struct IlyVec2 {
    float x;
    float y;
} IlyVec2;

typedef struct IlyVec3 {
    float x;
    float y;
    float z;
} IlyVec3;

typedef struct IlyRect {
    float left;
    float top;
    float right;
    float bottom;
} IlyRect;

typedef struct IlyTransform {
    IlyVec3 position;
    IlyVec3 rotation;
    IlyVec3 scale;
    IlyVec2 anchor;
    IlyVec2 pivot;
    IlyRect crop;
    bool visibility;
    float opacity;
} IlyTransform;

typedef struct IlyEngineConfig {
    uint32_t width;
    uint32_t height;
    uint32_t fps;
    bool enableValidation;
    bool linearBlending;
    IlyOutputColorConfig outputColor;
} IlyEngineConfig;

/**
 * Per-layer chroma key. Matches the app's canvas compositor math exactly
 * (gamma-space RGB distance, normalized 0..1 parameters) so scenes tuned on
 * the canvas path look identical composited natively.
 */
typedef struct IlyChromaKey {
    bool enabled;
    float keyR;        /* key color, 0..1 */
    float keyG;
    float keyB;
    float similarity;  /* 0..1: distance below which pixels become transparent */
    float smoothness;  /* 0..1: feather band above similarity */
    float spill;       /* 0..1: green-spill suppression band */
} IlyChromaKey;

// A single composited layer: a texture drawn with a transform. The engine
// redraws the current layer list into its offscreen target every frame, so the
// composited result can be read back (IlyEngineReadPixels) and presented.
typedef struct IlyLayer {
    ResourceHandle texture;
    IlyTransform transform;
    float opacity;
    IlyBlendMode blendMode;
    IlyChromaKey chromaKey;
} IlyLayer;

typedef struct IlyRendererCapabilities {
    bool supportsNPOT;
    bool supportsRenderToTexture;
    uint32_t maxTextureSize;
    char apiName[64];
} IlyRendererCapabilities;

typedef struct IlyFrameContext {
    uint64_t frame_number;
    double delta_time;
    double absolute_time;
    uint32_t width;
    uint32_t height;
} IlyFrameContext;

#ifdef __cplusplus
} // extern "C"

#include <functional>
#include <utility>

// C++ operator overrides for ResourceHandle
inline bool operator==(const ResourceHandle& lhs, const ResourceHandle& rhs) {
    return lhs.index == rhs.index && lhs.generation == rhs.generation;
}

inline bool operator!=(const ResourceHandle& lhs, const ResourceHandle& rhs) {
    return !(lhs == rhs);
}

inline bool operator<(const ResourceHandle& lhs, const ResourceHandle& rhs) {
    if (lhs.index != rhs.index) {
        return lhs.index < rhs.index;
    }
    return lhs.generation < rhs.generation;
}

// Convert to/from uint64_t for binding compatibility
inline uint64_t ResourceHandleToUint64(ResourceHandle handle) {
    return (static_cast<uint64_t>(handle.generation) << 32) | handle.index;
}

inline constexpr IlyColorDescription IlySrgbFullColor() {
    return IlyColorDescription{
        ILY_COLOR_PRIMARIES_BT709,
        ILY_TRANSFER_SRGB,
        ILY_MATRIX_RGB,
        ILY_COLOR_RANGE_FULL
    };
}

inline constexpr IlyColorDescription IlyBt709LimitedColor() {
    return IlyColorDescription{
        ILY_COLOR_PRIMARIES_BT709,
        ILY_TRANSFER_BT709,
        ILY_MATRIX_BT709,
        ILY_COLOR_RANGE_LIMITED
    };
}

inline constexpr IlyColorDescription IlyRec2100PqLimitedColor() {
    return IlyColorDescription{
        ILY_COLOR_PRIMARIES_BT2020,
        ILY_TRANSFER_PQ,
        ILY_MATRIX_BT2020_NCL,
        ILY_COLOR_RANGE_LIMITED
    };
}

inline constexpr IlyOutputColorConfig IlyDefaultSdrOutputColor() {
    return IlyOutputColorConfig{
        ILY_PIXEL_FORMAT_RGBA8,
        IlySrgbFullColor(),
        100.0f,
        1000.0f
    };
}

inline ResourceHandle Uint64ToResourceHandle(uint64_t val) {
    return ResourceHandle{static_cast<uint32_t>(val & 0xFFFFFFFF), static_cast<uint32_t>(val >> 32)};
}

// Custom hash for ResourceHandle to be used in std::unordered_map
namespace std {
    template <>
    struct hash<ResourceHandle> {
        std::size_t operator()(const ResourceHandle& h) const {
            return std::hash<uint64_t>()(ResourceHandleToUint64(h));
        }
    };
}

#ifndef ILY_PROFILE_SCOPE
#define ILY_PROFILE_SCOPE(name)
#endif

#endif
