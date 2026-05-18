import { describe, expect, it } from 'vitest'
import { applyWidgetThemeConfig } from './widget-themes'

describe('applyWidgetThemeConfig', () => {
  it('applies the Gob the Stopper palette to common and nested widget color fields', () => {
    const themed = applyWidgetThemeConfig({
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
      accentColor: '#00F2FF'
    }))
    expect(themed.particleLayer).toEqual(expect.objectContaining({
      style: 'hearts',
      primaryColor: '#00F2FF'
    }))
  })
})
