import { describe, expect, it } from 'vitest'
import type { Widget, WidgetType } from '../../../shared/widgets'
import { buildCompanionHtml } from './companion'
import { generateOverlayHtml, getDefaultWidgetConfig } from '../widget-renderers'

const widgetTypes: WidgetType[] = [
  'chat',
  'alerts',
  'goal',
  'follower-goal',
  'socials',
  'now-playing',
  'screen-border',
  'event-particles',
  'falling-roses',
  'particles',
  'discord-promo',
  'node-network',
  'latest-gifter',
  'physics',
  'leaderboard',
  'chat-unified',
  'likes-tracker'
]

const context = { settings: {}, boardSounds: [], deckActions: [] }
const hardcodedRemoteElement = /<(?:script|link|img)\b[^>]*(?:src|href)\s*=\s*["']https?:\/\//i
const remoteCssAsset = /(?:@import\s+url|url\()[^)]*https?:\/\//i
const forbiddenRuntimeHosts = /(?:fonts\.googleapis|fonts\.gstatic|cdnjs\.cloudflare|api\.dicebear|via\.placeholder)\.com/i

function expectOfflineSafe(html: string): void {
  expect(html).not.toMatch(hardcodedRemoteElement)
  expect(html).not.toMatch(remoteCssAsset)
  expect(html).not.toMatch(forbiddenRuntimeHosts)
}

describe('offline-safe overlay templates', () => {
  it.each(widgetTypes)('renders %s without hardcoded remote assets', type => {
    const widget = {
      id: `offline-${type}`,
      name: type,
      type,
      config: getDefaultWidgetConfig(type)
    } as Widget
    const html = generateOverlayHtml(widget, true, context)

    expect(html).not.toBeNull()
    expectOfflineSafe(html!)
  })

  it('keeps the DeskThing companion free of hardcoded remote assets', () => {
    const html = buildCompanionHtml({
      obsStatus: null,
      viewerCounts: {},
      latestAlerts: [],
      nowPlaying: null,
      ui: {}
    })

    expectOfflineSafe(html)
  })

  it('loads the physics engine from ilyStream itself', () => {
    const widget = {
      id: 'offline-physics',
      name: 'Physics',
      type: 'physics',
      config: getDefaultWidgetConfig('physics')
    } as Widget
    const html = generateOverlayHtml(widget, false, context)

    expect(html).toContain('<script src="/overlay/vendor/matter.min.js"></script>')
  })
})
