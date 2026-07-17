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
} IlyEngineConfig;

// A single composited layer: a texture drawn with a transform. The engine
// redraws the current layer list into its offscreen target every frame, so the
// composited result can be read back (IlyEngineReadPixels) and presented.
typedef struct IlyLayer {
    ResourceHandle texture;
    IlyTransform transform;
    float opacity;
    IlyBlendMode blendMode;
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
