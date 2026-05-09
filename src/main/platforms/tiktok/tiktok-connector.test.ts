import { describe, expect, it } from 'vitest'
import {
  buildTikTokConnectionOptions,
  buildTikTokConnectionOptionCandidates,
  isFatalTikTokConnectionErrorMessage,
  isTikTokFollowSocialPayload,
  mapTikTokUserInfo
} from './tiktok-connector'

describe('TikTokConnector connection hardening', () => {
  it('uses resilient websocket options for live sessions', () => {
    const options = buildTikTokConnectionOptions({
      platform: 'tiktok',
      enabled: true,
      username: 'creator',
      sessionId: 'session-id',
      ttTargetIdc: 'useast1a',
      signApiKey: 'sign-key'
    })

    expect(options).toEqual(
      expect.objectContaining({
        sessionId: 'session-id',
        ttTargetIdc: 'useast1a',
        signApiKey: 'sign-key',
        processInitialData: false,
        fetchRoomInfoOnConnect: true,
        enableRequestPolling: true,
        connectWithUniqueId: false,
        requestPollingIntervalMs: 1500,
        webClientOptions: { timeout: 15_000 },
        wsClientOptions: { handshakeTimeout: 15_000 }
      })
    )
  })

  it('keeps fallback connection modes available for TikTok room lookup flakiness', () => {
    const candidates = buildTikTokConnectionOptionCandidates({
      platform: 'tiktok',
      enabled: true,
      username: 'creator',
      signApiKey: 'sign-key'
    })

    expect(candidates.map((candidate) => candidate.name)).toEqual([
      'room-info',
      'unique-id-direct',
      'room-info-no-polling'
    ])
  })

  it('does not treat transient room-state messages as fatal', () => {
    expect(isFatalTikTokConnectionErrorMessage('LIVE has ended')).toBe(false)
    expect(isFatalTikTokConnectionErrorMessage('TikTok WebSocket closed')).toBe(false)
    expect(isFatalTikTokConnectionErrorMessage('Too many connections started, try again later')).toBe(false)
  })

  it('still treats invalid creator identities as fatal', () => {
    expect(isFatalTikTokConnectionErrorMessage('User not found')).toBe(true)
    expect(isFatalTikTokConnectionErrorMessage('Invalid username')).toBe(true)
    expect(isFatalTikTokConnectionErrorMessage('user does not exist')).toBe(true)
  })

  it('recognizes follow social payloads from TikTok display metadata', () => {
    expect(
      isTikTokFollowSocialPayload({
        common: {
          displayText: {
            displayType: 'pm_mt_msg_viewer_follow_anchor'
          }
        }
      })
    ).toBe(true)

    expect(
      isTikTokFollowSocialPayload({
        common: {
          displayText: {
            displayType: 'pm_mt_msg_viewer_share'
          }
        }
      })
    ).toBe(false)
  })

  it('maps TikTok followInfo followStatus as follower permission', () => {
    const user = mapTikTokUserInfo({
      userId: '123',
      uniqueId: 'StreamFriend',
      nickname: 'Stream Friend',
      followInfo: { followStatus: 1 },
      userBadges: []
    })

    expect(user.username).toBe('streamfriend')
    expect(user.displayName).toBe('Stream Friend')
    expect(user.isFollower).toBe(true)
  })

  it('maps TikTok user identity follower flags as follower permission', () => {
    const user = mapTikTokUserInfo({
      userId: '456',
      uniqueId: 'MutualFriend',
      nickname: 'Mutual Friend',
      userIdentity: { isMutualFollowingWithAnchor: true },
      userBadges: [{ type: 'image', name: 'Viewer badge' }]
    })

    expect(user.isFollower).toBe(true)
  })
})
