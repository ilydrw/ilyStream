import { WIDGET_TEMPLATES, type WidgetTemplate } from './constants'
import { type Widget, type WidgetType } from '../../../shared/widgets'

type WidgetConfigRecord = Record<string, unknown>
type WidgetPreviewAspectRatio = 'auto' | 'tiktok' | 'landscape'

export interface WidgetPreviewFrame {
  aspectRatio: '9 / 16' | '16 / 9'
  isVertical: boolean
  resolutionLabel: string
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

export function buildWidgetOverlayUrl(widgetId: string, overlayPort: number | null): string | null {
  if (!overlayPort) return null
  return `http://127.0.0.1:${overlayPort}/overlay/${widgetId}`
}

export function buildWidgetPreviewUrl(
  widget: Pick<Widget, 'id' | 'config'>,
  overlayPort: number | null,
  config = widget.config
): string | null {
  const baseUrl = buildWidgetOverlayUrl(widget.id, overlayPort)
  if (!baseUrl) return null

  try {
    const encodedConfig = encodePreviewConfig(config)
    return `${baseUrl}?config=${encodedConfig}&preview=1`
  } catch {
    return appendPreviewFlag(baseUrl)
  }
}

export function appendPreviewFlag(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}preview=1`
}

export function getWidgetPreviewFrame(config: unknown): WidgetPreviewFrame {
  const aspectRatio = getWidgetAspectRatio(config)

  if (aspectRatio === 'tiktok') {
    return {
      aspectRatio: '9 / 16',
      isVertical: true,
      resolutionLabel: '1080 x 1920'
    }
  }

  return {
    aspectRatio: '16 / 9',
    isVertical: false,
    resolutionLabel: aspectRatio === 'landscape' ? '1920 x 1080' : 'Responsive canvas'
  }
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
