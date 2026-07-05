import { EventEmitter } from 'events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildTikTokConnectionOptions,
  buildTikTokConnectionOptionCandidates,
  isFatalTikTokConnectionErrorMessage,
  isTikTokOfflineErrorMessage,
  isTikTokFollowSocialPayload,
  isTikTokLikeSocialPayload,
  mapTikTokUserInfo,
  TikTokConnector
} from './tiktok-connector'

describe('TikTokConnector connection hardening', () => {
  afterEach(() => {
    vi.doUnmock('tiktok-live-connector')
  })

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

  it('reports host sender readiness as the TikTok outbound chat capability', () => {
    const connector = new TikTokConnector({} as any, {
      getStatus: vi.fn().mockReturnValue({
        isChatReady: false,
        statusMessage: 'Log in to TikTok in the sender window'
      })
    } as any)

    expect(connector.getChatCapability()).toEqual({
      platform: 'tiktok',
      canSend: false,
      reason: 'Log in to TikTok in the sender window'
    })
  })

  it('surfaces host sender failures when outbound TikTok chat sending fails', async () => {
    const connector = new TikTokConnector({} as any, {
      sendMessage: vi.fn().mockResolvedValue(false),
      getStatus: vi.fn().mockReturnValue({
        isChatReady: true,
        lastError: 'TikTok chat input was not found'
      }),
      captureAuthCredentials: vi.fn().mockResolvedValue({ sessionId: null, ttTargetIdc: null, loggedIn: false })
    } as any)

    await expect(connector.sendChatMessage('hello')).rejects.toThrow('TikTok chat input was not found')
  })

  it('sends outbound chat through the authenticated TikTok live connector when cookies are configured', async () => {
    const sendMessage = vi.fn().mockResolvedValue({})
    const connector = new TikTokConnector({} as any, {
      sendMessage: vi.fn(),
      getStatus: vi.fn().mockReturnValue({ isChatReady: false }),
      captureAuthCredentials: vi.fn()
    } as any)
    ;(connector as any).connection = { sendMessage }
    ;(connector as any).activeConfig = {
      platform: 'tiktok',
      enabled: true,
      username: 'creator',
      sessionId: 'session-id',
      ttTargetIdc: 'useast2a'
    }

    await connector.sendChatMessage('hello host chat')

    expect(sendMessage).toHaveBeenCalledWith('hello host chat', {
      sessionId: 'session-id',
      ttTargetIdc: 'useast2a'
    })
  })

  it('captures sender-window cookies for the authenticated TikTok live send path', async () => {
    const sendMessage = vi.fn().mockResolvedValue({})
    const captureAuthCredentials = vi.fn().mockResolvedValue({
      sessionId: 'captured-session',
      ttTargetIdc: 'useast1a',
      loggedIn: true
    })
    const connector = new TikTokConnector({} as any, {
      sendMessage: vi.fn(),
      getStatus: vi.fn().mockReturnValue({ isChatReady: false }),
      captureAuthCredentials
    } as any)
    ;(connector as any).connection = { sendMessage }
    ;(connector as any).activeConfig = {
      platform: 'tiktok',
      enabled: true,
      username: 'creator'
    }

    await connector.sendChatMessage('captured cookie send')

    expect(captureAuthCredentials).toHaveBeenCalled()
    expect(sendMessage).toHaveBeenCalledWith('captured cookie send', {
      sessionId: 'captured-session',
      ttTargetIdc: 'useast1a'
    })
  })

  it('falls back to the host sender window when authenticated TikTok live sending fails', async () => {
    const senderSendMessage = vi.fn().mockResolvedValue(true)
    const connector = new TikTokConnector({} as any, {
      sendMessage: senderSendMessage,
      getStatus: vi.fn().mockReturnValue({ isChatReady: true }),
      captureAuthCredentials: vi.fn().mockResolvedValue({ sessionId: null, ttTargetIdc: null, loggedIn: false })
    } as any)
    ;(connector as any).connection = {
      sendMessage: vi.fn().mockRejectedValue(new Error('webcast send rejected'))
    }
    ;(connector as any).activeConfig = {
      platform: 'tiktok',
      enabled: true,
      username: 'creator',
      sessionId: 'session-id',
      ttTargetIdc: 'useast2a'
    }

    await connector.sendChatMessage('fallback please')

    expect(senderSendMessage).toHaveBeenCalledWith('fallback please')
  })

  it('tries every transient connection candidate and rejects when TikTok is unreachable', async () => {
    let connectAttempts = 0

    vi.doMock('tiktok-live-connector', () => ({
      WebcastPushConnection: class FakeWebcastPushConnection extends EventEmitter {
        async connect() {
          connectAttempts += 1
          throw new Error('connect ECONNREFUSED')
        }

        disconnect() {}
      }
    }))

    const connector = new TikTokConnector({} as any, {} as any)
    connector.setAutoReconnect(false)

    await expect(
      connector.connect({ platform: 'tiktok', enabled: true, username: 'offline_creator' })
    ).rejects.toThrow('connect ECONNREFUSED')

    expect(connectAttempts).toBe(3)
    expect(connector.status).toBe('error')
  })

  it('waits (not errors) when the host is reachable but not live yet', async () => {
    let connectAttempts = 0

    vi.doMock('tiktok-live-connector', () => ({
      WebcastPushConnection: class FakeWebcastPushConnection extends EventEmitter {
        async connect() {
          connectAttempts += 1
          throw new Error("The requested user isn't online :(")
        }

        disconnect() {}
      }
    }))

    const connector = new TikTokConnector({} as any, {} as any)
    connector.setAutoReconnect(false)
    const errors: unknown[] = []
    connector.on('error', (error) => errors.push(error))

    // Resolves rather than rejecting — "not live yet" is a normal waiting state,
    // so the platform stays enabled instead of surfacing a hard failure.
    await expect(
      connector.connect({ platform: 'tiktok', enabled: true, username: 'offline_creator' })
    ).resolves.toBeUndefined()

    // Still tries every candidate in case a flaky room lookup was the culprit.
    expect(connectAttempts).toBe(3)
    // Waiting is presented as "connecting", never "error", and emits no error.
    expect(connector.status).toBe('connecting')
    expect(errors).toHaveLength(0)
  })

  it('stops candidate fallback on fatal identity errors', async () => {
    let connectAttempts = 0

    vi.doMock('tiktok-live-connector', () => ({
      WebcastPushConnection: class FakeWebcastPushConnection extends EventEmitter {
        async connect() {
          connectAttempts += 1
          throw new Error('User not found')
        }

        disconnect() {}
      }
    }))

    const connector = new TikTokConnector({} as any, {} as any)
    connector.setAutoReconnect(false)

    await expect(
      connector.connect({ platform: 'tiktok', enabled: true, username: 'missing_creator' })
    ).rejects.toThrow('User not found')

    expect(connectAttempts).toBe(1)
    expect(connector.status).toBe('error')
  })

  it('does not schedule reconnects from handshake error events while candidates are still trying', async () => {
    let connectAttempts = 0

    vi.doMock('tiktok-live-connector', () => ({
      WebcastPushConnection: class FakeWebcastPushConnection extends EventEmitter {
        async connect() {
          connectAttempts += 1
          this.emit('error', { detail: 'handshake failed' })
          throw new Error('The requested user is not online')
        }

        disconnect() {}
      }
    }))

    const connector = new TikTokConnector({} as any, {} as any)
    connector.setAutoReconnect(false)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // "not online" resolves into the waiting state rather than rejecting.
    await expect(
      connector.connect({ platform: 'tiktok', enabled: true, username: 'offline_creator' })
    ).resolves.toBeUndefined()

    expect(connectAttempts).toBe(3)
    expect(connector.status).toBe('connecting')
    expect(errorSpy.mock.calls.some((call) => String(call[0]).includes('[tiktok] connection:'))).toBe(false)
    expect(warnSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
    warnSpy.mockRestore()
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

  it('recognizes "not live yet" results as an offline waiting state', () => {
    expect(isTikTokOfflineErrorMessage("The requested user isn't online :(")).toBe(true)
    expect(isTikTokOfflineErrorMessage('The requested user is not online')).toBe(true)
    expect(isTikTokOfflineErrorMessage('LIVE has ended')).toBe(false) // handled elsewhere as room-state
    expect(isTikTokOfflineErrorMessage('stream ended')).toBe(true)
  })

  it('does not confuse a missing user with an offline host', () => {
    // Fatal identity errors must not be swallowed by the offline waiting path.
    expect(isTikTokOfflineErrorMessage('User not found')).toBe(false)
    expect(isTikTokOfflineErrorMessage('Invalid username')).toBe(false)
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

  it('recognizes TikTok like payloads that arrive with social display metadata', () => {
    expect(
      isTikTokLikeSocialPayload({
        likeCount: 5,
        totalLikeCount: 12470,
        specifiedDisplayText: [
          {
            uid: '7320750950765921322',
            displayText: {
              displayType: 'pm_mt_msg_viewer',
              defaultPattern: '{0:user} liked the LIVE'
            }
          }
        ]
      })
    ).toBe(true)

    expect(
      isTikTokLikeSocialPayload({
        likeCount: 1,
        common: {
          displayText: {
            displayType: 'pm_mt_msg_viewer',
            defaultPattern: '{0:user} liked the LIVE'
          }
        }
      })
    ).toBe(true)
  })

  it('does not treat normal chat messages that mention likes as TikTok like payloads', () => {
    expect(
      isTikTokLikeSocialPayload({
        comment: 'why did it reset my likes',
        uniqueId: 'chat_friend'
      })
    ).toBe(false)

    expect(
      isTikTokLikeSocialPayload({
        comment: 'I only like my cake eaten',
        uniqueId: 'chat_friend'
      })
    ).toBe(false)
  })

  it('converts TikTok like social payloads into like events instead of chat', () => {
    const connector = new TikTokConnector({} as any, {} as any)
    const connection = new EventEmitter()
    const events: any[] = []

    connector.on('event', (event) => events.push(event))
    ;(connector as any).setupEventListeners(connection)

    connection.emit('chat', {
      likeCount: 5,
      totalLikeCount: 12470,
      specifiedDisplayText: [
        {
          displayText: {
            displayType: 'pm_mt_msg_viewer',
            defaultPattern: '{0:user} liked the LIVE'
          }
        }
      ]
    })
    connection.emit('chat', {
      comment: 'I only like my cake eaten',
      userId: '123',
      uniqueId: 'cake_friend',
      nickname: 'Cake Friend'
    })

    expect(events).toHaveLength(2)
    expect(events[0]).toEqual(expect.objectContaining({
      type: 'like',
      likeCount: 5,
      totalLikes: 12470
    }))
    expect(events[1]).toEqual(expect.objectContaining({
      type: 'chat',
      message: 'I only like my cake eaten'
    }))
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
