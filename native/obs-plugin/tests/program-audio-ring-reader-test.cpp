// SPDX-License-Identifier: GPL-2.0-or-later
#include "../src/program-audio-ring-reader.hpp"

#include "program-transport/program-audio-ring.hpp"

#include <Windows.h>

#include <algorithm>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <memory>
#include <string>
#include <vector>

namespace {

using ilystream::ProgramAudioBlockView;
using ilystream::ProgramAudioMappedView;
using ilystream::ProgramAudioRing;
using ilystream::ProgramAudioRingOptions;
using ilystream::kProgramAudioOutputFrames;
using ilystream::program_transport::ProgramAudioRingHeader;

constexpr std::uint32_t kSampleRate = 48'000;
constexpr std::uint32_t kChannels = 2;

int failures = 0;

void check(bool condition, const std::string& message) {
    if (condition) {
        return;
    }
    ++failures;
    std::cerr << "FAILED: " << message << '\n';
}

std::uint64_t timestampAt(std::uint64_t timestampNs, std::uint64_t frames) {
    return timestampNs + (frames / kSampleRate) * 1'000'000'000ULL +
           (frames % kSampleRate) * 1'000'000'000ULL / kSampleRate;
}

struct RingFixture {
    explicit RingFixture(std::uint32_t capacity = 4'096, std::uint32_t block = 512,
                         std::uint64_t generation = 1)
        : options{L"Local\\ilyStream.Program.Audio.test-ring", generation, kSampleRate, kChannels, capacity, block} {
        bytes = ilystream::program_transport::kProgramAudioRingHeaderBytes +
                static_cast<std::size_t>(capacity) * kChannels * sizeof(float);
        memory = VirtualAlloc(nullptr, bytes, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
        if (!memory) {
            return;
        }
        std::memset(memory, 0, bytes);
        header = static_cast<ProgramAudioRingHeader*>(memory);
        samples = reinterpret_cast<float*>(static_cast<std::uint8_t*>(memory) +
                                           ilystream::program_transport::kProgramAudioRingHeaderBytes);
        header->magic = ilystream::program_transport::kProgramAudioRingMagic;
        header->version = ilystream::program_transport::kProgramAudioRingVersion;
        header->headerBytes = static_cast<std::uint16_t>(ilystream::program_transport::kProgramAudioRingHeaderBytes);
        header->mappingBytes = static_cast<std::uint32_t>(bytes);
        header->sampleRate = kSampleRate;
        header->channels = kChannels;
        header->format = ilystream::program_transport::kProgramAudioFormatF32Interleaved;
        header->capacityFrames = capacity;
        header->blockFrames = block;
        header->generation = generation;
    }

    ~RingFixture() {
        if (memory) {
            VirtualFree(memory, 0, MEM_RELEASE);
        }
    }

    std::shared_ptr<ProgramAudioRing> attach() {
        return ProgramAudioRing::attach(options, ProgramAudioMappedView{memory, bytes, {}});
    }

    void publish(std::size_t frames, std::uint64_t timestampNs, float base = 0.0F) {
        auto* sequence = reinterpret_cast<volatile LONG64*>(&header->publishSequence);
        InterlockedIncrement64(sequence);
        const std::uint64_t first = header->writeFrame;
        for (std::size_t frame = 0; frame < frames; ++frame) {
            const std::size_t ringFrame = static_cast<std::size_t>((first + frame) % header->capacityFrames);
            for (std::size_t channel = 0; channel < header->channels; ++channel) {
                samples[ringFrame * header->channels + channel] =
                    base + static_cast<float>(first + frame) + static_cast<float>(channel) * 0.25F;
            }
        }
        header->anchorFrame = first;
        header->anchorTimestampNs = timestampNs;
        header->writeFrame = first + frames;
        header->oldestFrame = header->writeFrame > header->capacityFrames
                                  ? header->writeFrame - header->capacityFrames
                                  : 0;
        MemoryBarrier();
        InterlockedIncrement64(sequence);
    }

    ProgramAudioRingOptions options;
    void* memory = nullptr;
    std::size_t bytes = 0;
    ProgramAudioRingHeader* header = nullptr;
    float* samples = nullptr;
};

void testIndependentReadersAndTimestampMath() {
    RingFixture fixture;
    auto ring = fixture.attach();
    check(ring != nullptr, "a canonical in-memory ring attaches");
    auto first = ring->createReader();
    auto second = ring->createReader();
    auto surround = ring->createReader();
    auto mono = ring->createReader();
    const std::uint64_t timestamp = 1'000'000'000ULL;
    fixture.publish(kProgramAudioOutputFrames * 2, timestamp);

    ProgramAudioBlockView firstBlock;
    ProgramAudioBlockView secondBlock;
    check(first->read(kSampleRate, kChannels, kProgramAudioOutputFrames, firstBlock),
          "the first reader receives a complete OBS block");
    check(second->read(kSampleRate, kChannels, kProgramAudioOutputFrames, secondBlock),
          "the second reader has an independent cursor");
    check(firstBlock.timestampNs == timestamp && secondBlock.timestampNs == timestamp,
          "both readers preserve the absolute producer timestamp");
    check(firstBlock.planes[0][37] == 37.0F && firstBlock.planes[1][37] == 37.25F,
          "the reader deinterleaves the canonical f32 ring");

    ProgramAudioBlockView surroundBlock;
    ProgramAudioBlockView monoBlock;
    check(surround->read(kSampleRate, 6, kProgramAudioOutputFrames, surroundBlock) &&
              surroundBlock.channelCount == kChannels && surroundBlock.planes[1][37] == 37.25F,
          "a surround OBS mix receives the native stereo planes for front-channel placement");
    check(mono->read(kSampleRate, 1, kProgramAudioOutputFrames, monoBlock) && monoBlock.channelCount == 1 &&
              monoBlock.planes[0][37] == 37.125F,
          "a mono OBS mix receives the arithmetic stereo average");

    check(first->read(kSampleRate, kChannels, kProgramAudioOutputFrames, firstBlock),
          "the first cursor advances independently");
    check(firstBlock.timestampNs == timestampAt(timestamp, kProgramAudioOutputFrames),
          "timestamp math advances by exactly one OBS block");
}

void testSmallOverrunFillsSilenceAndLargeOverrunResets() {
    RingFixture smallFixture(2'048, 512);
    auto smallRing = smallFixture.attach();
    auto smallReader = smallRing->createReader();
    const std::uint64_t timestamp = 2'000'000'000ULL;
    smallFixture.publish(2'560, timestamp);

    ProgramAudioBlockView block;
    check(smallReader->read(kSampleRate, kChannels, kProgramAudioOutputFrames, block),
          "a one-half-block overrun remains readable");
    check(block.planes[0][0] == 0.0F && block.planes[0][511] == 0.0F && block.planes[0][512] == 512.0F,
          "a small cursor gap is represented as silence before retained samples");

    RingFixture largeFixture(2'048, 512);
    auto largeRing = largeFixture.attach();
    auto largeReader = largeRing->createReader();
    largeFixture.publish(4'096, timestamp);
    check(largeReader->read(kSampleRate, kChannels, kProgramAudioOutputFrames, block),
          "a large overrun resets to the oldest retained frame");
    check(block.planes[0][0] == 2'048.0F,
          "large overrun never manufactures or replays the discarded region");
    check(largeRing->stats().framesSkipped == 2'048, "overrun accounting reports skipped frames");
}

void testTimestampDiscontinuityResetsAtLatestAnchor() {
    RingFixture fixture;
    auto ring = fixture.attach();
    auto reader = ring->createReader();
    const std::uint64_t firstTimestamp = 3'000'000'000ULL;
    fixture.publish(kProgramAudioOutputFrames, firstTimestamp);

    ProgramAudioBlockView block;
    check(reader->read(kSampleRate, kChannels, kProgramAudioOutputFrames, block),
          "the initial timestamp epoch is readable");
    const std::uint64_t jumpedTimestamp = firstTimestamp + 1'000'000'000ULL;
    fixture.publish(kProgramAudioOutputFrames, jumpedTimestamp);
    check(reader->read(kSampleRate, kChannels, kProgramAudioOutputFrames, block),
          "a timestamp jump starts a new readable epoch");
    check(block.timestampNs == jumpedTimestamp && block.planes[0][0] == 1'024.0F,
          "timestamp discontinuity resets at the producer's latest anchor");
}

void testRetirementAndHeaderDiscontinuityNeverReplay() {
    RingFixture fixture;
    auto ring = fixture.attach();
    auto reader = ring->createReader();
    fixture.publish(kProgramAudioOutputFrames, 4'000'000'000ULL);
    ring->retire(1);

    ProgramAudioBlockView block;
    check(!reader->read(kSampleRate, kChannels, kProgramAudioOutputFrames, block),
          "retirement immediately makes buffered audio unavailable");
    check(!ring->available(), "retired mapping reports offline");

    RingFixture changedFixture;
    auto changedRing = changedFixture.attach();
    auto changedReader = changedRing->createReader();
    changedFixture.publish(kProgramAudioOutputFrames, 5'000'000'000ULL);
    auto* sequence = reinterpret_cast<volatile LONG64*>(&changedFixture.header->publishSequence);
    InterlockedIncrement64(sequence);
    changedFixture.header->generation = 2;
    MemoryBarrier();
    InterlockedIncrement64(sequence);
    check(!changedReader->read(kSampleRate, kChannels, kProgramAudioOutputFrames, block),
          "generation or format mutation invalidates the mapped reader");
    check(!changedRing->available(), "a stable metadata discontinuity fails closed");
}

void testOddSeqlockIsBoundedAndRecovers() {
    RingFixture fixture;
    auto ring = fixture.attach();
    auto reader = ring->createReader();
    fixture.publish(kProgramAudioOutputFrames, 6'000'000'000ULL);
    auto* sequence = reinterpret_cast<volatile LONG64*>(&fixture.header->publishSequence);
    InterlockedIncrement64(sequence);

    ProgramAudioBlockView block;
    check(!reader->read(kSampleRate, kChannels, kProgramAudioOutputFrames, block),
          "an in-progress producer write never blocks the OBS audio thread");
    InterlockedIncrement64(sequence);
    check(reader->read(kSampleRate, kChannels, kProgramAudioOutputFrames, block),
          "the reader recovers after a stable even publication");
    check(ring->stats().seqlockRetries >= 4, "bounded copy retries are observable");
}

void testNamedMappingOpenPath() {
    RingFixture fixture;
    fixture.options.ringName = L"Local\\ilyStream.Program.Audio.test-open-" + std::to_wstring(GetCurrentProcessId());
    HANDLE mapping = CreateFileMappingW(INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE, 0,
                                        static_cast<DWORD>(fixture.bytes), fixture.options.ringName.c_str());
    check(mapping != nullptr && GetLastError() != ERROR_ALREADY_EXISTS, "test named mapping is uniquely created");
    if (!mapping) {
        return;
    }
    void* view = MapViewOfFile(mapping, FILE_MAP_READ | FILE_MAP_WRITE, 0, 0, fixture.bytes);
    check(view != nullptr, "test named mapping has a producer view");
    if (!view) {
        CloseHandle(mapping);
        return;
    }
    std::memcpy(view, fixture.memory, fixture.bytes);

    std::uint32_t error = 0;
    auto opened = ProgramAudioRing::open(fixture.options, &error);
    check(opened != nullptr && error == ERROR_SUCCESS, "the production reader opens the authenticated ring name");
    if (opened) {
        auto reader = opened->createReader();
        auto* header = static_cast<ProgramAudioRingHeader*>(view);
        auto* sequence = reinterpret_cast<volatile LONG64*>(&header->publishSequence);
        InterlockedIncrement64(sequence);
        header->anchorTimestampNs = 7'000'000'000ULL;
        header->writeFrame = kProgramAudioOutputFrames;
        header->oldestFrame = 0;
        float* samples = reinterpret_cast<float*>(static_cast<std::uint8_t*>(view) +
                                                  ilystream::program_transport::kProgramAudioRingHeaderBytes);
        std::fill_n(samples, kProgramAudioOutputFrames * kChannels, 0.5F);
        MemoryBarrier();
        InterlockedIncrement64(sequence);
        ProgramAudioBlockView block;
        check(reader->read(kSampleRate, kChannels, kProgramAudioOutputFrames, block),
              "the opened named mapping supplies audio");
    }

    UnmapViewOfFile(view);
    CloseHandle(mapping);
}

} // namespace

int main() {
    testIndependentReadersAndTimestampMath();
    testSmallOverrunFillsSilenceAndLargeOverrunResets();
    testTimestampDiscontinuityResetsAtLatestAnchor();
    testRetirementAndHeaderDiscontinuityNeverReplay();
    testOddSeqlockIsBoundedAndRecovers();
    testNamedMappingOpenPath();

    if (failures == 0) {
        std::cout << "Program audio ring reader tests passed\n";
    }
    return failures == 0 ? 0 : 1;
}
