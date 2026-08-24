// SPDX-License-Identifier: GPL-2.0-or-later
#include "../src/dock-fullscreen-controller.hpp"
#include "../src/unified-chat-dock-locator.hpp"

#include <QAction>
#include <QApplication>
#include <QCloseEvent>
#include <QDockWidget>
#include <QEventLoop>
#include <QMainWindow>
#include <QTimer>
#include <QWidget>

#include <array>
#include <cstdlib>
#include <iostream>

namespace {

class RejectFirstCloseWindow final : public QMainWindow {
  protected:
    void closeEvent(QCloseEvent* event) override {
        if (rejectNextClose_) {
            rejectNextClose_ = false;
            event->ignore();
            return;
        }
        QMainWindow::closeEvent(event);
    }

  private:
    bool rejectNextClose_ = true;
};

void require(bool condition, const char* message) {
    if (!condition) {
        std::cerr << "FAILED: " << message << '\n';
        std::exit(EXIT_FAILURE);
    }
}

void processEvents(int milliseconds = 50) {
    QEventLoop turn;
    QTimer::singleShot(milliseconds, &turn, &QEventLoop::quit);
    turn.exec(QEventLoop::AllEvents);
}

} // namespace

int main(int argc, char** argv) {
    QApplication application(argc, argv);
    QApplication::setQuitOnLastWindowClosed(false);

    RejectFirstCloseWindow mainWindow;
    mainWindow.setWindowOpacity(0.0);
    auto* dock = new QDockWidget(QStringLiteral("ilyStream Workspace"), &mainWindow);
    dock->setObjectName(QStringLiteral("com.ilystream.obs.workspace"));
    dock->setWidget(new QWidget(dock));
    const auto standardFeatures =
        QDockWidget::DockWidgetClosable | QDockWidget::DockWidgetMovable | QDockWidget::DockWidgetFloatable;
    dock->setFeatures(standardFeatures);
    mainWindow.addDockWidget(Qt::RightDockWidgetArea, dock);
    auto* companionDock = new QDockWidget(QStringLiteral("Companion"), &mainWindow);
    companionDock->setObjectName(QStringLiteral("companionDock"));
    companionDock->setWidget(new QWidget(companionDock));
    mainWindow.addDockWidget(Qt::RightDockWidgetArea, companionDock);
    auto* unifiedChatDock = new QDockWidget(QStringLiteral("ilyStream Unified Chat"), &mainWindow);
    unifiedChatDock->setObjectName(QStringLiteral("ilyStream Unified Chat_extraBrowser"));
    unifiedChatDock->setProperty("uuid", QStringLiteral("f6b82f41a8624260897c0e9d9493e022"));
    unifiedChatDock->setWidget(new QWidget(unifiedChatDock));
    mainWindow.addDockWidget(Qt::RightDockWidgetArea, unifiedChatDock);
    mainWindow.show();
    dock->show();
    dock->raise();
    processEvents();
    const auto companionFeatures = companionDock->features();

    const QByteArray extraBrowserDocks = QByteArrayLiteral(
        R"([{"title":"StreamElements Chat","url":"https://streamelements.com/chat","uuid":"third-party"},{"title":"ilyStream Unified Chat","url":"http://127.0.0.1:8899/overlay/chat-unified?dock=1","uuid":"f6b82f41-a862-4260-897c-0e9d9493e022"}])");
    require(ilystream::findUnifiedChatDock(&mainWindow, extraBrowserDocks) == unifiedChatDock,
            "the configured loopback URL and UUID resolve only the ilyStream browser dock");
    require(
        ilystream::findUnifiedChatDock(
            &mainWindow,
            QByteArrayLiteral(
                R"([{"title":"ilyStream Unified Chat","url":"https://example.com/overlay/chat-unified?dock=1","uuid":"f6b82f41-a862-4260-897c-0e9d9493e022"}])")) ==
            nullptr,
        "a remote lookalike URL cannot be managed as the ilyStream chat dock");
    require(
        ilystream::findUnifiedChatDock(
            &mainWindow,
            QByteArrayLiteral(
                R"([{"title":"ilyStream Unified Chat","url":"http://127.0.0.1:8899/overlay/chat-unified?dock=1","uuid":"00000000-0000-0000-0000-000000000000"}])")) ==
            nullptr,
        "a mismatched configured UUID cannot select another dock");

    ilystream::DockFullscreenController controller(&mainWindow, dock);
    bool reportedFullscreen = false;
    controller.setStateHandler([&reportedFullscreen](bool active) { reportedFullscreen = active; });

    require(dock->allowedAreas() == Qt::AllDockWidgetAreas, "the workspace can dock in every OBS dock area");
    require(dock->features() == standardFeatures, "fullscreen support does not override OBS dock features");
    require(controller.enterFullscreen(), "a docked workspace can enter fullscreen");
    processEvents();
    require(controller.isFullscreen() && reportedFullscreen, "fullscreen state is reported to the workspace UI");
    require(dock->isFullScreen() && dock->isFloating(), "fullscreen uses the OBS-owned floating dock window");

    QAction* escapeAction = nullptr;
    for (QAction* action : dock->actions()) {
        if (action->objectName() == QStringLiteral("com.ilystream.obs.action.exit-workspace-fullscreen")) {
            escapeAction = action;
            break;
        }
    }
    require(escapeAction != nullptr, "fullscreen provides an Escape action");
    require(escapeAction->shortcut() == QKeySequence(Qt::Key_Escape), "Escape is the fullscreen restore shortcut");
    require(escapeAction->isEnabled(), "Escape is enabled while fullscreen");
    dock->setFeatures(QDockWidget::NoDockWidgetFeatures);
    escapeAction->trigger();
    processEvents();
    require(!controller.isFullscreen() && !reportedFullscreen, "Escape restores normal workspace state");
    require(!dock->isFullScreen() && !dock->isFloating(), "a docked workspace returns to its dock");
    require(mainWindow.dockWidgetArea(dock) == Qt::RightDockWidgetArea, "the original dock area is restored");
    require(dock->features() == QDockWidget::NoDockWidgetFeatures,
            "a Lock Docks feature change made during fullscreen is preserved");
    require(!companionDock->isFloating() && mainWindow.dockWidgetArea(companionDock) == Qt::RightDockWidgetArea &&
                companionDock->features() == companionFeatures,
            "fullscreen never changes another OBS or third-party dock");

    const std::array<Qt::DockWidgetArea, 4> placements = {
        Qt::LeftDockWidgetArea,
        Qt::RightDockWidgetArea,
        Qt::TopDockWidgetArea,
        Qt::BottomDockWidgetArea,
    };
    for (const Qt::DockWidgetArea area : placements) {
        require(controller.placeDock(area), "an explicit placement works while OBS docks are locked");
        processEvents();
        require(!dock->isFloating() && mainWindow.dockWidgetArea(dock) == area,
                "the explicit placement selects the requested dock area");
        require(dock->features() == QDockWidget::NoDockWidgetFeatures,
                "explicit placement does not unlock ordinary dock controls");
    }

    require(controller.floatDock(), "the explicit Floating command works while OBS docks are locked");
    processEvents();
    require(dock->isFloating(), "the workspace becomes a floating window");
    require(dock->features() == QDockWidget::NoDockWidgetFeatures,
            "floating the workspace does not mutate locked dock features");

    require(controller.enterFullscreen(), "a floating workspace can enter fullscreen");
    controller.exitFullscreen();
    processEvents();
    require(dock->isFloating(), "a floating workspace returns to a floating window");

    require(controller.enterFullscreen(), "the floating workspace can enter fullscreen again");
    require(controller.placeDock(Qt::LeftDockWidgetArea), "placement exits fullscreen before docking");
    processEvents();
    require(!controller.isFullscreen() && !dock->isFullScreen(), "placement leaves fullscreen state cleanly");
    require(mainWindow.dockWidgetArea(dock) == Qt::LeftDockWidgetArea && !dock->isFloating(),
            "placement after fullscreen reaches the requested dock area");

    require(controller.enterFullscreen(), "the workspace can enter fullscreen before an explicit close");
    require(controller.closeDock(), "the explicit Close command works while OBS docks are locked");
    processEvents();
    require(!controller.isFullscreen() && !dock->isVisible(), "Close exits fullscreen and hides the workspace");
    require(!dock->isFloating(), "a closed fullscreen workspace restores its dock placement");

    dock->toggleViewAction()->trigger();
    processEvents();
    require(dock->isVisible(), "the standard Docks action reopens a closed workspace");
    require(!dock->isFullScreen(), "a reopened workspace is never trapped in fullscreen");
    require(dock->features() == QDockWidget::NoDockWidgetFeatures,
            "reopening from the Docks action retains OBS Lock Docks behavior");

    require(controller.enterFullscreen(), "the workspace can fullscreen before OBS closes");
    mainWindow.close();
    processEvents();
    require(!controller.isFullscreen(), "the OBS main-window close path normalizes fullscreen state before save");
    require(!dock->isFloating(), "the OBS close path restores the dock placement before save");
    require(mainWindow.isVisible(), "cancelling OBS close keeps the OBS window visible");
    require(dock->isVisible(), "cancelling OBS close keeps the restored workspace visible");

    mainWindow.close();
    processEvents();
    require(!mainWindow.isVisible(), "a later accepted OBS close still succeeds");

    std::cout << "dock fullscreen behavior tests passed\n";
    return EXIT_SUCCESS;
}
