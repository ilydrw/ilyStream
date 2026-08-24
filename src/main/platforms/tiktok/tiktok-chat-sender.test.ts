import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildTikTokLiveChatUrl,
  describeTikTokSenderStatus,
  getTikTokSenderCooldownMs,
  hasTikTokSendCredentials,
  isSafeNavigationUrl,
  isTikTokBlockedAppProtocol,
  isTikTokLiveChatUrl,
  isTikTokOwnedWebUrl,
  pickTikTokCredentialsFromCookies,
  sendMessageInTikTokPage,
  TikTokChatSender,
  validateTikTokSenderMessage
} from './tiktok-chat-sender'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('TikTokChatSender refresh lifecycle', () => {
  it('does not accumulate script probes while the sender page is loading or stalled', async () => {
    vi.useFakeTimers()

    let resolveProbe: ((value: unknown) => void) | undefined
    const probe = new Promise((resolve) => {
      resolveProbe = resolve
    })
    const executeJavaScript = vi.fn().mockReturnValue(probe)
    const isLoadingMainFrame = vi.fn().mockReturnValue(true)
    const sender = new TikTokChatSender()

    ;(sender as any).window = {
      isDestroyed: () => false,
      webContents: {
        isLoadingMainFrame,
        executeJavaScript,
        session: {
          cookies: { get: vi.fn().mockResolvedValue([]) }
        }
      }
    }

    // Electron itself waits on did-stop-loading when executeJavaScript is
    // called during navigation. Polling must not create those waiters at all.
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await (sender as any).requestSenderRefresh()
    }
    expect(executeJavaScript).not.toHaveBeenCalled()

    // Once a probe starts, its real promise remains the shared in-flight guard.
    // Advancing beyond the old wrapper timeout must not permit another probe.
    isLoadingMainFrame.mockReturnValue(false)
    const firstRefresh = (sender as any).requestSenderRefresh()
    await vi.advanceTimersByTimeAsync(6000)
    const secondRefresh = (sender as any).requestSenderRefresh()

    expect(secondRefresh).toBe(firstRefresh)
    expect(executeJavaScript).toHaveBeenCalledTimes(1)

    resolveProbe?.({
      currentUrl: 'https://www.tiktok.com/@creator/live',
      isOnTikTok: true,
      hasLoginPrompt: false,
      hasAccountUi: true,
      isChatReady: true
    })
    await firstRefresh
  })
})

describe('TikTokChatSender safety helpers', () => {
  it('normalizes outbound messages before sending', () => {
    expect(validateTikTokSenderMessage('  hello\n\nTikTok   chat  ')).toEqual({
      ok: true,
      text: 'hello TikTok chat'
    })
  })

  it('rejects empty and oversized outbound messages', () => {
    expect(validateTikTokSenderMessage('   ')).toEqual({
      ok: false,
      text: '',
      error: 'Cannot send an empty TikTok chat message'
    })

    expect(validateTikTokSenderMessage('a'.repeat(6), 5)).toEqual({
      ok: false,
      text: 'aaaaaa',
      error: 'TikTok chat messages are limited to 5 characters'
    })
  })

  it('computes the remaining send cooldown', () => {
    expect(getTikTokSenderCooldownMs(0, 10_000, 1500)).toBe(0)
    expect(getTikTokSenderCooldownMs(10_000, 10_500, 1500)).toBe(1000)
    expect(getTikTokSenderCooldownMs(10_000, 12_000, 1500)).toBe(0)
  })

  it('describes the next setup step from sender state', () => {
    expect(describeTikTokSenderStatus({
      isWindowOpen: false,
      isOnTikTok: false,
      isLoggedIn: false,
      isChatReady: false
    })).toBe('Open the TikTok host session')

    expect(describeTikTokSenderStatus({
      isWindowOpen: true,
      isOnTikTok: true,
      isLoggedIn: true,
      isChatReady: false,
      hasSendCredentials: false
    })).toBe('TikTok is signed in; opening your public LIVE chat')

    expect(describeTikTokSenderStatus({
      isWindowOpen: true,
      isOnTikTok: true,
      isLoggedIn: true,
      isChatReady: false,
      hasSendCredentials: true
    })).toBe('Signed in; open your public LIVE page to send relays')

    expect(describeTikTokSenderStatus({
      isWindowOpen: true,
      isOnTikTok: true,
      isLoggedIn: true,
      isChatReady: true,
      hasSendCredentials: true
    })).toBe('Public LIVE chat ready for relays')
  })

  it('builds and recognizes the host public LIVE URL', () => {
    expect(buildTikTokLiveChatUrl(' @creator.name ')).toBe('https://www.tiktok.com/@creator.name/live')
    expect(buildTikTokLiveChatUrl('')).toBeNull()
    expect(isTikTokLiveChatUrl('https://www.tiktok.com/@creator.name/live?enter_from_merge=others_homepage', '@creator.name')).toBe(true)
    expect(isTikTokLiveChatUrl('https://livecenter.tiktok.com/producer', '@creator.name')).toBe(false)
  })

  it('allows only HTTPS navigation in the sender window', () => {
    expect(isSafeNavigationUrl('https://livecenter.tiktok.com/producer')).toBe(true)
    expect(isSafeNavigationUrl('http://livecenter.tiktok.com/producer')).toBe(false)
    expect(isSafeNavigationUrl('bytedance://open_live_center')).toBe(false)
    expect(isSafeNavigationUrl('not a url')).toBe(false)
  })

  it('keeps TikTok-owned web URLs in the isolated sender session', () => {
    expect(isTikTokOwnedWebUrl('https://livecenter.tiktok.com/producer')).toBe(true)
    expect(isTikTokOwnedWebUrl('https://accounts.tiktok.com/login')).toBe(true)
    expect(isTikTokOwnedWebUrl('https://www.tiktok.com/@ilydrw/live')).toBe(true)
    expect(isTikTokOwnedWebUrl('https://example.com/tiktok')).toBe(false)
  })

  it('captures sending credentials from TikTok session cookies', () => {
    expect(
      pickTikTokCredentialsFromCookies([
        { name: 'sessionid', value: '  abc123  ' },
        { name: 'tt-target-idc', value: 'useast2a' },
        { name: 'unrelated', value: 'x' }
      ])
    ).toEqual({ sessionId: 'abc123', ttTargetIdc: 'useast2a', loggedIn: true })
  })

  it('reports not-logged-in when the session cookie is absent', () => {
    expect(
      pickTikTokCredentialsFromCookies([{ name: 'tt-target-idc', value: 'useast2a' }])
    ).toEqual({ sessionId: null, ttTargetIdc: 'useast2a', loggedIn: false })
  })

  it('requires both isolated-session cookies before enabling API relays', () => {
    expect(hasTikTokSendCredentials({
      sessionId: 'session-id',
      ttTargetIdc: 'useast2a',
      loggedIn: true
    })).toBe(true)
    expect(hasTikTokSendCredentials({
      sessionId: 'session-id',
      ttTargetIdc: null,
      loggedIn: true
    })).toBe(false)
  })

  it('recognizes TikTok native app protocols before Windows opens a handler prompt', () => {
    expect(isTikTokBlockedAppProtocol('bytedance://live/creator')).toBe(true)
    expect(isTikTokBlockedAppProtocol('snssdk1128://live/creator')).toBe(true)
    expect(isTikTokBlockedAppProtocol('tiktok://live/creator')).toBe(true)
    expect(isTikTokBlockedAppProtocol('https://livecenter.tiktok.com/producer')).toBe(false)
  })

  it('dispatches one Enter gesture when the chat composer has no send button', async () => {
    vi.useFakeTimers()

    const dispatchedEvents: string[] = []
    let focusedElement: FakeHTMLElement | null = null

    class FakeEvent {
      readonly type: string

      constructor(type: string) {
        this.type = type
      }
    }

    class FakeKeyboardEvent extends FakeEvent {}
    class FakeInputEvent extends FakeEvent {}

    class FakeHTMLElement {
      readonly offsetWidth = 1
      readonly offsetHeight = 1
      readonly dataset: Record<string, string> = {}
      readonly isContentEditable = true
      textContent = ''

      getClientRects(): number[] {
        return [1]
      }

      getAttribute(name: string): string | null {
        return name === 'contenteditable' ? 'true' : null
      }

      focus(): void {
        focusedElement = this
      }

      dispatchEvent(event: FakeEvent): boolean {
        dispatchedEvents.push(event.type)
        if (event.type === 'keydown') this.textContent = ''
        return true
      }
    }

    class FakeHTMLButtonElement extends FakeHTMLElement {
      disabled = false
    }

    class FakeHTMLInputElement extends FakeHTMLElement {
      disabled = false
      readOnly = false
      value = ''
    }

    class FakeHTMLTextAreaElement extends FakeHTMLInputElement {}

    const composer = new FakeHTMLElement()
    vi.stubGlobal('HTMLElement', FakeHTMLElement)
    vi.stubGlobal('HTMLButtonElement', FakeHTMLButtonElement)
    vi.stubGlobal('HTMLInputElement', FakeHTMLInputElement)
    vi.stubGlobal('HTMLTextAreaElement', FakeHTMLTextAreaElement)
    vi.stubGlobal('Event', FakeEvent)
    vi.stubGlobal('KeyboardEvent', FakeKeyboardEvent)
    vi.stubGlobal('InputEvent', FakeInputEvent)
    vi.stubGlobal('window', {
      getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
      getSelection: () => ({
        removeAllRanges: () => undefined,
        addRange: () => undefined
      })
    })
    vi.stubGlobal('document', {
      querySelectorAll: (selector: string) => (
        selector === 'button'
        || selector.startsWith('button')
        || selector.includes('send-button')
        || selector.includes('send-btn')
          ? []
          : [composer]
      ),
      createRange: () => ({
        selectNodeContents: () => undefined,
        collapse: () => undefined
      }),
      execCommand: (_command: string, _showUi: boolean, text: string) => {
        if (focusedElement) focusedElement.textContent = text
        return true
      }
    })

    const sendPromise = sendMessageInTikTokPage('one relay')
    const sendExpectation = expect(sendPromise).resolves.toEqual({ ok: true, method: 'enter' })
    await vi.runAllTimersAsync()

    await sendExpectation
    expect(dispatchedEvents.filter((type) => type === 'keydown')).toHaveLength(1)
    expect(dispatchedEvents).not.toContain('keypress')
    expect(dispatchedEvents).not.toContain('keyup')
  })
})
