#pragma once

#include "ily/types.h"
#include <vector>
#include <mutex>
#include <memory>
#include <string>
#include <functional>
#include <unordered_map>

namespace ily {

enum class ResourceType {
    Unknown = 0,
    Texture,
    Shader,
    Producer
};

class IResource {
public:
    virtual ~IResource() = default;
    virtual ResourceType GetType() const = 0;
};

struct ResourceEntry {
    ResourceType type = ResourceType::Unknown;
    uint32_t generation = 0;
    bool active = false;
    bool loaded = false;
    uint64_t lastUsedFrameIndex = 0;
    std::shared_ptr<IResource> resource;
};

class ResourceManager {
private:
    std::vector<ResourceEntry> pool;
    std::vector<uint32_t> freeIndices;
    std::unordered_map<std::string, ResourceHandle> nameCache;
    mutable std::mutex mutex;

public:
    ResourceManager() = default;
    ~ResourceManager() = default;

    // Allocate a resource in the pool and return a handle
    ResourceHandle Create(ResourceType type, std::shared_ptr<IResource> resource) {
        std::lock_guard<std::mutex> lock(mutex);
        uint32_t index;
        if (!freeIndices.empty()) {
            index = freeIndices.back();
            freeIndices.pop_back();
        } else {
            index = static_cast<uint32_t>(pool.size());
            pool.emplace_back();
        }

        pool[index].type = type;
        pool[index].resource = std::move(resource);
        pool[index].active = true;
        pool[index].loaded = true;
        pool[index].lastUsedFrameIndex = 0;
        pool[index].generation++;

        return ResourceHandle{index, pool[index].generation};
    }

    // Allocate with a cache lookup name
    ResourceHandle GetOrCreate(const std::string& name, ResourceType type, std::function<std::shared_ptr<IResource>()> creator) {
        std::lock_guard<std::mutex> lock(mutex);
        auto it = nameCache.find(name);
        if (it != nameCache.end()) {
            ResourceHandle handle = it->second;
            if (handle.index < pool.size()) {
                const auto& entry = pool[handle.index];
                if (entry.active && entry.generation == handle.generation) {
                    return handle;
                }
            }
        }

        std::shared_ptr<IResource> res = creator();
        if (!res) {
            return ILY_INVALID_HANDLE;
        }

        uint32_t index;
        if (!freeIndices.empty()) {
            index = freeIndices.back();
            freeIndices.pop_back();
        } else {
            index = static_cast<uint32_t>(pool.size());
            pool.emplace_back();
        }

        pool[index].type = type;
        pool[index].resource = std::move(res);
        pool[index].active = true;
        pool[index].loaded = true;
        pool[index].lastUsedFrameIndex = 0;
        pool[index].generation++;

        ResourceHandle handle = ResourceHandle{index, pool[index].generation};
        nameCache[name] = handle;
        return handle;
    }

    // Retrieve a resource by handle, returning nullptr if invalid/expired
    std::shared_ptr<IResource> Get(ResourceHandle handle) {
        std::lock_guard<std::mutex> lock(mutex);
        if (handle.index >= pool.size()) {
            return nullptr;
        }
        const auto& entry = pool[handle.index];
        if (!entry.active || entry.generation != handle.generation) {
            return nullptr;
        }
        return entry.resource;
    }

    template <typename T>
    std::shared_ptr<T> GetAs(ResourceHandle handle) {
        auto res = Get(handle);
        return std::dynamic_pointer_cast<T>(res);
    }

    // Destroy/release a resource by handle
    bool Destroy(ResourceHandle handle) {
        std::lock_guard<std::mutex> lock(mutex);
        if (handle.index >= pool.size()) {
            return false;
        }
        auto& entry = pool[handle.index];
        if (!entry.active || entry.generation != handle.generation) {
            return false;
        }

        // Clean up from cache if present
        for (auto it = nameCache.begin(); it != nameCache.end(); ) {
            if (it->second == handle) {
                it = nameCache.erase(it);
            } else {
                ++it;
            }
        }

        entry.resource.reset();
        entry.active = false;
        entry.loaded = false;
        freeIndices.push_back(handle.index);
        return true;
    }

    // Clear all managed resources
    void Clear() {
        std::lock_guard<std::mutex> lock(mutex);
        pool.clear();
        freeIndices.clear();
        nameCache.clear();
    }

    // Helper to update last used frame
    void UpdateLastUsedFrame(ResourceHandle handle, uint64_t frameIndex) {
        std::lock_guard<std::mutex> lock(mutex);
        if (handle.index < pool.size()) {
            auto& entry = pool[handle.index];
            if (entry.active && entry.generation == handle.generation) {
                entry.lastUsedFrameIndex = frameIndex;
            }
        }
    }

    // Check if handle is valid
    bool IsValid(ResourceHandle handle) const {
        std::lock_guard<std::mutex> lock(mutex);
        if (handle.index >= pool.size()) {
            return false;
        }
        const auto& entry = pool[handle.index];
        return entry.active && entry.generation == handle.generation;
    }
};

} // namespace ily
