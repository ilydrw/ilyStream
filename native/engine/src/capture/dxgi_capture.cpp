#include "dxgi_capture.h"
#include "../renderer/renderer.h"
#include <bgfx/bgfx.h>
#include <bgfx/platform.h>
#include <iostream>
#include <chrono>
#include <cstring>
#include <cwchar>

#pragma comment(lib, "d3d11.lib")
#pragma comment(lib, "dxgi.lib")
#pragma comment(lib, "user32.lib")

namespace ily {

namespace {

std::string NarrowDeviceName(const wchar_t* value) {
    if (!value) return {};
    std::string result;
    while (*value != L'\0') {
        result.push_back(*value <= 0x7f ? static_cast<char>(*value) : '?');
        value += 1;
    }
    return result;
}

bool FindOutputByGlobalIndex(
    uint32_t targetIndex,
    IDXGIAdapter1** outAdapter,
    IDXGIOutput** outOutput) {
    if (!outAdapter || !outOutput) return false;
    *outAdapter = nullptr;
    *outOutput = nullptr;

    IDXGIFactory1* factory = nullptr;
    if (FAILED(CreateDXGIFactory1(__uuidof(IDXGIFactory1), reinterpret_cast<void**>(&factory)))) {
        return false;
    }

    uint32_t globalIndex = 0;
    for (UINT adapterIndex = 0; ; ++adapterIndex) {
        IDXGIAdapter1* adapter = nullptr;
        if (factory->EnumAdapters1(adapterIndex, &adapter) == DXGI_ERROR_NOT_FOUND) break;

        for (UINT outputIndex = 0; ; ++outputIndex) {
            IDXGIOutput* output = nullptr;
            if (adapter->EnumOutputs(outputIndex, &output) == DXGI_ERROR_NOT_FOUND) break;
            if (globalIndex == targetIndex) {
                *outAdapter = adapter;
                *outOutput = output;
                factory->Release();
                return true;
            }
            globalIndex += 1;
            output->Release();
        }
        adapter->Release();
    }

    factory->Release();
    return false;
}

float GetSdrWhiteLevelNits(const wchar_t* deviceName) {
    if (!deviceName || deviceName[0] == L'\0') return 0.0f;

    UINT32 pathCount = 0;
    UINT32 modeCount = 0;
    if (GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, &pathCount, &modeCount) != ERROR_SUCCESS) {
        return 0.0f;
    }

    std::vector<DISPLAYCONFIG_PATH_INFO> paths(pathCount);
    std::vector<DISPLAYCONFIG_MODE_INFO> modes(modeCount);
    if (QueryDisplayConfig(
            QDC_ONLY_ACTIVE_PATHS,
            &pathCount,
            paths.data(),
            &modeCount,
            modes.data(),
            nullptr) != ERROR_SUCCESS) {
        return 0.0f;
    }

    for (UINT32 index = 0; index < pathCount; ++index) {
        const DISPLAYCONFIG_PATH_INFO& path = paths[index];
        DISPLAYCONFIG_SOURCE_DEVICE_NAME sourceName{};
        sourceName.header.type = DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME;
        sourceName.header.size = sizeof(sourceName);
        sourceName.header.adapterId = path.sourceInfo.adapterId;
        sourceName.header.id = path.sourceInfo.id;
        if (DisplayConfigGetDeviceInfo(&sourceName.header) != ERROR_SUCCESS ||
            _wcsicmp(sourceName.viewGdiDeviceName, deviceName) != 0) {
            continue;
        }

        DISPLAYCONFIG_SDR_WHITE_LEVEL whiteLevel{};
        whiteLevel.header.type = DISPLAYCONFIG_DEVICE_INFO_GET_SDR_WHITE_LEVEL;
        whiteLevel.header.size = sizeof(whiteLevel);
        whiteLevel.header.adapterId = path.targetInfo.adapterId;
        whiteLevel.header.id = path.targetInfo.id;
        if (DisplayConfigGetDeviceInfo(&whiteLevel.header) == ERROR_SUCCESS &&
            whiteLevel.SDRWhiteLevel > 0) {
            return static_cast<float>(whiteLevel.SDRWhiteLevel) * 80.0f / 1000.0f;
        }
    }

    return 0.0f;
}

} // namespace

std::vector<DXGIDisplayInfo> DXGICapture::EnumerateDisplays() {
    std::vector<DXGIDisplayInfo> displays;
    IDXGIFactory1* factory = nullptr;
    if (FAILED(CreateDXGIFactory1(__uuidof(IDXGIFactory1), reinterpret_cast<void**>(&factory)))) {
        return displays;
    }

    uint32_t globalIndex = 0;
    for (UINT adapterIndex = 0; ; ++adapterIndex) {
        IDXGIAdapter1* adapter = nullptr;
        if (factory->EnumAdapters1(adapterIndex, &adapter) == DXGI_ERROR_NOT_FOUND) break;

        for (UINT outputIndex = 0; ; ++outputIndex) {
            IDXGIOutput* output = nullptr;
            if (adapter->EnumOutputs(outputIndex, &output) == DXGI_ERROR_NOT_FOUND) break;

            DXGI_OUTPUT_DESC desc{};
            if (SUCCEEDED(output->GetDesc(&desc)) && desc.AttachedToDesktop) {
                bool hdr = false;
                IDXGIOutput6* output6 = nullptr;
                if (SUCCEEDED(output->QueryInterface(
                        __uuidof(IDXGIOutput6), reinterpret_cast<void**>(&output6)))) {
                    DXGI_OUTPUT_DESC1 desc1{};
                    if (SUCCEEDED(output6->GetDesc1(&desc1))) {
                        hdr = desc1.ColorSpace == DXGI_COLOR_SPACE_RGB_FULL_G10_NONE_P709 ||
                            desc1.ColorSpace == DXGI_COLOR_SPACE_RGB_FULL_G2084_NONE_P2020;
                    }
                    output6->Release();
                }

                displays.push_back(DXGIDisplayInfo{
                    globalIndex,
                    NarrowDeviceName(desc.DeviceName),
                    desc.DesktopCoordinates.left,
                    desc.DesktopCoordinates.top,
                    desc.DesktopCoordinates.right,
                    desc.DesktopCoordinates.bottom,
                    hdr
                });
            }
            globalIndex += 1;
            output->Release();
        }
        adapter->Release();
    }

    factory->Release();
    return displays;
}

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

    const uint64_t byteSize64 = static_cast<uint64_t>(m_width) * static_cast<uint64_t>(m_height) * 4;
    if (byteSize64 == 0 || byteSize64 > MAX_FRAME_BYTES) {
        std::cerr << "[DXGICapture] Capture size exceeds shared preview buffer: "
                  << m_width << "x" << m_height << std::endl;
        return false;
    }
    m_frameBuffer.resize(static_cast<size_t>(byteSize64));

    // Create a unique name for this shared memory mapping
    m_sharedMapName = "Local\\ilyStream_Preview_" + std::to_string(std::chrono::steady_clock::now().time_since_epoch().count());

    // Allocate shared memory
    uint32_t mapSize = sizeof(SharedRingBuffer);
    m_sharedMapHandle = CreateFileMappingA(
        INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE,
        0, mapSize, m_sharedMapName.c_str()
    );

    if (!m_sharedMapHandle) {
        std::cerr << "[DXGICapture] Failed to create file mapping" << std::endl;
        return false;
    }

    m_sharedBuffer = static_cast<SharedRingBuffer*>(MapViewOfFile(
        m_sharedMapHandle, FILE_MAP_ALL_ACCESS, 0, 0, mapSize
    ));

    if (!m_sharedBuffer) {
        std::cerr << "[DXGICapture] Failed to map view of file" << std::endl;
        CloseHandle(m_sharedMapHandle);
        m_sharedMapHandle = nullptr;
        return false;
    }

    // Initialize sequences to 0
    m_sharedBuffer->writeSequence = 0;
    for (int i = 0; i < RING_BUFFER_SLOTS; ++i) {
        m_sharedBuffer->slots[i].sequence = 0;
    }

    if (!CreateSharedTexture()) {
        std::cerr << "[DXGICapture] Failed to create shared D3D11 texture" << std::endl;
        return false;
    }

    m_targetTexture = m_renderer->CreateSharedTextureFromHandle(
        m_width,
        m_height,
        m_sharedTextureHandle,
        m_pixelFormat,
        m_colorDescription,
        ILY_ALPHA_OPAQUE,
        m_sdrWhiteNits);

    if (m_targetTexture == ILY_INVALID_HANDLE) {
        std::cerr << "[DXGICapture] Failed to import shared texture into renderer" << std::endl;
        return false;
    }

    {
        std::lock_guard<std::mutex> lock(m_firstFrameMutex);
        m_firstFrameReady = false;
    }
    m_running = true;
    m_thread = std::thread(&DXGICapture::CaptureThread, this);

    std::unique_lock<std::mutex> firstFrameLock(m_firstFrameMutex);
    if (!m_firstFrameCondition.wait_for(
            firstFrameLock,
            std::chrono::milliseconds(1500),
            [this] { return m_firstFrameReady || !m_running; })) {
        firstFrameLock.unlock();
        std::cerr << "[DXGICapture] Timed out waiting for the first desktop frame" << std::endl;
        Shutdown();
        return false;
    }
    if (!m_firstFrameReady) {
        firstFrameLock.unlock();
        Shutdown();
        return false;
    }
    return true;
}

void DXGICapture::Shutdown() {
    m_running = false;
    if (m_thread.joinable()) {
        m_thread.join();
    }
    
    if (m_targetTexture != ILY_INVALID_HANDLE) {
        m_renderer->DestroyTexture(m_targetTexture);
        m_targetTexture = ILY_INVALID_HANDLE;
    }

    if (m_duplication) { m_duplication->Release(); m_duplication = nullptr; }
    if (m_stagingTexture) { m_stagingTexture->Release(); m_stagingTexture = nullptr; }
    if (m_sharedTexture) { m_sharedTexture->Release(); m_sharedTexture = nullptr; }
    m_sharedTextureHandle = nullptr;
    if (m_context) { m_context->Release(); m_context = nullptr; }
    if (m_device) { m_device->Release(); m_device = nullptr; }

    if (m_sharedBuffer) {
        UnmapViewOfFile(m_sharedBuffer);
        m_sharedBuffer = nullptr;
    }
    if (m_sharedMapHandle) {
        CloseHandle(m_sharedMapHandle);
        m_sharedMapHandle = nullptr;
    }

    m_frameBuffer.clear();
}

bool DXGICapture::InitDXGI() {
    if (m_duplication) { m_duplication->Release(); m_duplication = nullptr; }
    if (m_stagingTexture) { m_stagingTexture->Release(); m_stagingTexture = nullptr; }
    m_dxgiFormat = DXGI_FORMAT_B8G8R8A8_UNORM;
    m_pixelFormat = ILY_PIXEL_FORMAT_BGRA8;
    m_colorDescription = IlySrgbFullColor();
    m_isHdr = false;
    m_sdrWhiteNits = 80.0f;
    m_maxLuminance = 0.0f;
    m_maxFullFrameLuminance = 0.0f;

    IDXGIAdapter1* adapter = nullptr;
    IDXGIOutput* output = nullptr;
    if (!FindOutputByGlobalIndex(m_monitorIndex, &adapter, &output)) {
        std::cerr << "[DXGICapture] DXGI output index not found: " << m_monitorIndex << std::endl;
        return false;
    }

    // Use a dedicated D3D11 device on the selected output's adapter. This is
    // required on multi-GPU systems; a default-adapter device cannot duplicate
    // an output owned by another adapter.
    if (!m_device || !m_context) {
        D3D_FEATURE_LEVEL featureLevels[] = { D3D_FEATURE_LEVEL_11_0 };
        D3D_FEATURE_LEVEL featureLevel;
        HRESULT hr = D3D11CreateDevice(
            adapter, D3D_DRIVER_TYPE_UNKNOWN, nullptr, 0,
            featureLevels, 1, D3D11_SDK_VERSION,
            &m_device, &featureLevel, &m_context
        );

        if (FAILED(hr)) {
            std::cerr << "[DXGICapture] Failed to create dedicated D3D11 Device." << std::endl;
            output->Release();
            adapter->Release();
            return false;
        }
    }

    IDXGIOutput1* output1 = nullptr;
    if (FAILED(output->QueryInterface(__uuidof(IDXGIOutput1), (void**)&output1))) {
        output->Release();
        adapter->Release();
        return false;
    }

    DXGI_OUTPUT_DESC outputDesc{};
    output1->GetDesc(&outputDesc);
    m_width = outputDesc.DesktopCoordinates.right - outputDesc.DesktopCoordinates.left;
    m_height = outputDesc.DesktopCoordinates.bottom - outputDesc.DesktopCoordinates.top;

    bool outputUsesHdrColorSpace = false;
    DXGI_COLOR_SPACE_TYPE outputColorSpace = DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709;
    IDXGIOutput6* output6 = nullptr;
    if (SUCCEEDED(output->QueryInterface(__uuidof(IDXGIOutput6), reinterpret_cast<void**>(&output6)))) {
        DXGI_OUTPUT_DESC1 outputDesc1{};
        if (SUCCEEDED(output6->GetDesc1(&outputDesc1))) {
            m_maxLuminance = outputDesc1.MaxLuminance;
            m_maxFullFrameLuminance = outputDesc1.MaxFullFrameLuminance;
            outputColorSpace = outputDesc1.ColorSpace;
            outputUsesHdrColorSpace =
                outputColorSpace == DXGI_COLOR_SPACE_RGB_FULL_G10_NONE_P709 ||
                outputColorSpace == DXGI_COLOR_SPACE_RGB_FULL_G2084_NONE_P2020;
            if (outputUsesHdrColorSpace) {
                const float configuredSdrWhiteNits = GetSdrWhiteLevelNits(outputDesc.DeviceName);
                if (configuredSdrWhiteNits > 0.0f) {
                    m_sdrWhiteNits = configuredSdrWhiteNits;
                }
            }
        }
        output6->Release();
    }

    // Retry loop for deterministic lock acquisition
    bool acquired = false;
    IDXGIOutput5* output5 = nullptr;
    output->QueryInterface(__uuidof(IDXGIOutput5), reinterpret_cast<void**>(&output5));
    for (int i = 0; i < 40; ++i) {
        HRESULT dupHr = E_NOINTERFACE;
        if (output5) {
            const DXGI_FORMAT hdrFormats[] = {
                DXGI_FORMAT_R16G16B16A16_FLOAT,
                DXGI_FORMAT_R10G10B10A2_UNORM,
                DXGI_FORMAT_B8G8R8A8_UNORM
            };
            const DXGI_FORMAT sdrFormats[] = {DXGI_FORMAT_B8G8R8A8_UNORM};
            const DXGI_FORMAT* requestedFormats = outputUsesHdrColorSpace ? hdrFormats : sdrFormats;
            const UINT requestedFormatCount = outputUsesHdrColorSpace
                ? static_cast<UINT>(std::size(hdrFormats))
                : static_cast<UINT>(std::size(sdrFormats));
            dupHr = output5->DuplicateOutput1(
                m_device,
                0,
                requestedFormatCount,
                requestedFormats,
                &m_duplication);
        }
        if (FAILED(dupHr) && !outputUsesHdrColorSpace) {
            dupHr = output1->DuplicateOutput(m_device, &m_duplication);
        }
        if (SUCCEEDED(dupHr)) {
            acquired = true;
            break;
        }
        if (dupHr != DXGI_ERROR_ACCESS_DENIED) {
            std::cerr << "[DXGICapture] DuplicateOutput failed with non-access-denied error" << std::endl;
            break;
        }
        Sleep(25);
    }

    if (!acquired) {
        if (output5) output5->Release();
        output1->Release();
        output->Release();
        adapter->Release();
        std::cerr << "[DXGICapture] Failed to acquire Desktop Duplication lock" << std::endl;
        return false;
    }

    if (output5) output5->Release();

    DXGI_OUTDUPL_DESC duplicationDesc{};
    m_duplication->GetDesc(&duplicationDesc);
    m_dxgiFormat = duplicationDesc.ModeDesc.Format;
    if (m_dxgiFormat == DXGI_FORMAT_R16G16B16A16_FLOAT) {
        m_pixelFormat = ILY_PIXEL_FORMAT_RGBA16F;
        m_colorDescription = IlyColorDescription{
            ILY_COLOR_PRIMARIES_BT709,
            ILY_TRANSFER_LINEAR,
            ILY_MATRIX_RGB,
            ILY_COLOR_RANGE_FULL
        };
        m_isHdr = true;
    } else if (m_dxgiFormat == DXGI_FORMAT_R10G10B10A2_UNORM) {
        m_pixelFormat = ILY_PIXEL_FORMAT_R10G10B10A2;
        m_colorDescription = outputColorSpace == DXGI_COLOR_SPACE_RGB_FULL_G2084_NONE_P2020
            ? IlyColorDescription{
                ILY_COLOR_PRIMARIES_BT2020,
                ILY_TRANSFER_PQ,
                ILY_MATRIX_RGB,
                ILY_COLOR_RANGE_FULL
            }
            : IlyColorDescription{
                ILY_COLOR_PRIMARIES_BT709,
                ILY_TRANSFER_LINEAR,
                ILY_MATRIX_RGB,
                ILY_COLOR_RANGE_FULL
            };
        m_isHdr = outputUsesHdrColorSpace;
    } else if (m_dxgiFormat == DXGI_FORMAT_B8G8R8A8_UNORM) {
        m_pixelFormat = ILY_PIXEL_FORMAT_BGRA8;
        m_colorDescription = IlySrgbFullColor();
        m_isHdr = false;
    } else {
        std::cerr << "[DXGICapture] Unsupported duplication format: "
                  << static_cast<int>(m_dxgiFormat) << std::endl;
        m_duplication->Release();
        m_duplication = nullptr;
        output1->Release();
        output->Release();
        adapter->Release();
        return false;
    }

    output1->Release();
    output->Release();
    adapter->Release();

    if (m_isHdr) {
        std::cerr << "[DXGICapture] HDR capture enabled (format="
                  << static_cast<int>(m_dxgiFormat) << ", peak=" << m_maxLuminance
                  << " nits, full-frame=" << m_maxFullFrameLuminance
                  << " nits, SDR white=" << m_sdrWhiteNits << " nits)" << std::endl;
        return true;
    }

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

bool DXGICapture::CreateSharedTexture() {
    if (!m_device || m_width == 0 || m_height == 0) {
        return false;
    }

    if (m_sharedTexture) {
        m_sharedTexture->Release();
        m_sharedTexture = nullptr;
    }
    m_sharedTextureHandle = nullptr;

    D3D11_TEXTURE2D_DESC sharedDesc;
    ZeroMemory(&sharedDesc, sizeof(sharedDesc));
    sharedDesc.Width = m_width;
    sharedDesc.Height = m_height;
    sharedDesc.MipLevels = 1;
    sharedDesc.ArraySize = 1;
    sharedDesc.Format = m_dxgiFormat;
    sharedDesc.SampleDesc.Count = 1;
    sharedDesc.Usage = D3D11_USAGE_DEFAULT;
    sharedDesc.BindFlags = D3D11_BIND_SHADER_RESOURCE;
    sharedDesc.CPUAccessFlags = 0;
    sharedDesc.MiscFlags = D3D11_RESOURCE_MISC_SHARED;

    if (FAILED(m_device->CreateTexture2D(&sharedDesc, nullptr, &m_sharedTexture))) {
        return false;
    }

    IDXGIResource* sharedResource = nullptr;
    HRESULT hr = m_sharedTexture->QueryInterface(__uuidof(IDXGIResource), reinterpret_cast<void**>(&sharedResource));
    if (FAILED(hr) || !sharedResource) {
        m_sharedTexture->Release();
        m_sharedTexture = nullptr;
        return false;
    }

    hr = sharedResource->GetSharedHandle(&m_sharedTextureHandle);
    sharedResource->Release();
    if (FAILED(hr) || !m_sharedTextureHandle) {
        m_sharedTexture->Release();
        m_sharedTexture = nullptr;
        m_sharedTextureHandle = nullptr;
        return false;
    }

    return true;
}

void DXGICapture::CaptureThread() {
    uint32_t waitTime = m_targetFps > 0 ? (1000 / m_targetFps) : 0;
    UINT acquireTimeoutMs = waitTime > 0 ? waitTime : 16;

    while (m_running) {
        auto start = std::chrono::high_resolution_clock::now();

        IDXGIResource* desktopResource = nullptr;
        DXGI_OUTDUPL_FRAME_INFO frameInfo;
        HRESULT hr = m_duplication->AcquireNextFrame(acquireTimeoutMs, &frameInfo, &desktopResource);

        if (hr == S_OK) {
            ID3D11Texture2D* desktopTexture = nullptr;
            if (!desktopResource || FAILED(desktopResource->QueryInterface(__uuidof(ID3D11Texture2D), (void**)&desktopTexture))) {
                if (desktopResource) {
                    desktopResource->Release();
                }
                m_duplication->ReleaseFrame();
                continue;
            }

            D3D11_TEXTURE2D_DESC desktopDesc{};
            desktopTexture->GetDesc(&desktopDesc);
            if (desktopDesc.Format != m_dxgiFormat) {
                std::cerr << "[DXGICapture] Desktop format changed; rebuilding capture session" << std::endl;
                desktopTexture->Release();
                desktopResource->Release();
                m_duplication->ReleaseFrame();
                m_running = false;
                continue;
            }

            m_context->CopyResource(m_sharedTexture, desktopTexture);
            if (m_stagingTexture) m_context->CopyResource(m_stagingTexture, desktopTexture);
            m_context->Flush();

            {
                std::lock_guard<std::mutex> lock(m_firstFrameMutex);
                if (!m_firstFrameReady) {
                    m_firstFrameReady = true;
                    m_firstFrameCondition.notify_all();
                }
            }

            desktopTexture->Release();
            desktopResource->Release();
            m_duplication->ReleaseFrame();

            D3D11_MAPPED_SUBRESOURCE mapped;
            if (m_stagingTexture && SUCCEEDED(m_context->Map(m_stagingTexture, 0, D3D11_MAP_READ, 0, &mapped))) {
                
                // mapped.pData contains BGRA pixels. This CPU copy is only for
                // the shared-memory preview transport; the compositor samples
                // the D3D11 shared texture directly.
                
                uint32_t byteSize = m_width * m_height * 4;
                uint8_t* rgbaBuffer = m_frameBuffer.data();
                
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

                // Write to lock-free Shared Memory Ring Buffer
                if (m_sharedBuffer) {
                    uint64_t nextSeq = m_sharedBuffer->writeSequence.load(std::memory_order_relaxed) + 1;
                    uint32_t slotIdx = nextSeq % RING_BUFFER_SLOTS;

                    FrameSlot& slot = m_sharedBuffer->slots[slotIdx];
                    slot.sequence.store(0, std::memory_order_release);
                    slot.width = m_width;
                    slot.height = m_height;
                    slot.timestamp_ns = std::chrono::duration_cast<std::chrono::nanoseconds>(
                        std::chrono::high_resolution_clock::now().time_since_epoch()
                    ).count();

                    std::memcpy(slot.pixels, rgbaBuffer, byteSize);

                    // Publish the frame to readers
                    slot.sequence.store(nextSeq, std::memory_order_release);
                    m_sharedBuffer->writeSequence.store(nextSeq, std::memory_order_release);
                }
            }
        } else if (hr == DXGI_ERROR_WAIT_TIMEOUT) {
            continue;
        } else if (hr == DXGI_ERROR_ACCESS_LOST) {
            std::cerr << "[DXGICapture] Access lost, attempting to recover..." << std::endl;
            const uint32_t oldWidth = m_width;
            const uint32_t oldHeight = m_height;
            if (!InitDXGI() || m_width != oldWidth || m_height != oldHeight) {
                std::cerr << "[DXGICapture] Recovery failed or capture size changed; stopping capture" << std::endl;
                m_running = false;
            }
        }

        auto end = std::chrono::high_resolution_clock::now();
        auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();
        if (waitTime > 0 && elapsed < waitTime) {
            std::this_thread::sleep_for(std::chrono::milliseconds(waitTime - elapsed));
        }
    }
}

} // namespace ily
