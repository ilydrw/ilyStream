#pragma once

#include "ily/types.h"
#include <string>
#include <vector>
#include <functional>
#include <memory>

namespace ily {

class IRenderBackend;

struct RenderPass {
    std::string name;
    std::vector<ResourceHandle> inputs;
    std::vector<ResourceHandle> outputs;
    
    std::function<IlyResult(IRenderBackend*)> execute;
};

class RenderGraph {
private:
    std::vector<RenderPass> passes;
    std::vector<ResourceHandle> resources;

public:
    RenderGraph() = default;
    ~RenderGraph() = default;

    void AddPass(const RenderPass& pass) {
        passes.push_back(pass);
    }

    void AddResource(ResourceHandle handle) {
        resources.push_back(handle);
    }

    const std::vector<RenderPass>& GetPasses() const {
        return passes;
    }

    const std::vector<ResourceHandle>& GetResources() const {
        return resources;
    }

    void Clear() {
        passes.clear();
        resources.clear();
    }

    IlyResult Execute(IRenderBackend* backend) {
        if (!backend) {
            return ILY_ERROR_INVALID_ARGUMENT;
        }

        for (const auto& pass : passes) {
            if (pass.execute) {
                IlyResult res = pass.execute(backend);
                if (res != ILY_SUCCESS) {
                    return res;
                }
            }
        }
        return ILY_SUCCESS;
    }
};

} // namespace ily
