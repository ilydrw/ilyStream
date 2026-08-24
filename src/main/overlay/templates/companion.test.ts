import { existsSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { buildCompanionHtml } from './companion'

function renderCompanion(): string {
  return buildCompanionHtml({
    obsStatus: null,
    viewerCounts: {},
    latestAlerts: [],
    nowPlaying: null,
    ui: {}
  })
}

describe('DeskThing companion chat feed', () => {
  it('exposes a touch-friendly scroll container with a visible scrollbar', () => {
    const html = renderCompanion()

    expect(html).toMatch(/\.chat \.feed \{[^}]*overflow-y: scroll;[^}]*touch-action: pan-y;[^}]*-webkit-overflow-scrolling: touch;/s)
    expect(html).toMatch(/\.chat \.feed::\-webkit-scrollbar \{ width: 5px; \}/)
    expect(html).not.toContain('scrollbar-width: none')
  })

  it('bottom-aligns short chats and follows new messages after layout', () => {
    const html = renderCompanion()

    expect(html).toContain('.chat .feed > .msg:first-child { margin-top: auto; }')
    expect(html).toContain('function scheduleChatScrollToBottom(force = false)')
    expect(html).toContain('if (chatScrollFrame) return;')
    expect(html).toContain('chatScrollFrame = requestAnimationFrame(() => {')
    expect(html).not.toContain('cancelAnimationFrame(chatScrollFrame)')
    expect(html).toContain('feedEl.scrollTop = feedEl.scrollHeight;')
    expect(html).toContain('const chatResizeObserver = new ResizeObserver(() => scheduleChatScrollToBottom());')
  })

  it('renders platform emote images with readable text fallbacks', () => {
    const html = renderCompanion()

    expect(html).toContain("function renderChatMessage(container, item)")
    expect(html).toContain("appendEmoteImage(container, safeImageUrl(emote.imageUrl), fallback);")
    expect(html).toContain("return '[TikTok Fan Club emote]';")
    expect(html).toContain("image.replaceWith(document.createTextNode(fallback))")
    expect(html).toContain('.msg .emote {')
  })

  it('uses bundled image art for TikTok shortcodes and Unicode emoji', () => {
    const html = renderCompanion()

    expect(html).toContain('/overlay/companion/emoji/emoji_u1f602.svg')
    expect(html).toContain('/overlay/companion/emoji/emoji_u1f60d.svg')
    expect(html).toContain("function resolveTikTokShortcodeAsset(shortcode)")
    expect(html).toContain("function appendTikTokUnicodeEmoji(container, text)")
    expect(html).toContain("const shortcodePattern = /\\[([^\\[\\]\\r\\n]{1,48})\\]/g;")

    const assetNames = new Set(
      Array.from(html.matchAll(/\/overlay\/companion\/emoji\/(emoji_u[0-9a-f_]+\.svg)/g))
        .map((match) => match[1])
    )
    expect(assetNames.size).toBeGreaterThan(30)
    for (const assetName of assetNames) {
      expect(existsSync(join(process.cwd(), 'resources', 'companion-emojis', assetName))).toBe(true)
    }
  })
})
