#include "mixer-transport-config.h"

#include <cmath>
#include <stdexcept>
#include <string>

namespace ily::core_host {
namespace {

double RequiredFiniteNumber(const nlohmann::json& object, const char* field,
                            double minimum, double maximum) {
    if (!object.contains(field) || !object.at(field).is_number()) {
        throw std::runtime_error(std::string("Mixer field must be numeric: ") + field);
    }
    const double value = object.at(field).get<double>();
    if (!std::isfinite(value) || value < minimum || value > maximum) {
        throw std::runtime_error(std::string("Mixer field is out of range: ") + field);
    }
    return value;
}

} // namespace

std::optional<ily::audio::MasterDspConfig> ParseMasterDspConfig(
    const nlohmann::json& params) {
    if (!params.is_object() || !params.contains("masterDsp")) return std::nullopt;
    const auto& value = params.at("masterDsp");
    if (!value.is_object()) throw std::runtime_error("Mixer masterDsp must be an object");
    for (const auto& item : value.items()) {
        if (item.key() != "headroom" && item.key() != "thresholdDb" &&
            item.key() != "kneeDb" && item.key() != "ratio" &&
            item.key() != "attackSeconds" && item.key() != "releaseSeconds" &&
            item.key() != "sampleRate") {
            throw std::runtime_error("Unknown mixer masterDsp field");
        }
    }
    ily::audio::MasterDspConfig config;
    if (value.contains("headroom")) {
        config.headroom = static_cast<float>(RequiredFiniteNumber(value, "headroom", 0.01, 1.0));
    }
    if (value.contains("thresholdDb")) {
        config.thresholdDb = static_cast<float>(RequiredFiniteNumber(value, "thresholdDb", -60.0, 0.0));
    }
    if (value.contains("kneeDb")) {
        config.kneeDb = static_cast<float>(RequiredFiniteNumber(value, "kneeDb", 0.0, 30.0));
    }
    if (value.contains("ratio")) {
        config.ratio = static_cast<float>(RequiredFiniteNumber(value, "ratio", 1.0, 100.0));
    }
    if (value.contains("attackSeconds")) {
        config.attackSeconds = static_cast<float>(RequiredFiniteNumber(value, "attackSeconds", 0.000001, 10.0));
    }
    if (value.contains("releaseSeconds")) {
        config.releaseSeconds = static_cast<float>(RequiredFiniteNumber(value, "releaseSeconds", 0.000001, 10.0));
    }
    if (value.contains("sampleRate")) {
        const double sampleRate = RequiredFiniteNumber(value, "sampleRate", 48000.0, 48000.0);
        if (std::floor(sampleRate) != sampleRate) {
            throw std::runtime_error("Mixer masterDsp sampleRate must be an integer");
        }
        config.sampleRate = static_cast<std::uint32_t>(sampleRate);
    }
    if (!ily::audio::IsValidMasterDspConfig(config) || config.sampleRate != 48000) {
        throw std::runtime_error("Mixer masterDsp configuration is out of range");
    }
    return config;
}

} // namespace ily::core_host
