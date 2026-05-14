export interface SpotifyTrack {
  id: string
  name: string
  artists: string[]
  albumName: string
  durationMs: number
  explicit: boolean
  uri: string
  externalUrl: string
  albumArtUrl?: string
}

export interface SpotifySongRequest {
  id: string
  track: SpotifyTrack
  requestedBy: string
  platform: string
  requestedAt: number
  status: 'queued' | 'played' | 'skipped'
  displayName?: string
  profilePictureUrl?: string | null
}

export interface SpotifyStatus {
  connected: boolean
  displayName?: string
  imageUrl?: string
  error?: string | null
  isActiveDevice?: boolean
}

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
