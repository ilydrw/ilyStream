import { describe, expect, it } from 'vitest'
import type { StudioLayer, StudioScene } from '../../../../shared/studio'
import {
  buildVignettePixels,
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

  it('composites color enhancements natively but keeps sampling effects on canvas', () => {
    // Brightness/contrast/saturation/temperature/presets are one shader-side
    // color matrix now (engine fs_sprite color-adjust stage).
    expect(getNativeSceneUnsupportedReason(scene([
      displayLayer({ enhancements: { brightness: 120, contrast: 90, saturation: 140, temperature: 25 } })
    ]))).toBeNull()
    expect(getNativeSceneUnsupportedReason(scene([
      displayLayer({ enhancements: { filterPreset: 'kodachrome' } })
    ]))).toBeNull()
    // Vignette composites natively as a synthetic gradient overlay layer.
    expect(getNativeSceneUnsupportedReason(scene([
      displayLayer({ enhancements: { vignette: 40 } })
    ]))).toBeNull()
    // Beauty runs through the engine's Gaussian blur pipeline + color matrix.
    expect(getNativeSceneUnsupportedReason(scene([
      displayLayer({ enhancements: { beauty: 30 } })
    ]))).toBeNull()
    // The raw blur/sharpen fields are ignored by the broadcast canvas
    // compositor, so ignoring them natively IS parity — no fallback.
    expect(getNativeSceneUnsupportedReason(scene([
      displayLayer({ enhancements: { blur: 10, sharpen: 50 } })
    ]))).toBeNull()
  })

  it('composites the focus circle natively on any fit (masks remap onto the quad)', () => {
    // Cover/stretch: the engine draws a blurred base plus a sharp circle-masked
    // overlay, matching the canvas focus-circle two draws.
    expect(getNativeSceneUnsupportedReason(scene([
      displayLayer({
        id: 'camera', type: 'camera',
        config: { fitMode: 'cover' },
        enhancements: { focusCircle: { enabled: true, x: 50, y: 50, radius: 30, blur: 40 } }
      })
    ]))).toBeNull()
    // Contain (letterboxed) fits also compose now — the layer maskTransform maps
    // the circle from layout-rect space onto the drawn sub-region quad.
    expect(getNativeSceneUnsupportedReason(scene([
      displayLayer({ enhancements: { focusCircle: { enabled: true, x: 50, y: 50, radius: 30, blur: 40 } } })
    ]))).toBeNull()
  })

  it('composites cornerRadius natively on any fit (masks remap onto the quad)', () => {
    // Cover/stretch fits draw edge to edge; the SDF matches the roundRect clip.
    expect(getNativeSceneUnsupportedReason(scene([
      displayLayer({
        id: 'camera', type: 'camera',
        config: { fitMode: 'cover' },
        enhancements: { cornerRadius: 20 }
      })
    ]))).toBeNull()
    // Contain (letterboxed default displayLayer) composes too via maskTransform.
    expect(getNativeSceneUnsupportedReason(scene([
      displayLayer({ enhancements: { cornerRadius: 20 } })
    ]))).toBeNull()
  })

  it('composites the image mask natively on any fit (masks remap onto the quad)', () => {
    // Cover/stretch: the engine samples the mask texture and multiplies its
    // alpha, matching the canvas destination-in over the layout rect.
    expect(getNativeSceneUnsupportedReason(scene([
      displayLayer({
        id: 'camera', type: 'camera',
        config: { fitMode: 'cover' },
        enhancements: { imageMask: { enabled: true, assetPath: 'asset://mask.png' } }
      })
    ]))).toBeNull()
    // Contain (letterboxed) composes via maskTransform mapping the sample UV.
    expect(getNativeSceneUnsupportedReason(scene([
      displayLayer({ enhancements: { imageMask: { enabled: true, assetPath: 'asset://mask.png' } } })
    ]))).toBeNull()
  })

  it('composites plain shapes and static borders natively but keeps animated/clipped shapes on canvas', () => {
    const shapedCamera = (shape: unknown) => displayLayer({
      id: 'camera', type: 'camera',
      config: { fitMode: 'cover' },
      enhancements: { shape: shape as never }
    })
    // A plain mask shape on a quad-filling fit rasterizes to an alpha mask.
    expect(getNativeSceneUnsupportedReason(scene([
      shapedCamera({ type: 'circle', x: 50, y: 50, scale: 80, scope: 'both' })
    ]))).toBeNull()
    // The bare-string form is normalized the same way.
    expect(getNativeSceneUnsupportedReason(scene([shapedCamera('hexagon')]))).toBeNull()
    // Phase 2: a static solid border rasterizes to a stroke overlay layer.
    expect(getNativeSceneUnsupportedReason(scene([
      shapedCamera({ type: 'circle', x: 50, y: 50, scale: 80, scope: 'both', border: { enabled: true, type: 'solid', thickness: 4, color: '#0ff' } })
    ]))).toBeNull()
    // The drop shadow is a no-op in the broadcast compositor, so it does not
    // force fallback (rendering no shadow matches).
    expect(getNativeSceneUnsupportedReason(scene([
      shapedCamera({ type: 'circle', x: 50, y: 50, scale: 80, scope: 'both', shadow: { enabled: true, color: '#000', blur: 20, offsetX: 5, offsetY: 5 } })
    ]))).toBeNull()
    // Animated (chroma/cyber) and audio-reactive borders still need the canvas.
    expect(getNativeSceneUnsupportedReason(scene([
      shapedCamera({ type: 'circle', x: 50, y: 50, scale: 80, scope: 'both', border: { enabled: true, type: 'chroma', thickness: 4 } })
    ]))).toContain('canvas-only enhancements')
    expect(getNativeSceneUnsupportedReason(scene([
      shapedCamera({ type: 'circle', x: 50, y: 50, scale: 80, scope: 'both', border: { enabled: true, type: 'solid', thickness: 4, audioReactive: true } })
    ]))).toContain('canvas-only enhancements')
    // A focus circle composes with a shape: the circle rides its own uniform
    // while the shape keeps the mask texture, so both apply on the same draws.
    expect(getNativeSceneUnsupportedReason(scene([
      displayLayer({
        id: 'camera', type: 'camera', config: { fitMode: 'cover' },
        enhancements: { shape: 'circle', focusCircle: { enabled: true, x: 50, y: 50, radius: 30, blur: 40 } }
      })
    ]))).toBeNull()
    // A vignette composes too — it becomes a shape-clipped overlay layer.
    expect(getNativeSceneUnsupportedReason(scene([
      displayLayer({
        id: 'camera', type: 'camera', config: { fitMode: 'cover' },
        enhancements: { shape: 'circle', vignette: 40 }
      })
    ]))).toBeNull()
    // The image mask still conflicts — it needs the mask slot the shape uses.
    expect(getNativeSceneUnsupportedReason(scene([
      displayLayer({
        id: 'camera', type: 'camera', config: { fitMode: 'cover' },
        enhancements: { shape: 'circle', imageMask: { enabled: true, assetPath: 'asset://mask.png' } }
      })
    ]))).toContain('canvas-only enhancements')
    // 'rect'/'none' keep the canvas path (phase 1 covers the six mask shapes).
    expect(getNativeSceneUnsupportedReason(scene([shapedCamera('rect')]))).toContain('canvas-only enhancements')
    // Contain (letterboxed default displayLayer) composes now — the shape mask
    // is remapped from layout-rect space onto the drawn quad via maskTransform.
    expect(getNativeSceneUnsupportedReason(scene([
      displayLayer({ enhancements: { shape: 'circle' } })
    ]))).toBeNull()
  })
})

describe('buildVignettePixels', () => {
  it('matches the canvas radial gradient: transparent center, black edges', () => {
    const width = 160
    const height = 90
    const vignette = 50
    const pixels = buildVignettePixels(width, height, vignette)
    const alphaAt = (x: number, y: number) => pixels[(y * width + x) * 4 + 3]
    const rgbAt = (x: number, y: number) => [
      pixels[(y * width + x) * 4],
      pixels[(y * width + x) * 4 + 1],
      pixels[(y * width + x) * 4 + 2]
    ]

    // Pure black everywhere; only alpha ramps.
    expect(rgbAt(0, 0)).toEqual([0, 0, 0])
    expect(rgbAt(80, 45)).toEqual([0, 0, 0])

    // Center is (nearly) transparent, corners approach the peak.
    expect(alphaAt(80, 45)).toBeLessThanOrEqual(1)
    const peak = Math.round((vignette / 100) * 0.8 * 255)
    expect(alphaAt(0, 0)).toBeGreaterThan(peak * 0.7)
    expect(alphaAt(0, 0)).toBeLessThanOrEqual(peak)

    // Alpha grows monotonically outward along the horizontal center line.
    expect(alphaAt(40, 45)).toBeGreaterThan(alphaAt(70, 45))
    expect(alphaAt(0, 45)).toBeGreaterThan(alphaAt(40, 45))

    // The linear ramp against radius max(w,h)/1.5: halfway out along x from
    // the center, dist = 40, R = 160/1.5 -> t = 0.375.
    const expected = Math.round(0.375 * (vignette / 100) * 0.8 * 255)
    expect(Math.abs(alphaAt(120, 45) - expected)).toBeLessThanOrEqual(1)
  })

  it('caps the peak alpha at 80% for a full-strength vignette', () => {
    const pixels = buildVignettePixels(30, 30, 100)
    const corner = pixels[3]
    expect(corner).toBeLessThanOrEqual(Math.round(0.8 * 255))
    expect(corner).toBeGreaterThan(Math.round(0.7 * 255))
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
