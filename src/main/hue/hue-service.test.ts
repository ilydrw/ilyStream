import { afterEach, describe, expect, it, vi } from 'vitest'
import { HueService } from './hue-service'

type FakeLightState = {
  on: boolean
  bri: number
  hue: number
  sat: number
  xy: [number, number]
  ct: number
  colormode: 'hs' | 'xy' | 'ct'
}

type FakeBridge = ReturnType<typeof makeBridge>

/**
 * Stateful in-memory Hue bridge: GET /lights/<id> returns current state, PUT
 * /lights/<id>/state applies the body (like the real bridge, `alert` and
 * `transitiontime` are commands, not persisted state). `dropPut` lets a test
 * simulate the bridge losing a command — the exact failure mode that used to
 * leave lights stuck white/dim after a strobe.
 */
function makeBridge(initial: Record<string, FakeLightState>) {
  const lights = new Map<string, FakeLightState>(
    Object.entries(initial).map(([id, state]) => [id, { ...state }])
  )
  const puts: Array<{ id: string; body: Record<string, any> }> = []
  let dropPut: ((body: Record<string, any>) => boolean) | null = null

  const fetchMock = vi.fn(async (url: unknown, init?: { method?: string; body?: string }) => {
    const u = String(url)

    const putMatch = u.match(/\/lights\/([^/]+)\/state$/)
    if (putMatch && init?.method === 'PUT') {
      const id = putMatch[1]
      const body = JSON.parse(init.body || '{}')
      puts.push({ id, body })

      const state = lights.get(id)
      if (state && !(dropPut && dropPut(body))) {
        if (typeof body.on === 'boolean') state.on = body.on
        if (typeof body.bri === 'number') state.bri = body.bri
        if (Array.isArray(body.xy)) {
          state.xy = [body.xy[0], body.xy[1]]
          state.colormode = 'xy'
        } else if (typeof body.ct === 'number') {
          state.ct = body.ct
          state.colormode = 'ct'
        } else if (typeof body.hue === 'number') {
          state.hue = body.hue
          if (typeof body.sat === 'number') state.sat = body.sat
          state.colormode = 'hs'
        }
      }
      return { ok: true, json: async () => [] }
    }

    const getMatch = u.match(/\/lights\/([^/]+)$/)
    if (getMatch) {
      const state = lights.get(getMatch[1])
      if (!state) return { ok: false, json: async () => ({}) }
      return { ok: true, json: async () => ({ state: { ...state } }) }
    }

    return { ok: true, json: async () => ({}) }
  })

  return {
    lights,
    puts,
    fetchMock,
    setDropPut(fn: ((body: Record<string, any>) => boolean) | null) { dropPut = fn }
  }
}

function makeService(bridge: FakeBridge, selectedLightIds: string[]): HueService {
  vi.stubGlobal('fetch', bridge.fetchMock)
  const fakeDb = { getSetting: () => null, setSetting: vi.fn() }
  const service = new HueService(fakeDb as any)
  ;(service as any).bridgeIp = '192.168.0.50'
  ;(service as any).username = 'test-user'
  ;(service as any).isConnected = true
  ;(service as any).selectedLightIds = selectedLightIds
  return service
}

const LIGHT_ON_XY: FakeLightState = {
  on: true, bri: 120, hue: 5000, sat: 140, xy: [0.5, 0.41], ct: 300, colormode: 'xy'
}
const LIGHT_OFF_CT: FakeLightState = {
  on: false, bri: 200, hue: 0, sat: 0, xy: [0.4, 0.4], ct: 366, colormode: 'ct'
}

describe('HueService effect restore', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('restores the pre-strobe state and never touches lights it could not snapshot', async () => {
    vi.useFakeTimers()
    const bridge = makeBridge({ '1': LIGHT_ON_XY })
    // Light '2' is selected but the bridge can't report it (GET fails).
    const service = makeService(bridge, ['1', '2'])

    await service.triggerStrobe(1000)
    await vi.advanceTimersByTimeAsync(1000)

    // Strobe frames actually reached light 1 (cold white / dim alternation).
    const strobeFrames = bridge.puts.filter(p => p.id === '1' && p.body.ct === 153)
    expect(strobeFrames.length).toBeGreaterThan(0)

    // Let settle + restore + verification run.
    await vi.advanceTimersByTimeAsync(3000)

    const state = bridge.lights.get('1')!
    expect(state.on).toBe(true)
    expect(state.bri).toBe(120)
    expect(state.xy[0]).toBeCloseTo(0.5, 3)
    expect(state.xy[1]).toBeCloseTo(0.41, 3)

    // The uncapturable light was excluded from the effect entirely.
    expect(bridge.puts.some(p => p.id === '2')).toBe(false)
  })

  it('re-sends the restore when the bridge drops it', async () => {
    vi.useFakeTimers()
    const bridge = makeBridge({ '1': LIGHT_ON_XY })
    const service = makeService(bridge, ['1'])

    // Simulate the bridge losing the first restore command (restore PUTs carry
    // alert: 'none'; strobe frames don't).
    let restoreAttempts = 0
    bridge.setDropPut(body => body.alert === 'none' && ++restoreAttempts === 1)

    await service.triggerStrobe(600)
    await vi.advanceTimersByTimeAsync(600)
    await vi.advanceTimersByTimeAsync(5000)

    // First restore was dropped; verification must have re-sent at least once.
    expect(restoreAttempts).toBeGreaterThanOrEqual(2)
    const restorePuts = bridge.puts.filter(p => p.body.alert === 'none')
    expect(restorePuts.length).toBeGreaterThanOrEqual(2)

    const state = bridge.lights.get('1')!
    expect(state.on).toBe(true)
    expect(state.bri).toBe(120)
    expect(state.xy[0]).toBeCloseTo(0.5, 3)
  })

  it('re-teaches color memory before switching a previously-off light back off', async () => {
    vi.useFakeTimers()
    const bridge = makeBridge({ '3': LIGHT_OFF_CT })
    const service = makeService(bridge, ['3'])

    await service.triggerStrobe(600)
    await vi.advanceTimersByTimeAsync(600)
    await vi.advanceTimersByTimeAsync(3000)

    const state = bridge.lights.get('3')!
    // Back off, but with its pre-effect brightness/color in memory — not the
    // strobe's bri 1 / cold white — so a manual turn-on later looks right.
    expect(state.on).toBe(false)
    expect(state.bri).toBe(200)
    expect(state.ct).toBe(366)

    // The memory write must come while the light is on, then the off command.
    const restoreSequence = bridge.puts.filter(p =>
      p.id === '3' && (p.body.alert === 'none' || (p.body.bri === 200 && p.body.on === true))
    )
    expect(restoreSequence.length).toBeGreaterThanOrEqual(2)
    expect(restoreSequence[restoreSequence.length - 1].body.on).toBe(false)
  })
})
