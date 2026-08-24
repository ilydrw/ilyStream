// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once

#include "program-transport-descriptor.hpp"

#include <QJsonObject>
#include <QHash>
#include <QLocalSocket>
#include <QObject>
#include <QString>
#include <QTimer>

#include <functional>

namespace ilystream {

enum class BridgeStatus {
    Offline,
    Connecting,
    Handshaking,
    Ready,
    Incompatible,
};

class BridgeClient final : public QObject {
  public:
    using StatusHandler = std::function<void(BridgeStatus, const QString&)>;
    using SnapshotHandler = std::function<void(const QJsonObject&)>;
    using CommandResultHandler = std::function<void(const QString&, bool, const QString&)>;
    using ProgramTransportHandler = std::function<void(const ProgramTransportEvent&)>;

    explicit BridgeClient(QObject* parent = nullptr);
    BridgeClient(QString bridgeServerName, QString credentialPath, QObject* parent = nullptr);

    void setStatusHandler(StatusHandler handler);
    void setSnapshotHandler(SnapshotHandler handler);
    void setCommandResultHandler(CommandResultHandler handler);
    void setProgramTransportHandler(ProgramTransportHandler handler);

    void start();
    void stop();
    void forceReconnect();

    bool isReady() const;
    bool requestCommand(const QString& action, const QJsonObject& payload = {});
    bool sendFrontendEvent(const QString& eventName, const QJsonObject& obsState);
    bool sendObsSnapshot(const QJsonObject& obsState);
    void setProgramTransportRequested(bool requested);
    bool sendProgramTransportStats(const ProgramTransportStats& stats);
    bool releaseProgramTransport(const ProgramTransportLease& lease, const QString& reason = QStringLiteral("replaced"));

  private:
    void connectNow();
    void scheduleReconnect(bool immediate = false);
    bool sendHello();
    bool sendProgramSubscribe();
    bool sendProgramRelease(const QString& reason);
    bool sendMessage(QJsonObject message, bool requireReady);
    void resetProgramTransportState();
    void clearBridgeToken();
    void processMessage(const QJsonObject& message);
    void rejectProtocol(int receivedVersion);
    void updateStatus(BridgeStatus status, const QString& detail);
    QString socketErrorDetail() const;

    QLocalSocket socket_;
    QTimer reconnectTimer_;
    QTimer connectTimeout_;
    QTimer handshakeTimeout_;
    QTimer heartbeatTimer_;
    QByteArray readBuffer_;
    QString bridgeServerName_;
    QString credentialPath_;
    QString bridgeToken_;
    StatusHandler statusHandler_;
    SnapshotHandler snapshotHandler_;
    CommandResultHandler commandResultHandler_;
    ProgramTransportHandler programTransportHandler_;
    BridgeStatus status_ = BridgeStatus::Offline;
    QString statusDetail_;
    int reconnectAttempt_ = 0;
    int malformedFrameCount_ = 0;
    QString programSubscriptionId_;
    std::optional<ProgramTransportLease> activeProgramTransport_;
    QHash<QString, ProgramTransportLease> programTransportLeases_;
    quint64 latestProgramGeneration_ = 0;
    bool stopping_ = true;
    bool protocolRejected_ = false;
    bool programTransportRequested_ = false;
    bool programTransportNegotiated_ = false;
};

} // namespace ilystream
