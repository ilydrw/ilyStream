import { EventEmitter } from 'events'
import { execFile } from 'child_process'
import { promisify } from 'util'
import log from 'electron-log'
import type { LightProvider } from './lighting/lighting-manager'
import type { LightPlatform, LightingDevice } from '../../shared/lighting'
import type { Database } from '../db/database'
import {
  DEFAULT_RAZER_THEME,
  type RazerChromaTheme,
  type RazerDetectedDevice,
  type RazerDeviceKind,
  type RazerStatus,
  type RazerThemeSettings
} from '../../shared/razer'

const execFileAsync = promisify(execFile)

const CHROMA_BASE_URL = 'http://localhost:54235/razer/chromasdk'
const SUPPORTED_TARGETS: Array<Exclude<RazerDeviceKind, 'unknown'>> = [
  'keyboard',
  'mouse',
  'mousepad',
  'keypad',
  'headset',
  'chromalink'
]
const HEARTBEAT_INTERVAL_MS = 1000
const REQUEST_TIMEOUT_MS = 2500
const SESSION_READY_RETRY_DELAYS_MS = [0, 100, 250, 500, 1000]
const TEST_FLASH_COLOR = '#ffffff'
const THEME_FRAME_INTERVAL_MS = 120
const KEYBOARD_CUSTOM2_ROWS = 8
const KEYBOARD_CUSTOM2_COLS = 24
const KEYBOARD_KEY_ROWS = 6
const KEYBOARD_KEY_COLS = 22
const MOUSE_CUSTOM2_ROWS = 9
const MOUSE_CUSTOM2_COLS = 7

type ChromaSessionResponse = {
  sessionid?: number
  uri?: string
}

type RazerPnpDevice = {
  FriendlyName?: string
  Name?: string
  Class?: string
  Status?: string
  InstanceId?: string
}

type RazerEffectTarget = Exclude<RazerDeviceKind, 'unknown'>
type ChromaEffectPayload = {
  effect: string
  param?: Record<string, unknown> | number[][]
}
type RgbColor = {
  r: number
  g: number
  b: number
}

export class RazerChromaService extends EventEmitter implements LightProvider {
  public platform: LightPlatform = 'razer'

  private sessionUri: string | null = null
  private connecting = false
  private lastError: string | null = null
  private lastHeartbeatAt: number | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private devices: RazerDetectedDevice[] = []
  private themeTimer: ReturnType<typeof setInterval> | null = null
  private themeStartedAt = Date.now()
  private themeRenderInFlight = false
  private suspendedThemeTargets = new Set<RazerEffectTarget>()
  private effectRunIds = new Map<RazerEffectTarget, number>()
  private nextEffectRunId = 0
  private theme: RazerThemeSettings

  constructor(private db: Database) {
    super()
    this.theme = this.loadThemeSettings()
  }

  async initialize(): Promise<void> {
    await this.scan()
    await this.connect().catch((error) => {
      log.warn('[Razer] Chroma SDK auto-connect skipped:', error instanceof Error ? error.message : error)
    })
  }

  async dispose(): Promise<void> {
    this.stopHeartbeat()
    this.stopBaseTheme()
    this.cancelEffects()
    await this.closeSession()
    this.removeAllListeners()
  }

  getStatus(): RazerStatus {
    return {
      connected: Boolean(this.sessionUri),
      connecting: this.connecting,
      serviceUrl: CHROMA_BASE_URL,
      sessionUri: this.sessionUri,
      lastError: this.lastError,
      lastHeartbeatAt: this.lastHeartbeatAt,
      devices: this.getDetectedDevices(),
      lightingDevices: this.getDevices(),
      supportedTargets: SUPPORTED_TARGETS,
      theme: this.theme
    }
  }

  getDevices(): LightingDevice[] {
    return this.getDetectedDevices().map((device) => ({
      id: device.id,
      name: device.name,
      platform: 'razer',
      online: device.online,
      reachable: device.reachable,
      brightness: 100,
      color: '#19c8ff',
      on: true,
      lastSeen: device.lastSeen
    }))
  }

  async scan(): Promise<void> {
    const windowsDevices = await detectWindowsRazerDevices()
    this.devices = windowsDevices
    this.emitStatus()
  }

  async connect(): Promise<RazerStatus> {
    if (this.sessionUri) return this.getStatus()
    if (this.connecting) return this.getStatus()

    this.connecting = true
    this.lastError = null
    this.emitStatus()

    try {
      const session = await this.request<ChromaSessionResponse>(CHROMA_BASE_URL, {
        method: 'POST',
        body: JSON.stringify({
          title: 'ilyStream',
          description: 'Synchronizes Razer Chroma peripherals with livestream alerts and automation.',
          author: {
            name: 'ilyStream',
            contact: 'https://ilystream.local'
          },
          device_supported: SUPPORTED_TARGETS,
          category: 'application'
        })
      })

      if (!session.uri) {
        throw new Error('Chroma SDK did not return a session URI.')
      }

      this.sessionUri = session.uri.replace(/\/$/, '')
      await this.waitForSessionReady()
      this.startHeartbeat()
      await this.scan()
      await this.applyBaseTheme()
      log.info(`[Razer] Chroma session connected: ${this.sessionUri}`)
    } catch (error) {
      await this.closeSession()
      this.lastError = normalizeError(error)
      log.warn('[Razer] Chroma SDK connection failed:', this.lastError)
    } finally {
      this.connecting = false
      this.emitStatus()
    }

    return this.getStatus()
  }

  async disconnect(): Promise<RazerStatus> {
    this.stopHeartbeat()
    this.stopBaseTheme()
    this.cancelEffects()
    await this.closeSession()
    this.emitStatus()
    return this.getStatus()
  }

  async testEffect(): Promise<RazerStatus> {
    if (!this.sessionUri) await this.connect()
    if (!this.sessionUri) return this.getStatus()

    const targets = this.getEffectTargets()
    await Promise.allSettled(targets.map((target) => this.pulseTarget(target, TEST_FLASH_COLOR, 1400)))
    return this.getStatus()
  }

  async setTheme(nextTheme: Partial<RazerThemeSettings>): Promise<RazerStatus> {
    this.theme = normalizeThemeSettings({ ...this.theme, ...nextTheme })
    this.saveThemeSettings()
    this.cancelEffects()

    if (this.sessionUri) {
      await this.applyBaseTheme()
    }

    this.emitStatus()
    return this.getStatus()
  }

  async setPower(deviceId: string, on: boolean): Promise<void> {
    const target = this.resolveTarget(deviceId)
    await this.setTargetColor(target, on ? '#19c8ff' : '#000000')
  }

  async setBrightness(deviceId: string, brightness: number): Promise<void> {
    const level = Math.max(0, Math.min(100, brightness)) / 100
    const value = Math.round(255 * level)
    const hex = rgbToHex(value, value, value)
    await this.setTargetColor(this.resolveTarget(deviceId), hex)
  }

  async setColor(deviceId: string, color: string): Promise<void> {
    await this.setTargetColor(this.resolveTarget(deviceId), color)
  }

  async applyEffect(deviceId: string, effect: 'flash' | 'pulse', color = '#19c8ff', duration = 2000): Promise<void> {
    const target = this.resolveTarget(deviceId)
    if (effect === 'flash') {
      await this.flashTarget(target, color, duration)
      return
    }
    await this.pulseTarget(target, color, duration)
  }

  private getDetectedDevices(): RazerDetectedDevice[] {
    if (this.devices.length > 0) return this.devices
    if (!this.sessionUri) return []

    const now = Date.now()
    return [
      {
        id: 'razer:sdk:keyboard',
        name: 'Razer Keyboard',
        kind: 'keyboard',
        source: 'sdk-target',
        online: true,
        reachable: true,
        lastSeen: now
      },
      {
        id: 'razer:sdk:mouse',
        name: 'Razer Mouse',
        kind: 'mouse',
        source: 'sdk-target',
        online: true,
        reachable: true,
        lastSeen: now
      }
    ]
  }

  private getEffectTargets(): RazerEffectTarget[] {
    const detectedTargets = this.getDetectedDevices()
      .map((device) => device.kind)
      .filter((kind): kind is Exclude<RazerDeviceKind, 'unknown'> => kind !== 'unknown')
    const uniqueTargets = Array.from(new Set(detectedTargets))
    return uniqueTargets.length > 0 ? uniqueTargets : ['keyboard', 'mouse']
  }

  private resolveTarget(deviceId: string): RazerEffectTarget {
    const device = this.getDetectedDevices().find((item) => item.id === deviceId)
    if (device?.kind && device.kind !== 'unknown') return device.kind

    const id = deviceId.toLowerCase()
    if (id.includes('mouse')) return 'mouse'
    if (id.includes('keyboard')) return 'keyboard'
    if (id.includes('mousepad')) return 'mousepad'
    if (id.includes('keypad')) return 'keypad'
    if (id.includes('headset')) return 'headset'
    if (id.includes('chromalink')) return 'chromalink'
    return 'keyboard'
  }

  private async setTargetColor(target: RazerEffectTarget, color: string): Promise<void> {
    if (!this.sessionUri) await this.connect()
    if (!this.sessionUri) return

    await this.applyEffectPayload(target, {
      effect: 'CHROMA_STATIC',
      param: { color: hexToColorRef(color) }
    })
  }

  private async flashTarget(
    target: RazerEffectTarget,
    color: string,
    durationMs: number
  ): Promise<void> {
    const runId = this.beginEffect(target)

    try {
      await this.setTargetColor(target, color)
      await sleep(Math.max(250, durationMs))
    } finally {
      await this.endEffect(target, runId)
    }
  }

  private async pulseTarget(
    target: RazerEffectTarget,
    color: string,
    durationMs: number
  ): Promise<void> {
    const runId = this.beginEffect(target)
    const endsAt = Date.now() + Math.max(500, durationMs)
    let frameOn = true

    try {
      while (Date.now() < endsAt && this.isCurrentEffect(target, runId)) {
        await this.setTargetColor(target, frameOn ? color : '#000000')
        frameOn = !frameOn
        await sleep(160)
      }
    } finally {
      await this.endEffect(target, runId)
    }
  }

  private async applyBaseTheme(): Promise<void> {
    if (!this.sessionUri) return
    this.startBaseTheme()
    await this.renderBaseThemeFrame()
  }

  private async applyBaseThemeForTarget(target: RazerEffectTarget): Promise<void> {
    if (!this.sessionUri) return
    await this.applyEffectPayload(target, buildThemeEffect(target, this.theme, Date.now() - this.themeStartedAt)).catch((error) => {
      log.warn(`[Razer] Failed to restore ${target} theme:`, error instanceof Error ? error.message : error)
    })
  }

  private async applyEffectPayload(target: RazerEffectTarget, payload: ChromaEffectPayload): Promise<void> {
    if (!this.sessionUri) return
    await this.request(`${this.sessionUri}/${target}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    })
  }

  private async waitForSessionReady(): Promise<void> {
    let lastError: unknown = null

    for (const delayMs of SESSION_READY_RETRY_DELAYS_MS) {
      if (delayMs > 0) await sleep(delayMs)
      try {
        await this.sendHeartbeat()
        return
      } catch (error) {
        lastError = error
      }
    }

    throw lastError ?? new Error('Chroma SDK session did not become ready.')
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.sessionUri) return

    await this.request(`${this.sessionUri}/heartbeat`, { method: 'PUT' })
    this.lastHeartbeatAt = Date.now()
    this.lastError = null
    this.emitStatus()
  }

  private async heartbeat(): Promise<void> {
    if (!this.sessionUri) return

    try {
      await this.sendHeartbeat()
    } catch (error) {
      this.lastError = normalizeError(error)
      this.sessionUri = null
      this.stopHeartbeat()
      this.emitStatus()
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      void this.heartbeat()
    }, HEARTBEAT_INTERVAL_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private startBaseTheme(): void {
    this.stopBaseTheme()
    this.themeStartedAt = Date.now()

    if (!isAnimatedTheme(this.theme.theme)) return

    this.themeTimer = setInterval(() => {
      void this.renderBaseThemeFrame()
    }, THEME_FRAME_INTERVAL_MS)
  }

  private stopBaseTheme(): void {
    if (!this.themeTimer) return
    clearInterval(this.themeTimer)
    this.themeTimer = null
  }

  private async renderBaseThemeFrame(targets = this.getEffectTargets()): Promise<void> {
    if (!this.sessionUri || this.themeRenderInFlight) return
    const activeTargets = targets.filter((target) => !this.suspendedThemeTargets.has(target))
    if (activeTargets.length === 0) return

    this.themeRenderInFlight = true
    try {
      const elapsedMs = Date.now() - this.themeStartedAt
      await Promise.allSettled(activeTargets.map((target) =>
        this.applyEffectPayload(target, buildThemeEffect(target, this.theme, elapsedMs))
      ))
    } finally {
      this.themeRenderInFlight = false
    }
  }

  private beginEffect(target: RazerEffectTarget): number {
    this.cancelEffects(target)
    this.suspendedThemeTargets.add(target)
    const runId = ++this.nextEffectRunId
    this.effectRunIds.set(target, runId)
    return runId
  }

  private isCurrentEffect(target: RazerEffectTarget, runId: number): boolean {
    return this.effectRunIds.get(target) === runId
  }

  private async endEffect(target: RazerEffectTarget, runId: number): Promise<void> {
    if (!this.isCurrentEffect(target, runId)) return

    this.effectRunIds.delete(target)
    this.suspendedThemeTargets.delete(target)
    await this.applyBaseThemeForTarget(target)
  }

  private cancelEffects(target?: RazerEffectTarget): void {
    if (target) {
      this.effectRunIds.delete(target)
      this.suspendedThemeTargets.delete(target)
      return
    }

    this.effectRunIds.clear()
    this.suspendedThemeTargets.clear()
  }

  private loadThemeSettings(): RazerThemeSettings {
    return normalizeThemeSettings({
      theme: this.db.getSetting('razerChromaTheme'),
      primaryColor: this.db.getSetting('razerPrimaryColor'),
      secondaryColor: this.db.getSetting('razerSecondaryColor'),
      waveDirection: this.db.getSetting('razerWaveDirection'),
      reactiveDuration: this.db.getSetting('razerReactiveDuration')
    })
  }

  private saveThemeSettings(): void {
    this.db.setSetting('razerChromaTheme', this.theme.theme)
    this.db.setSetting('razerPrimaryColor', this.theme.primaryColor)
    this.db.setSetting('razerSecondaryColor', this.theme.secondaryColor)
    this.db.setSetting('razerWaveDirection', this.theme.waveDirection)
    this.db.setSetting('razerReactiveDuration', this.theme.reactiveDuration)
  }

  private async closeSession(): Promise<void> {
    const uri = this.sessionUri
    this.sessionUri = null
    this.lastHeartbeatAt = null
    if (!uri) return
    await this.request(uri, { method: 'DELETE' }).catch(() => {})
  }

  private async request<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init.headers || {})
        },
        signal: controller.signal
      })

      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(`Chroma SDK returned ${response.status}${body ? `: ${body}` : ''}`)
      }

      const text = await response.text()
      return (text ? JSON.parse(text) : {}) as T
    } finally {
      clearTimeout(timeout)
    }
  }

  private emitStatus(): void {
    this.emit('status-changed', this.getStatus())
  }
}

async function detectWindowsRazerDevices(): Promise<RazerDetectedDevice[]> {
  const command = [
    "$devices = Get-PnpDevice -PresentOnly | Where-Object {",
    "$_.FriendlyName -match 'Razer|BlackWidow|Basilisk' -or $_.InstanceId -match 'VID_1532'",
    '} | Select-Object FriendlyName,Name,Class,Status,InstanceId;',
    '$devices | ConvertTo-Json -Depth 3'
  ].join(' ')

  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { timeout: 4000, windowsHide: true }
    )
    const trimmed = stdout.trim()
    if (!trimmed) return []

    const parsed = JSON.parse(trimmed) as RazerPnpDevice | RazerPnpDevice[]
    const devices = Array.isArray(parsed) ? parsed : [parsed]
    const seen = new Set<string>()
    const now = Date.now()

    const normalizedDevices = devices
      .map((device) => normalizePnpDevice(device, now))
      .filter((device): device is RazerDetectedDevice => Boolean(device))

    const brandedDevices = normalizedDevices.filter((device) =>
      device.kind !== 'unknown' && /razer|blackwidow|basilisk/i.test(device.name)
    )
    const displayDevices = brandedDevices.length > 0
      ? brandedDevices
      : normalizedDevices.filter((device) => device.kind !== 'unknown')

    return displayDevices.filter((device) => {
        if (!device) return false
        const key = `${device.kind}:${device.name.toLowerCase()}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  } catch (error) {
    log.warn('[Razer] Windows hardware scan failed:', error instanceof Error ? error.message : error)
    return []
  }
}

function normalizePnpDevice(device: RazerPnpDevice, now: number): RazerDetectedDevice | null {
  const name = device.FriendlyName || device.Name
  if (!name) return null
  if (device.Class === 'SoftwareComponent' || /lwi wizard/i.test(name)) return null

  const kind = inferDeviceKind(`${name} ${device.Class || ''} ${device.InstanceId || ''}`)
  const idSafeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return {
    id: `razer:${kind}:${idSafeName || 'device'}`,
    name,
    kind,
    source: 'windows',
    online: device.Status ? device.Status.toLowerCase() === 'ok' : true,
    reachable: true,
    lastSeen: now
  }
}

function inferDeviceKind(value: string): RazerDeviceKind {
  const normalized = value.toLowerCase()
  if (normalized.includes('blackwidow') || normalized.includes('keyboard')) return 'keyboard'
  if (normalized.includes('basilisk') || normalized.includes('mouse')) return 'mouse'
  if (normalized.includes('mousepad') || normalized.includes('firefly')) return 'mousepad'
  if (normalized.includes('keypad') || normalized.includes('tartarus')) return 'keypad'
  if (normalized.includes('headset') || normalized.includes('kraken') || normalized.includes('barracuda')) return 'headset'
  if (normalized.includes('chromalink')) return 'chromalink'
  return 'unknown'
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError') return 'Timed out connecting to the Chroma SDK service.'
    if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
      return 'Chroma SDK refused the local session connection. Make sure Chroma Apps is enabled, then try Connect SDK again.'
    }
    return error.message
  }
  return String(error)
}

function buildThemeEffect(target: RazerEffectTarget, theme: RazerThemeSettings, elapsedMs: number): ChromaEffectPayload {
  switch (theme.theme) {
    case 'static':
      return {
        effect: 'CHROMA_STATIC',
        param: { color: hexToColorRef(theme.primaryColor) }
      }
    case 'spectrum':
      return buildCustomFrameEffect(target, (row, col, rows, cols) => {
        const hue = ((elapsedMs / 4200) + col / Math.max(1, cols) + row / Math.max(1, rows) * 0.16) % 1
        return hsvToColorRef(hue, 0.9, 1)
      })
    case 'breathing':
      return buildCustomFrameEffect(target, () => {
        const primary = hexToRgb(theme.primaryColor)
        const secondary = hexToRgb(theme.secondaryColor)
        const phase = (Math.sin(elapsedMs / 700) + 1) / 2
        const brightness = 0.18 + phase * 0.82
        return rgbToColorRef(scaleRgb(blendRgb(primary, secondary, phase), brightness))
      })
    case 'wave':
      return buildCustomFrameEffect(target, (row, col, rows, cols) => {
        const primary = hexToRgb(theme.primaryColor)
        const secondary = hexToRgb(theme.secondaryColor)
        const direction = theme.waveDirection === 2 ? -1 : 1
        const x = cols <= 1 ? 0 : col / (cols - 1)
        const y = rows <= 1 ? 0 : row / (rows - 1)
        const phase = (Math.sin(((x * direction) + y * 0.2 + elapsedMs / 1200) * Math.PI * 2) + 1) / 2
        return rgbToColorRef(blendRgb(primary, secondary, phase))
      })
    case 'reactive':
      return buildCustomFrameEffect(target, (row, col, rows, cols) => {
        const primary = hexToRgb(theme.primaryColor)
        const centerRow = (rows - 1) / 2
        const centerCol = (cols - 1) / 2
        const distance = Math.hypot(row - centerRow, col - centerCol)
        const ripple = (elapsedMs / 260) % Math.max(rows, cols)
        const glow = Math.max(0.18, 1 - Math.abs(distance - ripple) / 3)
        return rgbToColorRef(scaleRgb(primary, glow))
      })
    default:
      return {
        effect: 'CHROMA_STATIC',
        param: { color: hexToColorRef(theme.primaryColor) }
      }
  }
}

function buildCustomFrameEffect(
  target: RazerEffectTarget,
  colorAt: (row: number, col: number, rows: number, cols: number) => number
): ChromaEffectPayload {
  if (target === 'keyboard') {
    return {
      effect: 'CHROMA_CUSTOM2',
      param: {
        color: createColorGrid(KEYBOARD_CUSTOM2_ROWS, KEYBOARD_CUSTOM2_COLS, colorAt),
        key: createColorGrid(KEYBOARD_KEY_ROWS, KEYBOARD_KEY_COLS, () => 0)
      }
    }
  }

  if (target === 'mouse') {
    return {
      effect: 'CHROMA_CUSTOM2',
      param: createColorGrid(MOUSE_CUSTOM2_ROWS, MOUSE_CUSTOM2_COLS, colorAt)
    }
  }

  return {
    effect: 'CHROMA_STATIC',
    param: { color: colorAt(0, 0, 1, 1) }
  }
}

function createColorGrid(
  rows: number,
  cols: number,
  colorAt: (row: number, col: number, rows: number, cols: number) => number
): number[][] {
  return Array.from({ length: rows }, (_rowValue, row) =>
    Array.from({ length: cols }, (_colValue, col) => colorAt(row, col, rows, cols))
  )
}

function isAnimatedTheme(theme: RazerChromaTheme): boolean {
  return theme === 'spectrum' || theme === 'breathing' || theme === 'wave' || theme === 'reactive'
}

function normalizeThemeSettings(value: Partial<Record<keyof RazerThemeSettings, unknown>>): RazerThemeSettings {
  const theme = isRazerTheme(value.theme) ? value.theme : DEFAULT_RAZER_THEME.theme
  const primaryColor = normalizeHexColor(value.primaryColor, DEFAULT_RAZER_THEME.primaryColor)
  const secondaryColor = normalizeHexColor(value.secondaryColor, DEFAULT_RAZER_THEME.secondaryColor)
  const waveDirection = Number(value.waveDirection) === 2 ? 2 : 1
  const reactiveDurationValue = Number(value.reactiveDuration)
  const reactiveDuration =
    reactiveDurationValue === 2 || reactiveDurationValue === 3 || reactiveDurationValue === 4
      ? reactiveDurationValue
      : 1

  return {
    theme,
    primaryColor,
    secondaryColor,
    waveDirection,
    reactiveDuration
  }
}

function isRazerTheme(value: unknown): value is RazerChromaTheme {
  return value === 'spectrum' ||
    value === 'static' ||
    value === 'breathing' ||
    value === 'wave' ||
    value === 'reactive'
}

function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().toLowerCase()
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : fallback
}

function hexToRgb(hex: string): RgbColor {
  const normalized = normalizeHexColor(hex, DEFAULT_RAZER_THEME.primaryColor).replace('#', '')
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  }
}

function rgbToColorRef(color: RgbColor): number {
  const r = clampColorChannel(color.r)
  const g = clampColorChannel(color.g)
  const b = clampColorChannel(color.b)
  return r | (g << 8) | (b << 16)
}

function hsvToColorRef(h: number, s: number, v: number): number {
  const hue = ((h % 1) + 1) % 1
  const sector = Math.floor(hue * 6)
  const f = hue * 6 - sector
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  const index = sector % 6

  const [r, g, b] = index === 0
    ? [v, t, p]
    : index === 1
      ? [q, v, p]
      : index === 2
        ? [p, v, t]
        : index === 3
          ? [p, q, v]
          : index === 4
            ? [t, p, v]
            : [v, p, q]

  return rgbToColorRef({ r: r * 255, g: g * 255, b: b * 255 })
}

function blendRgb(start: RgbColor, end: RgbColor, amount: number): RgbColor {
  const t = Math.max(0, Math.min(1, amount))
  return {
    r: start.r + (end.r - start.r) * t,
    g: start.g + (end.g - start.g) * t,
    b: start.b + (end.b - start.b) * t
  }
}

function scaleRgb(color: RgbColor, amount: number): RgbColor {
  const t = Math.max(0, Math.min(1, amount))
  return {
    r: color.r * t,
    g: color.g * t,
    b: color.b * t
  }
}

function hexToColorRef(hex: string): number {
  return rgbToColorRef(hexToRgb(hex))
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (value: number) => clampColorChannel(value).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function clampColorChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
