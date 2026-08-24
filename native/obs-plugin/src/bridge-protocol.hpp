// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once

#include <QJsonDocument>
#include <QJsonObject>
#include <QList>
#include <QString>

namespace ilystream::bridge_protocol {

inline constexpr int kVersion = 1;
inline constexpr qsizetype kMaxFrameBytes = 64 * 1024;
inline constexpr qsizetype kMaxBufferedBytes = 4 * kMaxFrameBytes;
inline constexpr auto kServerName = "ilystream.obs.bridge.v1";

struct DecodeBatch {
    QList<QJsonObject> messages;
    int malformedFrames = 0;
    bool bufferOverflow = false;
};

inline QByteArray encode(QJsonObject message) {
    message.insert(QStringLiteral("protocol"), kVersion);
    QByteArray frame = QJsonDocument(message).toJson(QJsonDocument::Compact);
    if (frame.size() + 1 > kMaxFrameBytes) {
        return {};
    }

    frame.append('\n');
    return frame;
}

inline DecodeBatch consume(QByteArray& buffer, const QByteArray& chunk) {
    DecodeBatch result;

    if (chunk.size() > kMaxBufferedBytes || buffer.size() > kMaxBufferedBytes - chunk.size()) {
        buffer.clear();
        result.bufferOverflow = true;
        return result;
    }

    buffer.append(chunk);

    qsizetype newlineIndex = -1;
    while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
        QByteArray frame = buffer.left(newlineIndex);
        buffer.remove(0, newlineIndex + 1);

        if (frame.endsWith('\r')) {
            frame.chop(1);
        }
        if (frame.isEmpty()) {
            continue;
        }
        if (frame.size() > kMaxFrameBytes) {
            ++result.malformedFrames;
            continue;
        }

        QJsonParseError parseError;
        const QJsonDocument document = QJsonDocument::fromJson(frame, &parseError);
        if (parseError.error != QJsonParseError::NoError || !document.isObject()) {
            ++result.malformedFrames;
            continue;
        }

        result.messages.append(document.object());
    }

    if (buffer.size() > kMaxFrameBytes) {
        buffer.clear();
        result.bufferOverflow = true;
    }

    return result;
}

} // namespace ilystream::bridge_protocol
