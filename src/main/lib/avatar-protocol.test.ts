import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMocks = vi.hoisted(() => ({
  getPath: vi.fn(),
  handle: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: electronMocks.getPath },
  protocol: { handle: electronMocks.handle }
}))

vi.mock('./ssrf-guard', () => ({
  fetchSafePublicHttp: vi.fn(async (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => {
    const response = await fetch(url, init)
    return {
      url: new URL(url),
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      data: Buffer.from(await response.arrayBuffer())
    }
  }),
  MAX_AVATAR_BYTES: 1024
}))

import { __resetAvatarCacheStateForTests } from './avatar-cache'
import { registerAvatarProtocol } from './avatar-protocol'

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])

describe('ily-avatar protocol', () => {
  let userDataPath: string

  beforeEach(async () => {
    __resetAvatarCacheStateForTests()
    userDataPath = await mkdtemp(join(tmpdir(), 'ilystream-avatar-protocol-'))
    electronMocks.getPath.mockReturnValue(userDataPath)
    electronMocks.handle.mockReset()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(JPEG), {
      status: 200,
      headers: { 'Content-Type': 'image/jpeg' }
    })))
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await rm(userDataPath, { recursive: true, force: true })
  })

  function getHandler(): (request: Request) => Promise<Response> {
    registerAvatarProtocol()
    expect(electronMocks.handle).toHaveBeenCalledWith('ily-avatar', expect.any(Function))
    return electronMocks.handle.mock.calls[0][1]
  }

  it('requires browser revalidation and answers matching ETags with 304', async () => {
    const handler = getHandler()
    const remoteUrl = 'https://cdn.example.com/profile.jpg'
    const requestUrl = `ily-avatar://proxy/${Buffer.from(remoteUrl).toString('base64url')}`

    const response = await handler({ url: requestUrl, headers: new Headers() } as Request)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/jpeg')
    expect(response.headers.get('Cache-Control')).toBe('no-cache, must-revalidate')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('ETag')).toMatch(/^"[A-Za-z0-9_-]+"$/)
    expect(Buffer.from(await response.arrayBuffer())).toEqual(JPEG)

    const etag = response.headers.get('ETag')!
    const revalidated = await handler({
      url: requestUrl,
      headers: new Headers({ 'If-None-Match': etag })
    } as Request)

    expect(revalidated.status).toBe(304)
    expect(revalidated.headers.get('ETag')).toBe(etag)
    expect(await revalidated.text()).toBe('')
  })

  it('marks protocol errors no-store', async () => {
    const handler = getHandler()
    const response = await handler({
      url: 'ily-avatar://proxy/not-a-valid-avatar',
      headers: new Headers()
    } as Request)

    expect(response.status).toBe(400)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
  })
})
