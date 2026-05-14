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
      isPlaying: state.isPlaying,
      trackId: state.trackId,
      trackName: state.trackName,
      artists: state.artists,
      albumName: state.albumName,
      albumArtUrl: state.albumArtUrl,
      durationMs: state.durationMs,
      progressMs: state.progressMs,
      requestedBy: null,
      requesterPlatform: null,
      queue: [],
      status: state.status,
      isRefreshing: false
    }
  }
}
