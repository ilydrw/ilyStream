import { describe, expect, it, vi } from 'vitest'
import { SpotifyService } from './spotify-service'
import type { Database } from '../db/database'
import type { ChatEvent } from '../platforms/types'
import type { SpotifySongRequest } from '../../shared/spotify-types'

vi.mock('electron', () => ({
  app: { getPath: () => 'C:\\Dev\\ilyStream\\.tmp-vitest-userdata' },
  shell: { openExternal: vi.fn() }
}))

const DEFAULT_SETTINGS = {
  spotifyClientId: 'client-id',
  spotifySongRequestsEnabled: true,
  spotifyPlayEnabled: true,
  spotifySkipEnabled: true,
  spotifyAllowExplicit: true,
  spotifyMaxQueueLength: 0,
  spotifyMaxPerUser: 3
}

function createService(settings: Record<string, unknown> = {}, options: { connected?: boolean } = {}) {
  const db = {
    getAllSettings: vi.fn(() => ({ ...DEFAULT_SETTINGS, ...settings })),
    getSetting: vi.fn((key: string) => ({ ...DEFAULT_SETTINGS, ...settings })[key]),
    setSetting: vi.fn()
  } as unknown as Database

  const service = new SpotifyService(db, {} as any)
  const client = {
    searchTrack: vi.fn(),
    enqueue: vi.fn(),
    skip: vi.fn(),
    getProfile: vi.fn(),
    getPlaybackState: vi.fn(),
    getUserQueue: vi.fn()
  }

  ;(service as any).client = client
  ;(service as any).connected = options.connected ?? true
  ;(service as any).accessToken = settings.spotifyAccessToken || 'access-token'
  ;(service as any).refreshToken = settings.spotifyRefreshToken || 'refresh-token'
  ;(service as any).saveQueueCache = vi.fn()

  return { service, client }
}

function makeTrack(explicit = false, id = 'track-1', name = 'Current Song') {
  return {
    id,
    name,
    artists: [{ name: 'Artist One' }],
    album: { name: 'Album', images: [{ url: 'https://example.com/art.jpg' }] },
    duration_ms: 180000,
    explicit,
    type: 'track',
    uri: `spotify:track:${id}`,
    external_urls: { spotify: `https://open.spotify.com/track/${id}` }
  }
}

function makeRequest(id: string, trackId: string, requestedBy: string): SpotifySongRequest {
  return {
    id,
    track: {
      id: trackId,
      name: `${trackId} song`,
      artists: ['Artist One'],
      albumName: 'Album',
      durationMs: 180000,
      explicit: false,
      uri: `spotify:track:${trackId}`,
      externalUrl: `https://open.spotify.com/track/${trackId}`,
      albumArtUrl: 'https://example.com/art.jpg'
    },
    requestedBy,
    platform: 'twitch',
    requestedAt: Date.now(),
    status: 'queued',
    displayName: `${requestedBy} display`,
    profilePictureUrl: null
  }
}

function makeChat(message: string): ChatEvent {
  return {
    id: `chat-${message}`,
    platform: 'twitch',
    timestamp: new Date(),
    type: 'chat',
    user: {
      id: 'viewer-id',
      username: 'viewer',
      displayName: 'Viewer Name',
      profilePictureUrl: 'https://example.com/viewer.png',
      isModerator: false,
      isSubscriber: false,
      isVip: false,
      badges: []
    },
    message,
    emotes: [],
    raw: {}
  }
}

describe('SpotifyService chat commands', () => {
  it('fails fast with a clear error when no Spotify client id is configured', async () => {
    const { service } = createService({ spotifyClientId: '' })

    await expect(service.connect('')).rejects.toThrow('Spotify Client ID is required')
  })

  it('handles the documented !play command and keeps requester metadata', async () => {
    const { service, client } = createService()
    client.searchTrack.mockResolvedValue(makeTrack())

    const handled = await service.processEvent(makeChat('!play current song'))

    expect(handled).toBe(true)
    expect(client.searchTrack).toHaveBeenCalledWith('current song')
    expect(client.enqueue).toHaveBeenCalledWith('spotify:track:track-1')
    expect(service.getQueue()[0]).toMatchObject({
      requestedBy: 'viewer',
      platform: 'twitch',
      displayName: 'Viewer Name',
      profilePictureUrl: 'https://example.com/viewer.png',
      status: 'queued'
    })
  })

  it('restores a saved session before handling chat song requests', async () => {
    const { service, client } = createService(
      {
        spotifyAccessToken: 'expired-access-token',
        spotifyRefreshToken: 'saved-refresh-token'
      },
      { connected: false }
    )
    client.searchTrack.mockResolvedValue(makeTrack())
    ;(service as any).restoreSession = vi.fn(async () => {
      ;(service as any).connected = true
    })

    await expect(service.processEvent(makeChat('!play current song'))).resolves.toBe(true)

    expect((service as any).restoreSession).toHaveBeenCalled()
    expect(client.searchTrack).toHaveBeenCalledWith('current song')
  })

  it('supports legacy song request command prefixes', async () => {
    for (const command of ['!sr', '!songrequest', '.play', '/play']) {
      const { service, client } = createService()
      client.searchTrack.mockResolvedValue(makeTrack())

      await expect(service.processEvent(makeChat(`${command} current song`))).resolves.toBe(true)
      expect(client.searchTrack).toHaveBeenCalledWith('current song')
    }
  })

  it('returns false for normal chat so TTS can still process it', async () => {
    const { service, client } = createService()

    await expect(service.processEvent(makeChat('hello chat'))).resolves.toBe(false)
    expect(client.searchTrack).not.toHaveBeenCalled()
  })

  it('consumes disabled Spotify commands without enqueueing tracks', async () => {
    const { service, client } = createService({ spotifySongRequestsEnabled: false })

    await expect(service.processEvent(makeChat('!play current song'))).resolves.toBe(true)
    expect(client.searchTrack).not.toHaveBeenCalled()
    expect(service.getQueue()).toEqual([])
  })

  it('blocks explicit tracks when explicit requests are disabled', async () => {
    const { service, client } = createService({ spotifyAllowExplicit: false })
    client.searchTrack.mockResolvedValue(makeTrack(true))

    await expect(service.processEvent(makeChat('!play explicit song'))).resolves.toBe(true)
    expect(client.enqueue).not.toHaveBeenCalled()
    expect(service.getQueue()).toEqual([])
  })

  it('routes skip commands through the Spotify client when enabled', async () => {
    const { service, client } = createService()

    await expect(service.processEvent(makeChat('!skip'))).resolves.toBe(true)
    expect(client.skip).toHaveBeenCalledTimes(1)
  })

  it('marks request and everything earlier as played once Spotify is playing that track', () => {
    const { service } = createService()
    const queue = (service as any).requestQueue as Array<{ id: string; track: { id: string }; status: string }>
    queue.push(
      { id: 'r1', track: { id: 'track-a' }, status: 'queued' } as any,
      { id: 'r2', track: { id: 'track-b' }, status: 'queued' } as any,
      { id: 'r3', track: { id: 'track-c' }, status: 'queued' } as any
    )

    ;(service as any).markRequestsPlayedThrough('track-b')

    expect(queue[0].status).toBe('played')
    expect(queue[1].status).toBe('played')
    expect(queue[2].status).toBe('queued')
  })

  it('leaves the queue alone when nothing is playing or the current track was never requested', () => {
    const { service } = createService()
    const queue = (service as any).requestQueue as Array<{ id: string; track: { id: string }; status: string }>
    queue.push({ id: 'r1', track: { id: 'track-a' }, status: 'queued' } as any)

    ;(service as any).markRequestsPlayedThrough(null)
    expect(queue[0].status).toBe('queued')

    ;(service as any).markRequestsPlayedThrough('track-never-requested')
    expect(queue[0].status).toBe('queued')
  })

  it('orders the widget up-next list from Spotify’s live queue', async () => {
    const { service, client } = createService()
    const queue = (service as any).requestQueue as SpotifySongRequest[]
    queue.push(
      makeRequest('r1', 'track-a', 'alice'),
      makeRequest('r2', 'track-b', 'bob')
    )
    client.getPlaybackState.mockResolvedValue({
      is_playing: true,
      item: makeTrack(false, 'track-current', 'Current Song'),
      progress_ms: 1000
    })
    client.getUserQueue.mockResolvedValue({
      currently_playing: null,
      queue: [
        makeTrack(false, 'track-b', 'Bob Request'),
        makeTrack(false, 'track-a', 'Alice Request'),
        makeTrack(false, 'track-spotify', 'Spotify Queue Song')
      ]
    })

    await (service as any).poll()

    const overlayQueue = service.getNowPlaying().queue
    expect(overlayQueue.map((request) => request.track.id)).toEqual(['track-b', 'track-a', 'track-spotify'])
    expect(overlayQueue[0]).toMatchObject({ id: 'r2', requestedBy: 'bob', status: 'queued' })
    expect(overlayQueue[2]).toMatchObject({ requestedBy: '', platform: 'spotify', status: 'injected' })
  })

  it('keeps the current requested track out of up next and shows its requester', async () => {
    const { service, client } = createService()
    const queue = (service as any).requestQueue as SpotifySongRequest[]
    queue.push(
      makeRequest('r1', 'track-a', 'alice'),
      makeRequest('r2', 'track-b', 'bob')
    )
    client.getPlaybackState.mockResolvedValue({
      is_playing: true,
      item: makeTrack(false, 'track-a', 'Alice Request'),
      progress_ms: 1000
    })
    client.getUserQueue.mockResolvedValue({
      currently_playing: null,
      queue: [makeTrack(false, 'track-b', 'Bob Request')]
    })

    await (service as any).poll()

    const nowPlaying = service.getNowPlaying()
    expect(nowPlaying.requestedBy).toBe('alice display')
    expect(nowPlaying.requesterPlatform).toBe('twitch')
    expect(nowPlaying.queue.map((request) => request.track.id)).toEqual(['track-b'])
    expect(queue[0].status).toBe('played')
    expect(queue[1].status).toBe('queued')
  })
})
