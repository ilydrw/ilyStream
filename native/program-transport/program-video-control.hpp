// SPDX-License-Identifier: MIT
#pragma once

#include <cstddef>
#include <cstdint>

namespace ilystream::program_transport {

inline constexpr std::uint32_t kProgramVideoControlMagic = 0x56594c49U; // "ILYV"
inline constexpr std::uint16_t kProgramVideoControlVersion = 1;
inline constexpr std::uint16_t kProgramVideoSlotCount = 2;
inline constexpr std::uint32_t kProgramVideoNoSlot = UINT32_MAX;
inline constexpr std::uint32_t kProgramVideoControlFlagRetired = 1u << 0;
inline constexpr std::size_t kProgramVideoControlBytes = 128;

/**
 * Read-mostly cross-process control page for the Program video texture pool.
 *
 * `publishSequence` is a seqlock. The producer makes it odd, writes the
 * remaining metadata while it still owns keyed-mutex key 0, and makes it even
 * before ReleaseSync(1). A consumer snapshots control, acquires key 1, then
 * snapshots control again; it accepts the texture only when both coherent
 * snapshots identify the same generation/slot/frame. This ordering closes the
 * stale-snapshot race where a reclaimed slot could otherwise contain newer
 * pixels while control still described its older frame.
 *
 * `slotFrameSequence` lets a consumer distinguish a stale ready slot from the
 * newest publication without per-frame IPC. `flags &
 * kProgramVideoControlFlagRetired` permanently invalidates this generation;
 * consumers must release it and request a replacement.
 *
 * The struct intentionally contains no pointers, platform handles, bools, or
 * compiler-dependent atomics. The producer uses Interlocked increments. A
 * read-only consumer uses naturally aligned volatile 64-bit loads bracketed by
 * MemoryBarrier; those loads are atomic on the supported Windows x64 target.
 */
struct alignas(64) ProgramVideoControlHeader {
    std::uint32_t magic;
    std::uint16_t version;
    std::uint16_t headerBytes;
    std::uint32_t slotCount;
    std::uint32_t flags;
    std::uint64_t generation;
    std::uint64_t publishSequence;
    std::uint64_t frameSequence;
    std::uint64_t monotonicTimestampNs;
    std::uint64_t droppedFrameCount;
    std::uint64_t slotFrameSequence[kProgramVideoSlotCount];
    std::uint32_t latestSlot;
    std::uint32_t reserved1;
    std::uint64_t reserved[6];
};

static_assert(sizeof(ProgramVideoControlHeader) == kProgramVideoControlBytes,
              "Program video control layout changed");
static_assert(offsetof(ProgramVideoControlHeader, publishSequence) % alignof(std::uint64_t) == 0,
              "Program video seqlock must stay naturally aligned");

} // namespace ilystream::program_transport
