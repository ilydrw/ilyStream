// src/shared/lighting.ts

export type LightPlatform = 'hue' | 'govee' | 'nanoleaf' | 'lifx' | 'wiz' | 'yeelight' | 'elgato' | 'razer' | 'corsair'

export interface LightingDevice {
  id: string
  name: string
  platform: LightPlatform
  online: boolean
  reachable: boolean
  brightness: number // 0-100
  color?: string // hex
  on: boolean
  lastSeen: number
}

export interface LightingState {
  devices: LightingDevice[]
  isScanning: boolean
  lastScan: number
}

export interface LightingEventConfig {
  id: string
  enabled: boolean
  trigger: string // e.g. "follow", "gift", "sub"
  platform?: string // filter by platform
  action: 'flash' | 'pulse' | 'color-change' | 'on' | 'off'
  color?: string
  durationMs?: number
  targetDevices: string[] // device IDs
}
