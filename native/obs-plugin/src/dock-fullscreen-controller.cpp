// SPDX-License-Identifier: GPL-2.0-or-later
#include "dock-fullscreen-controller.hpp"

#include <QAction>
#include <QDockWidget>
#include <QEvent>
#include <QKeySequence>
#include <QLayout>
#include <QMainWindow>
#include <QTimer>

#include <utility>

namespace ilystream {
namespace {

bool setFloatingPreservingFeatures(QDockWidget* dock, bool floating) {
    dock->setFloating(floating);
    if (dock->isFloating() == floating) {
        return true;
    }

    // Qt can reject a programmatic top-level transition while OBS has applied
    // NoDockWidgetFeatures. Broaden this dock's features only for the synchronous
    // transition, then restore the exact current value so Lock Docks still wins.
    const QDockWidget::DockWidgetFeatures features = dock->features();
    dock->setFeatures(features | QDockWidget::DockWidgetMovable | QDockWidget::DockWidgetFloatable);
    dock->setFloating(floating);
    dock->setFeatures(features);
    return dock->isFloating() == floating;
}

class DockAnimationGuard final {
  public:
    explicit DockAnimationGuard(QMainWindow* mainWindow) : mainWindow_(mainWindow) {
        if (!mainWindow_) {
            return;
        }

        animated_ = mainWindow_->dockOptions().testFlag(QMainWindow::AnimatedDocks);
        if (animated_) {
            mainWindow_->setDockOptions(mainWindow_->dockOptions() & ~QMainWindow::AnimatedDocks);
        }
    }

    ~DockAnimationGuard() {
        if (mainWindow_ && animated_) {
            mainWindow_->setDockOptions(mainWindow_->dockOptions() | QMainWindow::AnimatedDocks);
        }
    }

  private:
    QPointer<QMainWindow> mainWindow_;
    bool animated_ = false;
};

} // namespace

DockFullscreenController::DockFullscreenController(QMainWindow* mainWindow, QDockWidget* dock, QObject* parent)
    : QObject(parent), mainWindow_(mainWindow), dock_(dock) {
    if (!dock_) {
        return;
    }

    // OBS owns the persistent dock features and applies its global Lock Docks
    // setting. Keep that state intact and allow deliberate placement in every
    // standard dock area.
    dock_->setAllowedAreas(Qt::AllDockWidgetAreas);
    dock_->installEventFilter(this);
    connect(dock_, &QDockWidget::featuresChanged, this, [this]() {
        if (dock_ && dock_->toggleViewAction()) {
            dock_->toggleViewAction()->setEnabled(true);
        }
    });
    if (mainWindow_) {
        mainWindow_->installEventFilter(this);
    }

    escapeAction_ = new QAction(this);
    escapeAction_->setObjectName(QStringLiteral("com.ilystream.obs.action.exit-workspace-fullscreen"));
    escapeAction_->setShortcut(QKeySequence(Qt::Key_Escape));
    escapeAction_->setShortcutContext(Qt::WindowShortcut);
    escapeAction_->setAutoRepeat(false);
    escapeAction_->setEnabled(false);
    dock_->addAction(escapeAction_);
    connect(escapeAction_, &QAction::triggered, this, [this]() { exitFullscreen(); });
}

DockFullscreenController::~DockFullscreenController() {
    ++placementGeneration_;
    if (mainWindow_) {
        mainWindow_->removeEventFilter(this);
    }
    if (dock_) {
        if (fullscreen_) {
            fullscreen_ = false;
            dock_->showNormal();
            if (!restoreWasFloating_ && mainWindow_ && restoreDockArea_ != Qt::NoDockWidgetArea) {
                DockAnimationGuard guard(mainWindow_);
                (void)setFloatingPreservingFeatures(dock_, false);
            }
            dock_->hide();
        }
        dock_->removeEventFilter(this);
        if (escapeAction_) {
            dock_->removeAction(escapeAction_);
        }
    }
}

void DockFullscreenController::setStateHandler(StateHandler handler) {
    stateHandler_ = std::move(handler);
    notifyState();
}

bool DockFullscreenController::isFullscreen() const { return fullscreen_; }

bool DockFullscreenController::toggleFullscreen() {
    if (fullscreen_) {
        exitFullscreen();
        return false;
    }
    return enterFullscreen();
}

bool DockFullscreenController::enterFullscreen() {
    if (fullscreen_) {
        return true;
    }
    if (!mainWindow_ || !dock_) {
        return false;
    }

    transitioning_ = true;
    ++placementGeneration_;
    restoreWasFloating_ = dock_->isFloating();
    restoreDockArea_ = mainWindow_->dockWidgetArea(dock_);
    restoreWindowState_ = dock_->windowState() & ~Qt::WindowFullScreen & ~Qt::WindowMinimized;
    restoreGeometry_ = restoreWasFloating_ ? dock_->saveGeometry() : QByteArray();
    dock_->show();
    if (!setFloatingPreservingFeatures(dock_, true)) {
        transitioning_ = false;
        return false;
    }

    dock_->showFullScreen();
    if (!dock_->isFullScreen()) {
        fullscreen_ = true;
        restoreFromFullscreen(true);
        return false;
    }

    fullscreen_ = true;
    transitioning_ = false;
    dock_->raise();
    dock_->activateWindow();
    notifyState();
    return true;
}

void DockFullscreenController::exitFullscreen() {
    if (fullscreen_) {
        restoreFromFullscreen(true);
    }
}

bool DockFullscreenController::placeDock(Qt::DockWidgetArea area) {
    if (!mainWindow_ || !dock_ ||
        (area != Qt::LeftDockWidgetArea && area != Qt::RightDockWidgetArea && area != Qt::TopDockWidgetArea &&
         area != Qt::BottomDockWidgetArea)) {
        return false;
    }

    if (fullscreen_) {
        leaveFullscreenPresentation();
    }
    return requestDockPlacement(area, true, false);
}

bool DockFullscreenController::floatDock() {
    if (!dock_) {
        return false;
    }

    if (fullscreen_) {
        leaveFullscreenPresentation();
    }

    const quint64 generation = ++placementGeneration_;
    QTimer::singleShot(0, this, [this, generation]() {
        if (generation != placementGeneration_ || !dock_) {
            return;
        }

        DockAnimationGuard guard(mainWindow_);
        dock_->showNormal();
        (void)setFloatingPreservingFeatures(dock_, true);
        setDockVisible(true);
    });
    return true;
}

bool DockFullscreenController::closeDock() {
    if (!dock_) {
        return false;
    }

    if (fullscreen_) {
        restoreFromFullscreen(false, [this]() {
            if (dock_) {
                dock_->close();
            }
        });
        return true;
    }
    return dock_->close();
}

bool DockFullscreenController::eventFilter(QObject* watched, QEvent* event) {
    if (watched == mainWindow_ && event->type() == QEvent::Close) {
        if (mainWindowClosePending_) {
            event->ignore();
            return true;
        }
        if (fullscreen_ && !transitioning_) {
            mainWindowClosePending_ = true;
            // Consuming an accepted QCloseEvent is not enough to cancel
            // QWidget::close(); explicitly reject this first attempt while the
            // asynchronous dock restoration completes.
            event->ignore();
            // OBS may reject or defer its close confirmation while an output is
            // active. Restore the dock visibly before retrying so a cancelled
            // OBS close cannot leave the workspace hidden.
            restoreFromFullscreen(true, [this]() {
                mainWindowClosePending_ = false;
                if (mainWindow_) {
                    mainWindow_->close();
                }
            });
            return true;
        }
    }
    if (watched == dock_ && fullscreen_ && !transitioning_) {
        if (event->type() == QEvent::Close || event->type() == QEvent::Hide) {
            restoreFromFullscreen(false);
        } else if (event->type() == QEvent::WindowStateChange && dock_ && !dock_->isFullScreen()) {
            restoreFromFullscreen(dock_->isVisible());
        }
    }

    return QObject::eventFilter(watched, event);
}

bool DockFullscreenController::requestDockPlacement(Qt::DockWidgetArea area, bool keepVisible, bool preserveSavedSlot,
                                                    CompletionHandler completion) {
    if (!mainWindow_ || !dock_) {
        if (completion) {
            completion();
        }
        return false;
    }

    const quint64 generation = ++placementGeneration_;
    dock_->hide();
    QTimer::singleShot(
        0, this,
        [this, area, keepVisible, preserveSavedSlot, completion = std::move(completion), generation]() mutable {
            if (generation != placementGeneration_ || !mainWindow_ || !dock_) {
                return;
            }

            DockAnimationGuard guard(mainWindow_);
            bool docked = false;

            if (preserveSavedSlot) {
                docked = setFloatingPreservingFeatures(dock_, false) && mainWindow_->dockWidgetArea(dock_) == area;
            }
            if (!docked) {
                dock_->hide();
                mainWindow_->removeDockWidget(dock_);
                mainWindow_->addDockWidget(area, dock_);
                docked = setFloatingPreservingFeatures(dock_, false) && mainWindow_->dockWidgetArea(dock_) == area;
            }

            if (mainWindow_->layout()) {
                mainWindow_->layout()->activate();
            }

            setDockVisible(keepVisible);
            if (completion) {
                completion();
            }
        });
    return true;
}

void DockFullscreenController::leaveFullscreenPresentation() {
    if (!dock_ || !fullscreen_) {
        return;
    }

    transitioning_ = true;
    fullscreen_ = false;
    dock_->showNormal();
    transitioning_ = false;
    notifyState();
}

void DockFullscreenController::restoreFromFullscreen(bool keepVisible, CompletionHandler completion) {
    if (!dock_ || !fullscreen_) {
        if (completion) {
            completion();
        }
        return;
    }

    leaveFullscreenPresentation();

    if (restoreWasFloating_) {
        const quint64 generation = ++placementGeneration_;
        QTimer::singleShot(0, this, [this, keepVisible, completion = std::move(completion), generation]() mutable {
            if (generation != placementGeneration_ || !dock_) {
                return;
            }

            DockAnimationGuard guard(mainWindow_);
            (void)setFloatingPreservingFeatures(dock_, true);
            if (!restoreGeometry_.isEmpty() && !(restoreWindowState_ & Qt::WindowMaximized)) {
                (void)dock_->restoreGeometry(restoreGeometry_);
            }
            if (restoreWindowState_ & Qt::WindowMaximized) {
                dock_->showMaximized();
            }
            setDockVisible(keepVisible);
            if (completion) {
                completion();
            }
        });
        return;
    }

    if (mainWindow_ && restoreDockArea_ != Qt::NoDockWidgetArea) {
        (void)requestDockPlacement(restoreDockArea_, keepVisible, true, std::move(completion));
    } else if (completion) {
        completion();
    }
}

void DockFullscreenController::setDockVisible(bool visible) {
    if (!dock_) {
        return;
    }
    if (!visible) {
        dock_->hide();
        return;
    }

    dock_->show();
    dock_->raise();
    if (dock_->isFloating()) {
        dock_->activateWindow();
    }
}

void DockFullscreenController::notifyState() {
    if (escapeAction_) {
        escapeAction_->setEnabled(fullscreen_);
    }
    if (stateHandler_) {
        stateHandler_(fullscreen_);
    }
}

} // namespace ilystream
