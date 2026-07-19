import { describe, expect, it } from 'vitest'
import type { StudioLayer, StudioScene } from '../../../../shared/studio'
import {
  getNativeSceneUnsupportedReason,
  resolveNativeMonitorIndex,
  shouldPresentNativeProgramPreview
} from './useNativeDisplayOutput'

function displayLayer(overrides: Partial<StudioLayer> = {}): StudioLayer {
  return {
    id: 'display',
    type: 'display',
    name: 'Monitor',
    zIndex: 0,
    opacity: 1,
    config: { desktopSourceId: 'screen:1:0', fitMode: 'contain' },
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    visible: true,
    locked: false,
    portraitX: 0,
    portraitY: 0,
    portraitWidth: 1080,
    portraitHeight: 1920,
    portraitVisible: true,
    portraitLocked: false,
    ...overrides
  }
}

function scene(layers: StudioLayer[]): StudioScene {
  return { id: 'scene', name: 'Scene', layers }
}

describe('resolveNativeMonitorIndex', () => {
  it('accepts an unmodified fullscreen monitor layer', () => {
    expect(resolveNativeMonitorIndex(scene([displayLayer()]), 1920, 1080)).toBe(1)
  })

  it('rejects scenes with additional visible layers', () => {
    const overlay = { ...displayLayer(), id: 'overlay', type: 'image' as const }
    expect(resolveNativeMonitorIndex(scene([displayLayer(), overlay]), 1920, 1080)).toBeNull()
  })

  it('rejects transforms, effects, and window captures', () => {
    expect(resolveNativeMonitorIndex(scene([displayLayer({ rotation: 5 })]), 1920, 1080)).toBeNull()
    expect(resolveNativeMonitorIndex(scene([displayLayer({ enhancements: { saturation: 120 } })]), 1920, 1080)).toBeNull()
    expect(resolveNativeMonitorIndex(scene([
      displayLayer({ config: { desktopSourceId: 'window:123:0', fitMode: 'contain' } })
    ]), 1920, 1080)).toBeNull()
  })
})

describe('getNativeSceneUnsupportedReason', () => {
  it('accepts multi-layer display, image, text, and audio scenes', () => {
    const image = displayLayer({
      id: 'image',
      type: 'image',
      zIndex: 1,
      config: { assetPath: 'asset://overlay.png', fitMode: 'cover' },
      x: 100,
      y: 100,
      width: 640,
      height: 360,
      rotation: 8,
      crop: { top: 2, bottom: 2, left: 4, right: 4 },
      blendMode: 'screen'
    })
    const text = displayLayer({
      id: 'text',
      type: 'text',
      zIndex: 2,
      config: { text: 'Live', color: '#ffffff', fontSize: 64 },
      x: 80,
      y: 80,
      width: 400,
      height: 120
    })
    const audio = displayLayer({ id: 'audio', type: 'audio', visible: true })

    expect(getNativeSceneUnsupportedReason(scene([displayLayer(), image, text, audio]))).toBeNull()
  })

  it('accepts window, camera, and browser-backed live sources', () => {
    expect(getNativeSceneUnsupportedReason(scene([
      displayLayer({ id: 'camera', type: 'camera' })
    ]))).toBeNull()
    expect(getNativeSceneUnsupportedReason(scene([
      displayLayer({ config: { desktopSourceId: 'window:123:0', fitMode: 'contain' } })
    ]))).toBeNull()
    expect(getNativeSceneUnsupportedReason(scene([
      displayLayer({ id: 'browser', type: 'browser', config: { url: 'https://example.com' } })
    ]))).toBeNull()
  })

  it('keeps unsupported effects and blend modes on the canvas compositor', () => {
    // Chroma key is composited natively now (engine fs_sprite chroma stage).
    expect(getNativeSceneUnsupportedReason(scene([
      displayLayer({ enhancements: { chromaKey: { enabled: true, color: '#00ff00', similarity: 40, smoothness: 10, spill: 10 } } })
    ]))).toBeNull()
    expect(getNativeSceneUnsupportedReason(scene([
      displayLayer({ enhancements: { virtualBackground: { enabled: true, type: 'blur', blurStrength: 20 } } })
    ]))).toContain('canvas-only enhancements')
    expect(getNativeSceneUnsupportedReason(scene([
      displayLayer({ blendMode: 'overlay' })
    ]))).toContain('blend mode')
  })
})

describe('shouldPresentNativeProgramPreview', () => {
  it('uses native presentation only for the visible landscape Program canvas', () => {
    expect(shouldPresentNativeProgramPreview(false, true, '16:9')).toBe(true)
    expect(shouldPresentNativeProgramPreview(true, true, '16:9')).toBe(false)
    expect(shouldPresentNativeProgramPreview(false, false, '16:9')).toBe(false)
    expect(shouldPresentNativeProgramPreview(false, true, '9:16')).toBe(false)
  })
})
