import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KickProfileResolver } from './kick-profile-resolver'
import type { KickConfig } from '../types'

describe('KickProfileResolver', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('batches numeric user IDs and caches official profile results', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      expect(url.searchParams.getAll('id')).toEqual(['101', '202'])
      return jsonResponse({
        data: [
          { user_id: 101, name: 'Alice', profile_picture: 'https://files.kick.com/alice.webp' },
          { user_id: 202, name: 'Bob', profile_picture: 'https://files.kick.com/bob.webp' }
        ]
      })
    }) as unknown as typeof fetch
    const resolver = createResolver(fetchImpl)

    const alice = resolver.resolve('101')
    const bob = resolver.resolve('202')
    await vi.advanceTimersByTimeAsync(25)

    await expect(alice).resolves.toMatchObject({ id: '101', displayName: 'Alice', profilePictureUrl: 'https://files.kick.com/alice.webp' })
    await expect(bob).resolves.toMatchObject({ id: '202', displayName: 'Bob', profilePictureUrl: 'https://files.kick.com/bob.webp' })
    await expect(resolver.resolve('101')).resolves.toMatchObject({ id: '101' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(resolver.getHealth().state).toBe('healthy')
  })

  it('refreshes a rejected user token once and reports the new token', async () => {
    const config = connectedConfig()
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(jsonResponse({
        data: [{ user_id: 101, name: 'Alice', profile_picture: 'https://files.kick.com/alice.webp' }]
      })) as unknown as typeof fetch
    const onTokensRefreshed = vi.fn()
    const refreshUserTokens = vi.fn().mockResolvedValue({
      accessToken: 'fresh-user-token',
      refreshToken: 'fresh-refresh-token',
      expiresAt: Date.now() + 60 * 60_000,
      scopes: 'user:read events:subscribe'
    })
    const resolver = new KickProfileResolver({
      getConfig: () => config,
      fetchImpl,
      refreshUserTokens,
      onTokensRefreshed
    })

    const pending = resolver.resolve('101')
    await vi.advanceTimersByTimeAsync(25)

    await expect(pending).resolves.toMatchObject({ id: '101' })
    expect(refreshUserTokens).toHaveBeenCalledTimes(1)
    expect(onTokensRefreshed).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: 'fresh-user-token',
      refreshToken: 'fresh-refresh-token'
    }))
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('isolates authentication failures and temporarily opens a circuit', async () => {
    let now = 1_000
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const createAppToken = vi.fn().mockRejectedValue(new Error('Kick app token request failed (401)'))
    const resolver = new KickProfileResolver({
      getConfig: () => ({
        platform: 'kick',
        enabled: true,
        channelName: 'creator',
        clientId: 'client-id',
        clientSecret: 'bad-secret'
      }),
      fetchImpl,
      createAppToken,
      now: () => now
    })

    const first = resolver.resolve('101')
    await vi.advanceTimersByTimeAsync(25)
    await expect(first).resolves.toBeNull()
    expect(resolver.getHealth()).toMatchObject({
      state: 'degraded',
      error: 'Kick app token request failed (401)'
    })

    await expect(resolver.resolve('202')).resolves.toBeNull()
    expect(createAppToken).toHaveBeenCalledTimes(1)

    now += 5_000
    const retry = resolver.resolve('202')
    await vi.advanceTimersByTimeAsync(25)
    await expect(retry).resolves.toBeNull()
    expect(createAppToken).toHaveBeenCalledTimes(2)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('uses an app token when no readable user token is available', async () => {
    const createAppToken = vi.fn().mockResolvedValue('app-token')
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer app-token')
      return jsonResponse({ data: [{ user_id: 101, name: 'Alice' }] })
    }) as unknown as typeof fetch
    const resolver = new KickProfileResolver({
      getConfig: () => ({
        platform: 'kick',
        enabled: true,
        channelName: 'creator',
        clientId: 'client-id',
        clientSecret: 'client-secret'
      }),
      fetchImpl,
      createAppToken
    })

    const pending = resolver.resolve('101')
    await vi.advanceTimersByTimeAsync(25)

    await expect(pending).resolves.toMatchObject({ id: '101', displayName: 'Alice' })
    expect(createAppToken).toHaveBeenCalledTimes(1)
  })
})

function createResolver(fetchImpl: typeof fetch): KickProfileResolver {
  const config = connectedConfig()
  return new KickProfileResolver({ getConfig: () => config, fetchImpl })
}

function connectedConfig(): KickConfig {
  return {
    platform: 'kick',
    enabled: true,
    channelName: 'creator',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    userAccessToken: 'user-token',
    userRefreshToken: 'refresh-token',
    userTokenExpiresAt: Date.now() + 60 * 60_000,
    userScopes: 'user:read'
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
