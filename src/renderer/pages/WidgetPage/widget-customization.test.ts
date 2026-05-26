import { describe, expect, it } from 'vitest'

import { WIDGET_TEMPLATES } from './constants'
import {
  buildWidgetOverlayUrl,
  buildWidgetPreviewUrl,
  createWidgetFromTemplate,
  getWidgetPreviewFrame
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
    expect(buildWidgetOverlayUrl('chat-1', null)).toBeNull()
  })

  it('encodes preview config into the preview URL', () => {
    const widget = {
      id: 'preview-widget',
      config: { aspectRatio: 'tiktok', title: 'Hi moon' }
    } as Widget
    const url = buildWidgetPreviewUrl(widget, 4211, { title: 'Hi moon' })

    expect(url).not.toBeNull()
    const parsed = new URL(url!)
    expect(parsed.searchParams.get('preview')).toBe('1')
    expect(decodePreviewConfig(parsed.searchParams.get('config')!)).toEqual({ title: 'Hi moon' })
  })

  it('normalizes preview frames from widget aspect ratio config', () => {
    expect(getWidgetPreviewFrame({ aspectRatio: 'tiktok' })).toEqual({
      aspectRatio: '9 / 16',
      isVertical: true,
      resolutionLabel: '1080 x 1920'
    })

    expect(getWidgetPreviewFrame({ aspectRatio: 'landscape' })).toEqual({
      aspectRatio: '16 / 9',
      isVertical: false,
      resolutionLabel: '1920 x 1080'
    })

    expect(getWidgetPreviewFrame({})).toEqual({
      aspectRatio: '16 / 9',
      isVertical: false,
      resolutionLabel: 'Responsive canvas'
    })
  })
})

function decodePreviewConfig(value: string): unknown {
  const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}
