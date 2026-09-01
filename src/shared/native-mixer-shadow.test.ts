import { describe, expect, it } from 'vitest'
import {
  compareNativeMixerShadow,
  parseNativeMixerShadowResult,
  parseNativeMixerShadowSnapshot,
  toNativeMixerHostRequest
} from './native-mixer-shadow'

const validSnapshot = {
  sequence: 7,
  sources: [{
    id: 'mic-one',
    volume: 0.75,
    pan: -0.2,
    muted: false,
    solo: false,
    global: false,
    mono: true,
    monitoringMode: 'off'
  }],
  activeLayerIds: ['mic-one'],
  retainedLayerIds: ['mic-one'],
  expected: [{
    id: 'mic-one',
    eligible: true,
    output: true,
    sceneGain: 1,
    effectiveGain: 0.75
  }]
}

describe('native mixer shadow boundary', () => {
  it('validates snapshots and strips the renderer oracle from host requests', () => {
    const snapshot = parseNativeMixerShadowSnapshot(validSnapshot)
    expect(snapshot).not.toBeNull()
    expect(toNativeMixerHostRequest(snapshot!)).not.toHaveProperty('expected')
  })

  it('rejects duplicate IDs, forged globals, and unbounded numeric input', () => {
    expect(parseNativeMixerShadowSnapshot({
      ...validSnapshot,
      activeLayerIds: ['mic-one', 'mic-one']
    })).toBeNull()
    expect(parseNativeMixerShadowSnapshot({
      ...validSnapshot,
      sources: [{ ...validSnapshot.sources[0], global: true }]
    })).toBeNull()
    expect(parseNativeMixerShadowSnapshot({
      ...validSnapshot,
      sources: [{ ...validSnapshot.sources[0], volume: Number.POSITIVE_INFINITY }]
    })).toBeNull()
  })

  it('parses native results and reports bounded parity differences', () => {
    const snapshot = parseNativeMixerShadowSnapshot(validSnapshot)!
    const matching = parseNativeMixerShadowResult({
      sequence: 7,
      routes: validSnapshot.expected
    })!
    expect(compareNativeMixerShadow(snapshot, matching)).toBeNull()
    expect(compareNativeMixerShadow(snapshot, {
      ...matching,
      routes: [{ ...matching.routes[0], effectiveGain: 0.5 }]
    })).toBe('mic-one effective gain mismatch')
  })
})
