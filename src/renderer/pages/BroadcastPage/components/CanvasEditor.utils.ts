import type { StudioLayer } from '../../../../shared/studio'
import type { BrowserFrameSurface, CachedMediaFrame, Crop } from './CanvasEditor.types'

export const BROWSER_SOURCE_CAPTURE_MAX_EDGE = 1920
export const BROWSER_SOURCE_CAPTURE_MAX_PIXELS = 1920 * 1080
export const BROWSER_SOURCE_CAPTURE_MAX_FPS = 30
export const BROWSER_SOURCE_CAPTURE_DEFAULT_FPS = 12

export function drawMediaStatus(
  ctx: CanvasRenderingContext2D,
  layout: { x: number; y: number; width: number; height: number },
  title: string,
  name: string
): void {
  ctx.fillStyle = 'rgba(255, 66, 66, 0.18)'
  ctx.fillRect(layout.x, layout.y, layout.width, layout.height)
  ctx.strokeStyle = 'rgba(255, 96, 96, 0.65)'
  ctx.lineWidth = 3
  ctx.strokeRect(layout.x + 1.5, layout.y + 1.5, Math.max(0, layout.width - 3), Math.max(0, layout.height - 3))

  const fontSize = Math.max(16, Math.min(28, layout.width / 18))
  ctx.fillStyle = '#fff'
  ctx.font = `900 ${fontSize}px Inter, Arial, sans-serif`
  ctx.textBaseline = 'top'
  ctx.fillText(title, layout.x + 18, layout.y + 18)
  ctx.fillStyle = 'rgba(255,255,255,0.72)'
  ctx.font = `700 ${Math.max(12, fontSize * 0.55)}px Inter, Arial, sans-serif`
  ctx.fillText(name, layout.x + 18, layout.y + 22 + fontSize)
}

export function drawAndCacheMediaFrame(
  ctx: CanvasRenderingContext2D,
  cache: Record<string, CachedMediaFrame>,
  id: string,
  video: HTMLVideoElement,
  layout: { x: number; y: number; width: number; height: number },
  frameCount: number,
  crop?: Crop,
  cacheEveryFrames = 1
): void {
  // Draw live media through a per-source surface. This avoids transient GPU
  // read hiccups from punching through as black/flicker on the composited scene.
  const width = Math.max(1, Math.round(layout.width))
  const height = Math.max(1, Math.round(layout.height))
  const cached = getCachedMediaFrame(cache, id, width, height)
  const refreshInterval = Math.max(1, Math.round(cacheEveryFrames))
  const shouldRefreshCache = !cached.lastUpdateAt || frameCount % refreshInterval === 0

  if (shouldRefreshCache) {
    cached.ctx.clearRect(0, 0, width, height)
    drawVideoFrame(cached.ctx, video, { x: 0, y: 0, width, height }, crop)
    cached.lastUpdateAt = performance.now()
  }

  ctx.drawImage(
    cached.canvas,
    Math.round(layout.x),
    Math.round(layout.y),
    width,
    height
  )
}

export function drawMediaFallback(
  ctx: CanvasRenderingContext2D,
  cache: Record<string, CachedMediaFrame>,
  id: string,
  layout: { x: number; y: number; width: number; height: number },
  title: string,
  name: string,
  options: { showBadge?: boolean } = {}
): void {
  const cached = cache[id]
  if (cached) {
    ctx.drawImage(cached.canvas, layout.x, layout.y, layout.width, layout.height)
    if (options.showBadge !== false) drawSourceHealthBadge(ctx, layout, title)
    return
  }

  drawMediaStatus(ctx, layout, title, name)
}

function drawVideoFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  layout: { x: number; y: number; width: number; height: number },
  crop?: Crop
): void {
  if (!crop) {
    ctx.drawImage(video, Math.round(layout.x), Math.round(layout.y), Math.round(layout.width), Math.round(layout.height))
    return
  }

  const sourceWidth = video.videoWidth
  const sourceHeight = video.videoHeight
  const sx = Math.max(0, crop.left)
  const sy = Math.max(0, crop.top)
  const sw = Math.max(1, sourceWidth - crop.left - crop.right)
  const sh = Math.max(1, sourceHeight - crop.top - crop.bottom)

  ctx.drawImage(
    video,
    sx,
    sy,
    sw,
    sh,
    Math.round(layout.x),
    Math.round(layout.y),
    Math.round(layout.width),
    Math.round(layout.height)
  )
}

export function drawSourceHealthBadge(
  ctx: CanvasRenderingContext2D,
  layout: { x: number; y: number; width: number; height: number },
  title: string
): void {
  ctx.save()
  const text = `SOURCE ${title}`
  ctx.font = '900 16px Inter, Arial, sans-serif'
  const width = Math.min(layout.width - 24, Math.max(120, ctx.measureText(text).width + 24))
  ctx.fillStyle = 'rgba(0, 0, 0, 0.62)'
  ctx.fillRect(layout.x + 12, layout.y + 12, width, 34)
  ctx.strokeStyle = 'rgba(255, 184, 77, 0.7)'
  ctx.strokeRect(layout.x + 12.5, layout.y + 12.5, width - 1, 33)
  ctx.fillStyle = '#ffcc66'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, layout.x + 24, layout.y + 29)
  ctx.restore()
}

export function getCachedMediaFrame(
  cache: Record<string, CachedMediaFrame>,
  id: string,
  width: number,
  height: number
): CachedMediaFrame {
  const existing = cache[id]
  if (existing && existing.width === width && existing.height === height) return existing

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false })
  if (!ctx) throw new Error('Media frame cache surface could not be created')

  const next = { canvas, ctx, width, height, lastUpdateAt: 0 }
  cache[id] = next
  return next
}

export function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxHeight: number
): void {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = testLine
    }
  }

  if (line) lines.push(line)

  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight))
  lines.slice(0, maxLines).forEach((value, index) => {
    ctx.fillText(value, x, y + index * lineHeight)
  })
}

export function resolveImageSource(assetPath?: string): string {
  if (!assetPath) return ''
  if (assetPath.startsWith('asset://')) {
    const assetId = assetPath.replace(/^asset:\/+/, '').replace(/^app\//, '')
    return `asset:///app/${encodeURIComponent(assetId)}`
  }
  if (/^[a-z]+:\/\//i.test(assetPath)) return assetPath
  return `file:///${assetPath.replace(/\\/g, '/')}`
}

export function resolveBrowserSourceUrl(layer: StudioLayer, overlayPort: number): string {
  if (layer.type === 'widget') {
    if (!layer.config?.widgetId) return ''
    const encodedConfig = btoa(unescape(encodeURIComponent(JSON.stringify(layer.config || {}))))
    return `http://localhost:${overlayPort}/overlay/${layer.config.widgetId}?config=${encodedConfig}&preview=1`
  }

  const url = String(layer.config?.url || '').trim()
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  if (/^file:\/\//i.test(url)) return url
  return `https://${url}`
}

export function getBrowserFrameSurface(
  cache: Record<string, BrowserFrameSurface>,
  id: string,
  width: number,
  height: number
): BrowserFrameSurface {
  const existing = cache[id]
  if (existing && existing.width === width && existing.height === height) return existing

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: false })
  if (!ctx) throw new Error('Browser source frame surface could not be created')

  const rgba = new Uint8ClampedArray(width * height * 4)
  const imageData = new ImageData(rgba, width, height)
  const pixels = new Uint32Array(rgba.buffer)
  const surface = { canvas, ctx, imageData, rgba, pixels, width, height }
  cache[id] = surface
  return surface
}

export function copyBgraToRgba(source: Uint8Array, surface: BrowserFrameSurface, transparentBackground = false): void {
  const length = Math.min(source.byteLength, surface.rgba.byteLength)
  const sourcePixels = new Uint32Array(source.buffer, source.byteOffset, length / 4)
  const targetPixels = surface.pixels

  if (!transparentBackground) {
    // High-speed bitwise swap (BGRA -> RGBA)
    for (let i = 0; i < sourcePixels.length; i++) {
      const v = sourcePixels[i]
      targetPixels[i] = (v & 0xff00ff00) | ((v & 0xff0000) >> 16) | ((v & 0xff) << 16)
    }
  } else {
    // Optimized transparency check
    for (let i = 0; i < sourcePixels.length; i++) {
      const v = sourcePixels[i]
      // Check if it's a "green screen" or dark keyed pixel quickly
      const alpha = (v >>> 24)
      if (alpha < 5) {
        targetPixels[i] = 0
        continue
      }
      
      const red = (v >>> 16) & 0xff
      const green = (v >>> 8) & 0xff
      const blue = v & 0xff
      
      // Chroma key optimization: if mostly black/alpha, drop it
      if (alpha >= 250 && red <= 8 && green <= 8 && blue <= 8) {
        targetPixels[i] = 0
      } else {
        targetPixels[i] = (alpha << 24) | (blue << 16) | (green << 8) | red
      }
    }
  }
}

export function resolveBrowserCaptureSettings(layer: StudioLayer, width: number, height: number): { width: number; height: number; fps: number } {
  const sourceWidth = Math.max(16, Math.round(width || 1280))
  const sourceHeight = Math.max(16, Math.round(height || 720))
  const edgeScale = Math.min(BROWSER_SOURCE_CAPTURE_MAX_EDGE / sourceWidth, BROWSER_SOURCE_CAPTURE_MAX_EDGE / sourceHeight)
  const pixelScale = Math.sqrt(BROWSER_SOURCE_CAPTURE_MAX_PIXELS / (sourceWidth * sourceHeight))
  const scale = Math.min(1, edgeScale, pixelScale)

  return {
    width: Math.max(16, Math.round(sourceWidth * scale)),
    height: Math.max(16, Math.round(sourceHeight * scale)),
    fps: clampBrowserSourceFps(layer.config?.fps)
  }
}

export function clampBrowserSourceFps(value: unknown): number {
  const fps = Number(value)
  if (!Number.isFinite(fps)) return BROWSER_SOURCE_CAPTURE_DEFAULT_FPS
  return Math.max(1, Math.min(BROWSER_SOURCE_CAPTURE_MAX_FPS, Math.round(fps)))
}

export function toUint8Array(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
  }
  return new Uint8Array(value as ArrayLike<number>)
}

export function softClip(value: number): number {
  if (!Number.isFinite(value)) return 0
  const x = value * 0.98
  const absX = Math.abs(x)
  if (absX <= 0.85) return x
  if (x > 0) {
    return 0.85 + (x - 0.85) / (1 + Math.pow((x - 0.85) / (1 - 0.85), 2))
  } else {
    const nx = -x
    return -(0.85 + (nx - 0.85) / (1 + Math.pow((nx - 0.85) / (1 - 0.85), 2)))
  }
}
