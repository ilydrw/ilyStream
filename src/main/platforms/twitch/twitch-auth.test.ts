import { describe, expect, it, vi } from 'vitest'
import {
  beginTwitchDeviceAuth,
  refreshTwitchAccessToken,
  requestTwitchDeviceAuthorization,
  TwitchPublicAuthProvider
} from './twitch-auth'

const CLIENT_ID = 'public-client-id'

describe('Twitch device authorization', () => {
  it('requests a device code with public client fields and no secret', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      device_code: 'device-code',
      user_code: 'ABCD1234',
      verification_uri: 'https://www.twitch.tv/activate?public=true&device-code=ABCD1234',
      expires_in: 1800,
      interval: 5
    })) as unknown as typeof fetch

    await expect(
      requestTwitchDeviceAuthorization(CLIENT_ID, ['chat:read', 'chat:edit'], fetchImpl)
    ).resolves.toMatchObject({
      userCode: 'ABCD1234',
      expiresIn: 1800,
      intervalSeconds: 5
    })

    const [, init] = (fetchImpl as any).mock.calls[0]
    const body = new URLSearchParams(String(init.body))
    expect(body.get('client_id')).toBe(CLIENT_ID)
    expect(body.get('scopes')).toBe('chat:read chat:edit')
    expect(body.has('client_secret')).toBe(false)
  })

  it('opens Twitch, honors slow_down, validates identity, and fetches the stream key', async () => {
    const polls: number[] = []
    let tokenPoll = 0
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)
      if (url.endsWith('/oauth2/device')) {
        return jsonResponse({
          device_code: 'device-code',
          user_code: 'ABCD1234',
          verification_uri: 'https://www.twitch.tv/activate?public=true&device-code=ABCD1234',
          expires_in: 1800,
          interval: 1
        })
      }
      if (url.endsWith('/oauth2/token')) {
        tokenPoll++
        if (tokenPoll === 1) return jsonResponse({ status: 400, message: 'slow_down' }, 400)
        return jsonResponse({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: 14_400,
          scope: ['chat:read', 'channel:read:stream_key']
        })
      }
      if (url.endsWith('/oauth2/validate')) {
        return jsonResponse({
          client_id: CLIENT_ID,
          login: 'stream_friend',
          user_id: '1234',
          scopes: ['chat:read', 'channel:read:stream_key'],
          expires_in: 14_399
        })
      }
      if (url.includes('/helix/streams/key')) {
        return jsonResponse({ data: [{ stream_key: 'live-stream-key' }] })
      }
      throw new Error(`Unexpected URL: ${url}`)
    }) as unknown as typeof fetch
    const openExternal = vi.fn().mockResolvedValue(undefined)
    const phases: string[] = []

    const result = await beginTwitchDeviceAuth({
      clientId: CLIENT_ID,
      scopes: ['chat:read', 'channel:read:stream_key'],
      fetchImpl,
      openExternal,
      wait: async (milliseconds) => { polls.push(milliseconds) },
      onProgress: (progress) => phases.push(progress.phase)
    })

    expect(openExternal).toHaveBeenCalledWith(
      'https://www.twitch.tv/activate?public=true&device-code=ABCD1234'
    )
    expect(polls).toEqual([1_000, 6_000])
    expect(phases).toEqual(['requesting-code', 'opening-browser', 'awaiting-consent'])
    expect(result).toMatchObject({
      login: 'stream_friend',
      userId: '1234',
      streamKey: 'live-stream-key',
      refreshToken: 'refresh-token'
    })
  })

  it('stops polling when Twitch denies authorization', async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)
      if (url.endsWith('/oauth2/device')) {
        return jsonResponse({
          device_code: 'device-code',
          user_code: 'ABCD1234',
          verification_uri: 'https://www.twitch.tv/activate?device-code=ABCD1234',
          expires_in: 1800,
          interval: 1
        })
      }
      return jsonResponse({ error: 'access_denied' }, 400)
    }) as unknown as typeof fetch

    await expect(beginTwitchDeviceAuth({
      clientId: CLIENT_ID,
      scopes: ['chat:read'],
      fetchImpl,
      openExternal: vi.fn().mockResolvedValue(undefined),
      wait: async () => undefined
    })).rejects.toThrow('authorization was denied')
  })
})

describe('Twitch public token refresh', () => {
  it('omits client_secret and requires the rotated refresh token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 14_400,
      scope: ['chat:read']
    })) as unknown as typeof fetch

    await expect(
      refreshTwitchAccessToken(CLIENT_ID, 'old refresh/+token', fetchImpl)
    ).resolves.toMatchObject({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token'
    })

    const [, init] = (fetchImpl as any).mock.calls[0]
    const body = new URLSearchParams(String(init.body))
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('old refresh/+token')
    expect(body.has('client_secret')).toBe(false)
  })

  it('serializes concurrent refreshes and publishes one rotated token pair', async () => {
    let refreshCalls = 0
    let validateCalls = 0
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)
      if (url.endsWith('/oauth2/token')) {
        refreshCalls++
        return jsonResponse({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 14_400,
          scope: ['chat:read']
        })
      }
      if (url.endsWith('/oauth2/validate')) {
        validateCalls++
        return jsonResponse({
          client_id: CLIENT_ID,
          login: 'stream_friend',
          user_id: '1234',
          scopes: ['chat:read'],
          expires_in: 14_399
        })
      }
      throw new Error(`Unexpected URL: ${url}`)
    }) as unknown as typeof fetch
    const onRefresh = vi.fn()
    const provider = new TwitchPublicAuthProvider({
      clientId: CLIENT_ID,
      accessToken: 'expired-access-token',
      refreshToken: 'old-refresh-token',
      userId: '1234',
      scopes: ['chat:read'],
      expiresIn: 1,
      obtainmentTimestamp: 0,
      lastValidatedAt: Date.now(),
      fetchImpl,
      onRefresh
    })

    const [first, second] = await Promise.all([
      provider.getAnyAccessToken(),
      provider.getAnyAccessToken()
    ])

    expect(first.accessToken).toBe('new-access-token')
    expect(second.refreshToken).toBe('new-refresh-token')
    expect(refreshCalls).toBe(1)
    expect(validateCalls).toBe(1)
    expect(onRefresh).toHaveBeenCalledOnce()
    expect(onRefresh).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token'
    }))
  })

  it('publishes the rotated pair even when post-refresh validation is temporarily unavailable', async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)
      if (url.endsWith('/oauth2/token')) {
        return jsonResponse({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 14_400,
          scope: ['chat:read']
        })
      }
      return jsonResponse({ message: 'temporarily unavailable' }, 503)
    }) as unknown as typeof fetch
    const onRefresh = vi.fn()
    const provider = new TwitchPublicAuthProvider({
      clientId: CLIENT_ID,
      accessToken: 'expired-access-token',
      refreshToken: 'old-refresh-token',
      userId: '1234',
      scopes: ['chat:read'],
      expiresIn: 1,
      obtainmentTimestamp: 0,
      lastValidatedAt: Date.now(),
      fetchImpl,
      onRefresh
    })

    await expect(provider.getAnyAccessToken()).rejects.toThrow('temporarily unavailable')
    expect(onRefresh).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token'
    }))
  })

  it('accepts Twurple alternative scope sets when one scope in each set is granted', async () => {
    const provider = new TwitchPublicAuthProvider({
      clientId: CLIENT_ID,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      userId: '1234',
      scopes: ['moderation:read'],
      expiresIn: 14_400,
      obtainmentTimestamp: Date.now(),
      lastValidatedAt: Date.now()
    })

    await expect(provider.getAccessTokenForUser(
      '1234',
      ['moderation:read', 'channel:manage:moderators']
    )).resolves.toMatchObject({ accessToken: 'access-token' })
  })
})

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
