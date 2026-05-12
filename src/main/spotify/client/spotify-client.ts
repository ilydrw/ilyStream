const API_BASE = 'https://api.spotify.com/v1'

export interface SpotifyUserProfile {
  id: string
  displayName: string
  imageUrl?: string
  product: 'premium' | 'free' | 'open'
}

export class SpotifyClient {
  private accessToken: string | null = null

  setAccessToken(token: string) {
    this.accessToken = token
  }

  private async fetch(path: string, options: RequestInit = {}): Promise<Response> {
    if (!this.accessToken) throw new Error('No Spotify access token')
    return fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...(options.headers ?? {})
      }
    })
  }

  async getProfile(): Promise<SpotifyUserProfile> {
    const res = await this.fetch('/me')
    if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`)
    const data = await res.json()
    return { id: data.id, displayName: data.display_name, imageUrl: data.images?.[0]?.url, product: data.product || 'free' }
  }

  async searchTrack(query: string): Promise<any | null> {
    const params = new URLSearchParams({ q: query, type: 'track', limit: '1' })
    const res = await this.fetch(`/search?${params.toString()}`)
    if (!res.ok) return null
    const data = await res.json()
    return data.tracks?.items?.[0] || null
  }

  async enqueue(uri: string): Promise<void> {
    const res = await this.fetch(`/me/player/queue?uri=${encodeURIComponent(uri)}`, { method: 'POST' })
    if (!res.ok) throw new Error(`Enqueue failed (${res.status})`)
  }

  async skip(): Promise<void> {
    const res = await this.fetch('/me/player/next', { method: 'POST' })
    if (!res.ok) throw new Error(`Skip failed (${res.status})`)
  }

  async getCurrentlyPlaying(): Promise<any | null> {
    const res = await this.fetch('/me/player/currently-playing')
    if (res.status === 204) return null
    if (!res.ok) throw new Error(`Fetch failed (${res.status})`)
    return res.json()
  }

  async pause(): Promise<void> {
    const res = await this.fetch('/me/player/pause', { method: 'PUT' })
    if (!res.ok && res.status !== 403) throw new Error(`Pause failed (${res.status})`)
  }

  async play(uris?: string[]): Promise<void> {
    const res = await this.fetch('/me/player/play', { 
      method: 'PUT',
      body: uris ? JSON.stringify({ uris }) : undefined
    })
    if (!res.ok) throw new Error(`Play failed (${res.status})`)
  }

  async saveTrack(trackId: string): Promise<void> {
    const res = await this.fetch(`/me/tracks?ids=${encodeURIComponent(trackId)}`, { method: 'PUT' })
    if (!res.ok) throw new Error(`Save failed (${res.status})`)
  }
}
