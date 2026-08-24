import { afterEach, describe, expect, it, vi } from 'vitest'
import { SpotifyApiError, SpotifyClient } from './spotify-client'

describe('SpotifyClient', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches full playback state for the now-playing widget', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({
        is_playing: true,
        item: {
          id: 'track-1',
          name: 'Current Song',
          artists: [{ name: 'Artist One' }],
          album: { name: 'Album', images: [{ url: 'https://example.com/art.jpg' }] },
          duration_ms: 180000
        },
        progress_ms: 42000
      }), { status: 200 }))

    const client = new SpotifyClient()
    client.setAccessToken('access-token')

    const state = await client.getPlaybackState()

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.spotify.com/v1/me/player',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token'
        })
      })
    )
    expect(state?.item?.name).toBe('Current Song')
  })

  it('returns null when Spotify reports no active playback state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))

    const client = new SpotifyClient()
    client.setAccessToken('access-token')

    await expect(client.getPlaybackState()).resolves.toBeNull()
  })

  it('fetches the user playback queue for the widget up-next list', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({
        currently_playing: null,
        queue: [
          {
            id: 'track-next',
            name: 'Next Song',
            artists: [{ name: 'Next Artist' }],
            album: { name: 'Next Album', images: [] },
            duration_ms: 180000,
            explicit: false,
            uri: 'spotify:track:track-next',
            external_urls: { spotify: 'https://open.spotify.com/track/track-next' }
          }
        ]
      }), { status: 200 }))

    const client = new SpotifyClient()
    client.setAccessToken('access-token')

    const queue = await client.getUserQueue()

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.spotify.com/v1/me/player/queue',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token'
        })
      })
    )
    expect(queue?.queue?.[0]?.name).toBe('Next Song')
  })

  it('retries enqueue after activating an available Spotify device', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        devices: [
          {
            id: 'desktop-device',
            name: 'Desktop',
            type: 'Computer',
            is_active: false,
            is_restricted: false
          }
        ]
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    const client = new SpotifyClient()
    client.setAccessToken('access-token')

    await expect(client.enqueue('spotify:track:track-1')).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.spotify.com/v1/me/player/devices',
      expect.any(Object)
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://api.spotify.com/v1/me/player',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ device_ids: ['desktop-device'], play: false })
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://api.spotify.com/v1/me/player/queue?uri=spotify%3Atrack%3Atrack-1&device_id=desktop-device',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('surfaces a clear enqueue error when no Spotify devices are available', async () => {
    vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ devices: [] }), { status: 200 }))

    const client = new SpotifyClient()
    client.setAccessToken('access-token')

    await expect(client.enqueue('spotify:track:track-1')).rejects.toMatchObject({
      name: 'SpotifyApiError',
      status: 404,
      message: 'No active Spotify device found. Open Spotify on desktop or mobile, press Play once, then try the song request again.'
    } satisfies Partial<SpotifyApiError>)
  })

  it('surfaces a clear enqueue error when Premium is required', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 403 }))

    const client = new SpotifyClient()
    client.setAccessToken('access-token')

    await expect(client.enqueue('spotify:track:track-1')).rejects.toMatchObject({
      name: 'SpotifyApiError',
      status: 403,
      message: 'Spotify Premium is required for song requests.'
    } satisfies Partial<SpotifyApiError>)
  })

  it('surfaces Spotify rate-limit retry timing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, {
      status: 429,
      headers: { 'Retry-After': '17' }
    }))

    const client = new SpotifyClient()
    client.setAccessToken('access-token')

    await expect(client.getPlaybackState()).rejects.toMatchObject({
      name: 'SpotifyApiError',
      message: 'Playback state fetch failed (429)',
      status: 429,
      retryAfterMs: 17_000
    } satisfies Partial<SpotifyApiError>)
  })

  it('aborts API requests that do not settle within eight seconds', async () => {
    vi.useFakeTimers()
    try {
      let requestSignal: AbortSignal | null = null
      vi.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => {
        requestSignal = options?.signal ?? null
        return new Promise((_resolve, reject) => {
          requestSignal?.addEventListener('abort', () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            reject(error)
          }, { once: true })
        })
      })

      const client = new SpotifyClient()
      client.setAccessToken('access-token')

      const request = client.getPlaybackState()
      const expectation = expect(request).rejects.toMatchObject({
        name: 'SpotifyApiError',
        message: 'Spotify API request timed out after 8 seconds.',
        status: 408
      } satisfies Partial<SpotifyApiError>)

      await vi.advanceTimersByTimeAsync(8_000)
      await expectation
      expect((requestSignal as unknown as AbortSignal).aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
