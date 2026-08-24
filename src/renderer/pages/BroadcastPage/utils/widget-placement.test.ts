import { describe, expect, it } from 'vitest'
import { resolveWidgetStudioPreset } from './widget-placement'

describe('resolveWidgetStudioPreset camera mask outline', () => {
  it('places a resizable 16:9 outline above typical camera positions in both layouts', () => {
    expect(resolveWidgetStudioPreset({ type: 'camera-frame' })).toMatchObject({
      x: 1224,
      y: 664,
      width: 640,
      height: 360,
      locked: false,
      portraitX: 48,
      portraitY: 1580,
      portraitWidth: 520,
      portraitHeight: 292,
      portraitLocked: false
    })
  })

  it('uses a text widget canvas as its initial centered layer size', () => {
    expect(resolveWidgetStudioPreset({
      type: 'text',
      config: { canvasWidth: 960, canvasHeight: 260 }
    })).toMatchObject({
      x: 480,
      y: 410,
      width: 960,
      height: 260,
      portraitX: 60,
      portraitY: 830,
      portraitWidth: 960,
      portraitHeight: 260,
      locked: false,
      portraitLocked: false
    })
  })
})
