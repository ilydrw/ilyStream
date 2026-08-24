#pragma once
#include <stdint.h>
#include <thread>
#include <atomic>
#include <condition_variable>
#include <mutex>
#include <d3d11.h>
#include <dxgi1_2.h>
#include <dxgi1_5.h>
#include <dxgi1_6.h>
#include "ily/types.h"
#include "ily/shared_ring_buffer.h"
#include <string>
#include <vector>

namespace ily {
class Renderer;

struct DXGIDisplayInfo {
    uint32_t index = 0;
    std::string deviceName;
    int32_t left = 0;
    int32_t top = 0;
    int32_t right = 0;
    int32_t bottom = 0;
    bool hdr = false;
};

class DXGICapture {
public:
    DXGICapture(uint32_t monitorIndex, uint32_t targetFps, Renderer* renderer);
    ~DXGICapture();

    bool Initialize();
    void Shutdown();
    ResourceHandle GetTexture() const { return m_targetTexture; }
    const std::string& GetSharedMemoryName() const { return m_sharedMapName; }
    const IlyColorDescription& GetColorDescription() const { return m_colorDescription; }
    IlyPixelFormat GetPixelFormat() const { return m_pixelFormat; }
    bool IsHdr() const { return m_isHdr; }
    uint32_t GetWidth() const { return m_width; }
    uint32_t GetHeight() const { return m_height; }
    float GetSdrWhiteNits() const { return m_sdrWhiteNits; }
    float GetMaxLuminance() const { return m_maxLuminance; }
    float GetMaxFullFrameLuminance() const { return m_maxFullFrameLuminance; }
    static std::vector<DXGIDisplayInfo> EnumerateDisplays();

private:
    void CaptureThread();
    bool InitDXGI();
    bool CreateSharedTexture();

    uint32_t m_monitorIndex;
    uint32_t m_targetFps;
    Renderer* m_renderer;
    
    std::atomic<bool> m_running{false};
    std::thread m_thread;
    std::mutex m_firstFrameMutex;
    std::condition_variable m_firstFrameCondition;
    bool m_firstFrameReady = false;

    ResourceHandle m_targetTexture = ILY_INVALID_HANDLE;

    // DXGI/D3D11 objects
    ID3D11Device* m_device = nullptr;
    ID3D11DeviceContext* m_context = nullptr;
    IDXGIOutputDuplication* m_duplication = nullptr;
    ID3D11Texture2D* m_stagingTexture = nullptr;
    ID3D11Texture2D* m_sharedTexture = nullptr;
    HANDLE m_sharedTextureHandle = nullptr;

    uint32_t m_width = 0;
    uint32_t m_height = 0;
    DXGI_FORMAT m_dxgiFormat = DXGI_FORMAT_B8G8R8A8_UNORM;
    IlyPixelFormat m_pixelFormat = ILY_PIXEL_FORMAT_BGRA8;
    IlyColorDescription m_colorDescription = IlySrgbFullColor();
    bool m_isHdr = false;
    float m_sdrWhiteNits = 80.0f;
    float m_maxLuminance = 0.0f;
    float m_maxFullFrameLuminance = 0.0f;
    std::vector<uint8_t> m_frameBuffer;

    std::string m_sharedMapName;
    HANDLE m_sharedMapHandle = nullptr;
    SharedRingBuffer* m_sharedBuffer = nullptr;
};

} // namespace ily
