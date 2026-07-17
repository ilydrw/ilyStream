#pragma once

#include <chrono>
#include <cstdint>

namespace ily {

class FrameScheduler {
public:
    FrameScheduler(uint32_t targetFps = 60);
    ~FrameScheduler();

    void Reset();
    void StartFrame();
    void Wait(); // Sleeps until the next frame boundary, correcting drift

    double GetDeltaTime() const { return m_deltaTime; }
    double GetFps() const { return m_fps; }

private:
    using Clock = std::chrono::high_resolution_clock;
    using TimePoint = std::chrono::time_point<Clock>;
    using Duration = std::chrono::duration<double>;

    uint32_t m_targetFps;
    Duration m_frameBudget;
    
    TimePoint m_startTime;
    TimePoint m_lastFrameTime;
    uint64_t m_frameCount;
    
    double m_deltaTime = 0.0;
    double m_fps = 0.0;
};

} // namespace ily
