#pragma once

#include "ily/types.h"

namespace ily {

class IOutput {
public:
    virtual ~IOutput() = default;

    virtual IlyResult Start() = 0;
    virtual void Stop() = 0;
    virtual IlyResult ConsumeFrame(ResourceHandle textureHandle, const IlyFrameContext& context) = 0;
    virtual bool IsActive() const = 0;
};

} // namespace ily
