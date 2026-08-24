// SPDX-License-Identifier: GPL-2.0-or-later
#include "../src/bridge-protocol.hpp"
#include "../src/bridge-credentials.hpp"
#include "../src/bridge-peer-verifier.hpp"
#include "../src/program-transport-descriptor.hpp"

#include <QCoreApplication>
#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLocalServer>
#include <QLocalSocket>
#include <QTemporaryDir>
#include <QUuid>

#include <cstdlib>
#include <iostream>
#include <limits>

namespace {

void require(bool condition, const char* message) {
    if (!condition) {
        std::cerr << "FAILED: " << message << '\n';
        std::exit(EXIT_FAILURE);
    }
}

void writeFile(const QString& path, const QByteArray& contents) {
    QFile file(path);
    require(file.open(QIODevice::WriteOnly | QIODevice::Truncate), "test credential file can be opened");
    require(file.write(contents) == contents.size(), "test credential file is written completely");
}

QJsonObject validProgramDescriptor() {
    return {
        {QStringLiteral("transportVersion"), 1},
        {QStringLiteral("transportId"), QStringLiteral("123e4567-e89b-42d3-a456-426614174000")},
        {QStringLiteral("generation"), QStringLiteral("7")},
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

} // namespace

int main(int argc, char** argv) {
    QCoreApplication application(argc, argv);
    QByteArray buffer;

    const QByteArray encoded = ilystream::bridge_protocol::encode({{QStringLiteral("type"), QStringLiteral("ping")}});
    require(encoded.endsWith('\n'), "encoded messages are newline terminated");
    require(encoded.contains("\"protocol\":1"), "encoded messages carry protocol version 1");

    auto batch = ilystream::bridge_protocol::consume(buffer, encoded.left(4));
    require(batch.messages.isEmpty(), "partial messages are buffered");
    batch = ilystream::bridge_protocol::consume(buffer, encoded.mid(4));
    require(batch.messages.size() == 1, "a completed frame is decoded exactly once");
    require(batch.messages.first().value(QStringLiteral("type")).toString() == QStringLiteral("ping"),
            "decoded payload is preserved");

    batch = ilystream::bridge_protocol::consume(buffer, QByteArrayLiteral("not-json\n{}\n"));
    require(batch.malformedFrames == 1, "malformed frames are counted and discarded");
    require(batch.messages.size() == 1, "valid frames following a malformed frame are retained");

    const QByteArray oversized(ilystream::bridge_protocol::kMaxFrameBytes + 1, 'x');
    batch = ilystream::bridge_protocol::consume(buffer, oversized);
    require(batch.bufferOverflow, "oversized unterminated frames are rejected");
    require(buffer.isEmpty(), "the buffer is cleared after an overflow");

    const QByteArray oversizedOutput = ilystream::bridge_protocol::encode(
        {{QStringLiteral("type"), QStringLiteral("snapshot")},
         {QStringLiteral("payload"),
          QString::fromLatin1(QByteArray(ilystream::bridge_protocol::kMaxFrameBytes, 'x'))}});
    require(oversizedOutput.isEmpty(), "outbound frames include their newline in the 64 KiB limit");

    using namespace ilystream;
    using namespace ilystream::program_transport_protocol;

    ProgramTransportDescriptor descriptor;
    require(parseDescriptor(validProgramDescriptor(), descriptor),
            "the strict Program transport descriptor is accepted");
    require(descriptor.generation == 7 && descriptor.video.width == 1920 && descriptor.video.height == 1080,
            "Program descriptor values are normalized");
    require(descriptor.video.duplicatedHandles[0] == QStringLiteral("00000000000000a1"),
            "target-process handles remain opaque lowercase hexadecimal strings");
    require(descriptor.video.controlHandle == QStringLiteral("00000000000000a3"),
            "the target-process video control mapping is normalized separately");

    QJsonObject invalidDescriptor = validProgramDescriptor();
    invalidDescriptor.insert(QStringLiteral("unexpected"), true);
    require(!parseDescriptor(invalidDescriptor, descriptor), "unknown descriptor fields are rejected");

    invalidDescriptor = validProgramDescriptor();
    QJsonObject invalidVideo = invalidDescriptor.value(QStringLiteral("video")).toObject();
    invalidVideo.insert(QStringLiteral("duplicatedHandles"),
                        QJsonArray({QStringLiteral("DEADBEEFDEADBEEF"), QStringLiteral("00000000000000a2")}));
    invalidDescriptor.insert(QStringLiteral("video"), invalidVideo);
    require(!parseDescriptor(invalidDescriptor, descriptor),
            "uppercase or non-canonical duplicated handles are rejected");

    invalidDescriptor = validProgramDescriptor();
    invalidVideo = invalidDescriptor.value(QStringLiteral("video")).toObject();
    invalidVideo.insert(QStringLiteral("controlHandle"), QStringLiteral("00000000000000a1"));
    invalidDescriptor.insert(QStringLiteral("video"), invalidVideo);
    require(!parseDescriptor(invalidDescriptor, descriptor),
            "the control mapping handle must be distinct from texture handles");

    invalidDescriptor = validProgramDescriptor();
    invalidVideo = invalidDescriptor.value(QStringLiteral("video")).toObject();
    invalidVideo.insert(QStringLiteral("slotCount"), 3);
    invalidDescriptor.insert(QStringLiteral("video"), invalidVideo);
    require(!parseDescriptor(invalidDescriptor, descriptor), "only the two-slot transport contract is accepted");

    invalidDescriptor = validProgramDescriptor();
    invalidVideo = invalidDescriptor.value(QStringLiteral("video")).toObject();
    invalidVideo.insert(QStringLiteral("adapterLuidHigh"), 0);
    invalidVideo.insert(QStringLiteral("adapterLuidLow"), 0);
    invalidDescriptor.insert(QStringLiteral("video"), invalidVideo);
    require(!parseDescriptor(invalidDescriptor, descriptor), "a missing adapter LUID is rejected");

    invalidDescriptor = validProgramDescriptor();
    invalidDescriptor.insert(QStringLiteral("generation"), QStringLiteral("18446744073709551616"));
    require(!parseDescriptor(invalidDescriptor, descriptor), "generation values above uint64 are rejected");

    const QString subscriptionId = QStringLiteral("9f16a6ec-4a34-4fb6-8468-d2a6bc6184e5");
    const QString sentAt = QStringLiteral("2026-08-24T12:34:56.789Z");
    QJsonObject available = {
        {QStringLiteral("protocol"), 1},
        {QStringLiteral("type"), QStringLiteral("program.transport.available")},
        {QStringLiteral("transportVersion"), 1},
        {QStringLiteral("subscriptionId"), subscriptionId},
        {QStringLiteral("descriptor"), validProgramDescriptor()},
        {QStringLiteral("sentAt"), sentAt},
    };
    ProgramTransportEvent event;
    require(parseAvailable(available, event), "a valid available message is accepted by the client contract");
    require(event.kind == ProgramTransportEventKind::Available && event.lease.generation == 7,
            "available messages retain their generation lease");

    QJsonObject staleShape = available;
    staleShape.insert(QStringLiteral("handle"), QStringLiteral("00000000000000ff"));
    require(!parseAvailable(staleShape, event), "available messages reject out-of-schema handle fields");

    QJsonObject retiring = {
        {QStringLiteral("protocol"), 1},
        {QStringLiteral("type"), QStringLiteral("program.transport.retiring")},
        {QStringLiteral("transportVersion"), 1},
        {QStringLiteral("subscriptionId"), subscriptionId},
        {QStringLiteral("transportId"), QStringLiteral("123e4567-e89b-42d3-a456-426614174000")},
        {QStringLiteral("generation"), QStringLiteral("7")},
        {QStringLiteral("reason"), QStringLiteral("producer-stopped")},
        {QStringLiteral("sentAt"), sentAt},
    };
    require(parseRetiring(retiring, event), "a valid retiring message is accepted by the client contract");
    require(event.kind == ProgramTransportEventKind::Retiring && event.lease.generation == 7,
            "retiring messages are tied to the exact transport generation");

    const QJsonObject subscribe = makeSubscribe(subscriptionId, sentAt);
    require(subscribe.value(QStringLiteral("type")).toString() == QStringLiteral("program.subscribe") &&
                !subscribe.contains(QStringLiteral("clientPid")),
            "subscribe messages do not echo the authenticated client PID");

    const QJsonObject subscriptionRelease = makeRelease(subscriptionId, std::nullopt,
                                                        QStringLiteral("consumer-stopped"), sentAt);
    require(subscriptionRelease.value(QStringLiteral("transportId")).isNull() &&
                subscriptionRelease.value(QStringLiteral("generation")).toString() == QStringLiteral("0"),
            "demand can be released before a transport generation is published");

    ProgramTransportStats stats;
    stats.lease = {QStringLiteral("123e4567-e89b-42d3-a456-426614174000"), 7};
    stats.videoFramesPresented = std::numeric_limits<quint64>::max();
    stats.lastVideoTimestampNs = 2000000000;
    const QJsonObject statsMessage = makeStats(subscriptionId, stats, sentAt);
    require(statsMessage.value(QStringLiteral("videoFramesPresented")).toString() ==
                QStringLiteral("18446744073709551615"),
            "client statistics preserve uint64 precision as decimal strings");

    require(hasCapability(QJsonArray({QStringLiteral("program.transport.v1")}),
                          QStringLiteral("program.transport.v1")),
            "Program transport v1 is capability negotiated");

    QTemporaryDir credentialDirectory;
    require(credentialDirectory.isValid(), "a temporary credential directory is available");
    const QString credentialPath = credentialDirectory.filePath(QStringLiteral("obs-bridge-v1.json"));
    const QString validToken(64, QLatin1Char('a'));
    writeFile(credentialPath, QJsonDocument({{QStringLiteral("protocol"), ilystream::bridge_protocol::kVersion},
                                             {QStringLiteral("token"), validToken}})
                                  .toJson(QJsonDocument::Compact));
    auto credential = ilystream::bridge_credentials::load(credentialPath);
    require(credential.ok(), "a valid bridge credential is accepted");
    require(credential.token == validToken, "the valid bridge token is preserved");

    writeFile(credentialPath, QJsonDocument({{QStringLiteral("protocol"), ilystream::bridge_protocol::kVersion},
                                             {QStringLiteral("token"), validToken},
                                             {QStringLiteral("unexpected"), true}})
                                  .toJson(QJsonDocument::Compact));
    credential = ilystream::bridge_credentials::load(credentialPath);
    require(credential.error == ilystream::bridge_credentials::LoadError::InvalidSchema,
            "extra credential fields are rejected");

    writeFile(credentialPath, QJsonDocument({{QStringLiteral("protocol"), ilystream::bridge_protocol::kVersion + 1},
                                             {QStringLiteral("token"), validToken}})
                                  .toJson(QJsonDocument::Compact));
    credential = ilystream::bridge_credentials::load(credentialPath);
    require(credential.error == ilystream::bridge_credentials::LoadError::IncompatibleProtocol,
            "credential protocol mismatches are rejected");

    writeFile(credentialPath, QJsonDocument({{QStringLiteral("protocol"), ilystream::bridge_protocol::kVersion},
                                             {QStringLiteral("token"), validToken.toUpper()}})
                                  .toJson(QJsonDocument::Compact));
    credential = ilystream::bridge_credentials::load(credentialPath);
    require(credential.error == ilystream::bridge_credentials::LoadError::InvalidToken,
            "tokens must be exactly 64 lowercase hexadecimal characters");

    writeFile(credentialPath, QByteArray(ilystream::bridge_credentials::kMaxCredentialBytes + 1, 'x'));
    credential = ilystream::bridge_credentials::load(credentialPath);
    require(credential.error == ilystream::bridge_credentials::LoadError::Oversized,
            "credential files over 4 KiB are rejected");

    credential = ilystream::bridge_credentials::load(credentialDirectory.filePath(QStringLiteral("missing.json")));
    require(credential.error == ilystream::bridge_credentials::LoadError::Missing,
            "missing credentials fail without weakening authentication");

    require(ilystream::bridge_credentials::defaultPath().replace('\\', '/').endsWith(
                QStringLiteral("/ilyStream/obs-bridge-v1.json")),
            "the default credential path is shared with the ilyStream app");

    require(
        ilystream::bridge_peer_verifier::isSameUserProcess(static_cast<quint32>(QCoreApplication::applicationPid())),
        "the current process is recognized as the same Windows user");
    require(!ilystream::bridge_peer_verifier::isSameUserProcess(0), "an invalid process is rejected");

    const QString pipeName =
        QStringLiteral("ilystream-obs-plugin-test-%1").arg(QUuid::createUuid().toString(QUuid::WithoutBraces));
    QLocalServer pipeServer;
    require(pipeServer.listen(pipeName), "a local test pipe can listen");
    QLocalSocket pipeClient;
    pipeClient.connectToServer(pipeName);
    require(pipeClient.waitForConnected(2000), "a local test pipe client can connect");
    require(pipeServer.waitForNewConnection(2000), "the local test pipe server accepts its client");
    require(ilystream::bridge_peer_verifier::isSameUserNamedPipeServer(pipeClient.socketDescriptor()),
            "the native pipe owner is recognized as the same Windows user");

    std::cout << "bridge protocol, credential, and peer tests passed\n";
    return EXIT_SUCCESS;
}
