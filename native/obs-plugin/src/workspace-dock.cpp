// SPDX-License-Identifier: GPL-2.0-or-later
#include "workspace-dock.hpp"

#include <QAction>
#include <QFrame>
#include <QHBoxLayout>
#include <QJsonArray>
#include <QLabel>
#include <QMenu>
#include <QPushButton>
#include <QScrollArea>
#include <QSizePolicy>
#include <QStyle>
#include <QVBoxLayout>

#include <obs-module.h>

namespace ilystream {
namespace {

QString moduleText(const char* key) { return QString::fromUtf8(obs_module_text(key)); }

QString activityText(bool active) { return moduleText(active ? "Dock.Active" : "Dock.Inactive"); }

QFrame* createCard(QWidget* parent) {
    auto* card = new QFrame(parent);
    card->setObjectName(QStringLiteral("ilyStreamCard"));
    auto* layout = new QVBoxLayout(card);
    layout->setContentsMargins(10, 10, 10, 10);
    layout->setSpacing(8);
    return card;
}

} // namespace

WorkspaceDock::WorkspaceDock(std::function<void()> openApp, std::function<void()> reconnect,
                             std::function<void()> toggleFullscreen,
                             std::function<void(WorkspacePlacement)> placeWorkspace,
                             std::function<void()> closeWorkspace, QWidget* parent)
    : QWidget(parent) {
    setObjectName(QStringLiteral("ilyStreamWorkspace"));
    setMinimumWidth(220);
    setAccessibleName(moduleText("Dock.Title"));

    auto* rootLayout = new QVBoxLayout(this);
    rootLayout->setContentsMargins(0, 0, 0, 0);
    rootLayout->setSpacing(0);

    auto* scrollArea = new QScrollArea(this);
    scrollArea->setObjectName(QStringLiteral("ilyStreamScrollArea"));
    scrollArea->setWidgetResizable(true);
    scrollArea->setFrameShape(QFrame::NoFrame);
    scrollArea->setHorizontalScrollBarPolicy(Qt::ScrollBarAlwaysOff);
    rootLayout->addWidget(scrollArea, 1);

    auto* fullscreenFooter = new QWidget(this);
    fullscreenFooter->setObjectName(QStringLiteral("ilyStreamFullscreenFooter"));
    auto* fullscreenLayout = new QVBoxLayout(fullscreenFooter);
    fullscreenLayout->setContentsMargins(12, 8, 12, 10);
    fullscreenLayout->setSpacing(6);
    auto* fullscreenRow = new QHBoxLayout();
    fullscreenRow->setContentsMargins(0, 0, 0, 0);
    fullscreenRow->setSpacing(6);
    fullscreenButton_ = new QPushButton(moduleText("Dock.EnterFullscreen"), fullscreenFooter);
    fullscreenButton_->setObjectName(QStringLiteral("ilyStreamFullscreenButton"));
    fullscreenButton_->setAccessibleName(moduleText("Dock.EnterFullscreen"));
    fullscreenButton_->setProperty("fullscreenActive", false);
    auto* closeButton = new QPushButton(moduleText("Dock.CloseWorkspace"), fullscreenFooter);
    closeButton->setObjectName(QStringLiteral("ilyStreamCloseButton"));
    closeButton->setAccessibleName(moduleText("Dock.CloseWorkspace"));
    fullscreenRow->addWidget(fullscreenButton_, 1);
    fullscreenRow->addWidget(closeButton);
    fullscreenLayout->addLayout(fullscreenRow);

    auto* layoutButton = new QPushButton(moduleText("Dock.LayoutMove"), fullscreenFooter);
    layoutButton->setObjectName(QStringLiteral("ilyStreamLayoutButton"));
    layoutButton->setAccessibleName(moduleText("Dock.LayoutMove"));
    auto* layoutMenu = new QMenu(layoutButton);
    layoutMenu->setObjectName(QStringLiteral("ilyStreamLayoutMenu"));
    const auto addPlacementAction = [layoutMenu, placeWorkspace](const char* textKey, WorkspacePlacement placement) {
        QAction* action = layoutMenu->addAction(moduleText(textKey));
        QObject::connect(action, &QAction::triggered, layoutMenu, [placeWorkspace, placement]() {
            if (placeWorkspace) {
                placeWorkspace(placement);
            }
        });
    };
    addPlacementAction("Dock.DockLeft", WorkspacePlacement::Left);
    addPlacementAction("Dock.DockRight", WorkspacePlacement::Right);
    addPlacementAction("Dock.DockTop", WorkspacePlacement::Top);
    addPlacementAction("Dock.DockBottom", WorkspacePlacement::Bottom);
    layoutMenu->addSeparator();
    addPlacementAction("Dock.Floating", WorkspacePlacement::Floating);
    layoutButton->setMenu(layoutMenu);
    fullscreenLayout->addWidget(layoutButton);
    rootLayout->addWidget(fullscreenFooter);

    auto* content = new QWidget(scrollArea);
    content->setObjectName(QStringLiteral("ilyStreamContent"));
    content->setMinimumWidth(0);
    auto* layout = new QVBoxLayout(content);
    layout->setContentsMargins(12, 12, 12, 12);
    layout->setSpacing(12);

    auto* header = new QHBoxLayout();
    header->setSpacing(10);
    auto* mark = new QLabel(QStringLiteral("i"), content);
    mark->setObjectName(QStringLiteral("ilyStreamMark"));
    mark->setAlignment(Qt::AlignCenter);
    mark->setFixedSize(32, 32);
    header->addWidget(mark);

    auto* titleStack = new QVBoxLayout();
    titleStack->setSpacing(1);
    auto* title = new QLabel(moduleText("Dock.Title"), content);
    title->setObjectName(QStringLiteral("ilyStreamTitle"));
    auto* subtitle = new QLabel(moduleText("Dock.Subtitle"), content);
    subtitle->setObjectName(QStringLiteral("ilyStreamMuted"));
    titleStack->addWidget(title);
    titleStack->addWidget(subtitle);
    header->addLayout(titleStack, 1);
    layout->addLayout(header);

    QFrame* connectionCard = createCard(content);
    auto* connectionLayout = qobject_cast<QVBoxLayout*>(connectionCard->layout());
    auto* connectionHeader = new QHBoxLayout();
    auto* connectionTitle = new QLabel(moduleText("Dock.Connection"), connectionCard);
    connectionTitle->setObjectName(QStringLiteral("ilyStreamSectionTitle"));
    connectionHeader->addWidget(connectionTitle);
    connectionHeader->addStretch(1);
    connectionDot_ = new QLabel(connectionCard);
    connectionDot_->setObjectName(QStringLiteral("ilyStreamStatusDot"));
    connectionDot_->setFixedSize(8, 8);
    connectionValue_ = new QLabel(moduleText("Dock.Offline"), connectionCard);
    connectionValue_->setObjectName(QStringLiteral("ilyStreamStatusValue"));
    connectionValue_->setTextFormat(Qt::PlainText);
    connectionValue_->setMinimumWidth(0);
    connectionValue_->setSizePolicy(QSizePolicy::Preferred, QSizePolicy::Preferred);
    connectionValue_->setWordWrap(true);
    connectionHeader->addWidget(connectionDot_);
    connectionHeader->addWidget(connectionValue_);
    connectionLayout->addLayout(connectionHeader);
    connectionDetail_ = new QLabel(QStringLiteral("ilyStream is not running"), connectionCard);
    connectionDetail_->setObjectName(QStringLiteral("ilyStreamMuted"));
    connectionDetail_->setTextFormat(Qt::PlainText);
    connectionDetail_->setMinimumWidth(0);
    connectionDetail_->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Preferred);
    connectionDetail_->setWordWrap(true);
    connectionLayout->addWidget(connectionDetail_);
    layout->addWidget(connectionCard);

    QFrame* obsCard = createCard(content);
    auto* obsLayout = qobject_cast<QVBoxLayout*>(obsCard->layout());
    auto* obsTitle = new QLabel(QStringLiteral("OBS"), obsCard);
    obsTitle->setObjectName(QStringLiteral("ilyStreamSectionTitle"));
    obsLayout->addWidget(obsTitle);
    sceneValue_ = addStatusRow(obsLayout, moduleText("Dock.Scene"));
    streamValue_ = addStatusRow(obsLayout, moduleText("Dock.Stream"));
    recordingValue_ = addStatusRow(obsLayout, moduleText("Dock.Recording"));
    virtualCameraValue_ = addStatusRow(obsLayout, moduleText("Dock.VirtualCamera"));
    layout->addWidget(obsCard);

    QFrame* appCard = createCard(content);
    auto* appLayout = qobject_cast<QVBoxLayout*>(appCard->layout());
    auto* appTitle = new QLabel(moduleText("Dock.IlyStream"), appCard);
    appTitle->setObjectName(QStringLiteral("ilyStreamSectionTitle"));
    appLayout->addWidget(appTitle);
    ilyStreamValue_ = new QLabel(moduleText("Dock.Offline"), appCard);
    ilyStreamValue_->setObjectName(QStringLiteral("ilyStreamAppSummary"));
    ilyStreamValue_->setTextFormat(Qt::PlainText);
    ilyStreamValue_->setMinimumWidth(0);
    ilyStreamValue_->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Preferred);
    ilyStreamValue_->setWordWrap(true);
    ilyStreamValue_->setTextInteractionFlags(Qt::TextSelectableByMouse);
    appLayout->addWidget(ilyStreamValue_);
    layout->addWidget(appCard);

    auto* buttonRow = new QHBoxLayout();
    buttonRow->setSpacing(8);
    auto* openButton = new QPushButton(moduleText("Dock.OpenApp"), content);
    openButton->setObjectName(QStringLiteral("ilyStreamPrimaryButton"));
    openButton->setAccessibleName(moduleText("Dock.OpenApp"));
    reconnectButton_ = new QPushButton(moduleText("Dock.Reconnect"), content);
    reconnectButton_->setObjectName(QStringLiteral("ilyStreamSecondaryButton"));
    reconnectButton_->setAccessibleName(moduleText("Dock.Reconnect"));
    buttonRow->addWidget(openButton, 1);
    buttonRow->addWidget(reconnectButton_);
    layout->addLayout(buttonRow);

    auto* compatibility = new QLabel(moduleText("Dock.Compatibility"), content);
    compatibility->setObjectName(QStringLiteral("ilyStreamCompatibility"));
    compatibility->setWordWrap(true);
    layout->addWidget(compatibility);
    layout->addStretch(1);

    scrollArea->setWidget(content);

    connect(openButton, &QPushButton::clicked, this, [handler = std::move(openApp)]() {
        if (handler) {
            handler();
        }
    });
    connect(reconnectButton_, &QPushButton::clicked, this, [handler = std::move(reconnect)]() {
        if (handler) {
            handler();
        }
    });
    connect(fullscreenButton_, &QPushButton::clicked, this, [handler = std::move(toggleFullscreen)]() {
        if (handler) {
            handler();
        }
    });
    connect(closeButton, &QPushButton::clicked, this, [handler = std::move(closeWorkspace)]() {
        if (handler) {
            handler();
        }
    });

    setStyleSheet(QStringLiteral(R"(
        QWidget#ilyStreamWorkspace,
        QWidget#ilyStreamContent,
        QScrollArea#ilyStreamScrollArea,
        QScrollArea#ilyStreamScrollArea > QWidget > QWidget {
            background: #080d16;
            color: #eaf7ff;
        }
        QWidget#ilyStreamFullscreenFooter {
            background: #080d16;
            border-top: 1px solid #20314b;
        }
        QFrame#ilyStreamCard {
            background: #0f1726;
            border: 1px solid #20314b;
            border-radius: 7px;
        }
        QLabel#ilyStreamMark {
            background: #66dcff;
            color: #080d16;
            border: 1px solid #9b7cff;
            border-radius: 8px;
            font-size: 20px;
            font-weight: 800;
        }
        QLabel#ilyStreamTitle {
            color: #f5fbff;
            font-size: 15px;
            font-weight: 700;
        }
        QLabel#ilyStreamSectionTitle {
            color: #9b7cff;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
        }
        QLabel#ilyStreamMuted,
        QLabel#ilyStreamCompatibility {
            color: #8293ad;
            font-size: 10px;
        }
        QLabel#ilyStreamStatusValue {
            color: #eaf7ff;
            font-size: 11px;
            font-weight: 600;
        }
        QLabel#ilyStreamStatusDot {
            background: #60718d;
            border-radius: 4px;
        }
        QLabel#ilyStreamRowTitle {
            color: #91a2bd;
            font-size: 11px;
        }
        QLabel#ilyStreamRowValue,
        QLabel#ilyStreamAppSummary {
            color: #eaf7ff;
            font-size: 11px;
            font-weight: 600;
        }
        QPushButton#ilyStreamPrimaryButton,
        QPushButton#ilyStreamSecondaryButton,
        QPushButton#ilyStreamFullscreenButton,
        QPushButton#ilyStreamLayoutButton,
        QPushButton#ilyStreamCloseButton {
            border-radius: 5px;
            min-height: 30px;
            padding: 0 10px;
            font-size: 11px;
            font-weight: 650;
        }
        QPushButton#ilyStreamPrimaryButton {
            background: #66dcff;
            border: 1px solid #66dcff;
            color: #080d16;
        }
        QPushButton#ilyStreamPrimaryButton:hover {
            background: #8be7ff;
            border-color: #9b7cff;
        }
        QPushButton#ilyStreamSecondaryButton,
        QPushButton#ilyStreamFullscreenButton,
        QPushButton#ilyStreamLayoutButton,
        QPushButton#ilyStreamCloseButton {
            background: #151f32;
            border: 1px solid #344b6d;
            color: #eaf7ff;
        }
        QPushButton#ilyStreamSecondaryButton:hover,
        QPushButton#ilyStreamFullscreenButton:hover,
        QPushButton#ilyStreamLayoutButton:hover {
            background: #1b2941;
            border-color: #9b7cff;
        }
        QPushButton#ilyStreamFullscreenButton[fullscreenActive="true"] {
            background: #2b2345;
            border-color: #9b7cff;
            color: #f5fbff;
        }
        QPushButton#ilyStreamCloseButton:hover {
            background: #391f2c;
            border-color: #ff626e;
            color: #ffffff;
        }
        QMenu#ilyStreamLayoutMenu {
            background: #0f1726;
            border: 1px solid #344b6d;
            color: #eaf7ff;
            padding: 4px;
        }
        QMenu#ilyStreamLayoutMenu::item {
            border-radius: 4px;
            padding: 6px 18px;
        }
        QMenu#ilyStreamLayoutMenu::item:selected {
            background: #20314b;
            color: #66dcff;
        }
        QMenu#ilyStreamLayoutMenu::separator {
            background: #344b6d;
            height: 1px;
            margin: 4px 8px;
        }
        QPushButton:disabled {
            color: #64748f;
            background: #111a2a;
            border-color: #25354e;
        }
        QScrollBar:vertical {
            background: #080d16;
            width: 8px;
            margin: 0;
        }
        QScrollBar::handle:vertical {
            background: #273b58;
            border-radius: 4px;
            min-height: 24px;
        }
        QScrollBar::handle:vertical:hover {
            background: #9b7cff;
        }
        QScrollBar::add-line:vertical,
        QScrollBar::sub-line:vertical,
        QScrollBar::add-page:vertical,
        QScrollBar::sub-page:vertical {
            background: transparent;
            height: 0;
        }
    )"));

    setBridgeStatus(BridgeStatus::Offline, QStringLiteral("ilyStream is not running"));
    setObsState({});
}

void WorkspaceDock::setBridgeStatus(BridgeStatus status, const QString& detail) {
    QString label;
    QString color;
    switch (status) {
    case BridgeStatus::Offline:
        label = moduleText("Dock.Offline");
        color = QStringLiteral("#60718d");
        break;
    case BridgeStatus::Connecting:
        label = moduleText("Dock.Connecting");
        color = QStringLiteral("#f0b44c");
        break;
    case BridgeStatus::Handshaking:
        label = moduleText("Dock.Handshaking");
        color = QStringLiteral("#66dcff");
        break;
    case BridgeStatus::Ready:
        label = moduleText("Dock.Connected");
        color = QStringLiteral("#45db86");
        break;
    case BridgeStatus::Incompatible:
        label = moduleText("Dock.Incompatible");
        color = QStringLiteral("#ff626e");
        break;
    }

    connectionValue_->setText(label);
    connectionDot_->setStyleSheet(QStringLiteral("background: %1; border-radius: 4px;").arg(color));
    connectionDetail_->setText(detail.isEmpty() ? label : detail);
    reconnectButton_->setEnabled(status != BridgeStatus::Connecting && status != BridgeStatus::Handshaking);

    if (status != BridgeStatus::Ready) {
        ilyStreamValue_->setText(moduleText("Dock.Offline"));
    }
}

void WorkspaceDock::setObsState(const ObsState& state) {
    sceneValue_->setText(state.currentScene.isEmpty() ? moduleText("Dock.NotAvailable") : state.currentScene);
    streamValue_->setText(activityText(state.streaming));
    recordingValue_->setText(state.recordingPaused ? moduleText("Dock.Paused") : activityText(state.recording));
    virtualCameraValue_->setText(activityText(state.virtualCamera));
}

void WorkspaceDock::setIlyStreamSnapshot(const QJsonObject& snapshot) {
    const QString summary = snapshot.value(QStringLiteral("summary")).toString().trimmed();
    if (!summary.isEmpty()) {
        ilyStreamValue_->setText(summary);
        return;
    }

    QStringList parts;
    const QString appVersion = snapshot.value(QStringLiteral("appVersion")).toString().trimmed();
    if (!appVersion.isEmpty()) {
        parts.append(QStringLiteral("ilyStream %1").arg(appVersion));
    }
    const QString mode = snapshot.value(QStringLiteral("mode")).toString().trimmed();
    if (!mode.isEmpty()) {
        parts.append(mode);
    }
    QJsonArray connectedPlatforms = snapshot.value(QStringLiteral("connectedPlatforms")).toArray();
    if (connectedPlatforms.isEmpty()) {
        const QJsonArray platforms = snapshot.value(QStringLiteral("platforms")).toArray();
        for (const QJsonValue& value : platforms) {
            if (value.toObject().value(QStringLiteral("status")).toString() == QStringLiteral("connected")) {
                connectedPlatforms.append(value);
            }
        }
    }
    if (!connectedPlatforms.isEmpty()) {
        parts.append(QStringLiteral("%1 platform%2 connected")
                         .arg(connectedPlatforms.size())
                         .arg(connectedPlatforms.size() == 1 ? QString() : QStringLiteral("s")));
    }

    ilyStreamValue_->setText(parts.isEmpty() ? moduleText("Dock.Connected") : parts.join(QStringLiteral(" · ")));
}

void WorkspaceDock::setNotice(const QString& notice) {
    if (!notice.trimmed().isEmpty()) {
        connectionDetail_->setText(notice);
    }
}

void WorkspaceDock::setFullscreenActive(bool active) {
    fullscreenButton_->setText(moduleText(active ? "Dock.ExitFullscreen" : "Dock.EnterFullscreen"));
    fullscreenButton_->setAccessibleName(fullscreenButton_->text());
    fullscreenButton_->setProperty("fullscreenActive", active);
    fullscreenButton_->style()->unpolish(fullscreenButton_);
    fullscreenButton_->style()->polish(fullscreenButton_);
    fullscreenButton_->update();
}

QLabel* WorkspaceDock::addStatusRow(QVBoxLayout* layout, const QString& title) {
    auto* row = new QHBoxLayout();
    row->setSpacing(8);
    auto* titleLabel = new QLabel(title, this);
    titleLabel->setObjectName(QStringLiteral("ilyStreamRowTitle"));
    titleLabel->setTextFormat(Qt::PlainText);
    titleLabel->setSizePolicy(QSizePolicy::Maximum, QSizePolicy::Preferred);
    auto* valueLabel = new QLabel(moduleText("Dock.NotAvailable"), this);
    valueLabel->setObjectName(QStringLiteral("ilyStreamRowValue"));
    valueLabel->setAlignment(Qt::AlignRight | Qt::AlignVCenter);
    valueLabel->setTextFormat(Qt::PlainText);
    valueLabel->setTextInteractionFlags(Qt::TextSelectableByMouse);
    valueLabel->setMinimumWidth(0);
    valueLabel->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Preferred);
    valueLabel->setWordWrap(true);
    row->addWidget(titleLabel);
    row->addStretch(1);
    row->addWidget(valueLabel, 1);
    layout->addLayout(row);
    return valueLabel;
}

} // namespace ilystream
