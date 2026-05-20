import { afterEach, describe, expect, it, vi } from 'vitest'
import { OverlayServer } from './overlay-server'
import { DeviceApi } from './device-api'
import type { ChatEvent, GiftEvent, LikeEvent } from '../platforms/types'

let overlayServer: OverlayServer | null = null

afterEach(async () => {
  if (overlayServer) {
    await overlayServer.stop()
    overlayServer = null
  }
})

describe('OverlayServer', () => {
  it('serves local overlay health and chat state endpoints', async () => {
    overlayServer = new OverlayServer()
    const status = await overlayServer.start(0)

    expect(status.running).toBe(true)
    expect(status.healthUrl).toBeTruthy()
    expect(status.chatUrl).toBeTruthy()
    expect(status.goalsUrl).toBeTruthy()
    expect(status.deviceHosts).toContain(`127.0.0.1:${status.port}`)
    expect(status.devicePairUrl).toContain('/api/v1/pair/complete')

    const healthResponse = await fetch(status.healthUrl!)
    const health = await healthResponse.json()
    expect(health).toEqual(
      expect.objectContaining({
        running: true,
        port: status.port
      })
    )

    const chatEvent: ChatEvent = {
      id: 'chat-1',
      platform: 'youtube',
      timestamp: new Date('2026-04-10T10:00:00.000Z'),
      type: 'chat',
      raw: {},
      message: 'overlay hello',
      emotes: [],
      user: {
        id: 'user-1',
        username: 'viewer',
        displayName: 'Viewer',
        isModerator: false,
        isSubscriber: false,
        isVip: false,
        badges: []
      }
    }

    overlayServer.handleStreamEvent(chatEvent)

    const stateResponse = await fetch(`http://127.0.0.1:${status.port}/overlay/chat/state`)
    const state = await stateResponse.json()
    expect(state).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: 'Viewer',
          message: 'overlay hello',
          platformLabel: 'YouTube'
        })
      ])
    )

    const likeEvent: LikeEvent = {
      id: 'like-1',
      platform: 'tiktok',
      timestamp: new Date('2026-04-10T10:05:00.000Z'),
      type: 'like',
      raw: {},
      likeCount: 25,
      totalLikes: 400,
      user: {
        id: 'user-2',
        username: 'fan',
        displayName: 'Fan',
        isModerator: false,
        isSubscriber: false,
        isVip: false,
        badges: []
      }
    }

    overlayServer.handleStreamEvent(likeEvent)

    const chatAfterLikeResponse = await fetch(`http://127.0.0.1:${status.port}/overlay/chat/state`)
    const chatAfterLike = await chatAfterLikeResponse.json()
    expect(chatAfterLike).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'like'
        })
      ])
    )

    const goalsResponse = await fetch(`http://127.0.0.1:${status.port}/overlay/goals/state`)
    const goals = await goalsResponse.json()
    // Goal state now prefers the platform's authoritative cumulative count
    // (event.totalLikes = 400) over the per-event delta (event.likeCount = 25).
    // This stays accurate when we miss events or connect mid-stream.
    expect(goals).toEqual(
      expect.objectContaining({
        totalLikes: 400
      })
    )

    const likesController = new AbortController()
    const likesResponse = await fetch(`http://127.0.0.1:${status.port}/overlay/events?channel=likes`, {
      signal: likesController.signal
    })
    const likesStream = await readStreamUntil(likesResponse, '"snapshot"', likesController)
    expect(likesStream).toContain('"totalLikes":400')
    expect(likesStream).toContain('"displayName":"Fan"')
    expect(likesStream).toContain('"count":25')
  })

  it('allows DeskThing clients from a LAN origin to preflight the device API', async () => {
    overlayServer = new OverlayServer()
    const status = await overlayServer.start(0)

    const response = await fetch(`http://127.0.0.1:${status.port}/api/v1/pair/complete`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://192.168.1.42:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization'
      }
    })

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('access-control-allow-headers')).toContain('Authorization')
  })

  it('returns CORS headers on DeskThing pair and SSE responses', async () => {
    overlayServer = new OverlayServer()

    const validTokens = new Set<string>()
    const authService = {
      generateToken: () => {
        validTokens.add('desk-token')
        return 'desk-token'
      },
      verifyToken: (token: string) => validTokens.has(token),
      getAllTokens: () => [],
      revokeToken: () => undefined
    }
    const deviceApi = new DeviceApi({} as any, { getAllSounds: () => [] } as any, authService as any, () => undefined)
    overlayServer.setDeviceApi(deviceApi)

    const status = await overlayServer.start(0)
    const pair = deviceApi.startPairCode()
    const origin = 'http://192.168.1.42:5173'

    const pairResponse = await fetch(`http://127.0.0.1:${status.port}/api/v1/pair/complete`, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code: pair.code, label: 'DeskThing' })
    })
    const pairBody = await pairResponse.json() as { token: string }

    expect(pairResponse.status).toBe(200)
    expect(pairResponse.headers.get('access-control-allow-origin')).toBe('*')
    expect(pairBody.token).toBe('desk-token')

    const eventsController = new AbortController()
    const eventsResponse = await fetch(`http://127.0.0.1:${status.port}/api/v1/events?token=${pairBody.token}`, {
      headers: { Origin: origin },
      signal: eventsController.signal
    })

    expect(eventsResponse.status).toBe(200)
    expect(eventsResponse.headers.get('access-control-allow-origin')).toBe('*')
    expect(eventsResponse.headers.get('content-type')).toContain('text/event-stream')

    overlayServer.handleStreamEvent({
      id: 'chat-deskthing-1',
      platform: 'twitch',
      timestamp: new Date('2026-04-10T11:00:00.000Z'),
      type: 'chat',
      raw: {},
      message: 'deskthing hello',
      emotes: [],
      user: {
        id: 'user-3',
        username: 'desk_viewer',
        displayName: 'Desk Viewer',
        isModerator: false,
        isSubscriber: false,
        isVip: false,
        badges: []
      }
    })

    const eventsStream = await readStreamUntil(eventsResponse, '"chatBacklog"', eventsController)
    expect(eventsStream).toContain('"message":"deskthing hello"')
  })

  it('does not send in-progress TikTok gift combos to particle widgets', () => {
    overlayServer = new OverlayServer()
    const broadcast = vi.fn()
    ;(overlayServer as any).sse.broadcast = broadcast

    overlayServer.handleStreamEvent(makeGiftEvent(true))

    expect(broadcast).not.toHaveBeenCalledWith('particles', expect.anything())
    expect(broadcast).not.toHaveBeenCalledWith('event-particles', expect.anything())

    overlayServer.handleStreamEvent(makeGiftEvent(false))

    expect(broadcast).toHaveBeenCalledWith('particles', expect.objectContaining({
      type: 'event',
      payload: expect.objectContaining({ giftName: 'GG', isCombo: false })
    }))
    expect(broadcast).toHaveBeenCalledWith('event-particles', expect.objectContaining({
      type: 'event',
      payload: expect.objectContaining({ giftName: 'GG', isCombo: false })
    }))
  })
})

function makeGiftEvent(isCombo: boolean): GiftEvent {
  return {
    id: `gift-${isCombo ? 'combo' : 'final'}`,
    platform: 'tiktok',
    timestamp: new Date('2026-04-10T10:10:00.000Z'),
    type: 'gift',
    raw: {},
    giftName: 'GG',
    giftId: 'gg',
    giftCount: 1,
    monetaryValue: 1,
    isCombo,
    user: {
      id: 'user-4',
      username: 'gg_friend',
      displayName: 'GG Friend',
      isModerator: false,
      isSubscriber: false,
      isVip: false,
      badges: []
    }
  }
}

async function readStreamUntil(response: Response, needle: string, controller: AbortController): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''

  const decoder = new TextDecoder()
  let text = ''

  try {
    for (let i = 0; i < 5 && !text.includes(needle); i++) {
      const result = await Promise.race([
        reader.read(),
        new Promise<ReadableStreamReadResult<Uint8Array>>((resolve) => {
          setTimeout(() => resolve({ done: true, value: undefined }), 1000)
        })
      ])
      if (result.done) break
      text += decoder.decode(result.value, { stream: true })
    }
  } finally {
    controller.abort()
    void reader.cancel().catch(() => {})
  }

  return text
}
