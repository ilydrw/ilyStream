#include "mixer-transport-config.h"

#include <catch2/catch_test_macros.hpp>

#include <stdexcept>

namespace {

TEST_CASE("master DSP protocol parser keeps the default transport disabled") {
    CHECK_FALSE(ily::core_host::ParseMasterDspConfig({}).has_value());
    CHECK_FALSE(ily::core_host::ParseMasterDspConfig({{"sources", nlohmann::json::array()}}).has_value());
}

TEST_CASE("master DSP protocol parser accepts bounded partial overrides") {
    const auto parsed = ily::core_host::ParseMasterDspConfig({
        {"masterDsp", {{"headroom", 0.5}, {"ratio", 1.0}}}});
    REQUIRE(parsed.has_value());
    CHECK(parsed->headroom == 0.5F);
    CHECK(parsed->ratio == 1.0F);
    CHECK(parsed->sampleRate == 48000);
}

TEST_CASE("master DSP protocol parser rejects unsafe shapes and ranges") {
    CHECK_THROWS(ily::core_host::ParseMasterDspConfig({{"masterDsp", 1}}));
    CHECK_THROWS(ily::core_host::ParseMasterDspConfig({
        {"masterDsp", {{"unknown", 1.0}}}}));
    CHECK_THROWS(ily::core_host::ParseMasterDspConfig({
        {"masterDsp", {{"headroom", 0.0}}}}));
    CHECK_THROWS(ily::core_host::ParseMasterDspConfig({
        {"masterDsp", {{"sampleRate", 48000.5}}}}));
    CHECK_THROWS(ily::core_host::ParseMasterDspConfig({
        {"masterDsp", {{"sampleRate", 44100}}}}));
}

} // namespace
