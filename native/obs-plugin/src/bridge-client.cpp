// SPDX-License-Identifier: GPL-2.0-or-later
#include "bridge-client.hpp"

#include "bridge-credentials.hpp"
#include "bridge-peer-verifier.hpp"
#include "bridge-protocol.hpp"

#include <QDateTime>
#include <QCoreApplication>
#include <QJsonArray>
#include <QUuid>

#include <obs-module.h>

#include <algorithm>
#include <utility>

namespace ilystream {
namespace {

constexpr int kConnectTimeoutMs = 2500;
constexpr int kHandshakeTimeoutMs = 4000;
constexpr int kHeartbeatIntervalMs = 15000;
constexpr int kInitialReconnectMs = 1000;
constexpr int kMaximumReconnectMs = 30000;
constexpr qsizetype kMaximumOutstandingProgramTransports = 4;

QString utcTimestamp() { return QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs); }

QString programTransportLeaseKey(const ProgramTransportLease& lease) {
    return QStringLiteral("%1:%2").arg(lease.transportId, QString::number(lease.generation));
}

} // namespace

BridgeClient::BridgeClient(QObject* parent)
    : BridgeClient(QString::fromLatin1(bridge_protocol::kServerName), bridge_credentials::defaultPath(), parent) {}

BridgeClient::BridgeClient(QString bridgeServerName, QString credentialPath, QObject* parent)
    : QObject(parent), bridgeServerName_(std::move(bridgeServerName)), credentialPath_(std::move(credentialPath)) {
    reconnectTimer_.setSingleShot(true);
    connectTimeout_.setSingleShot(true);
    handshakeTimeout_.setSingleShot(true);
    heartbeatTimer_.setInterval(kHeartbeatIntervalMs);

    connect(&reconnectTimer_, &QTimer::timeout, this, [this]() { connectNow(); });
    connect(&connectTimeout_, &QTimer::timeout, this, [this]() {
        if (socket_.state() == QLocalSocket::ConnectingState) {
            updateStatus(BridgeStatus::Offline, QStringLiteral("ilyStream did not answer the local connection"));
            socket_.abort();
            scheduleReconnect();
        }
    });
    connect(&handshakeTimeout_, &QTimer::timeout, this, [this]() {
        if (status_ == BridgeStatus::Handshaking) {
            updateStatus(BridgeStatus::Offline, QStringLiteral("ilyStream did not complete the bridge handshake"));
            socket_.abort();
            scheduleReconnect();
        }
    });
    connect(&heartbeatTimer_, &QTimer::timeout, this, [this]() {
        sendMessage(
            {
                {QStringLiteral("type"), QStringLiteral("ping")},
                {QStringLiteral("sentAt"), utcTimestamp()},
            },
            true);
    });

    connect(&socket_, &QLocalSocket::connected, this, [this]() {
        connectTimeout_.stop();
        readBuffer_.clear();
        resetProgramTransportState();
        if (!bridge_peer_verifier::isSameUserNamedPipeServer(socket_.socketDescriptor())) {
            clearBridgeToken();
            updateStatus(BridgeStatus::Offline, QStringLiteral("Could not verify the ilyStream bridge owner"));
            socket_.abort();
            scheduleReconnect();
            return;
        }
        updateStatus(BridgeStatus::Handshaking, QStringLiteral("Negotiating bridge protocol 1"));
        if (!sendHello()) {
            clearBridgeToken();
            updateStatus(BridgeStatus::Offline, QStringLiteral("Could not authenticate the local bridge"));
            socket_.abort();
            scheduleReconnect();
            return;
        }
        clearBridgeToken();
        handshakeTimeout_.start(kHandshakeTimeoutMs);
    });
    connect(&socket_, &QLocalSocket::readyRead, this, [this]() {
        const auto decoded = bridge_protocol::consume(readBuffer_, socket_.readAll());
        if (decoded.bufferOverflow) {
            blog(LOG_WARNING, "[ilyStream Workspace] Local bridge exceeded the bounded read buffer; reconnecting");
            updateStatus(BridgeStatus::Offline, QStringLiteral("The local bridge sent an oversized message"));
            socket_.abort();
            scheduleReconnect();
            return;
        }

        if (decoded.malformedFrames > 0) {
            malformedFrameCount_ += decoded.malformedFrames;
            if (malformedFrameCount_ <= 3 || malformedFrameCount_ % 50 == 0) {
                blog(LOG_WARNING, "[ilyStream Workspace] Ignored %d malformed local bridge frame(s) (%d total)",
                     decoded.malformedFrames, malformedFrameCount_);
            }
        }

        for (const QJsonObject& message : decoded.messages) {
            processMessage(message);
            if (socket_.state() == QLocalSocket::UnconnectedState) {
                break;
            }
        }
    });
    connect(&socket_, &QLocalSocket::disconnected, this, [this]() {
        connectTimeout_.stop();
        handshakeTimeout_.stop();
        heartbeatTimer_.stop();
        readBuffer_.clear();
        clearBridgeToken();
        resetProgramTransportState();

        if (stopping_ || protocolRejected_) {
            return;
        }

        updateStatus(BridgeStatus::Offline, socketErrorDetail());
        scheduleReconnect();
    });
    connect(&socket_, &QLocalSocket::errorOccurred, this, [this](QLocalSocket::LocalSocketError) {
        connectTimeout_.stop();
        clearBridgeToken();
        if (stopping_ || protocolRejected_) {
            return;
        }

        updateStatus(BridgeStatus::Offline, socketErrorDetail());
        if (socket_.state() == QLocalSocket::UnconnectedState) {
            scheduleReconnect();
        }
    });
}

void BridgeClient::setStatusHandler(StatusHandler handler) {
    statusHandler_ = std::move(handler);
    if (statusHandler_) {
        statusHandler_(status_, statusDetail_);
    }
}

void BridgeClient::setSnapshotHandler(SnapshotHandler handler) { snapshotHandler_ = std::move(handler); }

void BridgeClient::setCommandResultHandler(CommandResultHandler handler) { commandResultHandler_ = std::move(handler); }

void BridgeClient::setProgramTransportHandler(ProgramTransportHandler handler) {
    programTransportHandler_ = std::move(handler);
}

void BridgeClient::start() {
    if (!stopping_) {
        return;
    }

    stopping_ = false;
    protocolRejected_ = false;
    reconnectAttempt_ = 0;
    malformedFrameCount_ = 0;
    scheduleReconnect(true);
}

void BridgeClient::stop() {
    if (!programSubscriptionId_.isEmpty()) {
        sendProgramRelease(QStringLiteral("bridge-stopping"));
    }
    programTransportRequested_ = false;
    stopping_ = true;
    reconnectTimer_.stop();
    connectTimeout_.stop();
    handshakeTimeout_.stop();
    heartbeatTimer_.stop();
    readBuffer_.clear();
    clearBridgeToken();
    resetProgramTransportState();
    socket_.abort();
    updateStatus(BridgeStatus::Offline, QStringLiteral("Bridge stopped"));
}

void BridgeClient::forceReconnect() {
    if (stopping_) {
        start();
        return;
    }

    protocolRejected_ = false;
    reconnectAttempt_ = 0;
    reconnectTimer_.stop();
    connectTimeout_.stop();
    handshakeTimeout_.stop();
    heartbeatTimer_.stop();
    readBuffer_.clear();
    clearBridgeToken();
    resetProgramTransportState();
    socket_.abort();
    scheduleReconnect(true);
}

bool BridgeClient::isReady() const {
    return status_ == BridgeStatus::Ready && socket_.state() == QLocalSocket::ConnectedState;
}

bool BridgeClient::requestCommand(const QString& action, const QJsonObject& payload) {
    return sendMessage(
        {
            {QStringLiteral("type"), QStringLiteral("command.request")},
            {QStringLiteral("requestId"), QUuid::createUuid().toString(QUuid::WithoutBraces)},
            {QStringLiteral("action"), action},
            {QStringLiteral("payload"), payload},
            {QStringLiteral("sentAt"), utcTimestamp()},
        },
        true);
}

bool BridgeClient::sendFrontendEvent(const QString& eventName, const QJsonObject& obsState) {
    return sendMessage(
        {
            {QStringLiteral("type"), QStringLiteral("obs.frontendEvent")},
            {QStringLiteral("event"), eventName},
            {QStringLiteral("payload"), obsState},
            {QStringLiteral("sentAt"), utcTimestamp()},
        },
        true);
}

bool BridgeClient::sendObsSnapshot(const QJsonObject& obsState) {
    return sendMessage(
        {
            {QStringLiteral("type"), QStringLiteral("obs.snapshot")},
            {QStringLiteral("payload"), obsState},
            {QStringLiteral("sentAt"), utcTimestamp()},
        },
        true);
}

void BridgeClient::setProgramTransportRequested(bool requested) {
    if (programTransportRequested_ == requested) {
        return;
    }

    programTransportRequested_ = requested;
    if (requested) {
        if (isReady() && programTransportNegotiated_ && programSubscriptionId_.isEmpty()) {
            sendProgramSubscribe();
        }
        return;
    }

    if (!programSubscriptionId_.isEmpty()) {
        sendProgramRelease(QStringLiteral("consumer-stopped"));
    }
    programSubscriptionId_.clear();
    activeProgramTransport_.reset();
    programTransportLeases_.clear();
    latestProgramGeneration_ = 0;
}

bool BridgeClient::sendProgramTransportStats(const ProgramTransportStats& stats) {
    if (!programTransportRequested_ || !programTransportNegotiated_ || programSubscriptionId_.isEmpty() ||
        !activeProgramTransport_ || stats.lease.transportId != activeProgramTransport_->transportId ||
        stats.lease.generation != activeProgramTransport_->generation || stats.lease.generation == 0 ||
        !programTransportLeases_.contains(programTransportLeaseKey(stats.lease))) {
        return false;
    }
    return sendMessage(program_transport_protocol::makeStats(programSubscriptionId_, stats, utcTimestamp()), true);
}

bool BridgeClient::releaseProgramTransport(const ProgramTransportLease& lease, const QString& reason) {
    const QString key = programTransportLeaseKey(lease);
    if (!programTransportRequested_ || !programTransportNegotiated_ || programSubscriptionId_.isEmpty() ||
        lease.generation == 0 || !programTransportLeases_.contains(key) ||
        !program_transport_protocol::isReason(QJsonValue(reason))) {
        return false;
    }
    if (!sendMessage(program_transport_protocol::makeRelease(programSubscriptionId_, lease, reason, utcTimestamp()), true)) {
        return false;
    }
    programTransportLeases_.remove(key);
    if (activeProgramTransport_ && activeProgramTransport_->transportId == lease.transportId &&
        activeProgramTransport_->generation == lease.generation) {
        activeProgramTransport_.reset();
    }
    return true;
}

void BridgeClient::connectNow() {
    if (stopping_ || protocolRejected_) {
        return;
    }
    if (socket_.state() != QLocalSocket::UnconnectedState) {
        return;
    }

    clearBridgeToken();
    bridge_credentials::LoadResult credentials = bridge_credentials::load(credentialPath_);
    if (!credentials.ok()) {
        updateStatus(BridgeStatus::Offline, bridge_credentials::statusDetail(credentials.error));
        scheduleReconnect();
        return;
    }
    bridgeToken_ = std::move(credentials.token);

    updateStatus(BridgeStatus::Connecting, QStringLiteral("Looking for ilyStream on this Windows account"));
    socket_.connectToServer(bridgeServerName_, QIODevice::ReadWrite);
    connectTimeout_.start(kConnectTimeoutMs);
}

void BridgeClient::scheduleReconnect(bool immediate) {
    if (stopping_ || protocolRejected_ || reconnectTimer_.isActive()) {
        return;
    }

    if (immediate) {
        reconnectTimer_.start(0);
        return;
    }

    const int exponent = std::min(reconnectAttempt_, 5);
    const int delay = std::min(kMaximumReconnectMs, kInitialReconnectMs * (1 << exponent));
    ++reconnectAttempt_;
    reconnectTimer_.start(delay);
}

bool BridgeClient::sendHello() {
    if (bridgeToken_.isEmpty()) {
        return false;
    }

    QJsonArray capabilities;
    capabilities.append(QStringLiteral("obs.frontend-events"));
    capabilities.append(QStringLiteral("obs.snapshots"));
    capabilities.append(QStringLiteral("command.request"));
    capabilities.append(QString::fromLatin1(kProgramTransportCapability));

    return sendMessage(
        {
            {QStringLiteral("type"), QStringLiteral("hello")},
            {QStringLiteral("authToken"), bridgeToken_},
            {QStringLiteral("client"), QStringLiteral("ilystream-obs-plugin")},
            {QStringLiteral("clientVersion"), QString::fromLatin1(PLUGIN_VERSION)},
            {QStringLiteral("obsVersion"), QString::fromUtf8(obs_get_version_string())},
            {QStringLiteral("clientPid"), static_cast<double>(QCoreApplication::applicationPid())},
            {QStringLiteral("capabilities"), capabilities},
            {QStringLiteral("sentAt"), utcTimestamp()},
        },
        false);
}

bool BridgeClient::sendMessage(QJsonObject message, bool requireReady) {
    if (socket_.state() != QLocalSocket::ConnectedState || (requireReady && !isReady())) {
        return false;
    }
    if (socket_.bytesToWrite() > bridge_protocol::kMaxBufferedBytes) {
        blog(LOG_WARNING, "[ilyStream Workspace] Local bridge write buffer exceeded its limit; reconnecting");
        socket_.abort();
        scheduleReconnect();
        return false;
    }

    const QByteArray frame = bridge_protocol::encode(std::move(message));
    if (frame.isEmpty()) {
        blog(LOG_WARNING, "[ilyStream Workspace] Refused to send an oversized local bridge frame");
        return false;
    }

    if (socket_.write(frame) < 0) {
        socket_.abort();
        scheduleReconnect();
        return false;
    }

    return true;
}

void BridgeClient::clearBridgeToken() {
    if (bridgeToken_.isEmpty()) {
        return;
    }
    bridgeToken_.fill(QChar(u'\0'));
    bridgeToken_.clear();
    bridgeToken_.squeeze();
}

void BridgeClient::processMessage(const QJsonObject& message) {
    const int receivedVersion = message.value(QStringLiteral("protocol")).toInt(-1);
    if (receivedVersion != bridge_protocol::kVersion) {
        rejectProtocol(receivedVersion);
        return;
    }

    const QString type = message.value(QStringLiteral("type")).toString();
    if (status_ == BridgeStatus::Handshaking) {
        if (type != QStringLiteral("hello.ack")) {
            return;
        }

        if (message.value(QStringLiteral("compatible")).isBool() &&
            !message.value(QStringLiteral("compatible")).toBool()) {
            protocolRejected_ = true;
            handshakeTimeout_.stop();
            const QString error = message.value(QStringLiteral("error")).toString().trimmed();
            updateStatus(BridgeStatus::Incompatible,
                         error.isEmpty() ? QStringLiteral("ilyStream rejected bridge protocol 1") : error);
            socket_.abort();
            return;
        }

        handshakeTimeout_.stop();
        reconnectAttempt_ = 0;
        QString detail = QStringLiteral("ilyStream bridge protocol 1");
        const QJsonObject payload = message.value(QStringLiteral("payload")).toObject();
        QString serverVersion = payload.value(QStringLiteral("appVersion")).toString();
        if (serverVersion.isEmpty()) {
            serverVersion = message.value(QStringLiteral("serverVersion")).toString();
        }
        if (!serverVersion.isEmpty()) {
            detail = QStringLiteral("ilyStream %1").arg(serverVersion);
        }
        updateStatus(BridgeStatus::Ready, detail);
        heartbeatTimer_.start();

        const QString programCapability = QString::fromLatin1(kProgramTransportCapability);
        programTransportNegotiated_ =
            program_transport_protocol::hasCapability(message.value(QStringLiteral("capabilities")),
                                                       programCapability) &&
            program_transport_protocol::hasCapability(message.value(QStringLiteral("negotiatedCapabilities")),
                                                       programCapability);
        if (programTransportRequested_) {
            sendProgramSubscribe();
        }

        const QJsonObject snapshot = payload.value(QStringLiteral("snapshot")).toObject();
        if (!snapshot.isEmpty() && snapshotHandler_) {
            snapshotHandler_(snapshot);
        }
        return;
    }

    if (!isReady()) {
        return;
    }

    if (type == QStringLiteral("ilystream.snapshot")) {
        const QJsonObject payload = message.value(QStringLiteral("payload")).toObject();
        if (snapshotHandler_) {
            snapshotHandler_(payload);
        }
        return;
    }

    if (type == QStringLiteral("command.result")) {
        if (commandResultHandler_) {
            QString requestId = message.value(QStringLiteral("requestId")).toString();
            if (requestId.isEmpty()) {
                requestId = message.value(QStringLiteral("id")).toString();
            }
            commandResultHandler_(requestId, message.value(QStringLiteral("ok")).toBool(),
                                  message.value(QStringLiteral("message")).toString());
        }
        return;
    }

    if (type == QStringLiteral("pong")) {
        return;
    }

    if (type == QStringLiteral("program.transport.available") && programTransportNegotiated_) {
        ProgramTransportEvent event;
        if (!program_transport_protocol::parseAvailable(message, event) ||
            event.subscriptionId != programSubscriptionId_) {
            blog(LOG_WARNING, "[ilyStream Workspace] Ignored an invalid Program transport descriptor");
            return;
        }
        if (event.lease.generation <= latestProgramGeneration_) {
            return;
        }
        if (programTransportLeases_.size() >= kMaximumOutstandingProgramTransports) {
            blog(LOG_WARNING, "[ilyStream Workspace] Ignored a Program transport beyond the lease limit");
            return;
        }
        latestProgramGeneration_ = event.lease.generation;
        programTransportLeases_.insert(programTransportLeaseKey(event.lease), event.lease);
        activeProgramTransport_ = event.lease;
        if (programTransportHandler_) {
            programTransportHandler_(event);
        }
        return;
    }

    if (type == QStringLiteral("program.transport.retiring") && programTransportNegotiated_) {
        ProgramTransportEvent event;
        if (!program_transport_protocol::parseRetiring(message, event) ||
            event.subscriptionId != programSubscriptionId_ ||
            !programTransportLeases_.contains(programTransportLeaseKey(event.lease))) {
            blog(LOG_WARNING, "[ilyStream Workspace] Ignored an invalid Program transport retirement");
            return;
        }
        if (programTransportHandler_) {
            programTransportHandler_(event);
        }
        return;
    }

    // Unknown message types are intentionally ignored. Protocol 1 has no inbound
    // command execution surface, so a local peer cannot drive OBS through this plugin.
}

bool BridgeClient::sendProgramSubscribe() {
    if (!programTransportRequested_ || !programTransportNegotiated_ || !isReady()) {
        return false;
    }
    if (!programSubscriptionId_.isEmpty()) {
        return true;
    }

    const QString subscriptionId = QUuid::createUuid().toString(QUuid::WithoutBraces).toLower();
    if (!sendMessage(program_transport_protocol::makeSubscribe(subscriptionId, utcTimestamp()), true)) {
        return false;
    }
    programSubscriptionId_ = subscriptionId;
    return true;
}

bool BridgeClient::sendProgramRelease(const QString& reason) {
    if (!programTransportNegotiated_ || programSubscriptionId_.isEmpty() || !isReady()) {
        return false;
    }
    const bool sent = sendMessage(
        program_transport_protocol::makeRelease(programSubscriptionId_, activeProgramTransport_, reason, utcTimestamp()),
        true);
    if (sent) {
        programSubscriptionId_.clear();
        activeProgramTransport_.reset();
        programTransportLeases_.clear();
        latestProgramGeneration_ = 0;
    }
    return sent;
}

void BridgeClient::resetProgramTransportState() {
    programTransportNegotiated_ = false;
    programSubscriptionId_.clear();
    activeProgramTransport_.reset();
    programTransportLeases_.clear();
    latestProgramGeneration_ = 0;
}

void BridgeClient::rejectProtocol(int receivedVersion) {
    protocolRejected_ = true;
    connectTimeout_.stop();
    handshakeTimeout_.stop();
    heartbeatTimer_.stop();
    const QString detail =
        receivedVersion < 0
            ? QStringLiteral("ilyStream did not identify its bridge protocol")
            : QStringLiteral("ilyStream uses bridge protocol %1; this plugin requires 1").arg(receivedVersion);
    updateStatus(BridgeStatus::Incompatible, detail);
    blog(LOG_WARNING, "[ilyStream Workspace] Local bridge protocol mismatch (received %d, required %d)",
         receivedVersion, bridge_protocol::kVersion);
    socket_.abort();
}

void BridgeClient::updateStatus(BridgeStatus status, const QString& detail) {
    if (status_ == status && statusDetail_ == detail) {
        return;
    }

    status_ = status;
    statusDetail_ = detail;
    if (statusHandler_) {
        statusHandler_(status_, statusDetail_);
    }
}

QString BridgeClient::socketErrorDetail() const {
    switch (socket_.error()) {
    case QLocalSocket::ServerNotFoundError:
    case QLocalSocket::ConnectionRefusedError:
        return QStringLiteral("ilyStream is not running");
    case QLocalSocket::PeerClosedError:
        return QStringLiteral("ilyStream closed the local bridge");
    default:
        break;
    }

    const QString error = socket_.errorString().trimmed();
    return error.isEmpty() ? QStringLiteral("ilyStream is offline") : error;
}

} // namespace ilystream
