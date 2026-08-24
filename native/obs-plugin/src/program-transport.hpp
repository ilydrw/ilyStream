// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <memory>
#include <mutex>

namespace ilystream {

inline constexpr std::size_t kProgramAudioMaxChannels = 8;

struct ProgramVideoInfo {
    bool available = false;
    std::uint32_t width = 0;
    std::uint32_t height = 0;
};

struct ProgramAudioBlockView {
    std::uint64_t timestampNs = 0;
    std::size_t channelCount = 0;
    std::size_t frameCount = 0;
    std::array<const float*, kProgramAudioMaxChannels> planes{};
};

class ProgramAudioReader {
  public:
    virtual ~ProgramAudioReader() = default;

    virtual bool read(std::uint32_t sampleRate, std::size_t channels, std::size_t frames,
                      ProgramAudioBlockView& block) noexcept = 0;
};

class ProgramTransport {
  public:
    virtual ~ProgramTransport() = default;

    // Demand changes are serialized by ProgramTransportHub. Implementations
    // must return promptly and may hand work to their own transport thread.
    virtual void setDemanded(bool demanded) noexcept = 0;
    virtual ProgramVideoInfo videoInfo() const noexcept = 0;

    // Called from OBS's graphics thread. A ready implementation may import or
    // update shared GPU state here, then draw the current Program frame.
    virtual bool renderVideo() noexcept = 0;

    // Each OBS source instance gets an independent ring cursor. The returned
    // reader may keep this transport alive, but must tolerate demand loss.
    virtual std::unique_ptr<ProgramAudioReader> createAudioReader() noexcept = 0;
};

class ProgramTransportHub;

class ProgramTransportConsumer final {
  public:
    ProgramTransportConsumer() = default;
    ProgramTransportConsumer(const ProgramTransportConsumer&) = delete;
    ProgramTransportConsumer& operator=(const ProgramTransportConsumer&) = delete;
    ProgramTransportConsumer(ProgramTransportConsumer&& other) noexcept;
    ProgramTransportConsumer& operator=(ProgramTransportConsumer&& other) noexcept;
    ~ProgramTransportConsumer();

    void setActive(bool active);
    void setVisible(bool visible);
    bool demanded() const noexcept;

  private:
    friend class ProgramTransportHub;

    explicit ProgramTransportConsumer(std::shared_ptr<ProgramTransportHub> hub);
    void reconcileDemand();
    void release();

    std::shared_ptr<ProgramTransportHub> hub_;
    bool active_ = false;
    bool visible_ = false;
    bool demanded_ = false;
};

class ProgramTransportHub final : public std::enable_shared_from_this<ProgramTransportHub> {
  public:
    using DemandHandler = std::function<void(bool)>;

    explicit ProgramTransportHub(std::shared_ptr<ProgramTransport> transport = {});

    ProgramTransportConsumer attachConsumer();
    std::shared_ptr<ProgramTransport> transport() const;
    void installTransport(std::shared_ptr<ProgramTransport> transport);
    void clearTransport();
    void setDemandHandler(DemandHandler handler);

    std::size_t instanceCount() const;
    std::size_t demandCount() const;

  private:
    friend class ProgramTransportConsumer;

    void updateConsumerDemand(bool wasDemanded, bool demanded);
    void detachConsumer(bool wasDemanded);

    mutable std::mutex mutex_;
    std::shared_ptr<ProgramTransport> transport_;
    DemandHandler demandHandler_;
    std::size_t instanceCount_ = 0;
    std::size_t demandCount_ = 0;
};

std::shared_ptr<ProgramTransportHub> sharedProgramTransportHub();
void installSharedProgramTransport(std::shared_ptr<ProgramTransport> transport);
void clearSharedProgramTransport();

} // namespace ilystream
