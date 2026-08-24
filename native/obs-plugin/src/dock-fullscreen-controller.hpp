// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once

#include <QObject>
#include <QByteArray>
#include <QPointer>

#include <functional>

class QAction;
class QDockWidget;
class QMainWindow;

namespace ilystream {

class DockFullscreenController final : public QObject {
  public:
    using StateHandler = std::function<void(bool)>;

    DockFullscreenController(QMainWindow* mainWindow, QDockWidget* dock, QObject* parent = nullptr);
    ~DockFullscreenController() override;

    void setStateHandler(StateHandler handler);
    [[nodiscard]] bool isFullscreen() const;
    [[nodiscard]] bool toggleFullscreen();
    [[nodiscard]] bool enterFullscreen();
    void exitFullscreen();
    [[nodiscard]] bool placeDock(Qt::DockWidgetArea area);
    [[nodiscard]] bool floatDock();
    [[nodiscard]] bool closeDock();

  protected:
    bool eventFilter(QObject* watched, QEvent* event) override;

  private:
    using CompletionHandler = std::function<void()>;

    [[nodiscard]] bool requestDockPlacement(Qt::DockWidgetArea area, bool keepVisible, bool preserveSavedSlot,
                                            CompletionHandler completion = {});
    void leaveFullscreenPresentation();
    void restoreFromFullscreen(bool keepVisible, CompletionHandler completion = {});
    void setDockVisible(bool visible);
    void notifyState();

    QPointer<QMainWindow> mainWindow_;
    QPointer<QDockWidget> dock_;
    QAction* escapeAction_ = nullptr;
    StateHandler stateHandler_;
    QByteArray restoreGeometry_;
    Qt::WindowStates restoreWindowState_ = Qt::WindowNoState;
    Qt::DockWidgetArea restoreDockArea_ = Qt::NoDockWidgetArea;
    bool restoreWasFloating_ = false;
    bool fullscreen_ = false;
    bool transitioning_ = false;
    bool mainWindowClosePending_ = false;
    quint64 placementGeneration_ = 0;
};

} // namespace ilystream
