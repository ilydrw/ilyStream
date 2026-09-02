#pragma once

#include <cstddef>
#include <cstdint>

namespace ily::audio {

/**
 * The renderer's broadcast master stage expressed as a small, dependency-free
 * native contract. The transport keeps this disabled until renderer parity is
 * proven; callers can opt in for shadow/soak runs.
 */
struct MasterDspConfig {
    float headroom = 0.82F;
    float thresholdDb = -1.0F;
    float kneeDb = 6.0F;
    float ratio = 12.0F;
    float attackSeconds = 0.003F;
    float releaseSeconds = 0.05F;
    std::uint32_t sampleRate = 48000;
};

bool IsValidMasterDspConfig(const MasterDspConfig& config) noexcept;

/** Stateful stereo safety processor for interleaved, finite PCM. */
class MasterDsp final {
public:
    explicit MasterDsp(MasterDspConfig config = {});

    MasterDsp(const MasterDsp&) = delete;
    MasterDsp& operator=(const MasterDsp&) = delete;

    void Reset() noexcept;

    /** Returns false for invalid input; valid output is finite and bounded. */
    bool Process(float* interleavedStereo, std::size_t frameCount) noexcept;

    float envelope() const noexcept { return m_envelope; }
    float lastGainDb() const noexcept { return m_lastGainDb; }

private:
    MasterDspConfig m_config;
    float m_envelope = 0.0F;
    float m_lastGainDb = 0.0F;
};

} // namespace ily::audio
