// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once

#include <array>
#include <cstdint>

namespace ilystream {

struct ProgramVideoControlSnapshot {
    std::uint64_t frameSequence = 0;
    std::uint64_t monotonicTimestampNs = 0;
    std::uint64_t droppedFrameCount = 0;
    std::array<std::uint64_t, 2> slotFrameSequence{};
    std::uint32_t latestSlot = 0;
};

enum class ProgramVideoControlReadResult {
    Ready,
    NoFrame,
    Busy,
    Invalid,
};

ProgramVideoControlReadResult readProgramVideoControl(const void* mappedControl, std::uint64_t expectedGeneration,
                                                      ProgramVideoControlSnapshot& snapshot) noexcept;
bool programVideoSnapshotsMatch(const ProgramVideoControlSnapshot& selected,
                                const ProgramVideoControlSnapshot& verified) noexcept;

} // namespace ilystream
