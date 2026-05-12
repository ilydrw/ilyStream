import { EventEmitter } from 'events'
import log from 'electron-log'
import { Database } from '../db/database'

import { LightProvider } from '../services/lighting/lighting-manager'
import { LightingDevice, LightPlatform } from '../../shared/lighting'

export interface HueBridge {
  id: string
  internalipaddress: string
}

export interface HueLight {
  id: string
  name: string
  on: boolean
  reachable: boolean
  color?: string
}

export interface HueGroup {
  id: string
  name: string
  lights: string[]
  type: string
  class?: string
}

type HueRgb = { r: number; g: number; b: number }

const CYBER_BLUE: HueRgb = { r: 25, g: 200, b: 255 }
const CYBER_PURPLE: HueRgb = { r: 208, g: 53, b: 241 }
const CYBER_STROBE_INTERVAL_MS = 350
const SUPERFAN_CYBER_STROBE_INTERVAL_MS = 90

export class HueService extends EventEmitter implements LightProvider {
  public platform: LightPlatform = 'hue'
  private bridgeIp: string | null = null
  private username: string | null = null
  private isConnected = false
  private isSafetyLocked = false
  private selectedLightIds: string[] = []
  private strobeInterval: NodeJS.Timeout | null = null
  private restoreTimeout: NodeJS.Timeout | null = null
  private cooldownTimeout: NodeJS.Timeout | null = null
  private isTriggerActive = false
  private db: Database

  private rgbToHex(r: number, g: number, b: number): string {
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    const toHex = (n: number) => clamp(n).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  private xyToRgb(x: number, y: number, bri: number): string {
    try {
      if (y === 0) y = 0.0001; 
      const z = 1.0 - x - y;
      const Y = bri / 255.0;
      const X = (Y / y) * x;
      const Z = (Y / y) * z;

      let r = X * 3.2406 - Y * 1.5372 - Z * 0.4986;
      let g = -X * 0.9689 + Y * 1.8758 + Z * 0.0415;
      let b = X * 0.0557 - Y * 0.2040 + Z * 1.0570;

      const max = Math.max(r, g, b);
      if (max > 1.0) {
        r /= max; g /= max; b /= max;
      }

      const gamma = (v: number) => {
        v = Math.max(0, Math.min(1, v));
        return v <= 0.0031308 ? 12.92 * v : (1.0 + 0.055) * Math.pow(v, (1.0 / 2.4)) - 0.055;
      };

      return this.rgbToHex(gamma(r) * 255, gamma(g) * 255, gamma(b) * 255);
    } catch (e) {
      return '#ffffff';
    }
  }

  private ctToRgb(mireds: number): string {
    const kelvin = 1000000 / mireds;
    let r, g, b;
    const temp = kelvin / 100;

    if (temp <= 66) {
      r = 255;
      g = 99.4708025861 * Math.log(temp) - 161.1195681661;
      b = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
    } else {
      r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
      g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
      b = 255;
    }

    return this.rgbToHex(r, g, b);
  }

  private rgbToXy({ r, g, b }: HueRgb): [number, number] {
    const normalize = (value: number) => {
      const channel = Math.max(0, Math.min(255, value)) / 255
      return channel > 0.04045
        ? Math.pow((channel + 0.055) / 1.055, 2.4)
        : channel / 12.92
    }

    const red = normalize(r)
    const green = normalize(g)
    const blue = normalize(b)
    const x = red * 0.664511 + green * 0.154324 + blue * 0.162028
    const y = red * 0.283881 + green * 0.668433 + blue * 0.047685
    const z = red * 0.000088 + green * 0.07231 + blue * 0.986039
    const total = x + y + z

    if (total === 0) return [0.3227, 0.329]
    return [Number((x / total).toFixed(4)), Number((y / total).toFixed(4))]
  }

  private async captureSelectedLightStates(): Promise<Record<string, any>> {
    const statesToRestore: Record<string, any> = {}

    for (const id of this.selectedLightIds) {
      try {
        const response = await fetch(`http://${this.bridgeIp}/api/${this.username}/lights/${id}`)
        const data = await response.json()
        if (data && data.state) {
          const { on, bri, hue, sat, xy, ct, colormode } = data.state
          statesToRestore[id] = { on, bri, hue, sat, xy, ct, colormode, alert: 'none' }
        }
      } catch (err) {
        log.error(`[Hue] Failed to capture state for light ${id}:`, err)
      }
    }

    return statesToRestore
  }

  private setLightState(id: string, state: Record<string, any>): void {
    fetch(`http://${this.bridgeIp}/api/${this.username}/lights/${id}/state`, {
      method: 'PUT',
      body: JSON.stringify(state)
    }).catch(() => {})
  }

  private restoreSelectedLightStates(statesToRestore: Record<string, any>): void {
    for (const id of this.selectedLightIds) {
      this.setLightState(id, statesToRestore[id] || { alert: 'none' })
    }
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

  dispose(): void {
    this.clearActiveEffect()
    this.removeAllListeners()
  }

  private canTriggerEffect(): boolean {
    if (!this.isConnected || !this.bridgeIp || !this.username) return false
    if (this.isSafetyLocked || this.selectedLightIds.length === 0) return false
    if (this.isTriggerActive) {
      log.info('[Hue] Trigger skipped: already active or in cooldown.')
      return false
    }
    return true
  }

  constructor(db: Database) {
    super()
    this.db = db
    this.bridgeIp = this.db.getSetting('hueBridgeIp') as string || null
    this.username = this.db.getSetting('hueUsername') as string || null
    this.selectedLightIds = this.db.getSetting('hueSelectedLightIds') as string[] || []
  }

  async initialize(): Promise<void> {
    if (this.bridgeIp && this.username) {
      log.info(`[Hue] Found persisted credentials for ${this.bridgeIp}. Attempting auto-connect...`)
      try {
        await this.connect(this.bridgeIp, this.username)
      } catch (err) {
        log.warn('[Hue] Auto-connect failed.')
      }
    }
  }

  setSafetyLock(locked: boolean) {
    this.isSafetyLocked = locked
    log.info(`[Hue] Safety lock set to: ${locked}`)
  }

  getSafetyLock() {
    return this.isSafetyLocked
  }

  async discoverBridges(): Promise<HueBridge[]> {
    log.info('[Hue] Starting bridge discovery via discovery.meethue.com...')
    try {
      const response = await fetch('https://discovery.meethue.com')
      if (!response.ok) {
        log.warn(`[Hue] Discovery service returned status: ${response.status}`)
        return []
      }
      const bridges = await response.json()
      log.info(`[Hue] Discovery complete. Found ${bridges.length} bridges.`)
      return bridges
    } catch (error) {
      log.error('[Hue] Discovery error:', error)
      return []
    }
  }

  async connect(ip: string, username: string): Promise<boolean> {
    const url = `http://${ip}/api/${username}/lights`
    log.info(`[Hue] Attempting to connect to: ${url}`)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    try {
      const response = await fetch(url, { signal: controller.signal })
      clearTimeout(timeout)
      if (response.ok) {
        this.bridgeIp = ip
        this.username = username
        this.isConnected = true
        
        // Persist settings
        this.db.setSetting('hueBridgeIp', ip)
        this.db.setSetting('hueUsername', username)
        
        log.info(`[Hue] Successfully connected to bridge at ${ip}`)
        return true
      }
      log.warn(`[Hue] Bridge returned status: ${response.status}`)
      return false
    } catch (error: any) {
      log.error(`[Hue] Connection failed to ${url}:`, error.message || error)
      return false
    }
  }

  saveUsername(username: string) {
    this.username = username
    this.db.setSetting('hueUsername', username)
    log.info('[Hue] Username saved manually')
  }

  private hslToRgb(h: number, s: number, bri: number): string {
    // Convert Hue (0-65535) to degrees (0-360)
    const hue = Math.round((h / 65535) * 360);
    // Convert Saturation (0-254) to percentage (0-100)
    const sat = Math.round((s / 254) * 100);
    // For the UI icon, we want the color to be vibrant.
    // In HSL, 50% lightness is the pure color. 100% is white.
    // We'll scale brightness (0-254) to a range of 30-70% lightness for the UI.
    const lightness = Math.round(30 + (bri / 254) * 40);
    
    return `hsl(${hue}, ${sat}%, ${lightness}%)`;
  }

  async getLights(): Promise<HueLight[]> {
    if (!this.isConnected || !this.bridgeIp || !this.username) return []
    try {
      const response = await fetch(`http://${this.bridgeIp}/api/${this.username}/lights`)
      if (!response.ok) return []
      const data = await response.json()
      
      return Object.entries(data).map(([id, light]: [string, any]) => {
        let color: string | undefined;
        const state = light.state;

        if (state.on) {
          if (state.xy && Array.isArray(state.xy) && state.xy.length === 2) {
            color = this.xyToRgb(state.xy[0], state.xy[1], state.bri || 254);
          } else if (state.hue !== undefined && state.sat !== undefined) {
            color = this.hslToRgb(state.hue, state.sat, state.bri || 254);
          } else if (state.ct) {
            color = this.ctToRgb(state.ct);
          } else {
            color = 'rgb(255, 255, 255)'; // Default white
          }
        }

        return {
          id,
          name: light.name,
          on: state.on,
          reachable: state.reachable,
          color
        };
      })
    } catch (error) {
      log.error('[Hue] Get lights error:', error)
      return []
    }
  }

  async getGroups(): Promise<HueGroup[]> {
    if (!this.isConnected || !this.bridgeIp || !this.username) return []
    try {
      const response = await fetch(`http://${this.bridgeIp}/api/${this.username}/groups`)
      if (!response.ok) return []
      const data = await response.json()
      
      return Object.entries(data).map(([id, group]: [string, any]) => ({
        id,
        name: group.name,
        lights: group.lights || [],
        type: group.type,
        class: group.class
      }))
    } catch (error) {
      log.error('[Hue] Get groups error:', error)
      return []
    }
  }

  async triggerStrobe(durationMs: number): Promise<void> {
    if (!this.canTriggerEffect()) return
    this.isTriggerActive = true
    this.clearActiveEffect()
    
    try {
      const statesToRestore = await this.captureSelectedLightStates()

      // High-intensity strobe loop
      let isHigh = true
      this.strobeInterval = setInterval(() => {
        for (const id of this.selectedLightIds) {
          this.setLightState(id, {
            on: true,
            bri: isHigh ? 254 : 1,
            ct: 153, // Cold white
            transitiontime: 0
          })
        }
        isHigh = !isHigh
      }, 200) // 200ms for a fast strobe effect

      // End strobe and restore states after duration
      this.restoreTimeout = setTimeout(() => {
        this.clearActiveEffect()
        this.restoreSelectedLightStates(statesToRestore)
        log.info(`[Hue] Strobe finished, states restored for ${this.selectedLightIds.length} lights.`)
        
        // Cooldown period after restore to prevent rapid re-triggering
        this.cooldownTimeout = setTimeout(() => {
          this.isTriggerActive = false
          this.cooldownTimeout = null
        }, 5000)
      }, durationMs)

    } catch (error: any) {
      log.error('[Hue] Strobe trigger failed:', error)
      this.isTriggerActive = false
    }
  }

  async triggerCyberGradientStrobe(
    durationMs: number,
    options: { frameIntervalMs?: number } = {}
  ): Promise<void> {
    if (!this.canTriggerEffect()) return
    this.isTriggerActive = true
    this.clearActiveEffect()
    const frameIntervalMs = clampStrobeInterval(
      options.frameIntervalMs ?? CYBER_STROBE_INTERVAL_MS
    )
    log.info(`[Hue] Triggering cyber gradient strobe at ${frameIntervalMs}ms...`)

    try {
      const statesToRestore = await this.captureSelectedLightStates()
      let swap = false

      const applyFrame = () => {
        this.selectedLightIds.forEach((id, index) => {
          const useBlue = this.selectedLightIds.length === 1
            ? !swap
            : (index % 2 === 0) !== swap
          const color = useBlue ? CYBER_BLUE : CYBER_PURPLE

          this.setLightState(id, {
            on: true,
            bri: 254,
            sat: 254,
            xy: this.rgbToXy(color),
            transitiontime: 0
          })
        })
        swap = !swap
      }

      applyFrame()
      this.strobeInterval = setInterval(applyFrame, frameIntervalMs)

      this.restoreTimeout = setTimeout(() => {
        this.clearActiveEffect()
        this.restoreSelectedLightStates(statesToRestore)
        log.info(`[Hue] Cyber gradient strobe finished, states restored for ${this.selectedLightIds.length} lights.`)

        this.cooldownTimeout = setTimeout(() => {
          this.isTriggerActive = false
          this.cooldownTimeout = null
        }, 5000)
      }, durationMs)
    } catch (error) {
      log.error('[Hue] Cyber gradient strobe failed:', error)
      this.isTriggerActive = false
    }
  }

  async triggerSuperfanCyberGradientStrobe(durationMs: number): Promise<void> {
    return this.triggerCyberGradientStrobe(durationMs, {
      frameIntervalMs: SUPERFAN_CYBER_STROBE_INTERVAL_MS
    })
  }

  async triggerFlash(color?: { r: number; g: number; b: number }): Promise<void> {
    if (!this.isConnected || !this.bridgeIp || !this.username) return
    if (this.isSafetyLocked || this.isTriggerActive || this.selectedLightIds.length === 0) return

    this.isTriggerActive = true
    log.info('[Hue] Triggering single flash...')

    try {
      for (const id of this.selectedLightIds) {
        const body: any = { alert: 'select' }
        if (color) {
          body.xy = this.rgbToXy(color)
          body.bri = 254
          body.sat = 254
        }
        
        fetch(`http://${this.bridgeIp}/api/${this.username}/lights/${id}/state`, {
          method: 'PUT',
          body: JSON.stringify(body)
        }).catch(() => {})
      }

      // Single flash 'select' lasts ~1 second. Reset busy state after a short cooldown.
      this.cooldownTimeout = setTimeout(() => {
        this.isTriggerActive = false
        this.cooldownTimeout = null
      }, 3000)

    } catch (error) {
      log.error('[Hue] Flash trigger failed:', error)
      this.isTriggerActive = false
    }
  }

  setSelectedLights(ids: string[]) {
    this.selectedLightIds = ids
    this.db.setSetting('hueSelectedLightIds', ids)
    log.info(`[Hue] Updated selected lights: ${ids.join(', ')}`)
  }

  /** Apply new settings from the database at runtime. */
  applySettings(settings: any): void {
    if (settings.hueBridgeIp && settings.hueBridgeIp !== this.bridgeIp) {
      log.info('[Hue] Bridge IP changed, reconnecting...')
      void this.connect(settings.hueBridgeIp, settings.hueUsername || this.username || '')
    }
    
    if (settings.hueSelectedLightIds) {
      this.selectedLightIds = settings.hueSelectedLightIds
      log.info(`[Hue] Runtime selected lights updated: ${this.selectedLightIds.length} lights`)
    }
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      bridgeIp: this.bridgeIp,
      username: this.username,
      isSafetyLocked: this.isSafetyLocked,
      selectedLightIds: this.selectedLightIds
    }
  }

  // --- LightProvider Implementation ---

  public getDevices(): LightingDevice[] {
    // This requires a cached list of lights with full state.
    // For now, we'll return a minimal list based on selectedLightIds
    // but in a full implementation, we'd cache the result of getLights().
    return this.selectedLightIds.map(id => ({
      id,
      name: `Hue Light ${id}`,
      platform: 'hue',
      online: this.isConnected,
      reachable: true,
      brightness: 100,
      on: true,
      lastSeen: Date.now()
    }))
  }

  public async scan(): Promise<void> {
    await this.getLights()
  }

  public async setPower(deviceId: string, on: boolean): Promise<void> {
    this.setLightState(deviceId, { on })
  }

  public async setBrightness(deviceId: string, brightness: number): Promise<void> {
    // Hue brightness is 0-254
    const hueBri = Math.round((brightness / 100) * 254)
    this.setLightState(deviceId, { bri: hueBri })
  }

  public async setColor(deviceId: string, color: string): Promise<void> {
    // Simplified: Parse hex color to XY
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    const xy = this.rgbToXy({ r, g, b })
    this.setLightState(deviceId, { xy, on: true })
  }

  public async applyEffect(deviceId: string, effect: 'flash' | 'pulse', color?: string, duration?: number): Promise<void> {
    if (effect === 'flash') {
      let rgbColor: HueRgb | undefined
      if (color) {
        rgbColor = {
          r: parseInt(color.slice(1, 3), 16),
          g: parseInt(color.slice(3, 5), 16),
          b: parseInt(color.slice(5, 7), 16)
        }
      }
      await this.triggerFlash(rgbColor)
    } else if (effect === 'pulse') {
      await this.triggerStrobe(duration || 5000)
    }
  }
}

function clampStrobeInterval(value: number): number {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return CYBER_STROBE_INTERVAL_MS
  return Math.min(Math.max(Math.round(numericValue), 50), 1000)
}
