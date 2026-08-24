// SPDX-License-Identifier: GPL-2.0-or-later
#include "bridge-program-transport.hpp"

#include "program-audio-ring-reader.hpp"
#include "program-transport/program-video-control.hpp"
#include "program-video-control-reader.hpp"

#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <Windows.h>
#include <d3d11_1.h>
#include <dxgi1_2.h>
#include <wrl/client.h>

#include <obs-module.h>

#include <array>
#include <atomic>
#include <cstdint>
#include <mutex>
#include <optional>
#include <utility>

namespace ilystream {
namespace {

using Microsoft::WRL::ComPtr;

class OwnedHandle final {
  public:
    OwnedHandle() = default;
    explicit OwnedHandle(HANDLE handle) : handle_(handle) {}
    OwnedHandle(const OwnedHandle&) = delete;
    OwnedHandle& operator=(const OwnedHandle&) = delete;
    OwnedHandle(OwnedHandle&& other) noexcept : handle_(other.release()) {}
    OwnedHandle& operator=(OwnedHandle&& other) noexcept {
        if (this != &other) {
            reset(other.release());
        }
        return *this;
    }
    ~OwnedHandle() { reset(); }

    HANDLE get() const noexcept { return handle_; }
    explicit operator bool() const noexcept { return handle_ != nullptr && handle_ != INVALID_HANDLE_VALUE; }
    HANDLE release() noexcept { return std::exchange(handle_, nullptr); }
    void reset(HANDLE replacement = nullptr) noexcept {
        if (*this) {
            CloseHandle(handle_);
        }
        handle_ = replacement;
    }

  private:
    HANDLE handle_ = nullptr;
};

std::optional<OwnedHandle> parseOwnedHandle(const QString& text) noexcept {
    bool ok = false;
    const quint64 value = text.toULongLong(&ok, 16);
    if (!ok || value == 0 || value > static_cast<quint64>(UINTPTR_MAX)) {
        return std::nullopt;
    }
    return OwnedHandle(reinterpret_cast<HANDLE>(static_cast<std::uintptr_t>(value)));
}

bool adapterMatches(ID3D11Device* device, const ProgramVideoTransportDescriptor& descriptor) noexcept {
    ComPtr<IDXGIDevice> dxgiDevice;
    ComPtr<IDXGIAdapter> adapter;
    DXGI_ADAPTER_DESC adapterDescription{};
    if (!device || FAILED(device->QueryInterface(IID_PPV_ARGS(&dxgiDevice))) || !dxgiDevice ||
        FAILED(dxgiDevice->GetAdapter(&adapter)) || !adapter || FAILED(adapter->GetDesc(&adapterDescription))) {
        return false;
    }
    return adapterDescription.AdapterLuid.HighPart == descriptor.adapterLuidHigh &&
           adapterDescription.AdapterLuid.LowPart == descriptor.adapterLuidLow;
}

bool validImportedTexture(ID3D11Texture2D* texture, const ProgramVideoTransportDescriptor& descriptor) noexcept {
    if (!texture) {
        return false;
    }
    D3D11_TEXTURE2D_DESC textureDescription{};
    texture->GetDesc(&textureDescription);
    return textureDescription.Width == descriptor.width && textureDescription.Height == descriptor.height &&
           textureDescription.MipLevels == 1 && textureDescription.ArraySize == 1 &&
           textureDescription.Format == DXGI_FORMAT_R8G8B8A8_UNORM && textureDescription.SampleDesc.Count == 1 &&
           (textureDescription.MiscFlags & D3D11_RESOURCE_MISC_SHARED_NTHANDLE) != 0 &&
           (textureDescription.MiscFlags & D3D11_RESOURCE_MISC_SHARED_KEYEDMUTEX) != 0;
}

} // namespace

struct BridgeProgramTransport::Impl {
    explicit Impl(ProgramTransportDescriptor descriptorValue) : descriptor(std::move(descriptorValue)) {}
    ~Impl() {
        closePendingTextureHandlesLocked();
        if (controlView) {
            UnmapViewOfFile(controlView);
        }
        if (audioRing) {
            audioRing->retire(descriptor.generation);
        }
    }

    bool stage() noexcept {
        auto firstTexture = parseOwnedHandle(descriptor.video.duplicatedHandles[0]);
        auto secondTexture = parseOwnedHandle(descriptor.video.duplicatedHandles[1]);
        auto control = parseOwnedHandle(descriptor.video.controlHandle);
        if (!firstTexture || !secondTexture || !control) {
            return false;
        }
        pendingTextureHandles[0] = std::move(*firstTexture);
        pendingTextureHandles[1] = std::move(*secondTexture);

        controlView = MapViewOfFile(control->get(), FILE_MAP_READ, 0, 0,
                                    program_transport::kProgramVideoControlBytes);
        control->reset();
        if (!controlView) {
            return false;
        }

        ProgramVideoControlSnapshot snapshot;
        const ProgramVideoControlReadResult controlResult =
            readProgramVideoControl(controlView, descriptor.generation, snapshot);
        if (controlResult == ProgramVideoControlReadResult::Invalid) {
            return false;
        }

        ProgramAudioRingOptions audioOptions;
        audioOptions.ringName = descriptor.audio.ringName.toStdWString();
        audioOptions.generation = descriptor.generation;
        audioOptions.sampleRate = descriptor.audio.sampleRate;
        audioOptions.channels = descriptor.audio.channels;
        audioOptions.capacityFrames = descriptor.audio.capacityFrames;
        audioOptions.blockFrames = descriptor.audio.blockFrames;
        audioRing = ProgramAudioRing::open(audioOptions);
        return audioRing != nullptr;
    }

    void closePendingTextureHandlesLocked() noexcept {
        for (auto& handle : pendingTextureHandles) {
            handle.reset();
        }
    }

    void releaseGraphicsLocked() noexcept {
        if (cachedTexture) {
            gs_texture_destroy(cachedTexture);
            cachedTexture = nullptr;
        }
        cachedD3DTexture = nullptr;
        context.Reset();
        for (auto& keyedMutex : keyedMutexes) {
            keyedMutex.Reset();
        }
        for (auto& texture : importedTextures) {
            texture.Reset();
        }
        imported = false;
    }

    void failClosedLocked(const char* reason) noexcept {
        if (!failed.exchange(true, std::memory_order_acq_rel)) {
            blog(LOG_WARNING, "[ilyStream Program] Transport went offline: %s", reason);
        }
        closePendingTextureHandlesLocked();
        releaseGraphicsLocked();
        if (controlView) {
            UnmapViewOfFile(controlView);
            controlView = nullptr;
        }
        if (audioRing) {
            audioRing->retire(descriptor.generation);
        }
    }

    bool importGraphicsLocked() noexcept {
        if (imported) {
            return true;
        }
        if (gs_get_device_type() != GS_DEVICE_DIRECT3D_11) {
            failClosedLocked("OBS is not using Direct3D 11");
            return false;
        }

        auto* device = static_cast<ID3D11Device*>(gs_get_device_obj());
        if (!device || !adapterMatches(device, descriptor.video)) {
            failClosedLocked("OBS and ilyStream are on different graphics adapters");
            return false;
        }

        ComPtr<ID3D11Device1> device1;
        if (FAILED(device->QueryInterface(IID_PPV_ARGS(&device1))) || !device1) {
            failClosedLocked("OBS Direct3D device cannot import NT shared textures");
            return false;
        }

        for (std::size_t index = 0; index < importedTextures.size(); ++index) {
            const HANDLE handle = pendingTextureHandles[index].get();
            const HRESULT openResult = handle ? device1->OpenSharedResource1(
                                                   handle, IID_PPV_ARGS(&importedTextures[index]))
                                              : E_HANDLE;
            pendingTextureHandles[index].reset();
            if (FAILED(openResult) || !validImportedTexture(importedTextures[index].Get(), descriptor.video) ||
                FAILED(importedTextures[index].As(&keyedMutexes[index])) || !keyedMutexes[index]) {
                failClosedLocked("a shared Program texture could not be imported");
                return false;
            }
        }

        cachedTexture = gs_texture_create(descriptor.video.width, descriptor.video.height, GS_RGBA, 1, nullptr, 0);
        if (!cachedTexture) {
            failClosedLocked("OBS could not allocate the Program frame cache");
            return false;
        }
        cachedD3DTexture = static_cast<ID3D11Texture2D*>(gs_texture_get_obj(cachedTexture));
        if (!cachedD3DTexture) {
            failClosedLocked("OBS Program frame cache has no Direct3D texture");
            return false;
        }
        device->GetImmediateContext(&context);
        if (!context) {
            failClosedLocked("OBS Direct3D context is unavailable");
            return false;
        }

        imported = true;
        return true;
    }

    bool drawCachedLocked() noexcept {
        if (!cachedTexture || lastCopiedFrameSequence == 0) {
            return false;
        }

        const bool previousSrgb = gs_framebuffer_srgb_enabled();
        gs_enable_framebuffer_srgb(true);
        gs_blend_state_push();
        gs_blend_function(GS_BLEND_ONE, GS_BLEND_INVSRCALPHA);
        gs_effect_t* effect = obs_get_base_effect(OBS_EFFECT_DEFAULT);
        gs_eparam_t* image = effect ? gs_effect_get_param_by_name(effect, "image") : nullptr;
        if (effect && image) {
            gs_effect_set_texture_srgb(image, cachedTexture);
            while (gs_effect_loop(effect, "Draw")) {
                gs_draw_sprite(cachedTexture, 0, descriptor.video.width, descriptor.video.height);
            }
        }
        gs_blend_state_pop();
        gs_enable_framebuffer_srgb(previousSrgb);
        return effect && image;
    }

    ProgramTransportDescriptor descriptor;
    std::shared_ptr<ProgramAudioRing> audioRing;
    std::array<OwnedHandle, 2> pendingTextureHandles;
    void* controlView = nullptr;
    std::array<ComPtr<ID3D11Texture2D>, 2> importedTextures;
    std::array<ComPtr<IDXGIKeyedMutex>, 2> keyedMutexes;
    ComPtr<ID3D11DeviceContext> context;
    gs_texture_t* cachedTexture = nullptr;
    ID3D11Texture2D* cachedD3DTexture = nullptr;
    mutable std::mutex graphicsMutex;
    std::atomic<bool> demanded{false};
    std::atomic<bool> retired{false};
    std::atomic<bool> failed{false};
    bool imported = false;
    std::uint64_t lastCopiedFrameSequence = 0;
    std::uint64_t lastFailedFrameSequence = 0;
    std::uint64_t lastProducerDroppedFrames = 0;
    std::atomic<std::uint64_t> videoFramesPresented{0};
    std::atomic<std::uint64_t> videoFramesDropped{0};
    std::atomic<std::uint64_t> lastVideoTimestampNs{0};
};

BridgeProgramTransport::BridgeProgramTransport(std::unique_ptr<Impl> impl) : impl_(std::move(impl)) {}

std::shared_ptr<BridgeProgramTransport>
BridgeProgramTransport::create(const ProgramTransportDescriptor& descriptor) noexcept {
    try {
        auto impl = std::make_unique<Impl>(descriptor);
        if (!impl->stage()) {
            return nullptr;
        }
        return std::shared_ptr<BridgeProgramTransport>(new BridgeProgramTransport(std::move(impl)));
    } catch (...) {
        return nullptr;
    }
}

BridgeProgramTransport::~BridgeProgramTransport() { retire(); }

void BridgeProgramTransport::setDemanded(bool demanded) noexcept {
    impl_->demanded.store(demanded, std::memory_order_release);
}

ProgramVideoInfo BridgeProgramTransport::videoInfo() const noexcept {
    const bool available = !impl_->retired.load(std::memory_order_acquire) &&
                           !impl_->failed.load(std::memory_order_acquire) && impl_->audioRing &&
                           impl_->audioRing->available();
    return {available, impl_->descriptor.video.width, impl_->descriptor.video.height};
}

bool BridgeProgramTransport::renderVideo() noexcept {
    if (!impl_->demanded.load(std::memory_order_acquire) || impl_->retired.load(std::memory_order_acquire) ||
        impl_->failed.load(std::memory_order_acquire)) {
        return false;
    }

    const std::scoped_lock lock(impl_->graphicsMutex);
    if (impl_->retired.load(std::memory_order_acquire) || impl_->failed.load(std::memory_order_acquire) ||
        !impl_->importGraphicsLocked()) {
        return false;
    }

    ProgramVideoControlSnapshot snapshot;
    const ProgramVideoControlReadResult controlResult =
        readProgramVideoControl(impl_->controlView, impl_->descriptor.generation, snapshot);
    if (controlResult == ProgramVideoControlReadResult::Invalid) {
        impl_->failClosedLocked("the Program video control page changed generation or format");
        return false;
    }
    if (controlResult == ProgramVideoControlReadResult::Ready &&
        snapshot.droppedFrameCount > impl_->lastProducerDroppedFrames) {
        impl_->videoFramesDropped.fetch_add(snapshot.droppedFrameCount - impl_->lastProducerDroppedFrames,
                                            std::memory_order_relaxed);
        impl_->lastProducerDroppedFrames = snapshot.droppedFrameCount;
    }

    if (controlResult == ProgramVideoControlReadResult::Ready &&
        snapshot.frameSequence > impl_->lastCopiedFrameSequence) {
        const std::size_t slot = snapshot.latestSlot;
        if (impl_->keyedMutexes[slot]->AcquireSync(1, 0) == S_OK) {
            ProgramVideoControlSnapshot verifiedSnapshot;
            const ProgramVideoControlReadResult verificationResult =
                readProgramVideoControl(impl_->controlView, impl_->descriptor.generation, verifiedSnapshot);
            const bool stillContainsSelectedFrame =
                verificationResult == ProgramVideoControlReadResult::Ready &&
                programVideoSnapshotsMatch(snapshot, verifiedSnapshot);
            if (stillContainsSelectedFrame) {
                impl_->context->CopyResource(impl_->cachedD3DTexture, impl_->importedTextures[slot].Get());
            }
            const HRESULT releaseResult = impl_->keyedMutexes[slot]->ReleaseSync(0);
            if (FAILED(releaseResult)) {
                impl_->failClosedLocked("a Program keyed mutex could not be released");
                return false;
            }
            if (verificationResult == ProgramVideoControlReadResult::Invalid) {
                impl_->failClosedLocked("the Program video control page changed during slot acquisition");
                return false;
            }
            if (stillContainsSelectedFrame) {
                impl_->lastCopiedFrameSequence = snapshot.frameSequence;
                impl_->lastVideoTimestampNs.store(snapshot.monotonicTimestampNs, std::memory_order_relaxed);
                impl_->videoFramesPresented.fetch_add(1, std::memory_order_relaxed);
            } else if (impl_->lastFailedFrameSequence != snapshot.frameSequence) {
                impl_->lastFailedFrameSequence = snapshot.frameSequence;
                impl_->videoFramesDropped.fetch_add(1, std::memory_order_relaxed);
            }
        } else if (impl_->lastFailedFrameSequence != snapshot.frameSequence) {
            impl_->lastFailedFrameSequence = snapshot.frameSequence;
            impl_->videoFramesDropped.fetch_add(1, std::memory_order_relaxed);
        }
    }

    return impl_->drawCachedLocked();
}

std::unique_ptr<ProgramAudioReader> BridgeProgramTransport::createAudioReader() noexcept {
    if (impl_->retired.load(std::memory_order_acquire) || impl_->failed.load(std::memory_order_acquire) ||
        !impl_->audioRing || !impl_->audioRing->available()) {
        return nullptr;
    }
    return impl_->audioRing->createReader();
}

ProgramTransportLease BridgeProgramTransport::lease() const {
    return {impl_->descriptor.transportId, impl_->descriptor.generation};
}

ProgramTransportStats BridgeProgramTransport::stats() const {
    ProgramTransportStats result;
    result.lease = {impl_->descriptor.transportId, impl_->descriptor.generation};
    result.videoFramesPresented = impl_->videoFramesPresented.load(std::memory_order_relaxed);
    result.videoFramesDropped = impl_->videoFramesDropped.load(std::memory_order_relaxed);
    if (impl_->audioRing) {
        const ProgramAudioRingStats audioStats = impl_->audioRing->stats();
        result.audioFramesRead = audioStats.framesRead;
        result.audioUnderruns = audioStats.underruns;
        if (audioStats.lastTimestampNs != 0) {
            result.lastAudioTimestampNs = audioStats.lastTimestampNs;
        }
    }
    const std::uint64_t videoTimestamp = impl_->lastVideoTimestampNs.load(std::memory_order_relaxed);
    if (videoTimestamp != 0) {
        result.lastVideoTimestampNs = videoTimestamp;
    }
    return result;
}

void BridgeProgramTransport::retire() noexcept {
    if (impl_->retired.exchange(true, std::memory_order_acq_rel)) {
        return;
    }
    impl_->demanded.store(false, std::memory_order_release);
    if (impl_->audioRing) {
        impl_->audioRing->retire(impl_->descriptor.generation);
    }

    obs_enter_graphics();
    {
        const std::scoped_lock lock(impl_->graphicsMutex);
        impl_->closePendingTextureHandlesLocked();
        impl_->releaseGraphicsLocked();
        if (impl_->controlView) {
            UnmapViewOfFile(impl_->controlView);
            impl_->controlView = nullptr;
        }
    }
    obs_leave_graphics();
}

} // namespace ilystream
