#pragma once

#include <atomic>
#include <condition_variable>
#include <cstdint>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include <d3d11.h>
#include <mfidl.h>
#include <mfreadwrite.h>
#include <wrl/client.h>

#include "ily/types.h"

namespace ily {

class Renderer;

struct MFCameraDeviceInfo {
    std::string friendlyName;
    std::string symbolicLink;
};

/**
 * Windows Media Foundation camera source.
 *
 * The source reader is given a D3D11 device manager and asked for RGB32 output.
 * When the camera/decoder returns an IMFDXGIBuffer, the frame is copied directly
 * between D3D textures. Devices that only expose system-memory samples use a
 * native CPU upload fallback; neither path allocates RGBA frames in V8 or sends
 * them across Electron IPC.
 */
class MFCameraCapture {
public:
    MFCameraCapture(
        std::string deviceIdentity,
        uint32_t requestedWidth,
        uint32_t requestedHeight,
        uint32_t requestedFps,
        Renderer* renderer);
    ~MFCameraCapture();

    bool Initialize();
    void Shutdown();

    ResourceHandle GetTexture() const { return m_targetTexture; }
    uint32_t GetWidth() const { return m_width; }
    uint32_t GetHeight() const { return m_height; }
    uint32_t GetFrameRateNumerator() const { return m_frameRateNumerator; }
    uint32_t GetFrameRateDenominator() const { return m_frameRateDenominator; }
    bool UsesGpuFrames() const { return m_usesGpuFrames; }
    const std::string& GetDeviceName() const { return m_deviceName; }

    static std::vector<MFCameraDeviceInfo> EnumerateDevices();

private:
    void CaptureThread();
    bool InitializeCapture();
    bool InitializeD3D();
    bool OpenSourceReader();
    bool ConfigureMediaType();
    bool CreateSharedTexture();
    bool CreateCpuTexture();
    bool PublishSample(IMFSample* sample);
    bool CopySystemMemoryBuffer(IMFMediaBuffer* buffer);
    bool UploadCpuFrame();
    void SignalInitialization(bool success);
    void ReleaseCaptureResources();

    std::string m_deviceIdentity;
    std::string m_deviceName;
    uint32_t m_requestedWidth;
    uint32_t m_requestedHeight;
    uint32_t m_requestedFps;
    Renderer* m_renderer;

    std::atomic<bool> m_running{false};
    std::thread m_thread;
    mutable std::mutex m_resourceMutex;

    std::mutex m_initializationMutex;
    std::condition_variable m_initializationCondition;
    bool m_initializationComplete = false;
    bool m_initializationSucceeded = false;

    std::mutex m_firstFrameMutex;
    std::condition_variable m_firstFrameCondition;
    bool m_firstFrameReady = false;

    ResourceHandle m_targetTexture = ILY_INVALID_HANDLE;
    uint32_t m_width = 0;
    uint32_t m_height = 0;
    uint32_t m_frameRateNumerator = 0;
    uint32_t m_frameRateDenominator = 1;
    std::atomic<bool> m_usesGpuFrames{false};
    /** Set once a frame arrives in system memory; pins the session to the CPU upload path. */
    bool m_cpuTexturePath = false;

    Microsoft::WRL::ComPtr<ID3D11Device> m_device;
    Microsoft::WRL::ComPtr<ID3D11DeviceContext> m_context;
    Microsoft::WRL::ComPtr<IMFDXGIDeviceManager> m_deviceManager;
    UINT m_deviceManagerToken = 0;
    Microsoft::WRL::ComPtr<IMFMediaSource> m_mediaSource;
    Microsoft::WRL::ComPtr<IMFSourceReader> m_sourceReader;
    Microsoft::WRL::ComPtr<ID3D11Texture2D> m_sharedTexture;
    HANDLE m_sharedTextureHandle = nullptr;
    std::vector<uint8_t> m_cpuFrame;
};

} // namespace ily
