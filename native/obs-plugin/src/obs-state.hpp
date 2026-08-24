// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once

#include <QJsonObject>
#include <QString>

#include <obs-frontend-api.h>

namespace ilystream {

struct ObsState {
    QString currentScene;
    QString profile;
    QString sceneCollection;
    bool streaming = false;
    bool recording = false;
    bool recordingPaused = false;
    bool replayBuffer = false;
    bool virtualCamera = false;
    bool studioMode = false;

    QJsonObject toJson() const;
};

ObsState captureObsState();
QString frontendEventName(obs_frontend_event event);

} // namespace ilystream
