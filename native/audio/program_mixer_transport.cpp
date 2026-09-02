#include "program_mixer_transport.h"

#include <atomic>
#include <chrono>
#include <cmath>
#include <thread>
#include <utility>

namespace ily::audio {
namespace {

constexpr std::size_t kMaxSources = 64;

std::uint64_t MonotonicNowNs() noexcept {
    return static_cast<std::uint64_t>(std::chrono::duration_cast<std::chrono::nanoseconds>(
        std::chrono::steady_clock::now().time_since_epoch()).count());
}

bool ValidOptions(const ProgramMixerTransportOptions& options) noexcept {
    if (options.sources.empty() || options.sources.size() > kMaxSources ||
        !IsValidSharedAudioRingOptions(options.outputRing) ||
        options.outputRing.channels != 2) return false;
    for (const auto& source : options.sources) {
        if (source.id.empty() || source.id.size() > 128 ||
            !IsValidSharedAudioRingOptions(source.ring) ||
            source.ring.sampleRate != options.outputRing.sampleRate ||
            source.ring.channels != 2 ||
            source.ring.blockFrames != options.outputRing.blockFrames ||
            !std::isfinite(source.gain) || source.gain < 0.0F || source.gain > 2.0F ||
            !std::isfinite(source.pan) || source.pan < -1.0F || source.pan > 1.0F) return false;
    }
    if (options.masterDsp && !IsValidMasterDspConfig(*options.masterDsp)) return false;
    return true;
}

} // namespace

struct ProgramMixerTransport::Impl {
    struct SourceRuntime {
        ProgramMixerTransportSource config;
        std::unique_ptr<SharedAudioRingReader> reader;
        std::vector<float> samples;
        SharedAudioReadStatus readStatus;
    };

    std::vector<SourceRuntime> sources;
    std::unique_ptr<SharedAudioRingWriter> output;
    std::unique_ptr<MasterDsp> masterDsp;
    std::uint32_t blockFrames = 0;
    std::atomic<bool> running{true};
    std::atomic<std::uint64_t> blocksMixed{0};
    std::atomic<std::uint64_t> framesMixed{0};
    std::atomic<std::uint64_t> sourceUnderruns{0};
    std::atomic<std::uint64_t> sourceFramesSkipped{0};
    std::thread worker;

    void Pump() noexcept {
        std::vector<float> outputSamples(static_cast<std::size_t>(blockFrames) * 2);
        std::vector<float> silence(static_cast<std::size_t>(blockFrames) * 2, 0.0F);
        std::vector<StereoMixInput> inputs;
        inputs.reserve(sources.size());
        while (running.load(std::memory_order_acquire)) {
            auto& clockSource = sources.front();
            const auto clockResult = clockSource.reader->Read(
                blockFrames, clockSource.samples, clockSource.readStatus);
            if (clockResult == SharedAudioReadResult::noData) {
                std::this_thread::sleep_for(std::chrono::milliseconds(1));
                continue;
            }
            if (clockResult == SharedAudioReadResult::closed ||
                clockResult == SharedAudioReadResult::error) break;
            const std::size_t frames = clockSource.samples.size() / 2;
            if (frames == 0 || frames > blockFrames) break;

            inputs.clear();
            inputs.push_back({clockSource.samples.data(), frames, clockSource.config.gain,
                clockSource.config.pan, clockSource.config.mono});
            const auto secondaryDeadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(5);
            for (std::size_t index = 1; index < sources.size(); ++index) {
                auto& source = sources[index];
                const std::uint64_t skippedBefore = source.readStatus.framesSkipped;
                auto result = source.reader->Read(frames, source.samples, source.readStatus);
                while (result == SharedAudioReadResult::noData &&
                       std::chrono::steady_clock::now() < secondaryDeadline &&
                       running.load(std::memory_order_acquire)) {
                    std::this_thread::sleep_for(std::chrono::microseconds(200));
                    result = source.reader->Read(frames, source.samples, source.readStatus);
                }
                if (source.readStatus.framesSkipped > skippedBefore) {
                    sourceFramesSkipped.fetch_add(
                        source.readStatus.framesSkipped - skippedBefore, std::memory_order_relaxed);
                }
                const bool usable = result == SharedAudioReadResult::data &&
                    source.samples.size() == frames * 2;
                if (!usable) sourceUnderruns.fetch_add(1, std::memory_order_relaxed);
                const float* samples = usable ? source.samples.data() : silence.data();
                inputs.push_back({samples, frames, source.config.gain,
                    source.config.pan, source.config.mono});
            }
            if (!MixStereoProgram(inputs, frames, outputSamples.data())) break;
            if (masterDsp && !masterDsp->Process(outputSamples.data(), frames)) break;
            const std::uint64_t durationNs = static_cast<std::uint64_t>(frames) *
                1000000000ULL / sources.front().config.ring.sampleRate;
            const std::uint64_t nowNs = MonotonicNowNs();
            const std::uint64_t timestampNs = nowNs > durationNs ? nowNs - durationNs : 1;
            if (!output->Publish(outputSamples.data(), frames * 2, timestampNs)) break;
            blocksMixed.fetch_add(1, std::memory_order_relaxed);
            framesMixed.fetch_add(frames, std::memory_order_relaxed);
        }
        running.store(false, std::memory_order_release);
    }
};

ProgramMixerTransport::ProgramMixerTransport(std::unique_ptr<Impl> impl)
    : m_impl(std::move(impl)) {}
ProgramMixerTransport::~ProgramMixerTransport() { Stop(); }

std::unique_ptr<ProgramMixerTransport> ProgramMixerTransport::Start(
    const ProgramMixerTransportOptions& options, std::string& error) {
    if (!ValidOptions(options)) { error = "Invalid Program mixer transport options"; return nullptr; }
    auto impl = std::make_unique<Impl>();
    impl->blockFrames = options.outputRing.blockFrames;
    if (options.masterDsp) impl->masterDsp = std::make_unique<MasterDsp>(*options.masterDsp);
    for (const auto& source : options.sources) {
        std::string openError;
        auto reader = SharedAudioRingReader::Open(source.ring, openError);
        if (!reader) { error = "Could not open mixer source " + source.id + ": " + openError; return nullptr; }
        impl->sources.push_back({source, std::move(reader), {}, {}});
    }
    impl->output = SharedAudioRingWriter::Create(options.outputRing, error);
    if (!impl->output) return nullptr;
    auto result = std::unique_ptr<ProgramMixerTransport>(new ProgramMixerTransport(std::move(impl)));
    result->m_impl->worker = std::thread([state = result->m_impl.get()] { state->Pump(); });
    error.clear();
    return result;
}

ProgramMixerTransportStatus ProgramMixerTransport::GetStatus() const noexcept {
    if (!m_impl) return {};
    return {m_impl->running.load(std::memory_order_acquire),
        m_impl->blocksMixed.load(std::memory_order_relaxed),
        m_impl->framesMixed.load(std::memory_order_relaxed),
        m_impl->sourceUnderruns.load(std::memory_order_relaxed),
        m_impl->sourceFramesSkipped.load(std::memory_order_relaxed),
        m_impl->masterDsp ? m_impl->masterDsp->GetStatus() : MasterDspStatus{}};
}

ProgramMixerTransportStatus ProgramMixerTransport::Stop() noexcept {
    if (!m_impl) return {};
    m_impl->running.store(false, std::memory_order_release);
    if (m_impl->worker.joinable()) m_impl->worker.join();
    const auto status = GetStatus();
    m_impl->output->Close();
    for (auto& source : m_impl->sources) source.reader->Close();
    m_impl.reset();
    return status;
}

} // namespace ily::audio
