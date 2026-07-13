import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TikTokAuthBridge, hashDesktopToken } from './bridge.js'
import { PendingTikTokLiveProvider } from './live-provider.js'
import { MemoryTikTokSessionStore } from './session-store.js'
import { BridgeHttpError, type TikTokOAuthClient, type TikTokTokenBundle } from './types.js'

const NOW = Date.UTC(2026, 6, 13)
const REDIRECT_URI = 'http://127.0.0.1:8792/callback/'
const CODE_VERIFIER = 'a'.repeat(64)

describe('TikTokAuthBridge', () => {
  let sessionStore: MemoryTikTokSessionStore
  let tokenBundle: TikTokTokenBundle
  let oauthClient: TikTokOAuthClient
  let exchangeAuthorizationCode: ReturnType<typeof vi.fn>
  let refreshAccessToken: ReturnType<typeof vi.fn>
  let revokeAccessToken: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sessionStore = new MemoryTikTokSessionStore()
    tokenBundle = {
      accessToken: 'tiktok-access-token',
      refreshToken: 'tiktok-refresh-token',
      openId: 'creator-open-id',
      scope: 'user.info.basic',
      accessExpiresAt: NOW + 60 * 60 * 1000,
      refreshExpiresAt: NOW + 365 * 24 * 60 * 60 * 1000
    }
    exchangeAuthorizationCode = vi.fn(async () => tokenBundle)
    refreshAccessToken = vi.fn(async () => ({
      ...tokenBundle,
      accessToken: 'rotated-access-token',
      refreshToken: 'rotated-refresh-token',
      accessExpiresAt: NOW + 2 * 60 * 60 * 1000
    }))
    revokeAccessToken = vi.fn(async () => undefined)
    oauthClient = {
      exchangeAuthorizationCode,
      refreshAccessToken,
      revokeAccessToken,
      getBasicUser: vi.fn(async () => ({
        openId: tokenBundle.openId,
        displayName: 'Creator',
        avatarUrl: 'https://example.com/avatar.png'
      }))
    }
  })

  it('exchanges the grant without returning TikTok credentials to the desktop', async () => {
    const bridge = createBridge(oauthClient, sessionStore)

    const response = await bridge.exchangeAuthorizationCode({
      clientKey: 'public-client-key',
      code: 'one-time-code',
      codeVerifier: CODE_VERIFIER,
      redirectUri: REDIRECT_URI
    })

    expect(response).toMatchObject({
      account: { openId: 'creator-open-id', displayName: 'Creator' },
      liveAccess: 'pending'
    })
    expect(response.desktopAccessToken).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(response).not.toHaveProperty('accessToken')
    expect(response).not.toHaveProperty('refreshToken')
    expect(await sessionStore.get(hashDesktopToken(response.desktopAccessToken))).toMatchObject({
      tokens: { accessToken: 'tiktok-access-token', refreshToken: 'tiktok-refresh-token' }
    })
  })

  it('rotates expiring TikTok credentials before returning a session', async () => {
    tokenBundle.accessExpiresAt = NOW + 5 * 60 * 1000
    const bridge = createBridge(oauthClient, sessionStore)
    const exchange = await bridge.exchangeAuthorizationCode({
      clientKey: 'public-client-key',
      code: 'one-time-code',
      codeVerifier: CODE_VERIFIER,
      redirectUri: REDIRECT_URI
    })

    await bridge.getSession(exchange.desktopAccessToken)

    expect(refreshAccessToken).toHaveBeenCalledWith('tiktok-refresh-token')
    expect(await sessionStore.get(hashDesktopToken(exchange.desktopAccessToken))).toMatchObject({
      tokens: { accessToken: 'rotated-access-token', refreshToken: 'rotated-refresh-token' }
    })
  })

  it('coalesces concurrent refreshes for the same desktop session', async () => {
    tokenBundle.accessExpiresAt = NOW + 5 * 60 * 1000
    let resolveRefresh: ((tokens: TikTokTokenBundle) => void) | undefined
    refreshAccessToken = vi.fn(() => new Promise<TikTokTokenBundle>((resolve) => {
      resolveRefresh = resolve
    }))
    oauthClient.refreshAccessToken = refreshAccessToken
    const bridge = createBridge(oauthClient, sessionStore)
    const exchange = await bridge.exchangeAuthorizationCode({
      clientKey: 'public-client-key',
      code: 'one-time-code',
      codeVerifier: CODE_VERIFIER,
      redirectUri: REDIRECT_URI
    })

    const first = bridge.getSession(exchange.desktopAccessToken)
    const second = bridge.getSession(exchange.desktopAccessToken)
    await vi.waitFor(() => expect(refreshAccessToken).toHaveBeenCalledTimes(1))
    resolveRefresh?.({
      ...tokenBundle,
      accessToken: 'coalesced-access-token',
      refreshToken: 'coalesced-refresh-token',
      accessExpiresAt: NOW + 2 * 60 * 60 * 1000
    })

    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
  })

  it('rejects a mismatched client key or redirect URI before contacting TikTok', async () => {
    const bridge = createBridge(oauthClient, sessionStore)

    await expect(bridge.exchangeAuthorizationCode({
      clientKey: 'wrong-client-key',
      code: 'one-time-code',
      codeVerifier: CODE_VERIFIER,
      redirectUri: REDIRECT_URI
    })).rejects.toMatchObject({ status: 400, code: 'invalid_client_key' })
    await expect(bridge.exchangeAuthorizationCode({
      clientKey: 'public-client-key',
      code: 'one-time-code',
      codeVerifier: CODE_VERIFIER,
      redirectUri: 'http://127.0.0.1:9999/callback/'
    })).rejects.toMatchObject({ status: 400, code: 'invalid_redirect_uri' })
    expect(exchangeAuthorizationCode).not.toHaveBeenCalled()
  })

  it('keeps native LIVE disabled while partner access is pending', async () => {
    const bridge = createBridge(oauthClient, sessionStore)
    const exchange = await bridge.exchangeAuthorizationCode({
      clientKey: 'public-client-key',
      code: 'one-time-code',
      codeVerifier: CODE_VERIFIER,
      redirectUri: REDIRECT_URI
    })

    await expect(bridge.prepareLive(exchange.desktopAccessToken, {
      orientation: 'portrait'
    })).rejects.toEqual(expect.objectContaining<Partial<BridgeHttpError>>({
      status: 403,
      code: 'live_access_pending'
    }))
  })

  it('revokes TikTok access and deletes the opaque desktop session', async () => {
    const bridge = createBridge(oauthClient, sessionStore)
    const exchange = await bridge.exchangeAuthorizationCode({
      clientKey: 'public-client-key',
      code: 'one-time-code',
      codeVerifier: CODE_VERIFIER,
      redirectUri: REDIRECT_URI
    })

    await bridge.disconnect(exchange.desktopAccessToken)

    expect(revokeAccessToken).toHaveBeenCalledWith('tiktok-access-token')
    expect(await sessionStore.get(hashDesktopToken(exchange.desktopAccessToken))).toBeUndefined()
  })
})

function createBridge(
  oauthClient: TikTokOAuthClient,
  sessionStore: MemoryTikTokSessionStore
): TikTokAuthBridge {
  return new TikTokAuthBridge({
    clientKey: 'public-client-key',
    redirectUri: REDIRECT_URI,
    desktopSessionTtlMs: 30 * 24 * 60 * 60 * 1000,
    oauthClient,
    sessionStore,
    liveProvider: new PendingTikTokLiveProvider(),
    now: () => NOW,
    logger: { warn: vi.fn() }
  })
}
