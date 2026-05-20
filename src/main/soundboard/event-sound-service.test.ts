import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_APP_SETTINGS, resolveAppSettings } from '../../shared/app-settings'
import type { FollowEvent, GiftEvent, JoinEvent, SubscriptionEvent, UserInfo } from '../platforms/types'
import { EventSoundService } from './event-sound-service'

describe('EventSoundService', () => {
  it('routes alert audio to the overlay when an overlay client is connected', () => {
    vi.useFakeTimers()
    const soundboard = { playSound: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => ({ alertClientCount: 1 }))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    try {
      service.applySettings({
        ...DEFAULT_APP_SETTINGS,
        eventSoundGiftEnabled: true,
        eventSoundGiftSoundId: 'gift.mp3',
        eventSoundGiftVolume: 0.65
      })
      service.processEvent(makeGiftEvent())
      vi.advanceTimersByTime(500)

      // Overlay is loaded — it plays via the audioUrl. The renderer must not
      // also play; otherwise the alert sound is heard twice.
      expect(soundboard.playSound).not.toHaveBeenCalled()
      expect(overlayServer.pushAlert).toHaveBeenCalledWith(
        expect.objectContaining({ audioUrl: 'gift.mp3', audioVolume: 0.65 }),
        'tiktok'
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('falls back to the renderer when no overlay client is connected', () => {
    vi.useFakeTimers()
    const soundboard = { playSound: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => ({ alertClientCount: 0 }))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    try {
      service.applySettings({
        ...DEFAULT_APP_SETTINGS,
        eventSoundGiftEnabled: true,
        eventSoundGiftSoundId: 'gift.mp3',
        eventSoundGiftVolume: 0.65
      })
      service.processEvent(makeGiftEvent())
      vi.advanceTimersByTime(500)

      // No overlay listening — play locally so the streamer still hears it.
      expect(soundboard.playSound).toHaveBeenCalledWith('gift.mp3', 0.65)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores in-progress gift combo updates and fires only the final gift', () => {
    vi.useFakeTimers()
    const soundboard = { playSound: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => ({ alertClientCount: 0 }))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    try {
      service.applySettings({
        ...DEFAULT_APP_SETTINGS,
        eventSoundGiftEnabled: true,
        eventSoundGiftSoundId: 'gift.mp3',
        eventSoundGiftVolume: 0.65
      })

      service.processEvent({ ...makeGiftEvent(), id: 'gift-combo', isCombo: true })
      vi.advanceTimersByTime(500)
      expect(soundboard.playSound).not.toHaveBeenCalled()
      expect(overlayServer.pushAlert).not.toHaveBeenCalled()

      service.processEvent({ ...makeGiftEvent(), id: 'gift-final', isCombo: false })
      vi.advanceTimersByTime(500)

      expect(soundboard.playSound).toHaveBeenCalledTimes(1)
      expect(overlayServer.pushAlert).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('routes category-scoped alert sound ids to the overlay (not the renderer)', () => {
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => ({ alertClientCount: 1 }))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    service.applySettings(resolveAppSettings({
      alertRules: [
        {
          ...DEFAULT_APP_SETTINGS.alertRules[1],
          soundEnabled: true,
          soundId: 'alerts/follow-drop.mp3'
        }
      ]
    }))
    service.processEvent(makeFollowEvent())

    expect(soundboard.playSound).not.toHaveBeenCalled()
    expect(overlayServer.pushAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        audioUrl: 'alerts/follow-drop.mp3'
      }),
      'tiktok'
    )
  })

  it('routes the configured follow sound to the overlay (not the renderer) for follow events', () => {
    const soundboard = { playSound: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => ({ alertClientCount: 1 }))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    service.applySettings({
      ...DEFAULT_APP_SETTINGS,
      eventSoundFollowEnabled: true,
      eventSoundFollowSoundId: 'follow.wav',
      eventSoundFollowVolume: 0.4
    })
    service.processEvent(makeFollowEvent())

    expect(soundboard.playSound).not.toHaveBeenCalled()
    expect(overlayServer.pushAlert).toHaveBeenCalledWith(
      expect.objectContaining({ audioUrl: 'follow.wav', audioVolume: 0.4 }),
      'tiktok'
    )
  })

  it('does not play missing or disabled event sounds', () => {
    const soundboard = { playSound: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => ({ alertClientCount: 1 }))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    service.applySettings({
      ...DEFAULT_APP_SETTINGS,
      eventSoundGiftEnabled: true,
      eventSoundGiftSoundId: '',
      eventSoundFollowEnabled: false,
      eventSoundFollowSoundId: 'follow.wav'
    })
    service.processEvent(makeGiftEvent())
    service.processEvent(makeFollowEvent())

    expect(soundboard.playSound).not.toHaveBeenCalled()
  })

  it('can suppress sound for local alert previews while still pushing visuals', () => {
    const soundboard = { playSound: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => ({ alertClientCount: 1 }))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    service.applySettings({
      ...DEFAULT_APP_SETTINGS,
      eventSoundFollowEnabled: true,
      eventSoundFollowSoundId: 'follow.wav',
      eventTextFollowEnabled: true,
      eventTextFollowTemplate: '{displayName} followed!'
    })
    service.processEvent({
      ...makeFollowEvent(),
      raw: { simulated: true, suppressEventSound: true }
    })

    expect(soundboard.playSound).not.toHaveBeenCalled()
    expect(overlayServer.pushAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'Alice followed!'
      }),
      'tiktok'
    )
  })

  it('routes superfan alert sounds for subscription events to the overlay', () => {
    const soundboard = { playSound: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => ({ alertClientCount: 1 }))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    service.applySettings({
      ...DEFAULT_APP_SETTINGS,
      eventSoundSuperfanEnabled: true,
      eventSoundSuperfanSoundId: 'superfan.wav',
      eventSoundSuperfanVolume: 0.8,
      eventTextSuperfanEnabled: true,
      eventTextSuperfanTemplate: '{displayName} joined {tier} for {months} months!'
    })
    service.processEvent(makeSubscriptionEvent())

    expect(soundboard.playSound).not.toHaveBeenCalled()
    expect(overlayServer.pushAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        template: expect.stringContaining('Alice joined Superfan for 3 months!'),
        audioUrl: 'superfan.wav',
        audioVolume: 0.8
      }),
      'tiktok'
    )
  })

  it('treats fan club join events as superfan alerts without repeating immediately', () => {
    const soundboard = { playSound: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => ({ alertClientCount: 1 }))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    service.applySettings({
      ...DEFAULT_APP_SETTINGS,
      eventSoundSuperfanEnabled: true,
      eventSoundSuperfanSoundId: 'superfan.wav',
      eventTextSuperfanEnabled: false
    })
    const joinEvent = makeJoinEvent()
    service.processEvent(joinEvent)
    service.processEvent(joinEvent)

    // Two identical join events back-to-back should only fire the overlay
    // alert once (dedupe). The renderer is never asked to play; the overlay
    // is the single audio path.
    expect(soundboard.playSound).not.toHaveBeenCalled()
    expect(overlayServer.pushAlert).toHaveBeenCalledTimes(1)
  })

  it('routes alerts by platform and event type', () => {
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => ({ alertClientCount: 1 }))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    service.applySettings({
      ...DEFAULT_APP_SETTINGS,
      alertRules: [
        {
          ...DEFAULT_APP_SETTINGS.alertRules[0],
          id: 'twitch-follows',
          name: 'Twitch follows',
          platforms: ['twitch'],
          eventTypes: ['follow'],
          soundEnabled: true,
          soundId: 'twitch-follow.wav',
          textTemplate: '{displayName} followed on {platform}'
        }
      ]
    })

    service.processEvent({ ...makeFollowEvent(), platform: 'tiktok' })
    service.processEvent({ ...makeFollowEvent(), platform: 'twitch' })

    // Only the twitch event matches; the alert routes to the overlay (not the
    // renderer) with the configured sound URL.
    expect(soundboard.playSound).not.toHaveBeenCalled()
    expect(overlayServer.pushAlert).toHaveBeenCalledTimes(1)
    expect(overlayServer.pushAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'Alice followed on twitch',
        audioUrl: 'twitch-follow.wav'
      }),
      'twitch'
    )
  })

  it('supports non-TikTok event routes such as raids', () => {
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => ({ alertClientCount: 1 }))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    service.applySettings({
      ...DEFAULT_APP_SETTINGS,
      alertRules: [
        {
          ...DEFAULT_APP_SETTINGS.alertRules[0],
          id: 'raid-route',
          name: 'Raid route',
          platforms: ['all'],
          eventTypes: ['raid'],
          soundEnabled: false,
          textEnabled: true,
          textTemplate: '{displayName} raided with {viewerCount} viewers'
        }
      ]
    })

    service.processEvent({
      id: 'raid-1',
      platform: 'kick',
      timestamp: new Date(),
      type: 'raid',
      raw: {},
      user: makeUser(),
      viewerCount: 42
    })

    expect(overlayServer.pushAlert).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'Alice raided with 42 viewers' }),
      'kick'
    )
  })
})

function makeUser(): UserInfo {
  return {
    id: 'alice',
    username: 'alice',
    displayName: 'Alice',
    isModerator: false,
    isSubscriber: false,
    isVip: false,
    badges: []
  }
}

function makeGiftEvent(): GiftEvent {
  return {
    id: 'gift-1',
    platform: 'tiktok',
    timestamp: new Date(),
    type: 'gift',
    raw: {},
    user: makeUser(),
    giftName: 'Rose',
    giftId: 'rose',
    giftCount: 1,
    monetaryValue: 1,
    isCombo: false
  }
}

function makeFollowEvent(): FollowEvent {
  return {
    id: 'follow-1',
    platform: 'tiktok',
    timestamp: new Date(),
    type: 'follow',
    raw: {},
    user: makeUser()
  }
}

function makeSubscriptionEvent(): SubscriptionEvent {
  return {
    id: 'sub-1',
    platform: 'tiktok',
    timestamp: new Date(),
    type: 'subscription',
    raw: {},
    user: makeUser(),
    tier: 'Superfan',
    months: 3,
    isGift: false
  }
}

function makeJoinEvent(): JoinEvent {
  return {
    id: 'join-1',
    platform: 'tiktok',
    timestamp: new Date(),
    type: 'join',
    raw: {},
    user: {
      ...makeUser(),
      isFanClubMember: true
    }
  }
}
