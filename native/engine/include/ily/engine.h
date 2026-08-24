#pragma once

#include "ily/types.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Initialize the global engine system.
 */
ILY_API IlyResult IlyInitializeSystem(void);

/**
 * @brief Shutdown the global engine system.
 */
ILY_API void IlyShutdownSystem(void);

/**
 * @brief Create an engine instance.
 * @param config Configuration options for the engine.
 * @param outEngineHandle Pointer to receive the created engine handle.
 */
ILY_API IlyResult IlyCreateEngine(const IlyEngineConfig* config, ResourceHandle* outEngineHandle);

/**
 * @brief Destroy an engine instance.
 * @param engineHandle Handle of the engine to destroy.
 */
ILY_API IlyResult IlyDestroyEngine(ResourceHandle engineHandle);

/**
 * @brief Update the engine state for the current frame.
 * @param engineHandle Handle of the engine.
 * @param deltaTime Seconds elapsed since the last frame.
 */
ILY_API IlyResult IlyEngineUpdate(ResourceHandle engineHandle, float deltaTime);

/**
 * @brief Render the current scene.
 * @param engineHandle Handle of the engine.
 */
ILY_API IlyResult IlyEngineRender(ResourceHandle engineHandle);

/**
 * @brief Set the active scene using a JSON string.
 * @param engineHandle Handle of the engine.
 * @param sceneJson The JSON string representing the scene structure.
 */
ILY_API IlyResult IlyEngineSetSceneJson(ResourceHandle engineHandle, const char* sceneJson);

/**
 * @brief Get the current scene as a JSON string.
 * @param engineHandle Handle of the engine.
 * @param outBuffer Buffer to write the JSON string into. Can be NULL to query required size.
 * @param ioBufferSize Pointer to the buffer size. On entry, contains size of outBuffer. On exit, contains required size.
 */
ILY_API IlyResult IlyEngineGetSceneJson(ResourceHandle engineHandle, char* outBuffer, uint32_t* ioBufferSize);

/**
 * @brief Register a source to be used in scenes.
 * @param engineHandle Handle of the engine.
 * @param sourceId Unique identifier for the source.
 * @param name User-friendly name of the source.
 * @param type The type of the source (e.g. "camera", "image").
 * @param outSourceHandle Pointer to receive the registered source handle.
 */
ILY_API IlyResult IlyEngineRegisterSource(ResourceHandle engineHandle, const char* sourceId, const char* name, const char* type, ResourceHandle* outSourceHandle);

/**
 * @brief Unregister a source.
 * @param engineHandle Handle of the engine.
 * @param sourceHandle Handle of the source to unregister.
 */
ILY_API IlyResult IlyEngineUnregisterSource(ResourceHandle engineHandle, ResourceHandle sourceHandle);

/**
 * @brief Load a texture from an image file.
 */
ILY_API IlyResult IlyEngineLoadTexture(ResourceHandle engineHandle, const char* filePath, ResourceHandle* outTextureHandle);

/**
 * @brief Destroy a texture.
 */
ILY_API IlyResult IlyEngineDestroyTexture(ResourceHandle engineHandle, ResourceHandle textureHandle);

/**
 * @brief Create a 1x1 solid color texture from a packed 0xRRGGBBAA value.
 */
ILY_API IlyResult IlyEngineCreateColorTexture(ResourceHandle engineHandle, uint32_t color, ResourceHandle* outTextureHandle);

/**
 * @brief Create a texture from tightly packed RGBA8 pixels supplied by the host.
 *
 * This is the general "upload a frame from the app" path — camera/video/canvas
 * sources feed pixels this way. @p rgbaPixels must be width*height*4 bytes.
 */
ILY_API IlyResult IlyEngineCreateTextureFromPixels(ResourceHandle engineHandle, uint32_t width, uint32_t height, const void* rgbaPixels, uint32_t byteLength, ResourceHandle* outTextureHandle);

/**
 * @brief Create a texture with an explicit pixel/color/alpha description.
 */
ILY_API IlyResult IlyEngineCreateTextureFromPixelsEx(ResourceHandle engineHandle, const IlyTextureDesc* textureDesc, const void* pixels, uint32_t byteLength, ResourceHandle* outTextureHandle);

/**
 * @brief Import a texture the host already owns on the GPU, by shared handle.
 *
 * The counterpart to IlyEngineGetSharedOutputTexture: instead of handing our
 * output to someone else, we adopt someone else's surface as a source. The
 * caller keeps ownership of @p sharedHandle and must keep it alive until the
 * returned texture is passed to IlyEngineDestroyTexture.
 *
 * This is the zero-copy path for host-produced frames — Chromium offscreen
 * browser sources hand over a D3D11 NT handle per paint, which would otherwise
 * cost a GPU readback, a CPU bitmap and a re-upload per frame per source.
 */
ILY_API IlyResult IlyEngineCreateSharedTexture(ResourceHandle engineHandle, const IlyTextureDesc* textureDesc, void* sharedHandle, ResourceHandle* outTextureHandle);

/**
 * @brief Create a hardware-accelerated screen capture session on the native engine.
 *
 * The engine will spawn a background thread using DXGI Desktop Duplication
 * to copy the monitor into a shared D3D11 texture imported by the renderer. The
 * returned texture handle is automatically updated without per-frame V8/IPC
 * texture uploads.
 * To stop the capture session, pass the handle to IlyEngineDestroyTexture.
 */
ILY_API IlyResult IlyEngineCreateScreenCapture(ResourceHandle engineHandle, uint32_t monitorIndex, uint32_t targetFps, ResourceHandle* outTextureHandle, char* outSharedMemoryName, uint32_t nameBufSize);

/**
 * @brief Enumerate attached DXGI outputs in the same global index space used by capture.
 * Pass NULL for outDisplays to query the required count.
 */
ILY_API IlyResult IlyEngineGetScreenCaptureDisplays(IlyScreenCaptureDisplayInfo* outDisplays, uint32_t* ioCount);

/**
 * @brief Get format, color-space and luminance metadata for a screen capture.
 */
ILY_API IlyResult IlyEngineGetScreenCaptureInfo(ResourceHandle engineHandle, ResourceHandle textureHandle, IlyScreenCaptureInfo* outInfo);

/**
 * @brief Add a compositor output beside the engine's own (index 0).
 *
 * Outputs share this engine's textures and all composite inside one GPU frame,
 * so a second output (e.g. a 9:16 feed beside the 16:9 program) costs one extra
 * composite rather than a second engine, device and camera capture. Each output
 * carries its own layer list via IlyEngineSetLayersForOutput. Writes the new
 * output's index, which stays stable until it is destroyed.
 */
ILY_API IlyResult IlyEngineCreateOutput(ResourceHandle engineHandle, uint32_t width, uint32_t height, uint32_t* outOutputIndex);

/** @brief Destroy an output created by IlyEngineCreateOutput. Output 0 is the engine's own and is ignored. */
ILY_API IlyResult IlyEngineDestroyOutput(ResourceHandle engineHandle, uint32_t outputIndex);

/** @brief Set the retained layer list for one output. Index 0 is equivalent to IlyEngineSetLayers. */
ILY_API IlyResult IlyEngineSetLayersForOutput(ResourceHandle engineHandle, uint32_t outputIndex, const IlyLayer* layers, uint32_t count);

/** @brief Read one output's composited frame back as RGBA8, at that output's own size. */
ILY_API IlyResult IlyEngineReadPixelsForOutput(ResourceHandle engineHandle, uint32_t outputIndex, void* buffer, uint32_t bufferSize, uint32_t* outWidth, uint32_t* outHeight);

/** @brief Native shared-texture handle for one output's presentation texture. */
ILY_API IlyResult IlyEngineGetSharedOutputTextureForOutput(ResourceHandle engineHandle, uint32_t outputIndex, void** outHandle, uint32_t* outWidth, uint32_t* outHeight);

/**
 * @brief Describe the dedicated two-slot Program video export for output 0.
 *
 * The returned handle values belong to the engine process and are useful for
 * same-process diagnostics only. A consumer in another process must receive
 * handles created by IlyEngineDuplicateProgramExportHandles instead.
 */
ILY_API IlyResult IlyEngineGetProgramExportDescriptor(ResourceHandle engineHandle, IlyProgramExportDescriptor* outDescriptor);

/** Enable or disable demand-driven Program export publication. Disabled by default. */
ILY_API IlyResult IlyEngineSetProgramExportEnabled(ResourceHandle engineHandle, bool enabled);

/**
 * @brief Duplicate Program export handles into an authenticated consumer.
 *
 * The caller must authenticate and strictly validate @p targetProcessId before
 * invoking this function.
 * @p expectedGeneration and @p expectedSlotCount make resource replacement
 * fail closed. On success the target process owns every returned handle and
 * must CloseHandle them when the generation is replaced or the connection
 * closes. No handle is duplicated when validation fails.
 */
ILY_API IlyResult IlyEngineDuplicateProgramExportHandles(
    ResourceHandle engineHandle,
    uint32_t targetProcessId,
    uint64_t expectedGeneration,
    uint32_t expectedSlotCount,
    IlyProgramExportDuplicatedHandles* outHandles);

/**
 * @brief Create a Windows Media Foundation camera capture session.
 *
 * deviceIdentity accepts a Media Foundation symbolic link, a browser camera
 * label, or a friendly name. The returned texture updates on a native capture
 * thread without sending RGBA frames through V8/Electron IPC. Destroy the
 * texture to stop the capture session.
 */
ILY_API IlyResult IlyEngineCreateCameraCapture(ResourceHandle engineHandle, const char* deviceIdentity, uint32_t width, uint32_t height, uint32_t targetFps, ResourceHandle* outTextureHandle);

/**
 * @brief Enumerate Media Foundation camera devices.
 * Pass NULL for outDevices to query the required count.
 */
ILY_API IlyResult IlyEngineGetCameraCaptureDevices(IlyCameraCaptureDeviceInfo* outDevices, uint32_t* ioCount);

/**
 * @brief Get the selected device and negotiated media format for a camera capture.
 */
ILY_API IlyResult IlyEngineGetCameraCaptureInfo(ResourceHandle engineHandle, ResourceHandle textureHandle, IlyCameraCaptureInfo* outInfo);

/**
 * @brief Update an existing texture's pixels in place (RGBA8, width*height*4).
 *
 * Reuses the GPU texture rather than reallocating — the per-frame path for a
 * live source. The texture must already be the right size (see
 * IlyEngineCreateTextureFromPixels).
 */
ILY_API IlyResult IlyEngineUpdateTexture(ResourceHandle engineHandle, ResourceHandle textureHandle, const void* rgbaPixels, uint32_t byteLength);

/**
 * @brief Create the sprite shader program.
 */
ILY_API IlyResult IlyEngineCreateSpriteProgram(ResourceHandle engineHandle, ResourceHandle* outProgramHandle);

/**
 * @brief Draw a textured quad.
 */
ILY_API IlyResult IlyEngineDrawQuad(ResourceHandle engineHandle, ResourceHandle textureHandle, const IlyTransform* transform, float opacity, IlyBlendMode blendMode);

/**
 * @brief Set the retained layer list the engine composites every frame.
 *
 * Each layer is a texture drawn with a transform/opacity/blend mode. The engine
 * redraws this list into its offscreen target on every frame, so the result can
 * be read back with IlyEngineReadPixels. Passing count == 0 clears the layers.
 * The layer array is copied; the caller need not keep it alive.
 */
ILY_API IlyResult IlyEngineSetLayers(ResourceHandle engineHandle, const IlyLayer* layers, uint32_t count);

/**
 * @brief Get the engine-owned native shared handle for the compositor output.
 *
 * On Windows this is an NT HANDLE for an RGBA8 D3D11 texture suitable for
 * Electron's sharedTexture import API. The handle must not be closed by the
 * caller and remains valid until the engine is resized or destroyed.
 */
ILY_API IlyResult IlyEngineGetSharedOutputTexture(ResourceHandle engineHandle, void** outHandle, uint32_t* outWidth, uint32_t* outHeight);

/**
 * @brief Get the normalized color description of the compositor output.
 */
ILY_API IlyResult IlyEngineGetOutputColorConfig(ResourceHandle engineHandle, IlyOutputColorConfig* outConfig);

/**
 * @brief Read the latest composited frame back as tightly packed RGBA8.
 *
 * @param buffer     Destination buffer; must be at least width*height*4 bytes.
 * @param bufferSize Size of buffer in bytes.
 * @param outWidth   Receives the surface width (may be NULL).
 * @param outHeight  Receives the surface height (may be NULL).
 */
ILY_API IlyResult IlyEngineReadPixels(ResourceHandle engineHandle, void* buffer, uint32_t bufferSize, uint32_t* outWidth, uint32_t* outHeight);

#ifdef __cplusplus
}
#endif
