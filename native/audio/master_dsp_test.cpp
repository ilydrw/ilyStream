#include "master_dsp.h"

#include <catch2/catch_test_macros.hpp>

#include <cmath>
#include <vector>

namespace {

TEST_CASE("master DSP accepts renderer safety defaults") {
    CHECK(ily::audio::IsValidMasterDspConfig({}));
}

TEST_CASE("master DSP applies headroom and leaves silence stable") {
    ily::audio::MasterDsp dsp;
    std::vector<float> samples{1.0F, -1.0F, 0.0F, 0.0F};
    REQUIRE(dsp.Process(samples.data(), 2));
    CHECK(std::abs(samples[0]) < 0.83F);
    CHECK(std::abs(samples[1]) < 0.83F);
    CHECK(samples[2] == 0.0F);
    CHECK(samples[3] == 0.0F);
}

TEST_CASE("master DSP bounds overloaded finite PCM and rejects invalid input") {
    ily::audio::MasterDsp dsp;
    std::vector<float> samples{100.0F, -100.0F, 100.0F, -100.0F};
    REQUIRE(dsp.Process(samples.data(), 2));
    for (const float sample : samples) CHECK(std::isfinite(sample));
    for (const float sample : samples) CHECK(sample >= -1.0F);
    for (const float sample : samples) CHECK(sample <= 1.0F);

    CHECK_FALSE(dsp.Process(nullptr, 2));
    CHECK_FALSE(dsp.Process(samples.data(), 0));
    samples[0] = std::nanf("");
    CHECK_FALSE(dsp.Process(samples.data(), 2));
}

TEST_CASE("master DSP configuration is bounded before transport opt-in") {
    auto invalid = ily::audio::MasterDspConfig{};
    invalid.ratio = 0.0F;
    CHECK_FALSE(ily::audio::IsValidMasterDspConfig(invalid));
    invalid = {};
    invalid.sampleRate = 4000;
    CHECK_FALSE(ily::audio::IsValidMasterDspConfig(invalid));
}

} // namespace
