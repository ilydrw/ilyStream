#include "mf_camera_capture.h"

#include "../renderer/renderer.h"
#include "../renderer/render_device.h"
#include "ily/render_backend.h"

#include <algorithm>
#include <cctype>
#include <chrono>
#include <cmath>
#include <cstddef>
#include <cstring>
#include <cwctype>
#include <iostream>
#include <iterator>
#include <limits>
#include <regex>
#include <utility>

#include <d3d10.h>
#include <dxgi.h>
#include <mfapi.h>
#include <mferror.h>
#include <mfobjects.h>

#pragma comment(lib, "d3d11.lib")
#pragma comment(lib, "dxgi.lib")
#pragma comment(lib, "mf.lib")
#pragma comment(lib, "mfplat.lib")
#pragma comment(lib, "mfreadwrite.lib")
#pragma comment(lib, "mfuuid.lib")
#pragma comment(lib, "ole32.lib")

namespace ily {

namespace {

using Microsoft::WRL::ComPtr;

std::mutex g_mediaFoundationMutex;
uint32_t g_mediaFoundationReferences = 0;

/** ILY_CAMERA_DEBUG=1 traces the first frame's transport, pitch and pixels. */
bool CameraDebugEnabled() {
    static const bool enabled = [] {
        size_t length = 0;
        char value[8]{};
        return getenv_s(&length, value, sizeof(value), "ILY_CAMERA_DEBUG") == 0
            && length > 1
            && value[0] == '1';
    }();
    return enabled;
}

bool AcquireMediaFoundation() {
    std::lock_guard<std::mutex> lock(g_mediaFoundationMutex);
    if (g_mediaFoundationReferences == 0) {
        const HRESULT result = MFStartup(MF_VERSION, MFSTARTUP_FULL);
        if (FAILED(result)) {
            std::cerr << "[MFCameraCapture] MFStartup failed: 0x"
                      << std::hex << result << std::dec << std::endl;
            return false;
        }
    }
    g_mediaFoundationReferences += 1;
    return true;
}

void ReleaseMediaFoundation() {
    std::lock_guard<std::mutex> lock(g_mediaFoundationMutex);
    if (g_mediaFoundationReferences == 0) return;
    g_mediaFoundationReferences -= 1;
    if (g_mediaFoundationReferences == 0) {
        MFShutdown();
    }
}

std::string WideToUtf8(const wchar_t* value) {
    if (!value || *value == L'\0') return {};
    const int required = WideCharToMultiByte(
        CP_UTF8, 0, value, -1, nullptr, 0, nullptr, nullptr);
    if (required <= 1) return {};
    std::string result(static_cast<size_t>(required), '\0');
    WideCharToMultiByte(
        CP_UTF8, 0, value, -1, result.data(), required, nullptr, nullptr);
    result.pop_back();
    return result;
}

std::wstring Utf8ToWide(const std::string& value) {
    if (value.empty()) return {};
    const int required = MultiByteToWideChar(
        CP_UTF8, 0, value.c_str(), -1, nullptr, 0);
    if (required <= 1) return {};
    std::wstring result(static_cast<size_t>(required), L'\0');
    MultiByteToWideChar(
        CP_UTF8, 0, value.c_str(), -1, result.data(), required);
    result.pop_back();
    return result;
}

std::string ReadAllocatedString(IMFAttributes* attributes, const GUID& key) {
    if (!attributes) return {};
    wchar_t* value = nullptr;
    UINT32 length = 0;
    if (FAILED(attributes->GetAllocatedString(key, &value, &length)) || !value) {
        return {};
    }
    std::string result = WideToUtf8(value);
    CoTaskMemFree(value);
    return result;
}

std::string CanonicalDeviceName(const std::string& value) {
    const std::wstring wide = Utf8ToWide(value);
    std::string result;
    result.reserve(wide.size());
    for (wchar_t character : wide) {
        if (iswalnum(character)) {
            const wchar_t lowered = towlower(character);
            if (lowered <= 0x7f) result.push_back(static_cast<char>(lowered));
        }
    }
    return result;
}

std::pair<std::string, std::string> ExtractUsbVidPid(const std::string& value) {
    std::smatch match;
    const std::regex browserPattern(
        R"(([0-9a-fA-F]{4})\s*:\s*([0-9a-fA-F]{4}))",
        std::regex::icase);
    if (std::regex_search(value, match, browserPattern) && match.size() >= 3) {
        std::string vid = match[1].str();
        std::string pid = match[2].str();
        const auto toLower = [](unsigned char character) {
            return static_cast<char>(std::tolower(character));
        };
        std::transform(vid.begin(), vid.end(), vid.begin(), toLower);
        std::transform(pid.begin(), pid.end(), pid.begin(), toLower);
        return {vid, pid};
    }

    const std::regex symbolicPattern(
        R"(vid_([0-9a-fA-F]{4}).*pid_([0-9a-fA-F]{4}))",
        std::regex::icase);
    if (std::regex_search(value, match, symbolicPattern) && match.size() >= 3) {
        std::string vid = match[1].str();
        std::string pid = match[2].str();
        const auto toLower = [](unsigned char character) {
            return static_cast<char>(std::tolower(character));
        };
        std::transform(vid.begin(), vid.end(), vid.begin(), toLower);
        std::transform(pid.begin(), pid.end(), pid.begin(), toLower);
        return {vid, pid};
    }

    return {};
}

int DeviceMatchScore(
    const std::string& requested,
    const std::string& friendlyName,
    const std::string& symbolicLink) {
    if (requested.empty()) return 1;
    const std::string canonicalRequested = CanonicalDeviceName(requested);
    const std::string canonicalFriendly = CanonicalDeviceName(friendlyName);
    const std::string canonicalSymbolic = CanonicalDeviceName(symbolicLink);

    if (!canonicalSymbolic.empty() && canonicalRequested == canonicalSymbolic) return 1000;
    if (!canonicalFriendly.empty() && canonicalRequested == canonicalFriendly) return 900;

    const auto requestedUsb = ExtractUsbVidPid(requested);
    const auto symbolicUsb = ExtractUsbVidPid(symbolicLink);
    if (!requestedUsb.first.empty() && requestedUsb == symbolicUsb) return 850;

    if (!canonicalFriendly.empty() && !canonicalRequested.empty()) {
        if (canonicalRequested.find(canonicalFriendly) != std::string::npos) return 750;
        if (canonicalFriendly.find(canonicalRequested) != std::string::npos) return 700;
    }
    return 0;
}

/**
 * The DXGI adapter the render backend is running on, or null when it can't be
 * determined (callers then fall back to the default adapter).
 */
ComPtr<IDXGIAdapter> FindRendererAdapter(Renderer* renderer) {
    if (!renderer) return nullptr;
    IRenderBackend* backend = renderer->GetDevice().GetBackend();
    uint64_t targetLuid = 0;
    if (!backend || !backend->GetAdapterLuid(&targetLuid)) return nullptr;

    ComPtr<IDXGIFactory1> factory;
    if (FAILED(CreateDXGIFactory1(IID_PPV_ARGS(&factory)))) return nullptr;

    for (UINT index = 0;; ++index) {
        ComPtr<IDXGIAdapter1> adapter;
        if (factory->EnumAdapters1(index, &adapter) == DXGI_ERROR_NOT_FOUND) break;
        DXGI_ADAPTER_DESC1 description{};
        if (FAILED(adapter->GetDesc1(&description))) continue;
        const uint64_t luid =
            (static_cast<uint64_t>(
                 static_cast<uint32_t>(description.AdapterLuid.HighPart)) << 32)
            | static_cast<uint64_t>(description.AdapterLuid.LowPart);
        if (luid == targetLuid) {
            ComPtr<IDXGIAdapter> base;
            if (SUCCEEDED(adapter.As(&base))) return base;
            return nullptr;
        }
    }
    std::cerr << "[MFCameraCapture] Compositor adapter not found; using the default adapter"
              << std::endl;
    return nullptr;
}

struct ActivatedCamera {
    MFCameraDeviceInfo info;
    ComPtr<IMFActivate> activation;
};

std::vector<ActivatedCamera> EnumerateActivatedCameras() {
    std::vector<ActivatedCamera> result;
    ComPtr<IMFAttributes> attributes;
    if (FAILED(MFCreateAttributes(&attributes, 1))) return result;
    if (FAILED(attributes->SetGUID(
            MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE,
            MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE_VIDCAP_GUID))) {
        return result;
    }

    IMFActivate** activations = nullptr;
    UINT32 count = 0;
    const HRESULT enumerationResult =
        MFEnumDeviceSources(attributes.Get(), &activations, &count);
    if (FAILED(enumerationResult)) return result;

    result.reserve(count);
    for (UINT32 index = 0; index < count; ++index) {
        ComPtr<IMFActivate> activation;
        activation.Attach(activations[index]);
        ActivatedCamera camera;
        camera.info.friendlyName = ReadAllocatedString(
            activation.Get(), MF_DEVSOURCE_ATTRIBUTE_FRIENDLY_NAME);
        camera.info.symbolicLink = ReadAllocatedString(
            activation.Get(),
            MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE_VIDCAP_SYMBOLIC_LINK);
        camera.activation = std::move(activation);
        result.push_back(std::move(camera));
    }
    CoTaskMemFree(activations);
    return result;
}

int SubtypePreference(const GUID& subtype) {
    if (subtype == MFVideoFormat_NV12) return 50;
    if (subtype == MFVideoFormat_YUY2) return 40;
    if (subtype == MFVideoFormat_MJPG) return 30;
    if (subtype == MFVideoFormat_RGB32 || subtype == MFVideoFormat_ARGB32) return 20;
    return 0;
}

struct MediaTypeCandidate {
    ComPtr<IMFMediaType> type;
    uint32_t width = 0;
    uint32_t height = 0;
    uint32_t frameRateNumerator = 0;
    uint32_t frameRateDenominator = 1;
    GUID subtype = GUID_NULL;
    double score = -std::numeric_limits<double>::infinity();
};

double ScoreMediaType(
    uint32_t width,
    uint32_t height,
    uint32_t fpsNumerator,
    uint32_t fpsDenominator,
    const GUID& subtype,
    uint32_t requestedWidth,
    uint32_t requestedHeight,
    uint32_t requestedFps) {
    if (width == 0 || height == 0 || SubtypePreference(subtype) == 0) {
        return -std::numeric_limits<double>::infinity();
    }

    const double requestedPixels =
        static_cast<double>((std::max)(1u, requestedWidth))
        * static_cast<double>((std::max)(1u, requestedHeight));
    const double actualPixels =
        static_cast<double>(width) * static_cast<double>(height);
    const double resolutionPenalty =
        std::abs(std::log((std::max)(1.0, actualPixels) / requestedPixels)) * 1000.0;
    const double aspectRequested =
        static_cast<double>((std::max)(1u, requestedWidth))
        / static_cast<double>((std::max)(1u, requestedHeight));
    const double aspectActual =
        static_cast<double>(width) / static_cast<double>(height);
    const double aspectPenalty = std::abs(aspectActual - aspectRequested) * 500.0;
    const double actualFps =
        fpsDenominator > 0
            ? static_cast<double>(fpsNumerator) / static_cast<double>(fpsDenominator)
            : 0.0;
    const double fpsPenalty =
        std::abs(actualFps - static_cast<double>((std::max)(1u, requestedFps))) * 12.0;
    const double exactBonus =
        width == requestedWidth && height == requestedHeight ? 2500.0 : 0.0;

    return exactBonus
        + static_cast<double>(SubtypePreference(subtype))
        - resolutionPenalty
        - aspectPenalty
        - fpsPenalty;
}

} // namespace

MFCameraCapture::MFCameraCapture(
    std::string deviceIdentity,
    uint32_t requestedWidth,
    uint32_t requestedHeight,
    uint32_t requestedFps,
    Renderer* renderer)
    : m_deviceIdentity(std::move(deviceIdentity)),
      m_requestedWidth((std::max)(1u, requestedWidth)),
      m_requestedHeight((std::max)(1u, requestedHeight)),
      m_requestedFps((std::max)(1u, requestedFps)),
      m_renderer(renderer) {}

MFCameraCapture::~MFCameraCapture() {
    Shutdown();
}

bool MFCameraCapture::Initialize() {
    if (!m_renderer || m_running.exchange(true)) return false;

    m_thread = std::thread(&MFCameraCapture::CaptureThread, this);

    {
        std::unique_lock<std::mutex> lock(m_initializationMutex);
        if (!m_initializationCondition.wait_for(
                lock,
                std::chrono::seconds(10),
                [this] { return m_initializationComplete; })) {
            std::cerr << "[MFCameraCapture] Camera initialization timed out" << std::endl;
            lock.unlock();
            Shutdown();
            return false;
        }
        if (!m_initializationSucceeded) {
            lock.unlock();
            Shutdown();
            return false;
        }
    }

    std::unique_lock<std::mutex> firstFrameLock(m_firstFrameMutex);
    if (!m_firstFrameCondition.wait_for(
            firstFrameLock,
            std::chrono::seconds(8),
            [this] { return m_firstFrameReady || !m_running; })) {
        std::cerr << "[MFCameraCapture] Timed out waiting for the first camera frame"
                  << std::endl;
        firstFrameLock.unlock();
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

void MFCameraCapture::Shutdown() {
    const bool wasRunning = m_running.exchange(false);
    if (wasRunning) {
        ComPtr<IMFSourceReader> reader;
        ComPtr<IMFMediaSource> source;
        {
            std::lock_guard<std::mutex> lock(m_resourceMutex);
            reader = m_sourceReader;
            source = m_mediaSource;
        }
        if (reader) reader->Flush(MF_SOURCE_READER_FIRST_VIDEO_STREAM);
        if (source) source->Shutdown();
    }

    if (m_thread.joinable()) m_thread.join();

    if (m_targetTexture != ILY_INVALID_HANDLE && m_renderer) {
        m_renderer->DestroyTexture(m_targetTexture);
        m_targetTexture = ILY_INVALID_HANDLE;
    }
}

std::vector<MFCameraDeviceInfo> MFCameraCapture::EnumerateDevices() {
    std::vector<MFCameraDeviceInfo> devices;
    const HRESULT comResult = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    const bool uninitializeCom = SUCCEEDED(comResult);
    if (!AcquireMediaFoundation()) {
        if (uninitializeCom) CoUninitialize();
        return devices;
    }

    for (const auto& camera : EnumerateActivatedCameras()) {
        devices.push_back(camera.info);
    }

    ReleaseMediaFoundation();
    if (uninitializeCom) CoUninitialize();
    return devices;
}

void MFCameraCapture::CaptureThread() {
    const HRESULT comResult = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    const bool uninitializeCom = SUCCEEDED(comResult);

    bool mediaFoundationStarted = AcquireMediaFoundation();
    const bool initialized = mediaFoundationStarted && InitializeCapture();
    SignalInitialization(initialized);

    if (initialized) {
        while (m_running) {
            DWORD streamIndex = 0;
            DWORD flags = 0;
            LONGLONG timestamp = 0;
            ComPtr<IMFSample> sample;

            ComPtr<IMFSourceReader> reader;
            {
                std::lock_guard<std::mutex> lock(m_resourceMutex);
                reader = m_sourceReader;
            }
            if (!reader) break;

            const HRESULT result = reader->ReadSample(
                MF_SOURCE_READER_FIRST_VIDEO_STREAM,
                0,
                &streamIndex,
                &flags,
                &timestamp,
                &sample);
            if (!m_running) break;
            if (FAILED(result)) {
                std::cerr << "[MFCameraCapture] ReadSample failed: 0x"
                          << std::hex << result << std::dec << std::endl;
                break;
            }
            if ((flags & MF_SOURCE_READERF_ENDOFSTREAM) != 0) break;
            if (!sample || !PublishSample(sample.Get())) continue;

            bool notify = false;
            {
                std::lock_guard<std::mutex> lock(m_firstFrameMutex);
                if (!m_firstFrameReady) {
                    m_firstFrameReady = true;
                    notify = true;
                }
            }
            if (notify) m_firstFrameCondition.notify_all();
        }
    }

    m_running = false;
    m_firstFrameCondition.notify_all();
    ReleaseCaptureResources();
    if (mediaFoundationStarted) ReleaseMediaFoundation();
    if (uninitializeCom) CoUninitialize();
}

bool MFCameraCapture::InitializeCapture() {
    // The target texture is created lazily on the first sample: which kind we
    // need depends on how the driver actually delivers frames (see
    // PublishSample).
    return InitializeD3D()
        && OpenSourceReader()
        && ConfigureMediaType();
}

bool MFCameraCapture::InitializeD3D() {
    const UINT flags =
        D3D11_CREATE_DEVICE_BGRA_SUPPORT | D3D11_CREATE_DEVICE_VIDEO_SUPPORT;
    const D3D_FEATURE_LEVEL levels[] = {
        D3D_FEATURE_LEVEL_11_1,
        D3D_FEATURE_LEVEL_11_0,
        D3D_FEATURE_LEVEL_10_1,
        D3D_FEATURE_LEVEL_10_0
    };

    // Bind to the adapter the compositor is on. A device on any other adapter
    // produces a shared texture the compositor can open but never sees updates
    // from — the camera layer just draws black. Falls back to the default
    // adapter when the backend can't report one.
    ComPtr<IDXGIAdapter> adapter = FindRendererAdapter(m_renderer);
    const D3D_DRIVER_TYPE driverType =
        adapter ? D3D_DRIVER_TYPE_UNKNOWN : D3D_DRIVER_TYPE_HARDWARE;

    D3D_FEATURE_LEVEL selectedLevel = D3D_FEATURE_LEVEL_10_0;
    HRESULT result = D3D11CreateDevice(
        adapter.Get(),
        driverType,
        nullptr,
        flags,
        levels,
        static_cast<UINT>(std::size(levels)),
        D3D11_SDK_VERSION,
        &m_device,
        &selectedLevel,
        &m_context);
    if (result == E_INVALIDARG) {
        result = D3D11CreateDevice(
            adapter.Get(),
            driverType,
            nullptr,
            flags,
            levels + 1,
            static_cast<UINT>(std::size(levels) - 1),
            D3D11_SDK_VERSION,
            &m_device,
            &selectedLevel,
            &m_context);
    }
    if (FAILED(result)) {
        std::cerr << "[MFCameraCapture] D3D11CreateDevice failed: 0x"
                  << std::hex << result << std::dec << std::endl;
        return false;
    }

    ComPtr<ID3D10Multithread> multithread;
    if (SUCCEEDED(m_device.As(&multithread))) {
        multithread->SetMultithreadProtected(TRUE);
    }

    result = MFCreateDXGIDeviceManager(
        &m_deviceManagerToken, &m_deviceManager);
    if (FAILED(result)) return false;
    return SUCCEEDED(
        m_deviceManager->ResetDevice(m_device.Get(), m_deviceManagerToken));
}

bool MFCameraCapture::OpenSourceReader() {
    auto cameras = EnumerateActivatedCameras();
    if (cameras.empty()) {
        std::cerr << "[MFCameraCapture] Windows reported no camera devices" << std::endl;
        return false;
    }

    ActivatedCamera* selected = nullptr;
    int selectedScore = 0;
    for (auto& camera : cameras) {
        const int score = DeviceMatchScore(
            m_deviceIdentity,
            camera.info.friendlyName,
            camera.info.symbolicLink);
        if (score > selectedScore) {
            selectedScore = score;
            selected = &camera;
        }
    }
    if (!selected) {
        std::cerr << "[MFCameraCapture] No Media Foundation camera matched \""
                  << m_deviceIdentity << "\"" << std::endl;
        return false;
    }

    m_deviceName = selected->info.friendlyName;
    ComPtr<IMFMediaSource> mediaSource;
    HRESULT result = selected->activation->ActivateObject(
        IID_PPV_ARGS(&mediaSource));
    if (FAILED(result)) {
        std::cerr << "[MFCameraCapture] Could not activate " << m_deviceName
                  << ": 0x" << std::hex << result << std::dec << std::endl;
        return false;
    }

    // Two attribute sets, tried in order. The GPU one hands the reader our D3D11
    // device so decoded samples arrive as IMFDXGIBuffers we can copy texture to
    // texture. MF_SOURCE_READER_ENABLE_VIDEO_PROCESSING is deliberately absent
    // there: it is incompatible with MF_SOURCE_READER_D3D_MANAGER and setting
    // both makes reader creation fail with E_INVALIDARG. ADVANCED_VIDEO_
    // PROCESSING is the D3D-compatible one that gives us NV12/YUY2 -> RGB32.
    const auto createReader = [&](bool useD3D, ComPtr<IMFSourceReader>& out) {
        ComPtr<IMFAttributes> attributes;
        if (FAILED(MFCreateAttributes(&attributes, 5))) return E_FAIL;
        if (useD3D) {
            attributes->SetUnknown(
                MF_SOURCE_READER_D3D_MANAGER, m_deviceManager.Get());
            attributes->SetUINT32(MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS, TRUE);
            attributes->SetUINT32(
                MF_SOURCE_READER_ENABLE_ADVANCED_VIDEO_PROCESSING, TRUE);
        } else {
            attributes->SetUINT32(MF_SOURCE_READER_ENABLE_VIDEO_PROCESSING, TRUE);
        }
        attributes->SetUINT32(MF_LOW_LATENCY, TRUE);
        attributes->SetUINT32(
            MF_SOURCE_READER_DISCONNECT_MEDIASOURCE_ON_SHUTDOWN, TRUE);
        return MFCreateSourceReaderFromMediaSource(
            mediaSource.Get(), attributes.Get(), &out);
    };

    ComPtr<IMFSourceReader> sourceReader;
    result = createReader(true, sourceReader);
    if (FAILED(result)) {
        // Virtual cameras and some UVC drivers reject the D3D manager; the
        // system-memory path still works and CopySystemMemoryBuffer covers it.
        std::cerr << "[MFCameraCapture] D3D source reader unavailable for "
                  << m_deviceName << " (0x" << std::hex << result << std::dec
                  << "), retrying on the CPU path" << std::endl;
        sourceReader.Reset();
        result = createReader(false, sourceReader);
    }
    if (FAILED(result)) {
        mediaSource->Shutdown();
        std::cerr << "[MFCameraCapture] Could not create source reader: 0x"
                  << std::hex << result << std::dec << std::endl;
        return false;
    }

    {
        std::lock_guard<std::mutex> lock(m_resourceMutex);
        m_mediaSource = std::move(mediaSource);
        m_sourceReader = std::move(sourceReader);
    }
    return true;
}

bool MFCameraCapture::ConfigureMediaType() {
    ComPtr<IMFSourceReader> reader;
    {
        std::lock_guard<std::mutex> lock(m_resourceMutex);
        reader = m_sourceReader;
    }
    if (!reader) return false;

    MediaTypeCandidate best;
    for (DWORD index = 0;; ++index) {
        ComPtr<IMFMediaType> type;
        const HRESULT result = reader->GetNativeMediaType(
            MF_SOURCE_READER_FIRST_VIDEO_STREAM, index, &type);
        if (result == MF_E_NO_MORE_TYPES) break;
        if (FAILED(result)) continue;

        GUID majorType = GUID_NULL;
        GUID subtype = GUID_NULL;
        if (FAILED(type->GetGUID(MF_MT_MAJOR_TYPE, &majorType))
            || majorType != MFMediaType_Video
            || FAILED(type->GetGUID(MF_MT_SUBTYPE, &subtype))) {
            continue;
        }

        UINT32 width = 0;
        UINT32 height = 0;
        UINT32 fpsNumerator = 0;
        UINT32 fpsDenominator = 1;
        if (FAILED(MFGetAttributeSize(
                type.Get(), MF_MT_FRAME_SIZE, &width, &height))) {
            continue;
        }
        if (FAILED(MFGetAttributeRatio(
                type.Get(), MF_MT_FRAME_RATE, &fpsNumerator, &fpsDenominator))) {
            fpsNumerator = 30;
            fpsDenominator = 1;
        }

        const double score = ScoreMediaType(
            width,
            height,
            fpsNumerator,
            fpsDenominator,
            subtype,
            m_requestedWidth,
            m_requestedHeight,
            m_requestedFps);
        if (score > best.score) {
            best.type = type;
            best.width = width;
            best.height = height;
            best.frameRateNumerator = fpsNumerator;
            best.frameRateDenominator = (std::max)(1u, fpsDenominator);
            best.subtype = subtype;
            best.score = score;
        }
    }

    if (!best.type) {
        std::cerr << "[MFCameraCapture] No supported media type for "
                  << m_deviceName << std::endl;
        return false;
    }

    HRESULT result = reader->SetCurrentMediaType(
        MF_SOURCE_READER_FIRST_VIDEO_STREAM, nullptr, best.type.Get());
    if (FAILED(result)) return false;

    ComPtr<IMFMediaType> outputType;
    if (FAILED(MFCreateMediaType(&outputType))) return false;
    outputType->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Video);
    // ARGB32 first: it maps to DXGI_FORMAT_B8G8R8A8_UNORM, which the GPU path
    // can copy texture-to-texture. RGB32 lands on B8G8R8X8_UNORM, a different
    // D3D format family that CopySubresourceRegion refuses — that transport
    // then falls back to the CPU upload.
    outputType->SetGUID(MF_MT_SUBTYPE, MFVideoFormat_ARGB32);
    MFSetAttributeSize(
        outputType.Get(), MF_MT_FRAME_SIZE, best.width, best.height);
    MFSetAttributeRatio(
        outputType.Get(),
        MF_MT_FRAME_RATE,
        best.frameRateNumerator,
        best.frameRateDenominator);
    MFSetAttributeRatio(outputType.Get(), MF_MT_PIXEL_ASPECT_RATIO, 1, 1);
    outputType->SetUINT32(
        MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive);
    outputType->SetUINT32(MF_MT_ALL_SAMPLES_INDEPENDENT, TRUE);

    result = reader->SetCurrentMediaType(
        MF_SOURCE_READER_FIRST_VIDEO_STREAM, nullptr, outputType.Get());
    if (FAILED(result)) {
        outputType->SetGUID(MF_MT_SUBTYPE, MFVideoFormat_RGB32);
        result = reader->SetCurrentMediaType(
            MF_SOURCE_READER_FIRST_VIDEO_STREAM, nullptr, outputType.Get());
    }
    if (FAILED(result)) {
        std::cerr << "[MFCameraCapture] RGB32 conversion unavailable for "
                  << m_deviceName << ": 0x" << std::hex << result
                  << std::dec << std::endl;
        return false;
    }

    ComPtr<IMFMediaType> currentType;
    if (SUCCEEDED(reader->GetCurrentMediaType(
            MF_SOURCE_READER_FIRST_VIDEO_STREAM, &currentType))) {
        MFGetAttributeSize(
            currentType.Get(), MF_MT_FRAME_SIZE, &m_width, &m_height);
        MFGetAttributeRatio(
            currentType.Get(),
            MF_MT_FRAME_RATE,
            &m_frameRateNumerator,
            &m_frameRateDenominator);
    }
    if (m_width == 0 || m_height == 0) {
        m_width = best.width;
        m_height = best.height;
    }
    if (m_frameRateNumerator == 0) {
        m_frameRateNumerator = best.frameRateNumerator;
        m_frameRateDenominator = best.frameRateDenominator;
    }
    m_frameRateDenominator = (std::max)(1u, m_frameRateDenominator);
    m_cpuFrame.resize(
        static_cast<size_t>(m_width) * static_cast<size_t>(m_height) * 4);
    return true;
}

bool MFCameraCapture::CreateCpuTexture() {
    if (m_targetTexture != ILY_INVALID_HANDLE) return true;
    if (!m_renderer || m_width == 0 || m_height == 0) return false;
    // Plain engine-owned texture, refilled per frame through the renderer's
    // command queue — the same transport browser sources use. Deliberately NOT
    // a shared texture: CPU writes (UpdateSubresource) to a legacy shared
    // surface are not visible to the compositor's device, which composites the
    // layer as pure black.
    m_targetTexture = m_renderer->CreateTexture(
        m_width,
        m_height,
        nullptr,
        0,
        /*isBGRA=*/true,
        IlySrgbFullColor(),
        ILY_ALPHA_OPAQUE);
    return m_targetTexture != ILY_INVALID_HANDLE;
}

bool MFCameraCapture::CreateSharedTexture() {
    if (m_targetTexture != ILY_INVALID_HANDLE) return true;
    if (!m_device || !m_context || m_width == 0 || m_height == 0) return false;

    D3D11_TEXTURE2D_DESC description{};
    description.Width = m_width;
    description.Height = m_height;
    description.MipLevels = 1;
    description.ArraySize = 1;
    description.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
    description.SampleDesc.Count = 1;
    description.Usage = D3D11_USAGE_DEFAULT;
    description.BindFlags = D3D11_BIND_SHADER_RESOURCE;
    description.MiscFlags = D3D11_RESOURCE_MISC_SHARED;

    if (FAILED(m_device->CreateTexture2D(
            &description, nullptr, &m_sharedTexture))) {
        return false;
    }

    ComPtr<IDXGIResource> resource;
    if (FAILED(m_sharedTexture.As(&resource))) return false;
    if (FAILED(resource->GetSharedHandle(&m_sharedTextureHandle))
        || !m_sharedTextureHandle) {
        return false;
    }

    m_targetTexture = m_renderer->CreateSharedTextureFromHandle(
        m_width,
        m_height,
        m_sharedTextureHandle,
        ILY_PIXEL_FORMAT_BGRA8,
        IlySrgbFullColor(),
        ILY_ALPHA_OPAQUE,
        80.0f);
    return m_targetTexture != ILY_INVALID_HANDLE;
}

bool MFCameraCapture::PublishSample(IMFSample* sample) {
    if (!sample || !m_context) return false;

    ComPtr<IMFMediaBuffer> buffer;
    if (FAILED(sample->GetBufferByIndex(0, &buffer)) || !buffer) return false;

    ComPtr<IMFDXGIBuffer> dxgiBuffer;
    if (!m_cpuTexturePath && SUCCEEDED(buffer.As(&dxgiBuffer))) {
        ComPtr<ID3D11Texture2D> sourceTexture;
        UINT subresource = 0;
        if (SUCCEEDED(dxgiBuffer->GetResource(IID_PPV_ARGS(&sourceTexture)))
            && SUCCEEDED(dxgiBuffer->GetSubresourceIndex(&subresource))
            && sourceTexture) {
            D3D11_TEXTURE2D_DESC sourceDescription{};
            sourceTexture->GetDesc(&sourceDescription);
            if (CameraDebugEnabled() && !m_firstFrameReady) {
                std::cerr << "[MFCameraCapture] dxgi sample " << sourceDescription.Width
                          << "x" << sourceDescription.Height << " format="
                          << sourceDescription.Format << " (want "
                          << m_width << "x" << m_height << " format "
                          << DXGI_FORMAT_B8G8R8A8_UNORM << ")" << std::endl;
            }
            if (sourceDescription.Width == m_width
                && sourceDescription.Height == m_height
                && sourceDescription.Format == DXGI_FORMAT_B8G8R8A8_UNORM
                && CreateSharedTexture()) {
                m_context->CopySubresourceRegion(
                    m_sharedTexture.Get(),
                    0,
                    0,
                    0,
                    0,
                    sourceTexture.Get(),
                    subresource,
                    nullptr);
                m_context->Flush();
                m_usesGpuFrames = true;
                return true;
            }
        }
    }

    return CopySystemMemoryBuffer(buffer.Get());
}

bool MFCameraCapture::CopySystemMemoryBuffer(IMFMediaBuffer* buffer) {
    if (!buffer || m_cpuFrame.empty()) return false;
    // Once a frame arrives in system memory the session stays on the CPU
    // transport: the GPU path's shared texture would never be written again.
    m_cpuTexturePath = true;
    if (!CreateCpuTexture()) return false;
    const size_t rowBytes = static_cast<size_t>(m_width) * 4;

    ComPtr<IMF2DBuffer> buffer2D;
    if (SUCCEEDED(buffer->QueryInterface(IID_PPV_ARGS(&buffer2D)))) {
        BYTE* scanline = nullptr;
        LONG pitch = 0;
        if (SUCCEEDED(buffer2D->Lock2D(&scanline, &pitch)) && scanline) {
            for (uint32_t row = 0; row < m_height; ++row) {
                const BYTE* source =
                    scanline + static_cast<ptrdiff_t>(row) * pitch;
                std::memcpy(
                    m_cpuFrame.data() + static_cast<size_t>(row) * rowBytes,
                    source,
                    rowBytes);
            }
            buffer2D->Unlock2D();
            if (CameraDebugEnabled() && !m_firstFrameReady) {
                std::cerr << "[MFCameraCapture] 2d buffer pitch=" << pitch
                          << " rowBytes=" << rowBytes << " px[0]=("
                          << int(m_cpuFrame[0]) << "," << int(m_cpuFrame[1]) << ","
                          << int(m_cpuFrame[2]) << "," << int(m_cpuFrame[3])
                          << ") px[center]=("
                          << int(m_cpuFrame[m_cpuFrame.size() / 2 + 0]) << ","
                          << int(m_cpuFrame[m_cpuFrame.size() / 2 + 1]) << ","
                          << int(m_cpuFrame[m_cpuFrame.size() / 2 + 2]) << ")"
                          << std::endl;
            }
            return UploadCpuFrame();
        }
    }

    BYTE* bytes = nullptr;
    DWORD maximumLength = 0;
    DWORD currentLength = 0;
    if (FAILED(buffer->Lock(&bytes, &maximumLength, &currentLength))
        || !bytes
        || currentLength < m_cpuFrame.size()) {
        if (bytes) buffer->Unlock();
        return false;
    }
    std::memcpy(m_cpuFrame.data(), bytes, m_cpuFrame.size());
    buffer->Unlock();
    return UploadCpuFrame();
}

bool MFCameraCapture::UploadCpuFrame() {
    if (!m_renderer || m_targetTexture == ILY_INVALID_HANDLE) return false;
    return m_renderer->UpdateTexture(
               m_targetTexture,
               m_cpuFrame.data(),
               static_cast<uint32_t>(m_cpuFrame.size()),
               /*isBGRA=*/true) == ILY_SUCCESS;
}

void MFCameraCapture::SignalInitialization(bool success) {
    {
        std::lock_guard<std::mutex> lock(m_initializationMutex);
        m_initializationSucceeded = success;
        m_initializationComplete = true;
    }
    m_initializationCondition.notify_all();
}

void MFCameraCapture::ReleaseCaptureResources() {
    std::lock_guard<std::mutex> lock(m_resourceMutex);
    if (m_mediaSource) m_mediaSource->Shutdown();
    m_sourceReader.Reset();
    m_mediaSource.Reset();
    m_deviceManager.Reset();
    m_sharedTexture.Reset();
    m_context.Reset();
    m_device.Reset();
    m_sharedTextureHandle = nullptr;
}

} // namespace ily
