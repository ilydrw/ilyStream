#include "ily/engine.h"
#include "ily/scene.h"
#include <unordered_map>
#include <mutex>
#include <memory>
#include <string>
#include <cstring>
#include <limits>

#include "renderer/renderer.h"
#include "ily/render_graph.h"
#include "ily/render_backend.h"
#include <stb_image.h>
#include <vector>
#include "capture/dxgi_capture.h"
#include "capture/mf_camera_capture.h"

class EngineInstance {
public:
    IlyEngineConfig config;
    ily::Scene scene;
    std::unordered_map<ResourceHandle, std::string> sources;
    ResourceHandle nextSourceHandle = {1, 1};
    std::unique_ptr<ily::Renderer> renderer;
    std::unordered_map<ResourceHandle, std::shared_ptr<ily::DXGICapture>> captureSessions;
    std::unordered_map<ResourceHandle, std::shared_ptr<ily::MFCameraCapture>> cameraCaptureSessions;
    std::mutex mutex;

    EngineInstance(const IlyEngineConfig& cfg) : config(cfg) {}
};

// shared_ptr so a slow, lock-free operation (opening a camera takes ~1s) can
// hold the instance alive while g_EngineMutex is released.
static std::unordered_map<ResourceHandle, std::shared_ptr<EngineInstance>> g_Engines;
static ResourceHandle g_NextEngineHandle = {1, 1};
static std::mutex g_EngineMutex;
static bool g_SystemInitialized = false;

static bool RequiredRgbaBytes(uint32_t width, uint32_t height, uint32_t* outBytes) {
    const uint64_t required = static_cast<uint64_t>(width) * static_cast<uint64_t>(height) * 4;
    if (required > (std::numeric_limits<uint32_t>::max)()) {
        return false;
    }
    *outBytes = static_cast<uint32_t>(required);
    return true;
}

static IlyColorDescription NormalizeColorDescription(
    const IlyColorDescription& input,
    const IlyColorDescription& fallback) {
    IlyColorDescription result = input;
    if (result.primaries == ILY_COLOR_PRIMARIES_UNSPECIFIED) result.primaries = fallback.primaries;
    if (result.transfer == ILY_TRANSFER_UNSPECIFIED) result.transfer = fallback.transfer;
    if (result.matrix == ILY_MATRIX_UNSPECIFIED) result.matrix = fallback.matrix;
    if (result.range == ILY_COLOR_RANGE_UNSPECIFIED) result.range = fallback.range;
    return result;
}

static IlyEngineConfig NormalizeEngineConfig(const IlyEngineConfig& input) {
    IlyEngineConfig result = input;
    const bool legacyConfig = result.outputColor.format == ILY_PIXEL_FORMAT_UNKNOWN;
    const IlyOutputColorConfig defaults = IlyDefaultSdrOutputColor();
    if (legacyConfig) result.outputColor.format = defaults.format;
    result.outputColor.color = NormalizeColorDescription(result.outputColor.color, defaults.color);
    if (result.outputColor.sdrWhiteNits <= 0.0f) result.outputColor.sdrWhiteNits = defaults.sdrWhiteNits;
    if (result.outputColor.hdrNominalPeakNits <= 0.0f) {
        result.outputColor.hdrNominalPeakNits = defaults.hdrNominalPeakNits;
    }
    if (legacyConfig) result.linearBlending = true;
    return result;
}

extern "C" {

ILY_API IlyResult IlyInitializeSystem(void) {
    std::lock_guard<std::mutex> lock(g_EngineMutex);
    if (g_SystemInitialized) {
        return ILY_ERROR_ALREADY_EXISTS;
    }
    g_SystemInitialized = true;
    return ILY_SUCCESS;
}

ILY_API void IlyShutdownSystem(void) {
    std::lock_guard<std::mutex> lock(g_EngineMutex);
    g_Engines.clear();
    g_SystemInitialized = false;
}

ILY_API IlyResult IlyCreateEngine(const IlyEngineConfig* config, ResourceHandle* outEngineHandle) {
    if (!config || !outEngineHandle) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
    std::lock_guard<std::mutex> lock(g_EngineMutex);
    if (!g_SystemInitialized) {
        return ILY_ERROR_INITIALIZATION_FAILED;
    }

    ResourceHandle handle = g_NextEngineHandle;
    g_NextEngineHandle.index++;
    
    const IlyEngineConfig normalizedConfig = NormalizeEngineConfig(*config);
    auto inst = std::make_shared<EngineInstance>(normalizedConfig);
    inst->renderer = std::make_unique<ily::Renderer>();
    IlyResult res = inst->renderer->Start();
    if (res != ILY_SUCCESS) {
        return res;
    }
    res = inst->renderer->Initialize(normalizedConfig);
    if (res != ILY_SUCCESS) {
        inst->renderer->Stop();
        return res;
    }

    g_Engines[handle] = std::move(inst);
    *outEngineHandle = handle;
    return ILY_SUCCESS;
}

ILY_API IlyResult IlyDestroyEngine(ResourceHandle engineHandle) {
    std::lock_guard<std::mutex> lock(g_EngineMutex);
    auto it = g_Engines.find(engineHandle);
    if (it == g_Engines.end()) {
        return ILY_ERROR_NOT_FOUND;
    }
    
    // 1. Shutdown all capture sessions first!
    // If we stop the renderer before shutting down captures, capture threads might be 
    // blocked in UpdateTexture waiting for the (now dead) render thread to fulfill a promise, 
    // causing a deadlock/crash when we try to join the capture thread.
    for (auto& pair : it->second->captureSessions) {
        pair.second->Shutdown();
    }
    it->second->captureSessions.clear();
    for (auto& pair : it->second->cameraCaptureSessions) {
        pair.second->Shutdown();
    }
    it->second->cameraCaptureSessions.clear();

    // 2. Now it's safe to stop the render thread
    it->second->renderer->Stop();
    
    g_Engines.erase(it);
    return ILY_SUCCESS;
}

ILY_API IlyResult IlyEngineUpdate(ResourceHandle engineHandle, float deltaTime) {
    (void)deltaTime;
    std::lock_guard<std::mutex> lock(g_EngineMutex);
    auto it = g_Engines.find(engineHandle);
    if (it == g_Engines.end()) {
        return ILY_ERROR_NOT_FOUND;
    }
    std::lock_guard<std::mutex> instLock(it->second->mutex);
    if (it->second->scene.root != ily::ILY_INVALID_NODE_ID) {
        for (auto& node : it->second->scene.nodes) {
            node.dirtyFlags = ily::DIRTY_NONE;
        }
    }
    return ILY_SUCCESS;
}

ILY_API IlyResult IlyEngineRender(ResourceHandle engineHandle) {
    std::lock_guard<std::mutex> lock(g_EngineMutex);
    auto it = g_Engines.find(engineHandle);
    if (it == g_Engines.end()) {
        return ILY_ERROR_NOT_FOUND;
    }
    return ILY_SUCCESS;
}

ILY_API IlyResult IlyEngineSetSceneJson(ResourceHandle engineHandle, const char* sceneJson) {
    if (!sceneJson) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
    std::lock_guard<std::mutex> lock(g_EngineMutex);
    auto it = g_Engines.find(engineHandle);
    if (it == g_Engines.end()) {
        return ILY_ERROR_NOT_FOUND;
    }

    std::lock_guard<std::mutex> instLock(it->second->mutex);
    try {
        auto j = nlohmann::json::parse(sceneJson);
        ily::Scene newScene;
        ily::from_json(j, newScene);
        it->second->scene = newScene;
        return ILY_SUCCESS;
    } catch (const std::exception&) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
}

ILY_API IlyResult IlyEngineGetSceneJson(ResourceHandle engineHandle, char* outBuffer, uint32_t* ioBufferSize) {
    if (!ioBufferSize) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
    std::lock_guard<std::mutex> lock(g_EngineMutex);
    auto it = g_Engines.find(engineHandle);
    if (it == g_Engines.end()) {
        return ILY_ERROR_NOT_FOUND;
    }

    std::lock_guard<std::mutex> instLock(it->second->mutex);
    try {
        nlohmann::json j;
        ily::to_json(j, it->second->scene);
        std::string s = j.dump();
        uint32_t requiredSize = static_cast<uint32_t>(s.size()) + 1;
        if (!outBuffer) {
            *ioBufferSize = requiredSize;
            return ILY_SUCCESS;
        }
        if (*ioBufferSize < requiredSize) {
            *ioBufferSize = requiredSize;
            return ILY_ERROR_OUT_OF_MEMORY;
        }
        std::memcpy(outBuffer, s.c_str(), requiredSize);
        *ioBufferSize = requiredSize;
        return ILY_SUCCESS;
    } catch (const std::exception&) {
        return ILY_ERROR_UNKNOWN;
    }
}

ILY_API IlyResult IlyEngineRegisterSource(ResourceHandle engineHandle, const char* sourceId, const char* name, const char* type, ResourceHandle* outSourceHandle) {
    if (!sourceId || !name || !type || !outSourceHandle) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
    std::lock_guard<std::mutex> lock(g_EngineMutex);
    auto it = g_Engines.find(engineHandle);
    if (it == g_Engines.end()) {
        return ILY_ERROR_NOT_FOUND;
    }

    std::lock_guard<std::mutex> instLock(it->second->mutex);
    ResourceHandle sourceHandle = it->second->nextSourceHandle;
    it->second->nextSourceHandle.index++;
    it->second->sources[sourceHandle] = std::string(sourceId);
    *outSourceHandle = sourceHandle;
    return ILY_SUCCESS;
}

ILY_API IlyResult IlyEngineUnregisterSource(ResourceHandle engineHandle, ResourceHandle sourceHandle) {
    std::lock_guard<std::mutex> lock(g_EngineMutex);
    auto it = g_Engines.find(engineHandle);
    if (it == g_Engines.end()) {
        return ILY_ERROR_NOT_FOUND;
    }

    std::lock_guard<std::mutex> instLock(it->second->mutex);
    auto sIt = it->second->sources.find(sourceHandle);
    if (sIt == it->second->sources.end()) {
        return ILY_ERROR_NOT_FOUND;
    }
    it->second->sources.erase(sIt);
    return ILY_SUCCESS;
}

ILY_API IlyResult IlyEngineLoadTexture(ResourceHandle engineHandle, const char* filePath, ResourceHandle* outTextureHandle) {
    if (!filePath || !outTextureHandle) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
    std::lock_guard<std::mutex> lock(g_EngineMutex);
    auto it = g_Engines.find(engineHandle);
    if (it == g_Engines.end()) {
        return ILY_ERROR_NOT_FOUND;
    }

    std::lock_guard<std::mutex> instLock(it->second->mutex);
    
    int width = 0;
    int height = 0;
    int channels = 0;
    unsigned char* pixelData = stbi_load(filePath, &width, &height, &channels, 4);
    if (!pixelData) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }

    uint32_t byteLength = 0;
    if (width <= 0 || height <= 0 ||
        !RequiredRgbaBytes(static_cast<uint32_t>(width), static_cast<uint32_t>(height), &byteLength)) {
        stbi_image_free(pixelData);
        return ILY_ERROR_INVALID_ARGUMENT;
    }

    ResourceHandle texHandle = it->second->renderer->CreateTexture(
        static_cast<uint32_t>(width), static_cast<uint32_t>(height), pixelData, byteLength);
    stbi_image_free(pixelData);

    if (texHandle == ILY_INVALID_HANDLE) {
        return ILY_ERROR_RENDER_FAILED;
    }

    *outTextureHandle = texHandle;
    return ILY_SUCCESS;
}

ILY_API IlyResult IlyEngineDestroyTexture(ResourceHandle engineHandle, ResourceHandle textureHandle) {
    std::lock_guard<std::mutex> lock(g_EngineMutex);
    auto it = g_Engines.find(engineHandle);
    if (it == g_Engines.end()) {
        return ILY_ERROR_NOT_FOUND;
    }

    std::lock_guard<std::mutex> instLock(it->second->mutex);

    // If it's a capture session, shut it down
    auto capIt = it->second->captureSessions.find(textureHandle);
    if (capIt != it->second->captureSessions.end()) {
        capIt->second->Shutdown();
        it->second->captureSessions.erase(capIt);
    } else if (auto cameraIt = it->second->cameraCaptureSessions.find(textureHandle);
               cameraIt != it->second->cameraCaptureSessions.end()) {
        cameraIt->second->Shutdown();
        it->second->cameraCaptureSessions.erase(cameraIt);
    } else {
        it->second->renderer->DestroyTexture(textureHandle);
    }

    return ILY_SUCCESS;
}

ILY_API IlyResult IlyEngineCreateScreenCapture(ResourceHandle engineHandle, uint32_t monitorIndex, uint32_t targetFps, ResourceHandle* outTextureHandle, char* outSharedMemoryName, uint32_t nameBufSize) {
    if (!outTextureHandle) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
    std::lock_guard<std::mutex> lock(g_EngineMutex);
    auto it = g_Engines.find(engineHandle);
    if (it == g_Engines.end()) {
        return ILY_ERROR_NOT_FOUND;
    }

    std::lock_guard<std::mutex> instLock(it->second->mutex);

    auto capture = std::make_shared<ily::DXGICapture>(monitorIndex, targetFps, it->second->renderer.get());
    if (!capture->Initialize()) {
        return ILY_ERROR_RENDER_FAILED;
    }

    ResourceHandle texHandle = capture->GetTexture();
    it->second->captureSessions[texHandle] = capture;

    if (outSharedMemoryName && nameBufSize > 0) {
        const std::string& name = capture->GetSharedMemoryName();
        size_t copyLen = (std::min)((size_t)(nameBufSize - 1), name.length());
        std::memcpy(outSharedMemoryName, name.c_str(), copyLen);
        outSharedMemoryName[copyLen] = '\0';
    }

    *outTextureHandle = texHandle;
    return ILY_SUCCESS;
}

ILY_API IlyResult IlyEngineGetScreenCaptureDisplays(IlyScreenCaptureDisplayInfo* outDisplays, uint32_t* ioCount) {
    if (!ioCount) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }

    const std::vector<ily::DXGIDisplayInfo> displays = ily::DXGICapture::EnumerateDisplays();
    const uint32_t requiredCount = static_cast<uint32_t>(displays.size());
    if (!outDisplays) {
        *ioCount = requiredCount;
        return ILY_SUCCESS;
    }
    if (*ioCount < requiredCount) {
        *ioCount = requiredCount;
        return ILY_ERROR_OUT_OF_MEMORY;
    }

    for (uint32_t index = 0; index < requiredCount; ++index) {
        const auto& source = displays[index];
        auto& destination = outDisplays[index];
        destination = IlyScreenCaptureDisplayInfo{};
        destination.index = source.index;
        const size_t copyLength = (std::min)(source.deviceName.size(), sizeof(destination.deviceName) - 1);
        std::memcpy(destination.deviceName, source.deviceName.data(), copyLength);
        destination.deviceName[copyLength] = '\0';
        destination.left = source.left;
        destination.top = source.top;
        destination.right = source.right;
        destination.bottom = source.bottom;
        destination.hdr = source.hdr;
    }
    *ioCount = requiredCount;
    return ILY_SUCCESS;
}

ILY_API IlyResult IlyEngineGetScreenCaptureInfo(ResourceHandle engineHandle, ResourceHandle textureHandle, IlyScreenCaptureInfo* outInfo) {
    if (!outInfo) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
    std::lock_guard<std::mutex> lock(g_EngineMutex);
    auto engine = g_Engines.find(engineHandle);
    if (engine == g_Engines.end()) {
        return ILY_ERROR_NOT_FOUND;
    }
    std::lock_guard<std::mutex> instLock(engine->second->mutex);
    auto capture = engine->second->captureSessions.find(textureHandle);
    if (capture == engine->second->captureSessions.end()) {
        return ILY_ERROR_NOT_FOUND;
    }
    outInfo->width = capture->second->GetWidth();
    outInfo->height = capture->second->GetHeight();
    outInfo->format = capture->second->GetPixelFormat();
    outInfo->color = capture->second->GetColorDescription();
    outInfo->hdr = capture->second->IsHdr();
    outInfo->sdrWhiteNits = capture->second->GetSdrWhiteNits();
    outInfo->maxLuminance = capture->second->GetMaxLuminance();
    outInfo->maxFullFrameLuminance = capture->second->GetMaxFullFrameLuminance();
    return ILY_SUCCESS;
}

ILY_API IlyResult IlyEngineCreateCameraCapture(
    ResourceHandle engineHandle,
    const char* deviceIdentity,
    uint32_t width,
    uint32_t height,
    uint32_t targetFps,
    ResourceHandle* outTextureHandle) {
    if (!deviceIdentity || !outTextureHandle || width == 0 || height == 0 || targetFps == 0) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
    std::shared_ptr<EngineInstance> instance;
    {
        std::lock_guard<std::mutex> lock(g_EngineMutex);
        auto engine = g_Engines.find(engineHandle);
        if (engine == g_Engines.end()) {
            return ILY_ERROR_NOT_FOUND;
        }
        instance = engine->second;
    }

    // Opening a camera takes ~1s (device power-up, format negotiation, first
    // frame), so it runs with NO engine lock held: g_EngineMutex also guards
    // IlyEngineSetLayers, and holding it here would freeze compositing for
    // every engine in the process while a camera scene comes up. The instance
    // is kept alive by the shared_ptr above.
    auto capture = std::make_shared<ily::MFCameraCapture>(
        deviceIdentity,
        width,
        height,
        targetFps,
        instance->renderer.get());
    if (!capture->Initialize()) {
        return ILY_ERROR_RENDER_FAILED;
    }

    const ResourceHandle textureHandle = capture->GetTexture();
    if (textureHandle == ILY_INVALID_HANDLE) {
        capture->Shutdown();
        return ILY_ERROR_RENDER_FAILED;
    }

    {
        std::lock_guard<std::mutex> lock(g_EngineMutex);
        // The engine may have been destroyed while the camera was opening.
        if (g_Engines.find(engineHandle) == g_Engines.end()) {
            capture->Shutdown();
            return ILY_ERROR_NOT_FOUND;
        }
        std::lock_guard<std::mutex> instLock(instance->mutex);
        instance->cameraCaptureSessions[textureHandle] = capture;
    }
    *outTextureHandle = textureHandle;
    return ILY_SUCCESS;
}

ILY_API IlyResult IlyEngineGetCameraCaptureDevices(
    IlyCameraCaptureDeviceInfo* outDevices,
    uint32_t* ioCount) {
    if (!ioCount) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }

    const std::vector<ily::MFCameraDeviceInfo> devices =
        ily::MFCameraCapture::EnumerateDevices();
    const uint32_t requiredCount = static_cast<uint32_t>(devices.size());
    if (!outDevices) {
        *ioCount = requiredCount;
        return ILY_SUCCESS;
    }
    if (*ioCount < requiredCount) {
        *ioCount = requiredCount;
        return ILY_ERROR_OUT_OF_MEMORY;
    }

    for (uint32_t index = 0; index < requiredCount; ++index) {
        const auto& source = devices[index];
        auto& destination = outDevices[index];
        destination = IlyCameraCaptureDeviceInfo{};
        const size_t friendlyNameLength =
            (std::min)(source.friendlyName.size(), sizeof(destination.friendlyName) - 1);
        std::memcpy(
            destination.friendlyName,
            source.friendlyName.data(),
            friendlyNameLength);
        destination.friendlyName[friendlyNameLength] = '\0';
        const size_t symbolicLinkLength =
            (std::min)(source.symbolicLink.size(), sizeof(destination.symbolicLink) - 1);
        std::memcpy(
            destination.symbolicLink,
            source.symbolicLink.data(),
            symbolicLinkLength);
        destination.symbolicLink[symbolicLinkLength] = '\0';
    }
    *ioCount = requiredCount;
    return ILY_SUCCESS;
}

ILY_API IlyResult IlyEngineGetCameraCaptureInfo(
    ResourceHandle engineHandle,
    ResourceHandle textureHandle,
    IlyCameraCaptureInfo* outInfo) {
    if (!outInfo) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
    std::lock_guard<std::mutex> lock(g_EngineMutex);
    auto engine = g_Engines.find(engineHandle);
    if (engine == g_Engines.end()) {
        return ILY_ERROR_NOT_FOUND;
    }

    std::lock_guard<std::mutex> instLock(engine->second->mutex);
    auto capture = engine->second->cameraCaptureSessions.find(textureHandle);
    if (capture == engine->second->cameraCaptureSessions.end()) {
        return ILY_ERROR_NOT_FOUND;
    }

    *outInfo = IlyCameraCaptureInfo{};
    outInfo->width = capture->second->GetWidth();
    outInfo->height = capture->second->GetHeight();
    outInfo->frameRateNumerator = capture->second->GetFrameRateNumerator();
    outInfo->frameRateDenominator = capture->second->GetFrameRateDenominator();
    outInfo->format = ILY_PIXEL_FORMAT_BGRA8;
    outInfo->color = IlySrgbFullColor();
    outInfo->gpuFrames = capture->second->UsesGpuFrames();
    const std::string& deviceName = capture->second->GetDeviceName();
    const size_t copyLength =
        (std::min)(deviceName.size(), sizeof(outInfo->deviceName) - 1);
    std::memcpy(outInfo->deviceName, deviceName.data(), copyLength);
    outInfo->deviceName[copyLength] = '\0';
    return ILY_SUCCESS;
}

ILY_API IlyResult IlyEngineCreateColorTexture(ResourceHandle engineHandle, uint32_t color, ResourceHandle* outTextureHandle) {
    if (!outTextureHandle) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
    std::lock_guard<std::mutex> lock(g_EngineMutex);
    auto it = g_Engines.find(engineHandle);
    if (it == g_Engines.end()) {
        return ILY_ERROR_NOT_FOUND;
    }

    std::lock_guard<std::mutex> instLock(it->second->mutex);

    const uint8_t pixel[4] = {
        static_cast<uint8_t>((color >> 24) & 0xFF),
        static_cast<uint8_t>((color >> 16) & 0xFF),
        static_cast<uint8_t>((color >> 8) & 0xFF),
        static_cast<uint8_t>(color & 0xFF)
    };

    ResourceHandle texHandle = it->second->renderer->CreateTexture(1, 1, pixel, sizeof(pixel));
    if (texHandle == ILY_INVALID_HANDLE) {
        return ILY_ERROR_RENDER_FAILED;
    }

    *outTextureHandle = texHandle;
    return ILY_SUCCESS;
}

ILY_API IlyResult IlyEngineCreateTextureFromPixels(ResourceHandle engineHandle, uint32_t width, uint32_t height, const void* rgbaPixels, uint32_t byteLength, ResourceHandle* outTextureHandle) {
    IlyTextureDesc textureDesc{};
    textureDesc.width = width;
    textureDesc.height = height;
    textureDesc.format = ILY_PIXEL_FORMAT_RGBA8;
    textureDesc.color = IlySrgbFullColor();
    textureDesc.alphaMode = ILY_ALPHA_STRAIGHT;
    return IlyEngineCreateTextureFromPixelsEx(
        engineHandle, &textureDesc, rgbaPixels, byteLength, outTextureHandle);
}

ILY_API IlyResult IlyEngineCreateTextureFromPixelsEx(ResourceHandle engineHandle, const IlyTextureDesc* textureDesc, const void* pixels, uint32_t byteLength, ResourceHandle* outTextureHandle) {
    if (!textureDesc || !pixels || !outTextureHandle || textureDesc->width == 0 || textureDesc->height == 0) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
    if (textureDesc->format != ILY_PIXEL_FORMAT_RGBA8 && textureDesc->format != ILY_PIXEL_FORMAT_BGRA8) {
        return ILY_ERROR_NOT_SUPPORTED;
    }
    uint32_t requiredBytes = 0;
    if (!RequiredRgbaBytes(textureDesc->width, textureDesc->height, &requiredBytes) || byteLength < requiredBytes) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
    std::lock_guard<std::mutex> lock(g_EngineMutex);
    auto it = g_Engines.find(engineHandle);
    if (it == g_Engines.end()) {
        return ILY_ERROR_NOT_FOUND;
    }

    std::lock_guard<std::mutex> instLock(it->second->mutex);
    const IlyColorDescription color = NormalizeColorDescription(textureDesc->color, IlySrgbFullColor());
    ResourceHandle texHandle = it->second->renderer->CreateTexture(
        textureDesc->width,
        textureDesc->height,
        pixels,
        byteLength,
        textureDesc->format == ILY_PIXEL_FORMAT_BGRA8,
        color,
        textureDesc->alphaMode);
    if (texHandle == ILY_INVALID_HANDLE) {
        return ILY_ERROR_RENDER_FAILED;
    }
    *outTextureHandle = texHandle;
    return ILY_SUCCESS;
}

ILY_API IlyResult IlyEngineCreateSharedTexture(ResourceHandle engineHandle, const IlyTextureDesc* textureDesc, void* sharedHandle, ResourceHandle* outTextureHandle) {
    if (!textureDesc || !sharedHandle || !outTextureHandle || textureDesc->width == 0 || textureDesc->height == 0) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
    if (textureDesc->format != ILY_PIXEL_FORMAT_RGBA8 && textureDesc->format != ILY_PIXEL_FORMAT_BGRA8) {
        return ILY_ERROR_NOT_SUPPORTED;
    }
    std::lock_guard<std::mutex> lock(g_EngineMutex);
    auto it = g_Engines.find(engineHandle);
    if (it == g_Engines.end()) {
        return ILY_ERROR_NOT_FOUND;
    }

    std::lock_guard<std::mutex> instLock(it->second->mutex);
    const IlyColorDescription color = NormalizeColorDescription(textureDesc->color, IlySrgbFullColor());
    ResourceHandle texHandle = it->second->renderer->CreateSharedTextureFromHandle(
        textureDesc->width,
        textureDesc->height,
        sharedHandle,
        textureDesc->format,
        color,
        textureDesc->alphaMode);
    if (texHandle == ILY_INVALID_HANDLE) {
        return ILY_ERROR_RENDER_FAILED;
    }
    *outTextureHandle = texHandle;
    return ILY_SUCCESS;
}

ILY_API IlyResult IlyEngineGetOutputColorConfig(ResourceHandle engineHandle, IlyOutputColorConfig* outConfig) {
    if (!outConfig) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
    std::lock_guard<std::mutex> lock(g_EngineMutex);
    auto it = g_Engines.find(engineHandle);
    if (it == g_Engines.end()) {
        return ILY_ERROR_NOT_FOUND;
    }
    std::lock_guard<std::mutex> instLock(it->second->mutex);
    *outConfig = it->second->config.outputColor;
    return ILY_SUCCESS;
}

ILY_API IlyResult IlyEngineUpdateTexture(ResourceHandle engineHandle, ResourceHandle textureHandle, const void* rgbaPixels, uint32_t byteLength) {
    if (!rgbaPixels) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
    std::lock_guard<std::mutex> lock(g_EngineMutex);
    auto it = g_Engines.find(engineHandle);
    if (it == g_Engines.end()) {
        return ILY_ERROR_NOT_FOUND;
    }

    std::lock_guard<std::mutex> instLock(it->second->mutex);
    return it->second->renderer->UpdateTexture(textureHandle, rgbaPixels, byteLength);
}

ILY_API IlyResult IlyEngineCreateSpriteProgram(ResourceHandle engineHandle, ResourceHandle* outProgramHandle) {
    if (!outProgramHandle) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
    std::lock_guard<std::mutex> lock(g_EngineMutex);
    auto it = g_Engines.find(engineHandle);
    if (it == g_Engines.end()) {
        return ILY_ERROR_NOT_FOUND;
    }

    std::lock_guard<std::mutex> instLock(it->second->mutex);

    ResourceHandle progHandle = it->second->renderer->CreateSpriteProgram();
    if (progHandle == ILY_INVALID_HANDLE) {
        return ILY_ERROR_INITIALIZATION_FAILED;
    }

    *outProgramHandle = progHandle;
    return ILY_SUCCESS;
}

ILY_API IlyResult IlyEngineDrawQuad(ResourceHandle engineHandle, ResourceHandle textureHandle, const IlyTransform* transform, float opacity, IlyBlendMode blendMode) {
    if (!transform) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
    std::lock_guard<std::mutex> lock(g_EngineMutex);
    auto it = g_Engines.find(engineHandle);
    if (it == g_Engines.end()) {
        return ILY_ERROR_NOT_FOUND;
    }

    std::lock_guard<std::mutex> instLock(it->second->mutex);
    return it->second->renderer->DrawQuad(textureHandle, *transform, opacity, blendMode);
}

namespace {

/**
 * Snapshot a layer list into a render graph. The pass copies the layers so the
 * render thread never references caller memory; an empty list clears the graph.
 */
std::shared_ptr<ily::RenderGraph> BuildLayerGraph(const IlyLayer* layers, uint32_t count) {
    auto graph = std::make_shared<ily::RenderGraph>();
    if (count == 0) return graph;

    std::vector<IlyLayer> layerList(layers, layers + count);
    ily::RenderPass pass;
    pass.name = "layers";
    pass.execute = [layerList](ily::IRenderBackend* backend) -> IlyResult {
        for (const auto& layer : layerList) {
            if (layer.circleMask.enabled && layer.circleMask.radius > 0.0f) {
                // Focus circle: a blurred base draw with a sharp overlay
                // clipped to a circle drawn on top - mirroring the canvas
                // compositor's two draws (getFilters(true) then, inside the
                // arc clip, getFilters(false)). The base carries the blur and
                // any rounded-corner mask; the sharp overlay reuses the same
                // source, transform, and color adjust with no blur. Both draws
                // carry the image mask so it cuts the whole layer.
                IlyResult base = backend->DrawQuad(layer.texture, layer.transform, layer.opacity, layer.blendMode, &layer.chromaKey, &layer.colorAdjust, layer.cornerRadius, layer.blurSigma, nullptr, layer.maskTexture, layer.maskTransform);
                if (base != ILY_SUCCESS) {
                    return base;
                }
                IlyResult sharp = backend->DrawQuad(layer.texture, layer.transform, layer.opacity, layer.blendMode, &layer.chromaKey, &layer.colorAdjust, layer.cornerRadius, 0.0f, &layer.circleMask, layer.maskTexture, layer.maskTransform);
                if (sharp != ILY_SUCCESS) {
                    return sharp;
                }
                continue;
            }
            IlyResult r = backend->DrawQuad(layer.texture, layer.transform, layer.opacity, layer.blendMode, &layer.chromaKey, &layer.colorAdjust, layer.cornerRadius, layer.blurSigma, nullptr, layer.maskTexture, layer.maskTransform);
            if (r != ILY_SUCCESS) {
                return r;
            }
        }
        return ILY_SUCCESS;
    };
    graph->AddPass(pass);
    return graph;
}

} // namespace

ILY_API IlyResult IlyEngineSetLayers(ResourceHandle engineHandle, const IlyLayer* layers, uint32_t count) {
    if (count > 0 && !layers) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
    std::lock_guard<std::mutex> lock(g_EngineMutex);
    auto it = g_Engines.find(engineHandle);
    if (it == g_Engines.end()) {
        return ILY_ERROR_NOT_FOUND;
    }

    std::lock_guard<std::mutex> instLock(it->second->mutex);
    it->second->renderer->SetRenderGraph(BuildLayerGraph(layers, count));
    return ILY_SUCCESS;
}

ILY_API IlyResult IlyEngineCreateOutput(ResourceHandle engineHandle, uint32_t width, uint32_t height, uint32_t* outOutputIndex) {
    if (!outOutputIndex || width == 0 || height == 0) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
    std::lock_guard<std::mutex> lock(g_EngineMutex);
    auto it = g_Engines.find(engineHandle);
    if (it == g_Engines.end()) {
        return ILY_ERROR_NOT_FOUND;
    }

    std::lock_guard<std::mutex> instLock(it->second->mutex);
    const int32_t index = it->second->renderer->CreateOutput(width, height);
    if (index < 0) {
        return ILY_ERROR_RENDER_FAILED;
    }
    *outOutputIndex = static_cast<uint32_t>(index);
    return ILY_SUCCESS;
}

ILY_API IlyResult IlyEngineDestroyOutput(ResourceHandle engineHandle, uint32_t outputIndex) {
    std::lock_guard<std::mutex> lock(g_EngineMutex);
    auto it = g_Engines.find(engineHandle);
    if (it == g_Engines.end()) {
        return ILY_ERROR_NOT_FOUND;
    }

    std::lock_guard<std::mutex> instLock(it->second->mutex);
    it->second->renderer->DestroyOutput(outputIndex);
    return ILY_SUCCESS;
}

ILY_API IlyResult IlyEngineSetLayersForOutput(ResourceHandle engineHandle, uint32_t outputIndex, const IlyLayer* layers, uint32_t count) {
    if (count > 0 && !layers) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
    std::lock_guard<std::mutex> lock(g_EngineMutex);
    auto it = g_Engines.find(engineHandle);
    if (it == g_Engines.end()) {
        return ILY_ERROR_NOT_FOUND;
    }

    std::lock_guard<std::mutex> instLock(it->second->mutex);
    it->second->renderer->SetRenderGraphForOutput(outputIndex, BuildLayerGraph(layers, count));
    return ILY_SUCCESS;
}

ILY_API IlyResult IlyEngineGetSharedOutputTexture(ResourceHandle engineHandle, void** outHandle, uint32_t* outWidth, uint32_t* outHeight) {
    if (!outHandle) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
    *outHandle = nullptr;

    std::lock_guard<std::mutex> lock(g_EngineMutex);
    auto it = g_Engines.find(engineHandle);
    if (it == g_Engines.end()) {
        return ILY_ERROR_NOT_FOUND;
    }

    std::lock_guard<std::mutex> instLock(it->second->mutex);
    return it->second->renderer->GetSharedOutputTexture(outHandle, outWidth, outHeight);
}

ILY_API IlyResult IlyEngineGetSharedOutputTextureForOutput(ResourceHandle engineHandle, uint32_t outputIndex, void** outHandle, uint32_t* outWidth, uint32_t* outHeight) {
    if (!outHandle) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
    *outHandle = nullptr;

    std::lock_guard<std::mutex> lock(g_EngineMutex);
    auto it = g_Engines.find(engineHandle);
    if (it == g_Engines.end()) {
        return ILY_ERROR_NOT_FOUND;
    }

    std::lock_guard<std::mutex> instLock(it->second->mutex);
    return it->second->renderer->GetSharedOutputTextureForOutput(outputIndex, outHandle, outWidth, outHeight);
}

ILY_API IlyResult IlyEngineReadPixels(ResourceHandle engineHandle, void* buffer, uint32_t bufferSize, uint32_t* outWidth, uint32_t* outHeight) {
    if (!buffer) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
    std::lock_guard<std::mutex> lock(g_EngineMutex);
    auto it = g_Engines.find(engineHandle);
    if (it == g_Engines.end()) {
        return ILY_ERROR_NOT_FOUND;
    }

    std::lock_guard<std::mutex> instLock(it->second->mutex);
    return it->second->renderer->ReadPixels(buffer, bufferSize, outWidth, outHeight);
}

ILY_API IlyResult IlyEngineReadPixelsForOutput(ResourceHandle engineHandle, uint32_t outputIndex, void* buffer, uint32_t bufferSize, uint32_t* outWidth, uint32_t* outHeight) {
    if (!buffer) {
        return ILY_ERROR_INVALID_ARGUMENT;
    }
    std::lock_guard<std::mutex> lock(g_EngineMutex);
    auto it = g_Engines.find(engineHandle);
    if (it == g_Engines.end()) {
        return ILY_ERROR_NOT_FOUND;
    }

    std::lock_guard<std::mutex> instLock(it->second->mutex);
    return it->second->renderer->ReadPixelsFromOutput(outputIndex, buffer, bufferSize, outWidth, outHeight);
}

}
