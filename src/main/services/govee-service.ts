import { EventEmitter } from 'events'
import log from 'electron-log'
import { Database } from '../db/database'
import { LightProvider } from './lighting/lighting-manager'
import { LightPlatform, LightingDevice } from '../../shared/lighting'
import { GoveeClient } from './govee/client/govee-client'
import { normalizeGoveeDeviceIdList } from './lighting/lighting-utils'
import type { AppSettings } from '../../shared/app-settings'

export class GoveeService extends EventEmitter implements LightProvider {
  public platform: LightPlatform = 'govee'
  private isConnected = false
  private client = new GoveeClient()
  private devices: LightingDevice[] = []
  private selectedDeviceIds: string[] = []

  constructor(private db: Database) {
    super()
    const key = this.db.getSetting('goveeApiKey') as string
    if (key) this.client.setApiKey(key)
    this.selectedDeviceIds = normalizeGoveeDeviceIdList(this.db.getSetting('goveeSelectedDeviceIds'))
  }

  async initialize(): Promise<void> {
    const key = this.db.getSetting('goveeApiKey') as string
    if (key) await this.connect(key)
  }

  async dispose(): Promise<void> {
    this.isConnected = false
  }

  getDevices(): LightingDevice[] {
    return this.devices
  }

  async scan(): Promise<void> {
    await this.getGoveeDevices(true)
  }

  async connect(apiKey: string): Promise<boolean> {
    try {
      this.client.setApiKey(apiKey)
      await this.getGoveeDevices(true)
      this.isConnected = true
      this.db.setSetting('goveeApiKey', apiKey)
      this.emit('status-changed', this.getStatus())
      return true
    } catch (err) {
      log.error('[Govee] Connection failed:', err)
      return false
    }
  }

  async disconnect(): Promise<void> {
    this.isConnected = false
    this.emit('status-changed', this.getStatus())
  }

  async getGoveeDevices(forceRefresh = false): Promise<LightingDevice[]> {
    if (!this.isConnected && !forceRefresh) return []
    try {
      const rawDevices = await this.client.fetchCloudDevices()
      this.devices = rawDevices.map(d => ({
        id: d.device,
        platform: 'govee',
        name: d.deviceName,
        type: 'light',
        online: true,
        state: { on: true, brightness: 100, color: '#ffffff' }
      }))
      return this.devices
    } catch (err) {
      return []
    }
  }

  setSelectedDevices(ids: string[]): void {
    this.selectedDeviceIds = ids
    this.db.setSetting('goveeSelectedDeviceIds', ids)
  }

  async setPower(deviceId: string, on: boolean): Promise<void> {
    const device = this.devices.find(d => d.id === deviceId)
    if (device) await this.client.controlDevice(deviceId, (device as any).model || '', { name: 'turn', value: on ? 'on' : 'off' })
  }

  async setBrightness(deviceId: string, brightness: number): Promise<void> {
    const device = this.devices.find(d => d.id === deviceId)
    if (device) await this.client.controlDevice(deviceId, (device as any).model || '', { name: 'brightness', value: brightness })
  }

  async setColor(deviceId: string, color: string): Promise<void> {
    //
  }

  async applyEffect(deviceId: string, effect: string): Promise<void> {
    //
  }

  async triggerStrobe(durationMs: number): Promise<void> {
    log.info(`[Govee] Triggering strobe for ${durationMs}ms`)
  }

  async triggerFlash(color: string): Promise<void> {
    log.info(`[Govee] Triggering flash with color ${color}`)
  }

  applySettings(settings: AppSettings): void {
    if (settings.integrations?.govee?.selectedDeviceIds) {
      this.selectedDeviceIds = settings.integrations.govee.selectedDeviceIds
    }
  }

  getStatus() {
    return { 
      isConnected: this.isConnected, 
      platform: this.platform,
      deviceCount: this.devices.length,
      selectedCount: this.selectedDeviceIds.length
    }
  }
}
