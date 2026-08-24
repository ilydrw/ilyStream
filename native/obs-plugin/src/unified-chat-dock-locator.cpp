// SPDX-License-Identifier: GPL-2.0-or-later
#include "unified-chat-dock-locator.hpp"

#include <QDockWidget>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QMainWindow>
#include <QUrl>
#include <QUrlQuery>

namespace ilystream {
namespace {

QString normalizedUuid(QString uuid) {
    uuid.remove(QLatin1Char('{'));
    uuid.remove(QLatin1Char('}'));
    uuid.remove(QLatin1Char('-'));
    return uuid.toLower();
}

bool isUnifiedChatDockUrl(const QString& value) {
    const QUrl url(value);
    if (!url.isValid() || url.scheme().compare(QStringLiteral("http"), Qt::CaseInsensitive) != 0) {
        return false;
    }

    const QString host = url.host().toLower();
    if (host != QStringLiteral("127.0.0.1") && host != QStringLiteral("localhost") && host != QStringLiteral("::1")) {
        return false;
    }

    QString path = url.path();
    while (path.endsWith(QLatin1Char('/')) && path.size() > 1) {
        path.chop(1);
    }
    if (path != QStringLiteral("/overlay/chat-unified")) {
        return false;
    }

    return QUrlQuery(url).queryItemValue(QStringLiteral("dock")) == QStringLiteral("1");
}

} // namespace

QDockWidget* findUnifiedChatDock(QMainWindow* mainWindow, const QByteArray& extraBrowserDocksJson) {
    if (!mainWindow || extraBrowserDocksJson.isEmpty()) {
        return nullptr;
    }

    QJsonParseError parseError;
    const QJsonDocument document = QJsonDocument::fromJson(extraBrowserDocksJson, &parseError);
    if (parseError.error != QJsonParseError::NoError || !document.isArray()) {
        return nullptr;
    }

    const QList<QDockWidget*> docks = mainWindow->findChildren<QDockWidget*>(QString(), Qt::FindDirectChildrenOnly);
    for (const QJsonValue& value : document.array()) {
        const QJsonObject entry = value.toObject();
        const QString title = entry.value(QStringLiteral("title")).toString().trimmed();
        if (title.isEmpty() || !isUnifiedChatDockUrl(entry.value(QStringLiteral("url")).toString())) {
            continue;
        }

        const QString configuredUuid = normalizedUuid(entry.value(QStringLiteral("uuid")).toString());
        if (configuredUuid.isEmpty()) {
            continue;
        }
        const QString objectName = title + QStringLiteral("_extraBrowser");
        for (QDockWidget* dock : docks) {
            if (!dock || dock->objectName() != objectName) {
                continue;
            }

            const QString runtimeUuid = normalizedUuid(dock->property("uuid").toString());
            if (configuredUuid == runtimeUuid) {
                return dock;
            }
        }
    }

    return nullptr;
}

} // namespace ilystream
