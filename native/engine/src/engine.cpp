#include "ily/engine.h"
#include "ily/scene.h"
#include <unordered_map>
#include <mutex>
#include <memory>
#include <string>
#include <cstring>

#include "renderer/renderer.h"
#include "ily/render_graph.h"
#include "ily/render_backend.h"
#include <stb_image.h>
#include <vector>

class EngineInstance {
public:
    IlyEngineConfig config;
    ily::Scene scene;
    std::unordered_map<ResourceHandle, std::string> sources;
    ResourceHandle nextSourceHandle = {1, 1};
    std::unique_ptr<ily::Renderer> renderer;
    std::mutex mutex;

    EngineInstance(const IlyEngineConfig& cfg) : config(cfg) {}
};

static std::unordered_map<ResourceHandle, std::unique_ptr<EngineInstance>> g_Engines;
static ResourceHandle g_NextEngineHandle = {1, 1};
static std::mutex g_EngineMutex;
static bool g_SystemInitialized = false;

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
    
    auto inst = std::make_unique<EngineInstance>(*config);
    inst->renderer = std::make_unique<ily::Renderer>();
    IlyResult res = inst->renderer->Start();
    if (res != ILY_SUCCESS) {
        return res;
    }
    res = inst->renderer->Initialize(*config);
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

    ResourceHandle texHandle = it->second->renderer->CreateTexture(width, height, pixelData);
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
    it->second->renderer->DestroyTexture(textureHandle);
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

    ResourceHandle texHandle = it->second->renderer->CreateTexture(1, 1, &color);
    if (texHandle == ILY_INVALID_HANDLE) {
        return ILY_ERROR_RENDER_FAILED;
    }

    *outTextureHandle = texHandle;
    return ILY_SUCCESS;
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

    // Snapshot the layers into the pass so the render thread draws them every
    // frame without referencing caller memory. Empty list clears the graph.
    auto graph = std::make_shared<ily::RenderGraph>();
    if (count > 0) {
        std::vector<IlyLayer> layerList(layers, layers + count);
        ily::RenderPass pass;
        pass.name = "layers";
        pass.execute = [layerList](ily::IRenderBackend* backend) -> IlyResult {
            for (const auto& layer : layerList) {
                IlyResult r = backend->DrawQuad(layer.texture, layer.transform, layer.opacity, layer.blendMode);
                if (r != ILY_SUCCESS) {
                    return r;
                }
            }
            return ILY_SUCCESS;
        };
        graph->AddPass(pass);
    }
    it->second->renderer->SetRenderGraph(graph);
    return ILY_SUCCESS;
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

}
