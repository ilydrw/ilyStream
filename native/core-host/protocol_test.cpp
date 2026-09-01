#include "protocol.h"
#include <catch2/catch_test_macros.hpp>

namespace {

ily::core_host::HostOperations FakeOperations() {
    using nlohmann::json;
    return {
        [] { return json{{"healthy", true}}; },
        [] { return json{{"initialized", true}}; },
        [] { return json{{"initialized", false}}; },
        [] { return json::array({json{{"id", "mic"}, {"name", "Test"}}}); },
        [] { return json{{"running", false}}; },
        [](const json&) { return json{{"sampleRate", 48000}}; },
        [] { return json{{"framesCaptured", 0}}; },
        [](const json& params) { return json{{"sequence", params.at("sequence")}, {"routes", json::array()}}; },
        [](const json&) { return json{{"running", true}}; },
        [] { return json{{"running", false}}; },
        [] { return json{{"running", false}}; }
    };
}

nlohmann::json Request(ily::core_host::ProtocolSession& session, const nlohmann::json& request) {
    return nlohmann::json::parse(session.HandleLine(request.dump()));
}

} // namespace

TEST_CASE("native host protocol authenticates before dispatch") {
    ily::core_host::ProtocolSession session(std::string(43, 'a'), FakeOperations());
    CHECK_FALSE(Request(session, {{"id", 1}, {"method", "health"}}).at("ok").get<bool>());
    CHECK_FALSE(Request(session, {{"id", 2}, {"method", "hello"}, {"protocol", 4},
        {"capability", std::string(43, 'b')}}).at("ok").get<bool>());
    CHECK(Request(session, {{"id", 3}, {"method", "hello"}, {"protocol", 4},
        {"capability", std::string(43, 'a')}}).at("ok").get<bool>());
    CHECK(Request(session, {{"id", 4}, {"method", "health"}}).at("result").at("healthy") == true);
}

TEST_CASE("native host protocol rejects version mismatch and oversized input") {
    ily::core_host::ProtocolSession session(std::string(43, 'a'), FakeOperations());
    CHECK_FALSE(Request(session, {{"method", "hello"}, {"protocol", 1},
        {"capability", std::string(43, 'a')}}).at("ok").get<bool>());
    const auto oversized = nlohmann::json::parse(session.HandleLine(
        std::string(ily::core_host::kMaxRequestBytes + 1, 'x')));
    CHECK_FALSE(oversized.at("ok").get<bool>());
}

TEST_CASE("native host shutdown is explicit") {
    ily::core_host::ProtocolSession session(std::string(43, 'a'), FakeOperations());
    Request(session, {{"method", "hello"}, {"protocol", 4}, {"capability", std::string(43, 'a')}});
    CHECK_FALSE(session.ShouldExit());
    CHECK(Request(session, {{"method", "shutdown"}}).at("ok").get<bool>());
    CHECK(session.ShouldExit());
}

TEST_CASE("native host protocol dispatches mixer policy evaluation") {
    ily::core_host::ProtocolSession session(std::string(43, 'a'), FakeOperations());
    Request(session, {{"method", "hello"}, {"protocol", 4}, {"capability", std::string(43, 'a')}});
    const auto response = Request(session, {{"id", 7}, {"method", "mixer.evaluate"},
        {"params", {{"sequence", 42}}}});
    CHECK(response.at("ok").get<bool>());
    CHECK(response.at("result").at("sequence") == 42);
}

TEST_CASE("native host protocol dispatches mixer transport lifecycle") {
    ily::core_host::ProtocolSession session(std::string(43, 'a'), FakeOperations());
    Request(session, {{"method", "hello"}, {"protocol", 4}, {"capability", std::string(43, 'a')}});
    CHECK(Request(session, {{"method", "mixer.startTransport"},
        {"params", {{"sources", nlohmann::json::array()}}}}).at("result").at("running") == true);
    CHECK(Request(session, {{"method", "mixer.transportStatus"}}).at("ok").get<bool>());
    CHECK(Request(session, {{"method", "mixer.stopTransport"}}).at("ok").get<bool>());
}
