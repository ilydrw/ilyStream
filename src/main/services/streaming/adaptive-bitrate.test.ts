import { describe, expect, it } from 'vitest'
import { AdaptiveBitrateController } from './adaptive-bitrate'

const OPTS = {
  minScale: 0.5,
  stepDown: 0.8,
  stepUp: 1.1,
  degradeTicks: 3,
  recoverTicks: 5,
  cooldownMs: 10_000
}

function sample(degraded: boolean, encoderId = 'horizontal', baseBitrateKbps = 6000) {
  return { encoderId, baseBitrateKbps, degraded }
}

describe('AdaptiveBitrateController', () => {
  it('does nothing while outputs stay healthy', () => {
    const controller = new AdaptiveBitrateController(OPTS)
    for (let tick = 0; tick < 50; tick++) {
      expect(controller.observe([sample(false)], tick * 2000)).toEqual([])
    }
    expect(controller.getScale('horizontal')).toBe(1)
  })

  it('steps down only after sustained degradation', () => {
    const controller = new AdaptiveBitrateController(OPTS)

    expect(controller.observe([sample(true)], 0)).toEqual([])
    expect(controller.observe([sample(true)], 2000)).toEqual([])

    const adjustments = controller.observe([sample(true)], 4000)
    expect(adjustments).toEqual([
      { encoderId: 'horizontal', bitrateKbps: 4800, scale: 0.8, direction: 'down' }
    ])
  })

  it('a blip shorter than the streak threshold never adjusts', () => {
    const controller = new AdaptiveBitrateController(OPTS)
    controller.observe([sample(true)], 0)
    controller.observe([sample(true)], 2000)
    // Healthy tick resets the streak before it reaches degradeTicks.
    controller.observe([sample(false)], 4000)
    expect(controller.observe([sample(true)], 6000)).toEqual([])
    expect(controller.getScale('horizontal')).toBe(1)
  })

  it('respects the cooldown between consecutive steps', () => {
    const controller = new AdaptiveBitrateController(OPTS)
    let now = 0
    for (let i = 0; i < 3; i++) controller.observe([sample(true)], (now += 2000))
    expect(controller.getScale('horizontal')).toBe(0.8)

    // Still degraded, but inside the cooldown window — no second step.
    for (let i = 0; i < 4; i++) {
      expect(controller.observe([sample(true)], (now += 2000))).toEqual([])
    }

    // Past the cooldown, the next completed streak steps again.
    const later = controller.observe([sample(true)], now + 10_000)
    expect(later).toHaveLength(1)
    expect(later[0].scale).toBe(0.64)
  })

  it('never drops below the floor', () => {
    const controller = new AdaptiveBitrateController(OPTS)
    let now = 0
    for (let round = 0; round < 20; round++) {
      now += 20_000
      for (let i = 0; i < 3; i++) controller.observe([sample(true)], (now += 2000))
    }
    expect(controller.getScale('horizontal')).toBe(0.5)
  })

  it('recovers toward full bitrate after sustained health', () => {
    const controller = new AdaptiveBitrateController(OPTS)
    let now = 0
    for (let i = 0; i < 3; i++) controller.observe([sample(true)], (now += 2000))
    expect(controller.getScale('horizontal')).toBe(0.8)

    // Recovery: healthy ticks accumulate, stepping up through cooldowns
    // until the scale snaps back to exactly 1.
    const seen: number[] = []
    for (let i = 0; i < 40; i++) {
      const adjustments = controller.observe([sample(false)], (now += 2000))
      for (const adjustment of adjustments) {
        expect(adjustment.direction).toBe('up')
        seen.push(adjustment.scale)
      }
    }
    expect(seen.length).toBeGreaterThan(0)
    expect(controller.getScale('horizontal')).toBe(1)
    // No overshoot past the configured bitrate at any point.
    for (const scale of seen) expect(scale).toBeLessThanOrEqual(1)
  })

  it('tracks encoders independently and forgets stopped ones', () => {
    const controller = new AdaptiveBitrateController(OPTS)
    let now = 0
    for (let i = 0; i < 3; i++) {
      controller.observe(
        [sample(true, 'horizontal'), sample(false, 'vertical', 8000)],
        (now += 2000)
      )
    }
    expect(controller.getScale('horizontal')).toBe(0.8)
    expect(controller.getScale('vertical')).toBe(1)

    // Stream stops (encoder absent) → state forgotten → next run starts fresh.
    controller.observe([], now + 2000)
    expect(controller.getScale('horizontal')).toBe(1)
  })
})
