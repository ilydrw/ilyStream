#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace ily::audio {

struct SharedAudioRingOptions {
    std::string ringName;
    std::uint64_t generation = 0;
    std::uint32_t sampleRate = 0;
    std::uint32_t channels = 0;
    std::uint32_t capacityFrames = 0;
    std::uint32_t blockFrames = 0;
};

struct SharedAudioReadStatus {
    std::uint64_t writeFrame = 0;
    std::uint64_t framesRead = 0;
    std::uint64_t framesSkipped = 0;
    std::uint64_t producerFramesDropped = 0;
};

enum class SharedAudioReadResult {
    data,
    noData,
    closed,
    error
};

/** Current-user-only, bounded f32 PCM ring writer. */
class SharedAudioRingWriter final {
public:
    static std::unique_ptr<SharedAudioRingWriter> Create(
        const SharedAudioRingOptions& options, std::string& error);
    ~SharedAudioRingWriter();

    SharedAudioRingWriter(const SharedAudioRingWriter&) = delete;
    SharedAudioRingWriter& operator=(const SharedAudioRingWriter&) = delete;

    bool Publish(const float* samples, std::size_t sampleCount,
                 std::uint64_t timestampNs, std::uint64_t framesDropped = 0);
    void Close();

private:
    struct Impl;
    explicit SharedAudioRingWriter(std::unique_ptr<Impl> impl);
    std::unique_ptr<Impl> m_impl;
};

/** Read-only consumer for a ring created by SharedAudioRingWriter. */
class SharedAudioRingReader final {
public:
    static std::unique_ptr<SharedAudioRingReader> Open(
        const SharedAudioRingOptions& options, std::string& error);
    ~SharedAudioRingReader();

    SharedAudioRingReader(const SharedAudioRingReader&) = delete;
    SharedAudioRingReader& operator=(const SharedAudioRingReader&) = delete;

    SharedAudioReadResult Read(std::size_t maxFrames, std::vector<float>& samples,
                               SharedAudioReadStatus& status);
    void Close();

private:
    struct Impl;
    explicit SharedAudioRingReader(std::unique_ptr<Impl> impl);
    std::unique_ptr<Impl> m_impl;
};

bool IsValidSharedAudioRingOptions(const SharedAudioRingOptions& options) noexcept;

} // namespace ily::audio
