#include <catch2/catch_test_macros.hpp>
#include "ily/engine.h"
#include "ily/resource_manager.h"
#include "ily/resources.h"
#include "ily/compositor.h"
#include "renderer/renderer.h"

#define STB_IMAGE_WRITE_IMPLEMENTATION
#include <stb_image_write.h>
#include <filesystem>
#include <thread>
#include <vector>
#include <iostream>

TEST_CASE("Generational Resource Handle version mismatch", "[resource_manager]") {
    ily::ResourceManager rm;
    
    // Create a resource
    auto dummyTex = std::make_shared<ily::TextureResource>(16, 16, bgfx::TextureFormat::RGBA8, bgfx::TextureHandle{0xFFFF});
    ResourceHandle handle = rm.Create(ily::ResourceType::Texture, dummyTex);
    
    REQUIRE(rm.IsValid(handle));
    REQUIRE(rm.GetAs<ily::TextureResource>(handle) != nullptr);
    
    // Destroy it
    rm.Destroy(handle);
    
    // Old handle should not be valid
    REQUIRE_FALSE(rm.IsValid(handle));
    REQUIRE(rm.GetAs<ily::TextureResource>(handle) == nullptr);
    
    // Create another resource. It should reuse the index but bump the generation count.
    auto dummyTex2 = std::make_shared<ily::TextureResource>(32, 32, bgfx::TextureFormat::RGBA8, bgfx::TextureHandle{0xFFFF});
    ResourceHandle handle2 = rm.Create(ily::ResourceType::Texture, dummyTex2);
    
    // The new handle index should match the reused one, but generation should be different
    REQUIRE(handle.index == handle2.index);
    REQUIRE(handle.generation != handle2.generation);
    
    // Retrieving with old handle should STILL fail
    REQUIRE_FALSE(rm.IsValid(handle));
    REQUIRE(rm.GetAs<ily::TextureResource>(handle) == nullptr);
    
    // Retrieving with new handle should succeed
    REQUIRE(rm.IsValid(handle2));
    REQUIRE(rm.GetAs<ily::TextureResource>(handle2) != nullptr);
    REQUIRE(rm.GetAs<ily::TextureResource>(handle2)->GetWidth() == 32);
}

TEST_CASE("Color/Image uploads and Quad draws", "[texture_pipeline]") {
    IlyResult res = IlyInitializeSystem();
    REQUIRE((res == ILY_SUCCESS || res == ILY_ERROR_ALREADY_EXISTS));

    IlyEngineConfig config{1280, 720, 60, false};
    ResourceHandle engineHandle = ILY_INVALID_HANDLE;
    res = IlyCreateEngine(&config, &engineHandle);
    REQUIRE(res == ILY_SUCCESS);
    REQUIRE(engineHandle != ILY_INVALID_HANDLE);

    // 1. Color texture creation
    ResourceHandle colorTex = ILY_INVALID_HANDLE;
    res = IlyEngineCreateColorTexture(engineHandle, 0xFF00FF00, &colorTex); // Green 1x1
    REQUIRE(res == ILY_SUCCESS);
    REQUIRE(colorTex != ILY_INVALID_HANDLE);

    // 2. Image texture creation
    // Write a dummy 4x4 PNG first
    std::string tempPath = "temp_test_image.png";
    uint32_t pixels[16];
    std::fill_n(pixels, 16, 0xFFFF00FF); // Purple
    int writeRes = stbi_write_png(tempPath.c_str(), 4, 4, 4, pixels, 16);
    REQUIRE(writeRes != 0);

    ResourceHandle imgTex = ILY_INVALID_HANDLE;
    res = IlyEngineLoadTexture(engineHandle, tempPath.c_str(), &imgTex);
    REQUIRE(res == ILY_SUCCESS);
    REQUIRE(imgTex != ILY_INVALID_HANDLE);

    // Compile sprite program
    ResourceHandle programHandle = ILY_INVALID_HANDLE;
    res = IlyEngineCreateSpriteProgram(engineHandle, &programHandle);
    REQUIRE(res == ILY_SUCCESS);
    REQUIRE(programHandle != ILY_INVALID_HANDLE);

    // 3. Quad drawing
    IlyTransform transform{};
    transform.position = {0.0f, 0.0f, 0.0f};
    transform.rotation = {0.0f, 0.0f, 0.0f};
    transform.scale = {1.0f, 1.0f, 1.0f};
    transform.anchor = {0.5f, 0.5f};
    transform.pivot = {0.5f, 0.5f};
    transform.crop = {0.0f, 0.0f, 1.0f, 1.0f};
    transform.visibility = true;
    transform.opacity = 1.0f;

    res = IlyEngineDrawQuad(engineHandle, colorTex, &transform, 1.0f, ILY_BLEND_ALPHA);
    REQUIRE(res == ILY_SUCCESS);

    res = IlyEngineDrawQuad(engineHandle, imgTex, &transform, 0.8f, ILY_BLEND_ADD);
    REQUIRE(res == ILY_SUCCESS);

    // Clean up textures
    res = IlyEngineDestroyTexture(engineHandle, colorTex);
    REQUIRE(res == ILY_SUCCESS);
    res = IlyEngineDestroyTexture(engineHandle, imgTex);
    REQUIRE(res == ILY_SUCCESS);

    // Clean up temp image file
    std::filesystem::remove(tempPath);

    res = IlyDestroyEngine(engineHandle);
    REQUIRE(res == ILY_SUCCESS);
    IlyShutdownSystem();
}

TEST_CASE("Stress test creating/destroying 10,000 textures under load", "[texture_pipeline]") {
    IlyResult res = IlyInitializeSystem();
    REQUIRE((res == ILY_SUCCESS || res == ILY_ERROR_ALREADY_EXISTS));

    IlyEngineConfig config{1280, 720, 60, false};
    ResourceHandle engineHandle = ILY_INVALID_HANDLE;
    res = IlyCreateEngine(&config, &engineHandle);
    REQUIRE(res == ILY_SUCCESS);

    uint32_t color = 0xFFFFFFFF;
    std::vector<ResourceHandle> textures;
    textures.reserve(1000);

    // Create and destroy 10,000 textures under load
    for (int i = 0; i < 10000; ++i) {
        ResourceHandle tex = ILY_INVALID_HANDLE;
        res = IlyEngineCreateColorTexture(engineHandle, color, &tex);
        REQUIRE(res == ILY_SUCCESS);
        textures.push_back(tex);
        
        if (textures.size() >= 500) {
            for (auto t : textures) {
                res = IlyEngineDestroyTexture(engineHandle, t);
                REQUIRE(res == ILY_SUCCESS);
            }
            textures.clear();
            
            // Allow background render thread to advance its frame and flush deferred bgfx releases
            std::this_thread::sleep_for(std::chrono::milliseconds(30));
        }
    }
    
    for (auto t : textures) {
        res = IlyEngineDestroyTexture(engineHandle, t);
        REQUIRE(res == ILY_SUCCESS);
    }

    IlyDestroyEngine(engineHandle);
    IlyShutdownSystem();
}

TEST_CASE("Stress test shader reloading", "[texture_pipeline]") {
    IlyResult res = IlyInitializeSystem();
    REQUIRE((res == ILY_SUCCESS || res == ILY_ERROR_ALREADY_EXISTS));

    IlyEngineConfig config{1280, 720, 60, false};
    ResourceHandle engineHandle = ILY_INVALID_HANDLE;
    res = IlyCreateEngine(&config, &engineHandle);
    REQUIRE(res == ILY_SUCCESS);

    // Reload shader 200 times under load
    for (int i = 0; i < 200; ++i) {
        ResourceHandle programHandle = ILY_INVALID_HANDLE;
        res = IlyEngineCreateSpriteProgram(engineHandle, &programHandle);
        REQUIRE(res == ILY_SUCCESS);
        REQUIRE(programHandle != ILY_INVALID_HANDLE);
    }

    IlyDestroyEngine(engineHandle);
    IlyShutdownSystem();
}
