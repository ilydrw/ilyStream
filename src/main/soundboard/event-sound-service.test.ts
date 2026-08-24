import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_APP_SETTINGS, resolveAppSettings } from '../../shared/app-settings'
import type { OverlayRuntimeStatus } from '../../shared/overlay'
import type { FollowEvent, GiftEvent, JoinEvent, LikeEvent, SubscriptionEvent, UserInfo } from '../platforms/types'
import { EventSoundService } from './event-sound-service'

function makeOverlayStatus(alertClientCount: number): OverlayRuntimeStatus {
  return {
    running: true,
    port: 3000,
    requestedPort: 3000,
    lastError: null,
    startedAt: null,
    chatUrl: null,
    alertsUrl: null,
    goalsUrl: null,
    healthUrl: null,
    chatClientCount: 0,
    alertClientCount,
    goalClientCount: 0
  }
}

describe('EventSoundService', () => {
  it('routes alert audio to the overlay when an overlay client is connected', () => {
    vi.useFakeTimers()
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(1))
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
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(0))
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
      expect(overlayServer.pushAlert).toHaveBeenCalledWith(
        expect.objectContaining({ audioUrl: undefined }),
        'tiktok'
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not replay local audio when the same platform event id is delivered twice', () => {
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(0))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    service.applySettings({
      ...DEFAULT_APP_SETTINGS,
      eventSoundFollowEnabled: true,
      eventSoundFollowSoundId: 'follow.wav',
      eventSoundFollowVolume: 0.4,
      eventTextFollowEnabled: true
    })

    const follow = makeFollowEvent()
    service.processEvent(follow)
    service.processEvent(follow)

    expect(soundboard.playSound).toHaveBeenCalledTimes(1)
    expect(overlayServer.pushAlert).toHaveBeenCalledTimes(2)
    expect(overlayServer.pushAlert.mock.calls.every(([payload]) => payload.audioUrl === undefined)).toBe(true)
  })

  it('ignores in-progress gift combo updates and fires only the final gift', () => {
    vi.useFakeTimers()
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(0))
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

  it('does not hold final gift alerts for the old half-second debounce', () => {
    vi.useFakeTimers()
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(0))
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
      vi.advanceTimersByTime(149)
      expect(overlayServer.pushAlert).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1)
      expect(overlayServer.pushAlert).toHaveBeenCalledTimes(1)
      expect(soundboard.playSound).toHaveBeenCalledWith('gift.mp3', 0.65)
    } finally {
      vi.useRealTimers()
    }
  })

  it('routes category-scoped alert sound ids to the overlay (not the renderer)', () => {
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(1))
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

  it('passes the full per-rule card style through to the overlay payload', () => {
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(1))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    service.applySettings(resolveAppSettings({
      alertRules: [
        {
          ...DEFAULT_APP_SETTINGS.alertRules[1],
          backgroundColor: '#102030',
          backgroundOpacity: 0,
          borderWidth: 4,
          borderRadius: 18,
          imageSize: 96,
          imagePlacement: 'right',
          textAlign: 'left',
          paddingX: 12,
          paddingY: 8,
          alertTop: 72,
          alertLeft: 25
        }
      ]
    }))
    service.processEvent(makeFollowEvent())

    expect(overlayServer.pushAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        backgroundColor: '#102030',
        backgroundOpacity: 0,
        borderWidth: 4,
        borderRadius: 18,
        imageSize: 96,
        imagePlacement: 'right',
        textAlign: 'left',
        paddingX: 12,
        paddingY: 8,
        // Per-rule screen position overrides the global alert position.
        alertTop: 72,
        alertLeft: 25
      }),
      'tiktok'
    )
  })

  it('defers to the global alert position when a rule has no position override', () => {
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(1))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    service.applySettings(resolveAppSettings({
      alertTop: 33,
      alertLeft: 66,
      alertRules: [
        {
          ...DEFAULT_APP_SETTINGS.alertRules[1],
          alertTop: -1,
          alertLeft: -1
        }
      ]
    }))
    service.processEvent(makeFollowEvent())

    expect(overlayServer.pushAlert).toHaveBeenCalledWith(
      expect.objectContaining({ alertTop: 33, alertLeft: 66 }),
      'tiktok'
    )
  })

  it('routes the configured follow sound to the overlay (not the renderer) for follow events', () => {
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(1))
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
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(1))
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
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(1))
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
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(1))
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

  it('plays simulated alert tests once through the local soundboard', () => {
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(1))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    service.applySettings({
      ...DEFAULT_APP_SETTINGS,
      eventSoundFollowEnabled: true,
      eventSoundFollowSoundId: 'follow.wav',
      eventSoundFollowVolume: 0.4,
      eventTextFollowEnabled: true,
      eventTextFollowTemplate: '{displayName} followed!'
    })
    service.processEvent({
      ...makeFollowEvent(),
      raw: { simulated: true }
    })

    expect(soundboard.playSound).toHaveBeenCalledTimes(1)
    expect(soundboard.playSound).toHaveBeenCalledWith('follow.wav', 0.4)
    expect(overlayServer.pushAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'Alice followed!',
        audioUrl: undefined
      }),
      'tiktok'
    )
  })

  it('omits overlay audio when local monitoring already owns playback', () => {
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(1))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    service.applySettings(resolveAppSettings({
      alertSoundLocalMonitoring: true,
      eventSoundFollowVolume: 0.55,
      alertRules: [
        {
          ...DEFAULT_APP_SETTINGS.alertRules[1],
          soundEnabled: true,
          soundId: 'alerts/follow-drop.mp3',
          soundVolume: 0.55
        }
      ]
    }))
    service.processEvent(makeFollowEvent())

    expect(soundboard.playSound).toHaveBeenCalledWith('alerts/follow-drop.mp3', 0.55)
    expect(overlayServer.pushAlert).toHaveBeenCalledWith(
      expect.objectContaining({ audioUrl: undefined }),
      'tiktok'
    )
  })

  it('does not let gifted-sub batch dedupe silence repeated simulated tests', () => {
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(1))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    service.applySettings({
      ...DEFAULT_APP_SETTINGS,
      eventSoundSuperfanEnabled: true,
      eventSoundSuperfanSoundId: 'sub.wav',
      eventSoundSuperfanVolume: 0.8
    })

    for (let index = 1; index <= 2; index += 1) {
      service.processEvent({
        ...makeSubscriptionEvent(),
        id: `simulated-gift-sub-${index}`,
        platform: 'twitch',
        tier: '1000',
        isGift: true,
        raw: {
          simulated: true,
          gifterUserId: 'local-test-gifter',
          gifterDisplayName: 'Local Alert Test'
        }
      })
    }

    expect(soundboard.playSound).toHaveBeenCalledTimes(2)
    expect(soundboard.playSound).toHaveBeenNthCalledWith(1, 'sub.wav', 0.8)
    expect(soundboard.playSound).toHaveBeenNthCalledWith(2, 'sub.wav', 0.8)
    expect(overlayServer.pushAlert.mock.calls.every(([payload]) => payload.audioUrl === undefined)).toBe(true)
  })

  it('uses the gifter and readable tier for the default Twitch gift-sub alert', () => {
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(1))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    service.applySettings({
      ...DEFAULT_APP_SETTINGS,
      eventTextSuperfanEnabled: true,
      eventTextSuperfanTemplate: '{displayName} joined {tier} for {months} months!'
    })
    service.processEvent({
      ...makeSubscriptionEvent(),
      platform: 'twitch',
      tier: '1000',
      months: 1,
      isGift: true,
      raw: {
        gifter: 'eastons76',
        gifterUserId: '623683411',
        gifterDisplayName: 'Eastons76'
      },
      user: {
        ...makeSubscriptionEvent().user,
        username: 'cikezzee',
        displayName: 'Cikezzee'
      }
    })

    expect(overlayServer.pushAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'Eastons76 gifted Cikezzee a Tier 1 subscription!'
      }),
      'twitch'
    )
  })

  it('plays gifted-sub audio once for a Twitch multi-sub batch', () => {
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(1))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    service.applySettings({
      ...DEFAULT_APP_SETTINGS,
      eventSoundSuperfanEnabled: true,
      eventSoundSuperfanSoundId: 'sub.wav',
      eventSoundSuperfanVolume: 0.8,
      eventTextSuperfanEnabled: true
    })

    for (let index = 1; index <= 5; index += 1) {
      service.processEvent({
        ...makeSubscriptionEvent(),
        id: `gift-sub-${index}`,
        platform: 'twitch',
        tier: '1000',
        months: 1,
        isGift: true,
        raw: {
          gifter: 'batchgifter',
          gifterUserId: 'gifter-1',
          gifterDisplayName: 'BatchGifter'
        },
        user: {
          ...makeSubscriptionEvent().user,
          id: `recipient-${index}`,
          username: `recipient${index}`,
          displayName: `Recipient ${index}`
        }
      })
    }

    service.processEvent({
      ...makeSubscriptionEvent(),
      id: 'other-gifter-sub',
      platform: 'twitch',
      tier: '1000',
      months: 1,
      isGift: true,
      raw: {
        gifter: 'anothergifter',
        gifterUserId: 'gifter-2',
        gifterDisplayName: 'AnotherGifter'
      }
    })

    expect(overlayServer.pushAlert).toHaveBeenCalledTimes(6)
    const alertsWithAudio = overlayServer.pushAlert.mock.calls
      .map(([payload]) => payload)
      .filter((payload) => payload.audioUrl === 'sub.wav')
    expect(alertsWithAudio).toHaveLength(2)
    expect(soundboard.playSound).not.toHaveBeenCalled()
  })

  it('routes TikTok Super Fan Box gifts through the subscription alert', () => {
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(1))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    service.applySettings({
      ...DEFAULT_APP_SETTINGS,
      eventSoundGiftEnabled: true,
      eventSoundGiftSoundId: 'gift.wav',
      eventSoundSuperfanEnabled: true,
      eventSoundSuperfanSoundId: 'sub.wav',
      eventTextSuperfanEnabled: true,
      eventTextSuperfanTemplate: '{displayName} sent a {tier}!'
    })
    service.processEvent({
      ...makeGiftEvent(),
      id: 'super-fan-box-1',
      giftName: 'Super Fan Box',
      giftId: 'super-fan-box',
      isSuperFanBox: true
    })

    expect(overlayServer.pushAlert).toHaveBeenCalledTimes(1)
    expect(overlayServer.pushAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'subscription',
        template: 'Alice sent a Super Fan Box!',
        audioUrl: 'sub.wav'
      }),
      'tiktok'
    )
    expect(soundboard.playSound).not.toHaveBeenCalled()
  })

  it('treats fan club join events as superfan alerts without repeating immediately', () => {
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(1))
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
      getStatus: vi.fn(() => makeOverlayStatus(1))
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
      getStatus: vi.fn(() => makeOverlayStatus(1))
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

  it('fires only the highest-priority matching alert route for one event', () => {
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(1))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    service.applySettings({
      ...DEFAULT_APP_SETTINGS,
      alertRules: [
        {
          ...DEFAULT_APP_SETTINGS.alertRules[1],
          id: 'low-follow-route',
          name: 'Low follow route',
          priority: 10,
          textTemplate: 'Low priority follow'
        },
        {
          ...DEFAULT_APP_SETTINGS.alertRules[1],
          id: 'high-follow-route',
          name: 'High follow route',
          priority: 200,
          textTemplate: 'High priority follow'
        }
      ]
    })

    service.processEvent(makeFollowEvent())

    expect(overlayServer.pushAlert).toHaveBeenCalledTimes(1)
    expect(overlayServer.pushAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'follow-1:high-follow-route',
        template: 'High priority follow'
      }),
      'tiktok'
    )
  })

  it('renders default gift and follow alerts with their rule styling (no hardcoded variant)', () => {
    vi.useFakeTimers()
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(1))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    try {
      service.applySettings(resolveAppSettings({}))
      service.processEvent(makeFollowEvent())
      service.processEvent({ ...makeGiftEvent(), giftCount: 3 })
      vi.advanceTimersByTime(200)

      // Alerts must carry the rule's own styling (border, template) and NOT be
      // overridden by a hardcoded "clean" variant — otherwise the editor's
      // Style controls (border colour, etc.) do nothing.
      const followCall = overlayServer.pushAlert.mock.calls.find((c: any[]) => c[0].eventType === 'follow')
      expect(followCall).toBeTruthy()
      expect(followCall![0].variant).toBeUndefined()
      expect(followCall![0].borderColor).toBe('rgba(56, 189, 248, 0.24)')
      expect(followCall![0].template).toContain('Alice')

      const giftCall = overlayServer.pushAlert.mock.calls.find((c: any[]) => c[0].eventType === 'gift')
      expect(giftCall).toBeTruthy()
      expect(giftCall![0].variant).toBeUndefined()
      expect(giftCall![0].borderColor).toBe('rgba(247, 201, 72, 0.26)')
      expect(giftCall![0].template).toContain('Rose')
    } finally {
      vi.useRealTimers()
    }
  })

  it('globally suppresses repeated low-value TikTok gift alerts', () => {
    vi.useFakeTimers()
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(1))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    try {
      service.applySettings(resolveAppSettings({
        ...DEFAULT_APP_SETTINGS,
        alertRules: [{
          ...DEFAULT_APP_SETTINGS.alertRules[0],
          cooldownMs: 0,
          soundEnabled: true,
          soundId: 'gift.mp3'
        }]
      }))

      service.processEvent({ ...makeGiftEvent(), id: 'cheap-1', user: { ...makeUser(), id: 'alice', username: 'alice' } })
      vi.advanceTimersByTime(200)
      service.processEvent({ ...makeGiftEvent(), id: 'cheap-2', user: { ...makeUser(), id: 'bob', username: 'bob' } })
      vi.advanceTimersByTime(200)

      expect(overlayServer.pushAlert).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(10_000)
      service.processEvent({ ...makeGiftEvent(), id: 'cheap-3', user: { ...makeUser(), id: 'cara', username: 'cara' } })
      vi.advanceTimersByTime(200)

      expect(overlayServer.pushAlert).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not suppress higher-value TikTok gifts during the low-value gift cooldown', () => {
    vi.useFakeTimers()
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(1))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    try {
      service.applySettings(resolveAppSettings({
        ...DEFAULT_APP_SETTINGS,
        alertRules: [{
          ...DEFAULT_APP_SETTINGS.alertRules[0],
          cooldownMs: 0,
          soundEnabled: true,
          soundId: 'gift.mp3'
        }]
      }))

      service.processEvent(makeGiftEvent())
      vi.advanceTimersByTime(200)
      service.processEvent({ ...makeGiftEvent(), id: 'gift-big', giftName: 'Galaxy', giftId: 'galaxy', monetaryValue: 500 })
      vi.advanceTimersByTime(200)

      expect(overlayServer.pushAlert).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('prefers a route-selected gift image over stale legacy gift image settings', () => {
    vi.useFakeTimers()
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(1))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    try {
      service.applySettings(resolveAppSettings({
        ...DEFAULT_APP_SETTINGS,
        eventImageGiftEnabled: false,
        eventImageGiftAssetId: 'legacy-gift.png',
        alertRules: [
          {
            ...DEFAULT_APP_SETTINGS.alertRules[0],
            imageEnabled: true,
            imageAssetId: 'route-gift.png'
          }
        ]
      }))

      service.processEvent(makeGiftEvent())
      vi.advanceTimersByTime(200)

      expect(overlayServer.pushAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUrl: 'route-gift.png'
        }),
        'tiktok'
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps legacy gift image fallback when a route has no selected image', () => {
    vi.useFakeTimers()
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(1))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    try {
      service.applySettings(resolveAppSettings({
        ...DEFAULT_APP_SETTINGS,
        eventImageGiftEnabled: true,
        eventImageGiftAssetId: 'legacy-gift.png',
        alertRules: [
          {
            ...DEFAULT_APP_SETTINGS.alertRules[0],
            imageAssetId: ''
          }
        ]
      }))

      service.processEvent(makeGiftEvent())
      vi.advanceTimersByTime(200)

      expect(overlayServer.pushAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUrl: 'legacy-gift.png'
        }),
        'tiktok'
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('plays the intro once per stream and re-arms only on a new stream session', () => {
    vi.useFakeTimers()
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(0))
    }
    const resolver = vi.fn((platform: string, username: string) =>
      platform === 'tiktok' && username === 'alice' ? 'viewer-alice' : null
    )
    const service = new EventSoundService(soundboard, overlayServer, resolver)

    try {
      service.applySettings(resolveAppSettings({
        ...DEFAULT_APP_SETTINGS,
        viewerJoinSounds: [{
          id: 'rule-1',
          viewerProfileId: 'viewer-alice',
          platform: 'all',
          username: '',
          soundId: 'join/airhorn.mp3',
          volume: 0.8,
          enabled: true
        }]
      }))

      service.handleConnectionStatus('tiktok', 'connected')

      const joinEvent = { ...makeJoinEvent(), user: { ...makeUser(), isFanClubMember: false } }
      service.processEvent(joinEvent)
      expect(soundboard.playSound).toHaveBeenCalledWith('join/airhorn.mp3', 0.8)

      // Rejoins stay silent — even much later in the same stream.
      service.processEvent(joinEvent)
      vi.advanceTimersByTime(16 * 60_000)
      service.processEvent(joinEvent)
      expect(soundboard.playSound).toHaveBeenCalledTimes(1)

      // A mid-stream reconnect blip does not re-arm.
      service.handleConnectionStatus('tiktok', 'disconnected')
      vi.advanceTimersByTime(30_000)
      service.handleConnectionStatus('tiktok', 'connected')
      vi.advanceTimersByTime(2 * 60_000)
      service.processEvent(joinEvent)
      expect(soundboard.playSound).toHaveBeenCalledTimes(1)

      // Stream ends; the next one starts 20 minutes later — that's a new
      // session, so the intro plays again.
      service.handleConnectionStatus('tiktok', 'disconnected')
      vi.advanceTimersByTime(20 * 60_000)
      service.handleConnectionStatus('tiktok', 'connected')
      service.processEvent(joinEvent)
      expect(soundboard.playSound).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('plays a linked viewer intro only once across TikTok and Twitch in the same stream', () => {
    vi.useFakeTimers()
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(0))
    }
    const resolver = vi.fn((platform: string, username: string) => {
      if (platform === 'tiktok' && username === 'alice_tok') return 'viewer-alice'
      if (platform === 'twitch' && username === 'alice_live') return 'viewer-alice'
      return null
    })
    const service = new EventSoundService(soundboard, overlayServer, resolver)

    try {
      service.applySettings(resolveAppSettings({
        ...DEFAULT_APP_SETTINGS,
        viewerJoinSounds: [{
          id: 'rule-linked-alice',
          viewerProfileId: 'viewer-alice',
          platform: 'all',
          username: '',
          soundId: 'join/airhorn.mp3',
          volume: 0.8,
          enabled: true
        }]
      }))
      service.handleConnectionStatus('tiktok', 'connected')
      service.handleConnectionStatus('twitch', 'connected')

      service.processEvent({
        ...makeJoinEvent(),
        user: { ...makeUser(), id: 'tt-alice', username: 'alice_tok', isFanClubMember: false }
      })
      service.processEvent({
        ...makeJoinEvent(),
        id: 'twitch-join-1',
        platform: 'twitch',
        user: { ...makeUser(), id: 'tw-alice', username: 'alice_live', isFanClubMember: false }
      })

      expect(soundboard.playSound).toHaveBeenCalledTimes(1)

      // A long Twitch drop is still the same stream while TikTok remains live.
      service.handleConnectionStatus('twitch', 'disconnected')
      vi.advanceTimersByTime(20 * 60_000)
      service.handleConnectionStatus('twitch', 'connected')
      service.processEvent({
        ...makeJoinEvent(),
        id: 'twitch-join-2',
        platform: 'twitch',
        user: { ...makeUser(), id: 'tw-alice', username: 'alice_live', isFanClubMember: false }
      })
      expect(soundboard.playSound).toHaveBeenCalledTimes(1)

      // Once every stream platform has been down long enough, a connection
      // begins a new shared stream session and the intro re-arms.
      service.handleConnectionStatus('tiktok', 'disconnected')
      service.handleConnectionStatus('twitch', 'disconnected')
      vi.advanceTimersByTime(20 * 60_000)
      service.handleConnectionStatus('twitch', 'connected')
      service.processEvent({
        ...makeJoinEvent(),
        id: 'twitch-join-next-stream',
        platform: 'twitch',
        user: { ...makeUser(), id: 'tw-alice', username: 'alice_live', isFanClubMember: false }
      })

      expect(soundboard.playSound).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('matches username-scoped join sounds without a viewer profile', () => {
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(0))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    service.applySettings(resolveAppSettings({
      ...DEFAULT_APP_SETTINGS,
      viewerJoinSounds: [{
        id: 'rule-2',
        viewerProfileId: '',
        platform: 'tiktok',
        username: '@Alice',
        soundId: 'join/hello.mp3',
        volume: 1,
        enabled: true
      }]
    }))

    service.processEvent({ ...makeJoinEvent(), user: { ...makeUser(), isFanClubMember: false } })
    expect(soundboard.playSound).toHaveBeenCalledWith('join/hello.mp3', 1)
  })

  it('queues join sounds in the alert overlay when it is the active audio sink', () => {
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(1))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    service.applySettings(resolveAppSettings({
      ...DEFAULT_APP_SETTINGS,
      viewerJoinSounds: [{
        id: 'rule-overlay',
        viewerProfileId: '',
        platform: 'tiktok',
        username: 'alice',
        soundId: 'join/hello.mp3',
        volume: 0.7,
        enabled: true
      }]
    }))

    service.processEvent({ ...makeJoinEvent(), user: { ...makeUser(), isFanClubMember: false } })

    expect(soundboard.playSound).not.toHaveBeenCalled()
    expect(overlayServer.pushAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringContaining(':join:rule-overlay'),
        audioUrl: 'join/hello.mp3',
        audioVolume: 0.7
      }),
      'tiktok'
    )
  })

  it('fires the intro sound on first activity when TikTok never sends a join event', () => {
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(0))
    }
    const resolver = vi.fn((platform: string, username: string) =>
      platform === 'tiktok' && username === 'alice' ? 'viewer-alice' : null
    )
    const service = new EventSoundService(soundboard, overlayServer, resolver)

    service.applySettings(resolveAppSettings({
      ...DEFAULT_APP_SETTINGS,
      viewerJoinSounds: [{
        id: 'rule-3',
        viewerProfileId: 'viewer-alice',
        platform: 'all',
        username: '',
        soundId: 'join/airhorn.mp3',
        volume: 0.9,
        enabled: true
      }]
    }))

    // No join event ever arrives — the viewer only ever likes. The intro must
    // still fire on that first like, then stay quiet for repeat activity.
    const like = {
      id: 'like-1', platform: 'tiktok' as const, timestamp: new Date(), type: 'like' as const,
      raw: {}, user: { ...makeUser(), isFanClubMember: false }, likeCount: 1, totalLikes: 1
    }
    service.processEvent(like)
    service.processEvent({ ...like, id: 'like-2' })

    expect(soundboard.playSound).toHaveBeenCalledTimes(1)
    expect(soundboard.playSound).toHaveBeenCalledWith('join/airhorn.mp3', 0.9)
  })

  it('never replays the intro mid-stream, even after a long viewer absence', () => {
    vi.useFakeTimers()
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(0))
    }
    const service = new EventSoundService(soundboard, overlayServer)

    try {
      service.applySettings(resolveAppSettings({
        ...DEFAULT_APP_SETTINGS,
        viewerJoinSounds: [{
          id: 'rule-present',
          viewerProfileId: '',
          platform: 'tiktok',
          username: 'alice',
          soundId: 'join/airhorn.mp3',
          volume: 0.8,
          enabled: true
        }]
      }))
      service.handleConnectionStatus('tiktok', 'connected')

      const like = {
        id: 'like-1', platform: 'tiktok' as const, timestamp: new Date(), type: 'like' as const,
        raw: {}, user: { ...makeUser(), isFanClubMember: false }, likeCount: 1, totalLikes: 1
      }

      // Joins at t=0, stays active for half an hour, goes quiet for 20 minutes,
      // then engages again. The stream never ended — one intro, total.
      service.processEvent({ ...makeJoinEvent(), user: { ...makeUser(), isFanClubMember: false } })
      for (let i = 1; i <= 6; i++) {
        vi.advanceTimersByTime(5 * 60_000)
        service.processEvent({ ...like, id: `like-${i}` })
      }
      vi.advanceTimersByTime(20 * 60_000)
      service.processEvent({ ...like, id: 'like-return' })

      expect(soundboard.playSound).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the once-per-stream dedupe when viewer profile resolution changes mid-stream', () => {
    vi.useFakeTimers()
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(0))
    }
    // First lookup: no profile yet. Second lookup: a profile id appears (e.g.
    // the stats service auto-created one). The cooldown key must not flip.
    let resolvedId: string | null = null
    const resolver = vi.fn(() => resolvedId)
    const service = new EventSoundService(soundboard, overlayServer, resolver)

    try {
      service.applySettings(resolveAppSettings({
        ...DEFAULT_APP_SETTINGS,
        viewerJoinSounds: [{
          id: 'rule-flip',
          viewerProfileId: '',
          platform: 'tiktok',
          username: 'alice',
          soundId: 'join/airhorn.mp3',
          volume: 0.8,
          enabled: true
        }]
      }))

      service.processEvent({ ...makeJoinEvent(), user: { ...makeUser(), isFanClubMember: false } })
      expect(soundboard.playSound).toHaveBeenCalledTimes(1)

      resolvedId = 'viewer-alice'
      vi.advanceTimersByTime(2 * 60_000)
      service.processEvent({ ...makeJoinEvent(), id: 'join-2', user: { ...makeUser(), isFanClubMember: false } })
      expect(soundboard.playSound).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('fires the optional TikTok milestone once at 10,000 likes and uses the fallback sound', () => {
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(0))
    }
    const service = new EventSoundService(soundboard, overlayServer)
    service.applySettings(resolveAppSettings({
      eventLikeMilestoneEnabled: true,
      eventLikeMilestoneRepeatEnabled: false,
      eventLikeMilestoneTemplate: 'Amazing, {displayName} — {milestoneLikes} likes!',
      eventLikeMilestoneFallbackSoundId: 'alerts/thanks.mp3',
      eventLikeMilestoneFallbackVolume: 0.6,
      eventLikeMilestoneDurationMs: 7000
    }))

    const event = makeLikeEvent({ profilePictureUrl: 'https://example.test/alice.png' })
    service.processEvent(event, { acceptedAmount: 2, viewerTotal: 10_000 })
    service.processEvent({ ...event, id: 'like-20k' }, { acceptedAmount: 1, viewerTotal: 20_000 })

    expect(soundboard.playSound).toHaveBeenCalledTimes(1)
    expect(soundboard.playSound).toHaveBeenCalledWith('alerts/thanks.mp3', 0.6)
    expect(overlayServer.pushAlert).toHaveBeenCalledTimes(1)
    expect(overlayServer.pushAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'like-milestone:like-milestone:10000',
        eventType: 'like-milestone',
        variant: 'clean-like-milestone',
        headline: 'Alice',
        subtitle: 'Amazing, Alice — 10,000 likes!',
        meta: '10,000 likes',
        imageUrl: 'https://example.test/alice.png',
        durationMs: 7000,
        audioUrl: undefined
      }),
      'tiktok'
    )
  })

  it('keeps milestone audio local when monitoring is enabled', () => {
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(1))
    }
    const service = new EventSoundService(soundboard, overlayServer)
    service.applySettings(resolveAppSettings({
      alertSoundLocalMonitoring: true,
      eventLikeMilestoneEnabled: true,
      eventLikeMilestoneFallbackSoundId: 'alerts/thanks.mp3',
      eventLikeMilestoneFallbackVolume: 0.6
    }))

    service.processEvent(makeLikeEvent(), { acceptedAmount: 1, viewerTotal: 10_000 })

    expect(soundboard.playSound).toHaveBeenCalledWith('alerts/thanks.mp3', 0.6)
    expect(overlayServer.pushAlert).toHaveBeenCalledWith(
      expect.objectContaining({ audioUrl: undefined }),
      'tiktok'
    )
  })

  it('repeats at every crossed 10,000-like boundary when enabled', () => {
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(0))
    }
    const service = new EventSoundService(soundboard, overlayServer)
    service.applySettings(resolveAppSettings({
      eventLikeMilestoneEnabled: true,
      eventLikeMilestoneRepeatEnabled: true,
      eventLikeMilestoneFallbackSoundId: 'thanks.wav'
    }))

    const event = makeLikeEvent()
    service.processEvent(event, { acceptedAmount: 1, viewerTotal: 10_000 })
    service.processEvent({ ...event, id: 'like-20k' }, { acceptedAmount: 1, viewerTotal: 20_000 })
    service.processEvent({ ...event, id: 'like-30k' }, { acceptedAmount: 1, viewerTotal: 30_000 })
    service.processEvent({ ...event, id: 'duplicate-30k' }, undefined)

    expect(soundboard.playSound).toHaveBeenCalledTimes(3)
    expect(overlayServer.pushAlert.mock.calls.map(([payload]) => payload.meta)).toEqual([
      '10,000 likes',
      '20,000 likes',
      '30,000 likes'
    ])
  })

  it('prefers the viewer intro sound and routes milestone audio through a connected overlay', () => {
    const soundboard = { playSound: vi.fn(), stopAll: vi.fn() }
    const overlayServer = {
      pushAlert: vi.fn(),
      getStatus: vi.fn(() => makeOverlayStatus(1))
    }
    const resolver = vi.fn(() => 'viewer-alice')
    const service = new EventSoundService(soundboard, overlayServer, resolver)
    service.applySettings(resolveAppSettings({
      eventLikeMilestoneEnabled: true,
      eventLikeMilestoneFallbackSoundId: 'alerts/fallback.mp3',
      viewerJoinSounds: [{
        id: 'alice-intro',
        viewerProfileId: 'viewer-alice',
        platform: 'all',
        username: '',
        soundId: 'join/alice.wav',
        volume: 0.75,
        enabled: true
      }]
    }))

    service.processEvent(makeLikeEvent(), { acceptedAmount: 1, viewerTotal: 10_000 })

    expect(soundboard.playSound).not.toHaveBeenCalled()
    expect(overlayServer.pushAlert).toHaveBeenCalledTimes(1)
    expect(overlayServer.pushAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'like-milestone:like-milestone:10000',
        audioUrl: 'join/alice.wav',
        audioVolume: 0.75
      }),
      'tiktok'
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

function makeLikeEvent(userOverrides: Partial<UserInfo> = {}): LikeEvent {
  return {
    id: 'like-milestone',
    platform: 'tiktok',
    timestamp: new Date(),
    type: 'like',
    raw: {},
    user: { ...makeUser(), ...userOverrides },
    likeCount: 1,
    totalLikes: 10_000
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
    isGift: false,
    monetaryValue: 0
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
