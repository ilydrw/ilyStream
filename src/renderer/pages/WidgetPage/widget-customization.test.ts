import { describe, expect, it } from 'vitest'

import { WIDGET_TEMPLATES } from './constants'
import {
  buildWidgetOverlayUrl,
  buildWidgetPreviewUrl,
  createWidgetFromTemplate,
  getWidgetPreviewFrame,
  normalizeOverlayHost
} from './widget-customization'
import { type SocialsConfig, type Widget } from '../../../shared/widgets'

describe('widget customization helpers', () => {
  it('creates widgets with independent default config copies', () => {
    const template = WIDGET_TEMPLATES.find((item) => item.type === 'socials')
    expect(template).toBeDefined()

    const first = createWidgetFromTemplate(template!, 'first')
    const second = createWidgetFromTemplate(template!, 'second')

    ;(first.config as SocialsConfig).accounts[0].username = '@Changed'

    expect(first.id).toBe('first')
    expect(second.id).toBe('second')
    expect((second.config as SocialsConfig).accounts[0].username).toBe('@IlyStreamer')
    expect(first.config).not.toBe(template!.defaultConfig)
    expect(second.config).not.toBe(template!.defaultConfig)
  })

  it('uses the shared overlay URL format', () => {
    expect(buildWidgetOverlayUrl('chat-1', 4211)).toBe('http://127.0.0.1:4211/overlay/chat-1')
    expect(buildWidgetOverlayUrl('chat-1', 4211, '192.168.1.50:4211')).toBe('http://192.168.1.50:4211/overlay/chat-1')
    expect(buildWidgetOverlayUrl('chat-1', null)).toBeNull()
  })

  it('normalizes overlay hosts reported by the server', () => {
    expect(normalizeOverlayHost(null, 4211)).toBe('127.0.0.1:4211')
    expect(normalizeOverlayHost('http://192.168.1.50:4211/overlay/chat', 4211)).toBe('192.168.1.50:4211')
    expect(normalizeOverlayHost('localhost', 4211)).toBe('localhost:4211')
    expect(normalizeOverlayHost('::1', 4211)).toBe('[::1]:4211')
  })

  it('builds a stable preview URL with the preview flag', () => {
    // Draft preview HTML is delivered to the iframe via postMessage in
    // `WidgetEditorModal`, not encoded into the URL, so the URL stays stable
    // for the widget's lifetime.
    const widget = {
      id: 'preview-widget',
      config: { aspectRatio: 'tiktok', title: 'Hi moon' }
    } as Widget
    const url = buildWidgetPreviewUrl(widget, 4211, 'preview-session-token')

    expect(url).not.toBeNull()
    const parsed = new URL(url!)
    expect(parsed.pathname).toBe('/overlay/preview-widget')
    expect(parsed.searchParams.get('preview')).toBe('1')
    expect(parsed.searchParams.get('previewToken')).toBe('preview-session-token')
    expect(parsed.searchParams.get('config')).toBeNull()
  })

  it('returns null when the overlay server is offline', () => {
    expect(buildWidgetPreviewUrl({ id: 'whatever' }, null, 'preview-session-token')).toBeNull()
  })

  it('returns null until a trusted preview session is available', () => {
    expect(buildWidgetPreviewUrl({ id: 'whatever' }, 4211, null)).toBeNull()
  })

  it('honors explicit aspect-ratio overrides in config', () => {
    expect(getWidgetPreviewFrame({ aspectRatio: 'tiktok' })).toMatchObject({
      aspectRatio: '1080 / 1920',
      isVertical: true,
      width: 1080,
      height: 1920
    })

    expect(getWidgetPreviewFrame({ aspectRatio: 'landscape' })).toMatchObject({
      aspectRatio: '1920 / 1080',
      isVertical: false,
      width: 1920,
      height: 1080
    })
  })

  it('treats forceTikTokDimensions as a portrait override', () => {
    expect(getWidgetPreviewFrame({ forceTikTokDimensions: true })).toMatchObject({
      isVertical: true,
      width: 1080,
      height: 1920
    })
  })

  it('picks per-type natural frames when no explicit override is set', () => {
    // Sidebar-style widget → portrait popup canvas.
    expect(
      getWidgetPreviewFrame({ type: 'chat-unified', config: {} })
    ).toMatchObject({ isVertical: true, width: 1080, height: 1920 })

    // Banner widget → short wide canvas.
    expect(
      getWidgetPreviewFrame({ type: 'follower-goal', config: {} })
    ).toMatchObject({ isVertical: false, width: 720, height: 180 })

    // Compact TLS-friendly board canvas.
    expect(
      getWidgetPreviewFrame({ type: 'likes-tracker', config: {} })
    ).toMatchObject({ isVertical: false, width: 400, height: 280 })

    // Full-screen overlay stays 16:9.
    expect(
      getWidgetPreviewFrame({ type: 'screen-border', config: {} })
    ).toMatchObject({ isVertical: false, width: 1920, height: 1080 })
  })

  it('falls back to 16:9 for unknown widget types with no override', () => {
    expect(getWidgetPreviewFrame({})).toMatchObject({
      aspectRatio: '1920 / 1080',
      isVertical: false,
      width: 1920,
      height: 1080
    })
  })
})
