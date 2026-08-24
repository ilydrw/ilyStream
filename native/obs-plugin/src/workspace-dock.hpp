// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once

#include "bridge-client.hpp"
#include "obs-state.hpp"

#include <QJsonObject>
#include <QWidget>

#include <functional>

class QLabel;
class QPushButton;
class QVBoxLayout;

namespace ilystream {

enum class WorkspacePlacement {
    Left,
    Right,
    Top,
    Bottom,
    Floating,
};

class WorkspaceDock final : public QWidget {
  public:
    WorkspaceDock(std::function<void()> openApp, std::function<void()> reconnect,
                  std::function<void()> toggleFullscreen, std::function<void(WorkspacePlacement)> placeWorkspace,
                  std::function<void()> closeWorkspace, QWidget* parent = nullptr);

    void setBridgeStatus(BridgeStatus status, const QString& detail);
    void setObsState(const ObsState& state);
    void setIlyStreamSnapshot(const QJsonObject& snapshot);
    void setNotice(const QString& notice);
    void setFullscreenActive(bool active);

  private:
    QLabel* addStatusRow(QVBoxLayout* layout, const QString& title);

    QLabel* connectionDot_ = nullptr;
    QLabel* connectionValue_ = nullptr;
    QLabel* connectionDetail_ = nullptr;
    QLabel* sceneValue_ = nullptr;
    QLabel* streamValue_ = nullptr;
    QLabel* recordingValue_ = nullptr;
    QLabel* virtualCameraValue_ = nullptr;
    QLabel* ilyStreamValue_ = nullptr;
    QPushButton* reconnectButton_ = nullptr;
    QPushButton* fullscreenButton_ = nullptr;
};

} // namespace ilystream
