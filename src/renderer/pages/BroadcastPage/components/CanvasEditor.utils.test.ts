import { describe, expect, it } from 'vitest'
import type { StudioLayer } from '../../../../shared/studio'
import {
  BROWSER_SOURCE_CAPTURE_DEFAULT_FPS,
  WIDGET_SOURCE_CAPTURE_DEFAULT_FPS,
  resolveBrowserCaptureSettings
} from './CanvasEditor.utils'

function makeLayer(type: 'widget' | 'browser', fps?: number): StudioLayer {
  return {
    id: `${type}-source`,
    name: type,
    type,
    x: 0,
    y: 0,
    width: 640,
    height: 360,
    rotation: 0,
    visible: true,
    locked: false,
    opacity: 1,
    zIndex: 0,
    config: fps === undefined ? {} : { fps }
  } as StudioLayer
}

describe('resolveBrowserCaptureSettings', () => {
  it('defaults first-party widgets to smooth 60fps capture', () => {
    expect(resolveBrowserCaptureSettings(makeLayer('widget'), 640, 360).fps)
      .toBe(WIDGET_SOURCE_CAPTURE_DEFAULT_FPS)
  })

  it('keeps arbitrary browser sources on the conservative 30fps default', () => {
    expect(resolveBrowserCaptureSettings(makeLayer('browser'), 640, 360).fps)
      .toBe(BROWSER_SOURCE_CAPTURE_DEFAULT_FPS)
  })

  it('preserves an explicit per-layer frame rate', () => {
    expect(resolveBrowserCaptureSettings(makeLayer('widget', 24), 640, 360).fps).toBe(24)
  })
})
