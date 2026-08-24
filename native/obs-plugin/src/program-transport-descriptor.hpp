// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once

#include <QJsonArray>
#include <QJsonObject>
#include <QRegularExpression>
#include <QSet>
#include <QString>

#include <array>
#include <cmath>
#include <limits>
#include <optional>
#include <utility>

namespace ilystream {

inline constexpr int kProgramTransportVersion = 1;
inline constexpr auto kProgramTransportCapability = "program.transport.v1";

struct ProgramVideoTransportDescriptor {
    qint32 adapterLuidHigh = 0;
    quint32 adapterLuidLow = 0;
    quint32 width = 0;
    quint32 height = 0;
    QString format;
    QString colorSpace;
    std::array<QString, 2> duplicatedHandles;
    QString controlHandle;
    quint64 producerAcquireKey = 0;
    quint64 consumerAcquireKey = 1;
};

struct ProgramAudioTransportDescriptor {
    quint32 sampleRate = 0;
    quint32 channels = 0;
    QString format;
    QString ringName;
    quint32 capacityFrames = 0;
    quint32 blockFrames = 0;
    QString timestampTimebase;
};

struct ProgramTransportDescriptor {
    int transportVersion = 0;
    QString transportId;
    quint64 generation = 0;
    quint32 producerPid = 0;
    ProgramVideoTransportDescriptor video;
    ProgramAudioTransportDescriptor audio;
};

struct ProgramTransportLease {
    QString transportId;
    quint64 generation = 0;
};

struct ProgramTransportStats {
    ProgramTransportLease lease;
    quint64 videoFramesPresented = 0;
    quint64 videoFramesDropped = 0;
    quint64 audioFramesRead = 0;
    quint64 audioUnderruns = 0;
    std::optional<quint64> lastVideoTimestampNs;
    std::optional<quint64> lastAudioTimestampNs;
};

enum class ProgramTransportEventKind {
    Available,
    Retiring,
};

struct ProgramTransportEvent {
    ProgramTransportEventKind kind = ProgramTransportEventKind::Available;
    QString subscriptionId;
    ProgramTransportDescriptor descriptor;
    ProgramTransportLease lease;
    QString reason;
};

namespace program_transport_protocol {

inline constexpr quint32 kMaximumVideoDimension = 16384;
inline constexpr quint32 kMaximumAudioCapacityFrames = 480000;
inline constexpr quint32 kMaximumAudioBlockFrames = 4096;

inline bool hasExactKeys(const QJsonObject& object, const QSet<QString>& required,
                         const QSet<QString>& optional = {}) {
    for (const QString& key : required) {
        if (!object.contains(key)) {
            return false;
        }
    }
    for (auto iterator = object.constBegin(); iterator != object.constEnd(); ++iterator) {
        if (!required.contains(iterator.key()) && !optional.contains(iterator.key())) {
            return false;
        }
    }
    return true;
}

inline bool parseInteger(const QJsonValue& value, qint64 minimum, quint64 maximum, qint64& output) {
    if (!value.isDouble()) {
        return false;
    }
    const double number = value.toDouble();
    if (!std::isfinite(number) || std::floor(number) != number || number < static_cast<double>(minimum) ||
        number > static_cast<double>(maximum)) {
        return false;
    }
    output = static_cast<qint64>(number);
    return true;
}

inline bool parseUnsignedInteger(const QJsonValue& value, quint64 minimum, quint64 maximum, quint64& output) {
    if (!value.isDouble()) {
        return false;
    }
    const double number = value.toDouble();
    if (!std::isfinite(number) || std::floor(number) != number || number < static_cast<double>(minimum) ||
        number > static_cast<double>(maximum)) {
        return false;
    }
    output = static_cast<quint64>(number);
    return true;
}

inline bool parseUint64String(const QJsonValue& value, bool allowZero, quint64& output) {
    if (!value.isString()) {
        return false;
    }
    const QString text = value.toString();
    static const QRegularExpression pattern(QStringLiteral("^(?:0|[1-9][0-9]{0,19})$"));
    if (!pattern.match(text).hasMatch() || (!allowZero && text == QStringLiteral("0"))) {
        return false;
    }
    bool ok = false;
    const quint64 parsed = text.toULongLong(&ok, 10);
    if (!ok) {
        return false;
    }
    output = parsed;
    return true;
}

inline bool isCanonicalUuid(const QJsonValue& value) {
    if (!value.isString()) {
        return false;
    }
    static const QRegularExpression pattern(
        QStringLiteral("^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$"));
    return pattern.match(value.toString()).hasMatch();
}

inline bool isDuplicatedHandle(const QJsonValue& value) {
    if (!value.isString()) {
        return false;
    }
    const QString text = value.toString();
    static const QRegularExpression pattern(QStringLiteral("^[0-9a-f]{16}$"));
    return text != QStringLiteral("0000000000000000") && pattern.match(text).hasMatch();
}

inline bool isSentAt(const QJsonValue& value) {
    if (!value.isString()) {
        return false;
    }
    static const QRegularExpression pattern(
        QStringLiteral("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$"));
    return pattern.match(value.toString()).hasMatch();
}

inline bool isReason(const QJsonValue& value) {
    if (!value.isString()) {
        return false;
    }
    static const QRegularExpression pattern(QStringLiteral("^[a-z][a-z0-9.-]{0,63}$"));
    return pattern.match(value.toString()).hasMatch();
}

inline bool parseVideoDescriptor(const QJsonObject& object, ProgramVideoTransportDescriptor& output) {
    static const QSet<QString> keys = {
        QStringLiteral("adapterLuidHigh"),  QStringLiteral("adapterLuidLow"),
        QStringLiteral("width"),            QStringLiteral("height"),
        QStringLiteral("format"),           QStringLiteral("colorSpace"),
        QStringLiteral("slotCount"),        QStringLiteral("duplicatedHandles"),
        QStringLiteral("controlHandle"),
        QStringLiteral("keyedMutex"),       QStringLiteral("producerAcquireKey"),
        QStringLiteral("consumerAcquireKey"),
    };
    if (!hasExactKeys(object, keys)) {
        return false;
    }

    qint64 adapterLuidHigh = 0;
    quint64 adapterLuidLow = 0;
    quint64 width = 0;
    quint64 height = 0;
    quint64 slotCount = 0;
    quint64 producerAcquireKey = 0;
    quint64 consumerAcquireKey = 0;
    if (!parseInteger(object.value(QStringLiteral("adapterLuidHigh")), std::numeric_limits<qint32>::min(),
                      std::numeric_limits<qint32>::max(), adapterLuidHigh) ||
        !parseUnsignedInteger(object.value(QStringLiteral("adapterLuidLow")), 0,
                              std::numeric_limits<quint32>::max(), adapterLuidLow) ||
        (adapterLuidHigh == 0 && adapterLuidLow == 0) ||
        !parseUnsignedInteger(object.value(QStringLiteral("width")), 1, kMaximumVideoDimension, width) ||
        !parseUnsignedInteger(object.value(QStringLiteral("height")), 1, kMaximumVideoDimension, height) ||
        !parseUnsignedInteger(object.value(QStringLiteral("slotCount")), 2, 2, slotCount) ||
        !parseUint64String(object.value(QStringLiteral("producerAcquireKey")), true, producerAcquireKey) ||
        !parseUint64String(object.value(QStringLiteral("consumerAcquireKey")), false, consumerAcquireKey) ||
        producerAcquireKey != 0 || consumerAcquireKey != 1 ||
        object.value(QStringLiteral("format")).toString() != QStringLiteral("rgba8") ||
        object.value(QStringLiteral("colorSpace")).toString() != QStringLiteral("srgb") ||
        object.value(QStringLiteral("keyedMutex")) != QJsonValue(true)) {
        return false;
    }

    const QJsonValue handlesValue = object.value(QStringLiteral("duplicatedHandles"));
    if (!handlesValue.isArray()) {
        return false;
    }
    const QJsonArray handles = handlesValue.toArray();
    if (handles.size() != 2 || !isDuplicatedHandle(handles.at(0)) || !isDuplicatedHandle(handles.at(1)) ||
        handles.at(0).toString() == handles.at(1).toString()) {
        return false;
    }
    const QJsonValue controlHandle = object.value(QStringLiteral("controlHandle"));
    if (!isDuplicatedHandle(controlHandle) || controlHandle.toString() == handles.at(0).toString() ||
        controlHandle.toString() == handles.at(1).toString()) {
        return false;
    }

    ProgramVideoTransportDescriptor parsed;
    parsed.adapterLuidHigh = static_cast<qint32>(adapterLuidHigh);
    parsed.adapterLuidLow = static_cast<quint32>(adapterLuidLow);
    parsed.width = static_cast<quint32>(width);
    parsed.height = static_cast<quint32>(height);
    parsed.format = QStringLiteral("rgba8");
    parsed.colorSpace = QStringLiteral("srgb");
    parsed.duplicatedHandles = {handles.at(0).toString(), handles.at(1).toString()};
    parsed.controlHandle = controlHandle.toString();
    parsed.producerAcquireKey = producerAcquireKey;
    parsed.consumerAcquireKey = consumerAcquireKey;
    output = std::move(parsed);
    return true;
}

inline bool parseAudioDescriptor(const QJsonObject& object, ProgramAudioTransportDescriptor& output) {
    static const QSet<QString> keys = {
        QStringLiteral("sampleRate"),       QStringLiteral("channels"),
        QStringLiteral("format"),           QStringLiteral("ringName"),
        QStringLiteral("capacityFrames"),   QStringLiteral("blockFrames"),
        QStringLiteral("timestampTimebase"),
    };
    if (!hasExactKeys(object, keys)) {
        return false;
    }

    quint64 sampleRate = 0;
    quint64 channels = 0;
    quint64 capacityFrames = 0;
    quint64 blockFrames = 0;
    if (!parseUnsignedInteger(object.value(QStringLiteral("sampleRate")), 48000, 48000, sampleRate) ||
        !parseUnsignedInteger(object.value(QStringLiteral("channels")), 2, 2, channels) ||
        !parseUnsignedInteger(object.value(QStringLiteral("blockFrames")), 1, kMaximumAudioBlockFrames,
                              blockFrames) ||
        !parseUnsignedInteger(object.value(QStringLiteral("capacityFrames")), blockFrames,
                              kMaximumAudioCapacityFrames, capacityFrames) ||
        capacityFrames % blockFrames != 0 ||
        object.value(QStringLiteral("format")).toString() != QStringLiteral("f32-interleaved") ||
        object.value(QStringLiteral("timestampTimebase")).toString() != QStringLiteral("ns")) {
        return false;
    }

    const QString ringName = object.value(QStringLiteral("ringName")).toString();
    static const QRegularExpression ringPattern(
        QStringLiteral("^Local\\\\ilyStream\\.Program\\.Audio\\.[A-Za-z0-9][A-Za-z0-9._-]{0,63}$"));
    if (!ringPattern.match(ringName).hasMatch()) {
        return false;
    }

    ProgramAudioTransportDescriptor parsed;
    parsed.sampleRate = static_cast<quint32>(sampleRate);
    parsed.channels = static_cast<quint32>(channels);
    parsed.format = QStringLiteral("f32-interleaved");
    parsed.ringName = ringName;
    parsed.capacityFrames = static_cast<quint32>(capacityFrames);
    parsed.blockFrames = static_cast<quint32>(blockFrames);
    parsed.timestampTimebase = QStringLiteral("ns");
    output = std::move(parsed);
    return true;
}

inline bool parseDescriptor(const QJsonValue& value, ProgramTransportDescriptor& output) {
    if (!value.isObject()) {
        return false;
    }
    const QJsonObject object = value.toObject();
    static const QSet<QString> keys = {
        QStringLiteral("transportVersion"), QStringLiteral("transportId"), QStringLiteral("generation"),
        QStringLiteral("producerPid"),      QStringLiteral("video"),       QStringLiteral("audio"),
    };
    if (!hasExactKeys(object, keys) || object.value(QStringLiteral("transportVersion")).toInt(-1) != 1 ||
        !isCanonicalUuid(object.value(QStringLiteral("transportId")))) {
        return false;
    }

    quint64 generation = 0;
    quint64 producerPid = 0;
    ProgramVideoTransportDescriptor video;
    ProgramAudioTransportDescriptor audio;
    if (!parseUint64String(object.value(QStringLiteral("generation")), false, generation) ||
        !parseUnsignedInteger(object.value(QStringLiteral("producerPid")), 1,
                              std::numeric_limits<quint32>::max(), producerPid) ||
        !object.value(QStringLiteral("video")).isObject() || !object.value(QStringLiteral("audio")).isObject() ||
        !parseVideoDescriptor(object.value(QStringLiteral("video")).toObject(), video) ||
        !parseAudioDescriptor(object.value(QStringLiteral("audio")).toObject(), audio)) {
        return false;
    }

    ProgramTransportDescriptor parsed;
    parsed.transportVersion = 1;
    parsed.transportId = object.value(QStringLiteral("transportId")).toString();
    parsed.generation = generation;
    parsed.producerPid = static_cast<quint32>(producerPid);
    parsed.video = std::move(video);
    parsed.audio = std::move(audio);
    output = std::move(parsed);
    return true;
}

inline bool parseAvailable(const QJsonObject& message, ProgramTransportEvent& output) {
    static const QSet<QString> required = {
        QStringLiteral("protocol"),         QStringLiteral("type"),
        QStringLiteral("transportVersion"), QStringLiteral("subscriptionId"),
        QStringLiteral("descriptor"),       QStringLiteral("sentAt"),
    };
    if (!hasExactKeys(message, required) || message.value(QStringLiteral("protocol")).toInt(-1) != 1 ||
        message.value(QStringLiteral("type")).toString() != QStringLiteral("program.transport.available") ||
        message.value(QStringLiteral("transportVersion")).toInt(-1) != 1 ||
        !isCanonicalUuid(message.value(QStringLiteral("subscriptionId"))) ||
        !isSentAt(message.value(QStringLiteral("sentAt")))) {
        return false;
    }

    ProgramTransportDescriptor descriptor;
    if (!parseDescriptor(message.value(QStringLiteral("descriptor")), descriptor)) {
        return false;
    }

    ProgramTransportEvent parsed;
    parsed.kind = ProgramTransportEventKind::Available;
    parsed.subscriptionId = message.value(QStringLiteral("subscriptionId")).toString();
    parsed.descriptor = descriptor;
    parsed.lease = {descriptor.transportId, descriptor.generation};
    output = std::move(parsed);
    return true;
}

inline bool parseRetiring(const QJsonObject& message, ProgramTransportEvent& output) {
    static const QSet<QString> required = {
        QStringLiteral("protocol"),         QStringLiteral("type"),       QStringLiteral("transportVersion"),
        QStringLiteral("subscriptionId"),   QStringLiteral("transportId"),
        QStringLiteral("generation"),       QStringLiteral("reason"),     QStringLiteral("sentAt"),
    };
    if (!hasExactKeys(message, required) || message.value(QStringLiteral("protocol")).toInt(-1) != 1 ||
        message.value(QStringLiteral("type")).toString() != QStringLiteral("program.transport.retiring") ||
        message.value(QStringLiteral("transportVersion")).toInt(-1) != 1 ||
        !isCanonicalUuid(message.value(QStringLiteral("subscriptionId"))) ||
        !isCanonicalUuid(message.value(QStringLiteral("transportId"))) ||
        !isReason(message.value(QStringLiteral("reason"))) || !isSentAt(message.value(QStringLiteral("sentAt")))) {
        return false;
    }

    quint64 generation = 0;
    if (!parseUint64String(message.value(QStringLiteral("generation")), false, generation)) {
        return false;
    }

    ProgramTransportEvent parsed;
    parsed.kind = ProgramTransportEventKind::Retiring;
    parsed.subscriptionId = message.value(QStringLiteral("subscriptionId")).toString();
    parsed.lease = {message.value(QStringLiteral("transportId")).toString(), generation};
    parsed.reason = message.value(QStringLiteral("reason")).toString();
    output = std::move(parsed);
    return true;
}

inline QJsonObject makeSubscribe(const QString& subscriptionId, const QString& sentAt) {
    return {
        {QStringLiteral("type"), QStringLiteral("program.subscribe")},
        {QStringLiteral("transportVersion"), 1},
        {QStringLiteral("subscriptionId"), subscriptionId},
        {QStringLiteral("sentAt"), sentAt},
    };
}

inline QJsonObject makeRelease(const QString& subscriptionId, const std::optional<ProgramTransportLease>& lease,
                               const QString& reason, const QString& sentAt) {
    return {
        {QStringLiteral("type"), QStringLiteral("program.transport.release")},
        {QStringLiteral("transportVersion"), 1},
        {QStringLiteral("subscriptionId"), subscriptionId},
        {QStringLiteral("transportId"), lease ? QJsonValue(lease->transportId) : QJsonValue(QJsonValue::Null)},
        {QStringLiteral("generation"), lease ? QString::number(lease->generation) : QStringLiteral("0")},
        {QStringLiteral("reason"), reason},
        {QStringLiteral("sentAt"), sentAt},
    };
}

inline QJsonObject makeStats(const QString& subscriptionId, const ProgramTransportStats& stats,
                             const QString& sentAt) {
    return {
        {QStringLiteral("type"), QStringLiteral("program.transport.stats")},
        {QStringLiteral("transportVersion"), 1},
        {QStringLiteral("subscriptionId"), subscriptionId},
        {QStringLiteral("transportId"), stats.lease.transportId},
        {QStringLiteral("generation"), QString::number(stats.lease.generation)},
        {QStringLiteral("videoFramesPresented"), QString::number(stats.videoFramesPresented)},
        {QStringLiteral("videoFramesDropped"), QString::number(stats.videoFramesDropped)},
        {QStringLiteral("audioFramesRead"), QString::number(stats.audioFramesRead)},
        {QStringLiteral("audioUnderruns"), QString::number(stats.audioUnderruns)},
        {QStringLiteral("lastVideoTimestampNs"), stats.lastVideoTimestampNs
                                                       ? QJsonValue(QString::number(*stats.lastVideoTimestampNs))
                                                       : QJsonValue(QJsonValue::Null)},
        {QStringLiteral("lastAudioTimestampNs"), stats.lastAudioTimestampNs
                                                       ? QJsonValue(QString::number(*stats.lastAudioTimestampNs))
                                                       : QJsonValue(QJsonValue::Null)},
        {QStringLiteral("sentAt"), sentAt},
    };
}

inline bool hasCapability(const QJsonValue& value, const QString& capability) {
    if (!value.isArray()) {
        return false;
    }
    const QJsonArray capabilities = value.toArray();
    for (const QJsonValue& candidate : capabilities) {
        if (candidate.isString() && candidate.toString() == capability) {
            return true;
        }
    }
    return false;
}

} // namespace program_transport_protocol
} // namespace ilystream
