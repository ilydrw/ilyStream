#include <catch2/catch_test_macros.hpp>
#include "renderer/renderer.h"
#include <random>
#include <thread>
#include <vector>

TEST_CASE("Renderer Stress Test - Restart Loop", "[renderer_stress]") {
    for (int i = 0; i < 500; ++i) {
        ily::Renderer renderer;
        IlyResult res = renderer.Start();
        REQUIRE(res == ILY_SUCCESS);
        
        IlyEngineConfig config{1280, 720, 60, false};
        res = renderer.Initialize(config);
        REQUIRE(res == ILY_SUCCESS);
        
        renderer.Stop();
    }
}

TEST_CASE("Renderer Stress Test - Random Resizes & Minimize/Restore", "[renderer_stress]") {
    ily::Renderer renderer;
    IlyResult res = renderer.Start();
    REQUIRE(res == ILY_SUCCESS);
    
    IlyEngineConfig config{1280, 720, 60, false};
    res = renderer.Initialize(config);
    REQUIRE(res == ILY_SUCCESS);
    
    std::vector<std::pair<uint32_t, uint32_t>> resolutions = {
        {640, 360},
        {1280, 720},
        {1920, 1080},
        {2560, 1440},
        {3840, 2160},
        {0, 0}, // Minimize representation
        {1280, 720} // Restore
    };
    
    std::default_random_engine generator(1337);
    std::uniform_int_distribution<size_t> distribution(0, resolutions.size() - 1);
    
    for (int i = 0; i < 100; ++i) {
        auto resPair = resolutions[distribution(generator)];
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
        
        IlyResult resizeRes = renderer.Resize(resPair.first, resPair.second);
        REQUIRE(resizeRes == ILY_SUCCESS);
    }
    
    renderer.Stop();
}
