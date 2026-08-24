// SPDX-License-Identifier: GPL-2.0-or-later
#include "../src/program-video-control-reader.hpp"

#include "program-transport/program-video-control.hpp"

#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <Windows.h>

#include <cstdlib>
#include <cstring>
#include <iostream>

namespace {

using ilystream::ProgramVideoControlReadResult;
using ilystream::ProgramVideoControlSnapshot;
using ilystream::program_transport::ProgramVideoControlHeader;

int failures = 0;

void check(bool condition, const char* message) {
    if (condition) {
        return;
    }
    ++failures;
    std::cerr << "FAILED: " << message << '\n';
}

void initialize(ProgramVideoControlHeader& header, std::uint64_t generation) {
    std::memset(&header, 0, sizeof(header));
    header.magic = ilystream::program_transport::kProgramVideoControlMagic;
    header.version = ilystream::program_transport::kProgramVideoControlVersion;
    header.headerBytes = static_cast<std::uint16_t>(ilystream::program_transport::kProgramVideoControlBytes);
    header.slotCount = ilystream::program_transport::kProgramVideoSlotCount;
    header.generation = generation;
    header.latestSlot = ilystream::program_transport::kProgramVideoNoSlot;
}

void publish(ProgramVideoControlHeader& header, std::uint64_t frameSequence, std::uint32_t slot,
             std::uint64_t timestampNs) {
    auto* sequence = reinterpret_cast<volatile LONG64*>(&header.publishSequence);
    InterlockedIncrement64(sequence);
    header.frameSequence = frameSequence;
    header.slotFrameSequence[slot] = frameSequence;
    header.latestSlot = slot;
    header.monotonicTimestampNs = timestampNs;
    MemoryBarrier();
    InterlockedIncrement64(sequence);
}

} // namespace

int main() {
    alignas(64) ProgramVideoControlHeader header{};
    initialize(header, 7);
    ProgramVideoControlSnapshot snapshot;
    check(ilystream::readProgramVideoControl(&header, 7, snapshot) == ProgramVideoControlReadResult::NoFrame,
          "an initialized control page may have no frame yet");

    publish(header, 12, 1, 123'456'789ULL);
    check(ilystream::readProgramVideoControl(&header, 7, snapshot) == ProgramVideoControlReadResult::Ready,
          "a stable published frame is readable");
    check(snapshot.frameSequence == 12 && snapshot.latestSlot == 1 && snapshot.slotFrameSequence[1] == 12 &&
              snapshot.monotonicTimestampNs == 123'456'789ULL,
          "the reader returns one coherent latest-slot snapshot");
    const ProgramVideoControlSnapshot selected = snapshot;
    check(ilystream::programVideoSnapshotsMatch(selected, snapshot),
          "post-acquire verification accepts the same coherent publication");

    publish(header, 13, 0, 123'456'999ULL);
    check(ilystream::readProgramVideoControl(&header, 7, snapshot) == ProgramVideoControlReadResult::Ready &&
              !ilystream::programVideoSnapshotsMatch(selected, snapshot),
          "post-acquire verification rejects a newer publication in the other slot");
    header.slotFrameSequence[1] = 14;
    check(ilystream::readProgramVideoControl(&header, 7, snapshot) == ProgramVideoControlReadResult::Ready &&
              !ilystream::programVideoSnapshotsMatch(selected, snapshot),
          "post-acquire verification rejects a slot reused for another frame");
    header.slotFrameSequence[1] = 12;

    auto* sequence = reinterpret_cast<volatile LONG64*>(&header.publishSequence);
    InterlockedIncrement64(sequence);
    check(ilystream::readProgramVideoControl(&header, 7, snapshot) == ProgramVideoControlReadResult::Busy,
          "an odd producer seqlock is retried without blocking");
    InterlockedIncrement64(sequence);

    header.slotFrameSequence[0] = 11;
    check(ilystream::readProgramVideoControl(&header, 7, snapshot) == ProgramVideoControlReadResult::Invalid,
          "latest slot must carry the published frame sequence");
    header.slotFrameSequence[0] = 13;
    header.flags = ilystream::program_transport::kProgramVideoControlFlagRetired;
    check(ilystream::readProgramVideoControl(&header, 7, snapshot) == ProgramVideoControlReadResult::Invalid,
          "a retired control generation fails closed even when its last frame metadata is coherent");
    header.flags = 0;
    check(ilystream::readProgramVideoControl(&header, 8, snapshot) == ProgramVideoControlReadResult::Invalid,
          "a generation mismatch fails closed");

    if (failures == 0) {
        std::cout << "Program video control reader tests passed\n";
    }
    return failures == 0 ? EXIT_SUCCESS : EXIT_FAILURE;
}
