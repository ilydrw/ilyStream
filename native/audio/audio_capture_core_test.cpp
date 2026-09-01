#include "audio_capture_core.h"
#include "shared_audio_ring.h"
#include <catch2/catch_test_macros.hpp>

#include <algorithm>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#endif

TEST_CASE("audio core starts idle and rejects invalid capture options") {
    const auto initial = ily::audio::GetCaptureStatus();
    CHECK_FALSE(initial.running);

    ily::audio::CaptureOptions options;
    options.channels = 0;
    ily::audio::CaptureSessionInfo session;
    std::string error;
    CHECK_FALSE(ily::audio::StartCapture(options, {}, session, error));
    CHECK(error == "Unsupported channels/sampleRate");
    CHECK_FALSE(ily::audio::GetCaptureStatus().running);
}

TEST_CASE("audio core rejects invalid shared-ring configuration") {
    ily::audio::ProgramAudioTransportOptions options;
    options.ringName = "attacker-selected";
    options.generation = 1;
    options.capacityFrames = 4096;
    options.blockFrames = 1024;
    std::string error;
    CHECK_FALSE(ily::audio::StartProgramAudioTransport(options, error));
    CHECK(error == "Invalid Program audio transport options");
    CHECK_FALSE(ily::audio::PushProgramAudio(nullptr, 0, 0));
}

#ifdef _WIN32
TEST_CASE("shared audio ring transfers bounded interleaved PCM") {
    ily::audio::SharedAudioRingOptions options;
    options.ringName = "Local\\ilyStream.Capture.Audio.test-" +
        std::to_string(GetCurrentProcessId()) + "-" + std::to_string(GetTickCount64());
    options.generation = 42;
    options.sampleRate = 48000;
    options.channels = 2;
    options.capacityFrames = 4096;
    options.blockFrames = 1024;

    std::string error;
    auto writer = ily::audio::SharedAudioRingWriter::Create(options, error);
    REQUIRE(writer);
    auto reader = ily::audio::SharedAudioRingReader::Open(options, error);
    REQUIRE(reader);

    std::vector<float> input(64);
    for (std::size_t index = 0; index < input.size(); ++index) {
        input[index] = static_cast<float>(index) / 64.0F;
    }
    REQUIRE(writer->Publish(input.data(), input.size(), 1000000, 7));

    std::vector<float> output;
    ily::audio::SharedAudioReadStatus status;
    CHECK(reader->Read(1024, output, status) == ily::audio::SharedAudioReadResult::data);
    CHECK(output == input);
    CHECK(status.writeFrame == 32);
    CHECK(status.framesRead == 32);
    CHECK(status.framesSkipped == 0);
    CHECK(status.producerFramesDropped == 7);

    writer->Close();
    CHECK(reader->Read(1024, output, status) == ily::audio::SharedAudioReadResult::closed);
}

TEST_CASE("shared audio reader reports overwritten frames instead of reading stale PCM") {
    ily::audio::SharedAudioRingOptions options;
    options.ringName = "Local\\ilyStream.Capture.Audio.overflow-" +
        std::to_string(GetCurrentProcessId()) + "-" + std::to_string(GetTickCount64());
    options.generation = 99;
    options.sampleRate = 48000;
    options.channels = 2;
    options.capacityFrames = 4096;
    options.blockFrames = 1024;

    std::string error;
    auto writer = ily::audio::SharedAudioRingWriter::Create(options, error);
    REQUIRE(writer);
    auto reader = ily::audio::SharedAudioRingReader::Open(options, error);
    REQUIRE(reader);
    std::vector<float> block(2048);
    for (std::uint64_t index = 0; index < 5; ++index) {
        std::fill(block.begin(), block.end(), static_cast<float>(index));
        REQUIRE(writer->Publish(block.data(), block.size(), 1000000 + index * 1000));
    }

    std::vector<float> output;
    ily::audio::SharedAudioReadStatus status;
    CHECK(reader->Read(1024, output, status) == ily::audio::SharedAudioReadResult::data);
    CHECK(status.framesSkipped == 1024);
    CHECK(status.framesRead == 1024);
    REQUIRE(output.size() == 2048);
    CHECK(output.front() == 1.0F);
    CHECK(output.back() == 1.0F);
}
#endif
