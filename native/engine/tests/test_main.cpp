#include <catch2/catch_test_macros.hpp>
#include "ily/engine.h"
#include "../../common/video_color.h"
#include "ily/scene.h"
#include <nlohmann/json.hpp>
#include <vector>
#include <string>

TEST_CASE("Platform capabilities are versioned and ABI-safe", "[platform]") {
    REQUIRE(IlyGetPlatformCapabilities(nullptr) == ILY_ERROR_INVALID_ARGUMENT);

    IlyPlatformCapabilities capabilities{};
    capabilities.structSize = sizeof(capabilities);
    REQUIRE(IlyGetPlatformCapabilities(&capabilities) == ILY_SUCCESS);
    REQUIRE(capabilities.version == ILY_PLATFORM_CAPABILITIES_VERSION);
    REQUIRE(capabilities.reserved == 0);

#if defined(_WIN32)
    REQUIRE((capabilities.flags & ILY_PLATFORM_CAPABILITY_SCREEN_CAPTURE) != 0);
    REQUIRE((capabilities.flags & ILY_PLATFORM_CAPABILITY_CAMERA_CAPTURE) != 0);
    REQUIRE((capabilities.flags & ILY_PLATFORM_CAPABILITY_SHARED_TEXTURES) != 0);
    REQUIRE((capabilities.flags & ILY_PLATFORM_CAPABILITY_SECURE_STORE) != 0);
#elif defined(__APPLE__)
    REQUIRE((capabilities.flags & ILY_PLATFORM_CAPABILITY_SECURE_STORE) != 0);
#else
    REQUIRE(capabilities.flags == 0);
#endif
}

TEST_CASE("Engine LifeCycle", "[engine]") {
    IlyResult res = IlyInitializeSystem();
    REQUIRE(res == ILY_SUCCESS);

    IlyEngineConfig config{1920, 1080, 60, false};
    ResourceHandle engineHandle = ILY_INVALID_HANDLE;

    res = IlyCreateEngine(&config, &engineHandle);
    REQUIRE(res == ILY_SUCCESS);
    REQUIRE(engineHandle != ILY_INVALID_HANDLE);

    IlyOutputColorConfig outputColor{};
    res = IlyEngineGetOutputColorConfig(engineHandle, &outputColor);
    REQUIRE(res == ILY_SUCCESS);
    REQUIRE(outputColor.format == ILY_PIXEL_FORMAT_RGBA8);
    REQUIRE(outputColor.color.primaries == ILY_COLOR_PRIMARIES_BT709);
    REQUIRE(outputColor.color.transfer == ILY_TRANSFER_SRGB);
    REQUIRE(outputColor.color.matrix == ILY_MATRIX_RGB);
    REQUIRE(outputColor.color.range == ILY_COLOR_RANGE_FULL);
    REQUIRE(outputColor.sdrWhiteNits == 100.0f);
    REQUIRE(outputColor.hdrNominalPeakNits == 1000.0f);

    res = IlyEngineUpdate(engineHandle, 0.016f);
    REQUIRE(res == ILY_SUCCESS);

    res = IlyEngineRender(engineHandle);
    REQUIRE(res == ILY_SUCCESS);

    res = IlyDestroyEngine(engineHandle);
    REQUIRE(res == ILY_SUCCESS);

    IlyShutdownSystem();
}

TEST_CASE("BT.709 limited-range conversion uses legal reference levels", "[color]") {
    const auto black = ily::color::RgbToBt709Limited(0, 0, 0);
    REQUIRE(black.y == 16);
    REQUIRE(black.u == 128);
    REQUIRE(black.v == 128);

    const auto white = ily::color::RgbToBt709Limited(255, 255, 255);
    REQUIRE(white.y == 235);
    REQUIRE(white.u == 128);
    REQUIRE(white.v == 128);

    const auto red = ily::color::RgbToBt709Limited(255, 0, 0);
    REQUIRE(red.y == 63);
    REQUIRE(red.u == 102);
    REQUIRE(red.v == 240);
}

TEST_CASE("Media Foundation camera enumeration follows the two-call API", "[camera]") {
    REQUIRE(
        IlyEngineGetCameraCaptureDevices(nullptr, nullptr)
        == ILY_ERROR_INVALID_ARGUMENT);

    uint32_t count = 0;
    REQUIRE(
        IlyEngineGetCameraCaptureDevices(nullptr, &count)
        == ILY_SUCCESS);

    std::vector<IlyCameraCaptureDeviceInfo> devices(count);
    uint32_t capacity = count;
    REQUIRE(
        IlyEngineGetCameraCaptureDevices(devices.data(), &capacity)
        == ILY_SUCCESS);
    REQUIRE(capacity == count);

    for (const auto& device : devices) {
        REQUIRE(device.friendlyName[0] != '\0');
        REQUIRE(device.symbolicLink[0] != '\0');
    }
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
