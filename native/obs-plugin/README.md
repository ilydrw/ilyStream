# ilyStream Workspace for OBS

`ilystream-obs` is a thin, additive OBS Studio frontend plugin for Windows x64. It gives stock OBS an ilyStream-native workspace without replacing OBS, `obs-browser`, obs-websocket, StreamElements, scene collections, or any third-party source or dock.

The current target is OBS Studio 32.2.2 with Qt 6.11.1. The plugin uses only public OBS frontend APIs introduced before that version.

## What it adds

- A native `QWidget` dock registered as `com.ilystream.obs.workspace` through `obs_frontend_add_dock_by_id`. OBS owns its standard movable, dockable, floatable, closable, and Docks-menu behavior.
- A compact Cyber Neon dock palette aligned with ilyStream's navy, cyan, and violet Control Center; green is reserved for a healthy bridge connection.
- Namespaced Tools actions to show or fullscreen the workspace, open the ilyStream Control Center, and reconnect the bridge.
- A workspace-only fullscreen mode that restores the previous dock or floating placement through the fixed **Exit fullscreen (Esc)** button, the Escape key, or the Tools-menu toggle. Hiding or closing fullscreen also restores normal placement before the standard Docks action reopens it.
- Fixed **Layout / Move** and **Close** controls inside the workspace. Layout explicitly offers Dock left, right, top, bottom, and Floating window; these deliberate commands remain available when OBS docks are locked without changing the global lock or another dock's features.
- Tools-menu controls for the existing ilyStream Unified Chat custom browser dock: show, dock left/right/top/bottom, float, fullscreen/exit with Escape, and close. The plugin resolves only the configured loopback `/overlay/chat-unified?dock=1` entry and its matching OBS UUID, so similarly named third-party docks are never selected.
- Read-only OBS state in the dock: current scene, streaming, recording, and virtual-camera status.
- OBS frontend lifecycle publication to ilyStream.
- An additive **ilyStream Program** video-and-audio input source. OBS users add it explicitly like any other source; the plugin never inserts it into a scene. It stays silent and transparent while no compatible Program transport is available.
- One shared Program transport hub across every source instance. Active or visible instances hold reference-counted demand leases, while each instance receives its own cursor into the producer-owned two-second named audio ring. Readers use bounded seqlock copy/retry, produce OBS-sized planar blocks, preserve absolute timestamps, fill only small overrun gaps with silence, and fail closed on format, generation, or retirement boundaries.
- A zero-readback GPU Program video ingress on OBS's Direct3D 11 graphics thread. It verifies the OBS adapter LUID, imports only the three duplicated handles in the authenticated descriptor, reads the canonical read-only control page with bounded seqlock retries, and uses non-blocking keyed-mutex acquisition before copying the newest slot into an OBS-owned frame cache. No frame is drawn before the first successful copy.
- A non-blocking `QLocalSocket` client with bounded NDJSON parsing, handshake timeout, exponential reconnect backoff, and heartbeat messages.
- Graceful offline behavior. OBS and every other plugin keep operating when ilyStream is closed or incompatible.

The plugin registers the `ilystream_program` source type but never creates a source instance or updates, enumerates, hides, reorders, or deletes scene items. It only presents its native workspace and the exact ilyStream-owned Unified Chat browser dock; it never styles or removes another plugin's dock. It does not connect to obs-websocket, so StreamElements and other integrations retain their existing ownership and command paths.

## Build on Windows

Prerequisites:

- Visual Studio Build Tools 2022 with Desktop development with C++ and Windows 11 SDK 10.0.26100.
- PowerShell 7 or Windows PowerShell 5.1.
- CMake 3.28 or newer. The script detects the CMake bundled with Visual Studio when `cmake.exe` is not on `PATH`.
- Network access for the first build.

Run from this directory:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build.ps1
```

The first build downloads SHA-256-pinned official OBS 32.2.2 sources plus the matching `2026-07-15` OBS and Qt dependency archives. It builds only the OBS development targets needed by this plugin. Downloads, SDK files, build output, and the installable package stay under this folder in `.deps`, `build`, and `package`. The installed OBS application is not changed during a build.

The build emits a stage-compatible package directory at `package/obs-plugin` and a ZIP named `package/ilystream-obs-<version>-windows-x64.zip` with this standard OBS layout:

```text
obs-plugin-package.json
LICENSE
README.md
obs-plugins/64bit/ilystream-obs.dll
obs-plugins/64bit/ilystream-obs.pdb
data/obs-plugins/ilystream-obs/locale/en-US.ini
```

The manifest records schema version 1, plugin ID, plugin version, x64 architecture, and minimum OBS version. This package can be passed directly to `scripts/obs-integration/Stage-IlyStreamObsPlugin.ps1` from the repository root while OBS remains open; staging does not touch the live OBS installation.

For a pre-existing SDK:

```powershell
.\scripts\build.ps1 `
  -SkipDependencyBootstrap `
  -SdkPrefix C:\path\to\obs-sdk `
  -ObsDepsPrefix C:\path\to\obs-deps `
  -QtPrefix C:\path\to\obs-qt
```

## Install

Close OBS first, then run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

The default target follows OBS's recommended package layout:

```text
C:\ProgramData\obs-studio\plugins\ilystream-obs\
  bin\64bit\ilystream-obs.dll
  data\locale\en-US.ini
```

Pass `-PluginRoot` for a custom OBS plugin directory. The installer only writes the `ilystream-obs` namespace and retains the previous DLL as `ilystream-obs.dll.bak` before an upgrade.
The recommended `ProgramData` location can require an elevated PowerShell session depending on the machine's ACLs; the script never self-elevates.

Start OBS and open **Tools > ilyStream: Show Workspace** or **Docks > ilyStream Workspace**. Drag its title bar to move or dock it, use the title-bar controls, or use the fixed bottom bar for **Fullscreen**, **Layout / Move**, and **Close**. Add **ilyStream Program** from OBS's normal Add Source menu only where it is wanted; loading the plugin does not touch any scene or existing source. The Tools menu also exposes the same presentation commands for the configured ilyStream Unified Chat browser dock. OBS's global **Docks > Lock Docks** option intentionally disables ordinary title-bar dragging and controls for all docks. ilyStream's deliberate workspace and chat commands remain available without changing that global setting. Installing or replacing a loaded native DLL is deliberately refused while `obs64.exe` is running.

To uninstall recoverably:

```powershell
.\scripts\uninstall.ps1
```

This renames the plugin folder with a `.removed-<timestamp>` suffix. Use `-Purge` only when permanent deletion is intended.

## Local bridge protocol 1

On Windows, `QLocalSocket` connects to the named pipe:

```text
\\.\pipe\ilystream.obs.bridge.v1
```

Frames are UTF-8 JSON objects delimited by `\n`. Every frame has `"protocol": 1`. A frame is limited to 64 KiB and the accumulated read buffer to 256 KiB. Malformed and unknown message types are ignored; oversized traffic closes the connection and enters reconnect backoff.

Before each connection attempt, the plugin reads `%APPDATA%\ilyStream\obs-bridge-v1.json`. The file is limited to 4 KiB and must contain exactly a protocol version plus a 256-bit token encoded as 64 lowercase hexadecimal characters:

```json
{"protocol":1,"token":"<64 lowercase hex characters>"}
```

ilyStream creates this file atomically with current-user-only access and persists a valid token across restarts. Invalid or missing credentials leave the dock safely Offline and are reread on the next reconnect. Before sending the token, the plugin resolves the named-pipe server process and verifies that its Windows user SID matches the OBS process user SID; elevated and non-elevated processes for the same account remain compatible. The token is sent only as `hello.authToken`; neither side logs it or displays it in status text. ilyStream rejects unauthenticated peers before returning snapshots or accepting commands.

Plugin to ilyStream:

| Type | Important fields |
| --- | --- |
| `hello` | `authToken`, `client`, `clientVersion`, `obsVersion`, `capabilities`, `sentAt` |
| `obs.snapshot` | `payload` with the complete OBS state, `sentAt` |
| `obs.frontendEvent` | `event`, complete OBS state in `payload`, `sentAt` |
| `command.request` | UUID `requestId`, allowlisted `action`, object `payload`, `sentAt` |
| `program.subscribe` | transport version, UUID `subscriptionId`, `sentAt` |
| `program.transport.release` | subscription, transport and generation lease, machine-readable reason, `sentAt` |
| `program.transport.stats` | generation-scoped video/audio counters and timestamps, `sentAt` |
| `ping` | `sentAt` |

ilyStream to plugin:

| Type | Important fields |
| --- | --- |
| `hello.ack` | `payload.appVersion`, optionally `payload.snapshot` |
| `ilystream.snapshot` | display-only state in `payload` |
| `command.result` | matching `requestId`, `ok`, and `message`; never interpreted as an OBS command |
| `program.transport.available` | subscription and validated GPU/control/audio descriptor |
| `program.transport.retiring` | subscription, transport and generation lease, reason, `sentAt` |
| `pong` | heartbeat response |

The only plugin-originated command action currently used is `openControlCenter`. Program transport messages only negotiate a media lease for the explicit **ilyStream Program** source; they do not mutate OBS. Protocol 1 deliberately has no inbound OBS command type, so a peer cannot use this plugin to start/stop a stream or modify scenes and sources. The named pipe and credential file are local transport details; the handshake credential still must not be copied into diagnostics or support bundles.

The OBS payload is:

```json
{
  "currentScene": "Main",
  "profile": "Default",
  "sceneCollection": "Primary",
  "streaming": false,
  "recording": false,
  "recordingPaused": false,
  "replayBuffer": false,
  "virtualCamera": false,
  "studioMode": false
}
```

## Validation

The build script compiles the plugin and runs protocol/credential tests covering partial frames, malformed frames, protocol stamping, frame bounds, strict credential shape, token format, the 4 KiB credential bound, and same-user Windows pipe-owner verification. A separate native Qt dock test covers all four explicit dock placements, floating, preservation of locked OBS dock features, fullscreen entry/Escape restoration, close normalization, cancelled and accepted main-window shutdown, Docks-action reopening, exact loopback-URL/UUID chat-dock resolution, and isolation from another dock. Program transport tests cover multi-instance demand reference counting, lifecycle callback ordering, lease moves and destruction, live transport replacement, demand-driven bridge subscription, strict descriptors, and generation-scoped retirement. Audio-ring tests cover the real named-mapping open path, independent cursors, bounded seqlock retries, deinterleaving, absolute timestamp math, small and large overruns, discontinuity resets, and retirement. Video-control tests cover no-frame, coherent publication, bounded busy retry, stale-slot rejection, and generation invalidation. Manual OBS validation should check:

1. OBS loads `ilystream-obs.dll` without a module error.
2. Docks and Tools entries appear exactly once; closing then selecting **Docks > ilyStream Workspace** reopens the same dock.
3. With ilyStream closed, the dock reports Offline and OBS remains responsive while reconnect delay grows to 30 seconds.
4. Starting ilyStream completes `hello` / `hello.ack`, publishes `obs.snapshot`, and updates the dock.
5. Scene, stream, recording, and virtual-camera lifecycle changes update the dock and publish events.
6. StreamElements docks and browser sources retain their layout, settings, and behavior across plugin load/unload and OBS restart.
7. The workspace moves between all dock areas, floats, and closes while docks are unlocked; enabling **Lock Docks** disables normal title-bar manipulation while the explicit **Layout / Move** and **Close** controls still work.
8. Fullscreen works from docked and floating states; the bottom exit button, Escape, Tools toggle, layout commands, and close/hide paths return to the prior dock area/floating geometry or deliberately replace it.
9. Closing OBS produces no queued Qt callback or unload crash.
10. Unified Chat Tools actions target only the configured ilyStream loopback browser dock; StreamElements docks retain their area, visibility, and features.
11. **ilyStream Program** appears once in Add Source, can be saved in more than one scene, and remains transparent and silent while ilyStream is offline without affecting other sources.
12. With a demanded Program source and compatible adapter, video advances without blocking OBS, audio remains synchronized across multiple source instances, resizing swaps generations without a stale replay, and hiding the final instance releases all three duplicated handles and the audio mapping.

Do not replace a plugin DLL merely to validate it during an active stream. Build and protocol tests are non-disruptive; loading/unloading a native plugin requires an OBS restart and should be scheduled off-air.

## Current limitations

- This is a Windows x64 build pinned to the OBS 32.2.2 ABI. Rebuild and re-test it for later OBS/Qt releases.
- The rich ilyStream controls still live in ilyStream. The native dock is intentionally small and reliable.
- Program video requires ilyStream and OBS to use the same Direct3D 11 adapter. Adapter mismatch, import failure, generation changes, and disconnects fail transparently and silently; there is intentionally no CPU-copy fallback yet.
- An uninstalled portable ilyStream executable can only be launched while the bridge is already connected or when `ilyStream.exe` is on `PATH`; otherwise start it manually.
- The plugin does not globally reskin OBS or third-party browser docks. A separately installable OBS theme can change supported OBS chrome without coupling that styling to this DLL.

## License

This OBS plugin is distributed under GPL-2.0-or-later, matching the official OBS plugin template's licensing model. See `LICENSE`.
