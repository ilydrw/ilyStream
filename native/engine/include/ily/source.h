#pragma once

#include "ily/types.h"

namespace ily {

class ISource {
public:
    virtual ~ISource() = default;

    virtual IlyResult Initialize(const IlyFrameContext& context) = 0;
    virtual IlyResult Update(const IlyFrameContext& context) = 0;
    virtual IlyResult Prepare(const IlyFrameContext& context) = 0;
    virtual IlyResult Render(const IlyFrameContext& context) = 0;
    virtual void Shutdown() = 0;
};

} // namespace ily
