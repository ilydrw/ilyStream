import type { SpotifyTrack, SpotifyPlaybackState } from '../../../shared/spotify-types'
import type { NowPlayingPayload } from '../../../shared/widgets'

export class SpotifyMapper {
  mapTrack(item: any): SpotifyTrack {
    return {
      id: item.id,
      name: item.name,
      artists: item.artists.map((a: any) => a.name),
      albumName: item.album.name,
      durationMs: item.duration_ms,
      explicit: item.explicit,
      uri: item.uri,
      externalUrl: item.external_urls.spotify,
      albumArtUrl: item.album.images?.[0]?.url
    }
  }

  mapPlaybackState(data: any): SpotifyPlaybackState {
    if (!data || !data.item) {
      return {
        isPlaying: false,
        trackId: null,
        trackName: '',
        artists: [],
        albumName: '',
        albumArtUrl: null,
        durationMs: 0,
        progressMs: 0,
        status: data ? 'ok' : 'no-content'
      }
    }

    const item = data.item
    return {
      isPlaying: Boolean(data.is_playing),
      trackId: item.id ?? null,
      trackName: item.name ?? '',
      artists: Array.isArray(item.artists) ? item.artists.map((a: any) => a.name).filter(Boolean) : [],
      albumName: item.album?.name ?? '',
      albumArtUrl: item.album?.images?.[0]?.url ?? null,
      durationMs: typeof item.duration_ms === 'number' ? item.duration_ms : 0,
      progressMs: typeof data.progress_ms === 'number' ? data.progress_ms : 0,
      status: 'ok'
    }
  }

  mapNowPlaying(state: SpotifyPlaybackState): NowPlayingPayload {
    return {
      track: state.trackId ? {
        id: state.trackId,
        name: state.trackName,
        artist: state.artists.join(', '),
        album: state.albumName,
        albumArt: state.albumArtUrl || '',
        durationMs: state.durationMs,
        uri: '' // URI not needed for widget
      } : null,
      isPlaying: state.isPlaying,
      progressMs: state.progressMs,
      status: state.status === 'no-device' ? 'no-device' : (state.trackId ? 'playing' : 'idle'),
      source: 'spotify'
    }
  }
}
