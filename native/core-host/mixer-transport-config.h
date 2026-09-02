#pragma once

#include "master_dsp.h"

#include <nlohmann/json.hpp>

#include <optional>

namespace ily::core_host {

/**
 * Parses the optional mixer.startTransport master stage. The host transport
 * is fixed at 48 kHz, so a different sample rate is never accepted here.
 */
std::optional<ily::audio::MasterDspConfig> ParseMasterDspConfig(
    const nlohmann::json& params);

} // namespace ily::core_host
