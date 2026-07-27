import { useEffect, useMemo, useRef, useState } from 'react'
import {
  resolveLayerLayout,
  type StudioLayer,
  type StudioScene,
  type StudioShapeBorder,
  type StudioShapeMask
} from '../../../../shared/studio'
import type {
  NativeBroadcastScene,
  NativeLiveSourceFrame,
  NativeSceneBlendMode,
  NativeSceneChromaKey,
  NativeSceneCircleMask,
  NativeSceneColorAdjust,
  NativeSceneLayer,
  NativeSceneSource
} from '../../../../shared/native-scene'
import { buildEnhancementColorMatrix } from '../../../../shared/color-filter-matrix'
import {
  croppedSourceRect,
  drawFittedSource,
  resolveBrowserCaptureSettings,
  resolveSourceFitMode,
  traceShapePath,
  wrapCanvasText
} from './CanvasEditor.utils'
import { segmentationService } from '../../../services/SegmentationService'
import type { BrowserFrameSurface, CachedMediaFrame } from './CanvasEditor.types'
import { CameraFramePump, type CameraFrameSourceSpec } from './camera-frame-pump'

interface NativeDisplayOutputOptions {
  enabled: boolean
  presentCanvasId?: string
  encodeFrames: boolean
  scene: StudioScene
  canvasWidth: number
  canvasHeight: number
  outputWidth: number
  outputHeight: number
  fps: number
  devices: MediaDeviceInfo[]
  transitionActive: boolean
  sourceRevision: number
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>
  browserFrameCache: React.MutableRefObject<Record<string, BrowserFrameSurface>>
  mediaFrameCache: React.MutableRefObject<Record<string, CachedMediaFrame>>
  encoderWorkerRef: React.RefObject<Worker | null>
  /** Output layout this instance drives. Defaults to the 16:9 program output. */
  aspectRatio?: NativeOutputAspectRatio
  /**
   * Which engine output this instance owns. The program session owns the engine
   * and the on-screen preview; any other id composites on its own output of the
   * same engine, sharing its textures.
   */
  sessionId?: string
  /** Stream output id the encoded frames belong to (horizontal, vertical, ...). */
  encodeOutputId?: string
}

interface NativeDisplayOutputState {
  active: boolean
  previewActive: boolean
}

const supportedBlendModes = new Set<NativeSceneBlendMode>([
  'normal',
  'additive',
  'multiply',
  'screen'
])
const MAX_LIVE_SOURCE_PIXELS = 3840 * 2160
const MAX_LIVE_SOURCE_EDGE = 4096

let nativeBroadcastLifecycleTail: Promise<void> = Promise.resolve()

function queueNativeBroadcastLifecycle<T>(operation: () => Promise<T>): Promise<T> {
  const result = nativeBroadcastLifecycleTail.then(operation, operation)
  nativeBroadcastLifecycleTail = result.then(() => undefined, () => undefined)
  return result
}

function hasCrop(layer: StudioLayer): boolean {
  const crop = layer.crop
  return Boolean(crop && (crop.top || crop.bottom || crop.left || crop.right))
}

function hasEnhancements(layer: StudioLayer): boolean {
  const enhancements = layer.enhancements
  if (!enhancements) return false

  return Boolean(
    (enhancements.brightness ?? 100) !== 100 ||
    (enhancements.contrast ?? 100) !== 100 ||
    (enhancements.saturation ?? 100) !== 100 ||
    (enhancements.sharpen ?? 0) !== 0 ||
    (enhancements.beauty ?? 0) !== 0 ||
    (enhancements.temperature ?? 0) !== 0 ||
    (enhancements.vignette ?? 0) !== 0 ||
    (enhancements.blur ?? 0) !== 0 ||
    (enhancements.cornerRadius ?? 0) !== 0 ||
    (enhancements.filterPreset && enhancements.filterPreset !== 'none') ||
    enhancements.chromaKey?.enabled ||
    enhancements.virtualBackground?.enabled ||
    enhancements.shape ||
    enhancements.focusCircle?.enabled ||
    enhancements.imageMask?.enabled
  )
}

/**
 * Which output layout a native scene is being built for. Layer geometry, shape
 * scope and the fullscreen-display fast path all resolve per aspect, so every
 * step from the scene builder down takes this rather than assuming the 16:9
 * program output.
 */
export type NativeOutputAspectRatio = '16:9' | '9:16'

// Shapes the engine composites natively in phase 1 by rasterizing the shape into
// an alpha mask (the imageMask pipeline). 'rect'/'none' keep the canvas path.
const NATIVE_SHAPE_TYPES = new Set(['circle', 'square', 'star', 'heart', 'hexagon', 'diamond'])

/** Normalize a layer's shape enhancement to its full object form (or null). */
function normalizeShape(layer: StudioLayer): StudioShapeMask | null {
  const shape = layer.enhancements?.shape
  if (!shape) return null
  if (typeof shape === 'object') return shape
  return { type: shape, x: 50, y: 50, scale: 100, scope: 'both' }
}

/**
 * A border the engine reproduces (phase 2): a plain colored stroke. The
 * broadcast compositor's chroma/cyber borders animate per frame (hue cycling +
 * glow) and audio-reactive borders pulse with volume, so those still fall back;
 * solid/gob-the-stopper/custom all render as the same static stroke there.
 */
function isStaticBorder(border: StudioShapeBorder | undefined): boolean {
  return Boolean(border?.enabled) &&
    border!.type !== 'chroma' &&
    border!.type !== 'cyber' &&
    !border!.audioReactive
}

/**
 * Decide how a layer's shape maps onto the native path:
 *   - null       → no shape (or a shape that doesn't apply); nothing to do.
 *   - 'fallback' → a shape the engine can't reproduce yet; keep the canvas path.
 *   - object     → a content-clip (+ optional static border) the engine handles.
 *
 * Content-clip is a rasterized alpha mask; a static border is a rasterized
 * stroke overlay (phase 2). A focus circle and a vignette compose with a shape:
 * the focus circle rides its own circleMask uniform (the shape keeps the mask
 * texture), and the vignette is a separate overlay the builder shape-clips.
 * Still on canvas: animated/audio-reactive borders, a capture pan, and the
 * image mask (it needs the single mask-texture slot the shape already uses).
 * The shape's drop shadow is NOT gated — the broadcast compositor never draws
 * it (only the editor overlay does), so rendering no shadow matches. Letterboxed
 * (contain) fits are fine: the engine remaps mask UVs into the layout rect (see
 * the layer maskTransform), so the shape geometry aligns regardless of fit.
 */
function resolveNativeShape(
  layer: StudioLayer,
  aspectRatio: NativeOutputAspectRatio
): 'fallback' | StudioShapeMask | null {
  const shapeObj = normalizeShape(layer)
  if (!shapeObj) return null
  if (!NATIVE_SHAPE_TYPES.has(shapeObj.type)) return 'fallback'

  const scope = shapeObj.scope ?? 'both'
  const inScope = scope === 'both' || scope === aspectRatio
  const hasAnimatedBorder = Boolean(shapeObj.border?.enabled) && !isStaticBorder(shapeObj.border)
  const hasCapturePan = (shapeObj.captureX ?? 50) !== 50 || (shapeObj.captureY ?? 50) !== 50
  const conflictsMask = Boolean(layer.enhancements?.imageMask?.enabled)

  if (!inScope || hasAnimatedBorder || hasCapturePan || conflictsMask) {
    return 'fallback'
  }
  return shapeObj
}

/** The virtual-background enhancement config (from the studio layer). */
type StudioVirtualBackground = NonNullable<NonNullable<StudioLayer['enhancements']>['virtualBackground']>

/**
 * Decide whether the engine composites a layer's virtual background natively.
 * It decomposes into a background layer (blurred camera / color / image) below a
 * person layer masked by the live segmentation silhouette, so it needs a camera
 * source (segmentation is camera-only) and the mask slot free of other masks
 * (shape, image mask, focus circle). Returns the config when eligible,
 * 'fallback' when vb is on but the engine can't reproduce it, else null.
 */
function resolveNativeVirtualBackground(layer: StudioLayer): StudioVirtualBackground | 'fallback' | null {
  const vb = layer.enhancements?.virtualBackground
  if (!vb?.enabled) return null
  if (layer.type !== 'camera') return 'fallback'
  if (vb.type !== 'blur' && vb.type !== 'color' && vb.type !== 'image') return 'fallback'
  if ((vb.type === 'color' || vb.type === 'image') && !vb.value) return 'fallback'
  const e = layer.enhancements
  const consumesMask = Boolean(e?.shape) || Boolean(e?.imageMask?.enabled) || Boolean(e?.focusCircle?.enabled)
  if (consumesMask) return 'fallback'
  return vb
}

/**
 * Like hasEnhancements, but enhancements the engine composites natively no
 * longer disqualify a layer: chroma key (fs_sprite chroma stage), the
 * color-matrix chain — brightness, contrast, saturation, temperature, filter
 * presets (fs_sprite color-adjust stage) — vignette (a synthetic gradient
 * overlay layer, see createVignetteSource), cornerRadius (fs_sprite
 * rounded-corner SDF), beauty (engine Gaussian blur pipeline + a contrast step
 * folded into the color matrix), the focus circle (engine blurred base draw +
 * sharp circle-masked overlay), and the image mask (engine second-texture alpha
 * multiply). The `blur` and `sharpen` fields are NOT gated: the broadcast canvas
 * compositor never applies them (only the enhancement modal's preview does), so
 * ignoring them IS parity. Everything else on the list still needs the canvas
 * compositor.
 *
 * All the engine masks are positioned in layout-rect space and remapped onto the
 * drawn quad via the layer maskTransform, so they compose correctly on any fit,
 * letterboxed contain included. The image mask is alpha-mode only, matching the
 * broadcast compositor (its mode/invert options are unimplemented there, so
 * honoring them would diverge). Shape masks that the engine can't reproduce
 * (animated borders, a capture pan, or an image mask needing the same slot)
 * still fall back — see resolveNativeShape.
 */
function hasNonNativeEnhancements(
  layer: StudioLayer,
  aspectRatio: NativeOutputAspectRatio
): boolean {
  const enhancements = layer.enhancements
  if (!enhancements) return false

  return Boolean(
    resolveNativeVirtualBackground(layer) === 'fallback' ||
    resolveNativeShape(layer, aspectRatio) === 'fallback'
  )
}

/** Build the native chroma key from a layer's enhancement settings (canvas parity). */
function toNativeChromaKey(layer: StudioLayer): NativeSceneChromaKey | undefined {
  const chromaKey = layer.enhancements?.chromaKey
  if (!chromaKey?.enabled || !chromaKey.color) return undefined
  const hex = chromaKey.color.replace('#', '')
  if (hex.length < 6) return undefined
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return undefined
  // Same defaults/normalization as the canvas compositor (useRenderLoop).
  return {
    keyR: r / 255,
    keyG: g / 255,
    keyB: b / 255,
    similarity: (chromaKey.similarity || 40) / 100,
    smoothness: (chromaKey.smoothness || 10) / 100,
    spill: (chromaKey.spill || 10) / 100
  }
}

/** Compose the layer's color enhancements into the engine's 3x4 matrix. */
function toNativeColorAdjust(layer: StudioLayer): NativeSceneColorAdjust | undefined {
  return buildEnhancementColorMatrix(layer.enhancements) ?? undefined
}

function isNativeImagePath(assetPath: string): boolean {
  return assetPath.startsWith('asset://') ||
    assetPath.startsWith('file://') ||
    /^[a-z]:[\\/]/i.test(assetPath)
}

export function getNativeSceneUnsupportedReason(
  scene: StudioScene,
  aspectRatio: NativeOutputAspectRatio = '16:9'
): string | null {
  const visibleLayers = scene.layers
    .map((layer) => resolveLayerLayout(layer, aspectRatio))
    .filter((layer) => layer.visible && layer.opacity > 0 && layer.type !== 'audio')

  for (const layer of visibleLayers) {
    const blendMode = (layer.blendMode ?? 'normal') as NativeSceneBlendMode
    if (!supportedBlendModes.has(blendMode)) return `blend mode ${layer.blendMode} is not native yet`
    if (hasNonNativeEnhancements(layer, aspectRatio)) return `${layer.name} uses canvas-only enhancements`
    if (layer.width <= 0 || layer.height <= 0) return `${layer.name} has an invalid layout`

    if (layer.type === 'display') {
      if (!/^(?:screen|window):\d+:\d+$/.test(String(layer.config.desktopSourceId ?? ''))) {
        return `${layer.name} does not have a valid screen or window source`
      }
      continue
    }

    if (layer.type === 'image') {
      const assetPath = String(layer.config.assetPath ?? '')
      if (!isNativeImagePath(assetPath)) return `${layer.name} does not use a local image asset`
      if (/\.gif(?:$|[?#])/i.test(assetPath)) return `${layer.name} is animated`
      continue
    }

    if (layer.type === 'text') continue
    if (layer.type === 'camera' || layer.type === 'widget' || layer.type === 'browser') continue
    return `${layer.name} (${layer.type}) still requires the canvas compositor`
  }

  return null
}

export function resolveNativeMonitorIndex(
  scene: StudioScene,
  canvasWidth: number,
  canvasHeight: number,
  aspectRatio: NativeOutputAspectRatio = '16:9'
): number | null {
  const visibleLayers = scene.layers
    .map(layer => resolveLayerLayout(layer, aspectRatio))
    .filter(layer => layer.visible)

  if (visibleLayers.length !== 1) return null
  const layer = visibleLayers[0]
  if (
    layer.type !== 'display' ||
    (layer.opacity ?? 1) !== 1 ||
    (layer.blendMode && layer.blendMode !== 'normal') ||
    (layer.config.fitMode && layer.config.fitMode !== 'contain') ||
    layer.x !== 0 ||
    layer.y !== 0 ||
    layer.width !== canvasWidth ||
    layer.height !== canvasHeight ||
    (layer.rotation ?? 0) !== 0 ||
    layer.flipH ||
    layer.flipV ||
    hasCrop(layer) ||
    hasEnhancements(layer)
  ) {
    return null
  }

  const match = /^screen:(\d+):/.exec(String(layer.config.desktopSourceId ?? ''))
  if (!match) return null
  const monitorIndex = Number(match[1])
  return Number.isSafeInteger(monitorIndex) && monitorIndex >= 0 ? monitorIndex : null
}

export function shouldPresentNativeProgramPreview(
  isPreview: boolean,
  isVisible: boolean,
  aspectRatio: '16:9' | '9:16'
): boolean {
  return !isPreview && isVisible && aspectRatio === '16:9'
}

function hashTextSource(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

function createTextSource(
  layer: StudioLayer,
  cache: Map<string, Extract<NativeSceneSource, { kind: 'pixels' }>>
): Extract<NativeSceneSource, { kind: 'pixels' }> {
  const width = Math.max(1, Math.min(8192, Math.ceil(layer.width)))
  const height = Math.max(1, Math.min(8192, Math.ceil(layer.height)))
  const fontSize = Math.max(1, Number(layer.config.fontSize) || 48)
  const text = String(layer.config.text ?? '')
  const color = String(layer.config.color ?? '#fff')
  const key = `text:${layer.id}:${hashTextSource(`${width}|${height}|${fontSize}|${color}|${text}`)}`
  const cached = cache.get(key)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true })
  if (!context) throw new Error(`Could not rasterize native text layer ${layer.name}`)
  context.clearRect(0, 0, width, height)
  context.fillStyle = color
  context.font = `700 ${fontSize}px Inter, sans-serif`
  context.textBaseline = 'top'
  wrapCanvasText(context, text, 0, 0, width, fontSize * 1.2, height)

  const source: Extract<NativeSceneSource, { kind: 'pixels' }> = {
    kind: 'pixels',
    key,
    width,
    height,
    pixels: new Uint8Array(context.getImageData(0, 0, width, height).data)
  }
  cache.set(key, source)
  return source
}

const MAX_VIGNETTE_EDGE = 512

/**
 * Rasterize the canvas compositor's vignette overlay: a radial gradient from
 * transparent at the layer center to black at radius max(w,h)/1.5, with peak
 * alpha vignette/100 * 0.8 (see useRenderLoop). The gradient is low-frequency,
 * so it renders at a capped resolution and stretches over the layer rect; the
 * aspect ratio is preserved so the circular falloff stays circular.
 */
export function buildVignettePixels(width: number, height: number, vignette: number): Uint8Array {
  const peakAlpha = Math.max(0, Math.min(1, vignette / 100)) * 0.8
  const radius = Math.max(width, height) / 1.5
  const centerX = width / 2
  const centerY = height / 2
  const pixels = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    const dy = y + 0.5 - centerY
    for (let x = 0; x < width; x += 1) {
      const dx = x + 0.5 - centerX
      const t = Math.min(1, Math.sqrt(dx * dx + dy * dy) / radius)
      pixels[(y * width + x) * 4 + 3] = Math.round(t * peakAlpha * 255)
    }
  }
  return pixels
}

function createVignetteSource(
  layer: StudioLayer,
  cache: Map<string, Extract<NativeSceneSource, { kind: 'pixels' }>>
): Extract<NativeSceneSource, { kind: 'pixels' }> {
  const vignette = Math.max(0, Math.min(100, Math.round(layer.enhancements?.vignette ?? 0)))
  const scale = Math.min(1, MAX_VIGNETTE_EDGE / Math.max(1, layer.width, layer.height))
  const width = Math.max(1, Math.round(layer.width * scale))
  const height = Math.max(1, Math.round(layer.height * scale))
  const key = `vignette:${width}x${height}:${vignette}`
  const cached = cache.get(key)
  if (cached) return cached

  const source: Extract<NativeSceneSource, { kind: 'pixels' }> = {
    kind: 'pixels',
    key,
    width,
    height,
    pixels: buildVignettePixels(width, height, vignette)
  }
  cache.set(key, source)
  return source
}

const MAX_SHAPE_EDGE = 1024

/**
 * Rasterize a mask shape into an alpha texture: opaque white inside the shape,
 * transparent outside (canvas antialiases the edge, like the shape clip). The
 * geometry mirrors the broadcast compositor's shape math (see useRenderLoop):
 * center at x/y % of the rect, size scale % of it, radius min(w,h)/2, rounded
 * corners cornerRadius/100 * min(w,h)/2. Rendered at a capped, aspect-preserving
 * resolution and stretched across the quad by the engine's mask sampler.
 */
export function buildShapePixels(
  width: number,
  height: number,
  shapeObj: StudioShapeMask,
  cornerRadiusPct: number
): Uint8Array {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true })
  if (!ctx) throw new Error('Could not rasterize native shape mask')
  ctx.clearRect(0, 0, width, height)

  const sx = (shapeObj.x / 100) * width
  const sy = (shapeObj.y / 100) * height
  const sw = (shapeObj.scale / 100) * width
  const sh = (shapeObj.scale / 100) * height
  const r = Math.min(sw, sh) / 2
  const cornerRadius = (cornerRadiusPct || 0) * (Math.min(sw, sh) / 200)

  ctx.fillStyle = '#fff'
  traceShapePath(ctx, shapeObj.type, sx, sy, r, sw, sh, cornerRadius, shapeObj.cutDepth)
  ctx.fill()

  return new Uint8Array(ctx.getImageData(0, 0, width, height).data)
}

function createShapeMaskSource(
  layer: StudioLayer,
  shapeObj: StudioShapeMask,
  cache: Map<string, Extract<NativeSceneSource, { kind: 'pixels' }>>
): Extract<NativeSceneSource, { kind: 'pixels' }> {
  const scale = Math.min(1, MAX_SHAPE_EDGE / Math.max(1, layer.width, layer.height))
  const width = Math.max(1, Math.round(layer.width * scale))
  const height = Math.max(1, Math.round(layer.height * scale))
  const cornerRadiusPct = Math.max(0, Math.min(100, layer.enhancements?.cornerRadius ?? 0))
  const key = `shape:${shapeObj.type}:${width}x${height}:${shapeObj.x}:${shapeObj.y}:${shapeObj.scale}:${shapeObj.cutDepth ?? ''}:${cornerRadiusPct}`
  const cached = cache.get(key)
  if (cached) return cached

  const source: Extract<NativeSceneSource, { kind: 'pixels' }> = {
    kind: 'pixels',
    key,
    width,
    height,
    pixels: buildShapePixels(width, height, shapeObj, cornerRadiusPct)
  }
  cache.set(key, source)
  return source
}

/**
 * Rasterize a static shape border: stroke the shape path with the border's
 * color/opacity/thickness (matching the broadcast compositor's solid border
 * branch — round join/cap, no glow). Thickness is in canvas px, so it scales by
 * the mask downscale to survive the stretch back across the quad. Drawn as a
 * synthetic overlay layer above the shaped content, unclipped like the canvas.
 */
export function buildBorderPixels(
  width: number,
  height: number,
  shapeObj: StudioShapeMask,
  border: StudioShapeBorder,
  cornerRadiusPct: number,
  scale: number
): Uint8Array {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true })
  if (!ctx) throw new Error('Could not rasterize native shape border')
  ctx.clearRect(0, 0, width, height)

  const sx = (shapeObj.x / 100) * width
  const sy = (shapeObj.y / 100) * height
  const sw = (shapeObj.scale / 100) * width
  const sh = (shapeObj.scale / 100) * height
  const r = Math.min(sw, sh) / 2
  const cornerRadius = (cornerRadiusPct || 0) * (Math.min(sw, sh) / 200)

  ctx.lineWidth = Math.max(0.1, (border.thickness ?? 1) * scale)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = border.color || '#fff'
  ctx.globalAlpha = Math.max(0, Math.min(1, (border.opacity ?? 100) / 100))
  traceShapePath(ctx, shapeObj.type, sx, sy, r, sw, sh, cornerRadius, shapeObj.cutDepth)
  ctx.stroke()

  return new Uint8Array(ctx.getImageData(0, 0, width, height).data)
}

function createBorderSource(
  layer: StudioLayer,
  shapeObj: StudioShapeMask,
  border: StudioShapeBorder,
  cache: Map<string, Extract<NativeSceneSource, { kind: 'pixels' }>>
): Extract<NativeSceneSource, { kind: 'pixels' }> {
  const scale = Math.min(1, MAX_SHAPE_EDGE / Math.max(1, layer.width, layer.height))
  const width = Math.max(1, Math.round(layer.width * scale))
  const height = Math.max(1, Math.round(layer.height * scale))
  const cornerRadiusPct = Math.max(0, Math.min(100, layer.enhancements?.cornerRadius ?? 0))
  const key = `border:${shapeObj.type}:${width}x${height}:${shapeObj.x}:${shapeObj.y}:${shapeObj.scale}:${shapeObj.cutDepth ?? ''}:${cornerRadiusPct}:${border.color ?? ''}:${border.thickness}:${border.opacity ?? 100}`
  const cached = cache.get(key)
  if (cached) return cached

  const source: Extract<NativeSceneSource, { kind: 'pixels' }> = {
    kind: 'pixels',
    key,
    width,
    height,
    pixels: buildBorderPixels(width, height, shapeObj, border, cornerRadiusPct, scale)
  }
  cache.set(key, source)
  return source
}

// The live segmentation mask is low-frequency, so a small texture stretched over
// the layout rect is plenty (and cheap to upload every frame).
const MAX_VB_MASK_EDGE = 256

/** A tiny solid-color pixels source for a 'color' virtual background. */
function createColorSource(
  color: string,
  cache: Map<string, Extract<NativeSceneSource, { kind: 'pixels' }>>
): Extract<NativeSceneSource, { kind: 'pixels' }> {
  const key = `vbcolor:${color}`
  const cached = cache.get(key)
  if (cached) return cached
  const hex = color.replace('#', '')
  const r = parseInt(hex.substring(0, 2) || '00', 16) || 0
  const g = parseInt(hex.substring(2, 4) || '00', 16) || 0
  const b = parseInt(hex.substring(4, 6) || '00', 16) || 0
  const pixels = new Uint8Array(2 * 2 * 4)
  for (let i = 0; i < 4; i += 1) {
    pixels[i * 4] = r
    pixels[i * 4 + 1] = g
    pixels[i * 4 + 2] = b
    pixels[i * 4 + 3] = 255
  }
  const source: Extract<NativeSceneSource, { kind: 'pixels' }> = { kind: 'pixels', key, width: 2, height: 2, pixels }
  cache.set(key, source)
  return source
}

function constrainLiveSourceDimensions(width: number, height: number): { width: number; height: number } {
  const sourceWidth = Math.max(1, Math.round(width))
  const sourceHeight = Math.max(1, Math.round(height))
  const edgeScale = Math.min(1, MAX_LIVE_SOURCE_EDGE / Math.max(sourceWidth, sourceHeight))
  const pixelScale = Math.min(1, Math.sqrt(MAX_LIVE_SOURCE_PIXELS / (sourceWidth * sourceHeight)))
  const scale = Math.min(edgeScale, pixelScale)
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale))
  }
}

function resolveLiveSourceDimensions(
  layer: StudioLayer,
  canvasWidth: number,
  canvasHeight: number,
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>,
  browserFrameCache: React.MutableRefObject<Record<string, BrowserFrameSurface>>,
  aspectRatio: NativeOutputAspectRatio
): { width: number; height: number } {
  if (layer.type === 'camera' || layer.type === 'display') {
    const video = videoRefs.current[layer.id]
    const fallbackWidth = layer.type === 'camera'
      ? Number(layer.config.captureWidth) || canvasWidth
      : canvasWidth
    const fallbackHeight = layer.type === 'camera'
      ? Number(layer.config.captureHeight) || canvasHeight
      : canvasHeight
    return constrainLiveSourceDimensions(
      video?.videoWidth || fallbackWidth,
      video?.videoHeight || fallbackHeight
    )
  }

  const browserSurface = browserFrameCache.current[layer.id]
  if (browserSurface?.width && browserSurface?.height) {
    return constrainLiveSourceDimensions(browserSurface.width, browserSurface.height)
  }

  const layout = resolveLayerLayout(layer, aspectRatio)
  const capture = resolveBrowserCaptureSettings(layer, layout.width, layout.height)
  return constrainLiveSourceDimensions(capture.width, capture.height)
}

function isLiveSourceLayer(layer: StudioLayer): boolean {
  if (layer.type === 'camera' || layer.type === 'widget' || layer.type === 'browser') return true
  return layer.type === 'display' && !/^screen:\d+:\d+$/.test(String(layer.config.desktopSourceId ?? ''))
}

export function resolveNativeCameraDeviceName(
  layer: StudioLayer,
  devices: MediaDeviceInfo[]
): string | null {
  if (layer.type !== 'camera') return null
  const storedLabel = String(layer.config.deviceLabel ?? '').trim()
  if (storedLabel) return storedLabel

  const configuredDeviceId = String(layer.config.deviceId ?? '')
  const browserDevice = devices.find(
    (device) =>
      device.kind === 'videoinput' &&
      device.deviceId === configuredDeviceId
  )
  return browserDevice?.label.trim() || null
}

function buildNativeBroadcastScene(
  scene: StudioScene,
  canvasWidth: number,
  canvasHeight: number,
  outputFps: number,
  pixelCache: Map<string, Extract<NativeSceneSource, { kind: 'pixels' }>>,
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>,
  browserFrameCache: React.MutableRefObject<Record<string, BrowserFrameSurface>>,
  devices: MediaDeviceInfo[],
  aspectRatio: NativeOutputAspectRatio
): NativeBroadcastScene {
  const usedPixelKeys = new Set<string>()
  const layers = scene.layers
    .map((layer) => resolveLayerLayout(layer, aspectRatio))
    .filter((layer) => layer.visible && layer.opacity > 0 && layer.type !== 'audio')
    .sort((left, right) => left.zIndex - right.zIndex)
    .flatMap<NativeSceneLayer>((layer) => {
      let source: NativeSceneSource
      if (layer.type === 'display' && !isLiveSourceLayer(layer)) {
        const sourceId = String(layer.config.desktopSourceId)
        source = { kind: 'display', key: `display:${sourceId}`, sourceId }
      } else if (layer.type === 'image') {
        const assetPath = String(layer.config.assetPath)
        source = { kind: 'image', key: `image:${assetPath}`, assetPath }
      } else if (isLiveSourceLayer(layer)) {
        const dimensions = resolveLiveSourceDimensions(
          layer,
          canvasWidth,
          canvasHeight,
          videoRefs,
          browserFrameCache,
          aspectRatio
        )
        // Widgets/browser overlays are fed by the main process. Cameras are
        // captured by Media Foundation when their browser label is known.
        // Window capture and unlabeled cameras retain the renderer path.
        const mainFed = layer.type === 'widget' || layer.type === 'browser'
        const nativeCameraDeviceName = resolveNativeCameraDeviceName(layer, devices)
        const nativeCamera = layer.type === 'camera' && nativeCameraDeviceName
        const nativeCameraTargetFps = nativeCamera
          ? resolveLiveSourceTargetFps(layer, outputFps)
          : undefined
        const nativeCameraKey = nativeCamera
          ? `native-camera:${encodeURIComponent(String(layer.config.deviceId ?? nativeCameraDeviceName))}:${nativeCameraTargetFps}:`
          : ''
        source = {
          kind: 'live',
          key: `live:${layer.id}:${nativeCameraKey}${dimensions.width}x${dimensions.height}`,
          ...dimensions,
          ...(mainFed
            ? { feed: 'browser-source' as const, browserSourceId: layer.id }
            : nativeCamera
              ? {
                  feed: 'native-camera' as const,
                  deviceName: nativeCameraDeviceName,
                  targetFps: nativeCameraTargetFps
                }
              : {})
        }
      } else {
        source = createTextSource(layer, pixelCache)
        usedPixelKeys.add(source.key)
      }

      const opacity = Math.max(0, Math.min(1, layer.opacity ?? 1))
      const rotation = Number(layer.rotation ?? 0)
      // Shape mask (phase 1): a plain content-clip shape becomes a rasterized
      // alpha mask. resolveNativeShape only returns 'fallback' for layers the
      // whole scene already rejected, so here it is a shape object or null.
      const resolvedShape = resolveNativeShape(layer, aspectRatio)
      const shapeObj = resolvedShape && resolvedShape !== 'fallback' ? resolvedShape : null
      // Canvas roundRect radius: cornerRadius% of min(w,h)/2, in canvas px. When
      // a shape mask is active the corner radius is baked into that mask (the
      // canvas only rounds inside the shape path), so the separate SDF is off.
      const cornerRadiusPct = Math.max(0, Math.min(100, layer.enhancements?.cornerRadius ?? 0))
      const cornerRadius = !shapeObj && cornerRadiusPct > 0
        ? cornerRadiusPct * Math.min(layer.width, layer.height) / 200
        : undefined
      // Beauty's blur half: CSS blur((beauty/100)*2px), canvas px. Its
      // contrast half rides the color matrix (buildEnhancementColorMatrix).
      const beauty = Math.max(0, Math.min(100, layer.enhancements?.beauty ?? 0))
      const beautySigma = beauty > 0 ? (beauty / 100) * 2 : 0
      // Focus circle: the canvas draws the layer blurred (CSS
      // blur((focusCircle.blur/100)*40px), compounding on beauty — sequential
      // blurs compose as hypot) then a sharp copy clipped to a circle. The
      // circle center is CONTENT-local (focusCircle.x/y % of the layout rect).
      // Flips need no adjustment: the engine's circle SDF lives in texcoord
      // (content) space and mirrors with the quad's negative-scale flip exactly
      // as the canvas mirrors its arc with ctx.scale(-1) — both track the same
      // content point. Native focus circle is gated on quad == layout rect (see
      // hasNonNativeEnhancements), so quad-local equals layout-local here.
      const focus = layer.enhancements?.focusCircle
      const focusEnabled = Boolean(focus?.enabled)
      const focusSigma = focusEnabled
        ? (Math.max(0, Math.min(100, focus!.blur)) / 100) * 40
        : 0
      const baseSigma = Math.hypot(beautySigma, focusSigma)
      const blurSigma = baseSigma > 0 ? baseSigma : undefined
      let circleMask: NativeSceneCircleMask | undefined
      if (focusEnabled) {
        circleMask = {
          x: (Math.max(0, Math.min(100, focus!.x)) / 100) * layer.width,
          y: (Math.max(0, Math.min(100, focus!.y)) / 100) * layer.height,
          radius: (Math.max(0, Math.min(100, focus!.radius)) / 100) * (Math.max(layer.width, layer.height) / 2)
        }
      }
      // Image mask: an image source whose alpha cuts the layer (canvas
      // destination-in over the layout rect). Alpha-mode only, matching the
      // broadcast compositor; mode/invert are ignored. The mask asset uploads
      // like any image source, sharing its texture by asset path.
      const imageMask = layer.enhancements?.imageMask
      let maskSource: NativeSceneSource | undefined
      if (imageMask?.enabled && imageMask.assetPath) {
        const maskAssetPath = String(imageMask.assetPath)
        maskSource = { kind: 'image', key: `image:${maskAssetPath}`, assetPath: maskAssetPath }
      }
      // A native shape claims the mask slot (the gate guarantees a shape and an
      // image mask never coexist), rasterized once and cached by its geometry.
      // The same mask is reused to shape-clip the vignette overlay below.
      let shapeMaskSource: Extract<NativeSceneSource, { kind: 'pixels' }> | undefined
      if (shapeObj) {
        shapeMaskSource = createShapeMaskSource(layer, shapeObj, pixelCache)
        usedPixelKeys.add(shapeMaskSource.key)
        maskSource = shapeMaskSource
      }

      // Virtual background: the person layer (this entry) is cut out by a LIVE
      // segmentation mask (fed per frame, see the mask upload loop), drawn over a
      // background layer prepended below. resolveNativeVirtualBackground only
      // yields a config for eligible camera layers, so the mask slot is free.
      let vbBackgroundLayer: NativeSceneLayer | undefined
      const nativeVb = resolveNativeVirtualBackground(layer)
      if (nativeVb && nativeVb !== 'fallback' && source.kind === 'live') {
        const vbScale = Math.min(1, MAX_VB_MASK_EDGE / Math.max(1, layer.width, layer.height))
        const maskW = Math.max(1, Math.round(layer.width * vbScale))
        const maskH = Math.max(1, Math.round(layer.height * vbScale))
        maskSource = { kind: 'live', key: `vbmask:${layer.id}:${maskW}x${maskH}`, width: maskW, height: maskH }

        const vbOpacity = Math.max(0, Math.min(1, (nativeVb.opacity ?? 100) / 100))
        const bgLayout = {
          x: layer.x, y: layer.y, width: layer.width, height: layer.height,
          rotation, flipH: false, flipV: false, crop: undefined, fitMode: 'stretch' as const
        }
        if (nativeVb.type === 'blur') {
          // Blurred camera at 0.7 brightness, matching blur(Npx) brightness(70%).
          vbBackgroundLayer = {
            id: `${layer.id}:vbbg`, source, layout: bgLayout,
            opacity: vbOpacity, blendMode: 'normal',
            colorAdjust: { matrix: [0.7, 0, 0, 0, 0, 0.7, 0, 0, 0, 0, 0.7, 0], alpha: 1 },
            blurSigma: Math.max(1, nativeVb.blurStrength ?? 20)
          }
        } else if (nativeVb.type === 'color' && nativeVb.value) {
          const colorSource = createColorSource(nativeVb.value, pixelCache)
          usedPixelKeys.add(colorSource.key)
          vbBackgroundLayer = {
            id: `${layer.id}:vbbg`, source: colorSource, layout: bgLayout,
            opacity: vbOpacity, blendMode: 'normal'
          }
        } else if (nativeVb.type === 'image' && nativeVb.value) {
          const assetPath = String(nativeVb.value)
          vbBackgroundLayer = {
            id: `${layer.id}:vbbg`,
            source: { kind: 'image', key: `image:${assetPath}`, assetPath },
            layout: {
              ...bgLayout,
              fitMode: nativeVb.scalingMode === 'stretch' ? 'stretch'
                : nativeVb.scalingMode === 'contain' ? 'contain' : 'cover'
            },
            opacity: vbOpacity, blendMode: 'normal',
            // The canvas softens an image background by blurStrength/4.
            ...(nativeVb.blurStrength ? { blurSigma: nativeVb.blurStrength / 4 } : {})
          }
        }
      }

      const entry: NativeSceneLayer = {
        id: layer.id,
        source,
        layout: {
          x: layer.x,
          y: layer.y,
          width: layer.width,
          height: layer.height,
          rotation,
          flipH: Boolean(layer.flipH),
          flipV: Boolean(layer.flipV),
          crop: layer.type === 'text' ? undefined : layer.crop,
          fitMode: layer.type === 'text'
            ? 'stretch'
            : layer.config.fitMode === 'cover' || layer.config.fitMode === 'stretch'
              ? layer.config.fitMode
              : 'contain'
        },
        opacity,
        blendMode: (layer.blendMode ?? 'normal') as NativeSceneBlendMode,
        chromaKey: toNativeChromaKey(layer),
        colorAdjust: toNativeColorAdjust(layer),
        cornerRadius,
        blurSigma,
        circleMask,
        maskSource
      }

      // Overlays share the parent's transform and draw source-over above it, in
      // the canvas Pass order: the static border stroke (Pass 2), then the
      // vignette gradient (Pass 3). A shaped layer clips its vignette to the
      // shape (the canvas draws it inside the shape clip) by reusing the shape
      // mask; an unshaped one uses the corner radius, exactly like the parent.
      const overlayLayout = {
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        rotation,
        flipH: false,
        flipV: false,
        crop: undefined,
        fitMode: 'stretch' as const
      }
      const overlays: NativeSceneLayer[] = []
      if (shapeObj && isStaticBorder(shapeObj.border)) {
        const borderSource = createBorderSource(layer, shapeObj, shapeObj.border!, pixelCache)
        usedPixelKeys.add(borderSource.key)
        overlays.push({
          id: `${layer.id}:border`,
          source: borderSource,
          layout: overlayLayout,
          opacity,
          blendMode: 'normal'
        })
      }
      if ((layer.enhancements?.vignette ?? 0) > 0) {
        const vignetteSource = createVignetteSource(layer, pixelCache)
        usedPixelKeys.add(vignetteSource.key)
        overlays.push({
          id: `${layer.id}:vignette`,
          source: vignetteSource,
          layout: overlayLayout,
          opacity,
          blendMode: 'normal',
          cornerRadius,
          maskSource: shapeMaskSource
        })
      }
      const base = overlays.length ? [entry, ...overlays] : [entry]
      return vbBackgroundLayer ? [vbBackgroundLayer, ...base] : base
    })

  for (const key of pixelCache.keys()) {
    if (!usedPixelKeys.has(key)) pixelCache.delete(key)
  }

  return { canvasWidth, canvasHeight, layers }
}

interface LiveSourceUploadSurface {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  lastUploadedAt: number
  lastVersion: number
}

function resolveLiveSourceTargetFps(layer: StudioLayer, outputFps: number): number {
  const configuredFps = layer.type === 'camera'
    ? Number(layer.config.captureFps)
    : layer.type === 'widget' || layer.type === 'browser'
      ? Number(layer.config.fps)
      : 60
  return Math.max(1, Math.min(60, outputFps, Number.isFinite(configuredFps) ? configuredFps : 30))
}

/**
 * The live MediaStreamTrack the layer's <video> element is currently
 * displaying (the possibly-stabilized output stream, not the raw device
 * stream), or null if none is available. The camera frame pump reads frames
 * off this track directly; using the DISPLAYED stream keeps parity with the
 * canvas path, which draws the same <video> element.
 */
function resolveDisplayedVideoTrack(video: HTMLVideoElement | undefined): MediaStreamTrack | null {
  const stream = video?.srcObject as MediaStream | null
  if (!stream || typeof stream.getVideoTracks !== 'function') return null
  const track = stream.getVideoTracks()[0]
  return track && track.readyState === 'live' ? track : null
}

/**
 * Camera/window-capture sources eligible for the frame pump: renderer-fed live
 * layers backed by a <video> element with a live track. Widgets/browser
 * overlays (main-fed) and pixel/display/image sources are excluded.
 */
function buildCameraFrameSpecs(
  nativeScene: NativeBroadcastScene,
  studioScene: StudioScene,
  outputFps: number,
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>
): CameraFrameSourceSpec[] {
  const studioLayers = new Map(studioScene.layers.map((layer) => [layer.id, layer]))
  const specs: CameraFrameSourceSpec[] = []
  for (const nativeLayer of nativeScene.layers) {
    const source = nativeLayer.source
    if (source.kind !== 'live' || (source.feed && source.feed !== 'renderer')) continue
    const studioLayer = studioLayers.get(nativeLayer.id)
    if (!studioLayer || (studioLayer.type !== 'camera' && studioLayer.type !== 'display')) continue
    const track = resolveDisplayedVideoTrack(videoRefs.current[studioLayer.id])
    if (!track) continue
    specs.push({
      key: source.key,
      track,
      width: source.width,
      height: source.height,
      targetFps: resolveLiveSourceTargetFps(studioLayer, outputFps)
    })
  }
  return specs
}

function resolveLiveFrameSource(
  layer: StudioLayer,
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>,
  browserFrameCache: React.MutableRefObject<Record<string, BrowserFrameSurface>>,
  mediaFrameCache: React.MutableRefObject<Record<string, CachedMediaFrame>>
): { source: CanvasImageSource; version: number } | null {
  if (layer.type === 'camera' || layer.type === 'display') {
    const video = videoRefs.current[layer.id]
    if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
      const quality = video.getVideoPlaybackQuality?.()
      const version = quality?.totalVideoFrames || Number((video as HTMLVideoElement & { webkitDecodedFrameCount?: number }).webkitDecodedFrameCount) || video.currentTime
      return { source: video, version }
    }

    const cached = mediaFrameCache.current[layer.id]
    return cached ? { source: cached.canvas, version: cached.lastUpdateAt } : null
  }

  const browserSurface = browserFrameCache.current[layer.id]
  if (!browserSurface?.bitmap) return null
  return { source: browserSurface.bitmap, version: browserSurface.lastUpdateAt ?? 0 }
}

async function uploadNativeLiveSources(
  nativeScene: NativeBroadcastScene,
  studioScene: StudioScene,
  outputFps: number,
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>,
  browserFrameCache: React.MutableRefObject<Record<string, BrowserFrameSurface>>,
  mediaFrameCache: React.MutableRefObject<Record<string, CachedMediaFrame>>,
  surfaces: Map<string, LiveSourceUploadSurface>,
  warnedSourceKeys: Set<string>,
  cameraFramePump: CameraFramePump
): Promise<void> {
  const studioLayers = new Map(studioScene.layers.map(layer => [layer.id, layer]))
  const usedSourceKeys = new Set<string>()
  const now = performance.now()
  const uploads: Promise<void>[] = []

  for (const nativeLayer of nativeScene.layers) {
    const source = nativeLayer.source
    if (source.kind !== 'live') continue
    // Main/native-fed sources update outside the renderer — nothing to upload
    // from this canvas/IPC path.
    if (source.feed && source.feed !== 'renderer') continue
    // The frame pump owns this source (MediaStreamTrackProcessor path); skip it
    // here so it is never uploaded twice, and let its stale canvas surface (if
    // any, from before the pump took over) be reclaimed below.
    if (cameraFramePump.isHandling(source.key)) continue
    usedSourceKeys.add(source.key)

    const studioLayer = studioLayers.get(nativeLayer.id)
    if (!studioLayer) continue
    const liveFrame = resolveLiveFrameSource(studioLayer, videoRefs, browserFrameCache, mediaFrameCache)
    if (!liveFrame) continue

    let surface = surfaces.get(source.key)
    if (!surface) {
      const canvas = document.createElement('canvas')
      canvas.width = source.width
      canvas.height = source.height
      const context = canvas.getContext('2d', {
        alpha: true,
        colorSpace: 'srgb',
        willReadFrequently: true
      })
      if (!context) continue
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      surface = { canvas, context, lastUploadedAt: 0, lastVersion: -1 }
      surfaces.set(source.key, surface)
    }

    const targetFps = resolveLiveSourceTargetFps(studioLayer, outputFps)
    if (now - surface.lastUploadedAt < 1000 / targetFps) continue
    if (liveFrame.version === surface.lastVersion) continue

    // The canvas draw + getImageData stay synchronous (per source), but the
    // IPC uploads run concurrently so one slow source can't serialize the rest.
    const boundSurface = surface
    try {
      boundSurface.context.clearRect(0, 0, source.width, source.height)
      boundSurface.context.drawImage(liveFrame.source, 0, 0, source.width, source.height)
      const imageData = boundSurface.context.getImageData(0, 0, source.width, source.height)
      const frame: NativeLiveSourceFrame = {
        key: source.key,
        width: source.width,
        height: source.height,
        pixels: new Uint8Array(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength)
      }
      uploads.push(
        window.api.engine.updateBroadcastSourceFrame(frame).then((result) => {
          if (!result.ok) {
            if (result.error !== 'Native live source is not ready' && !warnedSourceKeys.has(source.key)) {
              warnedSourceKeys.add(source.key)
              console.warn(`[NativeSceneOutput] Live source ${studioLayer.name}: ${result.error ?? 'frame upload failed'}`)
            }
            return
          }
          warnedSourceKeys.delete(source.key)
          boundSurface.lastUploadedAt = now
          boundSurface.lastVersion = liveFrame.version
        }, (error) => {
          if (!warnedSourceKeys.has(source.key)) {
            warnedSourceKeys.add(source.key)
            console.warn(`[NativeSceneOutput] Could not upload ${studioLayer.name}:`, error)
          }
        })
      )
    } catch (error) {
      if (!warnedSourceKeys.has(source.key)) {
        warnedSourceKeys.add(source.key)
        console.warn(`[NativeSceneOutput] Could not upload ${studioLayer.name}:`, error)
      }
    }
  }

  await Promise.all(uploads)

  for (const key of surfaces.keys()) {
    if (!usedSourceKeys.has(key)) surfaces.delete(key)
  }
}

/**
 * Feed each virtual-background layer's live segmentation mask. The MediaPipe
 * model runs in the renderer (it can't move to the engine), so per frame we kick
 * it, fit the latest silhouette the same way as the person into the mask texture
 * (opaque during warmup, so the person shows unmasked like the canvas), and
 * upload it. The engine then cuts the person out with it over the background.
 */
async function uploadVirtualBackgroundMasks(
  nativeScene: NativeBroadcastScene,
  studioScene: StudioScene,
  outputFps: number,
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>,
  surfaces: Map<string, LiveSourceUploadSurface>,
  warnedKeys: Set<string>
): Promise<void> {
  const studioLayers = new Map(studioScene.layers.map((layer) => [layer.id, layer]))
  const usedKeys = new Set<string>()
  const now = performance.now()
  const uploads: Promise<void>[] = []

  for (const nativeLayer of nativeScene.layers) {
    const mask = nativeLayer.maskSource
    if (!mask || mask.kind !== 'live' || !mask.key.startsWith('vbmask:')) continue
    const studioLayer = studioLayers.get(nativeLayer.id)
    if (!studioLayer) continue
    const video = videoRefs.current[studioLayer.id]
    if (!video || video.readyState < 2) continue
    usedKeys.add(mask.key)

    void segmentationService.processVideo(studioLayer.id, video)
    const maskResult = segmentationService.getMask(studioLayer.id)

    let surface = surfaces.get(mask.key)
    if (!surface) {
      const canvas = document.createElement('canvas')
      canvas.width = mask.width
      canvas.height = mask.height
      const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true })
      if (!context) continue
      surface = { canvas, context, lastUploadedAt: 0, lastVersion: -1 }
      surfaces.set(mask.key, surface)
    }
    const targetFps = Math.max(1, Math.min(60, outputFps))
    if (now - surface.lastUploadedAt < 1000 / targetFps) continue
    surface.lastUploadedAt = now

    // Skip the getImageData + IPC upload when the segmentation mask hasn't
    // changed since our last upload. MediaPipe produces masks at its own cadence
    // (often well below output fps), so at 30/60fps most ticks would re-rasterize
    // and re-send an identical silhouette — a steady w*h*4 allocation per tick per
    // VB layer for no visual change. Warmup (no mask yet) uploads one opaque frame
    // (version 0) so the person shows unmasked, then idles until a real mask lands;
    // if segmentation later drops, it falls back to opaque once, the same way.
    const maskVersion = getVirtualBackgroundMaskVersion(maskResult)
    if (maskVersion === surface.lastVersion) continue
    surface.lastVersion = maskVersion

    const ctx = surface.context
    ctx.clearRect(0, 0, mask.width, mask.height)
    if (maskResult?.mask) {
      drawFittedSource(
        ctx,
        maskResult.mask,
        croppedSourceRect(maskResult.width, maskResult.height, studioLayer.crop),
        { x: 0, y: 0, width: mask.width, height: mask.height },
        resolveSourceFitMode(studioLayer)
      )
    } else {
      // Warmup: opaque silhouette so the person shows unmasked.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, mask.width, mask.height)
    }

    const imageData = ctx.getImageData(0, 0, mask.width, mask.height)
    const frame: NativeLiveSourceFrame = {
      key: mask.key,
      width: mask.width,
      height: mask.height,
      pixels: new Uint8Array(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength)
    }
    uploads.push(
      window.api.engine
        .updateBroadcastSourceFrame(frame)
        .then((result) => {
          if (!result.ok && result.error !== 'Native live source is not ready' && !warnedKeys.has(mask.key)) {
            warnedKeys.add(mask.key)
            console.warn(`[NativeSceneOutput] VB mask ${studioLayer.name}: ${result.error ?? 'upload failed'}`)
          }
        })
        .catch(() => {})
    )
  }

  await Promise.all(uploads)

  for (const key of surfaces.keys()) {
    if (!usedKeys.has(key)) surfaces.delete(key)
  }
}

export function getVirtualBackgroundMaskVersion(
  maskResult: { mask?: unknown; timestamp: number } | null | undefined
): number {
  return maskResult?.mask ? maskResult.timestamp : 0
}

export function useNativeDisplayOutput(options: NativeDisplayOutputOptions): NativeDisplayOutputState {
  const {
    enabled,
    presentCanvasId,
    encodeFrames,
    scene,
    canvasWidth,
    canvasHeight,
    outputWidth,
    outputHeight,
    fps,
    devices,
    transitionActive,
    sourceRevision,
    videoRefs,
    browserFrameCache,
    mediaFrameCache,
    encoderWorkerRef,
    aspectRatio = '16:9',
    sessionId = 'program',
    encodeOutputId = 'horizontal'
  } = options
  const [active, setActive] = useState(false)
  const sceneRef = useRef(scene)
  const pixelSourceCacheRef = useRef(new Map<string, Extract<NativeSceneSource, { kind: 'pixels' }>>())
  const syncSceneRef = useRef<((nextScene: StudioScene) => void) | null>(null)
  sceneRef.current = scene

  const unsupportedReason = useMemo(
    () => getNativeSceneUnsupportedReason(scene, aspectRatio),
    [scene]
  )
  const supported = unsupportedReason === null

  useEffect(() => {
    setActive(false)
    syncSceneRef.current = null
    if (!enabled || transitionActive || !supported) return

    let disposed = false
    let startTimer: number | null = null
    let startRequested = false
    let frameTimer: number | null = null
    let liveSourceTimer: number | null = null
    let liveSourceUploadBusy = false
    let pendingScene: StudioScene | null = null
    let syncing = false
    let appliedNativeScene: NativeBroadcastScene | null = null
    const liveSourceSurfaces = new Map<string, LiveSourceUploadSurface>()
    const vbMaskSurfaces = new Map<string, LiveSourceUploadSurface>()
    const warnedSourceKeys = new Set<string>()
    const vbMaskWarnedKeys = new Set<string>()
    const pumpWarnedKeys = new Set<string>()
    const cameraFramePump = new CameraFramePump({
      uploadFrame: (frame) => window.api.engine.updateBroadcastSourceFrame(frame),
      onWarn: (key, message) => {
        if (pumpWarnedKeys.has(key)) return
        pumpWarnedKeys.add(key)
        console.warn(`[NativeSceneOutput] Camera frame pump ${key}: ${message}`)
      }
    })
    const frameIntervalMs = 1000 / Math.max(1, fps)
    const startedAt = performance.now()
    let frameIndex = 0

    const onNativeFrame = (event: MessageEvent) => {
      const data = event.data as {
        __ilyNativeBroadcastFrame?: boolean
        outputId?: string
        frame?: VideoFrame
      } | undefined
      if (!data?.__ilyNativeBroadcastFrame || data.outputId !== 'horizontal' || !data.frame) return

      const worker = encoderWorkerRef.current
      if (disposed || !worker) {
        data.frame.close()
        return
      }
      worker.postMessage({ type: 'composited_frame', payload: { frame: data.frame } }, [data.frame])
    }

    const buildRequest = (nextScene: StudioScene) => buildNativeBroadcastScene(
      nextScene,
      canvasWidth,
      canvasHeight,
      fps,
      pixelSourceCacheRef.current,
      videoRefs,
      browserFrameCache,
      devices,
      aspectRatio
    )

    const stopAfterFailure = async (error: unknown) => {
      if (disposed) return
      console.warn(`[NativeSceneOutput] Canvas fallback: ${error instanceof Error ? error.message : String(error)}`)
      syncSceneRef.current = null
      if (presentCanvasId) window.api.engine.detachBroadcastPreview()
      setActive(false)
      if (frameTimer !== null) {
        window.clearInterval(frameTimer)
        frameTimer = null
      }
      if (liveSourceTimer !== null) {
        window.clearInterval(liveSourceTimer)
        liveSourceTimer = null
      }
      cameraFramePump.dispose()
      await queueNativeBroadcastLifecycle(() => window.api.engine.stopBroadcast(sessionId)).catch(() => {})
    }

    const drainSceneUpdates = async () => {
      if (syncing) return
      syncing = true
      try {
        while (pendingScene && !disposed) {
          const nextScene = pendingScene
          pendingScene = null
          const nextNativeScene = buildRequest(nextScene)
          const result = await window.api.engine.updateBroadcastScene(nextNativeScene, sessionId)
          if (!result.ok) throw new Error(result.error ?? 'Native scene update failed')
          appliedNativeScene = nextNativeScene
        }
      } catch (error) {
        await stopAfterFailure(error)
      } finally {
        syncing = false
      }
    }

    const queueSceneUpdate = (nextScene: StudioScene) => {
      pendingScene = nextScene
      void drainSceneUpdates()
    }

    window.addEventListener('message', onNativeFrame)

    const start = async () => {
      startRequested = true
      const initialNativeScene = buildRequest(sceneRef.current)
      const result = await queueNativeBroadcastLifecycle(async () => {
        if (disposed) return null
        return window.api.engine.startBroadcast({
          width: outputWidth,
          height: outputHeight,
          fps,
          scene: initialNativeScene,
          sessionId
        })
      })
      if (!result || disposed) return
      if (!result?.ok) throw new Error(result?.error ?? 'native output unavailable')

      if (presentCanvasId) window.api.engine.attachBroadcastPreview(presentCanvasId)
      appliedNativeScene = initialNativeScene
      syncSceneRef.current = queueSceneUpdate
      setActive(true)

      const uploadLiveSources = () => {
        if (disposed || liveSourceUploadBusy || !appliedNativeScene) return
        // Point the pump at the current camera/display tracks; it uploads their
        // frames on its own read loop, and the canvas upload below skips any
        // source the pump is actively serving.
        cameraFramePump.sync(buildCameraFrameSpecs(appliedNativeScene, sceneRef.current, fps, videoRefs))
        liveSourceUploadBusy = true
        void Promise.all([
          uploadNativeLiveSources(
            appliedNativeScene,
            sceneRef.current,
            fps,
            videoRefs,
            browserFrameCache,
            mediaFrameCache,
            liveSourceSurfaces,
            warnedSourceKeys,
            cameraFramePump
          ),
          // Feed each virtual-background layer's live segmentation mask.
          uploadVirtualBackgroundMasks(
            appliedNativeScene,
            sceneRef.current,
            fps,
            videoRefs,
            vbMaskSurfaces,
            vbMaskWarnedKeys
          )
        ]).finally(() => {
          liveSourceUploadBusy = false
        })
      }
      uploadLiveSources()
      liveSourceTimer = window.setInterval(uploadLiveSources, 1000 / Math.max(1, Math.min(60, fps)))
      if (!encodeFrames) return

      const requestFrame = () => {
        frameIndex += 1
        const timestamp = Math.round((startedAt + frameIndex * frameIntervalMs) * 1000)
        window.api.engine.requestBroadcastFrame(timestamp, encodeOutputId, sessionId)
      }
      requestFrame()
      frameTimer = window.setInterval(requestFrame, frameIntervalMs)
    }

    startTimer = window.setTimeout(() => {
      startTimer = null
      void start().catch(stopAfterFailure)
    }, 0)

    return () => {
      disposed = true
      if (startTimer !== null) window.clearTimeout(startTimer)
      pendingScene = null
      syncSceneRef.current = null
      if (presentCanvasId) window.api.engine.detachBroadcastPreview()
      setActive(false)
      if (frameTimer !== null) window.clearInterval(frameTimer)
      if (liveSourceTimer !== null) window.clearInterval(liveSourceTimer)
      cameraFramePump.dispose()
      liveSourceSurfaces.clear()
      vbMaskSurfaces.clear()
      window.removeEventListener('message', onNativeFrame)
      if (startRequested) {
        void queueNativeBroadcastLifecycle(() => window.api.engine.stopBroadcast(sessionId)).catch(() => {})
      }
    }
  }, [enabled, presentCanvasId, encodeFrames, transitionActive, supported, outputWidth, outputHeight, fps, devices, canvasWidth, canvasHeight, videoRefs, browserFrameCache, mediaFrameCache, encoderWorkerRef, aspectRatio, sessionId, encodeOutputId])

  useEffect(() => {
    syncSceneRef.current?.(scene)
  }, [scene, sourceRevision])

  return {
    active,
    previewActive: active && Boolean(presentCanvasId)
  }
}
