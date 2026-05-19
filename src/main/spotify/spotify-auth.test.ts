import { afterEach, describe, expect, it, vi } from 'vitest'
import { refreshSpotifyTokens } from './spotify-auth'

vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() }
}))

describe('Spotify auth token refresh', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('retries transient Spotify refresh failures before succeeding', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('temporary outage', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600
      }), { status: 200 }))

    const promise = refreshSpotifyTokens('client-id', 'old-refresh-token')

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(750)

    await expect(promise).resolves.toEqual({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresIn: 3600
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry invalid refresh tokens', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('invalid_grant', { status: 400 }))

    await expect(refreshSpotifyTokens('client-id', 'bad-refresh-token'))
      .rejects.toThrow('Spotify token refresh failed (400): invalid_grant')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
