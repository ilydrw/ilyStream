import { afterEach, describe, expect, it, vi } from 'vitest'
import { SpotifyClient } from './spotify-client'

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
})
