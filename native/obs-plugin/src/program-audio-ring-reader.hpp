// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once

#include "program-transport.hpp"

#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>

namespace ilystream {

inline constexpr std::size_t kProgramAudioOutputFrames = 1024;

struct ProgramAudioRingOptions {
    std::wstring ringName;
    std::uint64_t generation = 0;
    std::uint32_t sampleRate = 0;
    std::uint32_t channels = 0;
    std::uint32_t capacityFrames = 0;
    std::uint32_t blockFrames = 0;
};

struct ProgramAudioMappedView {
    void* data = nullptr;
    std::size_t bytes = 0;
    std::shared_ptr<void> lifetime;
};

struct ProgramAudioRingStats {
    std::uint64_t framesRead = 0;
    std::uint64_t framesSkipped = 0;
    std::uint64_t underruns = 0;
    std::uint64_t seqlockRetries = 0;
    std::uint64_t lastTimestampNs = 0;
};

struct ProgramAudioRingState;

class ProgramAudioRing final {
  public:
    static std::shared_ptr<ProgramAudioRing> open(const ProgramAudioRingOptions& options,
                                                  std::uint32_t* errorCode = nullptr) noexcept;
    static std::shared_ptr<ProgramAudioRing> attach(const ProgramAudioRingOptions& options,
                                                    ProgramAudioMappedView view) noexcept;

    std::unique_ptr<ProgramAudioReader> createReader() const noexcept;
    void retire(std::uint64_t generation) noexcept;
    bool available() const noexcept;
    ProgramAudioRingStats stats() const noexcept;

  private:
    explicit ProgramAudioRing(std::shared_ptr<ProgramAudioRingState> state);

    std::shared_ptr<ProgramAudioRingState> state_;
};

} // namespace ilystream
