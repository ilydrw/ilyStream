import type { StudioLayer } from '../../../../shared/studio'
import type { BrowserFrameSurface, CachedMediaFrame, Crop, HandleDir } from './CanvasEditor.types'

export const BROWSER_SOURCE_CAPTURE_MAX_EDGE = 1920
export const BROWSER_SOURCE_CAPTURE_MAX_PIXELS = 1920 * 1080
export const BROWSER_SOURCE_CAPTURE_MAX_FPS = 60
// 30fps default: each frame is a full BGRA bitmap copied main → renderer →
// worker, so capture rate directly drives allocation churn. Layers that need
// 60 can still set it explicitly via config.fps.
export const BROWSER_SOURCE_CAPTURE_DEFAULT_FPS = 30
const LIKES_TRACKER_CAPTURE_MIN_WIDTH = 400
const LIKES_TRACKER_CAPTURE_MIN_HEIGHT = 280
const LEADERBOARD_CAPTURE_MIN_WIDTH = 440
const LEADERBOARD_CAPTURE_MIN_HEIGHT = 640
const CHAT_WIDGET_CAPTURE_MIN_WIDTH = 1080
const CHAT_WIDGET_CAPTURE_MIN_HEIGHT = 1920

export type SourceFitMode = 'contain' | 'cover' | 'stretch'

export interface SourceRect {
  x: number
  y: number
  width: number
  height: number
}

function resetMediaFrameContext(ctx: CanvasRenderingContext2D): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.filter = 'none'
  ctx.shadowBlur = 0
  ctx.shadowColor = 'rgba(0, 0, 0, 0)'
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
}

export function normalizeGridSize(value: number): number {
  const next = Math.round(Number(value))
  if (!Number.isFinite(next)) return 20
  return Math.max(1, next)
}

export function snapToGridValue(value: number, gridSize: number): number {
  const normalizedGridSize = normalizeGridSize(gridSize)
  return Math.round(value / normalizedGridSize) * normalizedGridSize
}

export function snapPointToGrid(x: number, y: number, gridSize: number): { x: number; y: number } {
  return {
    x: snapToGridValue(x, gridSize),
    y: snapToGridValue(y, gridSize)
  }
}

export function snapResizeRectToGrid(rect: SourceRect, handle: HandleDir, gridSize: number, minSize = 10): SourceRect {
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height
  const safeMinSize = Math.max(1, minSize)
  let x = rect.x
  let y = rect.y
  let width = rect.width
  let height = rect.height

  if (handle.includes('w')) {
    const snappedX = snapToGridValue(x, gridSize)
    x = Math.min(snappedX, right - safeMinSize)
    width = right - x
  } else if (handle.includes('e')) {
    const snappedRight = snapToGridValue(right, gridSize)
    width = Math.max(safeMinSize, snappedRight - x)
  }

  if (handle.includes('n')) {
    const snappedY = snapToGridValue(y, gridSize)
    y = Math.min(snappedY, bottom - safeMinSize)
    height = bottom - y
  } else if (handle.includes('s')) {
    const snappedBottom = snapToGridValue(bottom, gridSize)
    height = Math.max(safeMinSize, snappedBottom - y)
  }

  return { x, y, width, height }
}

export function resolveSourceFitMode(layer: StudioLayer): SourceFitMode {
  const value = layer.config?.fitMode
  return value === 'cover' || value === 'stretch' ? value : 'contain'
}

export function croppedSourceRect(width: number, height: number, crop?: Crop): SourceRect {
  const safeWidth = Math.max(1, width)
  const safeHeight = Math.max(1, height)
  const left = Math.max(0, Math.min(safeWidth - 1, crop?.left || 0))
  const top = Math.max(0, Math.min(safeHeight - 1, crop?.top || 0))
  const right = Math.max(0, Math.min(safeWidth - left - 1, crop?.right || 0))
  const bottom = Math.max(0, Math.min(safeHeight - top - 1, crop?.bottom || 0))

  return {
    x: left,
    y: top,
    width: Math.max(1, safeWidth - left - right),
    height: Math.max(1, safeHeight - top - bottom)
  }
}

export function drawFittedSource(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceRect: SourceRect,
  destRect: SourceRect,
  fitMode: SourceFitMode
): void {
  if (fitMode === 'stretch') {
    ctx.drawImage(source, sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height, destRect.x, destRect.y, destRect.width, destRect.height)
    return
  }

  const sourceRatio = sourceRect.width / sourceRect.height
  const destRatio = destRect.width / destRect.height

  if (fitMode === 'cover') {
    let sx = sourceRect.x
    let sy = sourceRect.y
    let sw = sourceRect.width
    let sh = sourceRect.height

    if (sourceRatio > destRatio) {
      sw = sh * destRatio
      sx = sourceRect.x + (sourceRect.width - sw) / 2
    } else {
      sh = sw / destRatio
      sy = sourceRect.y + (sourceRect.height - sh) / 2
    }

    ctx.drawImage(source, sx, sy, sw, sh, destRect.x, destRect.y, destRect.width, destRect.height)
    return
  }

  let dw = destRect.width
  let dh = destRect.height
  let dx = destRect.x
  let dy = destRect.y

  if (sourceRatio > destRatio) {
    dh = dw / sourceRatio
    dy = destRect.y + (destRect.height - dh) / 2
  } else {
    dw = dh * sourceRatio
    dx = destRect.x + (destRect.width - dw) / 2
  }

  ctx.drawImage(source, sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height, dx, dy, dw, dh)
}

export function drawMediaStatus(
  ctx: CanvasRenderingContext2D,
  layout: { x: number; y: number; width: number; height: number },
  title: string,
  name: string
): void {
  const x = layout.x
  const y = layout.y
  const w = Math.max(1, layout.width)
  const h = Math.max(1, layout.height)

  ctx.save()

  // Subtle dark gradient panel
  const bg = ctx.createLinearGradient(x, y, x, y + h)
  bg.addColorStop(0, 'rgba(22, 24, 32, 0.95)')
  bg.addColorStop(1, 'rgba(12, 13, 18, 0.95)')
  ctx.fillStyle = bg
  ctx.fillRect(x, y, w, h)

  // Hairline inner border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)

  // Buffering spinner — sized relative to the smaller edge so it always fits
  const cx = x + w / 2
  const cy = y + h / 2
  const minEdge = Math.min(w, h)
  const radius = Math.max(8, Math.min(minEdge * 0.18, 56))
  const lineWidth = Math.max(2, radius * 0.18)
  const t = performance.now() / 1000

  // Track ring
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
  ctx.lineWidth = lineWidth
  ctx.stroke()

  // Spinning arc — uses time-based rotation so it animates regardless of frame rate
  const sweep = Math.PI * 1.25
  const rot = (t * 1.8) % (Math.PI * 2)
  ctx.beginPath()
  ctx.arc(cx, cy, radius, rot, rot + sweep)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.lineCap = 'round'
  ctx.lineWidth = lineWidth
  ctx.stroke()

  // Small accent dot at the leading edge of the spinner
  const dotX = cx + Math.cos(rot + sweep) * radius
  const dotY = cy + Math.sin(rot + sweep) * radius
  ctx.beginPath()
  ctx.arc(dotX, dotY, lineWidth * 0.55, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  // Labels — only show when there's room below the spinner
  const labelTop = cy + radius + Math.max(12, radius * 0.35)
  const labelFontSize = Math.max(11, Math.min(16, minEdge / 22))
  if (labelTop + labelFontSize * 2.4 < y + h - 8) {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
    ctx.font = `600 ${labelFontSize}px Inter, Arial, sans-serif`
    const titleText = title === 'WAITING' ? 'Connecting' : title.charAt(0) + title.slice(1).toLowerCase()
    ctx.fillText(titleText, cx, labelTop)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)'
    ctx.font = `500 ${labelFontSize * 0.78}px Inter, Arial, sans-serif`
    ctx.fillText(name, cx, labelTop + labelFontSize * 1.35)
  }

  ctx.restore()
}

export function drawAndCacheMediaFrame(
  ctx: CanvasRenderingContext2D,
  cache: Record<string, CachedMediaFrame>,
  id: string,
  video: HTMLVideoElement,
  layout: { x: number; y: number; width: number; height: number },
  frameCount: number,
  crop?: Crop,
  cacheEveryFrames = 1,
  fitMode: SourceFitMode = 'contain'
): void {
  // Draw live media through a per-source surface. This avoids transient GPU
  // read hiccups from punching through as black/flicker on the composited scene.
  const width = Math.max(1, Math.round(layout.width))
  const height = Math.max(1, Math.round(layout.height))
  const cached = getCachedMediaFrame(cache, id, width, height)
  const refreshInterval = Math.max(1, Math.round(cacheEveryFrames))
  const shouldRefreshCache = !cached.lastUpdateAt || frameCount % refreshInterval === 0

  if (shouldRefreshCache) {
    resetMediaFrameContext(cached.ctx)
    cached.ctx.clearRect(0, 0, width, height)
    drawVideoFrame(cached.ctx, video, { x: 0, y: 0, width, height }, crop, fitMode)
    cached.lastUpdateAt = performance.now()
  }

  ctx.drawImage(
    cached.canvas,
    layout.x,
    layout.y,
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
  crop?: Crop,
  fitMode: SourceFitMode = 'contain'
): void {
  drawFittedSource(ctx, video, croppedSourceRect(video.videoWidth, video.videoHeight, crop), layout, fitMode)
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
    // base64url: raw '+' in a query string decodes as a space server-side,
    // which silently corrupted the config override for OBS browser sources.
    const encodedConfig = btoa(unescape(encodeURIComponent(JSON.stringify(layer.config || {}))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    return `http://127.0.0.1:${overlayPort}/overlay/${layer.config.widgetId}?config=${encodedConfig}`
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

  const surface = { width, height }
  cache[id] = surface
  return surface
}


export function resolveBrowserCaptureSettings(layer: StudioLayer, width: number, height: number): { width: number; height: number; fps: number } {
  const sourceWidth = Math.max(16, tiktokWidgetCaptureMinWidth(layer), Math.round(width || 1280))
  const sourceHeight = Math.max(16, tiktokWidgetCaptureMinHeight(layer), Math.round(height || 720))
  const edgeScale = Math.min(BROWSER_SOURCE_CAPTURE_MAX_EDGE / sourceWidth, BROWSER_SOURCE_CAPTURE_MAX_EDGE / sourceHeight)
  const pixelScale = Math.sqrt(BROWSER_SOURCE_CAPTURE_MAX_PIXELS / (sourceWidth * sourceHeight))
  const scale = Math.min(1, edgeScale, pixelScale)

  return {
    width: Math.max(16, Math.round(sourceWidth * scale)),
    height: Math.max(16, Math.round(sourceHeight * scale)),
    fps: clampBrowserSourceFps(layer.config?.fps)
  }
}

function tiktokWidgetCaptureMinWidth(layer: StudioLayer): number {
  if (isChatWidgetLayer(layer)) return CHAT_WIDGET_CAPTURE_MIN_WIDTH
  if (isLikesTrackerWidgetLayer(layer)) return LIKES_TRACKER_CAPTURE_MIN_WIDTH
  if (isLeaderboardWidgetLayer(layer)) return LEADERBOARD_CAPTURE_MIN_WIDTH
  return 0
}

function tiktokWidgetCaptureMinHeight(layer: StudioLayer): number {
  if (isChatWidgetLayer(layer)) return CHAT_WIDGET_CAPTURE_MIN_HEIGHT
  if (isLikesTrackerWidgetLayer(layer)) return LIKES_TRACKER_CAPTURE_MIN_HEIGHT
  if (isLeaderboardWidgetLayer(layer)) return LEADERBOARD_CAPTURE_MIN_HEIGHT
  return 0
}

function isChatWidgetLayer(layer: StudioLayer): boolean {
  if (layer.type !== 'widget') return false
  const widgetType = String(layer.config?.widgetType || layer.config?.type || '').toLowerCase()
  const widgetId = String(layer.config?.widgetId || '').toLowerCase()
  const name = String(layer.name || '').toLowerCase()
  return (
    widgetType === 'chat' ||
    widgetType === 'chat-unified' ||
    widgetId === 'chat' ||
    widgetId === 'chat-unified' ||
    widgetId === 'unified-chat' ||
    name.includes('unified chat') ||
    name.includes('chat widget') ||
    name === 'chat'
  )
}

function isLikesTrackerWidgetLayer(layer: StudioLayer): boolean {
  if (layer.type !== 'widget') return false
  const widgetType = String(layer.config?.widgetType || layer.config?.type || '').toLowerCase()
  const name = String(layer.name || '').toLowerCase()
  return widgetType === 'likes-tracker' || name.includes('like tracker') || name.includes('top likers')
}

function isLeaderboardWidgetLayer(layer: StudioLayer): boolean {
  if (layer.type !== 'widget') return false
  const widgetType = String(layer.config?.widgetType || layer.config?.type || '').toLowerCase()
  const widgetId = String(layer.config?.widgetId || '').toLowerCase()
  const name = String(layer.name || '').toLowerCase()
  return (
    widgetType === 'leaderboard' ||
    widgetId === 'leaderboard' ||
    name.includes('leaderboard') ||
    name.includes('likeathon')
  )
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

export function traceShapePath(
  ctx: CanvasRenderingContext2D,
  type: string,
  x: number,
  y: number,
  r: number,
  w: number,
  h: number,
  cornerRadius: number,
  cutDepth?: number
): void {
  ctx.beginPath()
  if (type === 'circle') {
    ctx.arc(x, y, r, 0, Math.PI * 2)
  } else if (type === 'star') {
    const spikes = 5; const outerRadius = r
    const depth = Math.max(0, Math.min(100, cutDepth ?? 35))
    const innerRadius = r * (0.72 - depth * 0.0035)
    let rot = Math.PI / 2 * 3; const step = Math.PI / spikes
    ctx.moveTo(x, y - outerRadius)
    for (let i = 0; i < spikes; i++) {
      let curX = x + Math.cos(rot) * outerRadius; let curY = y + Math.sin(rot) * outerRadius
      ctx.lineTo(curX, curY); rot += step
      curX = x + Math.cos(rot) * innerRadius; curY = y + Math.sin(rot) * innerRadius
      ctx.lineTo(curX, curY); rot += step
    }
    ctx.lineTo(x, y - outerRadius); ctx.closePath()
  } else if (type === 'heart') {
    const heartW = r * 1.02
    const heartH = r * 1.12
    const depth = Math.max(0, Math.min(100, cutDepth ?? 12))
    const notchY = y - heartH * (0.52 - depth * 0.0034)
    ctx.moveTo(x, y + heartH * 0.5)
    ctx.bezierCurveTo(x - heartW * 0.98, y - heartH * 0.02, x - heartW * 0.92, y - heartH * 0.54, x - heartW * 0.38, y - heartH * 0.54)
    ctx.bezierCurveTo(x - heartW * 0.16, y - heartH * 0.54, x - heartW * 0.05, notchY, x, notchY)
    ctx.bezierCurveTo(x + heartW * 0.05, notchY, x + heartW * 0.16, y - heartH * 0.54, x + heartW * 0.38, y - heartH * 0.54)
    ctx.bezierCurveTo(x + heartW * 0.92, y - heartH * 0.54, x + heartW * 0.98, y - heartH * 0.02, x, y + heartH * 0.5)
    ctx.closePath()
  } else if (type === 'hexagon') {
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 3
      const px = x + r * Math.cos(a)
      const py = y + r * Math.sin(a)
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
  } else if (type === 'diamond') {
    ctx.moveTo(x - r * 0.42, y - r * 0.72)
    ctx.lineTo(x + r * 0.42, y - r * 0.72)
    ctx.lineTo(x + r * 0.92, y - r * 0.12)
    ctx.lineTo(x, y + r)
    ctx.lineTo(x - r * 0.92, y - r * 0.12)
    ctx.closePath()
  } else if (type === 'square') {
    const size = Math.min(w, h)
    const rx = x - size / 2; const ry = y - size / 2
    if ((ctx as any).roundRect) (ctx as any).roundRect(rx, ry, size, size, cornerRadius)
    else ctx.rect(rx, ry, size, size)
  } else {
    const rx = x - w / 2; const ry = y - h / 2
    if ((ctx as any).roundRect) (ctx as any).roundRect(rx, ry, w, h, cornerRadius)
    else ctx.rect(rx, ry, w, h)
  }
}

export function shapeMaskExtents(type: string, r: number, w: number, h: number): { left: number; right: number; top: number; bottom: number } {
  if (type === 'heart') {
    const heartW = r * 1.02
    const heartH = r * 1.12
    return {
      left: heartW * 0.98,
      right: heartW * 0.98,
      top: heartH * 0.54,
      bottom: heartH * 0.5
    }
  }

  if (type === 'square') {
    const size = Math.min(w, h)
    return { left: size / 2, right: size / 2, top: size / 2, bottom: size / 2 }
  }

  if (type === 'rect' || type === 'none') {
    return { left: w / 2, right: w / 2, top: h / 2, bottom: h / 2 }
  }

  if (type === 'diamond') {
    return { left: r * 0.92, right: r * 0.92, top: r * 0.72, bottom: r }
  }

  return { left: r, right: r, top: r, bottom: r }
}

export function clampShapeMaskTransform<T extends { type?: string; x?: number; y?: number; scale?: number }>(
  shape: T,
  sourceWidth: number,
  sourceHeight: number
): T & { x: number; y: number; scale: number } {
  const type = shape.type || 'none'
  const minScale = 10
  const requestedScale = Number.isFinite(shape.scale) ? Number(shape.scale) : 100
  let scale = Math.max(minScale, Math.min(250, requestedScale))

  const extentsForScale = (nextScale: number) => {
    const w = (nextScale / 100) * sourceWidth
    const h = (nextScale / 100) * sourceHeight
    return shapeMaskExtents(type, Math.min(w, h) / 2, w, h)
  }

  const padding = Math.max(4, Math.min(sourceWidth, sourceHeight) * 0.012)
  const withPadding = (extents: { left: number; right: number; top: number; bottom: number }) => ({
    left: extents.left + padding,
    right: extents.right + padding,
    top: extents.top + padding,
    bottom: extents.bottom + padding
  })

  let extents = withPadding(extentsForScale(scale))
  const fitScale = Math.min(
    1,
    sourceWidth / Math.max(1, extents.left + extents.right),
    sourceHeight / Math.max(1, extents.top + extents.bottom)
  )
  if (fitScale < 1) {
    scale = Math.max(minScale, scale * fitScale)
    extents = withPadding(extentsForScale(scale))
  }

  const minX = (extents.left / sourceWidth) * 100
  const maxX = 100 - (extents.right / sourceWidth) * 100
  const minY = (extents.top / sourceHeight) * 100
  const maxY = 100 - (extents.bottom / sourceHeight) * 100
  const requestedX = Number.isFinite(shape.x) ? Number(shape.x) : 50
  const requestedY = Number.isFinite(shape.y) ? Number(shape.y) : 50

  return {
    ...shape,
    x: minX <= maxX ? Math.max(minX, Math.min(maxX, requestedX)) : 50,
    y: minY <= maxY ? Math.max(minY, Math.min(maxY, requestedY)) : 50,
    scale
  }
}

export function resolveShapeMaskBounds(
  shape: { type?: string; x?: number; y?: number; scale?: number },
  sourceWidth: number,
  sourceHeight: number
): { x: number; y: number; width: number; height: number } | null {
  const shapeObj = clampShapeMaskTransform(shape, sourceWidth, sourceHeight)
  const type = shapeObj.type || 'none'
  if (type === 'none' || type === 'rect') return null

  const sw = (shapeObj.scale / 100) * sourceWidth
  const sh = (shapeObj.scale / 100) * sourceHeight
  const r = Math.min(sw, sh) / 2
  const extents = shapeMaskExtents(type, r, sw, sh)
  const centerX = (shapeObj.x / 100) * sourceWidth
  const centerY = (shapeObj.y / 100) * sourceHeight

  return {
    x: centerX - extents.left,
    y: centerY - extents.top,
    width: extents.left + extents.right,
    height: extents.top + extents.bottom
  }
}

export interface ShapeBorderStrokeConfig {
  type?: 'chroma' | 'cyber' | 'gob-the-stopper' | 'solid' | 'custom' | string
  thickness?: number
  color?: string
  color1?: string
  color2?: string
  opacity?: number
  speed?: number
  audioReactive?: boolean
  reactivity?: number
}

export function applyShapeBorderStroke(
  ctx: CanvasRenderingContext2D,
  border: ShapeBorderStrokeConfig,
  bounds: { x: number; y: number; r: number },
  options: { thicknessScale?: number } = {}
): void {
  const vol = (window as any).__masterVolume || 0
  const sensitivity = (border.reactivity ?? 100) / 100
  const reactiveScale = border.audioReactive ? 1 + (vol * 1.5 * sensitivity) : 1
  const thicknessScale = options.thicknessScale ?? 1
  const speed = Math.max(1, border.speed ?? 6)
  const phase = (performance.now() / (speed * 1000)) * 360
  const { x, y, r } = bounds

  ctx.lineWidth = Math.max(1, border.thickness || 4) * thicknessScale * reactiveScale
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.globalAlpha = Math.min(1, ((border.opacity ?? 100) / 100) * (border.audioReactive ? 0.8 + vol * 0.4 : 1))

  if (border.type === 'chroma') {
    const grad = ctx.createLinearGradient(x - r, y - r, x + r, y + r)
    grad.addColorStop(0, `hsl(${phase % 360}, 100%, 50%)`)
    grad.addColorStop(0.33, `hsl(${(phase + 120) % 360}, 100%, 50%)`)
    grad.addColorStop(0.66, `hsl(${(phase + 240) % 360}, 100%, 50%)`)
    grad.addColorStop(1, `hsl(${(phase + 360) % 360}, 100%, 50%)`)
    ctx.strokeStyle = grad
    ctx.shadowBlur = 16 * reactiveScale
    ctx.shadowColor = `hsl(${phase % 360}, 100%, 50%)`
  } else if (border.type === 'cyber') {
    const grad = ctx.createLinearGradient(x - r, y, x + r, y)
    grad.addColorStop(0, '#19c8ff')
    grad.addColorStop(0.5, '#00ffff')
    grad.addColorStop(1, '#d035f1')
    ctx.strokeStyle = grad
    ctx.shadowBlur = 20 * reactiveScale
    ctx.shadowColor = '#d035f1'
  } else if (border.type === 'gob-the-stopper') {
    const grad = ctx.createLinearGradient(x - r, y - r, x + r, y + r)
    grad.addColorStop(0, '#b6ff00')
    grad.addColorStop(0.28, '#f7ffe8')
    grad.addColorStop(0.5, '#050505')
    grad.addColorStop(0.72, '#8fd400')
    grad.addColorStop(1, '#b6ff00')
    ctx.strokeStyle = grad
    ctx.shadowBlur = 18 * reactiveScale
    ctx.shadowColor = '#b6ff00'
  } else if (border.type === 'custom') {
    const color1 = border.color1 || '#19c8ff'
    const color2 = border.color2 || '#d035f1'
    const grad = ctx.createLinearGradient(x - r, y - r, x + r, y + r)
    grad.addColorStop(0, color1)
    grad.addColorStop(0.5, color2)
    grad.addColorStop(1, color1)
    ctx.strokeStyle = grad
    ctx.shadowBlur = 16 * reactiveScale
    ctx.shadowColor = color2
  } else {
    ctx.strokeStyle = border.color || '#ffffff'
  }
}

