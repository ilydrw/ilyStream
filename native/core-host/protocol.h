#pragma once

#include <functional>
#include <string>
#include <nlohmann/json.hpp>

namespace ily::core_host {

inline constexpr int kProtocolVersion = 4;
inline constexpr std::size_t kMaxRequestBytes = 64 * 1024;

struct HostOperations {
    std::function<nlohmann::json()> health;
    std::function<nlohmann::json()> initializeEngine;
    std::function<nlohmann::json()> shutdownEngine;
    std::function<nlohmann::json()> listAudioDevices;
    std::function<nlohmann::json()> getAudioStatus;
    std::function<nlohmann::json(const nlohmann::json&)> startAudioCapture;
    std::function<nlohmann::json()> stopAudioCapture;
    std::function<nlohmann::json(const nlohmann::json&)> evaluateMixer;
    std::function<nlohmann::json(const nlohmann::json&)> startMixerTransport;
    std::function<nlohmann::json()> getMixerTransportStatus;
    std::function<nlohmann::json()> stopMixerTransport;
};

class ProtocolSession {
public:
    ProtocolSession(std::string capability, HostOperations operations);
    std::string HandleLine(const std::string& line);
    bool ShouldExit() const noexcept { return m_shouldExit; }

private:
    bool ConstantTimeCapabilityMatch(const std::string& candidate) const noexcept;
    nlohmann::json Dispatch(const nlohmann::json& request);

    std::string m_capability;
    HostOperations m_operations;
    bool m_authorized = false;
    bool m_shouldExit = false;
};

} // namespace ily::core_host
