import { EventEmitter } from 'events'
import log from 'electron-log'
import { Database } from '../db/database'
import { LightProvider } from './lighting/lighting-manager'
import { LightPlatform, LightingDevice } from '../../shared/lighting'
import { GoveeClient } from './govee/client/govee-client'
import { hexToRgb, normalizeGoveeDeviceIdList } from './lighting/lighting-utils'
import type { AppSettings } from '../../shared/app-settings'
import {
  createGoveeBleDeviceId,
  inferGoveeModelFromName,
  normalizeGoveeBleDeviceId,
  type GoveeBleCommandPayload,
  type GoveeBleDeviceRecord,
  type GoveeBleProtocol
} from '../../shared/govee-ble'

export type GoveeDeviceSource =
  | 'cloud'
  | 'lan'
  | 'cloud+lan'
  | 'ble'
  | 'cloud+ble'
  | 'lan+ble'
  | 'cloud+lan+ble'

export interface GoveeDevice {
  device: string
  model: string
  deviceName: string
  controllable: boolean
  retrievable: boolean
  supportCmds: string[]
  source: GoveeDeviceSource
  ip?: string
  bluetoothId?: string
  protocol?: GoveeBleProtocol
  connected?: boolean
  lastError?: string
  lastSeen?: number
}

export class GoveeService extends EventEmitter implements LightProvider {
  public platform: LightPlatform = 'govee'
  private isConnected = false
  private client = new GoveeClient()
  private cloudDevices: GoveeDevice[] = []
  private lanDevices = new Map<string, GoveeDevice>()
  private bleDevices = new Map<string, GoveeBleDeviceRecord>()
  private devices: LightingDevice[] = []
  private selectedDeviceIds: string[] = []
  private lastCloudError: string | null = null

  constructor(private db: Database) {
    super()
    const key = this.db.getSetting('goveeApiKey') as string
    if (key) this.client.setApiKey(key)
    this.selectedDeviceIds = normalizeGoveeDeviceIdList(this.db.getSetting('goveeSelectedDeviceIds'))
    this.bleDevices = readStoredBleDevices(this.db.getSetting('goveeBleDevices'))
    this.rebuildDeviceList()
  }

  async initialize(): Promise<void> {
    const key = this.db.getSetting('goveeApiKey') as string
    if (key) await this.connect(key)
    this.emit('status-changed', this.getStatus())
  }

  async dispose(): Promise<void> {
    this.isConnected = false
  }

  getDevices(): LightingDevice[] {
    return this.getAllGoveeDevices().map((device) => ({
      id: device.device,
      platform: 'govee',
      name: device.deviceName,
      online: device.connected !== false,
      reachable: device.connected !== false,
      brightness: 100,
      on: true,
      color: '#ffffff',
      lastSeen: device.lastSeen || Date.now()
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
      this.lastCloudError = formatError(err)
      log.error('[Govee] Connection failed:', err)
      this.emit('status-changed', this.getStatus())
      return false
    }
  }

  async disconnect(): Promise<void> {
    this.isConnected = false
    this.emit('status-changed', this.getStatus())
  }

  async getGoveeDevices(forceRefresh = false): Promise<GoveeDevice[]> {
    if (this.isConnected || forceRefresh) {
      try {
        const cloudDevices = await this.client.fetchCloudDevices()
        this.cloudDevices = cloudDevices.map(normalizeCloudDevice)
        this.lastCloudError = null
      } catch (err) {
        this.lastCloudError = formatError(err)
        log.warn('[Govee] Cloud device refresh failed:', err)
      }
    }

    this.rebuildDeviceList()
    this.emit('status-changed', this.getStatus())
    return this.getAllGoveeDevices()
  }

  getBleDevices(): GoveeBleDeviceRecord[] {
    return Array.from(this.bleDevices.values())
  }

  registerBleDevice(input: Partial<GoveeBleDeviceRecord> & { bluetoothId: string; deviceName?: string }): GoveeBleDeviceRecord {
    const bluetoothId = String(input.bluetoothId || '').trim()
    if (!bluetoothId) throw new Error('Missing Bluetooth device id.')

    const deviceName = String(input.deviceName || 'Govee Bluetooth').trim()
    const record: GoveeBleDeviceRecord = {
      device: input.device || createGoveeBleDeviceId(bluetoothId),
      bluetoothId,
      deviceName,
      model: input.model || inferGoveeModelFromName(deviceName),
      protocol: input.protocol || 'auto',
      connected: input.connected !== false,
      lastSeen: input.lastSeen || Date.now(),
      lastError: input.lastError
    }

    this.bleDevices.set(record.device, record)
    this.persistBleDevices()
    this.rebuildDeviceList()
    this.emit('status-changed', this.getStatus())
    return record
  }

  updateBleDeviceStatus(input: { device: string; connected: boolean; lastError?: string }): GoveeBleDeviceRecord | null {
    const record = this.bleDevices.get(input.device)
    if (!record) return null
    record.connected = input.connected
    record.lastSeen = Date.now()
    record.lastError = input.lastError
    this.persistBleDevices()
    this.rebuildDeviceList()
    this.emit('status-changed', this.getStatus())
    return record
  }

  setBleDeviceProtocol(deviceId: string, protocol: GoveeBleProtocol): GoveeBleDeviceRecord | null {
    const record = this.bleDevices.get(deviceId)
    if (!record) return null
    record.protocol = protocol
    this.persistBleDevices()
    this.rebuildDeviceList()
    this.emit('status-changed', this.getStatus())
    return record
  }

  removeBleDevice(deviceId: string): boolean {
    const removed = this.bleDevices.delete(deviceId)
    if (removed) {
      this.selectedDeviceIds = this.selectedDeviceIds.filter((id) => !deviceIdsEqual(id, deviceId))
      this.db.setSetting('goveeSelectedDeviceIds', this.selectedDeviceIds)
      this.persistBleDevices()
      this.rebuildDeviceList()
      this.emit('status-changed', this.getStatus())
    }
    return removed
  }

  setSelectedDevices(ids: string[]): void {
    this.selectedDeviceIds = ids
    this.db.setSetting('goveeSelectedDeviceIds', ids)
    this.emit('status-changed', this.getStatus())
  }

  async setPower(deviceId: string, on: boolean): Promise<void> {
    const device = this.findGoveeDevice(deviceId)
    if (!device) return
    if (device.source.includes('ble')) {
      const rgb = on ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 }
      await this.controlBleDevice(device, rgb, on ? undefined : 0)
      return
    }
    await this.client.controlDevice(device.device, device.model, { name: 'turn', value: on ? 'on' : 'off' })
  }

  async setBrightness(deviceId: string, brightness: number): Promise<void> {
    const device = this.findGoveeDevice(deviceId)
    if (!device) return
    if (device.source.includes('ble')) {
      await this.controlBleDevice(device, { r: 255, g: 255, b: 255 }, brightness)
      return
    }
    await this.client.controlDevice(device.device, device.model, { name: 'brightness', value: brightness })
  }

  async setColor(deviceId: string, color: string): Promise<void> {
    const device = this.findGoveeDevice(deviceId)
    if (!device) return
    const rgb = hexToRgb(color)
    await this.controlGoveeDevice(device, rgb)
  }

  async applyEffect(deviceId: string, effect: 'flash' | 'pulse', color = '#19C8FF', durationMs = 2000): Promise<void> {
    if (!this.isDeviceSelected(deviceId)) return
    const device = this.findGoveeDevice(deviceId)
    if (!device) return

    const rgb = hexToRgb(color)
    await this.controlGoveeDevice(device, rgb)

    if (effect === 'flash') {
      setTimeout(() => {
        void this.controlGoveeDevice(device, { r: 255, g: 255, b: 255 }).catch((err) => {
          log.warn('[Govee] Flash restore failed:', err)
        })
      }, Math.max(300, Math.min(durationMs, 10_000)))
    }
  }

  async triggerStrobe(durationMs: number): Promise<void> {
    log.info(`[Govee] Triggering strobe for ${durationMs}ms`)
    await this.triggerAlert({ r: 255, g: 255, b: 255 })
  }

  async triggerFlash(color: string): Promise<void> {
    log.info(`[Govee] Triggering flash with color ${color}`)
    await this.triggerAlert(hexToRgb(color))
  }

  async triggerAlert(rgb: { r: number; g: number; b: number }): Promise<void> {
    const selected = this.getAllGoveeDevices().filter((device) => this.isDeviceSelected(device.device))

    if (selected.length === 0) {
      log.info('[Govee] Alert skipped: no devices selected.')
      return
    }

    for (const device of selected) {
      await this.controlGoveeDevice(device, rgb)
    }
  }

  async controlLanDevice(device: GoveeDevice, rgb: { r: number; g: number; b: number }): Promise<void> {
    log.info(`[Govee] LAN Control: ${device.device} -> RGB(${rgb.r},${rgb.g},${rgb.b})`)
  }

  async controlCloudDevice(device: GoveeDevice, rgb: { r: number; g: number; b: number }): Promise<void> {
    log.info(`[Govee] Cloud Control: ${device.device} -> RGB(${rgb.r},${rgb.g},${rgb.b})`)
    await this.client.controlDevice(device.device, device.model, {
      name: 'color',
      value: { r: rgb.r, g: rgb.g, b: rgb.b }
    })
  }

  async controlBleDevice(device: GoveeDevice, rgb: { r: number; g: number; b: number }, brightness?: number): Promise<void> {
    if (!device.bluetoothId) return
    const payload: GoveeBleCommandPayload = {
      deviceId: device.device,
      bluetoothId: device.bluetoothId,
      rgb,
      brightness,
      protocol: device.protocol || 'auto'
    }
    log.info(`[Govee] BLE Control: ${device.device} -> RGB(${rgb.r},${rgb.g},${rgb.b})`)
    this.emit('ble-command', payload)
  }

  applySettings(settings: AppSettings): void {
    if (settings.integrations?.govee?.selectedDeviceIds) {
      this.selectedDeviceIds = settings.integrations.govee.selectedDeviceIds
    }
    this.rebuildDeviceList()
  }

  getStatus() {
    const devices = this.getAllGoveeDevices()
    const ble = this.getBleDevices()
    const apiKey = this.db.getSetting('goveeApiKey') as string
    return {
      isConnected: this.isConnected || ble.length > 0,
      platform: this.platform,
      apiKey: apiKey ? 'saved' : null,
      deviceCount: devices.length,
      cloudDeviceCount: this.cloudDevices.length,
      lanDeviceCount: this.lanDevices.size,
      bleDeviceCount: ble.length,
      bleConnectedCount: ble.filter((device) => device.connected).length,
      selectedCount: this.selectedDeviceIds.length,
      selectedDeviceIds: this.selectedDeviceIds,
      lastCloudError: this.lastCloudError
    }
  }

  private getAllGoveeDevices(): GoveeDevice[] {
    return mergeGoveeDeviceLists(
      this.cloudDevices,
      Array.from(this.lanDevices.values()),
      this.getBleDevices().map(recordToGoveeDevice)
    )
  }

  private findGoveeDevice(deviceId: string): GoveeDevice | undefined {
    return this.getAllGoveeDevices().find((device) => deviceIdsEqual(device.device, deviceId))
  }

  private isDeviceSelected(deviceId: string): boolean {
    return this.selectedDeviceIds.some((selectedId) => deviceIdsEqual(selectedId, deviceId))
  }

  private async controlGoveeDevice(device: GoveeDevice, rgb: { r: number; g: number; b: number }): Promise<void> {
    if (device.source.includes('ble')) {
      await this.controlBleDevice(device, rgb)
      return
    }

    if (device.source.includes('lan')) {
      await this.controlLanDevice(device, rgb)
      return
    }

    await this.controlCloudDevice(device, rgb)
  }

  private persistBleDevices(): void {
    this.db.setSetting('goveeBleDevices', this.getBleDevices())
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

export function mergeGoveeDeviceLists(
  cloud: GoveeDevice[],
  lan: GoveeDevice[],
  ble: GoveeDevice[] = []
): GoveeDevice[] {
  const merged: GoveeDevice[] = [...cloud.map(normalizeCloudDevice)]

  for (const lanDevice of lan) {
    mergeDevice(merged, lanDevice)
  }

  for (const bleDevice of ble) {
    mergeDevice(merged, bleDevice)
  }

  return merged
}

function mergeDevice(merged: GoveeDevice[], device: GoveeDevice): void {
  const existingIndex = merged.findIndex((candidate) => deviceIdsEqual(candidate.device, device.device))
  if (existingIndex < 0) {
    merged.push(device)
    return
  }

  const existing = merged[existingIndex]
  merged[existingIndex] = {
    ...existing,
    ...device,
    deviceName: existing.deviceName || device.deviceName,
    source: mergeDeviceSource(existing.source, device.source),
    supportCmds: Array.from(new Set([...existing.supportCmds, ...device.supportCmds]))
  }
}

function mergeDeviceSource(left: GoveeDeviceSource, right: GoveeDeviceSource): GoveeDeviceSource {
  const parts = new Set([...left.split('+'), ...right.split('+')])
  const ordered = ['cloud', 'lan', 'ble'].filter((part) => parts.has(part))
  return ordered.join('+') as GoveeDeviceSource
}

function normalizeCloudDevice(value: any): GoveeDevice {
  return {
    device: String(value.device || ''),
    model: String(value.model || inferGoveeModelFromName(String(value.deviceName || value.device || ''))),
    deviceName: String(value.deviceName || value.device || 'Govee Device'),
    controllable: value.controllable !== false,
    retrievable: value.retrievable !== false,
    supportCmds: Array.isArray(value.supportCmds) ? value.supportCmds.map(String) : [],
    source: value.source || 'cloud',
    ip: value.ip,
    bluetoothId: value.bluetoothId,
    protocol: value.protocol,
    connected: value.connected,
    lastError: value.lastError,
    lastSeen: value.lastSeen
  }
}

function recordToGoveeDevice(record: GoveeBleDeviceRecord): GoveeDevice {
  return {
    device: record.device,
    model: record.model,
    deviceName: record.deviceName,
    controllable: true,
    retrievable: false,
    supportCmds: ['turn', 'brightness', 'color'],
    source: 'ble',
    bluetoothId: record.bluetoothId,
    protocol: record.protocol,
    connected: record.connected,
    lastError: record.lastError,
    lastSeen: record.lastSeen
  }
}

function readStoredBleDevices(value: unknown): Map<string, GoveeBleDeviceRecord> {
  const devices = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? safeParseJsonArray(value)
      : []
  const map = new Map<string, GoveeBleDeviceRecord>()

  for (const item of devices) {
    if (!item || typeof item !== 'object') continue
    const input = item as Partial<GoveeBleDeviceRecord>
    if (!input.bluetoothId) continue
    const deviceName = String(input.deviceName || 'Govee Bluetooth')
    const record: GoveeBleDeviceRecord = {
      device: input.device || createGoveeBleDeviceId(input.bluetoothId),
      bluetoothId: String(input.bluetoothId),
      deviceName,
      model: input.model || inferGoveeModelFromName(deviceName),
      protocol: input.protocol || 'auto',
      connected: false,
      lastSeen: Number(input.lastSeen) || Date.now(),
      lastError: input.lastError
    }
    map.set(record.device, record)
  }

  return map
}

function safeParseJsonArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function deviceIdsEqual(left: string, right: string): boolean {
  return normalizeGoveeBleDeviceId(left) === normalizeGoveeBleDeviceId(right)
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
