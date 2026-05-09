import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { Database } from '../db/database'
import { resolveAppSettings } from '../../shared/app-settings'
import type { AnyStreamEvent, ChatEvent } from '../platforms/types'
import type { SpotifySongRequest, SpotifyStatus } from '../../shared/spotify-types'
import {
  DEFAULT_SPOTIFY_CLIENT_ID,
  initiateSpotifyAuth,
  refreshSpotifyTokens
} from './spotify-auth'
import {
  addTrackToQueue,
  getSpotifyUserProfile,
  getCurrentlyPlaying,
  pauseSpotifyPlayback,
  resumeSpotifyPlayback,
  saveSpotifyTrack,
  searchSpotifyTrack,
  skipSpotifyTrack,
  playSpotifyTrack,
  type SpotifyUserProfile
} from './spotify-api'
import { PlatformManager } from '../platforms/platform-manager'
import type { NowPlayingPayload } from '../../shared/widgets'
import { EMPTY_NOW_PLAYING } from '../../shared/widgets'

export class SpotifyService extends EventEmitter {
  private db: Database
  private platformManager: PlatformManager
  private connected = false
  private isRefreshing = false
  private lastError: string | null = null
  private profile: SpotifyUserProfile | null = null
  private requestQueue: SpotifySongRequest[] = []
  private refreshTimer: NodeJS.Timeout | null = null
  private skipVotes = new Set<string>()
  private lastTrackUri: string | null = null
  private pollTimer: NodeJS.Timeout | null = null
  private currentNowPlaying: NowPlayingPayload = { ...EMPTY_NOW_PLAYING }
  private isInjecting = false
  private lastPollLog = ''

  constructor(db: Database, platformManager: PlatformManager) {
    super()
    this.db = db
    this.platformManager = platformManager
    this.loadQueueCache()
  }

  private getCachePath(): string {
    return join(app.getPath('userData'), 'spotify-queue.json')
  }

  private saveQueueCache(): void {
    try {
      const data = JSON.stringify(this.requestQueue)
      writeFileSync(this.getCachePath(), data, 'utf-8')
    } catch (e) {
      console.error('[spotify] Failed to save queue cache', e)
    }
  }

  private loadQueueCache(): void {
    try {
      if (existsSync(this.getCachePath())) {
        const data = readFileSync(this.getCachePath(), 'utf-8')
        const rawQueue: SpotifySongRequest[] = JSON.parse(data)
        
        // Filter out requests older than 24 hours to prevent "phantom" requests from old sessions
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
        this.requestQueue = rawQueue.filter(r => r.requestedAt > oneDayAgo)
        
        if (this.requestQueue.length !== rawQueue.length) {
          console.log(`\x1b[32m[Spotify]\x1b[0m Pruned ${rawQueue.length - this.requestQueue.length} expired requests from cache`)
          this.saveQueueCache()
        }
      }
    } catch (e) {
      console.error('[spotify] Failed to load queue cache', e)
      this.requestQueue = []
    }
  }

  getStatus(): SpotifyStatus {
    return {
      connected: this.connected,
      displayName: this.profile?.displayName,
      imageUrl: this.profile?.imageUrl,
      error: this.lastError,
      isActiveDevice: this.currentNowPlaying.status !== 'no-device'
    }
  }

  getQueue(): SpotifySongRequest[] {
    return [...this.requestQueue]
  }

  /** Latest known playback state from the polling loop. */
  getNowPlaying(): NowPlayingPayload {
    return { ...this.currentNowPlaying }
  }

  async connect(providedClientId?: string): Promise<SpotifyStatus> {
    const clientId = providedClientId || DEFAULT_SPOTIFY_CLIENT_ID

    if (!clientId) {
      throw new Error('Spotify Client ID is required. Please provide one in settings.')
    }

    const tokens = await initiateSpotifyAuth(clientId)
    const expiresAt = Date.now() + tokens.expiresIn * 1000

    this.db.setSetting('spotifyClientId', clientId)
    this.db.setSetting('spotifyAccessToken', tokens.accessToken)
    this.db.setSetting('spotifyRefreshToken', tokens.refreshToken)
    this.db.setSetting('spotifyTokenExpiresAt', expiresAt)

    this.profile = await getSpotifyUserProfile(tokens.accessToken)
    this.db.setSetting('spotifyUserId', this.profile.id)
    this.db.setSetting('spotifyDisplayName', this.profile.displayName)
    this.db.setSetting('spotifyProduct', this.profile.product)
    this.connected = true
    this.lastError = null
    this.isRefreshing = false

    this.scheduleTokenRefresh(tokens.expiresIn)
    this.startPolling()
    this.emitStatus()

    return this.getStatus()
  }

  async disconnect(): Promise<void> {
    this.connected = false
    this.profile = null
    this.requestQueue = []
    this.lastTrackUri = null
    this.currentNowPlaying = { ...EMPTY_NOW_PLAYING }

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }

    this.db.setSetting('spotifyAccessToken', '')
    this.db.setSetting('spotifyRefreshToken', '')
    this.db.setSetting('spotifyTokenExpiresAt', 0)

    this.emitStatus()
    this.emitQueueUpdate()
    this.emitNowPlaying()
  }

  async restoreSession(): Promise<void> {
    const settings = resolveAppSettings(this.db.getAllSettings())
    const { spotifyClientId, spotifyAccessToken, spotifyRefreshToken, spotifyTokenExpiresAt } =
      settings

    if (!spotifyAccessToken || !spotifyRefreshToken || !spotifyClientId) return

    try {
      let accessToken = spotifyAccessToken

      // Refresh if expired or within 5-minute buffer
      if (Date.now() > spotifyTokenExpiresAt - 5 * 60 * 1000) {
        const tokens = await refreshSpotifyTokens(spotifyClientId, spotifyRefreshToken)
        accessToken = tokens.accessToken
        const nextExpiresAt = Date.now() + tokens.expiresIn * 1000
        this.db.setSetting('spotifyAccessToken', tokens.accessToken)
        this.db.setSetting('spotifyRefreshToken', tokens.refreshToken)
        this.db.setSetting('spotifyTokenExpiresAt', nextExpiresAt)
        this.scheduleTokenRefresh(tokens.expiresIn)
      } else {
        const remainingSecs = Math.max(0, Math.floor((spotifyTokenExpiresAt - Date.now()) / 1000))
        this.scheduleTokenRefresh(remainingSecs)
      }

      this.profile = await getSpotifyUserProfile(accessToken)
      this.db.setSetting('spotifyUserId', this.profile.id)
      this.db.setSetting('spotifyDisplayName', this.profile.displayName)
      this.db.setSetting('spotifyProduct', this.profile.product)
      this.connected = true
      this.startPolling()
      this.emitStatus()
      console.log(`\x1b[32m[Spotify]\x1b[0m Session restored for \x1b[36m${this.profile.displayName}\x1b[0m`)
    } catch (err) {
      console.error('[spotify] Failed to restore session:', err)
    }
  }

  processEvent(event: AnyStreamEvent): boolean {
    if (event.type !== 'chat') return false

    const settings = resolveAppSettings(this.db.getAllSettings())
    if (!settings.spotifySongRequestsEnabled) return false

    const chatEvent = event as ChatEvent
    // Trim and normalize common mobile punctuation quirks
    const message = (chatEvent.message ?? '').trim().replace(/^[！]/, '!')
    
    if (message.length === 0) return false

    const username = chatEvent.user.username
    const platform = chatEvent.platform

    // Broaden prefix support: Allow '!', '.', and '/' for Spotify specifically
    const settingsPrefixes = settings.ttsCommandPrefixes || []
    const prefixes = Array.from(new Set(['!', '.', '/', ...settingsPrefixes])).sort(
      (a, b) => b.length - a.length
    )

    const matchedPrefix = prefixes.find((p) => message.startsWith(p))
    if (!matchedPrefix) return false

    const afterPrefix = message.slice(matchedPrefix.length).trim()
    const parts = afterPrefix.split(/\s+/)
    const command = parts[0].toLowerCase()
    const remaining = afterPrefix.slice(command.length).trim()
    const isSpotifyCommand =
      (settings.spotifyPlayEnabled && command === 'play' && remaining.length > 0) ||
      (settings.spotifySkipEnabled && (command === 'skip' || command === 'voteskip' || command === 'skipvote' || command === 'vs')) ||
      command === 'remove' ||
      command === 'unplay'

    if (isSpotifyCommand) {
      console.log(`\x1b[32m[Spotify]\x1b[0m ${platform} command from \x1b[36m${username}\x1b[0m: "${message}" (Connected: ${this.connected})`)
    }

    if (settings.spotifyPlayEnabled && command === 'play') {
      if (remaining.length > 0) {
        if (!this.connected) {
          this.platformManager.sendChatMessageToPlatforms(
            [platform as any],
            '❌ Spotify is not connected. Please log in through the IlyStream Settings.'
          ).catch(() => {})
          return true
        }
        void this.handlePlayRequest(remaining, chatEvent.user, platform, settings)
        return true
      }
    } else if (settings.spotifySkipEnabled && (command === 'skip' || command === 'voteskip' || command === 'skipvote' || command === 'vs')) {
      if (!this.connected) {
        this.platformManager.sendChatMessageToPlatforms(
          [platform as any],
          '❌ Spotify is not connected. Please log in through the IlyStream Settings.'
        ).catch(() => {})
        return true
      }

      if (command === 'skip') {
        void this.handleSkipRequest(platform)
      } else {
        const displayName = chatEvent.user.displayName || username
        void this.handleVoteSkip(username, displayName, platform)
      }
      return true
    } else if (command === 'remove' || command === 'unplay') {
      const displayName = chatEvent.user.displayName || username
      void this.handleRemoveRequest(username, displayName, platform)
      return true
    }

    return false
  }

  private async handlePlayRequest(
    query: string,
    user: { username: string; displayName: string; profilePictureUrl?: string | null },
    platform: string,
    settings: ReturnType<typeof resolveAppSettings>
  ): Promise<void> {
    const { username, displayName, profilePictureUrl } = user
    const { spotifyMaxPerUser, spotifyMaxQueueLength, spotifyAllowExplicit, spotifyAccessToken } =
      settings

    const userCount = this.requestQueue.filter(
      (r) =>
        r.requestedBy === username &&
        r.platform === platform &&
        (r.status === 'queued' || r.status === 'injected')
    ).length

    if (spotifyMaxPerUser > 0 && userCount >= spotifyMaxPerUser) {
      console.log(`[spotify] ${username} hit per-user limit (${userCount}/${spotifyMaxPerUser})`)
      this.platformManager
        .sendChatMessageToPlatforms(
          [platform as any],
          `❌ @${displayName}, you already have ${userCount} song(s) in the queue! (Max: ${spotifyMaxPerUser})`
        )
        .catch(() => {})
      return
    }

    if (spotifyMaxQueueLength > 0 && this.requestQueue.length >= spotifyMaxQueueLength) {
      console.log(`[spotify] Queue full (${this.requestQueue.length}/${spotifyMaxQueueLength})`)
      return
    }

    try {
      let searchQuery = query
      if (query.includes(' - ')) {
        const [title, artist] = query.split(' - ').map(s => s.trim())
        if (title && artist) {
          searchQuery = `track:"${title}" artist:"${artist}"`
        }
      } else if (query.includes('-')) {
        const [title, artist] = query.split('-').map(s => s.trim())
        if (title && artist) {
          searchQuery = `track:"${title}" artist:"${artist}"`
        }
      }

      const track = await searchSpotifyTrack(spotifyAccessToken, searchQuery)
      if (!track) {
        this.platformManager.sendChatMessageToPlatforms(
          [platform as any],
          `❌ No results found on Spotify for: "${query}"`
        ).catch(() => {})
        return
      }

      if (!spotifyAllowExplicit && track.explicit) {
        this.platformManager.sendChatMessageToPlatforms(
          [platform as any],
          `❌ The song "${track.name}" is marked as Explicit and is blocked.`
        ).catch(() => {})
        return
      }

      if (this.currentNowPlaying.trackId === track.id) {
        this.platformManager.sendChatMessageToPlatforms(
          [platform as any],
          `⚠️ "${track.name}" is already currently playing!`
        ).catch(() => {})
        return
      }

      if (this.requestQueue.some(r => r.track.id === track.id && r.status === 'queued')) {
        this.platformManager.sendChatMessageToPlatforms(
          [platform as any],
          `⚠️ "${track.name}" is already in the queue!`
        ).catch(() => {})
        return
      }

      // In Managed Mode, we do NOT call addTrackToQueue here.
      // We wait until the current song is finishing to inject it.

      const request: SpotifySongRequest = {
        id: randomUUID(),
        track,
        requestedBy: username,
        displayName,
        profilePictureUrl,
        platform,
        requestedAt: Date.now(),
        status: 'queued'
      }

      // MEMORY FIX: Keep the request queue manageable (Limit to 200 items)
      if (this.requestQueue.length > 200) {
        this.requestQueue = this.requestQueue.slice(-100)
      }

      this.requestQueue.push(request)
      this.emit('song-requested', request)
      this.emitQueueUpdate()

      const artistList = track.artists.join(', ')
      this.platformManager.sendChatMessageToPlatforms(
        [platform as any], 
        `✅ Added "${track.name} - ${artistList}" to the Spotify queue! (Requested by ${displayName} (@${username}))`
      ).catch(() => {})

      // If nothing is playing, trigger a poll immediately to start the song
      void this.pollCurrentTrack()
    } catch (err) {
      console.error('[spotify] Play request failed:', err)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      this.platformManager.sendChatMessageToPlatforms(
        [platform as any],
        `❌ Spotify Error: ${errorMessage}`
      ).catch(() => {})
    }
  }

  private async handleSkipRequest(platform?: string): Promise<void> {
    try {
      const settings = resolveAppSettings(this.db.getAllSettings())
      
      // Reset votes on every skip
      this.skipVotes.clear()

      // Managed Mode: Check if we have a next song to play immediately
      const nextRequest = this.requestQueue.find(r => r.status === 'queued')
      if (nextRequest) {
        console.log(`[spotify-managed] Fast-skipping to next request: ${nextRequest.track.name}`)
        await playSpotifyTrack(settings.spotifyAccessToken, nextRequest.track.uri)
        nextRequest.status = 'played'
        this.emitQueueUpdate()
      } else {
        // Just skip if our queue is empty
        await skipSpotifyTrack(settings.spotifyAccessToken)
      }

      // Sync the state
      void this.pollCurrentTrack()
    } catch (err) {
      console.error('[spotify] Skip failed:', err)
    }
  }

  private async handleRemoveRequest(username: string, displayName: string, platform: string): Promise<void> {
    // Find the last item queued by this user
    const lastRequestIndex = [...this.requestQueue]
      .reverse()
      .findIndex((r) => r.requestedBy === username && r.platform === platform && r.status === 'queued')

    if (lastRequestIndex === -1) {
      this.platformManager.sendChatMessageToPlatforms(
        [platform as any],
        `❌ @${displayName}, you don't have any songs in the queue!`
      ).catch(() => {})
      return
    }

    // Convert reverse index to forward index
    const forwardIndex = this.requestQueue.length - 1 - lastRequestIndex
    const track = this.requestQueue[forwardIndex].track

    // Remove from local queue
    this.requestQueue.splice(forwardIndex, 1)
    
    this.emitQueueUpdate()

    this.platformManager.sendChatMessageToPlatforms(
      [platform as any],
      `🗑️ Removed "${track.name}" from your requests.`
    ).catch(() => {})
  }

  private async handleVoteSkip(username: string, displayName: string, platform: string): Promise<void> {
    const userKey = `${platform}:${username}`
    
    if (this.skipVotes.has(userKey)) {
      // User already voted
      return
    }

    this.skipVotes.add(userKey)
    
    const settings = resolveAppSettings(this.db.getAllSettings())
    const votesRequired = settings.spotifyVotesRequired || 3
    const currentVotes = this.skipVotes.size

    if (currentVotes >= votesRequired) {
      this.platformManager.sendChatMessageToPlatforms(
        [platform as any],
        `🗳️ Vote goal reached (${currentVotes}/${votesRequired})! Skipping...`
      ).catch(() => {})
      void this.handleSkipRequest()
    } else {
      this.platformManager.sendChatMessageToPlatforms(
        [platform as any],
        `🗳️ Skip vote registered by ${displayName} (@${username})! (${currentVotes}/${votesRequired} votes needed)`
      ).catch(() => {})
    }
  }

  private startPolling(): void {
    if (this.pollTimer) clearTimeout(this.pollTimer)
    const runPoll = async () => {
      let nextInterval = 5000
      if (!this.isRefreshing) {
        nextInterval = await this.pollCurrentTrack()
      }
      this.pollTimer = setTimeout(() => void runPoll(), nextInterval)
    }
    void runPoll()
  }

  private async pollCurrentTrack(): Promise<number> {
    // If not connected, but we have a refresh token, we should still try to refresh/poll
    // to allow auto-recovery from transient failures.
    if (this.isRefreshing) return 5000

    try {
      const settings = resolveAppSettings(this.db.getAllSettings())
      
      if (!this.connected) {
        if (settings.spotifyRefreshToken) {
          console.log('\x1b[32m[Spotify]\x1b[0m Attempting auto-recovery refresh...')
          await this.doTokenRefresh()
          if (!this.connected) return 10000 // Still failed
        } else {
          return 10000 // Truly disconnected
        }
      }

      const state = await getCurrentlyPlaying(settings.spotifyAccessToken)
      
      const logMsg = `Polled track: ${state.trackName || 'None'} (Status: ${state.status}, Playing: ${state.isPlaying})`
      if (logMsg !== this.lastPollLog) {
        console.log(`\x1b[32m[Spotify]\x1b[0m \x1b[36m${logMsg}\x1b[0m`)
        this.lastPollLog = logMsg
      }

      // Handle common API states
      if (state.status === 'unauthorized') {
        console.warn('\x1b[32m[Spotify]\x1b[0m Unauthorized! Triggering immediate token refresh.')
        this.currentNowPlaying.status = 'unauthorized'
        this.emitNowPlaying()
        void this.doTokenRefresh()
        return 5000
      }

      if (state.status === 'no-device') {
        if (this.currentNowPlaying.status !== 'no-device') {
          console.log('\x1b[32m[Spotify]\x1b[0m No active device detected.')
          this.currentNowPlaying = { ...EMPTY_NOW_PLAYING, status: 'no-device' }
          this.emitNowPlaying()
        }
        return 10000
      }

      if (state.status === 'error' || state.status === 'forbidden') {
        this.lastError = state.status === 'forbidden' ? 'Spotify Premium Required' : 'API Error'
        this.currentNowPlaying.status = state.status
        this.emitStatus()
        this.emitNowPlaying()
        return 10000
      }

      this.lastError = null

      if (state.status === 'no-content') {
        if (this.currentNowPlaying.trackId !== null || this.currentNowPlaying.status !== 'no-content') {
          this.currentNowPlaying = { ...EMPTY_NOW_PLAYING, status: 'no-content' }
          this.emitNowPlaying()
        }
        // Try to start managed queue if something is pending
        await this.handleManagedQueue(null, settings)
        return 10000
      }

      // We have a track!
      const currentUri = state.trackId ? `spotify:track:${state.trackId}` : null
      if (currentUri && currentUri !== this.lastTrackUri) {
        this.lastTrackUri = currentUri
        this.skipVotes.clear()
        
        // Mark as played if it was a request (either queued or recently injected)
        // We match by URI first (most reliable), then by trackId
        const match = this.requestQueue.find(
          r => (r.track.uri === state.trackUri || r.track.id === state.trackId) && 
               (r.status === 'queued' || r.status === 'injected')
        )
        if (match) {
          match.status = 'played'
          this.emit('song-played', match)
          this.emitQueueUpdate()
        }
      }

      // Fetch native queue for display if needed
      let displayQueue: SpotifySongRequest[] = []
      try {
        const queueRes = await fetch('https://api.spotify.com/v1/me/player/queue', {
          headers: { Authorization: `Bearer ${settings.spotifyAccessToken}` }
        })
        if (queueRes.ok) {
          const queueData = await queueRes.json()
          const nativeQueue = (queueData.queue || []).map((track: any) => {
            const matchingRequest = this.requestQueue.find(r => r.track.uri === track.uri && r.status === 'queued')
            return {
              id: track.id || randomUUID(),
              track: {
                id: track.id,
                name: track.name,
                artists: track.artists?.map((a: any) => a.name) || [],
                albumName: track.album?.name || '',
                durationMs: track.duration_ms,
                explicit: track.explicit,
                uri: track.uri,
                externalUrl: track.external_urls?.spotify || '',
                albumArtUrl: track.album?.images?.[0]?.url || ''
              },
              requestedBy: matchingRequest?.requestedBy || null,
              platform: matchingRequest?.platform || null,
              requestedAt: matchingRequest?.requestedAt || Date.now(),
              status: 'queued' as const
            }
          })

          if (settings.spotifyMode === 'managed') {
            const pendingRequests = this.requestQueue
              .filter(r => r.status === 'queued' || (r as any).status === 'injected')
              .map(r => ({
                id: randomUUID(),
                track: r.track,
                requestedBy: r.requestedBy,
                platform: r.platform,
                requestedAt: r.requestedAt,
                status: r.status // Will show 'injected' if already sent to Spotify
              }))
            displayQueue = [...pendingRequests, ...nativeQueue]
          } else {
            displayQueue = nativeQueue
          }
        }
      } catch (err) {
        console.error('[spotify] Failed to fetch native queue:', err)
      }

      const matchingRequest = this.requestQueue.find((r) => r.track.id === state.trackId)
      const next: NowPlayingPayload = {
        ...state,
        requestedBy: matchingRequest?.requestedBy ?? null,
        requesterPlatform: matchingRequest?.platform ?? null,
        queue: displayQueue.slice(0, 5),
        status: state.status,
        isRefreshing: this.isRefreshing
      }

      const prev = this.currentNowPlaying
      const significantChange =
        prev.trackId !== next.trackId ||
        prev.isPlaying !== next.isPlaying ||
        prev.status !== next.status ||
        Math.abs(prev.progressMs - next.progressMs) > 10000 // Only broadcast progress if jump > 10s

      this.currentNowPlaying = next
      if (significantChange) {
        this.emitNowPlaying()
      }

      // MANAGED QUEUE LOGIC:
      await this.handleManagedQueue(state, settings)

      // CLEANUP: Mark requests older than 2 hours as 'stale'
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
      let changed = false
      this.requestQueue.forEach(r => {
        if ((r.status === 'queued' || r.status === 'injected') && r.requestedAt < twoHoursAgo) {
          console.log(`\x1b[32m[Spotify]\x1b[0m Marking request as stale: \x1b[36m${r.track.name}\x1b[0m`)
          r.status = 'played'
          changed = true
        }
      })
      if (changed) this.emitQueueUpdate()

      return state.isPlaying ? 5000 : 10000
    } catch (err) {
      console.error('\x1b[31m[Spotify Error]\x1b[0m Poll loop error:', err)
      return 10000
    }
  }

  private async ensurePremium(): Promise<void> {
    if (!this.profile) return
    if (this.profile.product !== 'premium') {
      throw new Error('Spotify Premium is required for this action.')
    }
  }

  private async handleManagedQueue(state: any, settings: any): Promise<void> {
    if (this.isInjecting || !this.connected) return
    
    // We only attempt injection if the user is Premium, as Playback API is required
    if (this.profile?.product !== 'premium') return

    const nextRequest = this.requestQueue.find(r => r.status === 'queued')
    if (!nextRequest) return

    const progressMs = state?.progressMs || 0
    const durationMs = state?.durationMs || 0
    const isNearEnd = durationMs > 0 && (durationMs - progressMs) < 6000 // Inject earlier? 6s
    const nothingPlaying = state === null || (state.status === 'no-content' && !state.isPlaying)

    if (nothingPlaying || isNearEnd) {
      console.log(`[Spotify] Injecting next song: ${nextRequest.track.name}`)
      this.isInjecting = true
      try {
        if (nothingPlaying) {
          await playSpotifyTrack(settings.spotifyAccessToken, nextRequest.track.uri)
          nextRequest.status = 'played' // Immediate start
        } else {
          await addTrackToQueue(settings.spotifyAccessToken, nextRequest.track.uri)
          // Keep it in the queue but mark as injected so it doesn't double-inject
          // and we can still show it in "Up Next" until it actually starts playing.
          ;(nextRequest as any).status = 'injected'
        }
        this.emitQueueUpdate()
      } catch (err) {
        console.error('[spotify-managed] Injection failed:', err)
        this.lastError = err instanceof Error ? err.message : 'Injection failed'
        this.emitStatus()
      } finally {
        this.isInjecting = false
      }
    }
  }

  async skip(): Promise<void> {
    await this.handleSkipRequest()
  }

  /** Pause whatever's currently playing on the user's active Spotify device. */
  async pause(): Promise<void> {
    const settings = resolveAppSettings(this.db.getAllSettings())
    if (!settings.spotifyAccessToken) throw new Error('Spotify is not connected.')
    await this.ensurePremium()
    await pauseSpotifyPlayback(settings.spotifyAccessToken)
  }

  /** Resume playback on the user's active Spotify device. */
  async resume(): Promise<void> {
    const settings = resolveAppSettings(this.db.getAllSettings())
    if (!settings.spotifyAccessToken) throw new Error('Spotify is not connected.')
    await this.ensurePremium()
    await resumeSpotifyPlayback(settings.spotifyAccessToken)
  }

  /**
   * Save the currently-playing track to the user's Liked Songs library. Uses
   * the cached now-playing track id so we don't have to round-trip Spotify
   * just to figure out what to save.
   */
  async likeCurrent(): Promise<void> {
    const settings = resolveAppSettings(this.db.getAllSettings())
    if (!settings.spotifyAccessToken) throw new Error('Spotify is not connected.')
    const trackId = this.currentNowPlaying.trackId
    if (!trackId) throw new Error('No track is currently playing.')
    await saveSpotifyTrack(settings.spotifyAccessToken, trackId)
  }

  removeFromQueue(requestId: string): void {
    this.requestQueue = this.requestQueue.filter((r) => r.id !== requestId)
    this.emitQueueUpdate()
  }

  clearQueue(): void {
    this.requestQueue = []
    this.currentNowPlaying.requestedBy = null
    this.currentNowPlaying.requesterPlatform = null
    this.emitQueueUpdate()
  }

  private scheduleTokenRefresh(expiresInSeconds: number): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
    }

    // Refresh 5 min before expiry
    const delayMs = Math.max(0, (expiresInSeconds - 300) * 1000)
    this.refreshTimer = setTimeout(() => void this.doTokenRefresh(), delayMs)
  }

  private async doTokenRefresh(): Promise<void> {
    if (this.isRefreshing) return
    this.isRefreshing = true
    this.emitStatus()

    try {
      const settings = resolveAppSettings(this.db.getAllSettings())
      const { spotifyClientId, spotifyRefreshToken } = settings
      if (!spotifyClientId || !spotifyRefreshToken) {
        this.isRefreshing = false
        return
      }

      console.log('\x1b[32m[Spotify]\x1b[0m Refreshing tokens...')
      const tokens = await refreshSpotifyTokens(spotifyClientId, spotifyRefreshToken)
      const expiresAt = Date.now() + tokens.expiresIn * 1000

      this.db.setSetting('spotifyAccessToken', tokens.accessToken)
      this.db.setSetting('spotifyRefreshToken', tokens.refreshToken)
      this.db.setSetting('spotifyTokenExpiresAt', expiresAt)

      this.scheduleTokenRefresh(tokens.expiresIn)
      this.connected = true
      this.lastError = null
      this.startPolling() // Ensure polling is running after refresh
      console.log('\x1b[32m[Spotify]\x1b[0m Token refreshed successfully')
    } catch (err) {
      console.error('[spotify] Token refresh failed:', err)
      this.lastError = 'Authentication Expired'
      this.connected = false
      this.currentNowPlaying.status = 'unauthorized'
      this.emitNowPlaying()
    } finally {
      this.isRefreshing = false
      this.emitStatus()
    }
  }

  private emitStatus(): void {
    this.emit('status', this.getStatus())
  }

  private emitQueueUpdate(): void {
    this.saveQueueCache()
    const queue = this.getQueue()
    this.emit('queue-update', queue)

    // Sync the queue into the current now-playing payload so the overlay sees it immediately
    this.currentNowPlaying.queue = queue.filter((r) => r.status === 'queued')
    this.emitNowPlaying()
  }

  private emitNowPlaying(): void {
    this.emit('now-playing', this.getNowPlaying())
  }
}
