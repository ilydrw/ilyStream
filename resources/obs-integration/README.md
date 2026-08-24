# ilyStream workspace for OBS 32

This package gives stock OBS an ilyStream Cyber Neon workspace without forking OBS or taking ownership of third-party docks.

## What is included

- `themes/ilyStream_Cyber_Neon.ovt`: an OBS 32 Yami variant using ilyStream's deep blue-charcoal, cyan, and violet palette.
- `plugin-package/`: the allowlisted layout and manifest contract for native ilyStream plugin builds.
- `../../scripts/obs-integration/`: guarded install, rollback, staging, and validation tools.

The theme changes OBS's native Qt chrome. It does not select `QWebEngineView`, CEF widgets, or StreamElements internals, so browser docks keep their own HTML/CSS. Nothing here reparents docks, patches private Qt children, replaces `obs-browser`, changes a scene collection, or changes any StreamElements file.

## Safe workflow

Run these commands from the ilyStream repository in PowerShell. All mutating scripts support `-WhatIf`.

1. Validate the package and run isolated round-trip tests:

   ```powershell
   .\scripts\obs-integration\Test-IlyStreamObsIntegration.ps1
   ```

2. Preview and install the user theme:

   ```powershell
   .\scripts\obs-integration\Install-IlyStreamObsTheme.ps1 -WhatIf
   .\scripts\obs-integration\Install-IlyStreamObsTheme.ps1
   ```

   The destination is `%APPDATA%\obs-studio\themes` for a normal/Steam installation, or `<OBS root>\config\obs-studio\themes` for detected portable mode. The script does not edit OBS's selected theme. Choose **ilyStream Cyber Neon** later in **Settings > Appearance** when it is safe to do so.

3. A native plugin build can be staged while OBS is open. Staging does not touch OBS:

   ```powershell
   .\scripts\obs-integration\Stage-IlyStreamObsPlugin.ps1 `
     -PackagePath C:\path\to\ilyStream-obs.zip `
     -Version 1.0.0
   ```

4. Apply the returned `StagePath` only after ending the stream and closing OBS yourself:

   ```powershell
   .\scripts\obs-integration\Install-StagedIlyStreamObsPlugin.ps1 `
     -StagePath C:\path\returned\by\stage
   ```

   For a normal or Steam OBS install, the default destination follows OBS's recommended Windows layout:

   ```text
   C:\ProgramData\obs-studio\plugins\ilystream-obs\
     bin\64bit\ilystream-obs.dll
     bin\64bit\ilystream-obs.pdb
     data\locale\en-US.ini
   ```

   This avoids the legacy, elevation-prone `C:\Program Files\obs-studio\obs-plugins\64bit` location. Portable OBS keeps its loader-compatible root-relative layout (`<OBS root>\obs-plugins\64bit` plus `<OBS root>\data\obs-plugins\ilystream-obs`). A custom non-portable root can select that isolated layout explicitly with `-PluginLayout ObsRoot`; `-PluginLayout ProgramData` selects the shared recommended layout. `-SharedPluginRoot` is available for controlled/custom shared roots and testing.

   The apply script verifies the stage manifest and every hash again. It refuses to change a DLL if OBS from the target installation is running or cannot be safely distinguished. It never stops, starts, or restarts OBS.

5. Roll back in the reverse order, with OBS closed for native plugin files:

   ```powershell
   .\scripts\obs-integration\Uninstall-IlyStreamObsPlugin.ps1
   .\scripts\obs-integration\Uninstall-IlyStreamObsTheme.ps1
   ```

   Files that existed before ilyStream are restored byte-for-byte from verified backups. Files introduced by ilyStream are removed. Backups and the final state record are retained for recovery and audit.

## OBS discovery

Discovery checks, in order:

1. a currently running OBS executable;
2. the standard 64-bit installation;
3. Steam libraries listed in `libraryfolders.vdf`;
4. Windows uninstall-registry locations.

Pass `-ObsRoot` to every command for a custom or portable copy. `-ObsRoot` may be the OBS root or `obs64.exe`. Pass `-ObsConfigRoot` when a portable setup uses a nonstandard configuration location.

Examples:

```powershell
# Portable OBS with portable_mode/portable_mode.txt beside OBS or its executable
.\scripts\obs-integration\Install-IlyStreamObsTheme.ps1 -ObsRoot D:\OBS-Portable

# Custom configuration root
.\scripts\obs-integration\Install-IlyStreamObsTheme.ps1 `
  -ObsRoot D:\Apps\OBS `
  -ObsConfigRoot D:\OBS-Profile
```

When multiple installations exist and none is explicitly selected, the running installation wins, followed by standard, Steam, and registry discoveries. For deterministic deployment, pass `-ObsRoot`.

## State and rollback

Theme and plugin state lives under:

```text
<OBS config root>/ilyStream/obs-integration/
```

Backups are versioned by UTC timestamp and SHA-256 checked before restore. Plugin state schema v2 records the OBS root separately from the selected layout, plugin install root, binary root, data root, package-relative path, and absolute managed destination. Uninstall recomputes and compares these paths before touching a file. If a managed destination has been changed by another tool, install/uninstall stops without modifying it. `-Force` permits repair but still captures a recovery copy first.

Plugin staging defaults to:

```text
%LOCALAPPDATA%/ilyStream/obs-integration/staged-plugins/
```

The stager rejects any destination that overlaps the live OBS plugin directories.

## Compatibility boundary

- Supported target: OBS Studio 32.x on Windows x64.
- Uses OBS's public theme inheritance and recommended ProgramData plugin directory layout for standard Windows installs.
- Retains the OBS root-relative binary/data layout for portable and explicitly isolated custom installs.
- Does not modify `obs-websocket`, `obs-browser`, scene JSON, dock layout, or third-party plugin files.
- Browser-source and browser-dock content remains isolated from the native QSS theme.
- No script contains process-stop, process-start, or restart behavior.
