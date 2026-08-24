import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer as createNetServer } from 'node:net'
import { once } from 'node:events'
import { WebSocket } from 'ws'
import { OverlayServer } from './overlay-server'
import { DeviceApi } from './device-api'
import type { ChatEvent, GiftEvent, LikeEvent } from '../platforms/types'
import { DEFAULT_APP_SETTINGS } from '../../shared/settings/defaults'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '')
  }
}))

let overlayServer: OverlayServer | null = null

afterEach(async () => {
  if (overlayServer) {
    await overlayServer.stop()
    overlayServer = null
  }
})

describe('OverlayServer', () => {
  it('multiplexes replay and live overlay events over WebSocket', async () => {
    overlayServer = new OverlayServer()
    const receipts: any[] = []
    const broadcasts: any[] = []
    overlayServer.on('overlay-performance', (receipt) => receipts.push(receipt))
    overlayServer.on('overlay-broadcast', (broadcast) => broadcasts.push(broadcast))
    const status = await overlayServer.start(0)
    const socket = new WebSocket(`ws://127.0.0.1:${status.port}/overlay/ws`)
    const messages: any[] = []
    socket.on('message', (data) => messages.push(JSON.parse(data.toString())))

    await once(socket, 'open')
    socket.send(JSON.stringify({
      type: 'subscribe',
      subscriptionId: 'chat-test',
      channel: 'chat',
      after: 0,
      sinceAt: Date.now()
    }))
    socket.send(JSON.stringify({
      type: 'subscribe',
      subscriptionId: 'alerts-test',
      channel: 'alerts',
      after: 0,
      sinceAt: Date.now()
    }))

    await vi.waitFor(() => {
      expect(messages).toContainEqual(expect.objectContaining({
        type: 'subscribed',
        subscriptionId: 'chat-test',
        channel: 'chat'
      }))
      expect(messages).toContainEqual(expect.objectContaining({
        type: 'event',
        subscriptionId: 'chat-test',
        channel: 'chat',
        data: { type: 'snapshot', payload: [] }
      }))
      expect(messages).toContainEqual(expect.objectContaining({
        type: 'subscribed',
        subscriptionId: 'alerts-test',
        channel: 'alerts'
      }))
      expect(overlayServer?.getStatus()).toMatchObject({
        chatClientCount: 1,
        alertClientCount: 1,
        webSocketClientCount: 1
      })
    })

    overlayServer.broadcast('chat', { type: 'append', payload: { id: 'live-chat' } })
    await vi.waitFor(() => {
      expect(messages).toContainEqual(expect.objectContaining({
        type: 'event',
        channel: 'chat',
        data: { type: 'append', payload: { id: 'live-chat' } }
      }))
    })
    expect(broadcasts.at(-1)).toMatchObject({ channel: 'chat', clientCount: 1 })

    const liveMessage = messages.find((message) =>
      message.type === 'event' && message.data?.payload?.id === 'live-chat'
    )
    expect(liveMessage.measure).toBe(true)
    const receivedAt = Date.now()
    socket.send(JSON.stringify({
      type: 'receipt',
      subscriptionId: 'chat-test',
      channel: 'chat',
      eventId: liveMessage.id,
      transport: 'websocket-test',
      receivedAt,
      paintedAt: receivedAt + 1
    }))
    await vi.waitFor(() => {
      expect(receipts).toContainEqual(expect.objectContaining({
        kind: 'paint',
        channel: 'chat',
        eventId: liveMessage.id,
        transport: 'websocket-test'
      }))
    })

    socket.send(JSON.stringify({ type: 'unsubscribe', subscriptionId: 'alerts-test' }))
    await vi.waitFor(() => {
      expect(overlayServer?.getStatus()).toMatchObject({
        chatClientCount: 1,
        alertClientCount: 0,
        webSocketClientCount: 1
      })
    })

    socket.close()
    await once(socket, 'close')
  })

  it('broadcasts revisioned config and dispose messages on the registry channel', () => {
    overlayServer = new OverlayServer()
    const broadcast = vi.fn()
    ;(overlayServer as any).sse.broadcast = broadcast
    const widget = {
      id: 'followers-1',
      name: 'Followers',
      type: 'follower-goal' as const,
      config: { goal: 250 }
    }

    overlayServer.broadcastWidgetUpdate(widget)
    overlayServer.broadcastWidgetDispose(widget)

    expect(broadcast).toHaveBeenNthCalledWith(1, 'goals', {
      type: 'widget-config',
      widgetId: 'followers-1',
      widgetType: 'follower-goal',
      generation: expect.any(String),
      revision: 1,
      config: { goal: 250 }
    })
    expect(broadcast).toHaveBeenNthCalledWith(2, 'goals', {
      type: 'widget-dispose',
      widgetId: 'followers-1',
      widgetType: 'follower-goal',
      generation: expect.any(String),
      revision: 2
    })
  })

  it('serves the camera mask aliases as a transparent live overlay and an opaque editor preview', async () => {
    overlayServer = new OverlayServer()
    const status = await overlayServer.start(0)
    const base = `http://127.0.0.1:${status.port}`

    for (const alias of ['camera-frame', 'camera-mask', 'camera']) {
      const response = await fetch(`${base}/overlay/${alias}`)
      const html = await response.text()

      expect(response.status, alias).toBe(200)
      expect(html).toContain('<title>Camera Mask Outline</title>')
      expect(html).toContain('data-preview-bg="0"')
      expect(html).toContain('ilystream-overlay-runtime')
    }

    const preview = await (await fetch(`${base}/overlay/camera-mask?preview=1`)).text()
    expect(preview).toContain('data-preview-bg="1"')
  })

  it('serves the customizable text widget and its friendly alias', async () => {
    overlayServer = new OverlayServer()
    const status = await overlayServer.start(0)
    const base = `http://127.0.0.1:${status.port}`

    for (const alias of ['text', 'custom-text']) {
      const response = await fetch(`${base}/overlay/${alias}`)
      const html = await response.text()

      expect(response.status, alias).toBe(200)
      expect(html).toContain('<title>ilyStream Text</title>')
      expect(html).toContain('YOUR TEXT HERE')
      expect(html).toContain('ilystream-overlay-runtime')
    }
  })

  it('serves Discord call snapshots through state, SSE polling, and the widget route', async () => {
    const callState = {
      connectionPhase: 'connected',
      connectionMessage: 'Discord voice is connected.',
      channelId: 'voice-1',
      channelName: 'Stream Room',
      guildId: 'guild-1',
      isConnected: true,
      participants: [{
        id: 'discord-user',
        username: 'Discord Friend',
        avatarUrl: null,
        isSpeaking: true,
        isMuted: false,
        isDeafened: false,
        isCurrentUser: false
      }],
      updatedAt: new Date(0).toISOString()
    }
    overlayServer = new OverlayServer()
    overlayServer.setPlatformManager({ getDiscordCallState: () => callState })
    const status = await overlayServer.start(0)
    const base = `http://127.0.0.1:${status.port}`

    const state = await (await fetch(`${base}/overlay/discord-call/state`)).json()
    expect(state).toEqual(callState)

    const poll = await (await fetch(`${base}/overlay/events/poll?channel=discord-call&after=0`)).json() as any
    expect(poll.events).toEqual([{ id: 0, data: { type: 'snapshot', payload: callState } }])

    const widget = await (await fetch(`${base}/overlay/discord-call`)).text()
    expect(widget).toContain('channel=discord-call')
    expect(widget).toContain('ilystream-overlay-runtime')
  })

  it('requires a scoped preview session before serving the executable preview protocol', async () => {
    overlayServer = new OverlayServer()
    const status = await overlayServer.start(0)
    const base = `http://127.0.0.1:${status.port}`

    const staticPreview = await fetch(`${base}/overlay/chat-unified?preview=1`)
    const staticPreviewHtml = await staticPreview.text()
    expect(staticPreview.status).toBe(200)
    expect(staticPreviewHtml).toContain('ilystream-overlay-runtime')
    expect(staticPreviewHtml).not.toContain('ilystream-preview-bootstrap')

    const invalidSession = await fetch(`${base}/overlay/chat-unified?preview=1&previewToken=attacker-selected`)
    expect(invalidSession.status).toBe(403)

    const previewToken = overlayServer.createWidgetPreviewSession('chat-unified')
    const previewResponse = await fetch(
      `${base}/overlay/chat-unified?preview=1&previewToken=${encodeURIComponent(previewToken)}`
    )
    const preview = await previewResponse.text()

    expect(previewResponse.status).toBe(200)
    expect(previewResponse.headers.get('referrer-policy')).toBe('no-referrer')
    expect(preview).toContain('ilystream-preview-bootstrap')
    expect(preview).toContain('ilystream-overlay-runtime')
    expect(preview).toContain(JSON.stringify(previewToken))
    expect(preview).toContain('event.source !== window.parent')
    expect(preview).toContain('data.previewToken !== PREVIEW_TOKEN')

    const wrongWidget = await fetch(
      `${base}/overlay/screen-border?preview=1&previewToken=${encodeURIComponent(previewToken)}`
    )
    expect(wrongWidget.status).toBe(403)

    // Browser sources (OBS) get the runtime but not the editor protocol.
    const live = await (await fetch(`${base}/overlay/chat-unified`)).text()
    expect(live).toContain('ilystream-overlay-runtime')
    expect(live).not.toContain('ilystream-preview-bootstrap')

    overlayServer.releaseWidgetPreviewSession(previewToken)
    const releasedSession = await fetch(
      `${base}/overlay/chat-unified?preview=1&previewToken=${encodeURIComponent(previewToken)}`
    )
    expect(releasedSession.status).toBe(403)
  })

  it('serves a dock-specific Unified Chat shell without changing the transparent overlay', async () => {
    overlayServer = new OverlayServer()
    const status = await overlayServer.start(0)
    const base = `http://127.0.0.1:${status.port}`

    const overlay = await (await fetch(`${base}/overlay/chat-unified`)).text()
    const dock = await (await fetch(`${base}/overlay/chat-unified?dock=1`)).text()

    expect(overlay).toContain('data-dock-mode="0"')
    expect(overlay).not.toContain('<header class="dock-header">')
    expect(dock).toContain('data-dock-mode="1"')
    expect(dock).toContain('<header class="dock-header">')
    expect(dock).toContain('Chat is quiet')
  })

  it('keeps overlays on loopback when starting the isolated LAN device listener', async () => {
    overlayServer = new OverlayServer()
    const status = await overlayServer.start(0, { preferLan: true })
    expect(status.running).toBe(true)
    expect(status.listenHost).toBe('127.0.0.1')

    const deviceBase = getLoopbackDeviceBase(status)
    expect(deviceBase).not.toBe(`http://127.0.0.1:${status.port}`)

    for (const pathname of ['/overlay/chat/state', '/overlay/chat', '/overlay/health', '/debug/server']) {
      const response = await fetch(`${deviceBase}${pathname}`)
      expect(response.status, pathname).toBe(404)
    }
  })

  it('keeps the overlay online when the preferred companion port is occupied', async () => {
    overlayServer = new OverlayServer()
    overlayServer.setDeviceApi(new DeviceApi({} as any, {} as any, {} as any, () => undefined))
    const localStatus = await overlayServer.start(0)
    const overlayPort = localStatus.port!
    const blockedDevicePort = overlayPort === 65535 ? 1024 : overlayPort + 1
    const blocker = createNetServer()

    await new Promise<void>((resolve, reject) => {
      blocker.once('error', reject)
      blocker.listen(blockedDevicePort, '0.0.0.0', resolve)
    })

    try {
      const deviceStatus = await overlayServer.ensureLanAccess()

      expect(deviceStatus.running).toBe(true)
      expect(deviceStatus.port).toBe(overlayPort)
      expect(deviceStatus.devicePort).not.toBe(blockedDevicePort)
      expect(deviceStatus.devicePort).not.toBe(overlayPort)

      const overlayHealth = await fetch(`http://127.0.0.1:${overlayPort}/overlay/health`)
      expect(overlayHealth.status).toBe(200)

      const deviceHealth = await fetch(`${getLoopbackDeviceBase(deviceStatus)}/api/v1/health`)
      expect(deviceHealth.status).toBe(200)
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()))
    }
  })

  it('serves local overlay health and chat state endpoints', async () => {
    overlayServer = new OverlayServer()
    const status = await overlayServer.start(0)

    expect(status.running).toBe(true)
    // Secure by default: bind loopback, not the whole LAN.
    expect(status.listenHost).toBe('127.0.0.1')
    expect(status.healthUrl).toBeTruthy()
    expect(status.chatUrl).toBeTruthy()
    expect(status.goalsUrl).toBeTruthy()
    expect(status.deviceHosts).toEqual([])
    expect(status.devicePairUrl).toBeNull()

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

    const likesStateResponse = await fetch(`http://127.0.0.1:${status.port}/overlay/likes/state`)
    const likesState = await likesStateResponse.json()
    expect(likesState).toEqual(
      expect.objectContaining({
        totalLikes: 25,
        users: expect.arrayContaining([
          expect.objectContaining({
            displayName: 'Fan',
            count: 25
          })
        ])
      })
    )

    overlayServer.setStatsService({
      getGlobalStats: vi.fn(() => ({ totalLikes: 1234 })),
      getTopIdentities: vi.fn(() => [
        {
          displayName: 'Lifetime Fan',
          primaryUsername: 'lifetime_fan',
          profilePictureUrl: 'https://example.com/avatar.png',
          totalLikes: 900
        },
        {
          displayName: 'Quiet Viewer',
          primaryUsername: 'quiet',
          profilePictureUrl: null,
          totalLikes: 0
        }
      ])
    })

    const lifetimeResponse = await fetch(`http://127.0.0.1:${status.port}/overlay/likes/lifetime?limit=5`)
    const lifetimeState = await lifetimeResponse.json()
    expect(lifetimeState).toEqual({
      totalLikes: 1234,
      users: [
        {
          displayName: 'Lifetime Fan',
          profilePictureUrl: 'https://example.com/avatar.png',
          count: 900
        }
      ]
    })

    const likesController = new AbortController()
    const likesResponse = await fetch(`http://127.0.0.1:${status.port}/overlay/events?channel=likes`, {
      signal: likesController.signal
    })
    const likesStream = await readStreamUntil(likesResponse, '"snapshot"', likesController)
    expect(likesStream).toContain('"totalLikes":25')
    expect(likesStream).toContain('"displayName":"Fan"')
    expect(likesStream).toContain('"count":25')

    overlayServer.broadcast('leaderboard', {
      type: 'update',
      data: [{ username: 'Fan', score: 25 }]
    })

    const leaderboardStateResponse = await fetch(`http://127.0.0.1:${status.port}/overlay/leaderboard/state`)
    const leaderboardState = await leaderboardStateResponse.json()
    expect(leaderboardState).toEqual([
      expect.objectContaining({ username: 'Fan', score: 25 })
    ])

    const leaderboardController = new AbortController()
    const leaderboardResponse = await fetch(`http://127.0.0.1:${status.port}/overlay/events?channel=leaderboard`, {
      signal: leaderboardController.signal
    })
    const leaderboardStream = await readStreamUntil(leaderboardResponse, '"score":25', leaderboardController)
    expect(leaderboardStream).toContain('"type":"snapshot"')
    expect(leaderboardStream).toContain('"username":"Fan"')
  })

  it('clears widget runtime state for a fresh widget set', async () => {
    overlayServer = new OverlayServer()
    const economyService = {
      resetLikeathon: vi.fn(),
      getLeaderboardSnapshot: vi.fn(() => [{ username: 'Economy Fan', score: 99 }])
    }
    overlayServer.setEconomyService(economyService)
    const status = await overlayServer.start(0)

    overlayServer.handleStreamEvent({
      id: 'chat-reset-1',
      platform: 'tiktok',
      timestamp: new Date('2026-04-10T10:00:00.000Z'),
      type: 'chat',
      raw: {},
      message: 'before reset',
      emotes: [],
      user: {
        id: 'viewer-1',
        username: 'viewer',
        displayName: 'Viewer',
        isModerator: false,
        isSubscriber: false,
        isVip: false,
        badges: []
      }
    })
    overlayServer.handleStreamEvent({
      id: 'like-reset-1',
      platform: 'tiktok',
      timestamp: new Date('2026-04-10T10:05:00.000Z'),
      type: 'like',
      raw: {},
      likeCount: 12,
      totalLikes: 1012,
      user: {
        id: 'fan-1',
        username: 'fan',
        displayName: 'Fan',
        isModerator: false,
        isSubscriber: false,
        isVip: false,
        badges: []
      }
    })
    overlayServer.broadcast('leaderboard', {
      type: 'update',
      data: [{ username: 'Fan', score: 12 }]
    })

    overlayServer.resetWidgetRuntimeState()

    await expect(fetch(`http://127.0.0.1:${status.port}/overlay/chat/state`).then((r) => r.json())).resolves.toEqual([])
    await expect(fetch(`http://127.0.0.1:${status.port}/overlay/likes/state`).then((r) => r.json())).resolves.toEqual({
      totalLikes: 0,
      users: []
    })
    await expect(fetch(`http://127.0.0.1:${status.port}/overlay/leaderboard/state`).then((r) => r.json())).resolves.toEqual([])
    await expect(fetch(`http://127.0.0.1:${status.port}/overlay/goals/state`).then((r) => r.json())).resolves.toEqual(
      expect.objectContaining({ totalLikes: 0, totalGiftCount: 0 })
    )
    expect(economyService.resetLikeathon).toHaveBeenCalledTimes(1)
  })

  it('allows DeskThing clients from a LAN origin to preflight the device API', async () => {
    overlayServer = new OverlayServer()
    const status = await overlayServer.start(0, { preferLan: true })
    const deviceBase = getLoopbackDeviceBase(status)

    const response = await fetch(`${deviceBase}/api/v1/pair/complete`, {
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

  it('starts DeskThing LAN access without rebinding or interrupting the overlay listener', async () => {
    const originalHost = process.env.ILYSTREAM_OVERLAY_HOST
    process.env.ILYSTREAM_OVERLAY_HOST = '127.0.0.1'

    try {
      overlayServer = new OverlayServer()
      const loopbackStatus = await overlayServer.start(0)
      expect(loopbackStatus.listenHost).toBe('127.0.0.1')
      expect(loopbackStatus.deviceHosts).toEqual([])

      const lanStatus = await overlayServer.ensureLanAccess()
      expect(lanStatus.listenHost).toBe('127.0.0.1')
      expect(lanStatus.port).toBe(loopbackStatus.port)

      const deviceBase = getLoopbackDeviceBase(lanStatus)
      expect(deviceBase).not.toBe(`http://127.0.0.1:${lanStatus.port}`)

      const healthResponse = await fetch(`http://127.0.0.1:${lanStatus.port}/overlay/health`)
      await expect(healthResponse.json()).resolves.toEqual(
        expect.objectContaining({
          running: true,
          listenHost: '127.0.0.1'
        })
      )

      const blockedOverlayResponse = await fetch(`${deviceBase}/overlay/health`)
      expect(blockedOverlayResponse.status).toBe(404)
    } finally {
      if (originalHost === undefined) {
        delete process.env.ILYSTREAM_OVERLAY_HOST
      } else {
        process.env.ILYSTREAM_OVERLAY_HOST = originalHost
      }
    }
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

    const status = await overlayServer.start(0, { preferLan: true })
    const deviceBase = getLoopbackDeviceBase(status)
    const pair = deviceApi.startPairCode()
    const origin = 'http://192.168.1.42:5173'

    const pairResponse = await fetch(`${deviceBase}/api/v1/pair/complete`, {
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

    overlayServer.broadcastAppTheme({
      ...DEFAULT_APP_SETTINGS.ui,
      theme: 'ember'
    })

    const eventsController = new AbortController()
    const eventsResponse = await fetch(`${deviceBase}/api/v1/events?token=${pairBody.token}`, {
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
    expect(eventsStream).toContain('"type":"appTheme"')
    expect(eventsStream).toContain('"theme":"ember"')
    expect(eventsStream).toContain('"message":"deskthing hello"')
  })

  it('serves overlay runtime and polling fallback events for browser-source clients', async () => {
    overlayServer = new OverlayServer()
    const status = await overlayServer.start(0)
    const base = `http://127.0.0.1:${status.port}`

    const widgetResponse = await fetch(`${base}/overlay/chat`)
    const widgetHtml = await widgetResponse.text()
    expect(widgetHtml).toContain('ilystream-overlay-runtime')
    expect(widgetHtml).toContain('/overlay/events/poll')

    overlayServer.handleStreamEvent({
      id: 'chat-poll-1',
      platform: 'tiktok',
      timestamp: new Date('2026-04-10T12:00:00.000Z'),
      type: 'chat',
      raw: {},
      message: 'poll me',
      emotes: [],
      user: {
        id: 'poll-user',
        username: 'poll_viewer',
        displayName: 'Poll Viewer',
        isModerator: false,
        isSubscriber: false,
        isVip: false,
        badges: []
      }
    })

    const chatPollResponse = await fetch(`${base}/overlay/events/poll?channel=chat&after=0`)
    const chatPoll = await chatPollResponse.json() as any
    expect(chatPoll.events).toEqual([
      expect.objectContaining({
        id: 0,
        data: expect.objectContaining({
          type: 'snapshot',
          payload: expect.arrayContaining([
            expect.objectContaining({
              displayName: 'Poll Viewer',
              message: 'poll me'
            })
          ])
        })
      })
    ])
    expect(chatPoll.cursor).toBeGreaterThan(0)
    expect(chatPoll.generation).toEqual(expect.any(String))
    expect(chatPoll.reset).toBe(false)

    const staleCursorResponse = await fetch(
      `${base}/overlay/events/poll?channel=chat&after=999999`
    )
    const staleCursorPoll = await staleCursorResponse.json() as any
    expect(staleCursorPoll.reset).toBe(true)
    expect(staleCursorPoll.generation).toBe(chatPoll.generation)
    expect(staleCursorPoll.events).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'reload',
          reason: 'overlay-server-restarted'
        })
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'snapshot',
          payload: expect.arrayContaining([
            expect.objectContaining({ message: 'poll me' })
          ])
        })
      })
    ])

    overlayServer.broadcast('screen-border', { type: 'reload', id: 'border-widget' })

    const borderPollResponse = await fetch(`${base}/overlay/events/poll?channel=screen-border&after=0`)
    const borderPoll = await borderPollResponse.json() as any
    expect(borderPoll.events).toEqual([
      expect.objectContaining({
        id: expect.any(Number),
        data: expect.objectContaining({ type: 'reload', id: 'border-widget' })
      })
    ])
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

function getLoopbackDeviceBase(status: { deviceHosts?: string[] }): string {
  const host = status.deviceHosts?.find((candidate) => candidate.startsWith('127.0.0.1:'))
  if (!host) throw new Error('Expected an isolated loopback path to the device listener')
  return `http://${host}`
}

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
        new Promise<Awaited<ReturnType<typeof reader.read>>>((resolve) => {
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
