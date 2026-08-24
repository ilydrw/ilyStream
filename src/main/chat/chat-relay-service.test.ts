import { EventEmitter } from 'events'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_APP_SETTINGS, type AppSettings } from '../../shared/app-settings'
import type {
  ChatEvent,
  Platform,
  PlatformChatCapability,
  PlatformChatSendResult
} from '../platforms/types'
import { PlatformManager } from '../platforms/platform-manager'
import { ChatRelayService, isSuppressedChatRelayEcho } from './chat-relay-service'

class MockPlatformManager extends EventEmitter {
  readonly getChatCapabilities = vi.fn<() => Partial<Record<Platform, PlatformChatCapability>>>()
  readonly sendChatMessageToPlatforms = vi.fn<
    (platforms: Platform[], text: string) => Promise<PlatformChatSendResult[]>
  >()
}

let chatEventSequence = 0

function createSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  const {
    chatAutoRelayPlatforms: platformOverrides,
    ...restOverrides
  } = overrides

  const settings: AppSettings = {
    ...DEFAULT_APP_SETTINGS,
    chatAutoRelayEnabled: true,
    chatRelayTagMode: 'platform-and-user',
    ...restOverrides,
    chatAutoRelayPlatforms: { ...DEFAULT_APP_SETTINGS.chatAutoRelayPlatforms }
  }

  settings.chatAutoRelayPlatforms = {
    ...DEFAULT_APP_SETTINGS.chatAutoRelayPlatforms,
    ...platformOverrides
  }

  return settings
}

function createChatEvent(
  platform: Platform,
  message: string,
  displayName = 'Stream Friend',
  raw: Record<string, unknown> = {}
): ChatEvent {
  return {
    id: `${platform}-chat-${++chatEventSequence}`,
    platform,
    timestamp: new Date('2026-04-10T12:00:00.000Z'),
    type: 'chat',
    raw,
    message,
    emotes: [],
    user: {
      id: 'user-1',
      username: 'stream_friend',
      displayName,
      isModerator: false,
      isSubscriber: true,
      isVip: false,
      badges: []
    }
  }
}

describe('ChatRelayService', () => {
  it('auto relays chat events to other enabled send-ready platforms', async () => {
    const platformManager = new MockPlatformManager()
    platformManager.getChatCapabilities.mockReturnValue({
      tiktok: { platform: 'tiktok', canSend: false, reason: 'Missing session' },
      twitch: { platform: 'twitch', canSend: true },
      youtube: { platform: 'youtube', canSend: true },
      kick: { platform: 'kick', canSend: false, reason: 'Unsupported' }
    })
    platformManager.sendChatMessageToPlatforms.mockImplementation(async (platforms, text) =>
      platforms.map((platform) => ({ platform, ok: true, echoed: text })) as PlatformChatSendResult[]
    )

    const service = new ChatRelayService(
      platformManager as unknown as PlatformManager,
      () =>
        createSettings({
          chatAutoRelayPlatforms: {
            tiktok: true,
            twitch: true,
            youtube: true,
            kick: false
          }
        })
    )

    try {
      platformManager.emit('event', createChatEvent('twitch', 'hello there'))

      await vi.waitFor(() => {
        expect(platformManager.sendChatMessageToPlatforms).toHaveBeenCalledWith(
          ['youtube'],
          '[Twitch] Stream Friend: hello there'
        )
      })
    } finally {
      service.dispose()
    }
  })

  it('relays a platform chat message id only once when a connector replays it', async () => {
    const platformManager = new MockPlatformManager()
    platformManager.getChatCapabilities.mockReturnValue({
      tiktok: { platform: 'tiktok', canSend: true },
      twitch: { platform: 'twitch', canSend: true }
    })
    platformManager.sendChatMessageToPlatforms.mockResolvedValue([{ platform: 'tiktok', ok: true }])
    const service = new ChatRelayService(
      platformManager as unknown as PlatformManager,
      () => createSettings({
        chatAutoRelayPlatforms: {
          tiktok: true,
          twitch: true,
          youtube: false,
          kick: false
        }
      })
    )

    try {
      const event = createChatEvent('twitch', 'send this once')
      platformManager.emit('event', event)
      platformManager.emit('event', { ...event })

      await vi.waitFor(() => {
        expect(platformManager.sendChatMessageToPlatforms).toHaveBeenCalledTimes(1)
      })
    } finally {
      service.dispose()
    }
  })

  it('keeps only a small fresh backlog while an auto-relay target is slow', async () => {
    const platformManager = new MockPlatformManager()
    platformManager.getChatCapabilities.mockReturnValue({
      tiktok: { platform: 'tiktok', canSend: true },
      twitch: { platform: 'twitch', canSend: true }
    })

    let resolveFirstSend!: (results: PlatformChatSendResult[]) => void
    const firstSend = new Promise<PlatformChatSendResult[]>((resolve) => {
      resolveFirstSend = resolve
    })
    platformManager.sendChatMessageToPlatforms.mockImplementation(async () => {
      if (platformManager.sendChatMessageToPlatforms.mock.calls.length === 1) {
        return firstSend
      }
      return [{ platform: 'tiktok', ok: true }]
    })
    const service = new ChatRelayService(
      platformManager as unknown as PlatformManager,
      () => createSettings({
        chatAutoRelayPlatforms: {
          tiktok: true,
          twitch: true,
          youtube: false,
          kick: false
        }
      }),
      { maxPendingAutoRelaysPerTarget: 2 }
    )

    try {
      for (let index = 1; index <= 6; index += 1) {
        platformManager.emit('event', createChatEvent('twitch', `message ${index}`))
      }

      expect(platformManager.sendChatMessageToPlatforms).toHaveBeenCalledTimes(1)
      resolveFirstSend([{ platform: 'tiktok', ok: true }])

      await vi.waitFor(() => {
        expect(platformManager.sendChatMessageToPlatforms).toHaveBeenCalledTimes(3)
      })
      expect(platformManager.sendChatMessageToPlatforms.mock.calls.map((call) => call[1])).toEqual([
        '[Twitch] Stream Friend: message 1',
        '[Twitch] Stream Friend: message 5',
        '[Twitch] Stream Friend: message 6'
      ])
    } finally {
      service.dispose()
    }
  })

  it('drops queued auto relays after a target failure', async () => {
    const platformManager = new MockPlatformManager()
    platformManager.getChatCapabilities.mockReturnValue({
      tiktok: { platform: 'tiktok', canSend: true },
      twitch: { platform: 'twitch', canSend: true }
    })

    let resolveSend!: (results: PlatformChatSendResult[]) => void
    platformManager.sendChatMessageToPlatforms.mockReturnValue(
      new Promise<PlatformChatSendResult[]>((resolve) => {
        resolveSend = resolve
      })
    )
    const service = new ChatRelayService(
      platformManager as unknown as PlatformManager,
      () => createSettings({
        chatAutoRelayPlatforms: {
          tiktok: true,
          twitch: true,
          youtube: false,
          kick: false
        }
      })
    )

    try {
      platformManager.emit('event', createChatEvent('twitch', 'first message'))
      platformManager.emit('event', createChatEvent('twitch', 'stale message one'))
      platformManager.emit('event', createChatEvent('twitch', 'stale message two'))

      resolveSend([{ platform: 'tiktok', ok: false, error: 'sender page stopped' }])
      await Promise.resolve()
      await Promise.resolve()

      expect(platformManager.sendChatMessageToPlatforms).toHaveBeenCalledTimes(1)
    } finally {
      service.dispose()
    }
  })

  it('uses readable emote fallbacks in automatic relays', async () => {
    const platformManager = new MockPlatformManager()
    platformManager.getChatCapabilities.mockReturnValue({
      tiktok: { platform: 'tiktok', canSend: true },
      twitch: { platform: 'twitch', canSend: true }
    })
    platformManager.sendChatMessageToPlatforms.mockResolvedValue([{ platform: 'twitch', ok: true }])
    const service = new ChatRelayService(
      platformManager as unknown as PlatformManager,
      () => createSettings({
        chatAutoRelayPlatforms: {
          tiktok: true,
          twitch: true,
          youtube: false,
          kick: false
        }
      })
    )

    try {
      const event = createChatEvent('tiktok', ':7630614458817743630:')
      event.emotes = [{
        id: '7630614458817743630',
        name: ':7630614458817743630:',
        imageUrl: 'https://example.test/fan-emote.webp',
        startIndex: 0,
        endIndex: 20
      }]
      platformManager.emit('event', event)

      await vi.waitFor(() => {
        expect(platformManager.sendChatMessageToPlatforms).toHaveBeenCalledWith(
          ['twitch'],
          '[TikTok] Stream Friend: [TikTok Fan Club emote]'
        )
      })
    } finally {
      service.dispose()
    }
  })

  it('pauses auto relay to a target after quota failures instead of retrying every chat', async () => {
    const platformManager = new MockPlatformManager()
    platformManager.getChatCapabilities.mockReturnValue({
      tiktok: { platform: 'tiktok', canSend: false, reason: 'Missing session' },
      twitch: { platform: 'twitch', canSend: true },
      youtube: { platform: 'youtube', canSend: true },
      kick: { platform: 'kick', canSend: false, reason: 'Unsupported' }
    })
    platformManager.sendChatMessageToPlatforms.mockResolvedValue([{
      platform: 'youtube',
      ok: false,
      error: 'The request cannot be completed because you have exceeded your quota.'
    }])

    const service = new ChatRelayService(
      platformManager as unknown as PlatformManager,
      () =>
        createSettings({
          chatAutoRelayPlatforms: {
            tiktok: true,
            twitch: true,
            youtube: true,
            kick: false
          }
        }),
      { autoRelayFailureCooldownMs: 60_000 }
    )

    try {
      platformManager.emit('event', createChatEvent('twitch', 'first message'))

      await vi.waitFor(() => {
        expect(platformManager.sendChatMessageToPlatforms).toHaveBeenCalledTimes(1)
      })
      await new Promise(resolve => setTimeout(resolve, 0))

      platformManager.emit('event', createChatEvent('twitch', 'second message'))
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(platformManager.sendChatMessageToPlatforms).toHaveBeenCalledTimes(1)
    } finally {
      service.dispose()
    }
  })

  it('suppresses echoed messages after a manual relay send', async () => {
    const platformManager = new MockPlatformManager()
    platformManager.getChatCapabilities.mockReturnValue({
      tiktok: { platform: 'tiktok', canSend: false, reason: 'Missing session' },
      twitch: { platform: 'twitch', canSend: true },
      youtube: { platform: 'youtube', canSend: true },
      kick: { platform: 'kick', canSend: false, reason: 'Unsupported' }
    })
    platformManager.sendChatMessageToPlatforms.mockImplementation(async (platforms) =>
      platforms.map((platform) => ({ platform, ok: true }))
    )

    const service = new ChatRelayService(
      platformManager as unknown as PlatformManager,
      () => createSettings()
    )

    try {
      await service.sendManualMessage(['youtube'], '[Twitch] Stream Friend: hello there')
      expect(platformManager.sendChatMessageToPlatforms).toHaveBeenCalledTimes(1)

      const echo = createChatEvent('youtube', '[Twitch] Stream Friend: hello there', 'ilyBot')
      platformManager.emit('event', echo)
      await Promise.resolve()

      expect(platformManager.sendChatMessageToPlatforms).toHaveBeenCalledTimes(1)
      expect(isSuppressedChatRelayEcho(echo)).toBe(true)
      expect(echo.chatRelayEcho).toBe(true)
    } finally {
      service.dispose()
    }
  })

  it('suppresses echoed messages while a manual relay send is still in flight', async () => {
    const platformManager = new MockPlatformManager()
    let resolveSend: (results: PlatformChatSendResult[]) => void = () => undefined
    const sendCompleted = new Promise<PlatformChatSendResult[]>((resolve) => {
      resolveSend = resolve
    })
    platformManager.getChatCapabilities.mockReturnValue({
      tiktok: { platform: 'tiktok', canSend: false, reason: 'Missing session' },
      twitch: { platform: 'twitch', canSend: true },
      youtube: { platform: 'youtube', canSend: true },
      kick: { platform: 'kick', canSend: false, reason: 'Unsupported' }
    })
    platformManager.sendChatMessageToPlatforms.mockReturnValue(sendCompleted)

    const service = new ChatRelayService(
      platformManager as unknown as PlatformManager,
      () => createSettings()
    )

    try {
      const sendPromise = service.sendManualMessage(['youtube'], '[Twitch] Stream Friend: hello there')
      const echo = createChatEvent('youtube', '[Twitch] Stream Friend: hello there', 'ilyBot')

      platformManager.emit('event', echo)
      await Promise.resolve()

      expect(platformManager.sendChatMessageToPlatforms).toHaveBeenCalledTimes(1)
      expect(isSuppressedChatRelayEcho(echo)).toBe(true)
      expect(echo.chatRelayEcho).toBe(true)

      resolveSend([{ platform: 'youtube', ok: true }])
      await sendPromise
    } finally {
      service.dispose()
    }
  })

  it('releases optimistic echo suppression when a send fails', async () => {
    const platformManager = new MockPlatformManager()
    platformManager.getChatCapabilities.mockReturnValue({
      tiktok: { platform: 'tiktok', canSend: false, reason: 'Missing session' },
      twitch: { platform: 'twitch', canSend: true },
      youtube: { platform: 'youtube', canSend: true },
      kick: { platform: 'kick', canSend: false, reason: 'Unsupported' }
    })
    platformManager.sendChatMessageToPlatforms.mockResolvedValue([{ platform: 'youtube', ok: false, error: 'nope' }])

    const service = new ChatRelayService(
      platformManager as unknown as PlatformManager,
      () => createSettings({ chatAutoRelayEnabled: false })
    )

    try {
      await service.sendManualMessage(['youtube'], 'plain failed send text')
      const laterChat = createChatEvent('youtube', 'plain failed send text', 'Real Viewer')

      platformManager.emit('event', laterChat)
      await Promise.resolve()

      expect(isSuppressedChatRelayEcho(laterChat)).toBe(false)
    } finally {
      service.dispose()
    }
  })

  it('suppresses relay-formatted echoes even when exact send tracking missed them', async () => {
    const platformManager = new MockPlatformManager()
    platformManager.getChatCapabilities.mockReturnValue({
      tiktok: { platform: 'tiktok', canSend: true },
      twitch: { platform: 'twitch', canSend: true },
      youtube: { platform: 'youtube', canSend: true },
      kick: { platform: 'kick', canSend: false, reason: 'Unsupported' }
    })
    platformManager.sendChatMessageToPlatforms.mockResolvedValue([])

    const service = new ChatRelayService(
      platformManager as unknown as PlatformManager,
      () => createSettings()
    )

    try {
      const echo = createChatEvent('youtube', '[TikTok] Ren: hello from relay', 'ilydrw')

      platformManager.emit('event', echo)
      await Promise.resolve()

      expect(platformManager.sendChatMessageToPlatforms).not.toHaveBeenCalled()
      expect(isSuppressedChatRelayEcho(echo)).toBe(true)
      expect(echo.chatRelayEcho).toBe(true)
    } finally {
      service.dispose()
    }
  })

  it('sends manual relay messages as plain chat text', async () => {
    const platformManager = new MockPlatformManager()
    platformManager.getChatCapabilities.mockReturnValue({
      tiktok: { platform: 'tiktok', canSend: false, reason: 'Missing session' },
      twitch: { platform: 'twitch', canSend: true },
      youtube: { platform: 'youtube', canSend: true },
      kick: { platform: 'kick', canSend: false, reason: 'Unsupported' }
    })
    platformManager.sendChatMessageToPlatforms.mockImplementation(async (platforms, text) =>
      platforms.map((platform) => ({ platform, ok: true, echoed: text }))
    )

    const service = new ChatRelayService(
      platformManager as unknown as PlatformManager,
      () => createSettings()
    )

    try {
      await service.sendManualMessage(
        ['youtube'],
        '<div>SUPER FAN DETECTED</div><div>Welcome back, <strong>@ilydrw</strong>!</div>'
      )

      expect(platformManager.sendChatMessageToPlatforms).toHaveBeenCalledWith(
        ['youtube'],
        'SUPER FAN DETECTED Welcome back, @ilydrw!'
      )
    } finally {
      service.dispose()
    }
  })

  it('skips auto relay when the source platform is disabled', async () => {
    const platformManager = new MockPlatformManager()
    platformManager.getChatCapabilities.mockReturnValue({
      tiktok: { platform: 'tiktok', canSend: false, reason: 'Missing session' },
      twitch: { platform: 'twitch', canSend: true },
      youtube: { platform: 'youtube', canSend: true },
      kick: { platform: 'kick', canSend: false, reason: 'Unsupported' }
    })
    platformManager.sendChatMessageToPlatforms.mockResolvedValue([])

    const service = new ChatRelayService(
      platformManager as unknown as PlatformManager,
      () =>
        createSettings({
          chatAutoRelayPlatforms: {
            tiktok: true,
            twitch: false,
            youtube: true,
            kick: true
          }
        })
    )

    try {
      platformManager.emit('event', createChatEvent('twitch', 'hello there'))
      await Promise.resolve()

      expect(platformManager.sendChatMessageToPlatforms).not.toHaveBeenCalled()
    } finally {
      service.dispose()
    }
  })

  it('keeps suppressing repeated deliveries of the same echoed message', async () => {
    const platformManager = new MockPlatformManager()
    platformManager.getChatCapabilities.mockReturnValue({
      youtube: { platform: 'youtube', canSend: true }
    })
    platformManager.sendChatMessageToPlatforms.mockImplementation(async (platforms) =>
      platforms.map((platform) => ({ platform, ok: true }))
    )

    const service = new ChatRelayService(
      platformManager as unknown as PlatformManager,
      () => createSettings({ chatAutoRelayEnabled: false })
    )

    try {
      await service.sendManualMessage(['youtube'], 'this exact relay text got sent once')

      const firstEcho = createChatEvent('youtube', 'this exact relay text got sent once', 'ilydrw')
      const secondEcho = createChatEvent('youtube', 'this exact relay text got sent once', 'ilydrw')
      platformManager.emit('event', firstEcho)
      platformManager.emit('event', secondEcho)

      expect(isSuppressedChatRelayEcho(firstEcho)).toBe(true)
      expect(isSuppressedChatRelayEcho(secondEcho)).toBe(true)
    } finally {
      service.dispose()
    }
  })

  it('suppresses echoes the platform truncated before echoing back', async () => {
    const platformManager = new MockPlatformManager()
    platformManager.getChatCapabilities.mockReturnValue({
      youtube: { platform: 'youtube', canSend: true }
    })
    platformManager.sendChatMessageToPlatforms.mockImplementation(async (platforms) =>
      platforms.map((platform) => ({ platform, ok: true }))
    )

    const service = new ChatRelayService(
      platformManager as unknown as PlatformManager,
      () => createSettings({ chatAutoRelayEnabled: false })
    )

    try {
      const longText =
        'this is a very long relayed message that will absolutely get cut off by the two hundred character limit some platforms enforce on live chat sends and therefore come back shorter than it went out'
      await service.sendManualMessage(['youtube'], longText)

      const truncatedEcho = createChatEvent('youtube', `${longText.slice(0, 120)}…`, 'ilydrw')
      platformManager.emit('event', truncatedEcho)

      expect(isSuppressedChatRelayEcho(truncatedEcho)).toBe(true)
    } finally {
      service.dispose()
    }
  })

  it('suppresses third-party relay copies of a message already shown from another platform', async () => {
    const platformManager = new MockPlatformManager()
    platformManager.getChatCapabilities.mockReturnValue({})
    platformManager.sendChatMessageToPlatforms.mockResolvedValue([])

    const service = new ChatRelayService(
      platformManager as unknown as PlatformManager,
      () => createSettings({ chatAutoRelayEnabled: false })
    )

    try {
      const original = createChatEvent('tiktok', 'what a sick play that was', 'Ren')
      platformManager.emit('event', original)
      expect(isSuppressedChatRelayEcho(original)).toBe(false)

      // StreamElements-style bridge writes "name: message" into Twitch chat.
      const bridged = createChatEvent('twitch', 'Ren: what a sick play that was', 'StreamElements')
      platformManager.emit('event', bridged)
      expect(isSuppressedChatRelayEcho(bridged)).toBe(true)
    } finally {
      service.dispose()
    }
  })

  it('leaves ordinary colon-containing messages alone', async () => {
    const platformManager = new MockPlatformManager()
    platformManager.getChatCapabilities.mockReturnValue({})
    platformManager.sendChatMessageToPlatforms.mockResolvedValue([])

    const service = new ChatRelayService(
      platformManager as unknown as PlatformManager,
      () => createSettings({ chatAutoRelayEnabled: false })
    )

    try {
      const original = createChatEvent('tiktok', 'what a sick play that was', 'Ren')
      platformManager.emit('event', original)

      // Same core text but the implied author does not match the original's.
      const unrelated = createChatEvent('twitch', 'PSA: what a sick play that was', 'Real Viewer')
      platformManager.emit('event', unrelated)
      expect(isSuppressedChatRelayEcho(unrelated)).toBe(false)

      const normalColon = createChatEvent('twitch', 'reminder: raid at 8pm tonight', 'Mod Friend')
      platformManager.emit('event', normalColon)
      expect(isSuppressedChatRelayEcho(normalColon)).toBe(false)
    } finally {
      service.dispose()
    }
  })

  it('collapses undecorated cross-platform duplicates but not short coincidences', async () => {
    const platformManager = new MockPlatformManager()
    platformManager.getChatCapabilities.mockReturnValue({})
    platformManager.sendChatMessageToPlatforms.mockResolvedValue([])

    const service = new ChatRelayService(
      platformManager as unknown as PlatformManager,
      () => createSettings({ chatAutoRelayEnabled: false })
    )

    try {
      platformManager.emit('event', createChatEvent('tiktok', 'the transition on that scene was so smooth', 'Ren'))
      const mirrored = createChatEvent('kick', 'the transition on that scene was so smooth', 'KickBridge')
      platformManager.emit('event', mirrored)
      expect(isSuppressedChatRelayEcho(mirrored)).toBe(true)

      platformManager.emit('event', createChatEvent('tiktok', 'lol', 'Ren'))
      const coincidence = createChatEvent('kick', 'lol', 'Someone Else')
      platformManager.emit('event', coincidence)
      expect(isSuppressedChatRelayEcho(coincidence)).toBe(false)
    } finally {
      service.dispose()
    }
  })

  it('does not auto relay TikTok like system messages that arrive as chat', async () => {
    const platformManager = new MockPlatformManager()
    platformManager.getChatCapabilities.mockReturnValue({
      tiktok: { platform: 'tiktok', canSend: true },
      twitch: { platform: 'twitch', canSend: true },
      youtube: { platform: 'youtube', canSend: true },
      kick: { platform: 'kick', canSend: false, reason: 'Unsupported' }
    })
    platformManager.sendChatMessageToPlatforms.mockResolvedValue([])

    const service = new ChatRelayService(
      platformManager as unknown as PlatformManager,
      () =>
        createSettings({
          chatAutoRelayPlatforms: {
            tiktok: true,
            twitch: true,
            youtube: true,
            kick: false
          }
        })
    )

    try {
      platformManager.emit(
        'event',
        createChatEvent('tiktok', 'Alex liked the LIVE', 'Alex', {
          displayType: 'pm_mt_msg_viewer',
          defaultPattern: '{0:user} liked the LIVE',
          likeCount: 15,
          totalLikeCount: 18610
        })
      )
      await Promise.resolve()

      expect(platformManager.sendChatMessageToPlatforms).not.toHaveBeenCalled()
    } finally {
      service.dispose()
    }
  })
})
