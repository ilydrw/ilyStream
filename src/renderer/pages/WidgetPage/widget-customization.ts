import { WIDGET_TEMPLATES, type WidgetTemplate } from './constants'
import { type Widget, type WidgetType } from '../../../shared/widgets'

type WidgetConfigRecord = Record<string, unknown>
type WidgetPreviewAspectRatio = 'auto' | 'tiktok' | 'landscape'

export interface WidgetPreviewFrame {
  /** CSS `aspect-ratio` value — e.g. `"16 / 9"` or `"480 / 720"`. */
  aspectRatio: string
  /** True when the canvas is taller than it is wide. Drives modal CSS branching. */
  isVertical: boolean
  /** Human-readable label like `"1920 × 1080"` shown under the preview. */
  resolutionLabel: string
  /** Natural canvas width in pixels (for `resolutionLabel` + downstream sizing). */
  width: number
  /** Natural canvas height in pixels. */
  height: number
}

/**
 * Per-widget natural canvas dimensions. These mirror the browser-source
 * dimensions a streamer would typically use in OBS for each widget type, so
 * the editor preview looks like what the user will actually composite.
 *
 * Widgets whose config exposes `aspectRatio: 'tiktok' | 'landscape'` or
 * `forceTikTokDimensions: true` override this map at preview time.
 */
const WIDGET_NATURAL_FRAMES: Partial<Record<WidgetType, { width: number; height: number }>> = {
  // Full-screen overlays — these widgets paint across the whole browser source.
  alerts: { width: 1920, height: 1080 },
  chat: { width: 1920, height: 1080 },
  'event-particles': { width: 1920, height: 1080 },
  'falling-roses': { width: 1080, height: 1920 },
  particles: { width: 1920, height: 1080 },
  'node-network': { width: 1920, height: 1080 },
  physics: { width: 1920, height: 1080 },
  'screen-border': { width: 1920, height: 1080 },

  // Bar / banner widgets — short and wide.
  goal: { width: 720, height: 160 },
  'follower-goal': { width: 720, height: 180 },
  socials: { width: 720, height: 140 },
  'discord-promo': { width: 520, height: 160 },

  // Notification cards — small horizontal rectangles.
  'latest-gifter': { width: 520, height: 180 },
  'now-playing': { width: 560, height: 220 },
  'likes-tracker': { width: 400, height: 280 },

  // Sidebar / portrait widgets.
  'chat-unified': { width: 480, height: 720 },
  leaderboard: { width: 440, height: 640 }
}

const FULLSCREEN_LANDSCAPE = { width: 1920, height: 1080 } as const
const FULLSCREEN_PORTRAIT = { width: 1080, height: 1920 } as const

function makePreviewFrame(width: number, height: number): WidgetPreviewFrame {
  return {
    width,
    height,
    aspectRatio: `${width} / ${height}`,
    isVertical: height > width,
    resolutionLabel: `${width} × ${height}`
  }
}

export function getWidgetTemplate(type: WidgetType): WidgetTemplate | undefined {
  return WIDGET_TEMPLATES.find((template) => template.type === type)
}

export function cloneWidgetConfig(config: WidgetConfigRecord): WidgetConfigRecord {
  if (typeof structuredClone === 'function') {
    return structuredClone(config)
  }

  return JSON.parse(JSON.stringify(config)) as WidgetConfigRecord
}

export function createWidgetFromTemplate(template: WidgetTemplate, id = crypto.randomUUID()): Widget {
  return {
    id,
    name: template.label,
    type: template.type,
    config: cloneWidgetConfig(template.defaultConfig)
  }
}

export function buildWidgetOverlayUrl(
  widgetId: string,
  overlayPort: number | null,
  overlayHost?: string | null
): string | null {
  if (!overlayPort) return null
  return `http://${normalizeOverlayHost(overlayHost, overlayPort)}/overlay/${widgetId}`
}

/**
 * Build the URL the editor iframe loads. The iframe stays on this URL for the
 * widget's lifetime — config updates are delivered via `postMessage` (see
 * `WidgetEditorModal`), which avoids the full-document reload that swapping
 * `iframe.src` would trigger.
 */
export function buildWidgetPreviewUrl(
  widget: Pick<Widget, 'id'>,
  overlayPort: number | null
): string | null {
  const baseUrl = buildWidgetOverlayUrl(widget.id, overlayPort)
  if (!baseUrl) return null
  return appendPreviewFlag(baseUrl)
}

export function normalizeOverlayHost(host: string | null | undefined, port: number): string {
  const raw = String(host || '').trim()
  if (!raw) return `127.0.0.1:${port}`

  let value = raw.replace(/^https?:\/\//i, '')
  const slashIndex = value.indexOf('/')
  if (slashIndex >= 0) value = value.slice(0, slashIndex)
  value = value.trim()
  if (!value) return `127.0.0.1:${port}`

  const colonCount = (value.match(/:/g) || []).length
  if (value.startsWith('[') && value.includes(']:')) return value
  if (colonCount === 1 && /:\d+$/.test(value)) return value
  if (colonCount > 1) return `[${value}]:${port}`
  return `${value}:${port}`
}

export function appendPreviewFlag(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}preview=1`
}

/**
 * Pick a preview canvas for a widget. Explicit config choices win, then we
 * fall back to a per-type natural frame, then a sensible landscape default.
 *
 * Accepts either the full widget or its config alone — the config-only form
 * exists because some templates only had access to the config object.
 */
export function getWidgetPreviewFrame(
  widgetOrConfig: Pick<Widget, 'type' | 'config'> | unknown
): WidgetPreviewFrame {
  const { type, config } = normalizeFrameInput(widgetOrConfig)
  const aspectRatio = getWidgetAspectRatio(config)
  const forceTikTok = isForceTikTok(config)

  if (forceTikTok || aspectRatio === 'tiktok') {
    return makePreviewFrame(FULLSCREEN_PORTRAIT.width, FULLSCREEN_PORTRAIT.height)
  }

  if (aspectRatio === 'landscape') {
    return makePreviewFrame(FULLSCREEN_LANDSCAPE.width, FULLSCREEN_LANDSCAPE.height)
  }

  if (type) {
    const natural = WIDGET_NATURAL_FRAMES[type]
    if (natural) return makePreviewFrame(natural.width, natural.height)
  }

  return makePreviewFrame(FULLSCREEN_LANDSCAPE.width, FULLSCREEN_LANDSCAPE.height)
}

function normalizeFrameInput(
  input: Pick<Widget, 'type' | 'config'> | unknown
): { type: WidgetType | null; config: unknown } {
  if (input && typeof input === 'object' && 'type' in input && 'config' in input) {
    const widget = input as Pick<Widget, 'type' | 'config'>
    return { type: widget.type, config: widget.config }
  }
  return { type: null, config: input }
}

function isForceTikTok(config: unknown): boolean {
  if (!config || typeof config !== 'object') return false
  return (config as { forceTikTokDimensions?: unknown }).forceTikTokDimensions === true
}

export function encodePreviewConfig(config: unknown): string {
  const json = JSON.stringify(config ?? {})
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  const chunkSize = 0x8000

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }

  return btoa(binary)
}

function getWidgetAspectRatio(config: unknown): WidgetPreviewAspectRatio {
  if (!config || typeof config !== 'object') return 'auto'

  const value = (config as { aspectRatio?: unknown }).aspectRatio
  if (value === 'tiktok' || value === 'landscape') return value
  return 'auto'
}
