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
    id: `${platform}-chat-1`,
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
