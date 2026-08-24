// SPDX-License-Identifier: GPL-2.0-or-later
#include "../src/bridge-client.hpp"
#include "../src/bridge-protocol.hpp"

#include <QCoreApplication>
#include <QElapsedTimer>
#include <QEventLoop>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QLocalServer>
#include <QLocalSocket>
#include <QTemporaryDir>
#include <QThread>
#include <QUuid>

#include <cstdarg>
#include <cstdlib>
#include <functional>
#include <iostream>

extern "C" const char* obs_get_version_string(void) { return "32.2.2-test"; }
extern "C" void blog(int, const char*, ...) {}

namespace {

void require(bool condition, const char* message) {
    if (!condition) {
        std::cerr << "FAILED: " << message << '\n';
        std::exit(EXIT_FAILURE);
    }
}

bool waitUntil(const std::function<bool()>& predicate, int timeoutMs = 2500) {
    QElapsedTimer timer;
    timer.start();
    while (timer.elapsed() < timeoutMs) {
        QCoreApplication::processEvents(QEventLoop::AllEvents, 5);
        if (predicate()) {
            return true;
        }
        QThread::msleep(1);
    }
    return predicate();
}

class FrameReader {
  public:
    explicit FrameReader(QLocalSocket* socket) : socket_(socket) {}

    bool take(const QString& type, QJsonObject& output, int timeoutMs = 2500) {
        return waitUntil(
            [this, &type, &output]() {
                receive();
                for (qsizetype index = 0; index < messages_.size(); ++index) {
                    if (messages_.at(index).value(QStringLiteral("type")).toString() != type) {
                        continue;
                    }
                    output = messages_.takeAt(index);
                    return true;
                }
                return false;
            },
            timeoutMs);
    }

  private:
    void receive() {
        if (!socket_) {
            return;
        }
        const auto decoded = ilystream::bridge_protocol::consume(buffer_, socket_->readAll());
        messages_.append(decoded.messages);
    }

    QLocalSocket* socket_ = nullptr;
    QByteArray buffer_;
    QList<QJsonObject> messages_;
};

QJsonObject validProgramDescriptor(quint64 generation) {
    return {
        {QStringLiteral("transportVersion"), 1},
        {QStringLiteral("transportId"), QStringLiteral("123e4567-e89b-42d3-a456-426614174000")},
        {QStringLiteral("generation"), QString::number(generation)},
        {QStringLiteral("producerPid"), 7777},
        {QStringLiteral("video"),
         QJsonObject({
             {QStringLiteral("adapterLuidHigh"), -1},
             {QStringLiteral("adapterLuidLow"), 4294967294.0},
             {QStringLiteral("width"), 1920},
             {QStringLiteral("height"), 1080},
             {QStringLiteral("format"), QStringLiteral("rgba8")},
             {QStringLiteral("colorSpace"), QStringLiteral("srgb")},
             {QStringLiteral("slotCount"), 2},
             {QStringLiteral("duplicatedHandles"),
              QJsonArray({QStringLiteral("00000000000000a1"), QStringLiteral("00000000000000a2")})},
             {QStringLiteral("controlHandle"), QStringLiteral("00000000000000a3")},
             {QStringLiteral("keyedMutex"), true},
             {QStringLiteral("producerAcquireKey"), QStringLiteral("0")},
             {QStringLiteral("consumerAcquireKey"), QStringLiteral("1")},
         })},
        {QStringLiteral("audio"),
         QJsonObject({
             {QStringLiteral("sampleRate"), 48000},
             {QStringLiteral("channels"), 2},
             {QStringLiteral("format"), QStringLiteral("f32-interleaved")},
             {QStringLiteral("ringName"),
              QStringLiteral("Local\\ilyStream.Program.Audio.123e4567-e89b-42d3-a456-426614174000")},
             {QStringLiteral("capacityFrames"), 96000},
             {QStringLiteral("blockFrames"), 480},
             {QStringLiteral("timestampTimebase"), QStringLiteral("ns")},
         })},
    };
}

void writeCredential(const QString& path, const QString& token) {
    QFile file(path);
    require(file.open(QIODevice::WriteOnly | QIODevice::Truncate), "the client test credential can be opened");
    const QByteArray contents = QJsonDocument({{QStringLiteral("protocol"), 1}, {QStringLiteral("token"), token}})
                                    .toJson(QJsonDocument::Compact);
    require(file.write(contents) == contents.size(), "the client test credential is written completely");
}

void acknowledge(QLocalSocket* peer) {
    const QJsonArray capabilities = {QStringLiteral("program.transport.v1")};
    peer->write(ilystream::bridge_protocol::encode({
        {QStringLiteral("type"), QStringLiteral("hello.ack")},
        {QStringLiteral("compatible"), true},
        {QStringLiteral("serverVersion"), QStringLiteral("0.0.27-test")},
        {QStringLiteral("capabilities"), capabilities},
        {QStringLiteral("negotiatedCapabilities"), capabilities},
        {QStringLiteral("payload"),
         QJsonObject({
             {QStringLiteral("appVersion"), QStringLiteral("0.0.27-test")},
             {QStringLiteral("protocol"), 1},
             {QStringLiteral("capabilities"), capabilities},
             {QStringLiteral("negotiatedCapabilities"), capabilities},
         })},
    }));
}

} // namespace

int main(int argc, char** argv) {
    QCoreApplication application(argc, argv);
    QTemporaryDir directory;
    require(directory.isValid(), "a client test directory is available");

    const QString token(64, QLatin1Char('a'));
    const QString credentialPath = directory.filePath(QStringLiteral("obs-bridge-v1.json"));
    writeCredential(credentialPath, token);

    const QString serverName =
        QStringLiteral("ilystream-obs-client-test-%1").arg(QUuid::createUuid().toString(QUuid::WithoutBraces));
    QLocalServer server;
    require(server.listen(serverName), "the client test bridge can listen");

    ilystream::BridgeClient client(serverName, credentialPath);
    int programEvents = 0;
    ilystream::ProgramTransportEvent latestEvent;
    client.setProgramTransportHandler([&](const ilystream::ProgramTransportEvent& event) {
        ++programEvents;
        latestEvent = event;
    });
    client.setProgramTransportRequested(true);
    client.start();

    require(waitUntil([&server]() { return server.hasPendingConnections(); }), "the bridge client connects");
    QLocalSocket* peer = server.nextPendingConnection();
    require(peer != nullptr, "the test bridge accepts the client");
    FrameReader reader(peer);
    QJsonObject hello;
    require(reader.take(QStringLiteral("hello"), hello), "the bridge client sends hello");
    require(hello.value(QStringLiteral("authToken")).toString() == token, "hello uses the persisted credential");
    require(hello.value(QStringLiteral("clientPid")).toDouble() > 0, "hello carries a bounded client PID");
    require(ilystream::program_transport_protocol::hasCapability(
                hello.value(QStringLiteral("capabilities")), QStringLiteral("program.transport.v1")),
            "hello advertises Program transport v1");

    acknowledge(peer);
    QJsonObject subscribe;
    require(reader.take(QStringLiteral("program.subscribe"), subscribe),
            "demand subscribes after capability negotiation");
    const QString firstSubscriptionId = subscribe.value(QStringLiteral("subscriptionId")).toString();
    require(!firstSubscriptionId.isEmpty() && !subscribe.contains(QStringLiteral("clientPid")),
            "the subscription does not echo the authenticated PID");

    const QString sentAt = QStringLiteral("2026-08-24T12:34:56.789Z");
    peer->write(ilystream::bridge_protocol::encode({
        {QStringLiteral("type"), QStringLiteral("program.transport.available")},
        {QStringLiteral("transportVersion"), 1},
        {QStringLiteral("subscriptionId"), firstSubscriptionId},
        {QStringLiteral("descriptor"), validProgramDescriptor(7)},
        {QStringLiteral("sentAt"), sentAt},
    }));
    require(waitUntil([&programEvents]() { return programEvents == 1; }),
            "the client delivers a validated available generation");
    require(latestEvent.kind == ilystream::ProgramTransportEventKind::Available &&
                latestEvent.lease.generation == 7,
            "the client handler receives normalized generation state");
    const ilystream::ProgramTransportLease firstLease = latestEvent.lease;

    peer->write(ilystream::bridge_protocol::encode({
        {QStringLiteral("type"), QStringLiteral("program.transport.available")},
        {QStringLiteral("transportVersion"), 1},
        {QStringLiteral("subscriptionId"), firstSubscriptionId},
        {QStringLiteral("descriptor"), validProgramDescriptor(7)},
        {QStringLiteral("sentAt"), sentAt},
    }));
    require(waitUntil([&client]() { return client.isReady(); }, 250), "the client remains ready after a stale frame");
    require(programEvents == 1, "duplicate or stale generations are not delivered twice");

    ilystream::ProgramTransportStats stats;
    stats.lease = latestEvent.lease;
    stats.videoFramesPresented = 120;
    stats.audioFramesRead = 96000;
    require(client.sendProgramTransportStats(stats), "stats are sent only for the active generation");
    QJsonObject statsFrame;
    require(reader.take(QStringLiteral("program.transport.stats"), statsFrame), "the active generation emits stats");
    require(statsFrame.value(QStringLiteral("videoFramesPresented")).toString() == QStringLiteral("120"),
            "stats counters remain precision-safe strings");

    peer->write(ilystream::bridge_protocol::encode({
        {QStringLiteral("type"), QStringLiteral("program.transport.available")},
        {QStringLiteral("transportVersion"), 1},
        {QStringLiteral("subscriptionId"), firstSubscriptionId},
        {QStringLiteral("descriptor"), validProgramDescriptor(8)},
        {QStringLiteral("sentAt"), sentAt},
    }));
    require(waitUntil([&programEvents]() { return programEvents == 2; }),
            "a newer generation becomes available before the old lease is released");
    require(latestEvent.lease.generation == 8, "the newest generation becomes the active stats lease");

    peer->write(ilystream::bridge_protocol::encode({
        {QStringLiteral("type"), QStringLiteral("program.transport.retiring")},
        {QStringLiteral("transportVersion"), 1},
        {QStringLiteral("subscriptionId"), firstSubscriptionId},
        {QStringLiteral("transportId"), firstLease.transportId},
        {QStringLiteral("generation"), QString::number(firstLease.generation)},
        {QStringLiteral("reason"), QStringLiteral("replaced")},
        {QStringLiteral("sentAt"), sentAt},
    }));
    require(waitUntil([&programEvents]() { return programEvents == 3; }),
            "retirement can target an older outstanding generation");
    require(client.releaseProgramTransport(firstLease), "the retired generation is released without dropping demand");
    QJsonObject replacedRelease;
    require(reader.take(QStringLiteral("program.transport.release"), replacedRelease),
            "the old generation emits a targeted release");
    require(replacedRelease.value(QStringLiteral("generation")).toString() == QStringLiteral("7") &&
                replacedRelease.value(QStringLiteral("reason")).toString() == QStringLiteral("replaced"),
            "replacement release preserves the old generation identity");

    client.setProgramTransportRequested(false);
    QJsonObject release;
    require(reader.take(QStringLiteral("program.transport.release"), release),
            "dropping final demand releases the active generation");
    require(release.value(QStringLiteral("transportId")).toString() == firstLease.transportId &&
                release.value(QStringLiteral("generation")).toString() == QStringLiteral("8"),
            "release is scoped to the active transport generation");

    client.setProgramTransportRequested(true);
    QJsonObject secondSubscribe;
    require(reader.take(QStringLiteral("program.subscribe"), secondSubscribe), "demand can subscribe again idempotently");
    require(secondSubscribe.value(QStringLiteral("subscriptionId")).toString() != firstSubscriptionId,
            "a new demand lease uses a new subscription identity");

    client.forceReconnect();
    require(waitUntil([&server]() { return server.hasPendingConnections(); }), "the bridge client reconnects");
    QLocalSocket* secondPeer = server.nextPendingConnection();
    require(secondPeer != nullptr, "the reconnected bridge is accepted");
    FrameReader secondReader(secondPeer);
    require(secondReader.take(QStringLiteral("hello"), hello), "the reconnected client authenticates again");
    acknowledge(secondPeer);
    require(secondReader.take(QStringLiteral("program.subscribe"), subscribe),
            "active demand automatically re-subscribes after reconnect");

    client.stop();
    peer->deleteLater();
    secondPeer->deleteLater();
    server.close();
    std::cout << "bridge client capability, demand, and generation tests passed\n";
    return EXIT_SUCCESS;
}
