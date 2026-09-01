#include "program_mixer_transport.h"

#include <catch2/catch_test_macros.hpp>

#include <chrono>
#include <cmath>
#include <string>
#include <thread>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#endif

namespace {

std::string UniqueSuffix(const char* label) {
    const auto ticks = std::chrono::steady_clock::now().time_since_epoch().count();
#ifdef _WIN32
    return std::string(label) + "." + std::to_string(GetCurrentProcessId()) + "." + std::to_string(ticks);
#else
    return std::string(label) + "." + std::to_string(ticks);
#endif
}

ily::audio::SharedAudioRingOptions Ring(const std::string& name, std::uint64_t generation) {
    return {name, generation, 48000, 2, 8192, 1024};
}

} // namespace

TEST_CASE("native Program mixer transports multiple source rings to one output ring") {
    const auto sourceAOptions = Ring("Local\\ilyStream.Mixer.Source." + UniqueSuffix("a"), 101);
    const auto sourceBOptions = Ring("Local\\ilyStream.Mixer.Source." + UniqueSuffix("b"), 102);
    const auto outputOptions = Ring("Local\\ilyStream.Program.Audio." + UniqueSuffix("out"), 103);
    std::string error;
    auto sourceA = ily::audio::SharedAudioRingWriter::Create(sourceAOptions, error);
    REQUIRE(sourceA);
    auto sourceB = ily::audio::SharedAudioRingWriter::Create(sourceBOptions, error);
    REQUIRE(sourceB);

    ily::audio::ProgramMixerTransportOptions options;
    options.sources = {
        {"a", sourceAOptions, 0.5F, 0.0F, false},
        {"b", sourceBOptions, 1.0F, 0.0F, false}
    };
    options.outputRing = outputOptions;
    auto mixer = ily::audio::ProgramMixerTransport::Start(options, error);
    REQUIRE(mixer);
    auto output = ily::audio::SharedAudioRingReader::Open(outputOptions, error);
    REQUIRE(output);

    std::vector<float> a(2048, 0.25F);
    std::vector<float> b(2048, 0.5F);
    REQUIRE(sourceB->Publish(b.data(), b.size(), 1));
    REQUIRE(sourceA->Publish(a.data(), a.size(), 1));

    std::vector<float> mixed;
    ily::audio::SharedAudioReadStatus readStatus;
    ily::audio::SharedAudioReadResult result = ily::audio::SharedAudioReadResult::noData;
    for (int attempt = 0; attempt < 200 && result == ily::audio::SharedAudioReadResult::noData; ++attempt) {
        result = output->Read(1024, mixed, readStatus);
        if (result == ily::audio::SharedAudioReadResult::noData) {
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
        }
    }
    REQUIRE(result == ily::audio::SharedAudioReadResult::data);
    REQUIRE(mixed.size() == 2048);
    for (const float sample : mixed) CHECK(std::abs(sample - 0.625F) < 0.00001F);
    const auto status = mixer->Stop();
    CHECK(status.blocksMixed == 1);
    CHECK(status.framesMixed == 1024);
    CHECK(status.sourceUnderruns == 0);
}
