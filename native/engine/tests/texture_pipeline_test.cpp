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
#include <array>
#include <cstdlib>

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
    res = IlyEngineCreateColorTexture(engineHandle, 0x00FF00FF, &colorTex); // Green RGBA
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
    res = IlyEngineCreateColorTexture(engineHandle, 0x00FF00FF, &tex);
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

    t.visibility = false;
    layer.transform = t;
    res = IlyEngineSetLayers(engineHandle, &layer, 1);
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

TEST_CASE("Alpha layers blend in linear light", "[readback][color]") {
    IlyResult res = IlyInitializeSystem();
    REQUIRE((res == ILY_SUCCESS || res == ILY_ERROR_ALREADY_EXISTS));

    constexpr uint32_t W = 64;
    constexpr uint32_t H = 64;
    IlyEngineConfig config{W, H, 60, false};
    ResourceHandle engineHandle = ILY_INVALID_HANDLE;
    REQUIRE(IlyCreateEngine(&config, &engineHandle) == ILY_SUCCESS);

    ResourceHandle black = ILY_INVALID_HANDLE;
    ResourceHandle halfWhite = ILY_INVALID_HANDLE;
    REQUIRE(IlyEngineCreateColorTexture(engineHandle, 0x000000FF, &black) == ILY_SUCCESS);
    REQUIRE(IlyEngineCreateColorTexture(engineHandle, 0xFFFFFF80, &halfWhite) == ILY_SUCCESS);

    IlyTransform transform{};
    transform.scale = {static_cast<float>(W), static_cast<float>(H), 1.0f};
    transform.visibility = true;
    transform.opacity = 1.0f;

    IlyLayer layers[2]{};
    layers[0] = {black, transform, 1.0f, ILY_BLEND_ALPHA};
    layers[1] = {halfWhite, transform, 1.0f, ILY_BLEND_ALPHA};
    REQUIRE(IlyEngineSetLayers(engineHandle, layers, 2) == ILY_SUCCESS);

    std::this_thread::sleep_for(std::chrono::milliseconds(60));
    std::vector<uint8_t> pixels(static_cast<size_t>(W) * H * 4, 0);
    uint32_t outWidth = 0;
    uint32_t outHeight = 0;
    REQUIRE(IlyEngineReadPixels(
        engineHandle,
        pixels.data(),
        static_cast<uint32_t>(pixels.size()),
        &outWidth,
        &outHeight) == ILY_SUCCESS);

    const size_t center = (static_cast<size_t>(H / 2) * W + W / 2) * 4;
    for (size_t channel = 0; channel < 3; ++channel) {
        REQUIRE(pixels[center + channel] >= 186);
        REQUIRE(pixels[center + channel] <= 190);
    }
    REQUIRE(pixels[center + 3] == 255);

    IlyDestroyEngine(engineHandle);
    IlyShutdownSystem();
}

TEST_CASE("sRGB texture colors survive the linear compositor", "[readback][color]") {
    IlyResult res = IlyInitializeSystem();
    REQUIRE((res == ILY_SUCCESS || res == ILY_ERROR_ALREADY_EXISTS));

    constexpr uint32_t W = 9;
    constexpr uint32_t H = 8;
    const std::array<std::array<uint8_t, 4>, W> chart{{
        {{0, 0, 0, 255}},
        {{18, 18, 18, 255}},
        {{64, 64, 64, 255}},
        {{128, 128, 128, 255}},
        {{255, 255, 255, 255}},
        {{255, 0, 0, 255}},
        {{0, 255, 0, 255}},
        {{0, 0, 255, 255}},
        {{12, 85, 203, 255}}
    }};

    ResourceHandle engineHandle = ILY_INVALID_HANDLE;
    IlyEngineConfig config{W, H, 60, false};
    REQUIRE(IlyCreateEngine(&config, &engineHandle) == ILY_SUCCESS);

    std::vector<uint8_t> source(static_cast<size_t>(W) * H * 4);
    for (uint32_t y = 0; y < H; ++y) {
        for (uint32_t x = 0; x < W; ++x) {
            const size_t offset = (static_cast<size_t>(y) * W + x) * 4;
            for (size_t channel = 0; channel < 4; ++channel) {
                source[offset + channel] = chart[x][channel];
            }
        }
    }

    IlyTextureDesc description{};
    description.width = W;
    description.height = H;
    description.format = ILY_PIXEL_FORMAT_RGBA8;
    description.color = IlySrgbFullColor();
    description.alphaMode = ILY_ALPHA_OPAQUE;

    ResourceHandle texture = ILY_INVALID_HANDLE;
    REQUIRE(IlyEngineCreateTextureFromPixelsEx(
        engineHandle,
        &description,
        source.data(),
        static_cast<uint32_t>(source.size()),
        &texture) == ILY_SUCCESS);

    IlyTransform transform{};
    transform.scale = {1.0f, 1.0f, 1.0f};
    transform.visibility = true;
    transform.opacity = 1.0f;

    IlyLayer layer{texture, transform, 1.0f, ILY_BLEND_ALPHA};
    REQUIRE(IlyEngineSetLayers(engineHandle, &layer, 1) == ILY_SUCCESS);

    std::this_thread::sleep_for(std::chrono::milliseconds(60));
    std::vector<uint8_t> output(static_cast<size_t>(W) * H * 4, 0);
    uint32_t outputWidth = 0;
    uint32_t outputHeight = 0;
    REQUIRE(IlyEngineReadPixels(
        engineHandle,
        output.data(),
        static_cast<uint32_t>(output.size()),
        &outputWidth,
        &outputHeight) == ILY_SUCCESS);
    REQUIRE(outputWidth == W);
    REQUIRE(outputHeight == H);

    for (uint32_t x = 0; x < W; ++x) {
        const size_t offset = (static_cast<size_t>(H / 2) * W + x) * 4;
        for (size_t channel = 0; channel < 3; ++channel) {
            INFO("x=" << x << " channel=" << channel);
            REQUIRE(std::abs(static_cast<int>(output[offset + channel]) -
                             static_cast<int>(chart[x][channel])) <= 2);
        }
        REQUIRE(output[offset + 3] == 255);
    }

    IlyDestroyEngine(engineHandle);
    IlyShutdownSystem();
}

TEST_CASE("Dynamic Texture Creation and Updating", "[texture_pipeline]") {
    IlyResult res = IlyInitializeSystem();
    REQUIRE((res == ILY_SUCCESS || res == ILY_ERROR_ALREADY_EXISTS));

    const uint32_t W = 160;
    const uint32_t H = 120;
    IlyEngineConfig config{W, H, 60, false};
    ResourceHandle engineHandle = ILY_INVALID_HANDLE;
    res = IlyCreateEngine(&config, &engineHandle);
    REQUIRE(res == ILY_SUCCESS);

    const uint32_t texW = 64;
    const uint32_t texH = 64;
    std::vector<uint8_t> pixels(texW * texH * 4, 0xFF); // White texture

    // 1. Create Texture
    ResourceHandle dynamicTex = ILY_INVALID_HANDLE;
    res = IlyEngineCreateTextureFromPixels(engineHandle, texW, texH, pixels.data(), static_cast<uint32_t>(pixels.size()), &dynamicTex);
    REQUIRE(res == ILY_SUCCESS);
    REQUIRE(dynamicTex != ILY_INVALID_HANDLE);

    // Test byteLength validation for creation
    ResourceHandle invalidTex = ILY_INVALID_HANDLE;
    res = IlyEngineCreateTextureFromPixels(engineHandle, texW, texH, pixels.data(), static_cast<uint32_t>(pixels.size()) - 1, &invalidTex);
    REQUIRE(res == ILY_ERROR_INVALID_ARGUMENT); // Assuming the API returns error or invalid handle. The implementation returns INVALID_HANDLE and C API maps it to INVALID_ARGUMENT.
    
    // 2. Update Texture
    // Change to solid red
    for (size_t i = 0; i < pixels.size(); i += 4) {
        pixels[i] = 0xFF;     // R
        pixels[i+1] = 0x00;   // G
        pixels[i+2] = 0x00;   // B
        pixels[i+3] = 0xFF;   // A
    }
    res = IlyEngineUpdateTexture(engineHandle, dynamicTex, pixels.data(), static_cast<uint32_t>(pixels.size()));
    REQUIRE(res == ILY_SUCCESS);

    // Test byteLength validation for update
    res = IlyEngineUpdateTexture(engineHandle, dynamicTex, pixels.data(), static_cast<uint32_t>(pixels.size()) - 1);
    REQUIRE(res == ILY_ERROR_INVALID_ARGUMENT);

    // Test 64-bit overflow guard (try to create a huge texture)
    ResourceHandle hugeTex = ILY_INVALID_HANDLE;
    res = IlyEngineCreateTextureFromPixels(engineHandle, 65536, 65536, pixels.data(), static_cast<uint32_t>(pixels.size()), &hugeTex);
    REQUIRE(res == ILY_ERROR_INVALID_ARGUMENT);

    IlyDestroyEngine(engineHandle);
    IlyShutdownSystem();
}

TEST_CASE("Chroma key removes the keyed color natively", "[readback][chroma]") {
    IlyResult res = IlyInitializeSystem();
    REQUIRE((res == ILY_SUCCESS || res == ILY_ERROR_ALREADY_EXISTS));

    const uint32_t W = 320;
    const uint32_t H = 240;
    IlyEngineConfig config{W, H, 60, false};
    ResourceHandle engineHandle = ILY_INVALID_HANDLE;
    res = IlyCreateEngine(&config, &engineHandle);
    REQUIRE(res == ILY_SUCCESS);

    // Opaque green source (0xRRGGBBAA packing).
    ResourceHandle tex = ILY_INVALID_HANDLE;
    res = IlyEngineCreateColorTexture(engineHandle, 0x00FF00FF, &tex);
    REQUIRE(res == ILY_SUCCESS);

    IlyTransform t{};
    t.position = {80.0f, 60.0f, 0.0f};
    t.rotation = {0.0f, 0.0f, 0.0f};
    t.scale = {160.0f, 120.0f, 1.0f};
    t.anchor = {0.0f, 0.0f};
    t.pivot = {0.0f, 0.0f};
    t.crop = {0.0f, 0.0f, 0.0f, 0.0f};
    t.visibility = true;
    t.opacity = 1.0f;

    IlyLayer layer{};
    layer.texture = tex;
    layer.transform = t;
    layer.opacity = 1.0f;
    layer.blendMode = ILY_BLEND_ALPHA;
    layer.chromaKey.enabled = true;
    layer.chromaKey.keyR = 0.0f;
    layer.chromaKey.keyG = 1.0f;
    layer.chromaKey.keyB = 0.0f;
    layer.chromaKey.similarity = 0.4f;
    layer.chromaKey.smoothness = 0.1f;
    layer.chromaKey.spill = 0.1f;

    res = IlyEngineSetLayers(engineHandle, &layer, 1);
    REQUIRE(res == ILY_SUCCESS);
    std::this_thread::sleep_for(std::chrono::milliseconds(60));

    std::vector<uint8_t> pixels(static_cast<size_t>(W) * H * 4, 0);
    uint32_t outW = 0, outH = 0;
    res = IlyEngineReadPixels(engineHandle, pixels.data(),
                              static_cast<uint32_t>(pixels.size()), &outW, &outH);
    REQUIRE(res == ILY_SUCCESS);

    auto ch = [&](uint32_t x, uint32_t y, uint32_t c) -> int {
        return pixels[(static_cast<size_t>(y) * W + x) * 4 + c];
    };

    // The pure-green quad is inside the key band -> fully keyed out, so the
    // center shows the clear color, exactly like the region outside the quad.
    REQUIRE(ch(160, 120, 0) == ch(5, 5, 0));
    REQUIRE(ch(160, 120, 1) == ch(5, 5, 1));
    REQUIRE(ch(160, 120, 2) == ch(5, 5, 2));

    // Disabling the key on the same layer restores the green quad, proving the
    // uniform toggles per draw rather than sticking.
    layer.chromaKey.enabled = false;
    res = IlyEngineSetLayers(engineHandle, &layer, 1);
    REQUIRE(res == ILY_SUCCESS);
    std::this_thread::sleep_for(std::chrono::milliseconds(60));
    res = IlyEngineReadPixels(engineHandle, pixels.data(),
                              static_cast<uint32_t>(pixels.size()), &outW, &outH);
    REQUIRE(res == ILY_SUCCESS);
    REQUIRE(ch(160, 120, 1) > 200);
    REQUIRE(ch(160, 120, 0) < 64);

    // A non-matching color (magenta) with the same key must NOT be keyed.
    ResourceHandle magenta = ILY_INVALID_HANDLE;
    res = IlyEngineCreateColorTexture(engineHandle, 0xFF00FFFF, &magenta);
    REQUIRE(res == ILY_SUCCESS);
    layer.texture = magenta;
    layer.chromaKey.enabled = true;
    res = IlyEngineSetLayers(engineHandle, &layer, 1);
    REQUIRE(res == ILY_SUCCESS);
    std::this_thread::sleep_for(std::chrono::milliseconds(60));
    res = IlyEngineReadPixels(engineHandle, pixels.data(),
                              static_cast<uint32_t>(pixels.size()), &outW, &outH);
    REQUIRE(res == ILY_SUCCESS);
    REQUIRE(ch(160, 120, 0) > 200);
    REQUIRE(ch(160, 120, 2) > 200);
    REQUIRE(ch(160, 120, 1) < 64);

    IlyDestroyEngine(engineHandle);
    IlyShutdownSystem();
}

TEST_CASE("Color adjust applies the layer's color matrix natively", "[readback][coloradjust]") {
    IlyResult res = IlyInitializeSystem();
    REQUIRE((res == ILY_SUCCESS || res == ILY_ERROR_ALREADY_EXISTS));

    const uint32_t W = 320;
    const uint32_t H = 240;
    IlyEngineConfig config{W, H, 60, false};
    ResourceHandle engineHandle = ILY_INVALID_HANDLE;
    res = IlyCreateEngine(&config, &engineHandle);
    REQUIRE(res == ILY_SUCCESS);

    // Opaque red source (0xRRGGBBAA packing).
    ResourceHandle tex = ILY_INVALID_HANDLE;
    res = IlyEngineCreateColorTexture(engineHandle, 0xFF0000FF, &tex);
    REQUIRE(res == ILY_SUCCESS);

    IlyTransform t{};
    t.position = {80.0f, 60.0f, 0.0f};
    t.rotation = {0.0f, 0.0f, 0.0f};
    t.scale = {160.0f, 120.0f, 1.0f};
    t.anchor = {0.0f, 0.0f};
    t.pivot = {0.0f, 0.0f};
    t.crop = {0.0f, 0.0f, 0.0f, 0.0f};
    t.visibility = true;
    t.opacity = 1.0f;

    IlyLayer layer{};
    layer.texture = tex;
    layer.transform = t;
    layer.opacity = 1.0f;
    layer.blendMode = ILY_BLEND_ALPHA;

    // CSS grayscale(100%): every output channel is the Rec.709-ish luma of the
    // input. Pure red -> r=g=b=0.2126 in gamma space (the shader re-encodes
    // hardware-decoded sRGB samples before applying the matrix, so the value
    // survives the linear composite + output re-encode roundtrip).
    layer.colorAdjust.enabled = true;
    const float gray[12] = {
        0.2126f, 0.7152f, 0.0722f, 0.0f,
        0.2126f, 0.7152f, 0.0722f, 0.0f,
        0.2126f, 0.7152f, 0.0722f, 0.0f
    };
    for (int i = 0; i < 12; ++i) layer.colorAdjust.matrix[i] = gray[i];
    layer.colorAdjust.alpha = 1.0f;

    res = IlyEngineSetLayers(engineHandle, &layer, 1);
    REQUIRE(res == ILY_SUCCESS);
    std::this_thread::sleep_for(std::chrono::milliseconds(60));

    std::vector<uint8_t> pixels(static_cast<size_t>(W) * H * 4, 0);
    uint32_t outW = 0, outH = 0;
    res = IlyEngineReadPixels(engineHandle, pixels.data(),
                              static_cast<uint32_t>(pixels.size()), &outW, &outH);
    REQUIRE(res == ILY_SUCCESS);

    auto ch = [&](uint32_t x, uint32_t y, uint32_t c) -> int {
        return pixels[(static_cast<size_t>(y) * W + x) * 4 + c];
    };

    const int expected = static_cast<int>(0.2126f * 255.0f + 0.5f); // 54
    for (uint32_t c = 0; c < 3; ++c) {
        REQUIRE(std::abs(ch(160, 120, c) - expected) <= 3);
    }

    // The contrast intercept lands in the offset column: contrast(0%) collapses
    // everything to mid gray regardless of input color.
    const float flat[12] = {
        0.0f, 0.0f, 0.0f, 0.5f,
        0.0f, 0.0f, 0.0f, 0.5f,
        0.0f, 0.0f, 0.0f, 0.5f
    };
    for (int i = 0; i < 12; ++i) layer.colorAdjust.matrix[i] = flat[i];
    res = IlyEngineSetLayers(engineHandle, &layer, 1);
    REQUIRE(res == ILY_SUCCESS);
    std::this_thread::sleep_for(std::chrono::milliseconds(60));
    res = IlyEngineReadPixels(engineHandle, pixels.data(),
                              static_cast<uint32_t>(pixels.size()), &outW, &outH);
    REQUIRE(res == ILY_SUCCESS);
    for (uint32_t c = 0; c < 3; ++c) {
        REQUIRE(std::abs(ch(160, 120, c) - 128) <= 3);
    }

    // Disabling the adjust on the same layer restores pure red, proving the
    // uniforms toggle per draw rather than sticking.
    layer.colorAdjust.enabled = false;
    res = IlyEngineSetLayers(engineHandle, &layer, 1);
    REQUIRE(res == ILY_SUCCESS);
    std::this_thread::sleep_for(std::chrono::milliseconds(60));
    res = IlyEngineReadPixels(engineHandle, pixels.data(),
                              static_cast<uint32_t>(pixels.size()), &outW, &outH);
    REQUIRE(res == ILY_SUCCESS);
    REQUIRE(ch(160, 120, 0) > 200);
    REQUIRE(ch(160, 120, 1) < 32);
    REQUIRE(ch(160, 120, 2) < 32);

    IlyDestroyEngine(engineHandle);
    IlyShutdownSystem();
}

TEST_CASE("Corner radius masks the quad's corners natively", "[readback][cornerradius]") {
    IlyResult res = IlyInitializeSystem();
    REQUIRE((res == ILY_SUCCESS || res == ILY_ERROR_ALREADY_EXISTS));

    const uint32_t W = 320;
    const uint32_t H = 240;
    IlyEngineConfig config{W, H, 60, false};
    ResourceHandle engineHandle = ILY_INVALID_HANDLE;
    res = IlyCreateEngine(&config, &engineHandle);
    REQUIRE(res == ILY_SUCCESS);

    // Opaque white quad at (80,60)..(240,180).
    ResourceHandle tex = ILY_INVALID_HANDLE;
    res = IlyEngineCreateColorTexture(engineHandle, 0xFFFFFFFF, &tex);
    REQUIRE(res == ILY_SUCCESS);

    IlyTransform t{};
    t.position = {80.0f, 60.0f, 0.0f};
    t.rotation = {0.0f, 0.0f, 0.0f};
    t.scale = {160.0f, 120.0f, 1.0f};
    t.anchor = {0.0f, 0.0f};
    t.pivot = {0.0f, 0.0f};
    t.crop = {0.0f, 0.0f, 0.0f, 0.0f};
    t.visibility = true;
    t.opacity = 1.0f;

    IlyLayer layer{};
    layer.texture = tex;
    layer.transform = t;
    layer.opacity = 1.0f;
    layer.blendMode = ILY_BLEND_ALPHA;
    layer.cornerRadius = 40.0f;

    res = IlyEngineSetLayers(engineHandle, &layer, 1);
    REQUIRE(res == ILY_SUCCESS);
    std::this_thread::sleep_for(std::chrono::milliseconds(60));

    std::vector<uint8_t> pixels(static_cast<size_t>(W) * H * 4, 0);
    uint32_t outW = 0, outH = 0;
    res = IlyEngineReadPixels(engineHandle, pixels.data(),
                              static_cast<uint32_t>(pixels.size()), &outW, &outH);
    REQUIRE(res == ILY_SUCCESS);

    auto ch = [&](uint32_t x, uint32_t y, uint32_t c) -> int {
        return pixels[(static_cast<size_t>(y) * W + x) * 4 + c];
    };

    // Center and edge midpoints stay opaque white.
    REQUIRE(ch(160, 120, 0) > 240);
    REQUIRE(ch(160, 62, 0) > 240);   // top edge midpoint
    REQUIRE(ch(82, 120, 0) > 240);   // left edge midpoint

    // The quad corner itself is masked out (radius 40 clips well past the
    // corner pixel), showing the background like the region outside the quad.
    REQUIRE(ch(82, 62, 0) == ch(5, 5, 0));
    // A point inside the corner's bounding box but on the rounded arc's far
    // side stays visible: (80+40,60+40) is the corner circle's center.
    REQUIRE(ch(120, 100, 0) > 240);

    // Radius 0 disables the mask and restores square corners.
    layer.cornerRadius = 0.0f;
    res = IlyEngineSetLayers(engineHandle, &layer, 1);
    REQUIRE(res == ILY_SUCCESS);
    std::this_thread::sleep_for(std::chrono::milliseconds(60));
    res = IlyEngineReadPixels(engineHandle, pixels.data(),
                              static_cast<uint32_t>(pixels.size()), &outW, &outH);
    REQUIRE(res == ILY_SUCCESS);
    REQUIRE(ch(82, 62, 0) > 240);

    IlyDestroyEngine(engineHandle);
    IlyShutdownSystem();
}

TEST_CASE("Blur softens the quad's edges without bleeding outside it", "[readback][blur]") {
    IlyResult res = IlyInitializeSystem();
    REQUIRE((res == ILY_SUCCESS || res == ILY_ERROR_ALREADY_EXISTS));

    const uint32_t W = 320;
    const uint32_t H = 240;
    IlyEngineConfig config{W, H, 60, false};
    ResourceHandle engineHandle = ILY_INVALID_HANDLE;
    res = IlyCreateEngine(&config, &engineHandle);
    REQUIRE(res == ILY_SUCCESS);

    // Opaque white quad at (80,60)..(240,180).
    ResourceHandle tex = ILY_INVALID_HANDLE;
    res = IlyEngineCreateColorTexture(engineHandle, 0xFFFFFFFF, &tex);
    REQUIRE(res == ILY_SUCCESS);

    IlyTransform t{};
    t.position = {80.0f, 60.0f, 0.0f};
    t.rotation = {0.0f, 0.0f, 0.0f};
    t.scale = {160.0f, 120.0f, 1.0f};
    t.anchor = {0.0f, 0.0f};
    t.pivot = {0.0f, 0.0f};
    t.crop = {0.0f, 0.0f, 0.0f, 0.0f};
    t.visibility = true;
    t.opacity = 1.0f;

    IlyLayer layer{};
    layer.texture = tex;
    layer.transform = t;
    layer.opacity = 1.0f;
    layer.blendMode = ILY_BLEND_ALPHA;
    layer.blurSigma = 2.0f;

    res = IlyEngineSetLayers(engineHandle, &layer, 1);
    REQUIRE(res == ILY_SUCCESS);
    std::this_thread::sleep_for(std::chrono::milliseconds(90));

    std::vector<uint8_t> pixels(static_cast<size_t>(W) * H * 4, 0);
    uint32_t outW = 0, outH = 0;
    res = IlyEngineReadPixels(engineHandle, pixels.data(),
                              static_cast<uint32_t>(pixels.size()), &outW, &outH);
    REQUIRE(res == ILY_SUCCESS);

    auto ch = [&](uint32_t x, uint32_t y, uint32_t c) -> int {
        return pixels[(static_cast<size_t>(y) * W + x) * 4 + c];
    };

    // Blurring a constant region leaves the deep interior untouched — the
    // kernel is normalized, so any drift here means bad weights or a broken
    // gamma round-trip through the intermediate.
    REQUIRE(ch(160, 120, 0) > 250);
    REQUIRE(ch(160, 120, 1) > 250);
    REQUIRE(ch(160, 120, 2) > 250);

    // The outermost quad pixel blurs against the transparent padding, so it
    // darkens toward the background (a white/dark mix, clearly below full
    // white and clearly above background).
    const int background = ch(5, 5, 0);
    const int edge = ch(80, 120, 0);
    REQUIRE(edge < 220);
    REQUIRE(edge > background + 30);

    // The composite crops the padding back off, so nothing bleeds outside the
    // quad: 3 pixels out is pure background, exactly like the far corner.
    REQUIRE(ch(77, 120, 0) == background);
    REQUIRE(ch(160, 57, 0) == ch(5, 5, 0));

    // Sigma 0 disables the pipeline and restores the hard edge.
    layer.blurSigma = 0.0f;
    res = IlyEngineSetLayers(engineHandle, &layer, 1);
    REQUIRE(res == ILY_SUCCESS);
    std::this_thread::sleep_for(std::chrono::milliseconds(90));
    res = IlyEngineReadPixels(engineHandle, pixels.data(),
                              static_cast<uint32_t>(pixels.size()), &outW, &outH);
    REQUIRE(res == ILY_SUCCESS);
    REQUIRE(ch(80, 120, 0) > 250);

    IlyDestroyEngine(engineHandle);
    IlyShutdownSystem();
}

TEST_CASE("Focus circle keeps a sharp disc over a blurred base", "[readback][focuscircle]") {
    IlyResult res = IlyInitializeSystem();
    REQUIRE((res == ILY_SUCCESS || res == ILY_ERROR_ALREADY_EXISTS));

    const uint32_t W = 320;
    const uint32_t H = 240;
    IlyEngineConfig config{W, H, 60, false};
    ResourceHandle engineHandle = ILY_INVALID_HANDLE;
    res = IlyCreateEngine(&config, &engineHandle);
    REQUIRE(res == ILY_SUCCESS);

    // Opaque white quad at (80,60)..(240,180), 160x120.
    ResourceHandle tex = ILY_INVALID_HANDLE;
    res = IlyEngineCreateColorTexture(engineHandle, 0xFFFFFFFF, &tex);
    REQUIRE(res == ILY_SUCCESS);

    IlyTransform t{};
    t.position = {80.0f, 60.0f, 0.0f};
    t.rotation = {0.0f, 0.0f, 0.0f};
    t.scale = {160.0f, 120.0f, 1.0f};
    t.anchor = {0.0f, 0.0f};
    t.pivot = {0.0f, 0.0f};
    t.crop = {0.0f, 0.0f, 0.0f, 0.0f};
    t.visibility = true;
    t.opacity = 1.0f;

    // A large blur (sigma 8 -> downscale 2, exercising the downsampled-
    // intermediate path) plus a sharp circle centered on the quad's LEFT edge.
    // A solid color only changes under blur near the quad boundary, so the
    // circle is placed to cover one edge: the sharp overlay keeps the left edge
    // crisp while the far (right) edge stays softened by the base blur.
    IlyLayer layer{};
    layer.texture = tex;
    layer.transform = t;
    layer.opacity = 1.0f;
    layer.blendMode = ILY_BLEND_ALPHA;
    layer.blurSigma = 8.0f;
    layer.circleMask.enabled = true;
    layer.circleMask.x = 0.0f;    // quad-local, left edge
    layer.circleMask.y = 60.0f;   // quad-local, vertical center
    layer.circleMask.radius = 60.0f;

    res = IlyEngineSetLayers(engineHandle, &layer, 1);
    REQUIRE(res == ILY_SUCCESS);
    std::this_thread::sleep_for(std::chrono::milliseconds(90));

    std::vector<uint8_t> pixels(static_cast<size_t>(W) * H * 4, 0);
    uint32_t outW = 0, outH = 0;
    res = IlyEngineReadPixels(engineHandle, pixels.data(),
                              static_cast<uint32_t>(pixels.size()), &outW, &outH);
    REQUIRE(res == ILY_SUCCESS);

    auto ch = [&](uint32_t x, uint32_t y, uint32_t c) -> int {
        return pixels[(static_cast<size_t>(y) * W + x) * 4 + c];
    };
    const int background = ch(5, 5, 0);

    // Deep interior stays full white: a normalized kernel (even downsampled)
    // must not drift a constant region.
    REQUIRE(ch(160, 120, 0) > 250);

    // Left edge is INSIDE the sharp circle: the sharp overlay restores full
    // white right up to the quad edge despite the heavy base blur.
    const int leftEdge = ch(82, 120, 0);
    REQUIRE(leftEdge > 250);

    // Far (right) edge is OUTSIDE the circle: only the blurred base reaches it,
    // so it softens toward the background — clearly darker than the sharp edge.
    const int rightEdge = ch(238, 120, 0);
    REQUIRE(rightEdge < 235);
    REQUIRE(leftEdge - rightEdge > 40);

    // The sharp overlay is still clipped to the quad — no bleed past the edge.
    REQUIRE(ch(77, 120, 0) == background);

    // Disabling the circle drops the sharp overlay, so the left edge softens to
    // match the blurred base — proving the disc, not the blur, kept it crisp.
    layer.circleMask.enabled = false;
    res = IlyEngineSetLayers(engineHandle, &layer, 1);
    REQUIRE(res == ILY_SUCCESS);
    std::this_thread::sleep_for(std::chrono::milliseconds(90));
    res = IlyEngineReadPixels(engineHandle, pixels.data(),
                              static_cast<uint32_t>(pixels.size()), &outW, &outH);
    REQUIRE(res == ILY_SUCCESS);
    REQUIRE(ch(82, 120, 0) < 235);

    IlyDestroyEngine(engineHandle);
    IlyShutdownSystem();
}

TEST_CASE("Image mask cuts the layer by the mask texture's alpha", "[readback][imagemask]") {
    IlyResult res = IlyInitializeSystem();
    REQUIRE((res == ILY_SUCCESS || res == ILY_ERROR_ALREADY_EXISTS));

    const uint32_t W = 320;
    const uint32_t H = 240;
    IlyEngineConfig config{W, H, 60, false};
    ResourceHandle engineHandle = ILY_INVALID_HANDLE;
    res = IlyCreateEngine(&config, &engineHandle);
    REQUIRE(res == ILY_SUCCESS);

    // Opaque white quad at (80,60)..(240,180), 160x120.
    ResourceHandle tex = ILY_INVALID_HANDLE;
    res = IlyEngineCreateColorTexture(engineHandle, 0xFFFFFFFF, &tex);
    REQUIRE(res == ILY_SUCCESS);

    // A 2x2 mask: left column opaque (alpha 255), right column transparent
    // (alpha 0). Stretched across the quad, only .a matters, so the left half
    // survives and the right half is cut. RGBA, row-major.
    const uint8_t maskPixels[16] = {
        255, 255, 255, 255,   255, 255, 255, 0,
        255, 255, 255, 255,   255, 255, 255, 0
    };
    ResourceHandle maskTex = ILY_INVALID_HANDLE;
    res = IlyEngineCreateTextureFromPixels(engineHandle, 2, 2, maskPixels, sizeof(maskPixels), &maskTex);
    REQUIRE(res == ILY_SUCCESS);

    IlyTransform t{};
    t.position = {80.0f, 60.0f, 0.0f};
    t.rotation = {0.0f, 0.0f, 0.0f};
    t.scale = {160.0f, 120.0f, 1.0f};
    t.anchor = {0.0f, 0.0f};
    t.pivot = {0.0f, 0.0f};
    t.crop = {0.0f, 0.0f, 0.0f, 0.0f};
    t.visibility = true;
    t.opacity = 1.0f;

    IlyLayer layer{};
    layer.texture = tex;
    layer.transform = t;
    layer.opacity = 1.0f;
    layer.blendMode = ILY_BLEND_ALPHA;
    layer.maskTexture = maskTex;

    res = IlyEngineSetLayers(engineHandle, &layer, 1);
    REQUIRE(res == ILY_SUCCESS);
    std::this_thread::sleep_for(std::chrono::milliseconds(60));

    std::vector<uint8_t> pixels(static_cast<size_t>(W) * H * 4, 0);
    uint32_t outW = 0, outH = 0;
    res = IlyEngineReadPixels(engineHandle, pixels.data(),
                              static_cast<uint32_t>(pixels.size()), &outW, &outH);
    REQUIRE(res == ILY_SUCCESS);

    auto ch = [&](uint32_t x, uint32_t y, uint32_t c) -> int {
        return pixels[(static_cast<size_t>(y) * W + x) * 4 + c];
    };
    const int background = ch(5, 5, 0);

    // Left half (mask alpha 1) shows the white layer; right half (mask alpha 0)
    // is cut back to the background.
    REQUIRE(ch(100, 120, 0) > 240);       // quad-local u ~0.125
    REQUIRE(ch(220, 120, 0) == background); // quad-local u ~0.875

    // Removing the mask restores the whole white quad.
    layer.maskTexture = ILY_INVALID_HANDLE;
    res = IlyEngineSetLayers(engineHandle, &layer, 1);
    REQUIRE(res == ILY_SUCCESS);
    std::this_thread::sleep_for(std::chrono::milliseconds(60));
    res = IlyEngineReadPixels(engineHandle, pixels.data(),
                              static_cast<uint32_t>(pixels.size()), &outW, &outH);
    REQUIRE(res == ILY_SUCCESS);
    REQUIRE(ch(220, 120, 0) > 240);

    IlyDestroyEngine(engineHandle);
    IlyShutdownSystem();
}

TEST_CASE("Mask transform remaps mask UVs for letterboxed (contain) fits", "[readback][masktransform]") {
    IlyResult res = IlyInitializeSystem();
    REQUIRE((res == ILY_SUCCESS || res == ILY_ERROR_ALREADY_EXISTS));

    const uint32_t W = 320;
    const uint32_t H = 240;
    IlyEngineConfig config{W, H, 60, false};
    ResourceHandle engineHandle = ILY_INVALID_HANDLE;
    res = IlyCreateEngine(&config, &engineHandle);
    REQUIRE(res == ILY_SUCCESS);

    // Opaque white quad at (80,60)..(240,180), 160x120.
    ResourceHandle tex = ILY_INVALID_HANDLE;
    res = IlyEngineCreateColorTexture(engineHandle, 0xFFFFFFFF, &tex);
    REQUIRE(res == ILY_SUCCESS);

    // 2x2 mask: left column opaque, right column transparent (only .a matters).
    const uint8_t maskPixels[16] = {
        255, 255, 255, 255,   255, 255, 255, 0,
        255, 255, 255, 255,   255, 255, 255, 0
    };
    ResourceHandle maskTex = ILY_INVALID_HANDLE;
    res = IlyEngineCreateTextureFromPixels(engineHandle, 2, 2, maskPixels, sizeof(maskPixels), &maskTex);
    REQUIRE(res == ILY_SUCCESS);

    IlyTransform t{};
    t.position = {80.0f, 60.0f, 0.0f};
    t.rotation = {0.0f, 0.0f, 0.0f};
    t.scale = {160.0f, 120.0f, 1.0f};
    t.anchor = {0.0f, 0.0f};
    t.pivot = {0.0f, 0.0f};
    t.crop = {0.0f, 0.0f, 0.0f, 0.0f};
    t.visibility = true;
    t.opacity = 1.0f;

    IlyLayer layer{};
    layer.texture = tex;
    layer.transform = t;
    layer.opacity = 1.0f;
    layer.blendMode = ILY_BLEND_ALPHA;
    layer.maskTexture = maskTex;
    // The drawn quad is the far-RIGHT quarter of the layout rect the mask spans:
    // layoutU = 0.75 + quadU*0.25 -> the whole quad samples the mask's opaque-0
    // right column, so it is fully cut. Without the transform the quad would
    // sample the full mask and its left half would survive.
    layer.maskTransform[0] = 0.75f;
    layer.maskTransform[1] = 0.0f;
    layer.maskTransform[2] = 0.25f;
    layer.maskTransform[3] = 1.0f;

    res = IlyEngineSetLayers(engineHandle, &layer, 1);
    REQUIRE(res == ILY_SUCCESS);
    std::this_thread::sleep_for(std::chrono::milliseconds(60));

    std::vector<uint8_t> pixels(static_cast<size_t>(W) * H * 4, 0);
    uint32_t outW = 0, outH = 0;
    res = IlyEngineReadPixels(engineHandle, pixels.data(),
                              static_cast<uint32_t>(pixels.size()), &outW, &outH);
    REQUIRE(res == ILY_SUCCESS);

    auto ch = [&](uint32_t x, uint32_t y, uint32_t c) -> int {
        return pixels[(static_cast<size_t>(y) * W + x) * 4 + c];
    };
    const int background = ch(5, 5, 0);

    // Remapped into the transparent column: the whole quad is cut, including the
    // left side that survives under the identity transform.
    REQUIRE(ch(100, 120, 0) == background);
    REQUIRE(ch(160, 120, 0) == background);

    // Identity transform: the quad samples the full mask, so its left half shows.
    layer.maskTransform[0] = 0.0f;
    layer.maskTransform[1] = 0.0f;
    layer.maskTransform[2] = 1.0f;
    layer.maskTransform[3] = 1.0f;
    res = IlyEngineSetLayers(engineHandle, &layer, 1);
    REQUIRE(res == ILY_SUCCESS);
    std::this_thread::sleep_for(std::chrono::milliseconds(60));
    res = IlyEngineReadPixels(engineHandle, pixels.data(),
                              static_cast<uint32_t>(pixels.size()), &outW, &outH);
    REQUIRE(res == ILY_SUCCESS);
    REQUIRE(ch(100, 120, 0) > 240);
    REQUIRE(ch(220, 120, 0) == background);

    IlyDestroyEngine(engineHandle);
    IlyShutdownSystem();
}
