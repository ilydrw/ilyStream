// SPDX-License-Identifier: GPL-2.0-or-later
#include "bridge-credentials.hpp"

#include "bridge-protocol.hpp"

#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonObject>

#include <windows.h>
#include <shlobj.h>

namespace ilystream::bridge_credentials {
namespace {

bool isValidToken(const QString& token) {
    if (token.size() != 64) {
        return false;
    }

    for (const QChar character : token) {
        if (!(character.isDigit() || (character >= QLatin1Char('a') && character <= QLatin1Char('f')))) {
            return false;
        }
    }
    return true;
}

} // namespace

QString defaultPath() {
    PWSTR roamingPath = nullptr;
    const HRESULT result = SHGetKnownFolderPath(FOLDERID_RoamingAppData, KF_FLAG_DEFAULT, nullptr, &roamingPath);
    if (FAILED(result) || roamingPath == nullptr) {
        if (roamingPath != nullptr) {
            CoTaskMemFree(roamingPath);
        }
        return {};
    }

    const QString basePath = QString::fromWCharArray(roamingPath);
    CoTaskMemFree(roamingPath);
    return QDir(basePath).filePath(QStringLiteral("ilyStream/obs-bridge-v1.json"));
}

LoadResult load(const QString& path) {
    const QString credentialPath = path.isEmpty() ? defaultPath() : path;
    if (credentialPath.isEmpty()) {
        return {{}, LoadError::LocationUnavailable};
    }

    const QFileInfo fileInfo(credentialPath);
    if (!fileInfo.exists()) {
        return {{}, LoadError::Missing};
    }
    if (!fileInfo.isFile()) {
        return {{}, LoadError::Unreadable};
    }
    if (fileInfo.size() <= 0 || fileInfo.size() > kMaxCredentialBytes) {
        return {{}, LoadError::Oversized};
    }

    QFile file(credentialPath);
    if (!file.open(QIODevice::ReadOnly)) {
        return {{}, LoadError::Unreadable};
    }

    const QByteArray bytes = file.read(kMaxCredentialBytes + 1);
    if (bytes.isEmpty() || bytes.size() > kMaxCredentialBytes) {
        return {{}, LoadError::Oversized};
    }

    QJsonParseError parseError;
    const QJsonDocument document = QJsonDocument::fromJson(bytes, &parseError);
    if (parseError.error != QJsonParseError::NoError || !document.isObject()) {
        return {{}, LoadError::InvalidJson};
    }

    const QJsonObject object = document.object();
    if (object.size() != 2 || !object.contains(QStringLiteral("protocol")) ||
        !object.contains(QStringLiteral("token"))) {
        return {{}, LoadError::InvalidSchema};
    }
    if (!object.value(QStringLiteral("protocol")).isDouble() ||
        object.value(QStringLiteral("protocol")).toInt(-1) != bridge_protocol::kVersion) {
        return {{}, LoadError::IncompatibleProtocol};
    }
    if (!object.value(QStringLiteral("token")).isString()) {
        return {{}, LoadError::InvalidToken};
    }

    const QString token = object.value(QStringLiteral("token")).toString();
    if (!isValidToken(token)) {
        return {{}, LoadError::InvalidToken};
    }

    return {token, LoadError::None};
}

QString statusDetail(LoadError error) {
    switch (error) {
    case LoadError::None:
        return {};
    case LoadError::LocationUnavailable:
        return QStringLiteral("The ilyStream bridge credential location is unavailable");
    case LoadError::Missing:
        return QStringLiteral("Waiting for ilyStream bridge credentials");
    case LoadError::IncompatibleProtocol:
        return QStringLiteral("ilyStream bridge credentials use an incompatible protocol");
    case LoadError::Unreadable:
    case LoadError::Oversized:
    case LoadError::InvalidJson:
    case LoadError::InvalidSchema:
    case LoadError::InvalidToken:
        return QStringLiteral("ilyStream bridge credentials are invalid; restart ilyStream to rotate them");
    }
    return QStringLiteral("ilyStream bridge credentials are unavailable");
}

} // namespace ilystream::bridge_credentials
