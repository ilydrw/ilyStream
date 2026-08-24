import { describe, expect, it } from 'vitest'
import { resolveTransitionTiming } from './studio-transition'

describe('resolveTransitionTiming', () => {
  it('clamps fade duration to a usable positive value', () => {
    expect(resolveTransitionTiming('fade', 0, 1000, 500)).toEqual({ durationMs: 1, cutAtMs: 1 })
  })

  it('clamps a stinger cut point inside its duration', () => {
    expect(resolveTransitionTiming('stinger', 300, 900, 1200)).toEqual({ durationMs: 900, cutAtMs: 900 })
    expect(resolveTransitionTiming('stinger', 300, 900, -50)).toEqual({ durationMs: 900, cutAtMs: 0 })
  })

  it('uses deterministic fallbacks for invalid persisted values', () => {
    expect(resolveTransitionTiming('stinger', 300, Number.NaN, Number.NaN))
      .toEqual({ durationMs: 1000, cutAtMs: 500 })
  })
})
