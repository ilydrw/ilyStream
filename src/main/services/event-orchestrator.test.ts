import { EventEmitter } from 'events'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_ECONOMY_CONFIG } from '../../shared/economy'
import { EventOrchestrator } from './event-orchestrator'
import { markSuppressedChatRelayEcho } from '../chat/chat-relay-service'
import type { ChatEvent, GiftEvent, LikeEvent } from '../platforms/types'

function makeChat(message: string, user: Partial<ChatEvent['user']> = {}): ChatEvent {
  return {
    id: `chat-${message}`,
    platform: 'twitch',
    timestamp: new Date(),
    type: 'chat',
    user: {
      id: user.id ?? 'viewer-id',
      username: user.username ?? 'viewer',
      displayName: user.displayName ?? 'Viewer',
      isModerator: user.isModerator ?? false,
      isSubscriber: user.isSubscriber ?? false,
      isVip: user.isVip ?? false,
      badges: user.badges ?? []
    },
    message,
    emotes: [],
    raw: {}
  }
}

function makeLike(): LikeEvent {
  return {
    id: 'like-1',
    platform: 'tiktok',
    timestamp: new Date(),
    type: 'like',
    raw: {},
    user: {
      id: 'viewer-id',
      username: 'viewer',
      displayName: 'Viewer',
      isModerator: false,
      isSubscriber: false,
      isVip: false,
      badges: []
    },
    likeCount: 1,
    totalLikes: 10
  }
}

function makeGift(overrides: Partial<GiftEvent> = {}): GiftEvent {
  return {
    id: overrides.id ?? 'gift-1',
    platform: overrides.platform ?? 'tiktok',
    timestamp: overrides.timestamp ?? new Date(),
    type: 'gift',
    raw: overrides.raw ?? {},
    user: overrides.user ?? {
      id: 'viewer-id',
      username: 'viewer',
      displayName: 'Viewer',
      isModerator: false,
      isSubscriber: false,
      isVip: false,
      badges: []
    },
    giftName: overrides.giftName ?? 'Rose',
    giftId: overrides.giftId ?? 'rose',
    giftCount: overrides.giftCount ?? 1,
    monetaryValue: overrides.monetaryValue ?? 1,
    isCombo: overrides.isCombo ?? false
  }
}

function makeOrchestrator(
  spotifyHandled: boolean,
  overrides: {
    handleStreamEvent?: ReturnType<typeof vi.fn>
    recordEvent?: ReturnType<typeof vi.fn>
    sendManualMessage?: ReturnType<typeof vi.fn>
    settings?: Record<string, unknown>
    capabilities?: Record<string, { platform: string; canSend: boolean; reason?: string }>
    lightingManager?: { getState: ReturnType<typeof vi.fn>; executeAction: ReturnType<typeof vi.fn> }
  } = {}
) {
  const platformManager = Object.assign(new EventEmitter(), {
    getChatCapabilities: vi.fn(() => overrides.capabilities || {
      tiktok: { platform: 'tiktok', canSend: false, reason: 'Not ready' },
      twitch: { platform: 'twitch', canSend: true },
      youtube: { platform: 'youtube', canSend: false, reason: 'Not connected' },
      kick: { platform: 'kick', canSend: false, reason: 'Not connected' }
    })
  })
  const overlayServer = Object.assign(new EventEmitter(), {
    handleStreamEvent: overrides.handleStreamEvent || vi.fn(),
    setNowPlaying: vi.fn(),
    pushAlert: vi.fn()
  })
  const spotifyService = Object.assign(new EventEmitter(), {
    processEvent: vi.fn().mockResolvedValue(spotifyHandled),
    getNowPlaying: vi.fn(() => ({ queue: [] }))
  })
  const eventSoundService = {
    processEvent: vi.fn(),
    playSound: vi.fn(),
    stopAll: vi.fn()
  }
  const triggerEngine = Object.assign(new EventEmitter(), { evaluate: vi.fn() })
  const chatRelayService = {
    sendManualMessage: overrides.sendManualMessage || vi.fn().mockResolvedValue([{ platform: 'twitch', ok: true }])
  }
  const ttsEngine = { processEvent: vi.fn(), speak: vi.fn() }
  const economyService = Object.assign(new EventEmitter(), {
    registerLike: vi.fn(),
    claimPointsDrop: vi.fn(),
    getPoints: vi.fn().mockResolvedValue(0),
    spendPoints: vi.fn().mockResolvedValue(false),
    addPoints: vi.fn(),
    addTimeToSubathon: vi.fn(),
    awardLoyaltyPoints: vi.fn(),
    getConfig: vi.fn(() => DEFAULT_ECONOMY_CONFIG)
  })
  const loyaltyService = Object.assign(new EventEmitter(), {
    recordEvent: vi.fn(),
    recordSongRequest: vi.fn()
  })
  const economyCommandService = { handleChat: vi.fn().mockResolvedValue(null) }

  const statsService = {
    recordEvent: overrides.recordEvent || vi.fn(),
    recordSongRequest: vi.fn()
  }

  const orchestrator = new EventOrchestrator(
    platformManager as any,
    { addEvent: vi.fn(), pruneEventHistory: vi.fn(), getAllSettings: vi.fn(() => overrides.settings || {}) } as any,
    overlayServer as any,
    eventSoundService as any,
    spotifyService as any,
    chatRelayService as any,
    ttsEngine as any,
    {} as any,
    triggerEngine as any,
    { handleTrigger: vi.fn() } as any,
    {} as any,
    {} as any,
    economyService as any,
    economyCommandService as any,
    loyaltyService as any,
    statsService as any,
    {} as any,
    (overrides.lightingManager || { getState: vi.fn(() => ({ devices: [] })), executeAction: vi.fn() }) as any,
    {} as any
  )

  orchestrator.init()
  return { orchestrator, platformManager, spotifyService, chatRelayService, ttsEngine, statsService, overlayServer, economyService, loyaltyService, eventSoundService, triggerEngine }
}

async function flushAsyncHandlers() {
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('EventOrchestrator Spotify handling', () => {
  it('awaits Spotify command handling before deciding whether chat should go to TTS', async () => {
    const { platformManager, spotifyService, ttsEngine } = makeOrchestrator(false)

    platformManager.emit('event', makeChat('hello chat'))
    await flushAsyncHandlers()

    expect(spotifyService.processEvent).toHaveBeenCalledWith(expect.objectContaining({ message: 'hello chat' }))
    expect(ttsEngine.processEvent).toHaveBeenCalledWith(expect.objectContaining({ message: 'hello chat' }))
  })

  it('does not send Spotify commands to TTS after Spotify handles them', async () => {
    const { platformManager, ttsEngine } = makeOrchestrator(true)

    platformManager.emit('event', makeChat('!play current song'))
    await flushAsyncHandlers()

    expect(ttsEngine.processEvent).not.toHaveBeenCalled()
  })

  it('does not route high-volume non-speech events to TTS', async () => {
    const { platformManager, ttsEngine } = makeOrchestrator(false)

    platformManager.emit('event', makeLike())
    await flushAsyncHandlers()

    expect(ttsEngine.processEvent).not.toHaveBeenCalled()
  })

  it('stabilizes a viewer avatar URL across re-signed/host-rotated events', async () => {
    const handleStreamEvent = vi.fn()
    const { platformManager } = makeOrchestrator(false, { handleStreamEvent })

    // Same image, different shard host + signature — the exact TikTok churn.
    const first = {
      ...makeLike(),
      id: 'like-a',
      user: { ...makeLike().user, profilePictureUrl: 'https://p16-common-sign.tiktokcdn-us.com/x/hash~tplv.webp?x-signature=one' }
    }
    const second = {
      ...makeLike(),
      id: 'like-b',
      user: { ...makeLike().user, profilePictureUrl: 'https://p19-common-sign.tiktokcdn-us.com/x/hash~tplv.webp?x-signature=two' }
    }

    platformManager.emit('event', first)
    await flushAsyncHandlers()
    platformManager.emit('event', second)
    await flushAsyncHandlers()

    const firstUrl = handleStreamEvent.mock.calls[0][0].user.profilePictureUrl
    const secondUrl = handleStreamEvent.mock.calls[1][0].user.profilePictureUrl
    // The second event must carry the SAME stable URL so overlays don't reset <img src>.
    expect(secondUrl).toBe(firstUrl)
  })

  it('does not route synthetic AI co-host chat back into TTS', async () => {
    const { platformManager, ttsEngine, overlayServer, eventSoundService, spotifyService, triggerEngine } = makeOrchestrator(false)

    platformManager.emit('event', makeChat('hello from ai', {
      id: 'ai-cohost',
      username: 'ai-cohost',
      displayName: 'ilyStream AI',
      isModerator: true
    }))
    await flushAsyncHandlers()

    expect(overlayServer.handleStreamEvent).toHaveBeenCalledWith(expect.objectContaining({
      message: 'hello from ai'
    }))
    expect(eventSoundService.processEvent).not.toHaveBeenCalled()
    expect(spotifyService.processEvent).not.toHaveBeenCalled()
    expect(ttsEngine.processEvent).not.toHaveBeenCalled()
    expect(triggerEngine.evaluate).not.toHaveBeenCalled()
  })

  it('does not route echoed manual chat sends back into TTS', async () => {
    const { platformManager, ttsEngine, overlayServer, eventSoundService, spotifyService, triggerEngine } = makeOrchestrator(false)
    const echo = makeChat('hello from ai')
    markSuppressedChatRelayEcho(echo)

    platformManager.emit('event', echo)
    await flushAsyncHandlers()

    expect(overlayServer.handleStreamEvent).toHaveBeenCalledWith(echo)
    expect(eventSoundService.processEvent).not.toHaveBeenCalled()
    expect(spotifyService.processEvent).not.toHaveBeenCalled()
    expect(ttsEngine.processEvent).not.toHaveBeenCalled()
    expect(triggerEngine.evaluate).not.toHaveBeenCalled()
  })

  it('does not route relay-formatted chat echoes into downstream handlers', async () => {
    const { platformManager, ttsEngine, overlayServer, eventSoundService, spotifyService, triggerEngine } = makeOrchestrator(false)

    platformManager.emit('event', {
      ...makeChat('[TikTok] Ren: hello from relay'),
      platform: 'youtube'
    })
    await flushAsyncHandlers()

    expect(overlayServer.handleStreamEvent).toHaveBeenCalledWith(expect.objectContaining({
      message: '[TikTok] Ren: hello from relay'
    }))
    expect(eventSoundService.processEvent).not.toHaveBeenCalled()
    expect(spotifyService.processEvent).not.toHaveBeenCalled()
    expect(ttsEngine.processEvent).not.toHaveBeenCalled()
    expect(triggerEngine.evaluate).not.toHaveBeenCalled()
  })

  it('keeps dispatching later consumers when an earlier stage throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const handleStreamEvent = vi.fn(() => {
      throw new Error('overlay exploded')
    })
    const recordEvent = vi.fn()
    const { platformManager, spotifyService, statsService } = makeOrchestrator(false, {
      handleStreamEvent,
      recordEvent
    })

    try {
      platformManager.emit('event', makeChat('hello chat'))
      await flushAsyncHandlers()
    } finally {
      errorSpy.mockRestore()
    }

    expect(handleStreamEvent).toHaveBeenCalled()
    expect(spotifyService.processEvent).toHaveBeenCalled()
    expect(statsService.recordEvent).toHaveBeenCalledWith(expect.objectContaining({ message: 'hello chat' }))
  })

  it('does not subscribe duplicate platform listeners if init runs again', async () => {
    const { orchestrator, platformManager, spotifyService, overlayServer } = makeOrchestrator(false)

    orchestrator.init()
    platformManager.emit('event', makeChat('single pipeline'))
    await flushAsyncHandlers()

    expect(overlayServer.handleStreamEvent).toHaveBeenCalledTimes(1)
    expect(spotifyService.processEvent).toHaveBeenCalledTimes(1)
  })

  it('globally suppresses repeated low-value TikTok gift lighting effects', async () => {
    const lightingManager = {
      getState: vi.fn(() => ({
        devices: [
          { id: 'hue-1', platform: 'hue' },
          { id: 'govee-1', platform: 'govee' }
        ]
      })),
      executeAction: vi.fn()
    }
    const { platformManager } = makeOrchestrator(false, { lightingManager })

    platformManager.emit('event', makeGift({ id: 'cheap-1' }))
    await flushAsyncHandlers()
    platformManager.emit('event', makeGift({
      id: 'cheap-2',
      user: {
        id: 'viewer-2',
        username: 'viewer2',
        displayName: 'Viewer 2',
        isModerator: false,
        isSubscriber: false,
        isVip: false,
        badges: []
      }
    }))
    await flushAsyncHandlers()

    expect(lightingManager.executeAction).toHaveBeenCalledTimes(2)
    expect(lightingManager.executeAction).toHaveBeenCalledWith('hue-1', 'pulse', expect.any(Object))
    expect(lightingManager.executeAction).toHaveBeenCalledWith('govee-1', 'pulse', expect.any(Object))
  })

  it('does not suppress higher-value TikTok gift lighting effects', async () => {
    const lightingManager = {
      getState: vi.fn(() => ({
        devices: [
          { id: 'hue-1', platform: 'hue' }
        ]
      })),
      executeAction: vi.fn()
    }
    const { platformManager } = makeOrchestrator(false, { lightingManager })

    platformManager.emit('event', makeGift({ id: 'cheap-1' }))
    await flushAsyncHandlers()
    platformManager.emit('event', makeGift({ id: 'big-1', giftName: 'Galaxy', giftId: 'galaxy', monetaryValue: 500 }))
    await flushAsyncHandlers()

    expect(lightingManager.executeAction).toHaveBeenCalledTimes(2)
  })

  it('sends a host chat confirmation when Spotify queues a song request', async () => {
    const { spotifyService, chatRelayService } = makeOrchestrator(false)

    spotifyService.emit('song-requested', {
      id: 'request-1',
      requestedBy: 'viewer',
      displayName: 'Viewer',
      platform: 'twitch',
      track: {
        name: 'Tiny Dancer',
        artists: ['Elton John']
      }
    })
    await flushAsyncHandlers()

    expect(chatRelayService.sendManualMessage).toHaveBeenCalledWith(
      ['twitch'],
      'Queued "Tiny Dancer by Elton John" for Viewer.'
    )
  })

  it('respects the host chat response setting for song request confirmations', async () => {
    const sendManualMessage = vi.fn().mockResolvedValue([{ platform: 'twitch', ok: true }])
    const { spotifyService } = makeOrchestrator(false, {
      sendManualMessage,
      settings: { chatHostResponsesEnabled: false }
    })

    spotifyService.emit('song-requested', {
      id: 'request-2',
      requestedBy: 'viewer',
      platform: 'twitch',
      track: {
        name: 'Tiny Dancer',
        artists: ['Elton John']
      }
    })
    await flushAsyncHandlers()

    expect(sendManualMessage).not.toHaveBeenCalled()
  })
})

describe('EventOrchestrator loyalty economy bridge', () => {
  it('turns every persisted XP award into a level-scaled point award', () => {
    const { loyaltyService, economyService } = makeOrchestrator(false)

    loyaltyService.emit('xp-awarded', {
      username: 'viewer',
      platform: 'twitch',
      platformUserId: 'viewer-1',
      displayName: 'Viewer',
      xp: 125,
      level: 2,
      currentLevelXp: 100,
      nextLevelXp: 400,
      progressRatio: 25 / 300,
      previousLevel: 1,
      awardedXp: 35,
      reason: 'follow',
      leveledUp: true
    })

    expect(economyService.awardLoyaltyPoints).toHaveBeenCalledWith({
      username: 'viewer',
      platform: 'twitch',
      level: 2,
      awardedXp: 35,
      reason: 'follow',
      leveledUp: true,
      platformUserId: 'viewer-1',
      displayName: 'Viewer'
    })
  })
})

describe('EventOrchestrator economy command safety', () => {
  it('does not let a simulated !get command claim a live points drop', async () => {
    const { platformManager, economyService, ttsEngine } = makeOrchestrator(false)
    const event = makeChat('!get')
    event.raw = { simulated: true }

    platformManager.emit('event', event)
    await flushAsyncHandlers()

    expect(economyService.claimPointsDrop).not.toHaveBeenCalled()
    expect(ttsEngine.processEvent).not.toHaveBeenCalled()
  })

  it('passes the likes tracker accepted viewer progress to milestone handling', async () => {
    const likeProgress = { acceptedAmount: 5, viewerTotal: 10_000 }
    const handleStreamEvent = vi.fn(() => ({ likeProgress }))
    const { platformManager, eventSoundService } = makeOrchestrator(false, { handleStreamEvent })
    const like = makeLike()

    platformManager.emit('event', like)
    await flushAsyncHandlers()

    expect(eventSoundService.processEvent).toHaveBeenCalledWith(like, likeProgress)
  })
})
