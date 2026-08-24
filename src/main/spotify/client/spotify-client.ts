const API_BASE = 'https://api.spotify.com/v1'
const API_REQUEST_TIMEOUT_MS = 8_000

export class SpotifyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfterMs?: number
  ) {
    super(message)
    this.name = 'SpotifyApiError'
  }
}

export interface SpotifyUserProfile {
  id: string
  displayName: string
  imageUrl?: string
  product: 'premium' | 'free' | 'open'
}

export interface SpotifyDevice {
  id: string
  name: string
  type: string
  is_active: boolean
  is_restricted: boolean
}

export class SpotifyClient {
  private accessToken: string | null = null

  setAccessToken(token: string) {
    this.accessToken = token
  }

  private async fetch(path: string, options: RequestInit = {}): Promise<Response> {
    if (!this.accessToken) throw new Error('No Spotify access token')

    const controller = new AbortController()
    const upstreamSignal = options.signal
    let timedOut = false
    const abortFromUpstream = () => controller.abort(upstreamSignal?.reason)
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, API_REQUEST_TIMEOUT_MS)
    timeout.unref?.()

    if (upstreamSignal?.aborted) {
      abortFromUpstream()
    } else {
      upstreamSignal?.addEventListener('abort', abortFromUpstream, { once: true })
    }

    try {
      return await fetch(`${API_BASE}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          ...(options.headers ?? {})
        }
      })
    } catch (error) {
      if (timedOut) {
        throw new SpotifyApiError('Spotify API request timed out after 8 seconds.', 408)
      }
      throw error
    } finally {
      clearTimeout(timeout)
      upstreamSignal?.removeEventListener('abort', abortFromUpstream)
    }
  }

  private getRetryAfterMs(res: Response): number | undefined {
    const value = res.headers.get('retry-after')
    if (!value) return undefined

    const seconds = Number(value)
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.ceil(seconds * 1000)
    }

    const dateMs = Date.parse(value)
    if (Number.isFinite(dateMs)) {
      return Math.max(0, dateMs - Date.now())
    }

    return undefined
  }

  private fail(operation: string, res: Response, message?: string): never {
    throw new SpotifyApiError(
      message ?? `${operation} (${res.status})`,
      res.status,
      this.getRetryAfterMs(res)
    )
  }

  private spotifyNoActiveDeviceError(): SpotifyApiError {
    return new SpotifyApiError(
      'No active Spotify device found. Open Spotify on desktop or mobile, press Play once, then try the song request again.',
      404
    )
  }

  async getProfile(): Promise<SpotifyUserProfile> {
    const res = await this.fetch('/me')
    if (!res.ok) this.fail('Profile fetch failed', res)
    const data = (await res.json()) as {
      id: string
      display_name: string
      images?: Array<{ url?: string }>
      product?: SpotifyUserProfile['product']
    }
    return { id: data.id, displayName: data.display_name, imageUrl: data.images?.[0]?.url, product: data.product || 'free' }
  }

  async searchTrack(query: string): Promise<any | null> {
    const params = new URLSearchParams({ q: query, type: 'track', limit: '1' })
    const res = await this.fetch(`/search?${params.toString()}`)
    if (res.status === 429) this.fail('Search failed', res)
    if (!res.ok) return null
    const data = (await res.json()) as { tracks?: { items?: unknown[] } }
    return data.tracks?.items?.[0] || null
  }

  async enqueue(uri: string, deviceId?: string): Promise<void> {
    const firstAttempt = await this.enqueueOnce(uri, deviceId)
    if (firstAttempt.ok) return

    if (firstAttempt.status === 404 && !deviceId) {
      const activatedDeviceId = await this.activateAvailableDevice()
      if (activatedDeviceId) {
        const retry = await this.enqueueOnce(uri, activatedDeviceId)
        if (retry.ok) return
        if (retry.status === 404) throw this.spotifyNoActiveDeviceError()
        this.failEnqueue(retry)
      }

      throw this.spotifyNoActiveDeviceError()
    }

    this.failEnqueue(firstAttempt)
  }

  private async enqueueOnce(uri: string, deviceId?: string): Promise<Response> {
    const params = new URLSearchParams({ uri })
    if (deviceId) params.set('device_id', deviceId)
    return this.fetch(`/me/player/queue?${params.toString()}`, { method: 'POST' })
  }

  private failEnqueue(res: Response): never {
    if (res.status === 403) {
      this.fail('Enqueue failed', res, 'Spotify Premium is required for song requests.')
    }
    if (res.status === 401) {
      this.fail('Enqueue failed', res, 'Spotify authorization expired. Reconnect Spotify.')
    }
    this.fail('Enqueue failed', res)
  }

  async getAvailableDevices(): Promise<SpotifyDevice[]> {
    const res = await this.fetch('/me/player/devices')
    if (!res.ok) this.fail('Device fetch failed', res)
    const data = (await res.json()) as { devices?: SpotifyDevice[] }
    return Array.isArray(data?.devices) ? data.devices : []
  }

  async transferPlayback(deviceId: string, play = false): Promise<void> {
    const res = await this.fetch('/me/player', {
      method: 'PUT',
      body: JSON.stringify({
        device_ids: [deviceId],
        play
      })
    })
    if (!res.ok) this.fail('Playback transfer failed', res)
  }

  private async activateAvailableDevice(): Promise<string | null> {
    const devices = await this.getAvailableDevices()
    const controllable = devices.filter((device) => device.id && !device.is_restricted)
    const active = controllable.find((device) => device.is_active)
    if (active) return active.id

    const candidate = controllable[0]
    if (!candidate) return null

    try {
      await this.transferPlayback(candidate.id, false)
      await delay(250)
      return candidate.id
    } catch (error) {
      if (error instanceof SpotifyApiError && error.status === 403) throw error
      return null
    }
  }

  async skip(): Promise<void> {
    const res = await this.fetch('/me/player/next', { method: 'POST' })
    if (!res.ok) this.fail('Skip failed', res)
  }

  async getCurrentlyPlaying(): Promise<any | null> {
    const res = await this.fetch('/me/player/currently-playing')
    if (res.status === 204) return null
    if (!res.ok) this.fail('Fetch failed', res)
    return res.json()
  }

  async getPlaybackState(): Promise<any | null> {
    const res = await this.fetch('/me/player')
    if (res.status === 204) return null
    if (!res.ok) this.fail('Playback state fetch failed', res)
    return res.json()
  }

  async getUserQueue(): Promise<any | null> {
    const res = await this.fetch('/me/player/queue')
    if (res.status === 204) return null
    if (!res.ok) this.fail('Queue fetch failed', res)
    return res.json()
  }

  async pause(): Promise<void> {
    const res = await this.fetch('/me/player/pause', { method: 'PUT' })
    if (!res.ok && res.status !== 403) this.fail('Pause failed', res)
  }

  async play(uris?: string[]): Promise<void> {
    const res = await this.fetch('/me/player/play', { 
      method: 'PUT',
      body: uris ? JSON.stringify({ uris }) : undefined
    })
    if (!res.ok) this.fail('Play failed', res)
  }

  async saveTrack(trackId: string): Promise<void> {
    const res = await this.fetch(`/me/tracks?ids=${encodeURIComponent(trackId)}`, { method: 'PUT' })
    if (!res.ok) this.fail('Save failed', res)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
