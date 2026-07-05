import type { LightingDevice } from './lighting'

export type RazerDeviceKind =
  | 'keyboard'
  | 'mouse'
  | 'mousepad'
  | 'keypad'
  | 'headset'
  | 'chromalink'
  | 'unknown'

export type RazerChromaTheme =
  | 'spectrum'
  | 'static'
  | 'breathing'
  | 'wave'
  | 'reactive'

export interface RazerThemeSettings {
  theme: RazerChromaTheme
  primaryColor: string
  secondaryColor: string
  waveDirection: 1 | 2
  reactiveDuration: 1 | 2 | 3 | 4
}

export interface RazerDetectedDevice {
  id: string
  name: string
  kind: RazerDeviceKind
  source: 'windows' | 'sdk-target'
  online: boolean
  reachable: boolean
  lastSeen: number
}

export interface RazerStatus {
  connected: boolean
  connecting: boolean
  serviceUrl: string
  sessionUri: string | null
  lastError: string | null
  lastHeartbeatAt: number | null
  devices: RazerDetectedDevice[]
  lightingDevices: LightingDevice[]
  supportedTargets: Exclude<RazerDeviceKind, 'unknown'>[]
  theme: RazerThemeSettings
}

export const DEFAULT_RAZER_THEME: RazerThemeSettings = {
  theme: 'spectrum',
  primaryColor: '#19c8ff',
  secondaryColor: '#d035f1',
  waveDirection: 1,
  reactiveDuration: 1
}
