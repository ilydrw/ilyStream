export type NativeSceneBlendMode = 'normal' | 'additive' | 'multiply' | 'screen'

export interface NativeSceneCrop {
  top: number
  bottom: number
  left: number
  right: number
}

export interface NativeSceneLayout {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  flipH: boolean
  flipV: boolean
  crop?: NativeSceneCrop
  fitMode: 'contain' | 'cover' | 'stretch'
}

export type NativeSceneSource =
  | { kind: 'display'; key: string; sourceId: string }
  | { kind: 'image'; key: string; assetPath: string }
  | {
      kind: 'live'
      key: string
      width: number
      height: number
      /**
       * Who delivers this source's pixels. 'renderer' (default): the renderer
       * uploads RGBA frames over IPC (cameras). 'browser-source': the main
       * process feeds BGRA paint frames straight from the offscreen
       * BrowserSourceService window — no renderer round trip (widgets/overlays).
       */
      feed?: 'renderer' | 'browser-source'
      /** BrowserSourceService capture id when feed === 'browser-source'. */
      browserSourceId?: string
    }
  | { kind: 'pixels'; key: string; width: number; height: number; pixels: Uint8Array }

export interface NativeLiveSourceFrame {
  key: string
  width: number
  height: number
  pixels: Uint8Array
}

/** Per-layer chroma key, normalized 0..1; math matches the canvas compositor. */
export interface NativeSceneChromaKey {
  keyR: number
  keyG: number
  keyB: number
  similarity: number
  smoothness: number
  spill: number
}

/**
 * Per-layer color adjustment: the layer's CSS-filter enhancement chain
 * (brightness/contrast/saturation/temperature/presets) composed into one
 * row-major 3x4 matrix (rows R,G,B; each row = mR,mG,mB,offset) plus an alpha
 * multiplier, applied by the engine in gamma space for canvas parity.
 */
export interface NativeSceneColorAdjust {
  matrix: number[]
  alpha: number
}

/**
 * Per-layer focus-circle sharp region: the engine draws the layer blurred, then
 * a sharp copy clipped to this circle on top (the canvas focus-circle effect).
 * Center and radius are CONTENT-local, in canvas pixels from the quad's
 * top-left in texcoord orientation. Flips need no adjustment — the shader's
 * circle SDF works in texcoord space and mirrors with the quad's negative-scale
 * flip, matching the canvas arc (drawn inside its ctx.scale(-1) flip). Scaled to
 * output pixels by the main process.
 */
export interface NativeSceneCircleMask {
  x: number
  y: number
  radius: number
}

export interface NativeSceneLayer {
  id: string
  source: NativeSceneSource
  layout: NativeSceneLayout
  opacity: number
  blendMode: NativeSceneBlendMode
  /** Present = chroma keying enabled for this layer. */
  chromaKey?: NativeSceneChromaKey
  /** Present = color adjustment enabled for this layer. */
  colorAdjust?: NativeSceneColorAdjust
  /**
   * Rounded-corner mask radius in CANVAS pixels (the canvas roundRect clip:
   * cornerRadius/100 * min(w,h)/2). Scaled to output pixels by the main
   * process. Only present for layers whose drawn quad fills the layout rect.
   */
  cornerRadius?: number
  /**
   * Gaussian blur sigma in CANVAS pixels for the blurred base draw. Combines
   * the beauty enhancement (CSS blur(beauty/100 * 2px)) and, when a focus
   * circle is set, its blur (CSS blur(focusCircle.blur/100 * 40px)) — sequential
   * CSS blurs compose as hypot(a, b). Scaled to output pixels by the main
   * process; the engine blurs a padded intermediate (downsampled for large
   * sigmas) and clips the bleed back to the quad, matching the canvas rect clip.
   */
  blurSigma?: number
  /**
   * Present = focus-circle sharp region enabled. See NativeSceneCircleMask.
   */
  circleMask?: NativeSceneCircleMask
  /**
   * Present = OBS-style image mask enabled. An image source whose alpha cuts the
   * layer (stretched across the quad, matching the canvas destination-in over
   * the layout rect). The main process uploads it as a second texture. Only set
   * for layers whose quad fills the layout rect.
   */
  maskSource?: NativeSceneSource
}

export interface NativeBroadcastScene {
  canvasWidth: number
  canvasHeight: number
  layers: NativeSceneLayer[]
}

export interface NativeTextureMetrics {
  width: number
  height: number
}

export interface NativeCompositorTransform {
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
  scale: { x: number; y: number; z: number }
  anchor: { x: number; y: number }
  pivot: { x: number; y: number }
  crop: { left: number; top: number; right: number; bottom: number }
  visibility: boolean
  opacity: number
  /**
   * Maps the drawn quad's UV into the LAYOUT rect that masks are positioned in:
   * [offsetU, offsetV, scaleU, scaleV]. For a letterboxed contain fit the quad
   * is a centered sub-region of the rect; identity [0,0,1,1] when it fills it.
   */
  maskTransform: [number, number, number, number]
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function computeNativeCompositorTransform(
  layout: NativeSceneLayout,
  source: NativeTextureMetrics,
  canvasWidth: number,
  canvasHeight: number,
  outputWidth: number,
  outputHeight: number
): NativeCompositorTransform {
  const sourceWidth = Math.max(1, source.width)
  const sourceHeight = Math.max(1, source.height)
  const requestedCrop = layout.crop
  let cropLeft = clamp(requestedCrop?.left ?? 0, 0, sourceWidth - 1)
  let cropRight = clamp(requestedCrop?.right ?? 0, 0, sourceWidth - cropLeft - 1)
  let cropTop = clamp(requestedCrop?.top ?? 0, 0, sourceHeight - 1)
  let cropBottom = clamp(requestedCrop?.bottom ?? 0, 0, sourceHeight - cropTop - 1)

  let croppedWidth = Math.max(1, sourceWidth - cropLeft - cropRight)
  let croppedHeight = Math.max(1, sourceHeight - cropTop - cropBottom)
  const targetWidth = Math.max(0, layout.width)
  const targetHeight = Math.max(0, layout.height)
  let drawWidth = targetWidth
  let drawHeight = targetHeight
  let drawX = layout.x
  let drawY = layout.y

  if (layout.fitMode === 'cover' && targetWidth > 0 && targetHeight > 0) {
    const sourceAspect = croppedWidth / croppedHeight
    const targetAspect = targetWidth / targetHeight
    if (sourceAspect > targetAspect) {
      const desiredWidth = croppedHeight * targetAspect
      const trim = Math.max(0, (croppedWidth - desiredWidth) / 2)
      cropLeft += trim
      cropRight += trim
    } else if (sourceAspect < targetAspect) {
      const desiredHeight = croppedWidth / targetAspect
      const trim = Math.max(0, (croppedHeight - desiredHeight) / 2)
      cropTop += trim
      cropBottom += trim
    }
    croppedWidth = Math.max(1, sourceWidth - cropLeft - cropRight)
    croppedHeight = Math.max(1, sourceHeight - cropTop - cropBottom)
  } else if (layout.fitMode === 'contain' && targetWidth > 0 && targetHeight > 0) {
    const fitScale = Math.min(targetWidth / croppedWidth, targetHeight / croppedHeight)
    drawWidth = croppedWidth * fitScale
    drawHeight = croppedHeight * fitScale
    drawX += (targetWidth - drawWidth) / 2
    drawY += (targetHeight - drawHeight) / 2
  }

  const outputScaleX = outputWidth / Math.max(1, canvasWidth)
  const outputScaleY = outputHeight / Math.max(1, canvasHeight)
  const scaledWidth = drawWidth * outputScaleX
  const scaledHeight = drawHeight * outputScaleY
  const scaleX = scaledWidth / croppedWidth
  const scaleY = scaledHeight / croppedHeight

  // The quad occupies [drawX, drawX+drawWidth] within the layout rect
  // [layout.x, layout.x+targetWidth]; the mask transform expresses that as a
  // UV offset+scale so the engine evaluates layout-space masks over a
  // letterboxed contain quad. Identity when the quad fills the rect.
  const maskTransform: [number, number, number, number] =
    targetWidth > 0 && targetHeight > 0
      ? [
          (drawX - layout.x) / targetWidth,
          (drawY - layout.y) / targetHeight,
          drawWidth / targetWidth,
          drawHeight / targetHeight
        ]
      : [0, 0, 1, 1]

  return {
    position: {
      x: (drawX + drawWidth / 2) * outputScaleX,
      y: (drawY + drawHeight / 2) * outputScaleY,
      z: 0
    },
    rotation: { x: 0, y: 0, z: layout.rotation },
    scale: {
      x: layout.flipH ? -scaleX : scaleX,
      y: layout.flipV ? -scaleY : scaleY,
      z: 1
    },
    anchor: { x: 0, y: 0 },
    pivot: { x: 0.5, y: 0.5 },
    crop: {
      left: cropLeft / sourceWidth,
      top: cropTop / sourceHeight,
      right: (sourceWidth - cropRight) / sourceWidth,
      bottom: (sourceHeight - cropBottom) / sourceHeight
    },
    visibility: targetWidth > 0 && targetHeight > 0,
    opacity: 1,
    maskTransform
  }
}
