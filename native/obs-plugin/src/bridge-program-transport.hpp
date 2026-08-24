// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once

#include "program-transport-descriptor.hpp"
#include "program-transport.hpp"

#include <memory>

namespace ilystream {

class BridgeProgramTransport final : public ProgramTransport {
  public:
    static std::shared_ptr<BridgeProgramTransport> create(const ProgramTransportDescriptor& descriptor) noexcept;

    ~BridgeProgramTransport() override;

    void setDemanded(bool demanded) noexcept override;
    ProgramVideoInfo videoInfo() const noexcept override;
    bool renderVideo() noexcept override;
    std::unique_ptr<ProgramAudioReader> createAudioReader() noexcept override;

    ProgramTransportLease lease() const;
    ProgramTransportStats stats() const;
    void retire() noexcept;

  private:
    struct Impl;
    explicit BridgeProgramTransport(std::unique_ptr<Impl> impl);

    std::unique_ptr<Impl> impl_;
};

} // namespace ilystream
