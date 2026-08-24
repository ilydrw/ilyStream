// SPDX-License-Identifier: GPL-2.0-or-later
#include "obs-state.hpp"

#include <obs.h>
#include <util/bmem.h>

namespace ilystream {
namespace {

QString takeObsString(char* value) {
    if (!value) {
        return {};
    }

    const QString result = QString::fromUtf8(value);
    bfree(value);
    return result;
}

} // namespace

QJsonObject ObsState::toJson() const {
    return {
        {QStringLiteral("currentScene"), currentScene},
        {QStringLiteral("profile"), profile},
        {QStringLiteral("sceneCollection"), sceneCollection},
        {QStringLiteral("streaming"), streaming},
        {QStringLiteral("recording"), recording},
        {QStringLiteral("recordingPaused"), recordingPaused},
        {QStringLiteral("replayBuffer"), replayBuffer},
        {QStringLiteral("virtualCamera"), virtualCamera},
        {QStringLiteral("studioMode"), studioMode},
    };
}

ObsState captureObsState() {
    ObsState state;

    if (obs_source_t* scene = obs_frontend_get_current_scene()) {
        state.currentScene = QString::fromUtf8(obs_source_get_name(scene));
        obs_source_release(scene);
    }

    state.profile = takeObsString(obs_frontend_get_current_profile());
    state.sceneCollection = takeObsString(obs_frontend_get_current_scene_collection());
    state.streaming = obs_frontend_streaming_active();
    state.recording = obs_frontend_recording_active();
    state.recordingPaused = state.recording && obs_frontend_recording_paused();
    state.replayBuffer = obs_frontend_replay_buffer_active();
    state.virtualCamera = obs_frontend_virtualcam_active();
    state.studioMode = obs_frontend_preview_program_mode_active();

    return state;
}

QString frontendEventName(obs_frontend_event event) {
    switch (event) {
    case OBS_FRONTEND_EVENT_STREAMING_STARTING:
        return QStringLiteral("streaming.starting");
    case OBS_FRONTEND_EVENT_STREAMING_STARTED:
        return QStringLiteral("streaming.started");
    case OBS_FRONTEND_EVENT_STREAMING_STOPPING:
        return QStringLiteral("streaming.stopping");
    case OBS_FRONTEND_EVENT_STREAMING_STOPPED:
        return QStringLiteral("streaming.stopped");
    case OBS_FRONTEND_EVENT_RECORDING_STARTING:
        return QStringLiteral("recording.starting");
    case OBS_FRONTEND_EVENT_RECORDING_STARTED:
        return QStringLiteral("recording.started");
    case OBS_FRONTEND_EVENT_RECORDING_STOPPING:
        return QStringLiteral("recording.stopping");
    case OBS_FRONTEND_EVENT_RECORDING_STOPPED:
        return QStringLiteral("recording.stopped");
    case OBS_FRONTEND_EVENT_SCENE_CHANGED:
        return QStringLiteral("scene.changed");
    case OBS_FRONTEND_EVENT_SCENE_LIST_CHANGED:
        return QStringLiteral("sceneList.changed");
    case OBS_FRONTEND_EVENT_TRANSITION_CHANGED:
        return QStringLiteral("transition.changed");
    case OBS_FRONTEND_EVENT_TRANSITION_STOPPED:
        return QStringLiteral("transition.stopped");
    case OBS_FRONTEND_EVENT_TRANSITION_LIST_CHANGED:
        return QStringLiteral("transitionList.changed");
    case OBS_FRONTEND_EVENT_SCENE_COLLECTION_CHANGED:
        return QStringLiteral("sceneCollection.changed");
    case OBS_FRONTEND_EVENT_SCENE_COLLECTION_LIST_CHANGED:
        return QStringLiteral("sceneCollectionList.changed");
    case OBS_FRONTEND_EVENT_PROFILE_CHANGED:
        return QStringLiteral("profile.changed");
    case OBS_FRONTEND_EVENT_PROFILE_LIST_CHANGED:
        return QStringLiteral("profileList.changed");
    case OBS_FRONTEND_EVENT_EXIT:
        return QStringLiteral("obs.exiting");
    case OBS_FRONTEND_EVENT_REPLAY_BUFFER_STARTING:
        return QStringLiteral("replayBuffer.starting");
    case OBS_FRONTEND_EVENT_REPLAY_BUFFER_STARTED:
        return QStringLiteral("replayBuffer.started");
    case OBS_FRONTEND_EVENT_REPLAY_BUFFER_STOPPING:
        return QStringLiteral("replayBuffer.stopping");
    case OBS_FRONTEND_EVENT_REPLAY_BUFFER_STOPPED:
        return QStringLiteral("replayBuffer.stopped");
    case OBS_FRONTEND_EVENT_STUDIO_MODE_ENABLED:
        return QStringLiteral("studioMode.enabled");
    case OBS_FRONTEND_EVENT_STUDIO_MODE_DISABLED:
        return QStringLiteral("studioMode.disabled");
    case OBS_FRONTEND_EVENT_PREVIEW_SCENE_CHANGED:
        return QStringLiteral("previewScene.changed");
    case OBS_FRONTEND_EVENT_SCENE_COLLECTION_CLEANUP:
        return QStringLiteral("sceneCollection.cleanup");
    case OBS_FRONTEND_EVENT_FINISHED_LOADING:
        return QStringLiteral("obs.loaded");
    case OBS_FRONTEND_EVENT_RECORDING_PAUSED:
        return QStringLiteral("recording.paused");
    case OBS_FRONTEND_EVENT_RECORDING_UNPAUSED:
        return QStringLiteral("recording.unpaused");
    case OBS_FRONTEND_EVENT_TRANSITION_DURATION_CHANGED:
        return QStringLiteral("transitionDuration.changed");
    case OBS_FRONTEND_EVENT_REPLAY_BUFFER_SAVED:
        return QStringLiteral("replayBuffer.saved");
    case OBS_FRONTEND_EVENT_VIRTUALCAM_STARTED:
        return QStringLiteral("virtualCamera.started");
    case OBS_FRONTEND_EVENT_VIRTUALCAM_STOPPED:
        return QStringLiteral("virtualCamera.stopped");
    case OBS_FRONTEND_EVENT_TBAR_VALUE_CHANGED:
        return QStringLiteral("transitionBar.changed");
    case OBS_FRONTEND_EVENT_SCENE_COLLECTION_CHANGING:
        return QStringLiteral("sceneCollection.changing");
    case OBS_FRONTEND_EVENT_PROFILE_CHANGING:
        return QStringLiteral("profile.changing");
    case OBS_FRONTEND_EVENT_SCRIPTING_SHUTDOWN:
        return QStringLiteral("scripting.shutdown");
    case OBS_FRONTEND_EVENT_PROFILE_RENAMED:
        return QStringLiteral("profile.renamed");
    case OBS_FRONTEND_EVENT_SCENE_COLLECTION_RENAMED:
        return QStringLiteral("sceneCollection.renamed");
    case OBS_FRONTEND_EVENT_THEME_CHANGED:
        return QStringLiteral("theme.changed");
    case OBS_FRONTEND_EVENT_SCREENSHOT_TAKEN:
        return QStringLiteral("screenshot.taken");
    case OBS_FRONTEND_EVENT_CANVAS_ADDED:
        return QStringLiteral("canvas.added");
    case OBS_FRONTEND_EVENT_CANVAS_REMOVED:
        return QStringLiteral("canvas.removed");
    }

    return QStringLiteral("unknown.%1").arg(static_cast<int>(event));
}

} // namespace ilystream
