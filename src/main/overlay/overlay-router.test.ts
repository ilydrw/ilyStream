import { once } from 'events'
import { Readable, Writable } from 'stream'
import { describe, expect, it, vi } from 'vitest'
import { OverlayRouter } from './overlay-router'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '')
  }
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
}

function makeRouter() {
  const emitDeckAction = vi.fn()
  const authService = {
    verifyToken: vi.fn((token: string) => token === 'remote-token')
  }
  const router = new OverlayRouter(
    () => ({ getAllDeckActions: () => [] } as any),
    () => null,
    () => ({ getAllSounds: () => [] } as any),
    () => authService as any,
    () => null,
    {
      attachClient: vi.fn(),
      getClientCount: vi.fn(() => 0),
      getEventsSince: vi.fn(() => []),
      getLastPayload: vi.fn(() => null)
    } as any,
    { getHistory: vi.fn(() => []) } as any,
    { getHistory: vi.fn(() => []) } as any,
    { getState: vi.fn(() => ({ totalLikes: 0, totalGiftCount: 0 })) } as any,
    { getState: vi.fn(() => null) } as any,
    { getSnapshot: vi.fn(() => ({ totalLikes: 0, users: [] })) } as any,
    () => ({ running: true, port: 8899 }),
    () => null,
    () => ({}),
    vi.fn(),
    emitDeckAction
  )
  return { router: router as any as OverlayRouter, authService, emitDeckAction }
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
