#pragma once

#include "ui_model.h"

#include <string>

namespace ily::ui {

/**
 * Run the platform-native UI window until it is closed.
 *
 * This is intentionally a small blocking entry point for the standalone UI
 * pilot. The Electron host can launch it as a child process while the rest of
 * the application continues using the existing renderer.
 */
bool RunNativeWindow(const UiState& initialState, std::string& error);

} // namespace ily::ui
