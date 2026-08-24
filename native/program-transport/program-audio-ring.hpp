// SPDX-License-Identifier: MIT
#pragma once

#include <cstddef>
#include <cstdint>

namespace ilystream::program_transport {

inline constexpr std::uint32_t kProgramAudioRingMagic = 0x41594c49U; // "ILYA"
inline constexpr std::uint16_t kProgramAudioRingVersion = 1;
inline constexpr std::uint16_t kProgramAudioFormatF32Interleaved = 1;
inline constexpr std::size_t kProgramAudioRingHeaderBytes = 128;

/**
 * Cross-process header for the Program audio ring.
 *
 * `publishSequence` is a seqlock. The producer makes it odd before writing
 * samples/metadata and even after publishing. Consumers copy the requested
 * samples and accept them only when the value is unchanged and even.
 *
 * The struct intentionally contains no pointers, platform handles, bools, or
 * compiler-dependent atomics. Both processes are Windows x64, and each side
 * uses Interlocked operations on the naturally aligned 64-bit sequence.
 */
struct alignas(64) ProgramAudioRingHeader {
    std::uint32_t magic;
    std::uint16_t version;
    std::uint16_t headerBytes;
    std::uint32_t mappingBytes;
    std::uint32_t sampleRate;
    std::uint16_t channels;
    std::uint16_t format;
    std::uint32_t capacityFrames;
    std::uint32_t blockFrames;
    std::uint32_t reserved0;
    std::uint64_t generation;
    std::uint64_t publishSequence;
    std::uint64_t writeFrame;
    std::uint64_t oldestFrame;
    std::uint64_t anchorFrame;
    std::uint64_t anchorTimestampNs;
    std::uint64_t framesDropped;
    std::uint64_t reserved[5];
};

static_assert(sizeof(ProgramAudioRingHeader) == kProgramAudioRingHeaderBytes,
              "Program audio ring header layout changed");
static_assert(offsetof(ProgramAudioRingHeader, publishSequence) % alignof(std::uint64_t) == 0,
              "Program audio seqlock must stay naturally aligned");

} // namespace ilystream::program_transport
