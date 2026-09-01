#include "protocol.h"

#include <cstdint>
#include <utility>

namespace ily::core_host {

ProtocolSession::ProtocolSession(std::string capability, HostOperations operations)
    : m_capability(std::move(capability)), m_operations(std::move(operations)) {}

std::string ProtocolSession::HandleLine(const std::string& line) {
    nlohmann::json id = nullptr;
    try {
        if (line.empty() || line.size() > kMaxRequestBytes) {
            throw std::runtime_error("Request size is invalid");
        }
        const auto request = nlohmann::json::parse(line);
        if (request.contains("id")) id = request.at("id");
        return nlohmann::json{{"id", id}, {"ok", true}, {"result", Dispatch(request)}}.dump();
    } catch (const std::exception& error) {
        return nlohmann::json{
            {"id", id}, {"ok", false}, {"error", std::string(error.what())}
        }.dump();
    }
}

bool ProtocolSession::ConstantTimeCapabilityMatch(const std::string& candidate) const noexcept {
    const std::size_t length = candidate.size() > m_capability.size()
        ? candidate.size() : m_capability.size();
    std::size_t difference = candidate.size() ^ m_capability.size();
    for (std::size_t index = 0; index < length; ++index) {
        const std::uint8_t left = index < candidate.size()
            ? static_cast<std::uint8_t>(candidate[index]) : 0;
        const std::uint8_t right = index < m_capability.size()
            ? static_cast<std::uint8_t>(m_capability[index]) : 0;
        difference |= static_cast<std::size_t>(left ^ right);
    }
    return difference == 0;
}

nlohmann::json ProtocolSession::Dispatch(const nlohmann::json& request) {
    if (!request.is_object()) throw std::runtime_error("Request must be an object");
    const std::string method = request.value("method", "");
    if (method.empty()) throw std::runtime_error("Method is required");

    if (!m_authorized) {
        if (method != "hello") throw std::runtime_error("Unauthorized");
        if (request.value("protocol", 0) != kProtocolVersion) {
            throw std::runtime_error("Unsupported protocol version");
        }
        if (!ConstantTimeCapabilityMatch(request.value("capability", ""))) {
            throw std::runtime_error("Unauthorized");
        }
        m_authorized = true;
        return {{"protocol", kProtocolVersion}, {"authenticated", true}};
    }

    const nlohmann::json params = request.value("params", nlohmann::json::object());
    if (method == "health") return m_operations.health();
    if (method == "engine.initialize") return m_operations.initializeEngine();
    if (method == "engine.shutdown") return m_operations.shutdownEngine();
    if (method == "audio.listDevices") return m_operations.listAudioDevices();
    if (method == "audio.status") return m_operations.getAudioStatus();
    if (method == "audio.startCapture") return m_operations.startAudioCapture(params);
    if (method == "audio.stopCapture") return m_operations.stopAudioCapture();
    if (method == "mixer.evaluate") return m_operations.evaluateMixer(params);
    if (method == "mixer.startTransport") return m_operations.startMixerTransport(params);
    if (method == "mixer.transportStatus") return m_operations.getMixerTransportStatus();
    if (method == "mixer.stopTransport") return m_operations.stopMixerTransport();
    if (method == "shutdown") {
        m_shouldExit = true;
        return {{"stopping", true}};
    }
    throw std::runtime_error("Unknown method");
}

} // namespace ily::core_host
