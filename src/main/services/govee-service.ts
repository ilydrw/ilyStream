import { EventEmitter } from 'events'
import log from 'electron-log'
import { Database } from '../db/database'
import { LightProvider } from './lighting/lighting-manager'
import { LightPlatform, LightingDevice } from '../../shared/lighting'
import { GoveeClient } from './govee/client/govee-client'
import { normalizeGoveeDeviceIdList } from './lighting/lighting-utils'
import type { AppSettings } from '../../shared/app-settings'

export interface GoveeDevice {
  device: string
  model: string
  deviceName: string
  controllable: boolean
  retrievable: boolean
  supportCmds: string[]
  source: 'cloud' | 'lan' | 'cloud+lan'
  ip?: string
}

export class GoveeService extends EventEmitter implements LightProvider {
  public platform: LightPlatform = 'govee'
  private isConnected = false
  private client = new GoveeClient()
  private cloudDevices: GoveeDevice[] = []
  private lanDevices = new Map<string, GoveeDevice>()
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
    return mergeGoveeDeviceLists(this.cloudDevices, Array.from(this.lanDevices.values())).map(d => ({
      id: d.device,
      platform: 'govee',
      name: d.deviceName,
      online: true,
      reachable: true,
      brightness: 100,
      on: true,
      color: '#ffffff',
      lastSeen: Date.now()
    }))
  }

  async scan(): Promise<void> {
    await this.getGoveeDevices(true)
  }

  /** Manual trigger for device list reconstruction, used by tests */
  rebuildDeviceList(): void {
    this.devices = this.getDevices()
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
      this.cloudDevices = await this.client.fetchCloudDevices()
      this.rebuildDeviceList()
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

  async triggerAlert(rgb: { r: number; g: number; b: number }): Promise<void> {
    const all = mergeGoveeDeviceLists(this.cloudDevices, Array.from(this.lanDevices.values()))
    const selected = all.filter(d => this.selectedDeviceIds.includes(d.device))
    
    if (selected.length === 0) {
      log.info('[Govee] Alert skipped: no devices selected.')
      return
    }

    for (const d of selected) {
      if (d.source === 'lan' || d.source === 'cloud+lan') {
        await this.controlLanDevice(d, rgb)
      } else {
        await this.controlCloudDevice(d, rgb)
      }
    }
  }

  async controlLanDevice(device: GoveeDevice, rgb: { r: number; g: number; b: number }): Promise<void> {
    log.info(`[Govee] LAN Control: ${device.device} -> RGB(${rgb.r},${rgb.g},${rgb.b})`)
  }

  async controlCloudDevice(device: GoveeDevice, rgb: { r: number; g: number; b: number }): Promise<void> {
    log.info(`[Govee] Cloud Control: ${device.device} -> RGB(${rgb.r},${rgb.g},${rgb.b})`)
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

export function parseGoveeLanScanResponse(data: string, remoteIp: string): GoveeDevice | null {
  try {
    const json = JSON.parse(data)
    const d = json.msg?.data
    if (!d || !d.device) return null
    return {
      device: d.device,
      model: d.sku,
      deviceName: `Govee ${d.sku}`,
      controllable: true,
      retrievable: true,
      supportCmds: ['turn', 'brightness', 'colorwc'],
      source: 'lan',
      ip: d.ip || remoteIp
    }
  } catch {
    return null
  }
}

export function mergeGoveeDeviceLists(cloud: GoveeDevice[], lan: GoveeDevice[]): GoveeDevice[] {
  const merged: GoveeDevice[] = [...cloud]
  for (const l of lan) {
    const cIdx = merged.findIndex(m => m.device.replace(/:/g, '') === l.device.replace(/:/g, ''))
    if (cIdx >= 0) {
      merged[cIdx] = {
        ...merged[cIdx],
        source: 'cloud+lan',
        ip: l.ip,
        supportCmds: Array.from(new Set([...merged[cIdx].supportCmds, ...l.supportCmds]))
      }
    } else {
      merged.push(l)
    }
  }
  return merged
}
