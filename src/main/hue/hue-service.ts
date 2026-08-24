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
type HueLightSnapshot = {
  on?: boolean
  bri?: number
  hue?: number
  sat?: number
  xy?: [number, number]
  ct?: number
  colormode?: 'hs' | 'xy' | 'ct' | string
}

const CYBER_BLUE: HueRgb = { r: 25, g: 200, b: 255 }
const CYBER_PURPLE: HueRgb = { r: 208, g: 53, b: 241 }
const CYBER_STROBE_INTERVAL_MS = 350
const SUPERFAN_CYBER_STROBE_INTERVAL_MS = 90
// The bridge sustains roughly 10 light commands/sec. Pushing frames faster
// backs up its internal Zigbee queue, and those stale frames keep playing out
// AFTER our restore lands — which is how lights got stuck white/dim.
const MIN_FRAME_MS_PER_LIGHT = 100
const COMMAND_TIMEOUT_MS = 3000
const CAPTURE_TIMEOUT_MS = 2000
const CAPTURE_ATTEMPTS = 3
// Grace period between the last effect frame and the restore commands so the
// bridge's queue drains first.
const BRIDGE_SETTLE_MS = 250
const RESTORE_VERIFY_DELAY_MS = 600
const RESTORE_VERIFY_ATTEMPTS = 3
const EFFECT_COOLDOWN_MS = 5000

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
  private inFlightSends = new Set<Promise<unknown>>()
  private pendingRestore: { states: Record<string, HueLightSnapshot>; lightIds: string[] } | null = null
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

  private getSelectedLightIdsSnapshot(): string[] {
    return [...new Set(this.selectedLightIds)]
  }

  private async fetchLightSnapshot(id: string): Promise<HueLightSnapshot | null> {
    try {
      const response = await fetch(`http://${this.bridgeIp}/api/${this.username}/lights/${id}`, {
        signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS)
      })
      if (!response.ok) return null
      const data = await response.json() as any
      if (!data?.state) return null
      const { on, bri, hue, sat, xy, ct, colormode } = data.state
      return { on, bri, hue, sat, xy, ct, colormode }
    } catch {
      return null
    }
  }

  private async captureSelectedLightStates(lightIds = this.getSelectedLightIdsSnapshot()): Promise<Record<string, HueLightSnapshot>> {
    const statesToRestore: Record<string, HueLightSnapshot> = {}

    for (const id of lightIds) {
      let snapshot: HueLightSnapshot | null = null
      for (let attempt = 0; attempt < CAPTURE_ATTEMPTS && !snapshot; attempt++) {
        snapshot = await this.fetchLightSnapshot(id)
      }
      if (snapshot) {
        statesToRestore[id] = snapshot
      } else {
        // A light we can't snapshot is a light we can't put back afterwards —
        // leave it out of the effect entirely rather than corrupt it.
        log.warn(`[Hue] Could not capture state for light ${id}; excluding it from the effect.`)
      }
    }

    return statesToRestore
  }

  private buildRestoreState(snapshot?: HueLightSnapshot): Record<string, any> {
    if (!snapshot) return { alert: 'none' }

    const restoreState: Record<string, any> = { alert: 'none' }
    if (typeof snapshot.on === 'boolean') restoreState.on = snapshot.on
    if (typeof snapshot.bri === 'number') restoreState.bri = snapshot.bri

    if (snapshot.colormode === 'xy' && isHueXy(snapshot.xy)) {
      restoreState.xy = snapshot.xy
    } else if (snapshot.colormode === 'hs' && typeof snapshot.hue === 'number' && typeof snapshot.sat === 'number') {
      restoreState.hue = snapshot.hue
      restoreState.sat = snapshot.sat
    } else if (snapshot.colormode === 'ct' && typeof snapshot.ct === 'number') {
      restoreState.ct = snapshot.ct
    } else if (isHueXy(snapshot.xy)) {
      restoreState.xy = snapshot.xy
    } else if (typeof snapshot.hue === 'number' && typeof snapshot.sat === 'number') {
      restoreState.hue = snapshot.hue
      restoreState.sat = snapshot.sat
    } else if (typeof snapshot.ct === 'number') {
      restoreState.ct = snapshot.ct
    }

    return restoreState
  }

  private async setLightState(id: string, state: Record<string, any>): Promise<void> {
    try {
      await fetch(`http://${this.bridgeIp}/api/${this.username}/lights/${id}/state`, {
        method: 'PUT',
        body: JSON.stringify(state),
        signal: AbortSignal.timeout(COMMAND_TIMEOUT_MS)
      })
    } catch {
      // Best-effort hardware control. Callers keep the alert pipeline moving.
    }
  }

  /** Fire-and-forget effect send that finishEffect() can still await before restoring. */
  private sendEffectFrameCommand(id: string, state: Record<string, any>): Promise<void> {
    const send = this.setLightState(id, state)
    this.inFlightSends.add(send)
    void send.finally(() => this.inFlightSends.delete(send))
    return send
  }

  private async restoreSingleLight(id: string, snapshot: HueLightSnapshot | undefined): Promise<void> {
    const restoreState = this.buildRestoreState(snapshot)
    const memory = Object.fromEntries(
      Object.entries(restoreState).filter(([key]) => key !== 'on' && key !== 'alert')
    )

    if (snapshot?.on === false && Object.keys(memory).length > 0) {
      // The bridge rejects color/brightness commands while a light is off, so
      // re-teach the pre-effect values while it's still on (it is, mid-effect),
      // THEN switch it off. Otherwise the light keeps the last effect frame in
      // memory and comes back cold-white/dim when it's next turned on.
      await this.setLightState(id, { ...memory, on: true, transitiontime: 0 })
      await this.setLightState(id, { on: false, alert: 'none', transitiontime: 0 })
      return
    }

    // Restore immediately. Hue's default 400ms transition can otherwise leave
    // verification racing an in-progress color change.
    await this.setLightState(id, { ...restoreState, transitiontime: 0 })
  }

  /** True when the light's live state matches its pre-effect snapshot (within bridge rounding). */
  private snapshotRestored(expected: HueLightSnapshot, current: HueLightSnapshot): boolean {
    const expectedState = this.buildRestoreState(expected)

    if (typeof expectedState.on === 'boolean' && current.on !== expectedState.on) return false
    // An off light is fully restored once it's off — its color memory was
    // re-taught by restoreSingleLight and isn't reliably readable while off.
    if (expectedState.on === false) return true

    if (typeof expectedState.bri === 'number' &&
        (typeof current.bri !== 'number' || Math.abs(current.bri - expectedState.bri) > 3)) return false

    if (isHueXy(expectedState.xy)) {
      if (current.colormode !== 'xy' || !isHueXy(current.xy)) return false
      if (Math.abs(current.xy[0] - expectedState.xy[0]) > 0.02) return false
      if (Math.abs(current.xy[1] - expectedState.xy[1]) > 0.02) return false
    } else if (typeof expectedState.ct === 'number') {
      if (current.colormode !== 'ct' || typeof current.ct !== 'number') return false
      if (Math.abs(current.ct - expectedState.ct) > 5) return false
    } else if (typeof expectedState.hue === 'number' && typeof expectedState.sat === 'number') {
      if (current.colormode !== 'hs' || typeof current.hue !== 'number' || typeof current.sat !== 'number') return false
      const hueDifference = Math.abs(current.hue - expectedState.hue)
      if (Math.min(hueDifference, 65536 - hueDifference) > 600) return false
      if (Math.abs(current.sat - expectedState.sat) > 5) return false
    }

    return true
  }

  /**
   * Restores every light, then reads each one back and re-sends until the
   * bridge actually took the values. A single fire-and-forget restore PUT was
   * the old behavior, and any dropped/overwritten command left the light stuck
   * on its last effect frame.
   */
  private async restoreAndVerify(states: Record<string, HueLightSnapshot>, lightIds: string[]): Promise<void> {
    let remaining = lightIds.filter(id => states[id])

    for (let attempt = 1; attempt <= RESTORE_VERIFY_ATTEMPTS; attempt++) {
      await Promise.allSettled(remaining.map(id => this.restoreSingleLight(id, states[id])))
      await delay(RESTORE_VERIFY_DELAY_MS)
      if (!this.isConnected) return

      const stillWrong: string[] = []
      for (const id of remaining) {
        const current = await this.fetchLightSnapshot(id)
        if (!current || !this.snapshotRestored(states[id], current)) stillWrong.push(id)
      }

      if (stillWrong.length === 0) {
        log.info(`[Hue] Restore verified for ${lightIds.length} light(s).`)
        return
      }
      remaining = stillWrong
      log.warn(`[Hue] ${remaining.length} light(s) did not take the restore (attempt ${attempt}/${RESTORE_VERIFY_ATTEMPTS}); retrying...`)
    }

    log.error(`[Hue] Gave up restoring light(s) after ${RESTORE_VERIFY_ATTEMPTS} attempts: ${remaining.join(', ')}`)
  }

  /**
   * Shared end-of-effect path: stop the frame loop, wait for frames still on
   * the wire plus a settle window (so stale bridge-queued frames can't land
   * after the restore), then run the verified restore and start the cooldown.
   */
  private async finishEffect(label: string): Promise<void> {
    const pending = this.pendingRestore
    this.pendingRestore = null
    this.clearActiveEffect()

    try {
      if (pending) {
        await Promise.allSettled([...this.inFlightSends])
        await delay(BRIDGE_SETTLE_MS)
        await this.restoreAndVerify(pending.states, pending.lightIds)
        log.info(`[Hue] ${label} finished; restore pass complete for ${pending.lightIds.length} light(s).`)
      }
    } catch (error) {
      log.error(`[Hue] ${label} restore failed:`, error)
    } finally {
      this.startCooldown()
    }
  }

  private startCooldown(): void {
    this.cooldownTimeout = setTimeout(() => {
      this.isTriggerActive = false
      this.cooldownTimeout = null
    }, EFFECT_COOLDOWN_MS)
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

  async dispose(): Promise<void> {
    this.clearActiveEffect()
    const pending = this.pendingRestore
    this.pendingRestore = null

    if (pending) {
      // Shutting down mid-effect — put the lights back before we go. Best
      // effort, no verification loop: the app is closing.
      await Promise.allSettled([...this.inFlightSends])
      await Promise.allSettled(
        pending.lightIds.map(id => this.restoreSingleLight(id, pending.states[id]))
      )
    }

    this.isConnected = false
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
      const bridges = await response.json() as HueBridge[]
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
      const data = (await response.json()) as Record<string, any>
      
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
      const data = (await response.json()) as Record<string, any>
      
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
      const lightIds = Object.keys(statesToRestore)
      if (lightIds.length === 0) {
        log.warn('[Hue] Strobe aborted: could not capture any light states.')
        this.isTriggerActive = false
        return
      }
      this.pendingRestore = { states: statesToRestore, lightIds }

      // High-intensity strobe loop, paced to the bridge's command budget.
      const frameIntervalMs = Math.max(200, lightIds.length * MIN_FRAME_MS_PER_LIGHT)
      let isHigh = true
      let frameInFlight = false
      this.strobeInterval = setInterval(() => {
        if (frameInFlight) return // never stack frames the bridge hasn't accepted yet
        frameInFlight = true
        const sends = lightIds.map(id => this.sendEffectFrameCommand(id, {
          on: true,
          bri: isHigh ? 254 : 1,
          ct: 153, // Cold white
          transitiontime: 0
        }))
        void Promise.allSettled(sends).then(() => { frameInFlight = false })
        isHigh = !isHigh
      }, frameIntervalMs)

      this.restoreTimeout = setTimeout(() => {
        this.restoreTimeout = null
        void this.finishEffect('Strobe')
      }, durationMs)

    } catch (error: any) {
      log.error('[Hue] Strobe trigger failed:', error)
      this.pendingRestore = null
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

    try {
      const statesToRestore = await this.captureSelectedLightStates()
      const lightIds = Object.keys(statesToRestore)
      if (lightIds.length === 0) {
        log.warn('[Hue] Cyber gradient strobe aborted: could not capture any light states.')
        this.isTriggerActive = false
        return
      }
      this.pendingRestore = { states: statesToRestore, lightIds }

      const frameIntervalMs = Math.max(
        clampStrobeInterval(options.frameIntervalMs ?? CYBER_STROBE_INTERVAL_MS),
        lightIds.length * MIN_FRAME_MS_PER_LIGHT
      )
      log.info(`[Hue] Triggering cyber gradient strobe at ${frameIntervalMs}ms...`)
      let swap = false
      let frameInFlight = false

      const applyFrame = () => {
        if (frameInFlight) return
        frameInFlight = true
        const sends = lightIds.map((id, index) => {
          const useBlue = lightIds.length === 1
            ? !swap
            : (index % 2 === 0) !== swap
          const color = useBlue ? CYBER_BLUE : CYBER_PURPLE

          return this.sendEffectFrameCommand(id, {
            on: true,
            bri: 254,
            xy: this.rgbToXy(color),
            transitiontime: 0
          })
        })
        void Promise.allSettled(sends).then(() => { frameInFlight = false })
        swap = !swap
      }

      applyFrame()
      this.strobeInterval = setInterval(applyFrame, frameIntervalMs)

      this.restoreTimeout = setTimeout(() => {
        this.restoreTimeout = null
        void this.finishEffect('Cyber gradient strobe')
      }, durationMs)
    } catch (error) {
      log.error('[Hue] Cyber gradient strobe failed:', error)
      this.pendingRestore = null
      this.isTriggerActive = false
    }
  }

  async triggerSuperfanCyberGradientStrobe(durationMs: number): Promise<void> {
    return this.triggerCyberGradientStrobe(durationMs, {
      frameIntervalMs: SUPERFAN_CYBER_STROBE_INTERVAL_MS
    })
  }

  async triggerFlash(color?: { r: number; g: number; b: number }, durationMs = 3000): Promise<void> {
    if (!this.canTriggerEffect()) return

    this.isTriggerActive = true
    this.clearActiveEffect()
    log.info('[Hue] Triggering single flash...')

    try {
      if (!color) {
        // 'select' is a bridge-native one-shot blink that reverts on its own —
        // no capture or restore needed.
        for (const id of this.getSelectedLightIdsSnapshot()) {
          void this.sendEffectFrameCommand(id, { alert: 'select' })
        }
        this.startCooldown()
        return
      }

      const statesToRestore = await this.captureSelectedLightStates()
      const lightIds = Object.keys(statesToRestore)
      if (lightIds.length === 0) {
        log.warn('[Hue] Flash aborted: could not capture any light states.')
        this.isTriggerActive = false
        return
      }
      this.pendingRestore = { states: statesToRestore, lightIds }

      for (const id of lightIds) {
        void this.sendEffectFrameCommand(id, {
          alert: 'select',
          xy: this.rgbToXy(color),
          bri: 254
        })
      }

      this.restoreTimeout = setTimeout(() => {
        this.restoreTimeout = null
        void this.finishEffect('Flash')
      }, Math.max(1000, durationMs))

    } catch (error) {
      log.error('[Hue] Flash trigger failed:', error)
      this.pendingRestore = null
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
    await this.setLightState(deviceId, { on })
  }

  public async setBrightness(deviceId: string, brightness: number): Promise<void> {
    // Hue brightness is 0-254
    const hueBri = Math.round((brightness / 100) * 254)
    await this.setLightState(deviceId, { bri: hueBri })
  }

  public async setColor(deviceId: string, color: string): Promise<void> {
    // Simplified: Parse hex color to XY
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    const xy = this.rgbToXy({ r, g, b })
    await this.setLightState(deviceId, { xy, on: true })
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
      await this.triggerFlash(rgbColor, duration)
    } else if (effect === 'pulse') {
      await this.triggerStrobe(duration || 5000)
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function clampStrobeInterval(value: number): number {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return CYBER_STROBE_INTERVAL_MS
  return Math.min(Math.max(Math.round(numericValue), 50), 1000)
}

function isHueXy(value: unknown): value is [number, number] {
  return Array.isArray(value) &&
    value.length === 2 &&
    value.every(channel => typeof channel === 'number' && Number.isFinite(channel))
}
