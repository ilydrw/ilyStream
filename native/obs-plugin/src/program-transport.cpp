// SPDX-License-Identifier: GPL-2.0-or-later
#include "program-transport.hpp"

#include <utility>

namespace ilystream {
namespace {

class OfflineProgramAudioReader final : public ProgramAudioReader {
  public:
    bool read(std::uint32_t, std::size_t, std::size_t, ProgramAudioBlockView&) noexcept override { return false; }
};

class OfflineProgramTransport final : public ProgramTransport {
  public:
    void setDemanded(bool) noexcept override {}
    ProgramVideoInfo videoInfo() const noexcept override { return {}; }
    bool renderVideo() noexcept override { return false; }
    std::unique_ptr<ProgramAudioReader> createAudioReader() noexcept override {
        return std::make_unique<OfflineProgramAudioReader>();
    }
};

std::shared_ptr<ProgramTransport> makeOfflineTransport() { return std::make_shared<OfflineProgramTransport>(); }

} // namespace

ProgramTransportConsumer::ProgramTransportConsumer(std::shared_ptr<ProgramTransportHub> hub) : hub_(std::move(hub)) {}

ProgramTransportConsumer::ProgramTransportConsumer(ProgramTransportConsumer&& other) noexcept
    : hub_(std::move(other.hub_)), active_(other.active_), visible_(other.visible_), demanded_(other.demanded_) {
    other.active_ = false;
    other.visible_ = false;
    other.demanded_ = false;
}

ProgramTransportConsumer& ProgramTransportConsumer::operator=(ProgramTransportConsumer&& other) noexcept {
    if (this == &other) {
        return *this;
    }

    release();
    hub_ = std::move(other.hub_);
    active_ = other.active_;
    visible_ = other.visible_;
    demanded_ = other.demanded_;
    other.active_ = false;
    other.visible_ = false;
    other.demanded_ = false;
    return *this;
}

ProgramTransportConsumer::~ProgramTransportConsumer() { release(); }

void ProgramTransportConsumer::setActive(bool active) {
    if (active_ == active) {
        return;
    }
    active_ = active;
    reconcileDemand();
}

void ProgramTransportConsumer::setVisible(bool visible) {
    if (visible_ == visible) {
        return;
    }
    visible_ = visible;
    reconcileDemand();
}

bool ProgramTransportConsumer::demanded() const noexcept { return demanded_; }

void ProgramTransportConsumer::reconcileDemand() {
    const bool nextDemanded = active_ || visible_;
    if (!hub_ || demanded_ == nextDemanded) {
        return;
    }

    hub_->updateConsumerDemand(demanded_, nextDemanded);
    demanded_ = nextDemanded;
}

void ProgramTransportConsumer::release() {
    if (!hub_) {
        return;
    }

    hub_->detachConsumer(demanded_);
    hub_.reset();
    active_ = false;
    visible_ = false;
    demanded_ = false;
}

ProgramTransportHub::ProgramTransportHub(std::shared_ptr<ProgramTransport> transport)
    : transport_(transport ? std::move(transport) : makeOfflineTransport()) {}

ProgramTransportConsumer ProgramTransportHub::attachConsumer() {
    auto hub = shared_from_this();
    {
        const std::scoped_lock lock(mutex_);
        ++instanceCount_;
    }
    return ProgramTransportConsumer(std::move(hub));
}

std::shared_ptr<ProgramTransport> ProgramTransportHub::transport() const {
    const std::scoped_lock lock(mutex_);
    return transport_;
}

void ProgramTransportHub::installTransport(std::shared_ptr<ProgramTransport> transport) {
    if (!transport) {
        transport = makeOfflineTransport();
    }

    std::shared_ptr<ProgramTransport> previous;
    {
        const std::scoped_lock lock(mutex_);
        if (transport_ == transport) {
            return;
        }

        if (demandCount_ > 0) {
            transport->setDemanded(true);
        }
        previous = std::exchange(transport_, std::move(transport));
        if (demandCount_ > 0 && previous) {
            previous->setDemanded(false);
        }
    }
}

void ProgramTransportHub::clearTransport() { installTransport({}); }

void ProgramTransportHub::setDemandHandler(DemandHandler handler) {
    DemandHandler notify;
    bool demanded = false;
    {
        const std::scoped_lock lock(mutex_);
        demandHandler_ = std::move(handler);
        notify = demandHandler_;
        demanded = demandCount_ > 0;
    }
    if (notify) {
        notify(demanded);
    }
}

std::size_t ProgramTransportHub::instanceCount() const {
    const std::scoped_lock lock(mutex_);
    return instanceCount_;
}

std::size_t ProgramTransportHub::demandCount() const {
    const std::scoped_lock lock(mutex_);
    return demandCount_;
}

void ProgramTransportHub::updateConsumerDemand(bool wasDemanded, bool demanded) {
    if (wasDemanded == demanded) {
        return;
    }

    DemandHandler notify;
    {
        const std::scoped_lock lock(mutex_);
        if (demanded) {
            ++demandCount_;
            if (demandCount_ == 1) {
                transport_->setDemanded(true);
                notify = demandHandler_;
            }
        } else if (demandCount_ > 0) {
            --demandCount_;
            if (demandCount_ == 0) {
                transport_->setDemanded(false);
                notify = demandHandler_;
            }
        }
    }
    if (notify) {
        notify(demanded);
    }
}

void ProgramTransportHub::detachConsumer(bool wasDemanded) {
    DemandHandler notify;
    {
        const std::scoped_lock lock(mutex_);
        if (wasDemanded && demandCount_ > 0) {
            --demandCount_;
            if (demandCount_ == 0) {
                transport_->setDemanded(false);
                notify = demandHandler_;
            }
        }
        if (instanceCount_ > 0) {
            --instanceCount_;
        }
    }
    if (notify) {
        notify(false);
    }
}

std::shared_ptr<ProgramTransportHub> sharedProgramTransportHub() {
    static const auto hub = std::make_shared<ProgramTransportHub>();
    return hub;
}

void installSharedProgramTransport(std::shared_ptr<ProgramTransport> transport) {
    sharedProgramTransportHub()->installTransport(std::move(transport));
}

void clearSharedProgramTransport() { sharedProgramTransportHub()->clearTransport(); }

} // namespace ilystream
