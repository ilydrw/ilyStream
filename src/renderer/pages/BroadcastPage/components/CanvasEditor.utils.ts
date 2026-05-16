import type { StudioLayer } from '../../../../shared/studio'
import type { BrowserFrameSurface, CachedMediaFrame, Crop } from './CanvasEditor.types'

export const BROWSER_SOURCE_CAPTURE_MAX_EDGE = 1920
export const BROWSER_SOURCE_CAPTURE_MAX_PIXELS = 1920 * 1080
export const BROWSER_SOURCE_CAPTURE_MAX_FPS = 60
export const BROWSER_SOURCE_CAPTURE_DEFAULT_FPS = 60

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
  crop?: Crop
): void {
  if (!crop) {
    ctx.drawImage(video, layout.x, layout.y, layout.width, layout.height)
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
    layout.x,
    layout.y,
    layout.width,
    layout.height
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

export function traceShapePath(
  ctx: CanvasRenderingContext2D,
  type: string,
  x: number,
  y: number,
  r: number,
  w: number,
  h: number,
  cornerRadius: number
): void {
  ctx.beginPath()
  if (type === 'circle') {
    ctx.arc(x, y, r, 0, Math.PI * 2)
  } else if (type === 'star') {
    const spikes = 5; const outerRadius = r; const innerRadius = r / 2.5
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
    const d = r * 2.2; const hx = x; const hy = y - d / 4
    ctx.moveTo(hx, hy + d / 4)
    ctx.bezierCurveTo(hx, hy + d / 4, hx - d / 2, hy, hx - d / 2, hy - d / 4)
    ctx.bezierCurveTo(hx - d / 2, hy - d / 2, hx, hy - d / 2, hx, hy - d / 4)
    ctx.bezierCurveTo(hx, hy - d / 2, hx + d / 2, hy - d / 2, hx + d / 2, hy - d / 4)
    ctx.bezierCurveTo(hx + d / 2, hy, hx, hy + d / 4, hx, hy + d / 4); ctx.closePath()
  } else if (type === 'hexagon') {
    for (let i = 0; i < 6; i++) { ctx.lineTo(x + r * Math.cos(i * Math.PI / 3), y + r * Math.sin(i * Math.PI / 3)) }; ctx.closePath()
  } else if (type === 'diamond') {
    ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath()
  } else {
    const rx = x - w / 2; const ry = y - h / 2
    if ((ctx as any).roundRect) (ctx as any).roundRect(rx, ry, w, h, cornerRadius)
    else ctx.rect(rx, ry, w, h)
  }
}

