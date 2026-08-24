// SPDX-License-Identifier: GPL-2.0-or-later
#include "program-video-control-reader.hpp"

#include "program-transport/program-video-control.hpp"

#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <Windows.h>

#include <cstddef>

namespace ilystream {
namespace {

using program_transport::ProgramVideoControlHeader;

constexpr std::size_t kReadAttempts = 4;

std::uint64_t readSequence(const ProgramVideoControlHeader* header) noexcept {
    MemoryBarrier();
    const auto* sequence = reinterpret_cast<const volatile std::uint64_t*>(&header->publishSequence);
    const std::uint64_t value = *sequence;
    MemoryBarrier();
    return value;
}

bool validHeader(const ProgramVideoControlHeader& header, std::uint64_t expectedGeneration) noexcept {
    return header.magic == program_transport::kProgramVideoControlMagic &&
           header.version == program_transport::kProgramVideoControlVersion &&
           header.headerBytes == program_transport::kProgramVideoControlBytes &&
           header.slotCount == program_transport::kProgramVideoSlotCount && header.flags == 0 &&
           header.generation == expectedGeneration;
}

} // namespace

ProgramVideoControlReadResult readProgramVideoControl(const void* mappedControl, std::uint64_t expectedGeneration,
                                                      ProgramVideoControlSnapshot& snapshot) noexcept {
    snapshot = {};
    if (!mappedControl || expectedGeneration == 0 ||
        reinterpret_cast<std::uintptr_t>(mappedControl) % alignof(ProgramVideoControlHeader) != 0) {
        return ProgramVideoControlReadResult::Invalid;
    }

    const auto* header = static_cast<const ProgramVideoControlHeader*>(mappedControl);
    for (std::size_t attempt = 0; attempt < kReadAttempts; ++attempt) {
        const std::uint64_t before = readSequence(header);
        if ((before & 1U) != 0) {
            continue;
        }

        ProgramVideoControlHeader copy = *header;
        MemoryBarrier();
        const std::uint64_t after = readSequence(header);
        if (before != after || (after & 1U) != 0) {
            continue;
        }
        if (!validHeader(copy, expectedGeneration)) {
            return ProgramVideoControlReadResult::Invalid;
        }
        if (copy.frameSequence == 0 || copy.latestSlot == program_transport::kProgramVideoNoSlot) {
            return copy.frameSequence == 0 && copy.latestSlot == program_transport::kProgramVideoNoSlot
                       ? ProgramVideoControlReadResult::NoFrame
                       : ProgramVideoControlReadResult::Invalid;
        }
        if (copy.latestSlot >= program_transport::kProgramVideoSlotCount || copy.monotonicTimestampNs == 0 ||
            copy.slotFrameSequence[copy.latestSlot] != copy.frameSequence) {
            return ProgramVideoControlReadResult::Invalid;
        }

        snapshot.frameSequence = copy.frameSequence;
        snapshot.monotonicTimestampNs = copy.monotonicTimestampNs;
        snapshot.droppedFrameCount = copy.droppedFrameCount;
        snapshot.slotFrameSequence = {copy.slotFrameSequence[0], copy.slotFrameSequence[1]};
        snapshot.latestSlot = copy.latestSlot;
        return ProgramVideoControlReadResult::Ready;
    }
    return ProgramVideoControlReadResult::Busy;
}

bool programVideoSnapshotsMatch(const ProgramVideoControlSnapshot& selected,
                                const ProgramVideoControlSnapshot& verified) noexcept {
    return selected.frameSequence != 0 && selected.latestSlot < selected.slotFrameSequence.size() &&
           verified.frameSequence == selected.frameSequence && verified.latestSlot == selected.latestSlot &&
           verified.slotFrameSequence[selected.latestSlot] == selected.frameSequence;
}

} // namespace ilystream
