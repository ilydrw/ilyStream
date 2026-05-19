import { describe, expect, it } from 'vitest'
import { SpotifyMapper } from './spotify-mapper'

describe('SpotifyMapper', () => {
  it('maps full playback state into a now-playing payload', () => {
    const mapper = new SpotifyMapper()

    const playback = mapper.mapPlaybackState({
      is_playing: true,
      item: {
        id: 'track-1',
        name: 'Current Song',
        artists: [{ name: 'Artist One' }, { name: 'Artist Two' }],
        album: { name: 'Album', images: [{ url: 'https://example.com/art.jpg' }] },
        duration_ms: 180000
      },
      progress_ms: 42000
    })

    expect(mapper.mapNowPlaying(playback)).toMatchObject({
      isPlaying: true,
      trackId: 'track-1',
      trackName: 'Current Song',
      artists: ['Artist One', 'Artist Two'],
      albumName: 'Album',
      albumArtUrl: 'https://example.com/art.jpg',
      durationMs: 180000,
      progressMs: 42000,
      status: 'ok'
    })
  })

  it('keeps local Spotify items visible even when Spotify does not provide an id', () => {
    const mapper = new SpotifyMapper()

    const playback = mapper.mapPlaybackState({
      is_playing: true,
      item: {
        id: null,
        name: 'Local Song',
        artists: [{ name: 'Local Artist' }],
        album: { name: 'Local Album', images: [] },
        duration_ms: 123000
      },
      progress_ms: 1000
    })

    expect(playback).toMatchObject({
      isPlaying: true,
      trackId: null,
      trackName: 'Local Song',
      artists: ['Local Artist'],
      albumName: 'Local Album',
      durationMs: 123000,
      progressMs: 1000,
      status: 'ok'
    })
  })
})
