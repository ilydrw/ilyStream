#include "master_dsp.h"

#include <algorithm>
#include <cmath>

namespace ily::audio {
namespace {

constexpr float kMinDb = -120.0F;

float ToDb(float linear) noexcept {
    return linear > 0.0F ? 20.0F * std::log10(linear) : kMinDb;
}

float ToLinear(float db) noexcept {
    return std::pow(10.0F, db / 20.0F);
}

float CompressorGainDb(float envelopeDb, const MasterDspConfig& config) noexcept {
    const float over = envelopeDb - config.thresholdDb;
    if (config.kneeDb <= 0.0F) {
        return over > 0.0F ? (over / config.ratio) - over : 0.0F;
    }

    const float halfKnee = config.kneeDb * 0.5F;
    if (over <= -halfKnee) return 0.0F;
    if (over >= halfKnee) return (over / config.ratio) - over;

    // Standard quadratic soft-knee transition. It is continuous at both
    // edges, which avoids a discontinuity when the native stage is enabled.
    const float x = over + halfKnee;
    const float compressedOver = (1.0F / config.ratio - 1.0F) * x * x /
        (2.0F * config.kneeDb);
    return compressedOver - over;
}

} // namespace

bool IsValidMasterDspConfig(const MasterDspConfig& config) noexcept {
    return std::isfinite(config.headroom) && config.headroom > 0.0F && config.headroom <= 1.0F &&
        std::isfinite(config.thresholdDb) && config.thresholdDb <= 0.0F && config.thresholdDb >= -60.0F &&
        std::isfinite(config.kneeDb) && config.kneeDb >= 0.0F && config.kneeDb <= 30.0F &&
        std::isfinite(config.ratio) && config.ratio >= 1.0F && config.ratio <= 100.0F &&
        std::isfinite(config.attackSeconds) && config.attackSeconds > 0.0F && config.attackSeconds <= 10.0F &&
        std::isfinite(config.releaseSeconds) && config.releaseSeconds > 0.0F && config.releaseSeconds <= 10.0F &&
        config.sampleRate >= 8000 && config.sampleRate <= 384000;
}

MasterDsp::MasterDsp(MasterDspConfig config) : m_config(config) {
    if (!IsValidMasterDspConfig(m_config)) m_config = {};
}

void MasterDsp::Reset() noexcept {
    m_envelope = 0.0F;
    m_lastGainDb = 0.0F;
    m_processedFrames.store(0, std::memory_order_relaxed);
    m_clippedFrames.store(0, std::memory_order_relaxed);
    m_maxInputPeak.store(0.0F, std::memory_order_relaxed);
    m_maxOutputPeak.store(0.0F, std::memory_order_relaxed);
    m_maxGainReductionDb.store(0.0F, std::memory_order_relaxed);
}

MasterDspStatus MasterDsp::GetStatus() const noexcept {
    return {true,
        m_processedFrames.load(std::memory_order_relaxed),
        m_clippedFrames.load(std::memory_order_relaxed),
        m_maxInputPeak.load(std::memory_order_relaxed),
        m_maxOutputPeak.load(std::memory_order_relaxed),
        m_maxGainReductionDb.load(std::memory_order_relaxed)};
}

bool MasterDsp::Process(float* interleavedStereo, std::size_t frameCount) noexcept {
    if (!interleavedStereo || frameCount == 0 || !IsValidMasterDspConfig(m_config)) return false;

    const float attackCoeff = std::exp(-1.0F /
        (static_cast<float>(m_config.sampleRate) * m_config.attackSeconds));
    const float releaseCoeff = std::exp(-1.0F /
        (static_cast<float>(m_config.sampleRate) * m_config.releaseSeconds));

    for (std::size_t frame = 0; frame < frameCount; ++frame) {
        float left = interleavedStereo[frame * 2];
        float right = interleavedStereo[frame * 2 + 1];
        if (!std::isfinite(left) || !std::isfinite(right)) return false;

        left *= m_config.headroom;
        right *= m_config.headroom;
        const float peak = std::max(std::abs(left), std::abs(right));
        const float coeff = peak > m_envelope ? attackCoeff : releaseCoeff;
        m_envelope = coeff * m_envelope + (1.0F - coeff) * peak;

        const float gainDb = CompressorGainDb(ToDb(m_envelope), m_config);
        const float gain = ToLinear(gainDb);
        left = std::clamp(left * gain, -1.0F, 1.0F);
        right = std::clamp(right * gain, -1.0F, 1.0F);
        if (!std::isfinite(left) || !std::isfinite(right)) return false;
        interleavedStereo[frame * 2] = left;
        interleavedStereo[frame * 2 + 1] = right;
        m_lastGainDb = gainDb;
        m_processedFrames.fetch_add(1, std::memory_order_relaxed);
        if (std::abs(left) >= 1.0F || std::abs(right) >= 1.0F) {
            m_clippedFrames.fetch_add(1, std::memory_order_relaxed);
        }
        const float inputPeak = std::min(peak, 1'000'000.0F);
        const float outputPeak = std::max(std::abs(left), std::abs(right));
        float previous = m_maxInputPeak.load(std::memory_order_relaxed);
        while (previous < inputPeak && !m_maxInputPeak.compare_exchange_weak(
            previous, inputPeak, std::memory_order_relaxed)) {}
        previous = m_maxOutputPeak.load(std::memory_order_relaxed);
        while (previous < outputPeak && !m_maxOutputPeak.compare_exchange_weak(
            previous, outputPeak, std::memory_order_relaxed)) {}
        const float reduction = std::min(std::max(0.0F, -gainDb), 120.0F);
        previous = m_maxGainReductionDb.load(std::memory_order_relaxed);
        while (previous < reduction && !m_maxGainReductionDb.compare_exchange_weak(
            previous, reduction, std::memory_order_relaxed)) {}
    }
    return true;
}

} // namespace ily::audio
