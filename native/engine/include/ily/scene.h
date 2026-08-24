#pragma once

#include "ily/types.h"
#include <nlohmann/json.hpp>
#include <string>
#include <vector>
#include <memory>
#include <stdexcept>

// ResourceHandle JSON serialization support
inline void to_json(nlohmann::json& j, const ResourceHandle& handle) {
    j = ResourceHandleToUint64(handle);
}

inline void from_json(const nlohmann::json& j, ResourceHandle& handle) {
    if (j.is_number_integer()) {
        handle = Uint64ToResourceHandle(j.get<uint64_t>());
    } else {
        j.at("index").get_to(handle.index);
        j.at("generation").get_to(handle.generation);
    }
}

// Serialization for global C structs
inline void to_json(nlohmann::json& j, const IlyVec2& v) {
    j = nlohmann::json{{"x", v.x}, {"y", v.y}};
}
inline void from_json(const nlohmann::json& j, IlyVec2& v) {
    j.at("x").get_to(v.x);
    j.at("y").get_to(v.y);
}

inline void to_json(nlohmann::json& j, const IlyVec3& v) {
    j = nlohmann::json{{"x", v.x}, {"y", v.y}, {"z", v.z}};
}
inline void from_json(const nlohmann::json& j, IlyVec3& v) {
    j.at("x").get_to(v.x);
    j.at("y").get_to(v.y);
    j.at("z").get_to(v.z);
}

inline void to_json(nlohmann::json& j, const IlyRect& r) {
    j = nlohmann::json{{"left", r.left}, {"top", r.top}, {"right", r.right}, {"bottom", r.bottom}};
}
inline void from_json(const nlohmann::json& j, IlyRect& r) {
    j.at("left").get_to(r.left);
    j.at("top").get_to(r.top);
    j.at("right").get_to(r.right);
    j.at("bottom").get_to(r.bottom);
}

inline void to_json(nlohmann::json& j, const IlyTransform& t) {
    j = nlohmann::json{
        {"position", t.position},
        {"rotation", t.rotation},
        {"scale", t.scale},
        {"anchor", t.anchor},
        {"pivot", t.pivot},
        {"crop", t.crop},
        {"visibility", t.visibility},
        {"opacity", t.opacity}
    };
}
inline void from_json(const nlohmann::json& j, IlyTransform& t) {
    j.at("position").get_to(t.position);
    j.at("rotation").get_to(t.rotation);
    j.at("scale").get_to(t.scale);
    j.at("anchor").get_to(t.anchor);
    j.at("pivot").get_to(t.pivot);
    j.at("crop").get_to(t.crop);
    j.at("visibility").get_to(t.visibility);
    j.at("opacity").get_to(t.opacity);
}

namespace ily {

using SceneNodeId = int32_t;
constexpr SceneNodeId ILY_INVALID_NODE_ID = -1;

enum SceneNodeDirtyFlags : uint32_t {
    DIRTY_NONE       = 0,
    DIRTY_TRANSFORM  = 1 << 0,
    DIRTY_VISIBILITY = 1 << 1,
    DIRTY_CHILDREN   = 1 << 2,
    DIRTY_ALL        = 0xFFFFFFFF
};

struct SceneNode {
    std::string id;
    std::string name;
    ResourceHandle sourceHandle = ILY_INVALID_HANDLE;
    IlyTransform transform = IlyTransform{
        {0.0f, 0.0f, 0.0f}, // position
        {0.0f, 0.0f, 0.0f}, // rotation
        {1.0f, 1.0f, 1.0f}, // scale
        {0.0f, 0.0f},       // anchor
        {0.0f, 0.0f},       // pivot
        {0.0f, 0.0f, 0.0f, 0.0f}, // crop
        true,               // visibility
        1.0f                // opacity
    };
    uint32_t dirtyFlags = DIRTY_ALL;
    SceneNodeId parent = ILY_INVALID_NODE_ID;
    std::vector<SceneNodeId> children;

    void SetTransform(const IlyTransform& newTransform) {
        transform = newTransform;
        dirtyFlags |= DIRTY_TRANSFORM;
    }

    void SetVisibility(bool visible) {
        transform.visibility = visible;
        dirtyFlags |= DIRTY_VISIBILITY;
    }
};

struct Scene {
    int32_t version = 1;
    std::vector<SceneNode> nodes;
    SceneNodeId root = ILY_INVALID_NODE_ID;

    Scene() {
        SceneNode rootNode;
        rootNode.id = "root";
        rootNode.name = "Root";
        rootNode.parent = ILY_INVALID_NODE_ID;
        nodes.push_back(rootNode);
        root = 0;
    }
};

inline void to_json(nlohmann::json& j, const SceneNode& node) {
    j = nlohmann::json{
        {"id", node.id},
        {"name", node.name},
        {"sourceHandle", node.sourceHandle},
        {"transform", node.transform},
        {"dirtyFlags", node.dirtyFlags},
        {"parent", node.parent},
        {"children", node.children}
    };
}

inline void from_json(const nlohmann::json& j, SceneNode& node) {
    j.at("id").get_to(node.id);
    j.at("name").get_to(node.name);
    j.at("sourceHandle").get_to(node.sourceHandle);
    j.at("transform").get_to(node.transform);
    j.at("dirtyFlags").get_to(node.dirtyFlags);
    if (j.contains("parent")) {
        j.at("parent").get_to(node.parent);
    } else {
        node.parent = ILY_INVALID_NODE_ID;
    }
    if (j.contains("children")) {
        j.at("children").get_to(node.children);
    } else {
        node.children.clear();
    }
}

inline void to_json(nlohmann::json& j, const Scene& scene) {
    j = nlohmann::json{
        {"version", scene.version},
        {"root", scene.root},
        {"nodes", scene.nodes}
    };
}

inline void from_json(const nlohmann::json& j, Scene& scene) {
    j.at("version").get_to(scene.version);
    if (scene.version != 1) {
        throw std::runtime_error("Unsupported scene version. Enforced version is 1.");
    }
    j.at("root").get_to(scene.root);
    j.at("nodes").get_to(scene.nodes);
}

} // namespace ily
