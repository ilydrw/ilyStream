#include <catch2/catch_test_macros.hpp>
#include "renderer/renderer.h"
#include "program-video-control.hpp"
#include <cstring>
#include <random>
#include <thread>
#include <vector>

#ifdef _WIN32
#include <d3d11_1.h>
#include <dxgi1_2.h>
#include <windows.h>
#include <wrl/client.h>

static bool CreateConsumerDeviceOnAdapter(
    uint64_t packedLuid,
    Microsoft::WRL::ComPtr<ID3D11Device1>& outDevice) {
    using Microsoft::WRL::ComPtr;
    ComPtr<IDXGIFactory1> factory;
    if (FAILED(CreateDXGIFactory1(IID_PPV_ARGS(&factory)))) return false;

    ComPtr<IDXGIAdapter1> selected;
    for (UINT index = 0; ; ++index) {
        ComPtr<IDXGIAdapter1> candidate;
        if (factory->EnumAdapters1(index, &candidate) == DXGI_ERROR_NOT_FOUND) break;
        DXGI_ADAPTER_DESC1 description{};
        if (FAILED(candidate->GetDesc1(&description))) continue;
        const uint64_t candidateLuid =
            (static_cast<uint64_t>(static_cast<uint32_t>(description.AdapterLuid.HighPart)) << 32) |
            static_cast<uint64_t>(description.AdapterLuid.LowPart);
        if (candidateLuid == packedLuid) {
            selected = candidate;
            break;
        }
    }
    if (!selected) return false;

    ComPtr<ID3D11Device> baseDevice;
    ComPtr<ID3D11DeviceContext> context;
    D3D_FEATURE_LEVEL featureLevel{};
    if (FAILED(D3D11CreateDevice(
            selected.Get(),
            D3D_DRIVER_TYPE_UNKNOWN,
            nullptr,
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            nullptr,
            0,
            D3D11_SDK_VERSION,
            &baseDevice,
            &featureLevel,
            &context))) {
        return false;
    }
    return SUCCEEDED(baseDevice.As(&outDevice));
}
#endif

TEST_CASE("Renderer Stress Test - Restart Loop", "[renderer_stress]") {
    for (int i = 0; i < 500; ++i) {
        ily::Renderer renderer;
        IlyResult res = renderer.Start();
        REQUIRE(res == ILY_SUCCESS);
        
        IlyEngineConfig config{1280, 720, 60, false};
        res = renderer.Initialize(config);
        REQUIRE(res == ILY_SUCCESS);
        
        renderer.Stop();
    }
}

TEST_CASE("Renderer Stress Test - Random Resizes & Minimize/Restore", "[renderer_stress]") {
    ily::Renderer renderer;
    IlyResult res = renderer.Start();
    REQUIRE(res == ILY_SUCCESS);
    
    IlyEngineConfig config{1280, 720, 60, false};
    res = renderer.Initialize(config);
    REQUIRE(res == ILY_SUCCESS);
    
    std::vector<std::pair<uint32_t, uint32_t>> resolutions = {
        {640, 360},
        {1280, 720},
        {1920, 1080},
        {2560, 1440},
        {3840, 2160},
        {0, 0}, // Minimize representation
        {1280, 720} // Restore
    };
    
    std::default_random_engine generator(1337);
    std::uniform_int_distribution<size_t> distribution(0, resolutions.size() - 1);
    
    for (int i = 0; i < 100; ++i) {
        auto resPair = resolutions[distribution(generator)];
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
        
        IlyResult resizeRes = renderer.Resize(resPair.first, resPair.second);
        REQUIRE(resizeRes == ILY_SUCCESS);
    }
    
    renderer.Stop();
}

TEST_CASE("Renderer Resize updates readback surface dimensions", "[renderer_stress]") {
    ily::Renderer renderer;
    IlyResult res = renderer.Start();
    REQUIRE(res == ILY_SUCCESS);

    IlyEngineConfig config{640, 360, 60, false};
    res = renderer.Initialize(config);
    REQUIRE(res == ILY_SUCCESS);

#ifdef _WIN32
    void* sharedOutput = nullptr;
    uint32_t sharedWidth = 0;
    uint32_t sharedHeight = 0;
    res = renderer.GetSharedOutputTexture(&sharedOutput, &sharedWidth, &sharedHeight);
    REQUIRE(res == ILY_SUCCESS);
    REQUIRE(sharedOutput != nullptr);
    REQUIRE(sharedWidth == 640);
    REQUIRE(sharedHeight == 360);
#endif

    uint32_t outW = 0;
    uint32_t outH = 0;
    std::vector<uint8_t> first(640 * 360 * 4);
    res = renderer.ReadPixels(first.data(), static_cast<uint32_t>(first.size()), &outW, &outH);
    REQUIRE(res == ILY_SUCCESS);
    REQUIRE(outW == 640);
    REQUIRE(outH == 360);

    res = renderer.Resize(320, 180);
    REQUIRE(res == ILY_SUCCESS);

#ifdef _WIN32
    sharedOutput = nullptr;
    res = renderer.GetSharedOutputTexture(&sharedOutput, &sharedWidth, &sharedHeight);
    REQUIRE(res == ILY_SUCCESS);
    REQUIRE(sharedOutput != nullptr);
    REQUIRE(sharedWidth == 320);
    REQUIRE(sharedHeight == 180);
#endif

    std::this_thread::sleep_for(std::chrono::milliseconds(30));

    std::vector<uint8_t> resized(320 * 180 * 4);
    res = renderer.ReadPixels(resized.data(), static_cast<uint32_t>(resized.size()), &outW, &outH);
    REQUIRE(res == ILY_SUCCESS);
    REQUIRE(outW == 320);
    REQUIRE(outH == 180);

    renderer.Stop();
}

#ifdef _WIN32
TEST_CASE("Program export descriptor and duplicated handles follow generation", "[program_export]") {
    ily::Renderer renderer;
    REQUIRE(renderer.Start() == ILY_SUCCESS);

    IlyEngineConfig config{320, 180, 60, false};
    REQUIRE(renderer.Initialize(config) == ILY_SUCCESS);

    IlyProgramExportDescriptor first{};
    REQUIRE(renderer.GetProgramExportDescriptor(&first) == ILY_ERROR_NOT_SUPPORTED);
    REQUIRE(renderer.SetProgramExportEnabled(true) == ILY_SUCCESS);
    for (int attempt = 0; attempt < 40; ++attempt) {
        REQUIRE(renderer.GetProgramExportDescriptor(&first) == ILY_SUCCESS);
        if (first.frameSequence > 0) break;
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
    }

    REQUIRE(first.structSize == sizeof(IlyProgramExportDescriptor));
    REQUIRE(first.version == ILY_PROGRAM_EXPORT_DESCRIPTOR_VERSION);
    REQUIRE(first.generation > 0);
    REQUIRE(first.frameSequence > 0);
    REQUIRE(first.adapterLuid != 0);
    REQUIRE(first.width == 320);
    REQUIRE(first.height == 180);
    REQUIRE(first.format == ILY_PIXEL_FORMAT_RGBA8);
    REQUIRE(first.slotCount == ILY_PROGRAM_EXPORT_SLOT_COUNT);
    REQUIRE(first.latestSlot < ILY_PROGRAM_EXPORT_SLOT_COUNT);
    REQUIRE(first.producerAcquireKey == 0);
    REQUIRE(first.consumerAcquireKey == 1);
    REQUIRE(first.controlBlockVersion == 1);
    REQUIRE(first.controlBlockSize == 128);
    REQUIRE(first.controlMappingHandleValue != 0);
    for (uint32_t index = 0; index < first.slotCount; ++index) {
        REQUIRE(first.sharedHandleValues[index] != 0);
    }

    // A consumer that has not attached yet must not permanently strand both
    // slots at the consumer key. Superseded slots are reclaimed without
    // waiting, so publication continues while nobody is reading.
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    IlyProgramExportDescriptor advanced{};
    REQUIRE(renderer.GetProgramExportDescriptor(&advanced) == ILY_SUCCESS);
    REQUIRE(advanced.generation == first.generation);
    REQUIRE(advanced.frameSequence > first.frameSequence);

    IlyProgramExportDuplicatedHandles duplicated{};
    REQUIRE(renderer.DuplicateProgramExportHandles(
        GetCurrentProcessId(),
        first.generation,
        first.slotCount,
        &duplicated) == ILY_SUCCESS);
    REQUIRE(duplicated.version == ILY_PROGRAM_EXPORT_DUPLICATED_HANDLES_VERSION);
    REQUIRE(duplicated.generation == first.generation);
    REQUIRE(duplicated.slotCount == first.slotCount);
    Microsoft::WRL::ComPtr<ID3D11Device1> consumerDevice;
    REQUIRE(CreateConsumerDeviceOnAdapter(first.adapterLuid, consumerDevice));
    for (uint64_t handleValue : duplicated.textureHandleValues) {
        REQUIRE(handleValue != 0);
        DWORD flags = 0;
        REQUIRE(GetHandleInformation(
            reinterpret_cast<HANDLE>(static_cast<uintptr_t>(handleValue)), &flags));
        Microsoft::WRL::ComPtr<ID3D11Texture2D> openedTexture;
        REQUIRE(SUCCEEDED(consumerDevice->OpenSharedResource1(
            reinterpret_cast<HANDLE>(static_cast<uintptr_t>(handleValue)),
            IID_PPV_ARGS(&openedTexture))));
        D3D11_TEXTURE2D_DESC textureDescription{};
        openedTexture->GetDesc(&textureDescription);
        REQUIRE(textureDescription.Width == first.width);
        REQUIRE(textureDescription.Height == first.height);
        REQUIRE(textureDescription.Format == DXGI_FORMAT_R8G8B8A8_UNORM);
        REQUIRE((textureDescription.MiscFlags & D3D11_RESOURCE_MISC_SHARED_NTHANDLE) != 0);
        REQUIRE((textureDescription.MiscFlags & D3D11_RESOURCE_MISC_SHARED_KEYEDMUTEX) != 0);
        Microsoft::WRL::ComPtr<IDXGIKeyedMutex> keyedMutex;
        REQUIRE(SUCCEEDED(openedTexture.As(&keyedMutex)));
        CloseHandle(reinterpret_cast<HANDLE>(static_cast<uintptr_t>(handleValue)));
    }
    REQUIRE(duplicated.controlHandleValue != 0);
    HANDLE controlHandle = reinterpret_cast<HANDLE>(
        static_cast<uintptr_t>(duplicated.controlHandleValue));
    void* writableView = MapViewOfFile(controlHandle, FILE_MAP_WRITE, 0, 0, 0);
    REQUIRE(writableView == nullptr);
    const auto* control = static_cast<
        const ilystream::program_transport::ProgramVideoControlHeader*>(
            MapViewOfFile(controlHandle, FILE_MAP_READ, 0, 0, 0));
    REQUIRE(control != nullptr);
    REQUIRE(control->magic == ilystream::program_transport::kProgramVideoControlMagic);
    REQUIRE(control->version == ilystream::program_transport::kProgramVideoControlVersion);
    REQUIRE(control->headerBytes == ilystream::program_transport::kProgramVideoControlBytes);
    REQUIRE(control->slotCount == ILY_PROGRAM_EXPORT_SLOT_COUNT);
    REQUIRE(control->generation == first.generation);
    REQUIRE(control->flags == 0);
    ilystream::program_transport::ProgramVideoControlHeader snapshot{};
    bool stableSnapshot = false;
    auto readPublishSequence = [control]() -> uint64_t {
        return *reinterpret_cast<volatile const uint64_t*>(
            &control->publishSequence);
    };
    for (int attempt = 0; attempt < 100; ++attempt) {
        const uint64_t before = readPublishSequence();
        if ((before & 1u) != 0) continue;
        MemoryBarrier();
        std::memcpy(&snapshot, control, sizeof(snapshot));
        MemoryBarrier();
        const uint64_t after = readPublishSequence();
        if (before == after && (after & 1u) == 0) {
            stableSnapshot = true;
            break;
        }
    }
    REQUIRE(stableSnapshot);
    REQUIRE(snapshot.frameSequence >= advanced.frameSequence);
    REQUIRE(snapshot.flags == 0);
    REQUIRE(snapshot.latestSlot < ILY_PROGRAM_EXPORT_SLOT_COUNT);
    REQUIRE(snapshot.slotFrameSequence[snapshot.latestSlot] == snapshot.frameSequence);
    UnmapViewOfFile(control);
    CloseHandle(controlHandle);

    IlyProgramExportDuplicatedHandles refused{};
    REQUIRE(renderer.DuplicateProgramExportHandles(
        GetCurrentProcessId(),
        first.generation,
        first.slotCount - 1,
        &refused) == ILY_ERROR_INVALID_ARGUMENT);

    REQUIRE(renderer.Resize(640, 360) == ILY_SUCCESS);
    IlyProgramExportDescriptor resized{};
    REQUIRE(renderer.GetProgramExportDescriptor(&resized) == ILY_SUCCESS);
    REQUIRE(resized.generation != first.generation);
    REQUIRE(resized.width == 640);
    REQUIRE(resized.height == 360);

    refused.textureHandleValues[0] = 123;
    refused.textureHandleValues[1] = 456;
    refused.controlHandleValue = 789;
    REQUIRE(renderer.DuplicateProgramExportHandles(
        GetCurrentProcessId(),
        first.generation,
        first.slotCount,
        &refused) == ILY_ERROR_NOT_FOUND);
    REQUIRE(refused.textureHandleValues[0] == 0);
    REQUIRE(refused.textureHandleValues[1] == 0);
    REQUIRE(refused.controlHandleValue == 0);

    REQUIRE(renderer.SetProgramExportEnabled(false) == ILY_SUCCESS);
    REQUIRE(renderer.GetProgramExportDescriptor(&resized) == ILY_ERROR_NOT_SUPPORTED);

    renderer.Stop();
}
#endif
