import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildTikTokAuthorizeUrl,
  cancelTikTokNativeAuth,
  generateTikTokCodeChallenge,
  initiateTikTokNativeAuth,
  parseTikTokNativeLiveDestination,
  validateTikTokAuthBridgeUrl,
  type TikTokNativeAuthOptions
} from './tiktok-native-auth'
import { TIKTOK_NATIVE_REDIRECT_URI } from '../../../shared/tiktok-native'

afterEach(async () => {
  await cancelTikTokNativeAuth()
  vi.useRealTimers()
})

describe('TikTok native authorization', () => {
  it('builds the documented desktop Login Kit authorization request', () => {
    const url = new URL(buildTikTokAuthorizeUrl({
      clientKey: 'client-key',
      state: 'csrf-state',
      codeChallenge: 'challenge'
    }))

    expect(url.origin + url.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/')
    expect(url.searchParams.get('client_key')).toBe('client-key')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('user.info.basic')
    expect(url.searchParams.get('redirect_uri')).toBe(TIKTOK_NATIVE_REDIRECT_URI)
    expect(url.searchParams.get('state')).toBe('csrf-state')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('uses TikTok desktop Login Kit hex encoding for the PKCE challenge', () => {
    expect(generateTikTokCodeChallenge('verifier')).toMatch(/^[a-f0-9]{64}$/)
  })

  it('requires HTTPS except for a loopback development bridge', () => {
    expect(validateTikTokAuthBridgeUrl('https://auth.ilystream.example/base').href)
      .toBe('https://auth.ilystream.example/base/')
    expect(validateTikTokAuthBridgeUrl('http://127.0.0.1:8787/').href)
      .toBe('http://127.0.0.1:8787/')
    expect(() => validateTikTokAuthBridgeUrl('http://auth.ilystream.example'))
      .toThrow(/must use HTTPS/)
  })

  it('times out and releases the loopback route', async () => {
    vi.useFakeTimers()
    const harness = createAuthHarness({ authTimeoutMs: 100 })
    const flow = initiateTikTokNativeAuth(harness.options)
    const rejection = expect(flow).rejects.toThrow(/timed out after 5 minutes/)

    await flushAuthSetup()
    await vi.advanceTimersByTimeAsync(100)

    await rejection
    expect(harness.close).toHaveBeenCalledOnce()
  })

  it('cancels an active authorization and releases the loopback route', async () => {
    const harness = createAuthHarness()
    const flow = initiateTikTokNativeAuth(harness.options)
    const rejection = expect(flow).rejects.toThrow(/authorization cancelled/)
    await flushAuthSetup()

    await expect(cancelTikTokNativeAuth()).resolves.toBe(true)

    await rejection
    expect(harness.close).toHaveBeenCalledOnce()
  })

  it('restarts by cancelling the previous authorization attempt', async () => {
    const first = createAuthHarness()
    const firstFlow = initiateTikTokNativeAuth(first.options)
    const firstRejection = expect(firstFlow).rejects.toThrow(/restarted by a new connect attempt/)
    await flushAuthSetup()

    const second = createAuthHarness()
    const secondFlow = initiateTikTokNativeAuth(second.options)
    const secondRejection = expect(secondFlow).rejects.toThrow(/authorization cancelled/)
    await flushAuthSetup()

    await firstRejection
    expect(first.close).toHaveBeenCalledOnce()
    await cancelTikTokNativeAuth()
    await secondRejection
  })

  it('rejects a denied TikTok callback', async () => {
    const harness = createAuthHarness()
    const flow = initiateTikTokNativeAuth(harness.options)
    const rejection = expect(flow).rejects.toThrow(/authorization denied: access_denied/)
    await flushAuthSetup()

    const state = new URL(harness.openedUrl()).searchParams.get('state')
    harness.handleCallback(
      `/callback/?state=${encodeURIComponent(state || '')}&error=access_denied`,
      createResponse()
    )

    await rejection
  })

  it('rejects a callback with a mismatched security state', async () => {
    const harness = createAuthHarness()
    const flow = initiateTikTokNativeAuth(harness.options)
    const rejection = expect(flow).rejects.toThrow(/state mismatch/)
    await flushAuthSetup()

    harness.handleCallback('/callback/?state=wrong&code=authorization-code', createResponse())

    await rejection
  })

  it('accepts only complete RTMP destinations from the approved provider', () => {
    expect(parseTikTokNativeLiveDestination({
      rtmpUrl: 'rtmps://push.example.test/live',
      streamKey: 'temporary-key',
      liveId: 'live-1'
    })).toEqual({
      rtmpUrl: 'rtmps://push.example.test/live',
      streamKey: 'temporary-key',
      liveId: 'live-1',
      watchUrl: undefined,
      title: undefined
    })
    expect(() => parseTikTokNativeLiveDestination({ rtmpUrl: 'https://example.test', streamKey: 'key' }))
      .toThrow(/invalid RTMP/)
    expect(() => parseTikTokNativeLiveDestination({ rtmpUrl: 'rtmp://example.test', streamKey: '' }))
      .toThrow(/stream key/)
  })
})

function createAuthHarness(overrides: Partial<TikTokNativeAuthOptions> = {}) {
  let openedUrl = ''
  let callback: ((request: any, response: any) => void | Promise<void>) | null = null
  const close = vi.fn(async () => {})
  const registerLoopbackRouteImpl = vi.fn(async (options: {
    handle: (request: any, response: any) => void | Promise<void>
  }) => {
    callback = options.handle
    return { port: 8792, close }
  }) as NonNullable<TikTokNativeAuthOptions['registerLoopbackRouteImpl']>

  const options: TikTokNativeAuthOptions = {
    clientKey: 'client-key',
    bridgeUrl: 'https://auth.ilystream.example/',
    getAccessToken: () => '',
    setAccessToken: vi.fn(),
    openExternal: vi.fn(async (url: string) => {
      openedUrl = url
    }),
    registerLoopbackRouteImpl,
    ...overrides
  }

  return {
    options,
    close,
    openedUrl: () => openedUrl,
    handleCallback: (url: string, response: any) => {
      if (!callback) throw new Error('Callback route was not registered')
      void callback({ url }, response)
    }
  }
}

function createResponse() {
  return {
    writeHead: vi.fn(),
    end: vi.fn()
  }
}

async function flushAuthSetup(): Promise<void> {
  for (let index = 0; index < 6; index += 1) await Promise.resolve()
}
