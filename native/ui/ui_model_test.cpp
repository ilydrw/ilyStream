#include "ui_model.h"

#include <catch2/catch_test_macros.hpp>

TEST_CASE("native UI starts on the health center") {
    const auto state = ily::ui::CreateInitialState();
    CHECK(state.screen == ily::ui::Screen::HealthCenter);
    CHECK(state.windowOpen);
    CHECK(state.audioBackend == "auto");
    CHECK(state.revision == 0);
}

TEST_CASE("native UI reducer owns navigation and refresh state") {
    auto state = ily::ui::CreateInitialState();
    state = ily::ui::Reduce(state, {ily::ui::Command::ShowAudioSetup, ""});
    CHECK(state.screen == ily::ui::Screen::AudioSetup);
    CHECK(state.revision == 1);

    state = ily::ui::Reduce(state, {ily::ui::Command::RefreshHealth, ""});
    CHECK(state.refreshRequested);
    CHECK(state.statusMessage == "Refreshing native health data");
    CHECK(state.revision == 2);
}

TEST_CASE("native UI rejects unsupported audio backends") {
    auto state = ily::ui::CreateInitialState();
    state = ily::ui::Reduce(state, {ily::ui::Command::SelectAudioBackend, "coreaudio"});
    CHECK(state.audioBackend == "coreaudio");
    CHECK(state.statusMessage.empty());

    state = ily::ui::Reduce(state, {ily::ui::Command::SelectAudioBackend, "alsa2"});
    CHECK(state.audioBackend == "coreaudio");
    CHECK(state.statusMessage == "Unsupported audio backend");
}

TEST_CASE("native UI close command is deterministic") {
    auto state = ily::ui::CreateInitialState();
    state = ily::ui::Reduce(state, {ily::ui::Command::Close, ""});
    CHECK_FALSE(state.windowOpen);
    CHECK(state.revision == 1);
}
