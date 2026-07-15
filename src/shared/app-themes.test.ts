import { describe, expect, it } from 'vitest'
import { APP_THEME_DEFINITIONS, getAppThemeDefinition, getAppThemeLabel } from './app-themes'

describe('app theme definitions', () => {
  it('uses the user-facing theme label instead of exposing the legacy storage id', () => {
    expect(getAppThemeLabel('dark')).toBe('Cyber Neon')
    expect(getAppThemeLabel('custom')).toBe('Custom')
  })

  it('defines distinct workbench segments for every built-in theme', () => {
    const ids = APP_THEME_DEFINITIONS.map((theme) => theme.id)
    expect(new Set(ids).size).toBe(ids.length)

    for (const theme of APP_THEME_DEFINITIONS) {
      expect(theme.palette.canvas).not.toBe(theme.palette.surface)
      expect(theme.palette.sidebar).not.toBe(theme.palette.surfaceRaised)
      expect(theme.palette.border).not.toBe(theme.palette.accent)
    }
  })

  it('keeps Cyber Neon and Ember visually independent beyond their accent colors', () => {
    const cyber = getAppThemeDefinition('dark')!
    const ember = getAppThemeDefinition('ember')!

    expect(cyber.palette.canvas).not.toBe(ember.palette.canvas)
    expect(cyber.palette.sidebar).not.toBe(ember.palette.sidebar)
    expect(cyber.palette.surface).not.toBe(ember.palette.surface)
    expect(cyber.palette.secondary).not.toBe(ember.palette.secondary)
  })
})
