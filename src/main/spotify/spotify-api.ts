import type { SpotifyTrack } from '../../shared/spotify-types'

const API_BASE = 'https://api.spotify.com/v1'

async function apiFetch(path: string, accessToken: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {})
    }
  })
}

export interface SpotifyUserProfile {
  id: string
  displayName: string
  imageUrl?: string
  product: 'premium' | 'free' | 'open'
}

export async function getSpotifyUserProfile(accessToken: string): Promise<SpotifyUserProfile> {
  const response = await apiFetch('/me', accessToken)
  if (!response.ok) throw new Error(`Spotify profile fetch failed: ${response.status}`)

  const data = (await response.json()) as {
    id: string
    display_name: string
    images?: { url: string }[]
    product: string
  }

  return {
    id: data.id,
    displayName: data.display_name,
    imageUrl: data.images?.[0]?.url,
    product: (data.product as any) || 'free'
  }
}

export async function searchSpotifyTrack(
  accessToken: string,
  query: string
): Promise<SpotifyTrack | null> {
  const params = new URLSearchParams({ q: query, type: 'track', limit: '1' })
  const response = await apiFetch(`/search?${params.toString()}`, accessToken)
  if (!response.ok) return null

  const data = (await response.json()) as {
    tracks: {
      items: Array<{
        id: string
        name: string
        artists: Array<{ name: string }>
        album: { name: string; images?: { url: string }[] }
        duration_ms: number
        explicit: boolean
        uri: string
        external_urls: { spotify: string }
      }>
    }
  }

  const item = data.tracks?.items?.[0]
  if (!item) return null

  return {
    id: item.id,
    name: item.name,
    artists: item.artists.map((a) => a.name),
    albumName: item.album.name,
    durationMs: item.duration_ms,
    explicit: item.explicit,
    uri: item.uri,
    externalUrl: item.external_urls.spotify,
    albumArtUrl: item.album.images?.[0]?.url
  }
}

export async function addTrackToQueue(accessToken: string, uri: string): Promise<void> {
  const params = new URLSearchParams({ uri })
  const response = await apiFetch(`/me/player/queue?${params.toString()}`, accessToken, {
    method: 'POST'
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('No active Spotify device found. Open Spotify on any device first.')
    }
    if (response.status === 403) {
      throw new Error('Spotify Premium is required for queue control.')
    }
    throw new Error(`Failed to add track to queue (${response.status})`)
  }
}

export async function skipSpotifyTrack(accessToken: string): Promise<void> {
  const response = await apiFetch('/me/player/next', accessToken, { method: 'POST' })

  if (!response.ok) {
    if (response.status === 403) throw new Error('Spotify Premium is required.')
    if (response.status === 404) throw new Error('No active Spotify device found.')
    throw new Error(`Failed to skip track (${response.status})`)
  }
}

/**
 * Detailed playback state including potential error indicators.
 */
export interface SpotifyPlaybackState {
  isPlaying: boolean
  trackId: string | null
  trackName: string
  artists: string[]
  albumName: string
  albumArtUrl: string | null
  durationMs: number
  progressMs: number
  status: 'ok' | 'no-content' | 'no-device' | 'unauthorized' | 'forbidden' | 'error'
}

export async function getCurrentlyPlaying(accessToken: string): Promise<SpotifyPlaybackState> {
  try {
    const response = await apiFetch('/me/player/currently-playing', accessToken)
    
    if (response.status === 204) return { ...EMPTY_PLAYBACK_STATE, status: 'no-content' }
    if (response.status === 404) return { ...EMPTY_PLAYBACK_STATE, status: 'no-device' }
    if (response.status === 401) return { ...EMPTY_PLAYBACK_STATE, status: 'unauthorized' }
    if (response.status === 403) return { ...EMPTY_PLAYBACK_STATE, status: 'forbidden' }
    
    if (!response.ok) return { ...EMPTY_PLAYBACK_STATE, status: 'error' }

    const data = await response.json()
    const item = data?.item

    if (!item) return { ...EMPTY_PLAYBACK_STATE, status: 'no-content' }

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
  } catch (err) {
    console.error('[spotify-api] Currently playing fetch failed:', err)
    return { ...EMPTY_PLAYBACK_STATE, status: 'error' }
  }
}

const EMPTY_PLAYBACK_STATE: SpotifyPlaybackState = {
  isPlaying: false,
  trackId: null,
  trackName: '',
  artists: [],
  albumName: '',
  albumArtUrl: null,
  durationMs: 0,
  progressMs: 0,
  status: 'ok'
}

export async function playSpotifyTrack(accessToken: string, uri: string): Promise<void> {
  const response = await apiFetch('/me/player/play', accessToken, {
    method: 'PUT',
    body: JSON.stringify({ uris: [uri] })
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('No active Spotify device found. Open Spotify first.')
    }
    if (response.status === 403) {
      throw new Error('Spotify Premium is required for playback control.')
    }
    throw new Error(`Failed to start playback (${response.status})`)
  }
}

/**
 * Pauses the user's active Spotify device. No-ops on 404/403 with a friendly
 * error so the UI can surface it.
 */
export async function pauseSpotifyPlayback(accessToken: string): Promise<void> {
  const response = await apiFetch('/me/player/pause', accessToken, { method: 'PUT' })
  if (!response.ok) {
    if (response.status === 404) throw new Error('No active Spotify device.')
    if (response.status === 403) throw new Error('Spotify Premium is required.')
    // 403 also fires when nothing is currently playing — treat as benign.
    if (response.status === 403) return
    throw new Error(`Failed to pause playback (${response.status})`)
  }
}

/**
 * Resumes playback on the user's active Spotify device, leaving any current
 * queue/context alone (PUT /me/player/play with no body).
 */
export async function resumeSpotifyPlayback(accessToken: string): Promise<void> {
  const response = await apiFetch('/me/player/play', accessToken, { method: 'PUT' })
  if (!response.ok) {
    if (response.status === 404) throw new Error('No active Spotify device.')
    if (response.status === 403) throw new Error('Spotify Premium is required.')
    throw new Error(`Failed to resume playback (${response.status})`)
  }
}

/** Saves a track to the user's Liked Songs library. */
export async function saveSpotifyTrack(accessToken: string, trackId: string): Promise<void> {
  const response = await apiFetch(`/me/tracks?ids=${encodeURIComponent(trackId)}`, accessToken, {
    method: 'PUT'
  })
  if (!response.ok) {
    throw new Error(`Failed to save track (${response.status})`)
  }
}
