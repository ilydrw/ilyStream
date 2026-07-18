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
 * @brief Create a 1x1 solid color texture.
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
 * @brief Create a hardware-accelerated screen capture session on the native engine.
 *
 * The engine will spawn a background thread using DXGI Desktop Duplication
 * to directly stream the monitor into a texture on the GPU. The returned
 * texture handle is automatically updated by the engine without V8/IPC overhead.
 * To stop the capture session, pass the handle to IlyEngineDestroyTexture.
 */
ILY_API IlyResult IlyEngineCreateScreenCapture(ResourceHandle engineHandle, uint32_t monitorIndex, uint32_t targetFps, ResourceHandle* outTextureHandle);

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
