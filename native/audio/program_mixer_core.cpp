#include "program_mixer_core.h"

#include <algorithm>
#include <cmath>

namespace ily::audio {
namespace {

constexpr float kHalfPi = 1.57079632679489661923F;

bool Contains(const std::unordered_set<std::string>& values, const std::string& value) {
    return values.find(value) != values.end();
}

bool HasSolo(const std::vector<MixerSourcePolicy>& sources,
             const std::unordered_set<std::string>& layerIds) {
    return std::any_of(sources.begin(), sources.end(), [&](const auto& source) {
        return source.solo && (source.global || Contains(layerIds, source.id));
    });
}

float SceneGain(const MixerSourcePolicy& source, const MixerRoutingPolicy& policy,
                bool activeHasSolo, bool fromHasSolo, bool toHasSolo) {
    const auto passesSolo = [&](bool sceneHasSolo) { return !sceneHasSolo || source.solo; };
    if (policy.transition.active && policy.transition.fade) {
        const float progress = std::clamp(policy.transition.progress, 0.0F, 1.0F);
        const bool inFrom = source.global || Contains(policy.transition.fromLayerIds, source.id);
        const bool inTo = source.global || Contains(policy.transition.toLayerIds, source.id);
        const float fromGain = inFrom && passesSolo(fromHasSolo) ? 1.0F - progress : 0.0F;
        const float toGain = inTo && passesSolo(toHasSolo) ? progress : 0.0F;
        return std::min(1.0F, fromGain + toGain);
    }
    return (source.global || Contains(policy.activeLayerIds, source.id)) && passesSolo(activeHasSolo)
        ? 1.0F : 0.0F;
}

} // namespace

std::vector<MixerRouteDecision> EvaluateProgramRoutes(
    const std::vector<MixerSourcePolicy>& sources, const MixerRoutingPolicy& policy) {
    const bool activeHasSolo = HasSolo(sources, policy.activeLayerIds);
    const bool fromHasSolo = HasSolo(sources, policy.transition.fromLayerIds);
    const bool toHasSolo = HasSolo(sources, policy.transition.toLayerIds);
    std::vector<MixerRouteDecision> result;
    result.reserve(sources.size());
    for (const auto& source : sources) {
        const bool eligible = source.global || Contains(policy.retainedLayerIds, source.id);
        const bool output = eligible && !source.muted && source.monitoring != MonitoringMode::monitorOnly;
        const float sceneGain = SceneGain(source, policy, activeHasSolo, fromHasSolo, toHasSolo);
        result.push_back({source.id, eligible, output, sceneGain,
            output ? std::max(0.0F, source.volume) * sceneGain : 0.0F});
    }
    return result;
}

bool MixStereoProgram(const std::vector<StereoMixInput>& inputs,
                      std::size_t frameCount, float* output) noexcept {
    if (!output || frameCount == 0) return false;
    std::fill_n(output, frameCount * 2, 0.0F);
    for (const auto& input : inputs) {
        if (!input.samples || input.frameCount != frameCount || !std::isfinite(input.gain) ||
            !std::isfinite(input.pan)) return false;
        const float pan = std::clamp(input.pan, -1.0F, 1.0F);
        for (std::size_t frame = 0; frame < frameCount; ++frame) {
            float left = input.samples[frame * 2];
            float right = input.samples[frame * 2 + 1];
            if (!std::isfinite(left) || !std::isfinite(right)) return false;
            if (input.mono) left = right = left + right;
            float pannedLeft = 0.0F;
            float pannedRight = 0.0F;
            if (pan <= 0.0F) {
                const float angle = (pan + 1.0F) * kHalfPi;
                pannedLeft = left + right * std::cos(angle);
                pannedRight = right * std::sin(angle);
            } else {
                const float angle = pan * kHalfPi;
                pannedLeft = left * std::cos(angle);
                pannedRight = right + left * std::sin(angle);
            }
            output[frame * 2] += pannedLeft * input.gain;
            output[frame * 2 + 1] += pannedRight * input.gain;
        }
    }
    return true;
}

} // namespace ily::audio
