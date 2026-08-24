// SPDX-License-Identifier: GPL-2.0-or-later
#include "program-audio-ring-reader.hpp"

#include "program-transport/program-audio-ring.hpp"

#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <Windows.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <limits>
#include <utility>
#include <vector>

namespace ilystream {
namespace {

using program_transport::ProgramAudioRingHeader;

constexpr std::uint64_t kNanosecondsPerSecond = 1'000'000'000ULL;
constexpr std::uint64_t kTimestampDiscontinuityToleranceNs = 5'000'000ULL;
constexpr std::size_t kSeqlockAttempts = 4;

struct RingMetadata {
    std::uint32_t magic = 0;
    std::uint16_t version = 0;
    std::uint16_t headerBytes = 0;
    std::uint32_t mappingBytes = 0;
    std::uint32_t sampleRate = 0;
    std::uint16_t channels = 0;
    std::uint16_t format = 0;
    std::uint32_t capacityFrames = 0;
    std::uint32_t blockFrames = 0;
    std::uint64_t generation = 0;
    std::uint64_t writeFrame = 0;
    std::uint64_t oldestFrame = 0;
    std::uint64_t anchorFrame = 0;
    std::uint64_t anchorTimestampNs = 0;
};

struct MappingOwner {
    HANDLE mapping = nullptr;
    void* view = nullptr;

    ~MappingOwner() {
        if (view) {
            UnmapViewOfFile(view);
        }
        if (mapping) {
            CloseHandle(mapping);
        }
    }
};

bool validRingName(const std::wstring& value) noexcept {
    constexpr wchar_t prefix[] = L"Local\\ilyStream.Program.Audio.";
    constexpr std::size_t prefixLength = std::size(prefix) - 1;
    if (value.size() <= prefixLength || value.size() > prefixLength + 64 ||
        value.compare(0, prefixLength, prefix) != 0) {
        return false;
    }
    for (std::size_t index = prefixLength; index < value.size(); ++index) {
        const wchar_t character = value[index];
        const bool valid = (character >= L'a' && character <= L'z') ||
                           (character >= L'A' && character <= L'Z') ||
                           (character >= L'0' && character <= L'9') || character == L'.' || character == L'_' ||
                           character == L'-';
        if (!valid) {
            return false;
        }
    }
    return true;
}

bool mappingBytesFor(const ProgramAudioRingOptions& options, std::size_t& bytes) noexcept {
    if (!validRingName(options.ringName) || options.generation == 0 || options.sampleRate != 48'000 ||
        options.channels != 2 || options.blockFrames == 0 || options.blockFrames > 4'096 ||
        options.capacityFrames < options.blockFrames || options.capacityFrames > 480'000 ||
        options.capacityFrames % options.blockFrames != 0) {
        return false;
    }

    const std::uint64_t sampleBytes = static_cast<std::uint64_t>(options.capacityFrames) * options.channels *
                                      sizeof(float);
    const std::uint64_t totalBytes = program_transport::kProgramAudioRingHeaderBytes + sampleBytes;
    if (totalBytes > std::numeric_limits<std::uint32_t>::max() || totalBytes > SIZE_MAX) {
        return false;
    }
    bytes = static_cast<std::size_t>(totalBytes);
    return true;
}

std::uint64_t readSequence(const ProgramAudioRingHeader* header) noexcept {
    MemoryBarrier();
    const auto* sequence = reinterpret_cast<const volatile std::uint64_t*>(&header->publishSequence);
    const std::uint64_t value = *sequence;
    MemoryBarrier();
    return value;
}

RingMetadata readMetadata(const ProgramAudioRingHeader* header) noexcept {
    return {
        header->magic,
        header->version,
        header->headerBytes,
        header->mappingBytes,
        header->sampleRate,
        header->channels,
        header->format,
        header->capacityFrames,
        header->blockFrames,
        header->generation,
        header->writeFrame,
        header->oldestFrame,
        header->anchorFrame,
        header->anchorTimestampNs,
    };
}

bool metadataMatches(const RingMetadata& metadata, const ProgramAudioRingOptions& options,
                     std::size_t expectedMappingBytes) noexcept {
    if (metadata.magic != program_transport::kProgramAudioRingMagic ||
        metadata.version != program_transport::kProgramAudioRingVersion ||
        metadata.headerBytes != program_transport::kProgramAudioRingHeaderBytes ||
        metadata.mappingBytes != expectedMappingBytes || metadata.sampleRate != options.sampleRate ||
        metadata.channels != options.channels ||
        metadata.format != program_transport::kProgramAudioFormatF32Interleaved ||
        metadata.capacityFrames != options.capacityFrames || metadata.blockFrames != options.blockFrames ||
        metadata.generation != options.generation || metadata.oldestFrame > metadata.writeFrame ||
        metadata.writeFrame - metadata.oldestFrame > metadata.capacityFrames ||
        metadata.anchorFrame > metadata.writeFrame) {
        return false;
    }
    return metadata.writeFrame == 0 || metadata.anchorTimestampNs != 0;
}

bool addFrameDuration(std::uint64_t timestampNs, std::uint64_t frames, std::uint32_t sampleRate,
                      std::uint64_t& result) noexcept {
    const std::uint64_t wholeSeconds = frames / sampleRate;
    const std::uint64_t remainingFrames = frames % sampleRate;
    if (wholeSeconds > (std::numeric_limits<std::uint64_t>::max() - timestampNs) / kNanosecondsPerSecond) {
        return false;
    }
    const std::uint64_t wholeNanoseconds = wholeSeconds * kNanosecondsPerSecond;
    const std::uint64_t partialNanoseconds = remainingFrames * kNanosecondsPerSecond / sampleRate;
    if (partialNanoseconds > std::numeric_limits<std::uint64_t>::max() - timestampNs - wholeNanoseconds) {
        return false;
    }
    result = timestampNs + wholeNanoseconds + partialNanoseconds;
    return true;
}

bool subtractFrameDuration(std::uint64_t timestampNs, std::uint64_t frames, std::uint32_t sampleRate,
                           std::uint64_t& result) noexcept {
    std::uint64_t duration = 0;
    if (!addFrameDuration(0, frames, sampleRate, duration) || duration >= timestampNs) {
        return false;
    }
    result = timestampNs - duration;
    return true;
}

bool timestampFor(const RingMetadata& metadata, std::uint64_t frame, std::uint64_t& timestampNs) noexcept {
    if (frame >= metadata.anchorFrame) {
        return addFrameDuration(metadata.anchorTimestampNs, frame - metadata.anchorFrame, metadata.sampleRate,
                                timestampNs);
    }
    return subtractFrameDuration(metadata.anchorTimestampNs, metadata.anchorFrame - frame, metadata.sampleRate,
                                 timestampNs);
}

std::uint64_t absoluteDifference(std::uint64_t left, std::uint64_t right) noexcept {
    return left > right ? left - right : right - left;
}

} // namespace

struct ProgramAudioRingState {
    ProgramAudioRingOptions options;
    ProgramAudioMappedView view;
    ProgramAudioRingHeader* header = nullptr;
    float* samples = nullptr;
    std::size_t expectedMappingBytes = 0;
    std::atomic<bool> retired{false};
    std::atomic<std::uint64_t> framesRead{0};
    std::atomic<std::uint64_t> framesSkipped{0};
    std::atomic<std::uint64_t> underruns{0};
    std::atomic<std::uint64_t> seqlockRetries{0};
    std::atomic<std::uint64_t> lastTimestampNs{0};

    bool copyMetadata(RingMetadata& metadata) noexcept {
        for (std::size_t attempt = 0; attempt < kSeqlockAttempts; ++attempt) {
            const std::uint64_t before = readSequence(header);
            if ((before & 1U) != 0) {
                seqlockRetries.fetch_add(1, std::memory_order_relaxed);
                continue;
            }
            metadata = readMetadata(header);
            MemoryBarrier();
            const std::uint64_t after = readSequence(header);
            if (before == after && (after & 1U) == 0) {
                return metadataMatches(metadata, options, expectedMappingBytes);
            }
            seqlockRetries.fetch_add(1, std::memory_order_relaxed);
        }
        return false;
    }
};

namespace {

class MappedProgramAudioReader final : public ProgramAudioReader {
  public:
    explicit MappedProgramAudioReader(std::shared_ptr<ProgramAudioRingState> state) : state_(std::move(state)) {
        for (auto& plane : planes_) {
            plane.resize(kProgramAudioOutputFrames);
        }

        RingMetadata metadata;
        if (state_->copyMetadata(metadata)) {
            cursor_ = metadata.writeFrame;
            initialized_ = true;
        }
    }

    bool read(std::uint32_t sampleRate, std::size_t channels, std::size_t frames,
              ProgramAudioBlockView& block) noexcept override {
        block = {};
        if (state_->retired.load(std::memory_order_acquire) || sampleRate != state_->options.sampleRate ||
            channels == 0 || channels > kProgramAudioMaxChannels || frames != kProgramAudioOutputFrames) {
            return false;
        }
        const std::size_t sourceChannels = state_->options.channels;
        const std::size_t outputChannels = std::min(channels, sourceChannels);

        for (std::size_t attempt = 0; attempt < kSeqlockAttempts; ++attempt) {
            const std::uint64_t before = readSequence(state_->header);
            if ((before & 1U) != 0) {
                state_->seqlockRetries.fetch_add(1, std::memory_order_relaxed);
                continue;
            }

            const RingMetadata metadata = readMetadata(state_->header);
            if (!metadataMatches(metadata, state_->options, state_->expectedMappingBytes)) {
                MemoryBarrier();
                const std::uint64_t after = readSequence(state_->header);
                if (before == after && (after & 1U) == 0) {
                    state_->retired.store(true, std::memory_order_release);
                    return false;
                }
                state_->seqlockRetries.fetch_add(1, std::memory_order_relaxed);
                continue;
            }

            std::uint64_t readCursor = initialized_ ? cursor_ : metadata.oldestFrame;
            std::uint64_t skippedFrames = 0;
            std::size_t silenceFrames = 0;
            if (readCursor > metadata.writeFrame) {
                readCursor = metadata.oldestFrame;
                expectedTimestampNs_ = 0;
            }
            if (readCursor < metadata.oldestFrame) {
                skippedFrames = metadata.oldestFrame - readCursor;
                if (skippedFrames <= kProgramAudioOutputFrames) {
                    silenceFrames = static_cast<std::size_t>(skippedFrames);
                } else {
                    readCursor = metadata.oldestFrame;
                    expectedTimestampNs_ = 0;
                }
            }

            const std::uint64_t copyStart = readCursor + silenceFrames;
            const std::size_t copyFrames = frames - silenceFrames;
            if (copyStart > metadata.writeFrame || metadata.writeFrame - copyStart < copyFrames) {
                MemoryBarrier();
                const std::uint64_t after = readSequence(state_->header);
                if (before == after && (after & 1U) == 0) {
                    state_->underruns.fetch_add(1, std::memory_order_relaxed);
                    return false;
                }
                state_->seqlockRetries.fetch_add(1, std::memory_order_relaxed);
                continue;
            }

            std::uint64_t timestampNs = 0;
            if (!timestampFor(metadata, readCursor, timestampNs)) {
                state_->retired.store(true, std::memory_order_release);
                return false;
            }
            if (expectedTimestampNs_ != 0 &&
                absoluteDifference(timestampNs, expectedTimestampNs_) > kTimestampDiscontinuityToleranceNs) {
                readCursor = std::clamp(metadata.anchorFrame, metadata.oldestFrame, metadata.writeFrame);
                silenceFrames = 0;
                skippedFrames = readCursor > cursor_ ? readCursor - cursor_ : 0;
                if (metadata.writeFrame - readCursor < frames || !timestampFor(metadata, readCursor, timestampNs)) {
                    state_->underruns.fetch_add(1, std::memory_order_relaxed);
                    return false;
                }
            }

            for (std::size_t channel = 0; channel < outputChannels; ++channel) {
                auto& plane = planes_[channel];
                std::fill_n(plane.data(), silenceFrames, 0.0F);
                for (std::size_t frame = silenceFrames; frame < frames; ++frame) {
                    const std::uint64_t absoluteFrame = readCursor + frame;
                    const std::size_t ringFrame = static_cast<std::size_t>(absoluteFrame % metadata.capacityFrames);
                    if (outputChannels == 1 && sourceChannels > 1) {
                        float mixed = 0.0F;
                        for (std::size_t sourceChannel = 0; sourceChannel < sourceChannels; ++sourceChannel) {
                            mixed += state_->samples[ringFrame * sourceChannels + sourceChannel];
                        }
                        plane[frame] = mixed / static_cast<float>(sourceChannels);
                    } else {
                        plane[frame] = state_->samples[ringFrame * sourceChannels + channel];
                    }
                }
            }

            MemoryBarrier();
            const std::uint64_t after = readSequence(state_->header);
            if (before != after || (after & 1U) != 0) {
                state_->seqlockRetries.fetch_add(1, std::memory_order_relaxed);
                continue;
            }
            if (state_->retired.load(std::memory_order_acquire)) {
                return false;
            }

            std::uint64_t nextTimestampNs = 0;
            if (!addFrameDuration(timestampNs, frames, metadata.sampleRate, nextTimestampNs)) {
                state_->retired.store(true, std::memory_order_release);
                return false;
            }

            cursor_ = readCursor + frames;
            initialized_ = true;
            expectedTimestampNs_ = nextTimestampNs;
            state_->framesRead.fetch_add(frames, std::memory_order_relaxed);
            state_->framesSkipped.fetch_add(skippedFrames, std::memory_order_relaxed);
            state_->lastTimestampNs.store(timestampNs, std::memory_order_relaxed);
            block.timestampNs = timestampNs;
            block.channelCount = outputChannels;
            block.frameCount = frames;
            for (std::size_t channel = 0; channel < outputChannels; ++channel) {
                block.planes[channel] = planes_[channel].data();
            }
            return true;
        }

        state_->underruns.fetch_add(1, std::memory_order_relaxed);
        return false;
    }

  private:
    std::shared_ptr<ProgramAudioRingState> state_;
    std::array<std::vector<float>, kProgramAudioMaxChannels> planes_;
    std::uint64_t cursor_ = 0;
    std::uint64_t expectedTimestampNs_ = 0;
    bool initialized_ = false;
};

} // namespace

ProgramAudioRing::ProgramAudioRing(std::shared_ptr<ProgramAudioRingState> state) : state_(std::move(state)) {}

std::shared_ptr<ProgramAudioRing> ProgramAudioRing::open(const ProgramAudioRingOptions& options,
                                                        std::uint32_t* errorCode) noexcept {
    if (errorCode) {
        *errorCode = ERROR_SUCCESS;
    }

    std::size_t expectedMappingBytes = 0;
    if (!mappingBytesFor(options, expectedMappingBytes)) {
        if (errorCode) {
            *errorCode = ERROR_INVALID_PARAMETER;
        }
        return nullptr;
    }

    HANDLE mapping = OpenFileMappingW(FILE_MAP_READ, FALSE, options.ringName.c_str());
    if (!mapping) {
        if (errorCode) {
            *errorCode = GetLastError();
        }
        return nullptr;
    }

    void* view = MapViewOfFile(mapping, FILE_MAP_READ, 0, 0, expectedMappingBytes);
    if (!view) {
        const DWORD error = GetLastError();
        CloseHandle(mapping);
        if (errorCode) {
            *errorCode = error;
        }
        return nullptr;
    }

    try {
        auto owner = std::make_shared<MappingOwner>();
        owner->mapping = mapping;
        owner->view = view;
        auto ring = attach(options, {view, expectedMappingBytes, owner});
        if (!ring && errorCode) {
            *errorCode = ERROR_INVALID_DATA;
        }
        return ring;
    } catch (...) {
        UnmapViewOfFile(view);
        CloseHandle(mapping);
        if (errorCode) {
            *errorCode = ERROR_NOT_ENOUGH_MEMORY;
        }
        return nullptr;
    }
}

std::shared_ptr<ProgramAudioRing> ProgramAudioRing::attach(const ProgramAudioRingOptions& options,
                                                          ProgramAudioMappedView view) noexcept {
    std::size_t expectedMappingBytes = 0;
    if (!mappingBytesFor(options, expectedMappingBytes) || !view.data || view.bytes < expectedMappingBytes ||
        reinterpret_cast<std::uintptr_t>(view.data) % alignof(ProgramAudioRingHeader) != 0) {
        return nullptr;
    }

    try {
        auto state = std::make_shared<ProgramAudioRingState>();
        state->options = options;
        state->view = std::move(view);
        state->header = static_cast<ProgramAudioRingHeader*>(state->view.data);
        state->samples = reinterpret_cast<float*>(static_cast<std::uint8_t*>(state->view.data) +
                                                  program_transport::kProgramAudioRingHeaderBytes);
        state->expectedMappingBytes = expectedMappingBytes;
        RingMetadata metadata;
        if (!state->copyMetadata(metadata)) {
            return nullptr;
        }
        return std::shared_ptr<ProgramAudioRing>(new ProgramAudioRing(std::move(state)));
    } catch (...) {
        return nullptr;
    }
}

std::unique_ptr<ProgramAudioReader> ProgramAudioRing::createReader() const noexcept {
    try {
        return std::make_unique<MappedProgramAudioReader>(state_);
    } catch (...) {
        return nullptr;
    }
}

void ProgramAudioRing::retire(std::uint64_t generation) noexcept {
    if (generation == state_->options.generation) {
        state_->retired.store(true, std::memory_order_release);
    }
}

bool ProgramAudioRing::available() const noexcept { return !state_->retired.load(std::memory_order_acquire); }

ProgramAudioRingStats ProgramAudioRing::stats() const noexcept {
    return {
        state_->framesRead.load(std::memory_order_relaxed),
        state_->framesSkipped.load(std::memory_order_relaxed),
        state_->underruns.load(std::memory_order_relaxed),
        state_->seqlockRetries.load(std::memory_order_relaxed),
        state_->lastTimestampNs.load(std::memory_order_relaxed),
    };
}

} // namespace ilystream
