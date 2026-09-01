#pragma once

#include <cstddef>
#include <string>
#include <unordered_set>
#include <vector>

namespace ily::audio {

enum class MonitoringMode { off, monitorOnly, monitorAndOutput };

struct MixerSourcePolicy {
    std::string id;
    float volume = 1.0F;
    float pan = 0.0F;
    bool muted = false;
    bool solo = false;
    bool global = false;
    bool mono = false;
    MonitoringMode monitoring = MonitoringMode::off;
};

struct MixerTransitionPolicy {
    bool active = false;
    bool fade = false;
    float progress = 0.0F;
    std::unordered_set<std::string> fromLayerIds;
    std::unordered_set<std::string> toLayerIds;
};

struct MixerRoutingPolicy {
    std::unordered_set<std::string> activeLayerIds;
    std::unordered_set<std::string> retainedLayerIds;
    MixerTransitionPolicy transition;
};

struct MixerRouteDecision {
    std::string id;
    bool eligible = false;
    bool output = false;
    float sceneGain = 0.0F;
    float effectiveGain = 0.0F;
};

std::vector<MixerRouteDecision> EvaluateProgramRoutes(
    const std::vector<MixerSourcePolicy>& sources, const MixerRoutingPolicy& policy);

struct StereoMixInput {
    const float* samples = nullptr;
    std::size_t frameCount = 0;
    float gain = 0.0F;
    float pan = 0.0F;
    bool mono = false;
};

/** Mixes interleaved stereo inputs without allocation or clipping. */
bool MixStereoProgram(const std::vector<StereoMixInput>& inputs,
                      std::size_t frameCount, float* output) noexcept;

} // namespace ily::audio
