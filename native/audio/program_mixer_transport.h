#pragma once

#include "program_mixer_core.h"
#include "shared_audio_ring.h"
#include "master_dsp.h"

#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace ily::audio {

struct ProgramMixerTransportSource {
    std::string id;
    SharedAudioRingOptions ring;
    float gain = 1.0F;
    float pan = 0.0F;
    bool mono = false;
};

struct ProgramMixerTransportOptions {
    std::vector<ProgramMixerTransportSource> sources;
    SharedAudioRingOptions outputRing;
    // Optional native master stage. Left unset while the renderer is the
    // authoritative encoder input during parity validation.
    std::optional<MasterDspConfig> masterDsp;
};

struct ProgramMixerTransportStatus {
    bool running = false;
    std::uint64_t blocksMixed = 0;
    std::uint64_t framesMixed = 0;
    std::uint64_t sourceUnderruns = 0;
    std::uint64_t sourceFramesSkipped = 0;
};

/**
 * Reads synchronized stereo source rings and publishes a native Program ring.
 * Source zero drives the clock; a late secondary source contributes silence.
 */
class ProgramMixerTransport final {
public:
    static std::unique_ptr<ProgramMixerTransport> Start(
        const ProgramMixerTransportOptions& options, std::string& error);
    ~ProgramMixerTransport();

    ProgramMixerTransport(const ProgramMixerTransport&) = delete;
    ProgramMixerTransport& operator=(const ProgramMixerTransport&) = delete;

    ProgramMixerTransportStatus GetStatus() const noexcept;
    ProgramMixerTransportStatus Stop() noexcept;

private:
    struct Impl;
    explicit ProgramMixerTransport(std::unique_ptr<Impl> impl);
    std::unique_ptr<Impl> m_impl;
};

} // namespace ily::audio
