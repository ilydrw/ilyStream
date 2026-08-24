// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once

#include <QByteArray>

class QDockWidget;
class QMainWindow;

namespace ilystream {

[[nodiscard]] QDockWidget* findUnifiedChatDock(QMainWindow* mainWindow, const QByteArray& extraBrowserDocksJson);

} // namespace ilystream
