# ilyStream

![ilyStream Widget Editor](file:///C:/Users/Drew/.gemini/antigravity/brain/c80eb271-ef93-4791-9ff8-41637c8cfdf6/ilystream_widget_editor_preview_1778781203103.png)

[![Website](https://img.shields.io/badge/website-ilydrw.github.io%2FilyStream-blue)](https://ilydrw.github.io/ilyStream/)
[![Version](https://img.shields.io/badge/version-0.0.9-green)](https://github.com/ilydrw/ilyStream/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows-brightgreen)](https://ilydrw.github.io/ilyStream/download/)

**ilyStream** is a focused Windows broadcast studio for creators who want streaming, overlays, chat, TTS, audio routing, and smart-light automation in one place. No browser tabs, no complex terminal setups—just a native control room built for the live workflow.

## 🚀 Key Features

*   **Broadcast Studio**: Manage scenes, capture sources, and stream output from a single native interface.
*   **Unified Design System**: Professional-grade glassmorphism, customizable typography (Outfit, Inter, etc.), and smooth border-radius control across all overlay graphics.
*   **Real-Time Customization**: Advanced widget editor with **Live Preview**—adjust aesthetics and behavior without refreshing your stream.
*   **High-Fidelity Recording**: VBR/CRF encoding optimized for NVENC, QSV, and AMF hardware encoders.
*   **Audio Engine**: Integrated TTS, soundboards, and Voice FX that route directly into your broadcast mix.
*   **Smart-Light Automation**: Native support for Philips Hue and Govee LAN control for chat-reactive lighting.
*   **DeskThing Companion**: Pair a Car Thing or DeskThing client to keep controls and status checks on a physical second screen.
*   **Unified Chat & Alerts**: Consolidated event pipeline for Twitch and TikTok with customizable overlay widgets.

## 📦 Getting Started

### Users
The easiest way to get started is to download the Windows installer:
*   **[Download the Latest Release](https://ilydrw.github.io/ilyStream/download/)**
*   **[Read the Quick Start Guide](https://ilydrw.github.io/ilyStream/docs/getting-started/)**

### Developers
ilyStream is built with Electron, React, and TypeScript.

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/ilydrw/ilyStream.git
    cd ilyStream
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Run in development mode**:
    ```bash
    npm run dev
    ```

4.  **Build production artifacts**:
    ```bash
    npm run package
    ```

## 🛠 Tech Stack

*   **Framework**: Electron + Vite
*   **UI**: React + Tailwind CSS
*   **State**: Zustand
*   **Database**: SQLite (via better-sqlite3)
*   **Audio/Video**: FFmpeg (via ffmpeg-static)
*   **Platform Integrations**: Twurple (Twitch), TikTok Live Connector, Philips Hue API, OBS WebSocket

## 📝 Notes

*   **Data Storage**: Application databases, local logs, and generated builds are stored in `%APPDATA%/ilyStream`.
*   **Security**: Runtime credentials and API keys are intentionally excluded from git and stored securely on your local machine.

---
Made for creators who would rather be live than fighting their tools.
