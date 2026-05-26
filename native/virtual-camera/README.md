# ilyStream Virtual Camera

This folder is the native Windows path for making `ilyStream` appear as a real camera source in apps such as Discord, Zoom, Teams, TikTok Live Studio, and the Windows Camera app.

Windows virtual cameras are not plain FFmpeg outputs. The supported Windows 11 path has two native parts:

1. A Media Foundation custom media source COM DLL. Windows Frame Server loads this source when another app opens the camera.
2. A registration/control executable that calls `MFCreateVirtualCamera` to create, stop, or remove the OS-visible camera device.
3. A small frame bridge executable that receives ilyStream BGRA frames and exposes the latest frame through a ProgramData-backed memory mapping.

`media-source/` contains the Media Foundation source DLL. It reads frames from the ilyStream frame bridge and falls back to the Microsoft sample synthetic pattern when no frame is available.

`registrar/` contains the ilyStream-owned native executable for part 2.

`bridge/` contains the ilyStream frame bridge used while the virtual camera is active.

## Build

Requirements:

- Windows 11, build 22000 or newer.
- Visual Studio with Desktop development with C++.
- Windows SDK 10.0.26100.0 or newer.

```powershell
powershell -ExecutionPolicy Bypass -File native\virtual-camera\build.ps1
```

The native outputs are written to:

```text
native\virtual-camera\bin\x64\Release\VirtualCameraMediaSource.dll
native\virtual-camera\bin\x64\Release\IlyStreamVirtualCameraRegistrar.exe
native\virtual-camera\bin\x64\Release\IlyStreamVirtualCameraBridge.exe
```

## Install for Development

Open PowerShell as Administrator and run:

```powershell
npm run install:virtual-camera
```

That script:

1. Builds the native DLL and registrar.
2. Registers the media source COM DLL under `HKLM\SOFTWARE\Classes\CLSID\{6ED0F705-6D87-4A62-A28D-C4DE6F1FF16B}`.
3. Calls `MFCreateVirtualCamera` through the registrar so Windows creates the camera source.
4. Prepares `%ProgramData%\ilyStream\virtual-camera-frame.dat` so both ilyStream and Windows Camera Frame Server can access the latest rendered frame.

After `install`, the OS-level camera registration persists across reboots — apps see the `ilyStream (Windows Virtual Camera)` device whether or not ilyStream is running. When ilyStream isn't feeding frames, consumers get the Microsoft synthetic test pattern.

At runtime, ilyStream starts `IlyStreamVirtualCameraBridge.exe` automatically and feeds it 1280x720 BGRA frames. Toggling the virtual camera in the UI only spawns/kills this bridge process; it does not re-register or unregister the OS camera. When the bridge exits, it invalidates the shared-memory header so consumers fall back to the synthetic test pattern instead of holding the last frame forever.

To remove the development registration:

```powershell
npm run uninstall:virtual-camera
```

## Registrar Commands

```powershell
native\virtual-camera\bin\x64\Release\IlyStreamVirtualCameraRegistrar.exe status
native\virtual-camera\bin\x64\Release\IlyStreamVirtualCameraRegistrar.exe install
native\virtual-camera\bin\x64\Release\IlyStreamVirtualCameraRegistrar.exe stop
native\virtual-camera\bin\x64\Release\IlyStreamVirtualCameraRegistrar.exe remove
```

The default source CLSID is:

```text
{6ED0F705-6D87-4A62-A28D-C4DE6F1FF16B}
```

That CLSID must be implemented and registered by the media source DLL before `install` can produce a streamable camera. Until that DLL exists, `status` can validate OS API support but `install` may fail or create a camera that cannot activate.

## Next Native Milestone

The current source feeds real ilyStream canvas frames into the media source through the native frame bridge, and the OS-level registration is owned exclusively by the install/uninstall scripts. The next milestone is adding installer UX/signing so users do not need to run the development install script manually.

The official Microsoft references mirrored here are:

- `MFCreateVirtualCamera`: https://learn.microsoft.com/en-us/windows/win32/api/mfvirtualcamera/nf-mfvirtualcamera-mfcreatevirtualcamera
- Frame Server Custom Media Source: https://learn.microsoft.com/en-us/windows-hardware/drivers/stream/frame-server-custom-media-source
- Microsoft Windows-Camera VirtualCamera sample: https://github.com/microsoft/Windows-Camera/tree/master/Samples/VirtualCamera

The media source initially generates a simple test pattern, then reads ilyStream frames from the local frame bridge when the app is sending frames.
