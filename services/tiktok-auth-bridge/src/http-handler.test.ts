import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TikTokAuthBridge } from './bridge.js'
import { createTikTokBridgeHandler } from './http-handler.js'
import { PendingTikTokLiveProvider } from './live-provider.js'
import { MemoryTikTokSessionStore } from './session-store.js'
import type { TikTokOAuthClient } from './types.js'

const servers: Server[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })))
})

describe('TikTok bridge HTTP handler', () => {
  it('exchanges OAuth grants and protects authenticated routes with opaque desktop tokens', async () => {
    const now = Date.UTC(2026, 6, 13)
    const oauthClient: TikTokOAuthClient = {
      exchangeAuthorizationCode: vi.fn(async () => ({
        accessToken: 'private-tiktok-access',
        refreshToken: 'private-tiktok-refresh',
        openId: 'open-id',
        scope: 'user.info.basic',
        accessExpiresAt: now + 60 * 60 * 1000,
        refreshExpiresAt: now + 365 * 24 * 60 * 60 * 1000
      })),
      refreshAccessToken: vi.fn(),
      revokeAccessToken: vi.fn(),
      getBasicUser: vi.fn(async () => ({ openId: 'open-id', displayName: 'Creator' }))
    }
    const bridge = new TikTokAuthBridge({
      clientKey: 'client-key',
      redirectUri: 'http://127.0.0.1:8792/callback/',
      desktopSessionTtlMs: 30 * 24 * 60 * 60 * 1000,
      oauthClient,
      sessionStore: new MemoryTikTokSessionStore(),
      liveProvider: new PendingTikTokLiveProvider(),
      now: () => now,
      logger: { warn: vi.fn() }
    })
    const { baseUrl } = await listen(createServer(createTikTokBridgeHandler(bridge)))

    const exchangeResponse = await fetch(`${baseUrl}/v1/tiktok/oauth/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientKey: 'client-key',
        code: 'one-time-code',
        codeVerifier: 'a'.repeat(64),
        redirectUri: 'http://127.0.0.1:8792/callback/'
      })
    })
    const exchange = await exchangeResponse.json() as Record<string, unknown>
    expect(exchangeResponse.status).toBe(200)
    expect(exchangeResponse.headers.get('cache-control')).toBe('no-store')
    expect(exchange.desktopAccessToken).toEqual(expect.any(String))
    expect(JSON.stringify(exchange)).not.toContain('private-tiktok-access')
    expect(JSON.stringify(exchange)).not.toContain('private-tiktok-refresh')

    const unauthorized = await fetch(`${baseUrl}/v1/tiktok/session`)
    expect(unauthorized.status).toBe(401)

    const session = await fetch(`${baseUrl}/v1/tiktok/session`, {
      headers: { Authorization: `Bearer ${exchange.desktopAccessToken}` }
    })
    expect(session.status).toBe(200)
    await expect(session.json()).resolves.toMatchObject({
      account: { openId: 'open-id', displayName: 'Creator' },
      liveAccess: 'pending'
    })

    const live = await fetch(`${baseUrl}/v1/tiktok/live/prepare`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${exchange.desktopAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ orientation: 'portrait' })
    })
    expect(live.status).toBe(403)
    await expect(live.json()).resolves.toMatchObject({ error: 'live_access_pending' })
  })
})

async function listen(server: Server): Promise<{ baseUrl: string }> {
  servers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test bridge did not bind a TCP port.')
  return { baseUrl: `http://127.0.0.1:${address.port}` }
}
