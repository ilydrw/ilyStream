// src/main/services/lighting/lighting-manager.ts
import { EventEmitter } from 'events'
import { LightingDevice, LightingState, LightPlatform } from '../../../shared/lighting'

export interface LightProvider {
  platform: LightPlatform
  initialize(): Promise<void>
  dispose(): Promise<void>
  getDevices(): LightingDevice[]
  scan(): Promise<void>
  setPower(deviceId: string, on: boolean): Promise<void>
  setBrightness(deviceId: string, brightness: number): Promise<void>
  setColor(deviceId: string, color: string): Promise<void>
  applyEffect(deviceId: string, effect: 'flash' | 'pulse', color?: string, duration?: number): Promise<void>
}

export class LightingManagerService extends EventEmitter {
  private providers: Map<LightPlatform, LightProvider> = new Map()
  private isScanning = false
  private lastScan = 0

  constructor() {
    super()
  }

  public registerProvider(provider: LightProvider) {
    this.providers.set(provider.platform, provider)
    console.log(`[LightingManager] Registered provider for ${provider.platform}`)
  }

  public async initialize() {
    for (const provider of this.providers.values()) {
      await provider.initialize()
    }
  }

  public async dispose() {
    for (const provider of this.providers.values()) {
      await provider.dispose()
    }
  }

  public getState(): LightingState {
    const devices: LightingDevice[] = []
    for (const provider of this.providers.values()) {
      devices.push(...provider.getDevices())
    }

    return {
      devices,
      isScanning: this.isScanning,
      lastScan: this.lastScan
    }
  }

  public async scanAll() {
    if (this.isScanning) return
    this.isScanning = true
    this.emit('state-change', this.getState())

    try {
      await Promise.all(
        Array.from(this.providers.values()).map(p => p.scan().catch(err => {
          console.error(`[LightingManager] Scan failed for ${p.platform}:`, err)
        }))
      )
      this.lastScan = Date.now()
    } finally {
      this.isScanning = false
      this.emit('state-change', this.getState())
    }
  }

  public async executeAction(deviceId: string, action: string, params: any) {
    const device = this.findDevice(deviceId)
    if (!device) return

    const provider = this.providers.get(device.platform)
    if (!provider) return

    switch (action) {
      case 'on': await provider.setPower(deviceId, true); break
      case 'off': await provider.setPower(deviceId, false); break
      case 'brightness': await provider.setBrightness(deviceId, params.brightness); break
      case 'color': await provider.setColor(deviceId, params.color); break
      case 'flash': await provider.applyEffect(deviceId, 'flash', params.color, params.duration); break
      case 'pulse': await provider.applyEffect(deviceId, 'pulse', params.color, params.duration); break
    }
  }

  private findDevice(deviceId: string): LightingDevice | undefined {
    for (const provider of this.providers.values()) {
      const device = provider.getDevices().find(d => d.id === deviceId)
      if (device) return device
    }
    return undefined
  }
}
