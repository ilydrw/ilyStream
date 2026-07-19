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
})
