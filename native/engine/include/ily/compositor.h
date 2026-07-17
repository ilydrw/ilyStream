#pragma once
#include "ily/types.h"
#include "ily/resource_manager.h"
#include "ily/render_backend.h"
#include <vector>
#include <mutex>

namespace ily {

struct RenderCommand {
    ResourceHandle texture;
    IlyTransform transform;
    float opacity;
    IlyBlendMode blendMode;
};

class Compositor {
private:
    ResourceManager& m_resourceManager;
    mutable std::mutex m_mutex;

public:
    Compositor(ResourceManager& rm) : m_resourceManager(rm) {}
    ~Compositor() = default;

    IlyResult Execute(IRenderBackend* backend, const std::vector<RenderCommand>& commands) {
        if (!backend) {
            return ILY_ERROR_INVALID_ARGUMENT;
        }

        std::lock_guard<std::mutex> lock(m_mutex);
        for (const auto& cmd : commands) {
            // Check visibility
            if (!cmd.transform.visibility) {
                continue;
            }
            
            // Execute drawing command
            IlyResult res = backend->DrawQuad(cmd.texture, cmd.transform, cmd.opacity, cmd.blendMode);
            if (res != ILY_SUCCESS) {
                return res;
            }
        }
        return ILY_SUCCESS;
    }
};

} // namespace ily
