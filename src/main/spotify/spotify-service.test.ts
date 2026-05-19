import { describe, expect, it, vi } from 'vitest'
import { SpotifyService } from './spotify-service'
import type { Database } from '../db/database'
import type { ChatEvent } from '../platforms/types'

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

function createService(settings: Record<string, unknown> = {}) {
  const db = {
    getAllSettings: vi.fn(() => ({ ...DEFAULT_SETTINGS, ...settings })),
    getSetting: vi.fn((key: string) => ({ ...DEFAULT_SETTINGS, ...settings })[key]),
    setSetting: vi.fn()
  } as unknown as Database

  const service = new SpotifyService(db, {} as any)
  const client = {
    searchTrack: vi.fn(),
    enqueue: vi.fn(),
    skip: vi.fn()
  }

  ;(service as any).client = client
  ;(service as any).saveQueueCache = vi.fn()

  return { service, client }
}

function makeTrack(explicit = false) {
  return {
    id: 'track-1',
    name: 'Current Song',
    artists: [{ name: 'Artist One' }],
    album: { name: 'Album', images: [{ url: 'https://example.com/art.jpg' }] },
    duration_ms: 180000,
    explicit,
    uri: 'spotify:track:track-1',
    external_urls: { spotify: 'https://open.spotify.com/track/track-1' }
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
})
