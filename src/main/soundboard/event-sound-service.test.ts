import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_APP_SETTINGS } from '../../shared/app-settings'
import type { FollowEvent, GiftEvent, JoinEvent, SubscriptionEvent, UserInfo } from '../platforms/types'
import { EventSoundService } from './event-sound-service'

describe('EventSoundService', () => {
  it('plays the configured gift sound for gift events', () => {
    vi.useFakeTimers()
    const soundboard = { playSound: vi.fn() }
    const overlayServer = { pushAlert: vi.fn() }
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

      expect(soundboard.playSound).toHaveBeenCalledWith('gift.mp3', 0.65)
    } finally {
      vi.useRealTimers()
    }
  })

  it('plays the configured follow sound for follow events', () => {
    const soundboard = { playSound: vi.fn() }
    const overlayServer = { pushAlert: vi.fn() }
    const service = new EventSoundService(soundboard, overlayServer)

    service.applySettings({
      ...DEFAULT_APP_SETTINGS,
      eventSoundFollowEnabled: true,
      eventSoundFollowSoundId: 'follow.wav',
      eventSoundFollowVolume: 0.4
    })
    service.processEvent(makeFollowEvent())

    expect(soundboard.playSound).toHaveBeenCalledWith('follow.wav', 0.4)
  })

  it('does not play missing or disabled event sounds', () => {
    const soundboard = { playSound: vi.fn() }
    const overlayServer = { pushAlert: vi.fn() }
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
    const overlayServer = { pushAlert: vi.fn() }
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

  it('plays superfan alerts from subscription events', () => {
    const soundboard = { playSound: vi.fn() }
    const overlayServer = { pushAlert: vi.fn() }
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

    expect(soundboard.playSound).toHaveBeenCalledWith('superfan.wav', 0.8)
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
    const overlayServer = { pushAlert: vi.fn() }
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

    expect(soundboard.playSound).toHaveBeenCalledTimes(1)
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
