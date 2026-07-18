#include "dxgi_capture.h"
#include "../renderer/renderer.h"
#include <bgfx/bgfx.h>
#include <bgfx/platform.h>
#include <iostream>
#include <chrono>

#pragma comment(lib, "d3d11.lib")
#pragma comment(lib, "dxgi.lib")

namespace ily {

DXGICapture::DXGICapture(uint32_t monitorIndex, uint32_t targetFps, Renderer* renderer)
    : m_monitorIndex(monitorIndex), m_targetFps(targetFps), m_renderer(renderer) {
}

DXGICapture::~DXGICapture() {
    Shutdown();
}

bool DXGICapture::Initialize() {
    if (!InitDXGI()) {
        std::cerr << "[DXGICapture] Failed to init DXGI" << std::endl;
        return false;
    }

    // Create texture via the renderer directly (which safely maps to the BGFX backend)
    // We pass nullptr for data so it's created as mutable
    m_targetTexture = m_renderer->CreateTexture(m_width, m_height, nullptr, 0, true /* isBGRA */);

    if (m_targetTexture == ILY_INVALID_HANDLE) {
        return false;
    }

    m_running = true;
    m_thread = std::thread(&DXGICapture::CaptureThread, this);
    return true;
}

void DXGICapture::Shutdown() {
    m_running = false;
    if (m_thread.joinable()) {
        m_thread.join();
    }
    
    if (m_duplication) { m_duplication->Release(); m_duplication = nullptr; }
    if (m_stagingTexture) { m_stagingTexture->Release(); m_stagingTexture = nullptr; }
    if (m_context) { m_context->Release(); m_context = nullptr; }
    if (m_device) { m_device->Release(); m_device = nullptr; }

    if (m_targetTexture != ILY_INVALID_HANDLE) {
        m_renderer->DestroyTexture(m_targetTexture);
        m_targetTexture = ILY_INVALID_HANDLE;
    }
}

bool DXGICapture::InitDXGI() {
    // Create a brand new D3D11 Device exclusively for this capture thread!
    // We CANNOT use BGFX's internal D3D11DeviceContext because ID3D11DeviceContext 
    // is explicitly NOT thread-safe, and using it from our background capture thread 
    // while BGFX uses it for rendering will cause a massive access violation crash.
    D3D_FEATURE_LEVEL featureLevels[] = { D3D_FEATURE_LEVEL_11_0 };
    D3D_FEATURE_LEVEL featureLevel;
    HRESULT hr = D3D11CreateDevice(
        nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, 0, 
        featureLevels, 1, D3D11_SDK_VERSION, 
        &m_device, &featureLevel, &m_context
    );

    if (FAILED(hr)) {
        std::cerr << "[DXGICapture] Failed to create dedicated D3D11 Device." << std::endl;
        return false;
    }

    IDXGIDevice* dxgiDevice = nullptr;
    if (FAILED(m_device->QueryInterface(__uuidof(IDXGIDevice), (void**)&dxgiDevice))) {
        return false;
    }

    IDXGIAdapter* adapter = nullptr;
    if (FAILED(dxgiDevice->GetParent(__uuidof(IDXGIAdapter), (void**)&adapter))) {
        dxgiDevice->Release();
        return false;
    }

    IDXGIOutput* output = nullptr;
    if (FAILED(adapter->EnumOutputs(m_monitorIndex, &output))) {
        adapter->Release();
        dxgiDevice->Release();
        return false;
    }

    IDXGIOutput1* output1 = nullptr;
    if (FAILED(output->QueryInterface(__uuidof(IDXGIOutput1), (void**)&output1))) {
        output->Release();
        adapter->Release();
        dxgiDevice->Release();
        return false;
    }

    DXGI_OUTPUT_DESC outputDesc;
    output1->GetDesc(&outputDesc);
    m_width = outputDesc.DesktopCoordinates.right - outputDesc.DesktopCoordinates.left;
    m_height = outputDesc.DesktopCoordinates.bottom - outputDesc.DesktopCoordinates.top;

    if (FAILED(output1->DuplicateOutput(m_device, &m_duplication))) {
        output1->Release();
        output->Release();
        adapter->Release();
        dxgiDevice->Release();
        return false;
    }

    output1->Release();
    output->Release();
    adapter->Release();
    dxgiDevice->Release();

    D3D11_TEXTURE2D_DESC stagingDesc;
    ZeroMemory(&stagingDesc, sizeof(stagingDesc));
    stagingDesc.Width = m_width;
    stagingDesc.Height = m_height;
    stagingDesc.MipLevels = 1;
    stagingDesc.ArraySize = 1;
    stagingDesc.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
    stagingDesc.SampleDesc.Count = 1;
    stagingDesc.Usage = D3D11_USAGE_STAGING;
    stagingDesc.BindFlags = 0;
    stagingDesc.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
    stagingDesc.MiscFlags = 0;

    if (FAILED(m_device->CreateTexture2D(&stagingDesc, nullptr, &m_stagingTexture))) {
        return false;
    }

    return true;
}

void DXGICapture::CaptureThread() {
    uint32_t waitTime = m_targetFps > 0 ? (1000 / m_targetFps) : 0;

    while (m_running) {
        auto start = std::chrono::high_resolution_clock::now();

        IDXGIResource* desktopResource = nullptr;
        DXGI_OUTDUPL_FRAME_INFO frameInfo;
        // Wait up to 1000ms for a frame
        HRESULT hr = m_duplication->AcquireNextFrame(1000, &frameInfo, &desktopResource);

        if (hr == S_OK) {
            ID3D11Texture2D* desktopTexture = nullptr;
            desktopResource->QueryInterface(__uuidof(ID3D11Texture2D), (void**)&desktopTexture);

            m_context->CopyResource(m_stagingTexture, desktopTexture);

            desktopTexture->Release();
            desktopResource->Release();
            m_duplication->ReleaseFrame();

            D3D11_MAPPED_SUBRESOURCE mapped;
            if (SUCCEEDED(m_context->Map(m_stagingTexture, 0, D3D11_MAP_READ, 0, &mapped))) {
                
                // mapped.pData contains BGRA pixels. 
                // We now pass isBGRA=true to bgfx so we don't need to swizzle channels on the CPU!
                
                uint32_t byteSize = m_width * m_height * 4;
                uint8_t* rgbaBuffer = new uint8_t[byteSize];
                
                const uint8_t* src = static_cast<const uint8_t*>(mapped.pData);
                uint32_t srcPitch = mapped.RowPitch;
                uint32_t dstPitch = m_width * 4;
                
                if (srcPitch == dstPitch) {
                    // Fast path: direct copy
                    std::memcpy(rgbaBuffer, src, byteSize);
                } else {
                    // Row by row copy to handle pitch differences
                    for (uint32_t y = 0; y < m_height; ++y) {
                        std::memcpy(rgbaBuffer + (y * dstPitch), src + (y * srcPitch), dstPitch);
                    }
                }
                
                m_context->Unmap(m_stagingTexture, 0);

                // Update texture safely through the renderer thread (isBGRA = true)
                m_renderer->UpdateTexture(m_targetTexture, rgbaBuffer, byteSize, true);
                
                delete[] rgbaBuffer;
            }
        } else if (hr == DXGI_ERROR_ACCESS_LOST) {
            std::cerr << "[DXGICapture] Access lost, attempting to recover..." << std::endl;
            if (m_duplication) { m_duplication->Release(); m_duplication = nullptr; }
            if (m_stagingTexture) { m_stagingTexture->Release(); m_stagingTexture = nullptr; }
            InitDXGI();
        }

        auto end = std::chrono::high_resolution_clock::now();
        auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();
        if (waitTime > 0 && elapsed < waitTime) {
            std::this_thread::sleep_for(std::chrono::milliseconds(waitTime - elapsed));
        }
    }
}

} // namespace ily
