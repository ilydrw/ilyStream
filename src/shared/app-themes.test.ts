import { describe, expect, it } from 'vitest'
import {
  APP_THEME_DEFINITIONS,
  getAppThemeDefinition,
  getAppThemeLabel,
  resolveAppThemePalette
} from './app-themes'
import { DEFAULT_APP_SETTINGS } from './settings/defaults'

describe('app theme definitions', () => {
  it('uses the user-facing theme label instead of exposing the legacy storage id', () => {
    expect(getAppThemeLabel('dark')).toBe('Cyber Neon')
    expect(getAppThemeLabel('custom')).toBe('Custom')
  })

  it('includes editor-inspired dark and light theme families', () => {
    expect(
      APP_THEME_DEFINITIONS.filter((theme) =>
        [
          'solarized-dark',
          'solarized-light',
          'catppuccin-mocha',
          'catppuccin-latte',
          'dracula',
          'nord',
          'tokyo-night',
          'gruvbox-dark',
          'one-dark'
        ].includes(theme.id)
      ).map((theme) => theme.label)
    ).toEqual([
      'Solarized Dark',
      'Solarized Light',
      'Catppuccin Mocha',
      'Catppuccin Latte',
      'Dracula',
      'Nord',
      'Tokyo Night',
      'Gruvbox Dark',
      'One Dark'
    ])
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

  it('resolves custom palettes and saved accent overrides for companion clients', () => {
    const custom = resolveAppThemePalette({
      ...DEFAULT_APP_SETTINGS.ui,
      theme: 'custom',
      accentColor: '#123456',
      customBackground: '#f0f0f0',
      customSecondary: '#654321'
    })

    expect(custom.colorScheme).toBe('light')
    expect(custom.canvas).toBe('#f0f0f0')
    expect(custom.accent).toBe('#123456')
    expect(custom.secondary).toBe('#654321')
  })

  it('honors a forced color scheme instead of inferring it from the background', () => {
    const forcedDark = resolveAppThemePalette({
      ...DEFAULT_APP_SETTINGS.ui,
      theme: 'custom',
      customBackground: '#f0f0f0', // light background...
      customColorScheme: 'dark' // ...but the user forced dark
    })

    expect(forcedDark.colorScheme).toBe('dark')
    // Dark scheme uses light text even on a light canvas.
    expect(forcedDark.text).toBe('#f5f8ff')
  })

  it('applies per-token overrides on top of the derived palette', () => {
    const custom = resolveAppThemePalette({
      ...DEFAULT_APP_SETTINGS.ui,
      theme: 'custom',
      customBackground: '#101010',
      customPalette: { surface: '#abcdef', text: '#00ff00' }
    })

    expect(custom.surface).toBe('#abcdef')
    expect(custom.text).toBe('#00ff00')
    // Untouched tokens stay derived from the background.
    expect(custom.canvas).toBe('#101010')
  })

  it('ignores overrides for built-in themes', () => {
    const cyber = resolveAppThemePalette({
      ...DEFAULT_APP_SETTINGS.ui,
      theme: 'dark',
      customPalette: { surface: '#abcdef' }
    })

    expect(cyber.surface).toBe(getAppThemeDefinition('dark')!.palette.surface)
  })
})
