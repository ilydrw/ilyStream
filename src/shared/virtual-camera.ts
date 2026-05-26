// src/shared/virtual-camera.ts

export type VirtualCameraPlatform =
  | 'windows-obs-bridge'
  | 'windows-mf-native'
  | 'linux-v4l2loopback'
  | 'macos-obs-bridge'
  | 'macos-native'
  | 'unsupported';

export type VirtualCameraState =
  | 'inactive'
  | 'starting'
  | 'active'
  | 'error'
  | 'unsupported';

export interface VirtualCameraInfo {
  platform: VirtualCameraPlatform;
  state: VirtualCameraState;
  lastError?: string;
  deviceName?: string;
  canStart: boolean;
  needsDriver?: boolean;
  driverHint?: string;
  nativeControlAvailable?: boolean;
  nativeControlPath?: string;
  nativeMediaSourceAvailable?: boolean;
  nativeMediaSourcePath?: string;
  nativeFrameBridgeAvailable?: boolean;
  nativeFrameBridgePath?: string;
  mediaSourceRegistered?: boolean;
}

export interface StartVirtualCameraOptions {
  // Optional: allow specifying platform override, or device path.
  outputId?: string; // For future multiplexing with scenes
  preferredPlatform?: VirtualCameraPlatform;
  deviceName?: string;
  width?: number;
  height?: number;
  fps?: number;
  bitrateKbps?: number;
  audioSampleRate?: number;
}
