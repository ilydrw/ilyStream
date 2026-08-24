// SPDX-License-Identifier: GPL-2.0-or-later
#include "../src/program-transport.hpp"

#include <iostream>
#include <memory>
#include <string>
#include <utility>
#include <vector>

namespace {

class TestAudioReader final : public ilystream::ProgramAudioReader {
  public:
    bool read(std::uint32_t, std::size_t, std::size_t, ilystream::ProgramAudioBlockView&) noexcept override {
        return false;
    }
};

class TestTransport final : public ilystream::ProgramTransport {
  public:
    void setDemanded(bool demanded) noexcept override { demandEdges.push_back(demanded); }
    ilystream::ProgramVideoInfo videoInfo() const noexcept override { return {}; }
    bool renderVideo() noexcept override { return false; }
    std::unique_ptr<ilystream::ProgramAudioReader> createAudioReader() noexcept override {
        return std::make_unique<TestAudioReader>();
    }

    std::vector<bool> demandEdges;
};

int failures = 0;

void check(bool condition, const std::string& message) {
    if (condition) {
        return;
    }
    ++failures;
    std::cerr << "FAILED: " << message << '\n';
}

void testDemandIsReferenceCountedAcrossInstances() {
    auto transport = std::make_shared<TestTransport>();
    auto hub = std::make_shared<ilystream::ProgramTransportHub>(transport);
    auto first = hub->attachConsumer();
    auto second = hub->attachConsumer();

    check(hub->instanceCount() == 2, "two attached sources share one hub");
    check(hub->demandCount() == 0, "created sources do not demand transport while hidden and inactive");

    first.setActive(true);
    check(hub->demandCount() == 1, "activating the first source adds one demand reference");
    check(transport->demandEdges == std::vector<bool>{true}, "first demand starts transport exactly once");

    first.setVisible(true);
    first.setActive(false);
    check(hub->demandCount() == 1, "visibility keeps a source demanded across activate callback ordering");
    check(transport->demandEdges == std::vector<bool>{true}, "one source contributes at most one demand reference");

    second.setVisible(true);
    check(hub->demandCount() == 2, "a second visible source adds an independent reference");
    check(transport->demandEdges == std::vector<bool>{true}, "additional demand does not restart shared transport");

    first.setVisible(false);
    check(hub->demandCount() == 1, "hiding one source preserves the other source demand");
    second.setVisible(false);
    check(hub->demandCount() == 0, "last hidden source releases final demand");
    check(transport->demandEdges == std::vector<bool>({true, false}), "last release stops transport exactly once");
}

void testDestructionReleasesDemandAndMoveDoesNotDuplicateIt() {
    auto transport = std::make_shared<TestTransport>();
    auto hub = std::make_shared<ilystream::ProgramTransportHub>(transport);

    {
        auto original = hub->attachConsumer();
        original.setActive(true);
        auto moved = std::move(original);
        check(hub->instanceCount() == 1, "moving a source lease does not add an instance");
        check(hub->demandCount() == 1, "moving a source lease preserves one demand");
        check(moved.demanded(), "moved lease retains its lifecycle state");
    }

    check(hub->instanceCount() == 0, "destroying the lease detaches the source instance");
    check(hub->demandCount() == 0, "destroying a demanded source releases demand");
    check(transport->demandEdges == std::vector<bool>({true, false}), "destruction closes the demand edge");
}

void testReplacingTransportTransfersCurrentDemand() {
    auto firstTransport = std::make_shared<TestTransport>();
    auto secondTransport = std::make_shared<TestTransport>();
    auto hub = std::make_shared<ilystream::ProgramTransportHub>(firstTransport);
    auto source = hub->attachConsumer();
    source.setVisible(true);

    hub->installTransport(secondTransport);
    check(firstTransport->demandEdges == std::vector<bool>({true, false}),
          "replacing a live transport releases the previous transport");
    check(secondTransport->demandEdges == std::vector<bool>{true},
          "replacement transport inherits current source demand");
    check(hub->transport() == secondTransport, "hub publishes the replacement transport once it is demanded");

    hub->installTransport(secondTransport);
    check(secondTransport->demandEdges == std::vector<bool>{true}, "installing the same transport is idempotent");

    source.setVisible(false);
    check(secondTransport->demandEdges == std::vector<bool>({true, false}),
          "replacement stops when the final source releases demand");
}

void testDemandHandlerReceivesOnlySharedEdges() {
    auto transport = std::make_shared<TestTransport>();
    auto hub = std::make_shared<ilystream::ProgramTransportHub>(transport);
    std::vector<bool> demandEvents;
    hub->setDemandHandler([&demandEvents](bool demanded) { demandEvents.push_back(demanded); });
    auto first = hub->attachConsumer();
    auto second = hub->attachConsumer();

    first.setActive(true);
    second.setVisible(true);
    first.setActive(false);
    check(demandEvents == std::vector<bool>({false, true}),
          "the bridge demand handler receives initialization and only the first shared demand edge");

    second.setVisible(false);
    check(demandEvents == std::vector<bool>({false, true, false}),
          "the bridge demand handler releases only after the last source");
}

} // namespace

int main() {
    testDemandIsReferenceCountedAcrossInstances();
    testDestructionReleasesDemandAndMoveDoesNotDuplicateIt();
    testReplacingTransportTransfersCurrentDemand();
    testDemandHandlerReceivesOnlySharedEdges();

    if (failures == 0) {
        std::cout << "Program transport lifecycle tests passed\n";
    }
    return failures == 0 ? 0 : 1;
}
