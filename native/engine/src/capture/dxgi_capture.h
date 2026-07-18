#pragma once
#include <stdint.h>
#include <thread>
#include <atomic>
#include <d3d11.h>
#include <dxgi1_2.h>
#include "ily/types.h"

namespace ily {
class Renderer;

class DXGICapture {
public:
    DXGICapture(uint32_t monitorIndex, uint32_t targetFps, Renderer* renderer);
    ~DXGICapture();

    bool Initialize();
    void Shutdown();
    ResourceHandle GetTexture() const { return m_targetTexture; }

private:
    void CaptureThread();
    bool InitDXGI();

    uint32_t m_monitorIndex;
    uint32_t m_targetFps;
    Renderer* m_renderer;
    
    std::atomic<bool> m_running{false};
    std::thread m_thread;

    ResourceHandle m_targetTexture = ILY_INVALID_HANDLE;

    // DXGI/D3D11 objects
    ID3D11Device* m_device = nullptr;
    ID3D11DeviceContext* m_context = nullptr;
    IDXGIOutputDuplication* m_duplication = nullptr;
    ID3D11Texture2D* m_stagingTexture = nullptr;

    uint32_t m_width = 0;
    uint32_t m_height = 0;
};

} // namespace ily
