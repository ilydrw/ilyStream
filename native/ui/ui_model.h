#pragma once

#include <cstdint>
#include <string>

namespace ily::ui {

/**
 * Dependency-free state shared by the platform-native UI implementations.
 * Rendering is deliberately separate so Win32, Cocoa and X11/Wayland can
 * present the same state without introducing a cross-platform UI toolkit.
 */
enum class Screen : std::uint8_t {
    HealthCenter = 0,
    AudioSetup = 1,
};

enum class Command : std::uint8_t {
    ShowHealthCenter = 0,
    ShowAudioSetup = 1,
    RefreshHealth = 2,
    SelectAudioBackend = 3,
    Close = 4,
};

struct UiState {
    Screen screen = Screen::HealthCenter;
    bool windowOpen = true;
    bool refreshRequested = false;
    std::string audioBackend = "auto";
    std::string statusMessage;
    std::uint32_t connectedServices = 0;
    std::uint32_t readyServices = 0;
    std::uint32_t needsReview = 0;
    std::uint32_t realTraffic = 0;
    std::uint64_t revision = 0;
};

struct UiCommand {
    Command type = Command::ShowHealthCenter;
    std::string value;
};

UiState CreateInitialState();

/** Apply one user/system command and return the next immutable state. */
UiState Reduce(const UiState& state, const UiCommand& command);

/** Restrict backend choices to the native audio contract. */
bool IsSupportedAudioBackend(const std::string& backend);

const char* ScreenName(Screen screen) noexcept;

} // namespace ily::ui
