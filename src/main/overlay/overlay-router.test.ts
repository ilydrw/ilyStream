import { once } from 'events'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { Readable, Writable } from 'stream'
import { describe, expect, it, vi } from 'vitest'
import { app } from 'electron'
import { avatarCacheFileName } from '../lib/avatar-cache'
import { OverlayRouter } from './overlay-router'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => ''),
    getAppPath: vi.fn(() => process.cwd())
  }
}))

vi.mock('../lib/ssrf-guard', () => ({
  fetchSafePublicHttp: vi.fn(async (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => {
    const response = await fetch(url, init)
    return {
      url: new URL(url),
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      data: Buffer.from(await response.arrayBuffer())
    }
  }),
  MAX_AVATAR_BYTES: 8 * 1024 * 1024
}))

class TestRequest extends Readable {
  method: string
  url: string
  headers: Record<string, string>
  socket: { remoteAddress?: string }
  private sent = false

  constructor(options: {
    method: string
    url: string
    headers?: Record<string, string>
    remoteAddress?: string
    body?: unknown
  }) {
    super()
    this.method = options.method
    this.url = options.url
    this.headers = options.headers || {}
    this.socket = { remoteAddress: options.remoteAddress }
    this.body = options.body
  }

  private body?: unknown

  _read(): void {
    if (this.sent) return
    this.sent = true

    if (this.body !== undefined) {
      const body = typeof this.body === 'string' ? this.body : JSON.stringify(this.body)
      this.push(body)
    }
    this.push(null)
  }
}

class TestResponse extends Writable {
  statusCode = 0
  headers: Record<string, unknown> = {}
  private chunks: Buffer[] = []

  writeHead(statusCode: number, headers?: Record<string, unknown>): this {
    this.statusCode = statusCode
    this.headers = headers || {}
    return this
  }

  _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    callback()
  }

  end(callback?: () => void): this
  end(chunk: any, callback?: () => void): this
  end(chunk: any, encoding: BufferEncoding, callback?: () => void): this
  end(chunkOrCallback?: any, encodingOrCallback?: BufferEncoding | (() => void), callback?: () => void): this {
    const chunk = typeof chunkOrCallback === 'function' ? undefined : chunkOrCallback
    if (chunk !== undefined) {
      this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encodingOrCallback === 'string' ? encodingOrCallback : 'utf8'))
    }
    super.end(
      typeof chunkOrCallback === 'function'
        ? chunkOrCallback
        : typeof encodingOrCallback === 'function'
          ? encodingOrCallback
          : callback
    )
    return this
  }

  text(): string {
    return Buffer.concat(this.chunks).toString('utf8')
  }

  bytes(): Buffer {
    return Buffer.concat(this.chunks)
  }
}

function makeRouter(statsService: any = null, sseOverrides: Record<string, unknown> = {}) {
  const emitDeckAction = vi.fn()
  const authService = {
    verifyToken: vi.fn((token: string) => token === 'remote-token')
  }
  const sse = {
    attachClient: vi.fn(),
    getClientCount: vi.fn(() => 0),
    getEventsSince: vi.fn(() => []),
    getFirstEventId: vi.fn(() => 0),
    getLastEventId: vi.fn(() => 0),
    getLastPayload: vi.fn(() => null),
    ...sseOverrides
  }
  const router = new OverlayRouter(
    () => ({ getAllDeckActions: () => [] } as any),
    () => null,
    () => ({ getAllSounds: () => [] } as any),
    () => authService as any,
    () => null,
    sse as any,
    { getHistory: vi.fn(() => []) } as any,
    { getHistory: vi.fn(() => []) } as any,
    { getState: vi.fn(() => ({ totalLikes: 0, totalGiftCount: 0 })) } as any,
    { getState: vi.fn(() => null) } as any,
    { getSnapshot: vi.fn(() => ({ totalLikes: 0, users: [] })) } as any,
    () => ({ running: true, port: 8899 }),
    () => null,
    () => ({}),
    vi.fn(),
    emitDeckAction,
    () => statsService
  )
  return { router: router as any as OverlayRouter, authService, emitDeckAction, sse }
}

async function dispatch(router: OverlayRouter, request: TestRequest): Promise<TestResponse> {
  const response = new TestResponse()
  await router.handleRequest(request as any, response as any)
  if (!response.writableEnded) {
    await once(response, 'finish')
  }
  return response
}

function getDeckToken(html: string): string {
  const match = html.match(/const DECK_TOKEN = "([^"]+)"/)
  expect(match).toBeTruthy()
  return match![1]
}

describe('OverlayRouter event reconciliation', () => {
  it('starts event-only polling channels at the live cursor without replaying history', async () => {
    const startedAt = Date.now()
    const getEventsSince = vi.fn(() => [
      { id: 37, at: startedAt - 5_000, payload: { type: 'append', payload: { id: 'old-alert' } } }
    ])
    const { router } = makeRouter(null, {
      getLastEventId: vi.fn(() => 37),
      getFirstEventId: vi.fn(() => 12),
      getEventsSince
    })

    const response = await dispatch(router, new TestRequest({
      method: 'GET',
      url: `/overlay/events/poll?channel=particles&after=0&since=${startedAt}`,
      headers: { host: '127.0.0.1:8899' },
      remoteAddress: '127.0.0.1'
    }))
    const body = JSON.parse(response.text())

    expect(body).toMatchObject({ events: [], cursor: 37, reset: false })
    expect(getEventsSince).toHaveBeenCalledWith('particles', 0, 120)
    expect(response.headers['Cache-Control']).toBe('no-cache, no-store, must-revalidate')
  })

  it('still delivers event-only updates that arrive while the transport is connecting', async () => {
    const startedAt = Date.now()
    const liveEvent = { id: 38, at: startedAt + 1, payload: { type: 'reload', id: 'fresh-widget' } }
    const { router } = makeRouter(null, {
      getLastEventId: vi.fn(() => 38),
      getFirstEventId: vi.fn(() => 12),
      getEventsSince: vi.fn(() => [
        { id: 37, at: startedAt - 5_000, payload: { type: 'reload', id: 'old-widget' } },
        liveEvent
      ])
    })

    const response = await dispatch(router, new TestRequest({
      method: 'GET',
      url: `/overlay/events/poll?channel=screen-border&after=0&since=${startedAt}`,
      headers: { host: '127.0.0.1:8899' },
      remoteAddress: '127.0.0.1'
    }))

    expect(JSON.parse(response.text())).toMatchObject({
      events: [{ id: 38, data: { type: 'reload', id: 'fresh-widget' } }],
      cursor: 38,
      reset: false
    })
  })

  it('keeps the cursor on the last delivered event when an initial polling tail needs pages', () => {
    const startedAt = Date.now()
    const { router } = makeRouter(null, {
      getLastEventId: vi.fn(() => 50),
      getFirstEventId: vi.fn(() => 1),
      getEventsSince: vi.fn(() => [
        { id: 48, at: startedAt + 1, payload: { sequence: 1 } },
        { id: 49, at: startedAt + 2, payload: { sequence: 2 } },
        { id: 50, at: startedAt + 3, payload: { sequence: 3 } }
      ])
    })

    expect(router.getEventReplay('particles', { after: 0, sinceAt: startedAt, limit: 2 })).toMatchObject({
      events: [
        { id: 48, data: { sequence: 1 } },
        { id: 49, data: { sequence: 2 } }
      ],
      cursor: 49,
      reset: false
    })
  })

  it('resets a client that fell behind bounded event history', async () => {
    const getEventsSince = vi.fn(() => [])
    const { router } = makeRouter(null, {
      getLastEventId: vi.fn(() => 80),
      getFirstEventId: vi.fn(() => 40),
      getEventsSince
    })

    const response = await dispatch(router, new TestRequest({
      method: 'GET',
      url: '/overlay/events/poll?channel=alerts&after=10',
      headers: { host: '127.0.0.1:8899' },
      remoteAddress: '127.0.0.1'
    }))
    const body = JSON.parse(response.text())

    expect(body.reset).toBe(true)
    expect(body.cursor).toBe(80)
    expect(body.events).toContainEqual({
      id: 0,
      data: { type: 'reload', reason: 'overlay-history-gap' }
    })
    expect(getEventsSince).not.toHaveBeenCalled()
  })
})

describe('OverlayRouter alert media', () => {
  it('serves replaceable alert assets without persistent browser caching', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'ilystream-alert-asset-'))
    const assetPath = join(tempDir, 'Gift.png')
    await writeFile(assetPath, Buffer.from('current gift image'))

    try {
      const { router } = makeRouter()
      ;(router as any).getAssetService = () => ({ getAssetPath: () => assetPath })

      const response = await dispatch(router, new TestRequest({
        method: 'GET',
        url: '/assets/Gift.png?v=fresh-launch',
        headers: { host: '127.0.0.1:8899' },
        remoteAddress: '127.0.0.1'
      }))

      expect(response.statusCode).toBe(200)
      expect(response.headers['Content-Type']).toBe('image/png')
      expect(response.headers['Cache-Control']).toBe('no-cache, no-store, must-revalidate')
      expect(response.headers.Pragma).toBe('no-cache')
      expect(response.bytes()).toEqual(Buffer.from('current gift image'))
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('serves category-scoped join sounds to the shared alert audio queue', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'ilystream-join-sound-'))
    const soundPath = join(tempDir, 'hello.wav')
    await writeFile(soundPath, Buffer.from('RIFF test wave'))

    try {
      const { router } = makeRouter()
      const getSoundPath = vi.fn(() => soundPath)
      ;(router as any).getSoundboardService = () => ({ getSoundPath })

      const response = await dispatch(router, new TestRequest({
        method: 'GET',
        url: '/sounds/join/hello.wav?v=fresh-launch',
        headers: { host: '127.0.0.1:8899' },
        remoteAddress: '127.0.0.1'
      }))

      expect(response.statusCode).toBe(200)
      expect(response.headers['Content-Type']).toBe('audio/wav')
      expect(getSoundPath).toHaveBeenCalledWith('join/hello.wav')
      expect(response.bytes()).toEqual(Buffer.from('RIFF test wave'))
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})

describe('OverlayRouter deck authorization', () => {
  it('serves the deck page on loopback and allows its same-origin action token locally', async () => {
    const { router, emitDeckAction } = makeRouter()
    const page = await dispatch(router, new TestRequest({
      method: 'GET',
      url: '/overlay/deck',
      headers: { host: '127.0.0.1:8899' },
      remoteAddress: '127.0.0.1'
    }))
    const deckToken = getDeckToken(page.text())

    const action = await dispatch(router, new TestRequest({
      method: 'POST',
      url: '/overlay/deck/action',
      headers: {
        host: '127.0.0.1:8899',
        origin: 'http://127.0.0.1:8899',
        'x-ilystream-deck-token': deckToken,
        'content-type': 'application/json'
      },
      remoteAddress: '127.0.0.1',
      body: { type: 'PLAY_SOUND', payload: { soundId: 'airhorn.mp3' } }
    }))

    expect(action.statusCode).toBe(200)
    expect(JSON.parse(action.text())).toEqual({ success: true })
    expect(emitDeckAction).toHaveBeenCalledWith({
      type: 'PLAY_SOUND',
      payload: { soundId: 'airhorn.mp3' }
    })
  })

  it('does not accept the public deck page token from a LAN client', async () => {
    const { router, emitDeckAction } = makeRouter()
    const page = await dispatch(router, new TestRequest({
      method: 'GET',
      url: '/overlay/deck',
      headers: { host: '127.0.0.1:8899' },
      remoteAddress: '127.0.0.1'
    }))
    const deckToken = getDeckToken(page.text())

    const noOrigin = await dispatch(router, new TestRequest({
      method: 'POST',
      url: '/overlay/deck/action',
      headers: {
        host: '192.168.1.10:8899',
        'x-ilystream-deck-token': deckToken,
        'content-type': 'application/json'
      },
      remoteAddress: '192.168.1.50',
      body: { type: 'HALVING' }
    }))

    expect(noOrigin.statusCode).toBe(401)
    expect(JSON.parse(noOrigin.text())).toEqual({ error: 'Unauthorized' })

    const forgedOrigin = await dispatch(router, new TestRequest({
      method: 'POST',
      url: '/overlay/deck/action',
      headers: {
        host: '192.168.1.10:8899',
        origin: 'http://192.168.1.10:8899',
        'x-ilystream-deck-token': deckToken,
        'content-type': 'application/json'
      },
      remoteAddress: '192.168.1.50',
      body: { type: 'HALVING' }
    }))

    expect(forgedOrigin.statusCode).toBe(401)
    expect(JSON.parse(forgedOrigin.text())).toEqual({ error: 'Unauthorized' })
    expect(emitDeckAction).not.toHaveBeenCalled()
  })

  it('requires remote auth before serving the deck page to a LAN client', async () => {
    const { router } = makeRouter()

    const unauthorized = await dispatch(router, new TestRequest({
      method: 'GET',
      url: '/overlay/deck',
      headers: { host: '192.168.1.10:8899' },
      remoteAddress: '192.168.1.50'
    }))
    expect(unauthorized.statusCode).toBe(401)
    expect(JSON.parse(unauthorized.text())).toEqual({ error: 'Unauthorized' })

    const authorized = await dispatch(router, new TestRequest({
      method: 'GET',
      url: '/overlay/deck?token=remote-token',
      headers: { host: '192.168.1.10:8899' },
      remoteAddress: '192.168.1.50'
    }))
    expect(authorized.statusCode).toBe(200)
    expect(authorized.text()).toContain('const DECK_TOKEN = ')
  })

  it('allows LAN deck actions with a valid remote token', async () => {
    const { router, emitDeckAction } = makeRouter()

    const action = await dispatch(router, new TestRequest({
      method: 'POST',
      url: '/overlay/deck/action?token=remote-token',
      headers: {
        host: '192.168.1.10:8899',
        'content-type': 'application/json'
      },
      remoteAddress: '192.168.1.50',
      body: { type: 'SET_SCENE', payload: { sceneId: 'main' } }
    }))

    expect(action.statusCode).toBe(200)
    expect(JSON.parse(action.text())).toEqual({ success: true })
    expect(emitDeckAction).toHaveBeenCalledWith({
      type: 'SET_SCENE',
      payload: { sceneId: 'main' }
    })
  })
})

describe('OverlayRouter local widget assets', () => {
  it('serves the versioned same-origin SharedWorker runtime immutably', async () => {
    const { router } = makeRouter()
    const response = await dispatch(router, new TestRequest({
      method: 'GET',
      url: '/overlay/runtime/shared-worker.js?v=2',
      headers: { host: '127.0.0.1:8899' },
      remoteAddress: '127.0.0.1'
    }))

    expect(response.statusCode).toBe(200)
    expect(response.headers['Content-Type']).toBe('text/javascript; charset=utf-8')
    expect(response.headers['Cache-Control']).toBe('public, max-age=31536000, immutable')
    expect(response.text()).toContain("new WebSocket(socketUrl())")
    expect(response.text()).toContain("url.searchParams.set('cap',")
    expect(response.text()).toContain("type: 'subscribe'")
  })

  it('serves Matter.js from the local overlay origin', async () => {
    const { router } = makeRouter()
    const response = await dispatch(router, new TestRequest({
      method: 'GET',
      url: '/overlay/vendor/matter.min.js',
      headers: { host: '127.0.0.1:8899' },
      remoteAddress: '127.0.0.1'
    }))

    expect(response.statusCode).toBe(200)
    expect(response.headers['Content-Type']).toBe('text/javascript; charset=utf-8')
    expect(response.text()).toContain('Matter')
    expect(response.text().length).toBeGreaterThan(50_000)
  })

  it('serves bundled Companion emoji art from the local overlay origin', async () => {
    const { router } = makeRouter()
    const response = await dispatch(router, new TestRequest({
      method: 'GET',
      url: '/overlay/companion/emoji/emoji_u1f602.svg',
      headers: { host: '192.168.1.10:8899' },
      remoteAddress: '192.168.1.50'
    }))

    expect(response.statusCode).toBe(200)
    expect(response.headers['Content-Type']).toBe('image/svg+xml; charset=utf-8')
    expect(response.headers['Cache-Control']).toBe('public, max-age=31536000, immutable')
    expect(response.headers['X-Content-Type-Options']).toBe('nosniff')
    expect(response.text()).toContain('<svg')
  })

  it('rejects path traversal in Companion emoji asset requests', async () => {
    const { router } = makeRouter()
    const response = await dispatch(router, new TestRequest({
      method: 'GET',
      url: '/overlay/companion/emoji/..%2Fpackage.json',
      headers: { host: '192.168.1.10:8899' },
      remoteAddress: '192.168.1.50'
    }))

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.text())).toEqual({ error: 'Invalid companion emoji asset' })
  })
})

describe('OverlayRouter likes lifetime leaderboard', () => {
  const requestOptions = {
    method: 'GET',
    url: '/overlay/likes/lifetime?limit=5',
    headers: { host: '127.0.0.1:8899' },
    remoteAddress: '127.0.0.1'
  }

  it('returns all-time likers with their avatars when a stats service is wired', async () => {
    const statsService = {
      getGlobalStats: () => ({ totalLikes: 1196342 }),
      getTopIdentities: () => [
        {
          displayName: 'restlesstinyspirit',
          profilePictureUrl: 'https://p16-common-sign.tiktokcdn-us.com/a.webp?x-signature=one',
          totalLikes: 1196342
        },
        { displayName: 'queena.chaos', profilePictureUrl: 'https://p19-common-sign.tiktokcdn-us.com/b.webp', totalLikes: 1025199 },
        { displayName: 'never liked', profilePictureUrl: 'https://example.com/c.webp', totalLikes: 0 }
      ]
    }
    const { router } = makeRouter(statsService)

    const response = await dispatch(router, new TestRequest(requestOptions))
    const body = JSON.parse(response.text())

    expect(response.statusCode).toBe(200)
    expect(body.totalLikes).toBe(1196342)
    // Users with zero likes are dropped; everyone else keeps their avatar.
    expect(body.users).toHaveLength(2)
    expect(body.users[0]).toMatchObject({
      displayName: 'restlesstinyspirit',
      profilePictureUrl: 'https://p16-common-sign.tiktokcdn-us.com/a.webp?x-signature=one'
    })
    expect(body.users.every((u: any) => u.profilePictureUrl)).toBe(true)
  })

  // Regression: the production wiring once never called setStatsService, so this
  // endpoint silently served an empty board — the widget looked broken.
  it('warns instead of silently serving an empty board when stats are unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { router } = makeRouter(null)
      const response = await dispatch(router, new TestRequest(requestOptions))

      expect(JSON.parse(response.text())).toEqual({ totalLikes: 0, users: [] })
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('without a stats service'))
    } finally {
      warn.mockRestore()
    }
  })
})

describe('OverlayRouter avatar cache', () => {
  it('serves fresh and cached WebP avatars with the correct response headers', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'ilystream-avatar-test-'))
    const remoteUrl = 'https://p16-webcast.tiktokcdn.com/avatar.webp'
    const encodedUrl = Buffer.from(remoteUrl).toString('base64url')
    // Cache files are keyed on the stable image identity, not the signed URL.
    const cachePath = join(userDataPath, 'avatar_cache', avatarCacheFileName(remoteUrl))
    const webp = Buffer.from('52494646040000005745425056503820', 'hex')
    const fetchMock = vi.fn(async () => new Response(webp, {
      status: 200,
      headers: { 'Content-Type': 'image/webp' }
    }))

    vi.mocked(app.getPath).mockReturnValue(userDataPath)
    vi.stubGlobal('fetch', fetchMock)

    try {
      const { router } = makeRouter()
      const requestOptions = {
        method: 'GET',
        url: `/avatar/${encodedUrl}`,
        headers: { host: '127.0.0.1:8899' },
        remoteAddress: '127.0.0.1'
      }

      const freshResponse = await dispatch(router, new TestRequest(requestOptions))
      expect(freshResponse.statusCode).toBe(200)
      expect(freshResponse.headers['Content-Type']).toBe('image/webp')
      expect(freshResponse.headers['Cache-Control']).toBe('no-cache, must-revalidate')
      expect(freshResponse.headers.Pragma).toBe('no-cache')
      expect(freshResponse.headers['X-Content-Type-Options']).toBe('nosniff')
      expect(freshResponse.headers.ETag).toMatch(/^"[A-Za-z0-9_-]+"$/)
      expect(freshResponse.bytes()).toEqual(webp)

      await vi.waitFor(async () => {
        expect(await readFile(cachePath)).toEqual(webp)
      })

      const cachedResponse = await dispatch(router, new TestRequest(requestOptions))
      expect(cachedResponse.statusCode).toBe(200)
      expect(cachedResponse.headers['Content-Type']).toBe('image/webp')
      expect(cachedResponse.headers['Cache-Control']).toBe('no-cache, must-revalidate')
      expect(cachedResponse.bytes()).toEqual(webp)
      expect(fetchMock).toHaveBeenCalledTimes(1)

      const revalidatedResponse = await dispatch(router, new TestRequest({
        ...requestOptions,
        headers: {
          ...requestOptions.headers,
          'if-none-match': String(cachedResponse.headers.ETag)
        }
      }))
      expect(revalidatedResponse.statusCode).toBe(304)
      expect(revalidatedResponse.headers.ETag).toBe(cachedResponse.headers.ETag)
      expect(revalidatedResponse.bytes()).toEqual(Buffer.alloc(0))
      expect(fetchMock).toHaveBeenCalledTimes(1)

      // A re-signed/host-rotated URL for the same image is also a cache hit.
      const resignedUrl = 'https://p19-webcast.tiktokcdn.com/avatar.webp?x-signature=fresh&x-expires=2'
      const resignedResponse = await dispatch(router, new TestRequest({
        ...requestOptions,
        url: `/avatar/${Buffer.from(resignedUrl).toString('base64url')}`
      }))
      expect(resignedResponse.statusCode).toBe(200)
      expect(resignedResponse.bytes()).toEqual(webp)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
      vi.mocked(app.getPath).mockReturnValue('')
      await rm(userDataPath, { recursive: true, force: true })
    }
  })

  it('marks upstream avatar failures no-store', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'ilystream-avatar-error-test-'))
    const remoteUrl = 'https://cdn.example.com/unavailable.webp'
    const fetchMock = vi.fn(async () => new Response('unavailable', { status: 503 }))

    vi.mocked(app.getPath).mockReturnValue(userDataPath)
    vi.stubGlobal('fetch', fetchMock)

    try {
      const { router } = makeRouter()
      const response = await dispatch(router, new TestRequest({
        method: 'GET',
        url: `/avatar/${Buffer.from(remoteUrl).toString('base64url')}`,
        headers: { host: '127.0.0.1:8899' },
        remoteAddress: '127.0.0.1'
      }))

      expect(response.statusCode).toBe(503)
      expect(response.headers['Cache-Control']).toBe('no-store')
      expect(response.headers.Pragma).toBe('no-cache')
      expect(response.headers['X-Content-Type-Options']).toBe('nosniff')
      expect(JSON.parse(response.text())).toEqual({ error: 'Avatar fetch failed (HTTP 503)' })
    } finally {
      vi.unstubAllGlobals()
      vi.mocked(app.getPath).mockReturnValue('')
      await rm(userDataPath, { recursive: true, force: true })
    }
  })
})
