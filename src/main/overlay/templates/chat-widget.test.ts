import { describe, expect, it } from 'vitest'
import { DEFAULT_CHAT_UNIFIED_CONFIG } from '../../../shared/widgets'
import { buildChatWidgetHtml } from './chat-widget'

describe('unified chat widget', () => {
  it('uses TikTok pink for TikTok messages and preview content', () => {
    const html = buildChatWidgetHtml({ config: DEFAULT_CHAT_UNIFIED_CONFIG }, true)

    expect(html).toContain("tiktok: '#FE2C55'")
    expect(html).toContain("accentColor: '#FE2C55'")
  })

  it('expires messages from their event timestamp so snapshots cannot revive them', () => {
    const html = buildChatWidgetHtml({
      config: { ...DEFAULT_CHAT_UNIFIED_CONFIG, fadeOutAfterSeconds: 45 }
    })

    expect(html).toContain('const FADE_OUT_MS = 45000;')
    expect(html).toContain("const timestamp = Date.parse(String(msg.timestamp || ''));")
    expect(html).toContain('return Math.max(0, FADE_OUT_MS - age);')
    expect(html).toContain('clearMessageTimeouts();\n            feed.innerHTML =')
    expect(html).toContain('}, remainingLifetimeMs);')
  })

  it('keeps the lifetime configurable, including never and the safe upper bound', () => {
    expect(DEFAULT_CHAT_UNIFIED_CONFIG.fadeOutAfterSeconds).toBe(30)
    expect(buildChatWidgetHtml({ config: { fadeOutAfterSeconds: 0 } })).toContain('const FADE_OUT_MS = 0;')
    expect(buildChatWidgetHtml({ config: { fadeOutAfterSeconds: 999 } })).toContain('const FADE_OUT_MS = 120000;')
  })

  it('adds opaque ilyStream chrome only for the OBS dock variant', () => {
    const overlay = buildChatWidgetHtml({ config: DEFAULT_CHAT_UNIFIED_CONFIG })
    const dock = buildChatWidgetHtml({
      config: { ...DEFAULT_CHAT_UNIFIED_CONFIG, dockMode: true }
    })

    expect(overlay).toContain('data-dock-mode="0"')
    expect(overlay).toContain('background: transparent !important')
    expect(overlay).not.toContain('<header class="dock-header">')

    expect(dock).toContain('data-dock-mode="1"')
    expect(dock).toContain('background: #080d16 !important')
    expect(dock).toContain('<header class="dock-header">')
    expect(dock).toContain('<div class="dock-title">ilyStream Chat</div>')
    expect(dock).toContain('id="dock-connection" data-state="connecting"')
    expect(dock).toContain('Chat is quiet')
    expect(dock).toContain('All platforms')
  })

  it('uses a stable compact dock runtime without inheriting overlay expiry or scale', () => {
    const dock = buildChatWidgetHtml({
      config: {
        ...DEFAULT_CHAT_UNIFIED_CONFIG,
        dockMode: true,
        fadeOutAfterSeconds: 45,
        maxItems: 2,
        scale: 2.5,
        fontSize: 30
      }
    })

    expect(dock).toContain('const MAX_MESSAGES = 80;')
    expect(dock).toContain('const FADE_OUT_MS = 0;')
    expect(dock).toContain('--feed-scale: 1;')
    expect(dock).toContain('--font-size: 18px;')
    expect(dock).toContain('overflow-y: auto')
  })

  it('keeps the display overlay lightweight and free of dock-only state', () => {
    const overlay = buildChatWidgetHtml({
      config: { ...DEFAULT_CHAT_UNIFIED_CONFIG, fadeOutAfterSeconds: 45, scale: 1.5 }
    })

    expect(overlay).toContain('const MAX_MESSAGES = 5;')
    expect(overlay).toContain('const FADE_OUT_MS = 45000;')
    expect(overlay).toContain('--feed-scale: 1.5;')
    expect(overlay).toContain('Waiting for chat messages...')
    expect(overlay).not.toContain('Chat is quiet')
  })
})
