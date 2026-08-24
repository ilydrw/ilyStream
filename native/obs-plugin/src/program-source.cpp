// SPDX-License-Identifier: GPL-2.0-or-later
#include "program-source.hpp"

#include "program-audio-ring-reader.hpp"
#include "program-transport.hpp"

#include <obs-module.h>

#include <algorithm>
#include <atomic>
#include <cstring>
#include <memory>
#include <utility>

namespace ilystream {
namespace {

constexpr std::uint32_t kFallbackWidth = 1920;
constexpr std::uint32_t kFallbackHeight = 1080;
static_assert(kProgramAudioOutputFrames == AUDIO_OUTPUT_FRAMES);

struct ProgramSource {
    explicit ProgramSource(obs_source_t* sourceValue)
        : source(sourceValue), hub(sharedProgramTransportHub()), consumer(hub->attachConsumer()) {
        obs_video_info videoInfo{};
        if (obs_get_video_info(&videoInfo)) {
            width.store(videoInfo.base_width > 0 ? videoInfo.base_width : kFallbackWidth, std::memory_order_relaxed);
            height.store(videoInfo.base_height > 0 ? videoInfo.base_height : kFallbackHeight, std::memory_order_relaxed);
        }
    }

    void refreshVideoInfo(const std::shared_ptr<ProgramTransport>& transport) {
        if (!transport) {
            return;
        }

        const ProgramVideoInfo info = transport->videoInfo();
        if (!info.available || info.width == 0 || info.height == 0) {
            return;
        }
        width.store(info.width, std::memory_order_relaxed);
        height.store(info.height, std::memory_order_relaxed);
    }

    ProgramAudioReader* audioReaderFor(const std::shared_ptr<ProgramTransport>& transport) {
        if (audioTransport != transport) {
            audioReader.reset();
            audioTransport = transport;
            if (audioTransport) {
                audioReader = audioTransport->createAudioReader();
            }
        }
        return audioReader.get();
    }

    obs_source_t* source = nullptr;
    std::shared_ptr<ProgramTransportHub> hub;
    ProgramTransportConsumer consumer;
    std::shared_ptr<ProgramTransport> audioTransport;
    std::unique_ptr<ProgramAudioReader> audioReader;
    std::atomic<std::uint32_t> width{kFallbackWidth};
    std::atomic<std::uint32_t> height{kFallbackHeight};
};

const char* programSourceName(void*) { return obs_module_text("Source.Program.Name"); }

void* programSourceCreate(obs_data_t*, obs_source_t* source) {
    try {
        return new ProgramSource(source);
    } catch (...) {
        blog(LOG_ERROR, "[ilyStream Program] Could not allocate source state");
        return nullptr;
    }
}

void programSourceDestroy(void* data) { delete static_cast<ProgramSource*>(data); }

std::uint32_t programSourceWidth(void* data) {
    auto* program = static_cast<ProgramSource*>(data);
    if (!program) {
        return kFallbackWidth;
    }

    program->refreshVideoInfo(program->hub->transport());
    return program->width.load(std::memory_order_relaxed);
}

std::uint32_t programSourceHeight(void* data) {
    auto* program = static_cast<ProgramSource*>(data);
    if (!program) {
        return kFallbackHeight;
    }

    program->refreshVideoInfo(program->hub->transport());
    return program->height.load(std::memory_order_relaxed);
}

void programSourceActivate(void* data) {
    if (auto* program = static_cast<ProgramSource*>(data)) {
        program->consumer.setActive(true);
    }
}

void programSourceDeactivate(void* data) {
    if (auto* program = static_cast<ProgramSource*>(data)) {
        program->consumer.setActive(false);
    }
}

void programSourceShow(void* data) {
    if (auto* program = static_cast<ProgramSource*>(data)) {
        program->consumer.setVisible(true);
    }
}

void programSourceHide(void* data) {
    if (auto* program = static_cast<ProgramSource*>(data)) {
        program->consumer.setVisible(false);
    }
}

void programSourceRender(void* data, gs_effect_t*) {
    auto* program = static_cast<ProgramSource*>(data);
    if (!program) {
        return;
    }

    const auto transport = program->hub->transport();
    const ProgramVideoInfo info = transport ? transport->videoInfo() : ProgramVideoInfo{};
    if (!info.available) {
        return;
    }

    program->refreshVideoInfo(transport);
    (void)transport->renderVideo();
}

bool programSourceAudioRender(void* data, std::uint64_t* timestampOut, obs_source_audio_mix* audioOutput,
                              std::uint32_t mixers, std::size_t channels, std::size_t sampleRate) {
    auto* program = static_cast<ProgramSource*>(data);
    if (!program || !timestampOut || !audioOutput || channels == 0 || channels > kProgramAudioMaxChannels) {
        return false;
    }

    const auto transport = program->hub->transport();
    ProgramAudioReader* reader = program->audioReaderFor(transport);
    if (!reader) {
        return false;
    }

    ProgramAudioBlockView block;
    if (!reader->read(static_cast<std::uint32_t>(sampleRate), channels, AUDIO_OUTPUT_FRAMES, block) ||
        block.timestampNs == 0 || block.frameCount != AUDIO_OUTPUT_FRAMES || block.channelCount == 0 ||
        block.channelCount > kProgramAudioMaxChannels) {
        return false;
    }

    const std::size_t copyChannels = std::min(channels, block.channelCount);
    for (std::size_t channel = 0; channel < copyChannels; ++channel) {
        if (!block.planes[channel]) {
            return false;
        }
    }

    for (std::size_t mix = 0; mix < MAX_AUDIO_MIXES; ++mix) {
        if ((mixers & (1U << mix)) == 0) {
            continue;
        }

        for (std::size_t channel = 0; channel < channels; ++channel) {
            float* output = audioOutput->output[mix].data[channel];
            if (!output) {
                continue;
            }
            if (channel < copyChannels) {
                std::memcpy(output, block.planes[channel], AUDIO_OUTPUT_FRAMES * sizeof(float));
            } else {
                std::memset(output, 0, AUDIO_OUTPUT_FRAMES * sizeof(float));
            }
        }
    }

    *timestampOut = block.timestampNs;
    return true;
}

obs_source_info makeProgramSourceInfo() {
    obs_source_info info{};
    info.id = kProgramSourceId;
    info.type = OBS_SOURCE_TYPE_INPUT;
    info.output_flags = OBS_SOURCE_VIDEO | OBS_SOURCE_AUDIO | OBS_SOURCE_CUSTOM_DRAW | OBS_SOURCE_SRGB;
    info.get_name = programSourceName;
    info.create = programSourceCreate;
    info.destroy = programSourceDestroy;
    info.get_width = programSourceWidth;
    info.get_height = programSourceHeight;
    info.activate = programSourceActivate;
    info.deactivate = programSourceDeactivate;
    info.show = programSourceShow;
    info.hide = programSourceHide;
    info.video_render = programSourceRender;
    info.audio_render = programSourceAudioRender;
    return info;
}

obs_source_info programSourceInfo = makeProgramSourceInfo();

} // namespace

void registerProgramSource() { obs_register_source(&programSourceInfo); }

} // namespace ilystream
