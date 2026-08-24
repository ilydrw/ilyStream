import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PARTICLES_CONFIG,
  type ParticlesWidgetConfig,
  type Widget
} from '../../../shared/widgets'
import { buildParticlesOverlayHtml } from './particles'

describe('buildParticlesOverlayHtml', () => {
  it('runs one finite burst for a Heart Me gift without reacting to ordinary likes', () => {
    const config = makeConfig()
    config.heartMe = { ...config.heartMe, enabled: true, count: 4, speed: 0 }
    const runtime = runWidget(makeWidget(config), ['hm-container'])

    runtime.emit({ type: 'like', platform: 'tiktok', likeCount: 25, totalLikes: 1000 })
    runtime.emit({ type: 'gift', platform: 'tiktok', giftId: '5655', giftName: 'Rose' })
    expect(runtime.containers['hm-container'].children).toHaveLength(0)

    runtime.emit({ type: 'gift', platform: 'tiktok', giftId: '7934', giftName: 'Heart Me' })
    expect(runtime.containers['hm-container'].children).toHaveLength(4)

    runtime.advanceTo(15_000)
    expect(runtime.containers['hm-container'].children).toHaveLength(0)
  })

  it('routes the recommended TikTok gift families and scales bursts by value', () => {
    const config = makeConfig()
    config.fallingRoses = { ...config.fallingRoses, enabled: true, count: 2, speed: 0 }
    config.heartMe = { ...config.heartMe, enabled: true, count: 2, speed: 0 }
    config.confetti = { ...config.confetti, enabled: true, count: 2, speed: 0 }
    config.fireworks = { ...config.fireworks, enabled: true, count: 2, speed: 0 }
    config.lightning = { ...config.lightning, enabled: true, count: 2, speed: 0 }
    config.moneyRain = { ...config.moneyRain, enabled: true, count: 2, speed: 0 }

    const runtime = runWidget(makeWidget(config), [
      'rose-container',
      'hm-container',
      'confetti-container',
      'fireworks-container',
      'lightning-container',
      'money-container'
    ])

    runtime.emit({ type: 'gift', platform: 'twitch', giftId: '5585', giftName: 'Confetti', monetaryValue: 5000 })
    expect(runtime.containers['confetti-container'].children).toHaveLength(0)

    runtime.emit({ type: 'gift', platform: 'tiktok', giftId: '8913', giftName: 'Rosa', monetaryValue: 0 })
    runtime.emit({ type: 'gift', platform: 'tiktok', giftId: '5585', giftName: 'Confetti', monetaryValue: 50 })
    runtime.emit({ type: 'gift', platform: 'tiktok', giftId: '7529', giftName: 'Mystery Firework', monetaryValue: 500 })
    runtime.emit({ type: 'gift', platform: 'tiktok', giftId: '59313', giftName: 'Red Lightning', monetaryValue: 5000 })
    runtime.emit({ type: 'gift', platform: 'tiktok', giftId: '16344', giftName: 'Diamond', monetaryValue: 0 })
    runtime.emit({ type: 'gift', platform: 'tiktok', giftId: '14661', giftName: 'Infinite Heart', monetaryValue: 5000 })

    expect(runtime.containers['rose-container'].children).toHaveLength(2)
    expect(runtime.containers['confetti-container'].children).toHaveLength(3)
    expect(runtime.containers['fireworks-container'].children).toHaveLength(2)
    expect(runtime.containers['lightning-container'].children).toHaveLength(6)
    expect(runtime.containers['money-container'].children).toHaveLength(2)
    expect(runtime.containers['hm-container'].children).toHaveLength(6)

    runtime.advanceTo(15_000)
    for (const container of Object.values(runtime.containers)) {
      expect(container.children).toHaveLength(0)
    }
  })

  it('honors a saved custom gift selection instead of fixed effect names', () => {
    const config = makeConfig()
    config.confetti = {
      ...config.confetti,
      enabled: true,
      count: 2,
      speed: 0,
      giftIds: ['5879'],
      giftNames: ['Doughnut']
    }
    const runtime = runWidget(makeWidget(config), ['confetti-container'])

    runtime.emit({ type: 'gift', platform: 'tiktok', giftId: '5585', giftName: 'Confetti' })
    expect(runtime.containers['confetti-container'].children).toHaveLength(0)

    runtime.emit({ type: 'gift', platform: 'tiktok', giftId: '5879', giftName: 'Doughnut' })
    expect(runtime.containers['confetti-container'].children).toHaveLength(2)
  })

  it('maps Blow Bubbles to bubbles and Heart Puff to hearts', () => {
    const config = makeConfig()
    config.bubbles = { ...config.bubbles, enabled: true, count: 3, speed: 0 }
    config.heartMe = { ...config.heartMe, enabled: true, count: 3, speed: 0 }
    const runtime = runWidget(makeWidget(config), ['bubbles-container', 'hm-container'])

    runtime.emit({ type: 'gift', platform: 'tiktok', giftId: '14084', giftName: 'Blow Bubbles' })
    expect(runtime.containers['bubbles-container'].children).toHaveLength(3)
    expect(runtime.containers['hm-container'].children).toHaveLength(0)

    runtime.emit({ type: 'gift', platform: 'tiktok', giftId: '9967', giftName: 'Heart Puff' })
    expect(runtime.containers['hm-container'].children).toHaveLength(3)
  })

  it('launches a firework before expanding it into a radial spark burst', () => {
    const config = makeConfig()
    config.fireworks = { ...config.fireworks, enabled: true, count: 18, speed: 1.4 }
    const runtime = runWidget(makeWidget(config), ['fireworks-container'])

    runtime.emit({ type: 'gift', platform: 'tiktok', giftId: '6090', giftName: 'Fireworks' })
    expect(runtime.containers['fireworks-container'].children).toHaveLength(1)

    runtime.advanceFrames(125)
    expect(runtime.containers['fireworks-container'].children.length).toBeGreaterThanOrEqual(12)

    runtime.advanceTo(15_000)
    expect(runtime.containers['fireworks-container'].children).toHaveLength(0)
  })
})

function makeConfig(): ParticlesWidgetConfig {
  return {
    ...DEFAULT_PARTICLES_CONFIG,
    followerHearts: { ...DEFAULT_PARTICLES_CONFIG.followerHearts, enabled: false },
    fallingRoses: { ...DEFAULT_PARTICLES_CONFIG.fallingRoses, enabled: false },
    galaxy: { ...DEFAULT_PARTICLES_CONFIG.galaxy, enabled: false },
    ggs: { ...DEFAULT_PARTICLES_CONFIG.ggs, enabled: false },
    heartMe: { ...DEFAULT_PARTICLES_CONFIG.heartMe, enabled: false },
    bubbles: { ...DEFAULT_PARTICLES_CONFIG.bubbles, enabled: false },
    confetti: { ...DEFAULT_PARTICLES_CONFIG.confetti, enabled: false },
    fireworks: { ...DEFAULT_PARTICLES_CONFIG.fireworks, enabled: false },
    lightning: { ...DEFAULT_PARTICLES_CONFIG.lightning, enabled: false },
    moneyRain: { ...DEFAULT_PARTICLES_CONFIG.moneyRain, enabled: false }
  }
}

function makeWidget(config: ParticlesWidgetConfig): Widget {
  return {
    id: 'gift-particles-test',
    name: 'Gift particles',
    type: 'particles',
    config: config as unknown as Record<string, unknown>
  }
}

interface RuntimeElement {
  children: RuntimeElement[]
  style: Record<string, string | number>
  textContent: string
  appendChild: (child: RuntimeElement) => void
  removeChild: (child: RuntimeElement) => void
  setAttribute: (name: string, value: string | number) => void
  setAttributeNS: (namespace: string, name: string, value: string | number) => void
}

interface RuntimeHarness {
  containers: Record<string, RuntimeElement>
  emit: (payload: Record<string, unknown>) => void
  advanceTo: (timestamp: number) => void
  advanceFrames: (count: number) => void
}

function runWidget(widget: Widget, containerIds: string[]): RuntimeHarness {
  const html = buildParticlesOverlayHtml(widget, false)
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>\s*<\/body>/)?.[1]
  expect(script).toBeTruthy()

  const containers = Object.fromEntries(
    containerIds.map((id) => [id, makeElement()])
  ) as Record<string, RuntimeElement>
  const document = {
    readyState: 'complete',
    addEventListener: () => undefined,
    getElementById: (id: string) => containers[id] || null,
    createElementNS: () => makeElement()
  }
  const window = { parent: null as null }
  let nextFrame: (() => void) | undefined
  let eventSource: RuntimeEventSource | undefined
  let now = 0

  class RuntimeEventSource {
    onmessage?: (event: { data: string }) => void
    onerror?: () => void

    constructor(_url: string) {
      eventSource = this
    }

    close(): void {}
  }

  const execute = new Function(
    'window',
    'document',
    'EventSource',
    'requestAnimationFrame',
    'setTimeout',
    'Date',
    script || ''
  )

  execute(
    window,
    document,
    RuntimeEventSource,
    (callback: () => void) => { nextFrame = callback; return 1 },
    (callback: () => void) => { callback(); return 1 },
    { now: () => now }
  )

  return {
    containers,
    emit(payload) {
      eventSource?.onmessage?.({ data: JSON.stringify({ type: 'event', payload }) })
    },
    advanceTo(timestamp) {
      now = timestamp
      const callback = nextFrame
      nextFrame = undefined
      callback?.()
    },
    advanceFrames(count) {
      for (let index = 0; index < count; index++) {
        now += 16
        const callback = nextFrame
        nextFrame = undefined
        callback?.()
      }
    }
  }
}

function makeElement(): RuntimeElement {
  const element: RuntimeElement = {
    children: [],
    style: {},
    textContent: '',
    appendChild(child: RuntimeElement) {
      this.children.push(child)
    },
    removeChild(child: RuntimeElement) {
      const index = this.children.indexOf(child)
      if (index >= 0) this.children.splice(index, 1)
    },
    setAttribute(_name: string, _value: string | number) {},
    setAttributeNS(_namespace: string, _name: string, _value: string | number) {}
  }
  return element
}
