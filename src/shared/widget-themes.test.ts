import { describe, expect, it } from 'vitest'
import { applyWidgetThemeConfig, getWidgetTheme } from './widget-themes'

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
  })
})
