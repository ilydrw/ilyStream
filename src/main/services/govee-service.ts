import { EventEmitter } from 'events'
import dgram from 'node:dgram'
import os from 'node:os'
import log from 'electron-log'
import { Database } from '../db/database'

const GOVEE_MULTICAST_ADDRESS = '239.255.255.250'
const GOVEE_SCAN_PORT = 4001
const GOVEE_LISTEN_PORT = 4002
const GOVEE_CONTROL_PORT = 4003
const GOVEE_LAN_SCAN_TIMEOUT_MS = 3500
const GOVEE_LAN_SCAN_ROUNDS = 3
const GOVEE_WHITE_STROBE_INTERVAL_MS = 200
const GOVEE_CYBER_STROBE_INTERVAL_MS = 350
const GOVEE_SUPERFAN_STROBE_INTERVAL_MS = 90
const GOVEE_EFFECT_COOLDOWN_MS = 5000
const CYBER_BLUE = { r: 25, g: 200, b: 255 }
const CYBER_PURPLE = { r: 208, g: 53, b: 241 }

type GoveeDeviceSource = 'cloud' | 'lan' | 'cloud+lan'

export interface GoveeDevice {
  device: string
  model: string
  deviceName: string
  controllable: boolean
  retrievable: boolean
  supportCmds: string[]
  properties?: Record<string, any>
  source?: GoveeDeviceSource
  ip?: string
  lanDiscoveredAt?: number
  selected?: boolean
}

export class GoveeService extends EventEmitter {
  private apiKey: string | null = null
  private isConnected = false
  private devices: GoveeDevice[] = []
  private cloudDevices: GoveeDevice[] = []
  private lanDevices = new Map<string, GoveeDevice>()
  private lanScanInflight: Promise<GoveeDevice[]> | null = null
  private selectedDeviceIds: string[] = []
  private refreshInterval: NodeJS.Timeout | null = null
  private strobeInterval: NodeJS.Timeout | null = null
  private restoreTimeout: NodeJS.Timeout | null = null
  private cooldownTimeout: NodeJS.Timeout | null = null
  private isTriggerActive = false
  private db: Database

  constructor(db: Database) {
    super()
    this.db = db
    this.apiKey = this.db.getSetting('goveeApiKey') as string || null
    this.selectedDeviceIds = normalizeGoveeDeviceIdList(this.db.getSetting('goveeSelectedDeviceIds'))
    
    // Start background refresh every 10 minutes
    this.refreshInterval = setInterval(() => {
      if (this.isConnected && this.apiKey) {
        void this.refreshDevicesInBackground()
      }
    }, 10 * 60 * 1000)
  }

  async initialize(): Promise<void> {
    if (this.apiKey) {
      log.info('[Govee] Found persisted API key. Attempting auto-connect...')
      try {
        await this.connect(this.apiKey)
      } catch (err) {
        log.warn('[Govee] Auto-connect failed.')
      }
    }
  }

  private async refreshDevicesInBackground(): Promise<void> {
    try {
      if (this.apiKey) {
        this.cloudDevices = await this.fetchCloudDevices(this.apiKey)
      }
      await this.refreshLanDevices()
      this.rebuildDeviceList()
      this.emit('status-changed', this.getStatus())
    } catch (err) {
      log.debug('[Govee] Background refresh failed:', err)
    }
  }

  async connect(apiKey: string): Promise<boolean> {
    log.info('[Govee] Attempting to connect to Govee Cloud API...')
    
    try {
      this.cloudDevices = await this.fetchCloudDevices(apiKey)
      this.apiKey = apiKey
      this.isConnected = true
      this.db.setSetting('goveeApiKey', apiKey)

      await this.refreshLanDevices()
      this.rebuildDeviceList()

      log.info(
        `[Govee] Successfully connected. Found ${this.cloudDevices.length} cloud devices and ${this.lanDevices.size} LAN devices.`
      )
      this.emit('status-changed', this.getStatus())
      return true
    } catch (error: any) {
      log.error('[Govee] Connection failed:', error.message || error)
      if (error.stack) log.debug('[Govee] Stack:', error.stack)
      this.isConnected = false
      return false
    }
  }

  async getDevices(forceRefresh = false): Promise<GoveeDevice[]> {
    // If we have devices and NOT forcing refresh, return cache immediately
    if (this.devices.length > 0 && !forceRefresh) {
      void this.refreshDevicesInBackground()
      return this.devices
    }

    if (this.isConnected && this.apiKey) {
      try {
        this.cloudDevices = await this.fetchCloudDevices(this.apiKey)
      } catch (error) {
        log.error('[Govee] Get cloud devices error:', error)
      }
    }

    await this.refreshLanDevices()
    this.rebuildDeviceList()
    return this.devices
  }

  async triggerAlert(color: { r: number; g: number; b: number }, durationMs = 5000): Promise<void> {
    if (this.devices.length === 0) {
      await this.getDevices()
    }
    const targets = this.getSelectedDevices()
    if (targets.length === 0) {
      log.info('[Govee] Alert skipped: no Govee devices selected.')
      return
    }
    
    log.info(`[Govee] Triggering alert for ${targets.length} selected devices...`)
    
    for (const device of targets) {
      if (!device.controllable) continue
      
      try {
        if (device.ip) {
          await this.controlLanDevice(device, color)
          continue
        }

        await this.controlCloudDevice(device, 'color', color)
        await this.controlCloudDevice(device, 'brightness', 100)
      } catch (err) {
        log.error(`[Govee] Failed to control device ${device.device}:`, err)
        if (device.ip && this.apiKey && device.source !== 'lan') {
          try {
            await this.controlCloudDevice(device, 'color', color)
            await this.controlCloudDevice(device, 'brightness', 100)
          } catch (cloudErr) {
            log.error(`[Govee] Cloud fallback failed for ${device.device}:`, cloudErr)
          }
        }
      }
    }

    // Revert after the specified duration to a neutral state (warm white)
    this.restoreTimeout = setTimeout(async () => {
      for (const device of targets) {
        if (!device.controllable) continue
        try {
          if (device.ip) {
            await this.setLanColor(device, { r: 255, g: 255, b: 255 })
            await this.setLanBrightness(device, 100)
          } else {
            await this.controlCloudDevice(device, 'color', { r: 255, g: 255, b: 255 })
            await this.controlCloudDevice(device, 'brightness', 100)
          }
        } catch (err) {
          log.error(`[Govee] Revert failed for ${device.device}:`, err)
        }
      }
      this.isTriggerActive = false
    }, sanitizeGoveeDuration(durationMs))
  }
  
  /** Apply new settings from the database at runtime. */
  applySettings(settings: any): void {
    if (settings.goveeApiKey && settings.goveeApiKey !== this.apiKey) {
      log.info('[Govee] API Key changed, reconnecting...')
      void this.connect(settings.goveeApiKey)
    }
    
    if (settings.goveeSelectedDeviceIds) {
      this.selectedDeviceIds = normalizeGoveeDeviceIdList(settings.goveeSelectedDeviceIds)
      this.rebuildDeviceList()
      log.info(`[Govee] Runtime selected devices updated: ${this.selectedDeviceIds.length} devices`)
    }
  }

  async triggerFlash(color: { r: number; g: number; b: number } = CYBER_BLUE): Promise<void> {
    return this.triggerAlert(color)
  }

  async triggerStrobe(durationMs: number): Promise<void> {
    const targets = await this.getLanEffectTargets()
    if (targets.length === 0) {
      await this.triggerAlert({ r: 255, g: 255, b: 255 }, durationMs)
      return
    }
    if (!this.startEffect('white strobe')) return

    try {
      await Promise.allSettled(
        targets.map((device) => this.prepareLanDeviceForEffect(device, { r: 255, g: 255, b: 255 }))
      )

      let high = true
      const applyFrame = () => {
        const brightness = high ? 100 : 1
        for (const device of targets) {
          this.setLanBrightness(device, brightness).catch(() => {})
        }
        high = !high
      }

      applyFrame()
      this.strobeInterval = setInterval(applyFrame, GOVEE_WHITE_STROBE_INTERVAL_MS)
      this.restoreTimeout = setTimeout(() => {
        this.finishLanEffect(targets)
      }, sanitizeGoveeDuration(durationMs))
    } catch (error) {
      log.error('[Govee] LAN white strobe failed:', error)
      this.finishLanEffect(targets)
    }
  }

  async triggerCyberGradientStrobe(
    durationMs: number,
    options: { frameIntervalMs?: number } = {}
  ): Promise<void> {
    const targets = await this.getLanEffectTargets()
    if (targets.length === 0) {
      await this.triggerAlert(CYBER_PURPLE, durationMs)
      return
    }
    if (!this.startEffect('cyber gradient strobe')) return

    const frameIntervalMs = clampGoveeStrobeInterval(
      options.frameIntervalMs ?? GOVEE_CYBER_STROBE_INTERVAL_MS
    )

    try {
      await Promise.allSettled(targets.map((device) => this.setLanTurn(device, true)))
      await Promise.allSettled(targets.map((device) => this.setLanBrightness(device, 100)))

      let swap = false
      const applyFrame = () => {
        targets.forEach((device, index) => {
          const useBlue = targets.length === 1 ? !swap : (index % 2 === 0) !== swap
          const color = useBlue ? CYBER_BLUE : CYBER_PURPLE
          this.setLanColor(device, color).catch(() => {})
        })
        swap = !swap
      }

      applyFrame()
      this.strobeInterval = setInterval(applyFrame, frameIntervalMs)
      this.restoreTimeout = setTimeout(() => {
        this.finishLanEffect(targets)
      }, sanitizeGoveeDuration(durationMs))
    } catch (error) {
      log.error('[Govee] LAN cyber gradient strobe failed:', error)
      this.finishLanEffect(targets)
    }
  }

  async triggerSuperfanCyberGradientStrobe(durationMs: number): Promise<void> {
    return this.triggerCyberGradientStrobe(durationMs, {
      frameIntervalMs: GOVEE_SUPERFAN_STROBE_INTERVAL_MS
    })
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      apiKey: this.apiKey ? `${this.apiKey.substring(0, 4)}...${this.apiKey.substring(this.apiKey.length - 4)}` : null,
      deviceCount: this.devices.length,
      cloudDeviceCount: this.cloudDevices.length,
      lanDeviceCount: this.lanDevices.size,
      selectedDeviceIds: this.selectedDeviceIds
    }
  }

  setSelectedDevices(ids: string[]): void {
    this.selectedDeviceIds = normalizeGoveeDeviceIdList(ids)
    this.db.setSetting('goveeSelectedDeviceIds', this.selectedDeviceIds)
    this.rebuildDeviceList()
    this.emit('status-changed', this.getStatus())
    log.info(`[Govee] Updated selected devices: ${this.selectedDeviceIds.join(', ') || 'none'}`)
  }

  async disconnect(): Promise<void> {
    this.clearActiveEffect()
    this.apiKey = null
    this.isConnected = false
    this.devices = []
    this.cloudDevices = []
    this.lanDevices.clear()
    this.db.setSetting('goveeApiKey', null)
    this.emit('status-changed', this.getStatus())
    log.info('[Govee] Disconnected and API key removed.')
  }

  dispose(): void {
    this.clearActiveEffect()
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval)
      this.refreshInterval = null
    }
    this.removeAllListeners()
  }

  private async fetchCloudDevices(apiKey: string): Promise<GoveeDevice[]> {
    const response = await fetch('https://developer-api.govee.com/v1/devices', {
      headers: {
        'Govee-API-Key': apiKey,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Govee API returned status ${response.status}`)
    }

    const data = await response.json()
    log.debug('[Govee] API Response Payload:', JSON.stringify(data))

    if (Number(data.code) !== 200) {
      throw new Error(`Govee API returned error code ${data.code}: ${data.message}`)
    }

    return ((data.data?.devices || []) as GoveeDevice[]).map((device) => ({
      ...device,
      source: 'cloud'
    }))
  }

  private async refreshLanDevices(): Promise<GoveeDevice[]> {
    try {
      const lanDevices = await this.discoverLanDevices()
      this.lanDevices = new Map(
        lanDevices.map((device) => [normalizeGoveeDeviceId(device.device), device])
      )
      return lanDevices
    } catch (error) {
      log.warn('[Govee] LAN discovery failed:', error)
      return Array.from(this.lanDevices.values())
    }
  }

  private rebuildDeviceList(): void {
    const selected = new Set(this.selectedDeviceIds.map(normalizeGoveeDeviceId))
    this.devices = mergeGoveeDeviceLists(this.cloudDevices, Array.from(this.lanDevices.values()))
      .map((device) => ({
        ...device,
        selected: selected.has(normalizeGoveeDeviceId(device.device))
      }))
  }

  private async getLanEffectTargets(): Promise<GoveeDevice[]> {
    if (this.devices.length === 0 || this.lanDevices.size === 0) {
      await this.getDevices()
    }
    return this.getSelectedDevices().filter((device) => device.controllable && Boolean(device.ip))
  }

  private getSelectedDevices(): GoveeDevice[] {
    const selected = new Set(this.selectedDeviceIds.map(normalizeGoveeDeviceId))
    if (selected.size === 0) return []
    return this.devices.filter((device) => selected.has(normalizeGoveeDeviceId(device.device)))
  }

  private startEffect(name: string): boolean {
    if (this.isTriggerActive) {
      log.info(`[Govee] ${name} skipped: another lighting effect is active.`)
      return false
    }
    this.isTriggerActive = true
    this.clearActiveEffect()
    log.info(`[Govee] Triggering LAN ${name}.`)
    return true
  }

  private clearActiveEffect(): void {
    if (this.strobeInterval) {
      clearInterval(this.strobeInterval)
      this.strobeInterval = null
    }
    if (this.restoreTimeout) {
      clearTimeout(this.restoreTimeout)
      this.restoreTimeout = null
    }
    if (this.cooldownTimeout) {
      clearTimeout(this.cooldownTimeout)
      this.cooldownTimeout = null
    }
  }

  private finishLanEffect(targets: GoveeDevice[]): void {
    this.clearActiveEffect()
    for (const device of targets) {
      this.prepareLanDeviceForEffect(device, { r: 255, g: 255, b: 255 }, 100).catch(() => {})
    }
    this.cooldownTimeout = setTimeout(() => {
      this.isTriggerActive = false
      this.cooldownTimeout = null
    }, GOVEE_EFFECT_COOLDOWN_MS)
  }

  private async discoverLanDevices(): Promise<GoveeDevice[]> {
    if (this.lanScanInflight) return this.lanScanInflight

    this.lanScanInflight = new Promise<GoveeDevice[]>((resolve) => {
      const interfaces = getLanIPv4Interfaces()
      const found = new Map<string, GoveeDevice>()
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
      const scanPayload = Buffer.from(
        JSON.stringify({ msg: { cmd: 'scan', data: { account_topic: 'reserve' } } })
      )
      let settled = false

      const finish = () => {
        if (settled) return
        settled = true
        try {
          socket.close()
        } catch {}
        const devices = Array.from(found.values())
        log.info(`[Govee] LAN scan complete. Found ${devices.length} devices.`)
        resolve(devices)
      }

      socket.on('message', (message, rinfo) => {
        const device = parseGoveeLanScanResponse(message, rinfo.address)
        if (!device) return
        found.set(normalizeGoveeDeviceId(device.device), device)
        log.info(`[Govee] LAN discovered ${device.model} at ${device.ip || rinfo.address}`)
      })

      socket.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          log.warn('[Govee] LAN discovery could not bind UDP 4002. Another app may already be using the Govee LAN listener port.')
        } else {
          log.warn('[Govee] LAN discovery socket error:', error.message)
        }
        finish()
      })

      socket.bind(GOVEE_LISTEN_PORT, '0.0.0.0', () => {
        try {
          socket.setMulticastTTL(2)
          socket.setBroadcast(true)
        } catch {}

        for (const iface of interfaces) {
          try {
            socket.addMembership(GOVEE_MULTICAST_ADDRESS, iface.address)
          } catch (error) {
            log.debug(`[Govee] Could not join multicast on ${iface.address}:`, error)
          }
        }

        const sendScan = (iface?: os.NetworkInterfaceInfo) => {
          try {
            if (iface) socket.setMulticastInterface(iface.address)
            socket.send(scanPayload, GOVEE_SCAN_PORT, GOVEE_MULTICAST_ADDRESS)
          } catch (error) {
            log.debug(`[Govee] LAN scan send failed${iface ? ` on ${iface.address}` : ''}:`, error)
          }
        }

        for (let round = 0; round < GOVEE_LAN_SCAN_ROUNDS; round++) {
          setTimeout(() => {
            if (interfaces.length === 0) {
              sendScan()
              return
            }
            for (const iface of interfaces) sendScan(iface)
          }, round * 350)
        }
      })

      setTimeout(finish, GOVEE_LAN_SCAN_TIMEOUT_MS)
    }).finally(() => {
      this.lanScanInflight = null
    })

    return this.lanScanInflight
  }

  private async controlLanDevice(
    device: GoveeDevice,
    color: { r: number; g: number; b: number }
  ): Promise<void> {
    if (!device.ip) throw new Error('LAN device is missing an IP address')
    await this.prepareLanDeviceForEffect(device, color)
  }

  private async prepareLanDeviceForEffect(
    device: GoveeDevice,
    color: { r: number; g: number; b: number },
    brightness = 100
  ): Promise<void> {
    await this.setLanTurn(device, true)
    await this.setLanBrightness(device, brightness)
    await this.setLanColor(device, color)
  }

  private async setLanTurn(device: GoveeDevice, on: boolean): Promise<void> {
    if (!device.ip) throw new Error('LAN device is missing an IP address')
    await this.sendLanCommand(device.ip, { msg: { cmd: 'turn', data: { value: on ? 1 : 0 } } })
  }

  private async setLanBrightness(device: GoveeDevice, brightness: number): Promise<void> {
    if (!device.ip) throw new Error('LAN device is missing an IP address')
    await this.sendLanCommand(device.ip, {
      msg: { cmd: 'brightness', data: { value: clampGoveeBrightness(brightness) } }
    })
  }

  private async setLanColor(
    device: GoveeDevice,
    color: { r: number; g: number; b: number }
  ): Promise<void> {
    if (!device.ip) throw new Error('LAN device is missing an IP address')
    await this.sendLanCommand(device.ip, {
      msg: {
        cmd: 'colorwc',
        data: {
          color: sanitizeGoveeColor(color),
          colorTemInKelvin: 0
        }
      }
    })
  }

  private async sendLanCommand(ip: string, payload: unknown): Promise<void> {
    const message = Buffer.from(JSON.stringify(payload))
    await new Promise<void>((resolve, reject) => {
      const socket = dgram.createSocket('udp4')
      const timeout = setTimeout(() => {
        try {
          socket.close()
        } catch {}
        reject(new Error(`Timed out sending Govee LAN command to ${ip}`))
      }, 1200)

      socket.once('error', (error) => {
        clearTimeout(timeout)
        try {
          socket.close()
        } catch {}
        reject(error)
      })

      socket.send(message, GOVEE_CONTROL_PORT, ip, (error) => {
        clearTimeout(timeout)
        try {
          socket.close()
        } catch {}
        if (error) reject(error)
        else resolve()
      })
    })
  }

  private async controlCloudDevice(device: GoveeDevice, name: string, value: unknown): Promise<void> {
    if (!this.apiKey) throw new Error('Govee API key is not connected')
    await fetch('https://developer-api.govee.com/v1/devices/control', {
      method: 'PUT',
      headers: {
        'Govee-API-Key': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        device: device.device,
        model: device.model,
        cmd: { name, value }
      })
    })
  }
}

export function parseGoveeLanScanResponse(
  message: Buffer | string,
  remoteAddress?: string
): GoveeDevice | null {
  let parsed: any
  try {
    parsed = JSON.parse(Buffer.isBuffer(message) ? message.toString('utf8') : message)
  } catch {
    return null
  }

  if (parsed?.msg?.cmd !== 'scan') return null
  const data = parsed.msg.data
  if (!data?.device) return null

  const ip = typeof data.ip === 'string' && data.ip.trim() ? data.ip.trim() : remoteAddress
  const model = typeof data.sku === 'string' && data.sku.trim() ? data.sku.trim() : 'LAN'
  const device = String(data.device)

  return {
    device,
    model,
    deviceName: `Govee ${model}`,
    controllable: Boolean(ip),
    retrievable: true,
    supportCmds: ['turn', 'brightness', 'colorwc', 'devStatus'],
    source: 'lan',
    ip,
    lanDiscoveredAt: Date.now(),
    properties: { lan: data }
  }
}

export function mergeGoveeDeviceLists(
  cloudDevices: GoveeDevice[],
  lanDevices: GoveeDevice[]
): GoveeDevice[] {
  const merged = new Map<string, GoveeDevice>()
  const order: string[] = []

  const put = (device: GoveeDevice) => {
    const key = normalizeGoveeDeviceId(device.device)
    if (!key) return
    if (!merged.has(key)) order.push(key)
    merged.set(key, device)
  }

  for (const device of cloudDevices) {
    put({ ...device, source: device.source || 'cloud' })
  }

  for (const lanDevice of lanDevices) {
    const key = normalizeGoveeDeviceId(lanDevice.device)
    const cloudDevice = merged.get(key)

    if (!cloudDevice) {
      put(lanDevice)
      continue
    }

    merged.set(key, {
      ...cloudDevice,
      ip: lanDevice.ip,
      lanDiscoveredAt: lanDevice.lanDiscoveredAt,
      source: 'cloud+lan',
      controllable: cloudDevice.controllable || lanDevice.controllable,
      retrievable: cloudDevice.retrievable || lanDevice.retrievable,
      supportCmds: Array.from(new Set([...cloudDevice.supportCmds, ...lanDevice.supportCmds])),
      properties: {
        ...(cloudDevice.properties || {}),
        ...(lanDevice.properties || {})
      }
    })
  }

  return order.map((key) => merged.get(key)).filter(Boolean) as GoveeDevice[]
}

function normalizeGoveeDeviceId(deviceId?: string): string {
  const trimmed = (deviceId || '').trim().toLowerCase()
  return trimmed.replace(/[^a-z0-9]/g, '') || trimmed
}

function normalizeGoveeDeviceIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const ids: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const normalized = normalizeGoveeDeviceId(item)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    ids.push(item)
  }
  return ids
}

function getLanIPv4Interfaces(): os.NetworkInterfaceInfo[] {
  return Object.values(os.networkInterfaces())
    .flatMap((interfaces) => interfaces || [])
    .filter((iface) => iface.family === 'IPv4' && !iface.internal)
}

function sanitizeGoveeColor(color: { r: number; g: number; b: number }): { r: number; g: number; b: number } {
  return {
    r: clampGoveeColorChannel(color.r),
    g: clampGoveeColorChannel(color.g),
    b: clampGoveeColorChannel(color.b)
  }
}

function clampGoveeColorChannel(value: number): number {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return 0
  return Math.min(Math.max(Math.round(numericValue), 0), 255)
}

function clampGoveeBrightness(value: number): number {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return 100
  return Math.min(Math.max(Math.round(numericValue), 1), 100)
}

function sanitizeGoveeDuration(value: number): number {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return 5000
  return Math.min(Math.max(Math.round(numericValue), 250), 30000)
}

function clampGoveeStrobeInterval(value: number): number {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return GOVEE_CYBER_STROBE_INTERVAL_MS
  return Math.min(Math.max(Math.round(numericValue), 50), 1000)
}
