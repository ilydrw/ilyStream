import { describe, expect, it } from 'vitest'
import { normalizeInterfaceScale, shouldApplyInterfaceScale } from './app-appearance'

describe('interface scaling', () => {
  it('normalizes invalid and out-of-range scale values', () => {
    expect(normalizeInterfaceScale(Number.NaN)).toBe(1)
    expect(normalizeInterfaceScale(0.5)).toBe(0.8)
    expect(normalizeInterfaceScale(1.1)).toBe(1.1)
    expect(normalizeInterfaceScale(1.8)).toBe(1.3)
  })

  it('keeps projector and overlay surfaces pixel-true', () => {
    expect(shouldApplyInterfaceScale({ pathname: '/settings', search: '' })).toBe(true)
    expect(shouldApplyInterfaceScale({ pathname: '/overlay/studio/scene-1', search: '' })).toBe(false)
    expect(shouldApplyInterfaceScale({ pathname: '/broadcast', search: '?projectorSceneId=scene-1' })).toBe(false)
  })
})
