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

TEST_CASE("Offscreen readback composites a layer", "[readback]") {
    IlyResult res = IlyInitializeSystem();
    REQUIRE((res == ILY_SUCCESS || res == ILY_ERROR_ALREADY_EXISTS));

    const uint32_t W = 320;
    const uint32_t H = 240;
    IlyEngineConfig config{W, H, 60, false};
    ResourceHandle engineHandle = ILY_INVALID_HANDLE;
    res = IlyCreateEngine(&config, &engineHandle);
    REQUIRE(res == ILY_SUCCESS);

    // Opaque green source texture (uint32 RGBA in memory: R=0x00 G=0xFF B=0x00 A=0xFF).
    ResourceHandle tex = ILY_INVALID_HANDLE;
    res = IlyEngineCreateColorTexture(engineHandle, 0xFF00FF00, &tex);
    REQUIRE(res == ILY_SUCCESS);

    // Composite the texture as a 160x120 quad at (80,60) -> covers screen
    // region x:[80,240], y:[60,180]. Center is inside, corners are outside.
    IlyTransform t{};
    t.position = {80.0f, 60.0f, 0.0f};
    t.rotation = {0.0f, 0.0f, 0.0f};
    t.scale = {160.0f, 120.0f, 1.0f};
    t.anchor = {0.0f, 0.0f};
    t.pivot = {0.0f, 0.0f};
    t.crop = {0.0f, 0.0f, 0.0f, 0.0f}; // 0 right/bottom -> full 0..1 UV
    t.visibility = true;
    t.opacity = 1.0f;

    IlyLayer layer{};
    layer.texture = tex;
    layer.transform = t;
    layer.opacity = 1.0f;
    layer.blendMode = ILY_BLEND_ALPHA;

    res = IlyEngineSetLayers(engineHandle, &layer, 1);
    REQUIRE(res == ILY_SUCCESS);

    // Let the render thread composite a few frames into the offscreen target.
    std::this_thread::sleep_for(std::chrono::milliseconds(60));

    std::vector<uint8_t> pixels(static_cast<size_t>(W) * H * 4, 0);
    uint32_t outW = 0, outH = 0;
    res = IlyEngineReadPixels(engineHandle, pixels.data(),
                              static_cast<uint32_t>(pixels.size()), &outW, &outH);
    REQUIRE(res == ILY_SUCCESS);
    REQUIRE(outW == W);
    REQUIRE(outH == H);

    auto ch = [&](uint32_t x, uint32_t y, uint32_t c) -> int {
        return pixels[(static_cast<size_t>(y) * W + x) * 4 + c];
    };

    // Dump a PNG for visual inspection (temp dir; not part of the assertions).
    std::string pngPath = (std::filesystem::temp_directory_path() / "ily_readback_debug.png").string();
    stbi_write_png(pngPath.c_str(), static_cast<int>(W), static_cast<int>(H), 4,
                   pixels.data(), static_cast<int>(W) * 4);
    std::cout << "[readback] wrote " << pngPath
              << " | center(160,120)=("
              << ch(160,120,0) << "," << ch(160,120,1) << "," << ch(160,120,2) << ","  << ch(160,120,3)
              << ") corner(5,5)=("
              << ch(5,5,0) << "," << ch(5,5,1) << "," << ch(5,5,2) << ")" << std::endl;

    // Outside the quad: the 0x1e1e1e clear color.
    REQUIRE(ch(5, 5, 0) == 0x1e);
    REQUIRE(ch(5, 5, 1) == 0x1e);
    REQUIRE(ch(5, 5, 2) == 0x1e);

    // Inside the quad: composited content, distinct from the clear color, and
    // with a dominant green channel matching the source texture.
    const bool insideDiffersFromClear =
        ch(160,120,0) != 0x1e || ch(160,120,1) != 0x1e || ch(160,120,2) != 0x1e;
    REQUIRE(insideDiffersFromClear);
    REQUIRE(ch(160,120,1) > 200);                 // green channel high
    REQUIRE(ch(160,120,0) < 64);                  // red low
    REQUIRE(ch(160,120,2) < 64);                  // blue low

    // Clearing the layer list returns the frame to the pure clear color.
    res = IlyEngineSetLayers(engineHandle, nullptr, 0);
    REQUIRE(res == ILY_SUCCESS);
    std::this_thread::sleep_for(std::chrono::milliseconds(60));
    res = IlyEngineReadPixels(engineHandle, pixels.data(),
                              static_cast<uint32_t>(pixels.size()), &outW, &outH);
    REQUIRE(res == ILY_SUCCESS);
    REQUIRE(ch(160, 120, 0) == 0x1e);
    REQUIRE(ch(160, 120, 1) == 0x1e);
    REQUIRE(ch(160, 120, 2) == 0x1e);

    IlyDestroyEngine(engineHandle);
    IlyShutdownSystem();
}
