#include <catch2/catch_test_macros.hpp>
#include "ily/engine.h"
#include "ily/scene.h"
#include <nlohmann/json.hpp>
#include <vector>
#include <string>

TEST_CASE("Engine LifeCycle", "[engine]") {
    IlyResult res = IlyInitializeSystem();
    REQUIRE(res == ILY_SUCCESS);

    IlyEngineConfig config{1920, 1080, 60, false};
    ResourceHandle engineHandle = ILY_INVALID_HANDLE;

    res = IlyCreateEngine(&config, &engineHandle);
    REQUIRE(res == ILY_SUCCESS);
    REQUIRE(engineHandle != ILY_INVALID_HANDLE);

    res = IlyEngineUpdate(engineHandle, 0.016f);
    REQUIRE(res == ILY_SUCCESS);

    res = IlyEngineRender(engineHandle);
    REQUIRE(res == ILY_SUCCESS);

    res = IlyDestroyEngine(engineHandle);
    REQUIRE(res == ILY_SUCCESS);

    IlyShutdownSystem();
}

TEST_CASE("Scene Serialization", "[scene]") {
    IlyResult initRes = IlyInitializeSystem();
    REQUIRE((initRes == ILY_SUCCESS || initRes == ILY_ERROR_ALREADY_EXISTS));
    
    IlyEngineConfig config{1920, 1080, 60, false};
    ResourceHandle engineHandle = ILY_INVALID_HANDLE;
    IlyCreateEngine(&config, &engineHandle);

    uint32_t size = 0;
    IlyResult res = IlyEngineGetSceneJson(engineHandle, nullptr, &size);
    REQUIRE(res == ILY_SUCCESS);
    REQUIRE(size > 0);

    std::vector<char> buffer(size);
    res = IlyEngineGetSceneJson(engineHandle, buffer.data(), &size);
    REQUIRE(res == ILY_SUCCESS);

    auto j = nlohmann::json::parse(buffer.data());
    REQUIRE(j.contains("version"));
    REQUIRE(j["version"] == 1);
    REQUIRE(j.contains("root"));
    int rootIndex = j["root"];
    REQUIRE(j["nodes"][rootIndex]["id"] == "root");

    // Modify the scene JSON using the versioned flat-indexing structure
    j["nodes"][rootIndex]["children"] = nlohmann::json::array({1});
    
    nlohmann::json childNode = {
        {"id", "node1"},
        {"name", "Test Source Node"},
        {"sourceHandle", 42},
        {"dirtyFlags", 15},
        {"parent", rootIndex},
        {"children", nlohmann::json::array()},
        {"transform", {
            {"position", {{"x", 10.0f}, {"y", 20.0f}, {"z", 0.0f}}},
            {"rotation", {{"x", 0.0f}, {"y", 0.0f}, {"z", 45.0f}}},
            {"scale", {{"x", 1.0f}, {"y", 1.0f}, {"z", 1.0f}}},
            {"anchor", {{"x", 0.5f}, {"y", 0.5f}}},
            {"pivot", {{"x", 0.0f}, {"y", 0.0f}}},
            {"crop", {{"left", 0.0f}, {"top", 0.0f}, {"right", 10.0f}, {"bottom", 20.0f}}},
            {"visibility", true},
            {"opacity", 0.8f}
        }}
    };
    j["nodes"].push_back(childNode);

    std::string newSceneStr = j.dump();
    res = IlyEngineSetSceneJson(engineHandle, newSceneStr.c_str());
    REQUIRE(res == ILY_SUCCESS);

    uint32_t size2 = 0;
    IlyEngineGetSceneJson(engineHandle, nullptr, &size2);
    std::vector<char> buffer2(size2);
    IlyEngineGetSceneJson(engineHandle, buffer2.data(), &size2);

    auto j2 = nlohmann::json::parse(buffer2.data());
    REQUIRE(j2["nodes"].size() == 2);
    REQUIRE(j2["nodes"][1]["id"] == "node1");
    REQUIRE(j2["nodes"][1]["transform"]["position"]["x"] == 10.0f);

    IlyDestroyEngine(engineHandle);
    IlyShutdownSystem();
}
