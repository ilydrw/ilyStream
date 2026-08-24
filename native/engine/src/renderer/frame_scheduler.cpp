#include "frame_scheduler.h"
#include "ily/types.h"
#include <thread>

namespace ily {

FrameScheduler::FrameScheduler(uint32_t targetFps)
    : m_targetFps(targetFps)
    , m_frameBudget(1.0 / static_cast<double>(targetFps)) {
    Reset();
}

FrameScheduler::~FrameScheduler() {}

void FrameScheduler::Reset() {
    ILY_PROFILE_SCOPE("FrameScheduler::Reset");
    m_startTime = Clock::now();
    m_lastFrameTime = m_startTime;
    m_frameCount = 0;
    m_deltaTime = 0.0;
    m_fps = 0.0;
}

void FrameScheduler::StartFrame() {
    ILY_PROFILE_SCOPE("FrameScheduler::StartFrame");
    auto now = Clock::now();
    m_deltaTime = std::chrono::duration<double>(now - m_lastFrameTime).count();
    m_lastFrameTime = now;
    if (m_deltaTime > 0.0) {
        m_fps = 0.9 * m_fps + 0.1 * (1.0 / m_deltaTime); // smoothed FPS
    }
}

void FrameScheduler::Wait() {
    ILY_PROFILE_SCOPE("FrameScheduler::Wait");
    m_frameCount++;
    
    // Target time for the NEXT frame from the start
    auto targetTime = m_startTime + std::chrono::duration_cast<Clock::duration>(m_frameBudget * m_frameCount);
    auto now = Clock::now();
    
    if (now < targetTime) {
        // Sleep for the bulk of the duration, leaving 1ms for high-precision spinning
        auto sleepDuration = targetTime - now;
        if (sleepDuration > std::chrono::milliseconds(1)) {
            std::this_thread::sleep_for(sleepDuration - std::chrono::milliseconds(1));
        }
        // Yield-spin for the last millisecond to achieve microsecond accuracy
        while (Clock::now() < targetTime) {
            std::this_thread::yield();
        }
    } else {
        // If we lag behind by more than 5 frames, reset the start time to prevent catch-up spikes
        if (now > targetTime + std::chrono::duration_cast<Clock::duration>(m_frameBudget * 5)) {
            m_startTime = now;
            m_frameCount = 0;
        }
    }
}

} // namespace ily
