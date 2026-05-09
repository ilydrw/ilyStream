import { describe, expect, it } from 'vitest'
import { getWindowsSettingsUri } from './windows-settings'

describe('windows settings helpers', () => {
  it('maps language settings to the region and language page', () => {
    expect(getWindowsSettingsUri('language')).toBe('ms-settings:regionlanguage')
  })

  it('maps speech settings to the speech page', () => {
    expect(getWindowsSettingsUri('speech')).toBe('ms-settings:speech')
  })
})
