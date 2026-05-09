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
import { ChatRelayService } from './chat-relay-service'

class MockPlatformManager extends EventEmitter {
  readonly getChatCapabilities = vi.fn<[], Record<Platform, PlatformChatCapability>>()
  readonly sendChatMessageToPlatforms = vi.fn<
    [Platform[], string],
    Promise<PlatformChatSendResult[]>
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
  displayName = 'Stream Friend'
): ChatEvent {
  return {
    id: `${platform}-chat-1`,
    platform,
    timestamp: new Date('2026-04-10T12:00:00.000Z'),
    type: 'chat',
    raw: {},
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

      platformManager.emit('event', createChatEvent('youtube', '[Twitch] Stream Friend: hello there', 'ilyBot'))
      await Promise.resolve()

      expect(platformManager.sendChatMessageToPlatforms).toHaveBeenCalledTimes(1)
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
})
