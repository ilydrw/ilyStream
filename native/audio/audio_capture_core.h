#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>
#include <vector>

namespace ily::audio {

struct CaptureDevice {
    std::string id;
    std::string name;
    bool isDefault = false;
    std::string backend;
};
struct CaptureOptions {
    std::string deviceId;
    std::string backend = "auto";
    std::uint32_t sampleRate = 48000;
    std::uint32_t channels = 2;
    bool exclusive = false;
};
struct CaptureSessionInfo {
    std::uint32_t sampleRate = 0;
    std::uint32_t channels = 0;
    bool exclusive = false;
    std::uint32_t chunkFrames = 0;
    std::string backend;
};
struct CaptureStatus {
    bool running = false;
    std::uint64_t framesCaptured = 0;
    std::uint64_t framesDropped = 0;
    std::uint32_t sampleRate = 0;
    std::uint32_t channels = 0;
    std::string backend;
};

using CaptureFrameCallback = std::function<bool(
    const float* samples, std::size_t sampleCount, const CaptureStatus& status)>;

bool ListCaptureDevices(std::vector<CaptureDevice>& devices, std::string& error);
bool StartCapture(const CaptureOptions& options, CaptureFrameCallback callback,
                  CaptureSessionInfo& sessionInfo, std::string& error);
CaptureStatus StopCapture();
CaptureStatus GetCaptureStatus();

struct ProgramAudioTransportOptions {
    std::string ringName;
    std::uint64_t generation = 0;
    std::uint32_t sampleRate = 48000;
    std::uint32_t channels = 2;
    std::uint32_t capacityFrames = 0;
    std::uint32_t blockFrames = 0;
};

bool StartProgramAudioTransport(const ProgramAudioTransportOptions& options, std::string& error);
bool PushProgramAudio(const void* pcmBytes, std::size_t byteLength, std::uint64_t timestampNs);
void StopProgramAudioTransport();

} // namespace ily::audio
