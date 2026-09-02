#include "ui_model.h"

#include <array>

namespace ily::ui {

namespace {
constexpr std::array<const char*, 6> kAudioBackends = {
    "auto", "wasapi", "coreaudio", "pulse", "alsa", "jack"
};
}

UiState CreateInitialState() {
    return {};
}

bool IsSupportedAudioBackend(const std::string& backend) {
    for (const char* candidate : kAudioBackends) {
        if (backend == candidate) return true;
    }
    return false;
}

UiState Reduce(const UiState& state, const UiCommand& command) {
    UiState next = state;
    next.revision = state.revision + 1;

    switch (command.type) {
    case Command::ShowHealthCenter:
        next.screen = Screen::HealthCenter;
        next.statusMessage.clear();
        break;
    case Command::ShowAudioSetup:
        next.screen = Screen::AudioSetup;
        next.statusMessage.clear();
        break;
    case Command::RefreshHealth:
        next.refreshRequested = true;
        next.statusMessage = "Refreshing native health data";
        break;
    case Command::SelectAudioBackend:
        if (IsSupportedAudioBackend(command.value)) {
            next.audioBackend = command.value;
            next.statusMessage.clear();
        } else {
            next.statusMessage = "Unsupported audio backend";
        }
        break;
    case Command::Close:
        next.windowOpen = false;
        break;
    }

    return next;
}

const char* ScreenName(Screen screen) noexcept {
    switch (screen) {
    case Screen::HealthCenter: return "health-center";
    case Screen::AudioSetup: return "audio-setup";
    }
    return "health-center";
}

} // namespace ily::ui
