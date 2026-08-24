// SPDX-License-Identifier: GPL-2.0-or-later
#include "bridge-client.hpp"
#include "bridge-program-transport.hpp"
#include "dock-fullscreen-controller.hpp"
#include "obs-state.hpp"
#include "program-source.hpp"
#include "program-transport.hpp"
#include "unified-chat-dock-locator.hpp"
#include "workspace-dock.hpp"

#include <QAction>
#include <QDir>
#include <QDockWidget>
#include <QFileInfo>
#include <QMainWindow>
#include <QMenu>
#include <QMetaObject>
#include <QPointer>
#include <QProcess>
#include <QSignalBlocker>
#include <QStandardPaths>
#include <QStringList>
#include <QTimer>

#include <obs-frontend-api.h>
#include <obs-module.h>
#include <util/config-file.h>

#include <memory>
#include <utility>
#include <vector>

OBS_DECLARE_MODULE()
OBS_MODULE_USE_DEFAULT_LOCALE(PLUGIN_NAME, "en-US")

namespace {

constexpr auto kDockId = "com.ilystream.obs.workspace";
constexpr int kProgramStatsIntervalMs = 2000;

QString moduleText(const char* key) { return QString::fromUtf8(obs_module_text(key)); }

class PluginController final : public QObject {
  public:
    bool initialize() {
        mainWindow_ = static_cast<QMainWindow*>(obs_frontend_get_main_window());
        if (!mainWindow_) {
            blog(LOG_ERROR, "[ilyStream Workspace] OBS frontend window is unavailable");
            return false;
        }

        bridge_ = new ilystream::BridgeClient(this);
        programTransportHub_ = ilystream::sharedProgramTransportHub();
        programTransportHub_->setDemandHandler([this](bool demanded) {
            QMetaObject::invokeMethod(
                this,
                [this, demanded]() {
                    if (!shuttingDown_ && bridge_) {
                        if (!demanded) {
                            clearActiveProgramTransport(false);
                        }
                        bridge_->setProgramTransportRequested(demanded);
                    }
                },
                Qt::QueuedConnection);
        });
        bridge_->setProgramTransportHandler(
            [this](const ilystream::ProgramTransportEvent& event) { onProgramTransportEvent(event); });
        programStatsTimer_.setInterval(kProgramStatsIntervalMs);
        connect(&programStatsTimer_, &QTimer::timeout, this, [this]() {
            if (bridge_ && activeProgramTransport_) {
                if (!activeProgramTransport_->videoInfo().available) {
                    clearActiveProgramTransport(true, QStringLiteral("import-failed"));
                    return;
                }
                (void)bridge_->sendProgramTransportStats(activeProgramTransport_->stats());
            }
        });
        bridge_->setStatusHandler([this](ilystream::BridgeStatus status, const QString& detail) {
            if (workspace_) {
                workspace_->setBridgeStatus(status, detail);
            }
            if (status == ilystream::BridgeStatus::Ready) {
                publishSnapshot();
            } else {
                clearActiveProgramTransport(false);
            }
        });
        bridge_->setSnapshotHandler([this](const QJsonObject& snapshot) {
            if (workspace_) {
                workspace_->setIlyStreamSnapshot(snapshot);
            }
        });
        bridge_->setCommandResultHandler([this](const QString&, bool ok, const QString& message) {
            if (workspace_) {
                const char* fallback = ok ? "Dock.CommandCompleted" : "Dock.CommandFailed";
                workspace_->setNotice(message.trimmed().isEmpty() ? moduleText(fallback) : message);
            }
        });

        workspace_ =
            new ilystream::WorkspaceDock([this]() { openControlCenter(); }, [this]() { reconnectBridge(); },
                                         [this]() { toggleWorkspaceFullscreen(); },
                                         [this](ilystream::WorkspacePlacement placement) { placeWorkspace(placement); },
                                         [this]() { closeWorkspace(); }, mainWindow_);
        if (!obs_frontend_add_dock_by_id(kDockId, obs_module_text("Dock.Title"), workspace_)) {
            blog(LOG_ERROR, "[ilyStream Workspace] Dock id '%s' is already registered", kDockId);
            delete workspace_;
            workspace_ = nullptr;
            return false;
        }
        dockRegistered_ = true;
        dock_ = mainWindow_->findChild<QDockWidget*>(QString::fromLatin1(kDockId));
        if (dock_) {
            fullscreenController_ = new ilystream::DockFullscreenController(mainWindow_, dock_, this);
        } else {
            blog(LOG_WARNING, "[ilyStream Workspace] OBS registered the workspace but its dock wrapper was not found");
        }

        addToolAction("Menu.ShowWorkspace", "com.ilystream.obs.action.show-workspace", [this]() { showDock(); });
        addToolAction("Menu.OpenApp", "com.ilystream.obs.action.open-control-center",
                      [this]() { openControlCenter(); });
        addToolAction("Menu.Reconnect", "com.ilystream.obs.action.reconnect", [this]() { reconnectBridge(); });
        fullscreenMenuAction_ =
            addToolAction("Menu.ToggleFullscreen", "com.ilystream.obs.action.toggle-workspace-fullscreen",
                          [this]() { toggleWorkspaceFullscreen(); });
        if (fullscreenMenuAction_) {
            fullscreenMenuAction_->setCheckable(true);
            fullscreenMenuAction_->setEnabled(fullscreenController_ != nullptr);
        }
        if (fullscreenController_) {
            fullscreenController_->setStateHandler([this](bool active) { setFullscreenUiState(active); });
        } else {
            setFullscreenUiState(false);
        }

        addToolAction("Menu.ShowUnifiedChat", "com.ilystream.obs.action.show-unified-chat",
                      [this]() { showUnifiedChat(); });
        auto* unifiedChatLayoutAction =
            addToolAction("Menu.UnifiedChatLayout", "com.ilystream.obs.action.unified-chat-layout", []() {});
        if (unifiedChatLayoutAction) {
            unifiedChatLayoutMenu_ = new QMenu(mainWindow_);
            unifiedChatLayoutMenu_->setObjectName(QStringLiteral("com.ilystream.obs.menu.unified-chat-layout"));
            unifiedChatLayoutAction->setMenu(unifiedChatLayoutMenu_);
            addUnifiedChatPlacementAction("Dock.DockLeft", "left", ilystream::WorkspacePlacement::Left);
            addUnifiedChatPlacementAction("Dock.DockRight", "right", ilystream::WorkspacePlacement::Right);
            addUnifiedChatPlacementAction("Dock.DockTop", "top", ilystream::WorkspacePlacement::Top);
            addUnifiedChatPlacementAction("Dock.DockBottom", "bottom", ilystream::WorkspacePlacement::Bottom);
            unifiedChatLayoutMenu_->addSeparator();
            addUnifiedChatPlacementAction("Dock.Floating", "floating", ilystream::WorkspacePlacement::Floating);
        }
        unifiedChatFullscreenMenuAction_ =
            addToolAction("Menu.ToggleUnifiedChatFullscreen", "com.ilystream.obs.action.toggle-unified-chat-fullscreen",
                          [this]() { toggleUnifiedChatFullscreen(); });
        if (unifiedChatFullscreenMenuAction_) {
            unifiedChatFullscreenMenuAction_->setCheckable(true);
        }
        addToolAction("Menu.CloseUnifiedChat", "com.ilystream.obs.action.close-unified-chat",
                      [this]() { closeUnifiedChat(); });
        (void)ensureUnifiedChatController();

        obs_frontend_add_event_callback(&PluginController::frontendEventCallback, this);
        callbackRegistered_ = true;

        refreshObsState();
        bridge_->start();
        blog(LOG_INFO, "[ilyStream Workspace] Plugin loaded (version %s, OBS %s)", PLUGIN_VERSION,
             obs_get_version_string());
        return true;
    }

    void shutdown() {
        if (shuttingDown_) {
            return;
        }
        shuttingDown_ = true;

        if (callbackRegistered_) {
            obs_frontend_remove_event_callback(&PluginController::frontendEventCallback, this);
            callbackRegistered_ = false;
        }

        if (programTransportHub_) {
            programTransportHub_->setDemandHandler({});
        }
        clearActiveProgramTransport(false);
        if (bridge_) {
            bridge_->setProgramTransportHandler({});
            bridge_->setProgramTransportRequested(false);
            bridge_->stop();
        }
        programTransportHub_.reset();

        if (fullscreenController_) {
            fullscreenController_->setStateHandler({});
            delete fullscreenController_;
            fullscreenController_ = nullptr;
        }

        if (unifiedChatController_) {
            unifiedChatController_->setStateHandler({});
            delete unifiedChatController_;
            unifiedChatController_ = nullptr;
        }
        unifiedChatDock_ = nullptr;

        for (QAction* action : actions_) {
            if (!action) {
                continue;
            }
            QObject::disconnect(action, nullptr, this, nullptr);
            delete action;
        }
        actions_.clear();
        if (unifiedChatLayoutMenu_) {
            delete unifiedChatLayoutMenu_;
            unifiedChatLayoutMenu_ = nullptr;
        }

        if (dockRegistered_) {
            obs_frontend_remove_dock(kDockId);
            dockRegistered_ = false;
            dock_ = nullptr;
            workspace_ = nullptr;
        }
    }

    ~PluginController() override { shutdown(); }

  private:
    template <typename Handler> QAction* addToolAction(const char* textKey, const char* objectName, Handler&& handler) {
        auto* action = static_cast<QAction*>(obs_frontend_add_tools_menu_qaction(obs_module_text(textKey)));
        if (!action) {
            blog(LOG_WARNING, "[ilyStream Workspace] Could not register Tools menu action '%s'", objectName);
            return nullptr;
        }

        action->setObjectName(QString::fromLatin1(objectName));
        action->setMenuRole(QAction::NoRole);
        connect(action, &QAction::triggered, this, std::forward<Handler>(handler));
        actions_.push_back(action);
        return action;
    }

    static void frontendEventCallback(obs_frontend_event event, void* privateData) {
        auto* controller = static_cast<PluginController*>(privateData);
        if (controller) {
            controller->onFrontendEvent(event);
        }
    }

    void onFrontendEvent(obs_frontend_event event) {
        const ilystream::ObsState state = ilystream::captureObsState();
        if (workspace_) {
            workspace_->setObsState(state);
        }
        if (bridge_) {
            bridge_->sendFrontendEvent(ilystream::frontendEventName(event), state.toJson());
        }

        if (event == OBS_FRONTEND_EVENT_EXIT && bridge_) {
            clearActiveProgramTransport(false);
            bridge_->setProgramTransportRequested(false);
            bridge_->stop();
        }
        if (event == OBS_FRONTEND_EVENT_FINISHED_LOADING) {
            (void)ensureUnifiedChatController();
        }
    }

    void refreshObsState() {
        const ilystream::ObsState state = ilystream::captureObsState();
        if (workspace_) {
            workspace_->setObsState(state);
        }
    }

    void publishSnapshot() {
        const ilystream::ObsState state = ilystream::captureObsState();
        if (workspace_) {
            workspace_->setObsState(state);
        }
        if (bridge_) {
            bridge_->sendObsSnapshot(state.toJson());
        }
    }

    void showDock() {
        QDockWidget* dock = dock_.data();
        if (!dock) {
            blog(LOG_WARNING, "[ilyStream Workspace] OBS could not find the registered workspace dock");
            return;
        }

        dock->show();
        dock->raise();
        if (dock->isFloating()) {
            dock->activateWindow();
        }
    }

    void toggleWorkspaceFullscreen() {
        if (shuttingDown_ || !fullscreenController_) {
            setFullscreenUiState(false);
            return;
        }

        (void)fullscreenController_->toggleFullscreen();
    }

    void setFullscreenUiState(bool active) {
        if (workspace_) {
            workspace_->setFullscreenActive(active);
        }
        if (fullscreenMenuAction_) {
            const QSignalBlocker blocker(fullscreenMenuAction_.data());
            fullscreenMenuAction_->setChecked(active);
            fullscreenMenuAction_->setText(moduleText(active ? "Menu.ExitFullscreen" : "Menu.ToggleFullscreen"));
        }
    }

    void placeWorkspace(ilystream::WorkspacePlacement placement) {
        if (shuttingDown_ || !fullscreenController_) {
            return;
        }

        switch (placement) {
        case ilystream::WorkspacePlacement::Left:
            (void)fullscreenController_->placeDock(Qt::LeftDockWidgetArea);
            break;
        case ilystream::WorkspacePlacement::Right:
            (void)fullscreenController_->placeDock(Qt::RightDockWidgetArea);
            break;
        case ilystream::WorkspacePlacement::Top:
            (void)fullscreenController_->placeDock(Qt::TopDockWidgetArea);
            break;
        case ilystream::WorkspacePlacement::Bottom:
            (void)fullscreenController_->placeDock(Qt::BottomDockWidgetArea);
            break;
        case ilystream::WorkspacePlacement::Floating:
            (void)fullscreenController_->floatDock();
            break;
        }
    }

    void closeWorkspace() {
        if (shuttingDown_) {
            return;
        }
        if (fullscreenController_) {
            (void)fullscreenController_->closeDock();
        } else if (dock_) {
            dock_->close();
        }
    }

    void addUnifiedChatPlacementAction(const char* textKey, const char* suffix,
                                       ilystream::WorkspacePlacement placement) {
        if (!unifiedChatLayoutMenu_) {
            return;
        }

        QAction* action = unifiedChatLayoutMenu_->addAction(moduleText(textKey));
        action->setObjectName(
            QStringLiteral("com.ilystream.obs.action.place-unified-chat-%1").arg(QString::fromLatin1(suffix)));
        connect(action, &QAction::triggered, this, [this, placement]() { placeUnifiedChat(placement); });
    }

    QByteArray extraBrowserDocksJson() const {
        config_t* config = obs_frontend_get_user_config();
        if (!config) {
            return {};
        }

        const char* value = config_get_string(config, "BasicWindow", "ExtraBrowserDocks");
        return value ? QByteArray(value) : QByteArray();
    }

    bool ensureUnifiedChatController() {
        if (shuttingDown_ || !mainWindow_) {
            return false;
        }

        QDockWidget* resolved = ilystream::findUnifiedChatDock(mainWindow_, extraBrowserDocksJson());
        if (resolved && resolved == unifiedChatDock_ && unifiedChatController_) {
            return true;
        }

        if (unifiedChatController_) {
            unifiedChatController_->setStateHandler({});
            delete unifiedChatController_;
            unifiedChatController_ = nullptr;
        }
        unifiedChatDock_ = resolved;
        setUnifiedChatFullscreenUiState(false);
        if (!unifiedChatDock_) {
            return false;
        }

        unifiedChatController_ = new ilystream::DockFullscreenController(mainWindow_, unifiedChatDock_, this);
        unifiedChatController_->setStateHandler([this](bool active) { setUnifiedChatFullscreenUiState(active); });
        return true;
    }

    void showUnifiedChat() {
        if (!ensureUnifiedChatController() || !unifiedChatDock_) {
            blog(LOG_WARNING, "[ilyStream Workspace] The configured ilyStream Unified Chat browser dock was not found");
            return;
        }

        unifiedChatDock_->show();
        unifiedChatDock_->raise();
        if (unifiedChatDock_->isFloating()) {
            unifiedChatDock_->activateWindow();
        }
    }

    void toggleUnifiedChatFullscreen() {
        if (!ensureUnifiedChatController()) {
            setUnifiedChatFullscreenUiState(false);
            return;
        }
        (void)unifiedChatController_->toggleFullscreen();
    }

    void setUnifiedChatFullscreenUiState(bool active) {
        if (!unifiedChatFullscreenMenuAction_) {
            return;
        }

        const QSignalBlocker blocker(unifiedChatFullscreenMenuAction_.data());
        unifiedChatFullscreenMenuAction_->setChecked(active);
        unifiedChatFullscreenMenuAction_->setText(
            moduleText(active ? "Menu.ExitUnifiedChatFullscreen" : "Menu.ToggleUnifiedChatFullscreen"));
    }

    void placeUnifiedChat(ilystream::WorkspacePlacement placement) {
        if (!ensureUnifiedChatController()) {
            return;
        }

        switch (placement) {
        case ilystream::WorkspacePlacement::Left:
            (void)unifiedChatController_->placeDock(Qt::LeftDockWidgetArea);
            break;
        case ilystream::WorkspacePlacement::Right:
            (void)unifiedChatController_->placeDock(Qt::RightDockWidgetArea);
            break;
        case ilystream::WorkspacePlacement::Top:
            (void)unifiedChatController_->placeDock(Qt::TopDockWidgetArea);
            break;
        case ilystream::WorkspacePlacement::Bottom:
            (void)unifiedChatController_->placeDock(Qt::BottomDockWidgetArea);
            break;
        case ilystream::WorkspacePlacement::Floating:
            (void)unifiedChatController_->floatDock();
            break;
        }
    }

    void closeUnifiedChat() {
        if (ensureUnifiedChatController()) {
            (void)unifiedChatController_->closeDock();
        }
    }

    void reconnectBridge() {
        if (workspace_) {
            workspace_->setNotice(moduleText("Dock.Reconnecting"));
        }
        if (bridge_) {
            clearActiveProgramTransport(false);
            bridge_->forceReconnect();
        }
    }

    static bool sameProgramLease(const ilystream::ProgramTransportLease& left,
                                 const ilystream::ProgramTransportLease& right) {
        return left.generation == right.generation && left.transportId == right.transportId;
    }

    void onProgramTransportEvent(const ilystream::ProgramTransportEvent& event) {
        if (shuttingDown_ || !bridge_) {
            return;
        }

        if (event.kind == ilystream::ProgramTransportEventKind::Retiring) {
            if (activeProgramTransport_ && sameProgramLease(activeProgramTransport_->lease(), event.lease)) {
                clearActiveProgramTransport(true, QStringLiteral("retiring"));
            } else {
                (void)bridge_->releaseProgramTransport(event.lease, QStringLiteral("retiring"));
            }
            return;
        }

        auto replacement = ilystream::BridgeProgramTransport::create(event.descriptor);
        if (!replacement) {
            blog(LOG_WARNING, "[ilyStream Program] Rejected a Program transport that could not be staged");
            (void)bridge_->releaseProgramTransport(event.lease, QStringLiteral("import-failed"));
            return;
        }

        auto previous = std::exchange(activeProgramTransport_, replacement);
        ilystream::installSharedProgramTransport(replacement);
        programStatsTimer_.start();
        if (previous) {
            const ilystream::ProgramTransportLease previousLease = previous->lease();
            previous->retire();
            (void)bridge_->releaseProgramTransport(previousLease, QStringLiteral("replaced"));
        }
        blog(LOG_INFO, "[ilyStream Program] Program transport generation %llu is available",
             static_cast<unsigned long long>(event.lease.generation));
    }

    void clearActiveProgramTransport(bool releaseLease, const QString& releaseReason = {}) {
        programStatsTimer_.stop();
        auto transport = std::exchange(activeProgramTransport_, {});
        if (!transport) {
            return;
        }

        ilystream::clearSharedProgramTransport();
        const ilystream::ProgramTransportLease lease = transport->lease();
        transport->retire();
        if (releaseLease && bridge_) {
            (void)bridge_->releaseProgramTransport(lease, releaseReason);
        }
    }

    void openControlCenter() {
        if (bridge_ && bridge_->requestCommand(QStringLiteral("openControlCenter"))) {
            if (workspace_) {
                workspace_->setNotice(moduleText("Dock.CommandSent"));
            }
            return;
        }

        const QString executable = findIlyStreamExecutable();
        if (!executable.isEmpty() && QProcess::startDetached(executable, {})) {
            if (workspace_) {
                workspace_->setNotice(moduleText("Dock.StartingApp"));
            }
            if (bridge_) {
                bridge_->forceReconnect();
            }
            return;
        }

        if (workspace_) {
            workspace_->setNotice(moduleText("Dock.AppNotFound"));
        }
        blog(LOG_INFO, "[ilyStream Workspace] ilyStream is offline and no installed executable was found");
    }

    QString findIlyStreamExecutable() const {
        const QString pathExecutable = QStandardPaths::findExecutable(QStringLiteral("ilyStream.exe"));
        if (!pathExecutable.isEmpty()) {
            return pathExecutable;
        }

        QStringList candidates;
        const QString localAppData = qEnvironmentVariable("LOCALAPPDATA");
        if (!localAppData.isEmpty()) {
            candidates.append(QDir(localAppData).filePath(QStringLiteral("Programs/ilyStream/ilyStream.exe")));
            candidates.append(QDir(localAppData).filePath(QStringLiteral("Programs/ilystream/ilyStream.exe")));
        }
        const QString programFiles = qEnvironmentVariable("ProgramFiles");
        if (!programFiles.isEmpty()) {
            candidates.append(QDir(programFiles).filePath(QStringLiteral("ilyStream/ilyStream.exe")));
        }

        for (const QString& candidate : candidates) {
            const QFileInfo info(candidate);
            if (info.exists() && info.isFile()) {
                return info.absoluteFilePath();
            }
        }

        return {};
    }

    ilystream::BridgeClient* bridge_ = nullptr;
    std::shared_ptr<ilystream::ProgramTransportHub> programTransportHub_;
    std::shared_ptr<ilystream::BridgeProgramTransport> activeProgramTransport_;
    QTimer programStatsTimer_;
    ilystream::DockFullscreenController* fullscreenController_ = nullptr;
    ilystream::DockFullscreenController* unifiedChatController_ = nullptr;
    QPointer<QMainWindow> mainWindow_;
    QPointer<ilystream::WorkspaceDock> workspace_;
    QPointer<QDockWidget> dock_;
    QPointer<QDockWidget> unifiedChatDock_;
    QPointer<QAction> fullscreenMenuAction_;
    QPointer<QAction> unifiedChatFullscreenMenuAction_;
    QPointer<QMenu> unifiedChatLayoutMenu_;
    std::vector<QAction*> actions_;
    bool dockRegistered_ = false;
    bool callbackRegistered_ = false;
    bool shuttingDown_ = false;
};

std::unique_ptr<PluginController> controller;

} // namespace

MODULE_EXPORT const char* obs_module_name(void) { return obs_module_text("Plugin.Name"); }

MODULE_EXPORT const char* obs_module_description(void) { return obs_module_text("Plugin.Description"); }

bool obs_module_load(void) {
    controller = std::make_unique<PluginController>();
    if (!controller->initialize()) {
        controller.reset();
        return false;
    }
    ilystream::registerProgramSource();
    return true;
}

void obs_module_unload(void) {
    if (controller) {
        controller->shutdown();
        controller.reset();
    }
    ilystream::clearSharedProgramTransport();
    blog(LOG_INFO, "[ilyStream Workspace] Plugin unloaded");
}
