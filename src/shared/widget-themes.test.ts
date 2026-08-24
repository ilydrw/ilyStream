import { describe, expect, it } from 'vitest'
import {
  applyWidgetThemeConfig,
  DEFAULT_WIDGET_THEME_ID,
  getWidgetTheme,
  widgetConfigSupportsThemes,
  WIDGET_THEMES
} from './widget-themes'

describe('applyWidgetThemeConfig', () => {
  it('applies the Gob the Stopper palette to common and nested widget color fields', () => {
    const themed = applyWidgetThemeConfig({
      style: 'classic',
      borderType: 'solid',
      accentColor: '#ffffff',
      backgroundColor: '#ffffff',
      followerHearts: {
        primaryColor: '#ffffff',
        secondaryColor: '#ffffff',
        textColor: '#ffffff'
      },
      ggs: {
        color: '#ffffff'
      }
    }, 'gob-the-stopper')

    expect(themed).toEqual(expect.objectContaining({
      themeId: 'gob-the-stopper',
      widgetThemeName: 'Gob the Stopper',
      style: 'gob-the-stopper',
      borderType: 'gob-the-stopper',
      accentColor: '#B6FF00',
      backgroundColor: '#020402',
      secondaryColor: '#050505',
      textColor: '#F7FFE8'
    }))
    expect(themed.followerHearts).toEqual(expect.objectContaining({
      primaryColor: '#B6FF00',
      secondaryColor: '#050505',
      textColor: '#F7FFE8'
    }))
    expect(themed.ggs).toEqual(expect.objectContaining({
      color: '#B6FF00'
    }))
  })

  it('applies built-in theme style modes without changing particle shape styles', () => {
    const themed = applyWidgetThemeConfig({
      style: 'classic',
      borderType: 'solid',
      accentColor: '#ffffff',
      particleLayer: {
        style: 'hearts',
        primaryColor: '#ffffff'
      }
    }, 'chroma')

    expect(themed).toEqual(expect.objectContaining({
      themeId: 'chroma',
      widgetThemeName: 'Chroma',
      style: 'chroma',
      borderType: 'chroma',
      accentColor: '#FF3B30'
    }))
    expect(themed.particleLayer).toEqual(expect.objectContaining({
      style: 'hearts',
      primaryColor: '#FF3B30'
    }))
  })

  it('keeps Chroma visually distinct from Cyber', () => {
    const chroma = getWidgetTheme('chroma')
    const cyber = getWidgetTheme('cyber')

    expect(chroma.colors.primary).not.toBe(cyber.colors.primary)
    expect(chroma.colors.secondary).not.toBe(cyber.colors.secondary)
    expect(chroma.colors.border).not.toBe(cyber.colors.border)
    expect(chroma.colors.secondary).toBe('#00E5FF')
    expect(chroma.previewColors).toEqual([
      '#FF3B30',
      '#FFD60A',
      '#34D399',
      '#00E5FF',
      '#3B82F6',
      '#D946EF',
      '#FF3B30'
    ])
  })

  it('offers a broader set of distinct widget palettes', () => {
    expect(WIDGET_THEMES.map((theme) => theme.id)).toEqual([
      'cyber',
      'chroma',
      'midnight',
      'aurora',
      'ember',
      'synthwave',
      'solid',
      'gob-the-stopper'
    ])

    for (const theme of WIDGET_THEMES) {
      expect(theme.previewColors.length).toBeGreaterThanOrEqual(4)
      expect(new Set(theme.previewColors).size).toBeGreaterThanOrEqual(4)
    }
  })

  it('themes extended widget-specific color fields', () => {
    const themed = applyWidgetThemeConfig({
      labelBackgroundColor: '#000000',
      labelTextColor: '#000000',
      matteColor: '#000000',
      mutedTextColor: '#000000',
      panelColor: '#000000',
      crownColor: '#000000',
      speakingColor: '#000000'
    }, 'synthwave')

    expect(themed).toEqual(expect.objectContaining({
      labelBackgroundColor: '#1C0D30',
      labelTextColor: '#FFF4FF',
      matteColor: '#0D0517',
      mutedTextColor: '#CFADD9',
      panelColor: '#1C0D30',
      crownColor: '#22D3EE',
      speakingColor: '#22D3EE'
    }))
  })

  it('does not expose the removed Classic preset and falls legacy ids back to Cyber', () => {
    expect(WIDGET_THEMES.some((theme) => theme.id === ('classic' as string))).toBe(false)
    expect(getWidgetTheme('classic').id).toBe('cyber')
  })

  it('uses Cyber Neon as the explicit widget theme default', () => {
    expect(DEFAULT_WIDGET_THEME_ID).toBe('cyber')
    expect(WIDGET_THEMES[0]).toEqual(expect.objectContaining({
      id: 'cyber',
      name: 'Cyber Neon'
    }))
  })

  it('shows theme presets only for configs they can affect', () => {
    expect(widgetConfigSupportsThemes({
      gravity: 0.45,
      friction: 0.08,
      restitution: 0.72
    })).toBe(false)
    expect(widgetConfigSupportsThemes({
      maxItems: 5,
      position: 'top-left',
      opacity: 1
    })).toBe(false)
    expect(widgetConfigSupportsThemes({
      followerHearts: {
        primaryColor: '#ffffff'
      }
    })).toBe(true)
    expect(widgetConfigSupportsThemes({
      style: 'cyber'
    })).toBe(true)
    expect(widgetConfigSupportsThemes({
      style: 'hearts'
    })).toBe(false)
  })

  it('does not expose the removed Classic preset and falls legacy ids back to Cyber', () => {
    expect(WIDGET_THEMES.some((theme) => theme.id === ('classic' as string))).toBe(false)
    expect(getWidgetTheme('classic').id).toBe('cyber')
  })
})
