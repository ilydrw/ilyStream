#include "program_mixer_core.h"

#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include <limits>
#include <vector>

using Catch::Approx;

TEST_CASE("native mixer mirrors Program eligibility mute monitor and solo policy") {
    std::vector<ily::audio::MixerSourcePolicy> sources = {
        {"active", 0.75F, 0.0F, false, false, false, false, ily::audio::MonitoringMode::off},
        {"solo", 0.5F, 0.0F, false, true, false, false, ily::audio::MonitoringMode::off},
        {"preview", 1.0F, 0.0F, false, false, false, false, ily::audio::MonitoringMode::off},
        {"monitor", 1.0F, 0.0F, false, false, false, false, ily::audio::MonitoringMode::monitorOnly},
        {"muted", 1.0F, 0.0F, true, false, false, false, ily::audio::MonitoringMode::off},
        {"soundboard", 1.0F, 0.0F, false, false, true, false, ily::audio::MonitoringMode::off}
    };
    ily::audio::MixerRoutingPolicy policy;
    policy.activeLayerIds = {"active", "solo", "monitor", "muted"};
    policy.retainedLayerIds = {"active", "solo", "preview", "monitor", "muted"};
    const auto routes = ily::audio::EvaluateProgramRoutes(sources, policy);
    REQUIRE(routes.size() == sources.size());
    CHECK(routes[0].sceneGain == 0.0F);
    CHECK(routes[1].sceneGain == 1.0F);
    CHECK(routes[1].effectiveGain == 0.5F);
    CHECK(routes[2].eligible);
    CHECK(routes[2].sceneGain == 0.0F);
    CHECK_FALSE(routes[3].output);
    CHECK_FALSE(routes[4].output);
    CHECK(routes[5].eligible);
    CHECK(routes[5].sceneGain == 0.0F);
}

TEST_CASE("native mixer crossfades unique sources and holds shared sources at unity") {
    std::vector<ily::audio::MixerSourcePolicy> sources = {
        {"from"}, {"to"}, {"shared"}, {"global", 1.0F, 0.0F, false, false, true}
    };
    ily::audio::MixerRoutingPolicy policy;
    policy.retainedLayerIds = {"from", "to", "shared"};
    policy.transition.active = true;
    policy.transition.fade = true;
    policy.transition.progress = 0.25F;
    policy.transition.fromLayerIds = {"from", "shared"};
    policy.transition.toLayerIds = {"to", "shared"};
    const auto routes = ily::audio::EvaluateProgramRoutes(sources, policy);
    CHECK(routes[0].sceneGain == Approx(0.75F));
    CHECK(routes[1].sceneGain == Approx(0.25F));
    CHECK(routes[2].sceneGain == Approx(1.0F));
    CHECK(routes[3].sceneGain == Approx(1.0F));
}

TEST_CASE("native stereo mixer applies channel mode gain and equal-power pan") {
    const float first[] = {1.0F, 0.5F, -1.0F, -0.5F};
    const float second[] = {0.25F, 0.75F, 0.5F, 0.5F};
    std::vector<ily::audio::StereoMixInput> inputs = {
        {first, 2, 0.5F, 0.0F, false},
        {second, 2, 1.0F, -1.0F, true}
    };
    float output[4]{};
    REQUIRE(ily::audio::MixStereoProgram(inputs, 2, output));
    CHECK(output[0] == Approx(2.5F));
    CHECK(output[1] == Approx(0.25F));
    CHECK(output[2] == Approx(1.5F));
    CHECK(output[3] == Approx(-0.25F));
}

TEST_CASE("native stereo mixer rejects non-finite source PCM") {
    const float samples[] = {0.0F, std::numeric_limits<float>::quiet_NaN()};
    float output[2]{};
    CHECK_FALSE(ily::audio::MixStereoProgram({{samples, 1, 1.0F, 0.0F, false}}, 1, output));
}
