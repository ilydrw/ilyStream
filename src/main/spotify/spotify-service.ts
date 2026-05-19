import { EventEmitter } from 'events'
import { join } from 'path'
import log from 'electron-log'
import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import type { Database } from '../db/database'
import type { PlatformManager } from '../platforms/platform-manager'
import type { SpotifySongRequest, SpotifyStatus } from '../../shared/spotify-types'
import { EMPTY_NOW_PLAYING, type NowPlayingPayload } from '../../shared/widgets'
import { resolveAppSettings } from '../../shared/app-settings'
import { initiateSpotifyAuth, refreshSpotifyTokens, DEFAULT_SPOTIFY_CLIENT_ID } from './spotify-auth'
import { SpotifyClient, type SpotifyUserProfile } from './client/spotify-client'
import { SpotifyMapper } from './mappers/spotify-mapper'
import type { AnyStreamEvent, ChatEvent } from '../platforms/types'

const SONG_REQUEST_COMMANDS = new Set(['!sr', '!songrequest', '!play', '.play', '/play'])
const SKIP_COMMANDS = new Set(['!skip', '!voteskip', '.skip', '/skip'])

interface SongRequestSource {
  platform?: string
  displayName?: string
  profilePictureUrl?: string | null
}

type SpotifyChatCommand =
  | { type: 'song-request'; query: string }
  | { type: 'skip' }
  | { type: 'none' }

export class SpotifyService extends EventEmitter {
  private connected = false
  private profile: SpotifyUserProfile | null = null
  private requestQueue: SpotifySongRequest[] = []
  private skipVotes = new Set<string>()
  private pollTimer: NodeJS.Timeout | null = null
  private currentNowPlaying: NowPlayingPayload = { ...EMPTY_NOW_PLAYING }
  private client = new SpotifyClient()
  private mapper = new SpotifyMapper()
  private accessToken: string | null = null
  private refreshToken: string | null = null
  private lastError: string | null = null

  constructor(private db: Database, private platformManager: PlatformManager) {
    super()
    this.loadQueueCache()
  }

  public getNowPlaying() { return this.currentNowPlaying }

  getQueue(): SpotifySongRequest[] { return [...this.requestQueue] }

  getStatus(): SpotifyStatus {
    return {
      connected: this.connected,
      displayName: this.profile?.displayName,
      imageUrl: this.profile?.imageUrl,
      isActiveDevice: this.currentNowPlaying.status !== 'no-device',
      error: this.lastError
    }
  }

  async connect(clientIdOverride?: string): Promise<SpotifyStatus> {
    const settings = resolveAppSettings(this.db.getAllSettings())
    const currentClientId = settings.spotifyClientId || DEFAULT_SPOTIFY_CLIENT_ID
    const clientId = (clientIdOverride?.trim() || currentClientId).trim()

    if (!clientId) {
      this.lastError = 'Spotify Client ID is required before connecting.'
      this.emit('status', this.getStatus())
      throw new Error(this.lastError)
    }

    if (clientIdOverride?.trim() && clientId !== currentClientId) {
      this.db.setSetting('spotifyClientId', clientId)
      this.db.setSetting('spotifyAccessToken', null)
      this.db.setSetting('spotifyRefreshToken', null)
    }

    this.lastError = null

    let token = this.db.getSetting('spotifyAccessToken') as string | undefined
    if (!token) {
      try {
        const tokens = await initiateSpotifyAuth(clientId)
        this.accessToken = tokens.accessToken
        this.refreshToken = tokens.refreshToken
        this.db.setSetting('spotifyAccessToken', tokens.accessToken)
        this.db.setSetting('spotifyRefreshToken', tokens.refreshToken)
        this.client.setAccessToken(tokens.accessToken)
      } catch (e: any) {
        throw e
      }
    } else {
      this.accessToken = token
      this.refreshToken = settings.spotifyRefreshToken || null
      this.client.setAccessToken(token)
    }

    try {
      this.profile = await this.client.getProfile()
      this.connected = true
      this.startPolling()
      this.emit('status', this.getStatus())
      return this.getStatus()
    } catch (e: any) {
      if (e.message?.includes('401') && this.refreshToken) {
        try {
          await this.refreshAccessToken()
          this.profile = await this.client.getProfile()
          this.connected = true
          this.startPolling()
          this.emit('status', this.getStatus())
          return this.getStatus()
        } catch (refreshErr: any) {
          log.warn('[Spotify] Token refresh during connect failed:', refreshErr?.message || refreshErr)
        }
      }

      // Clear invalid tokens and try fresh auth
      this.db.setSetting('spotifyAccessToken', null)
      this.db.setSetting('spotifyRefreshToken', null)

      try {
        const tokens = await initiateSpotifyAuth(clientId)
        this.accessToken = tokens.accessToken
        this.refreshToken = tokens.refreshToken
        this.db.setSetting('spotifyAccessToken', tokens.accessToken)
        this.db.setSetting('spotifyRefreshToken', tokens.refreshToken)
        this.client.setAccessToken(tokens.accessToken)

        this.profile = await this.client.getProfile()
        this.connected = true
        this.startPolling()
        this.emit('status', this.getStatus())
        return this.getStatus()
      } catch (authErr: any) {
        this.lastError = authErr.message || 'Authentication failed'
        this.handleAuthError()
        throw authErr
      }
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false
    this.accessToken = null
    this.refreshToken = null
    this.profile = null
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null

    this.db.setSetting('spotifyAccessToken', null)
    this.db.setSetting('spotifyRefreshToken', null)
    this.lastError = null
    this.emit('status', this.getStatus())
  }

  async processEvent(event: AnyStreamEvent): Promise<boolean> {
    if (event.type !== 'chat') return false
    const chat = event as ChatEvent
    const command = this.parseChatCommand(chat.message)
    if (command.type === 'none') return false

    const settings = resolveAppSettings(this.db.getAllSettings())

    if (command.type === 'song-request') {
      if (!settings.spotifySongRequestsEnabled || !settings.spotifyPlayEnabled || !command.query) return true

      await this.searchAndEnqueue(command.query, chat.user.username, {
        platform: chat.platform,
        displayName: chat.user.displayName,
        profilePictureUrl: chat.user.profilePictureUrl ?? null
      })
      return true
    }

    if (command.type === 'skip') {
      if (!settings.spotifySongRequestsEnabled || !settings.spotifySkipEnabled) return true
      await this.skip()
      return true
    }

    return false
  }

  async searchAndEnqueue(query: string, username: string, source: SongRequestSource = {}): Promise<SpotifySongRequest | null> {
    try {
      const settings = resolveAppSettings(this.db.getAllSettings())
      if (!settings.spotifySongRequestsEnabled || !settings.spotifyPlayEnabled) return null

      const queuedRequests = this.requestQueue.filter(r => r.status === 'queued')
      if (settings.spotifyMaxQueueLength > 0 && queuedRequests.length >= settings.spotifyMaxQueueLength) return null

      const normalizedUsername = username.toLowerCase()
      const userQueued = queuedRequests.filter(r => String(r.requestedBy).toLowerCase() === normalizedUsername).length
      if (settings.spotifyMaxPerUser > 0 && userQueued >= settings.spotifyMaxPerUser) return null

      const rawTrack = await this.client.searchTrack(query)
      if (!rawTrack) return null

      const track = this.mapper.mapTrack(rawTrack)
      if (!settings.spotifyAllowExplicit && track.explicit) return null

      await this.client.enqueue(track.uri)

      const request: SpotifySongRequest = {
        id: Math.random().toString(36).substring(2, 11),
        track,
        requestedBy: username,
        platform: source.platform || 'all',
        requestedAt: Date.now(),
        status: 'queued',
        displayName: source.displayName,
        profilePictureUrl: source.profilePictureUrl ?? null
      }
      this.requestQueue.push(request)
      this.saveQueueCache()
      this.emit('queue-update', this.getQueue())
      this.emitNowPlaying()
      this.emit('song-requested', request)
      return request
    } catch (e) {
      console.error('[Spotify] SR failed:', e)
      return null
    }
  }

  private parseChatCommand(message: string): SpotifyChatCommand {
    const trimmed = message.trim()
    const match = trimmed.match(/^(\S+)(?:\s+([\s\S]*))?$/)
    if (!match) return { type: 'none' }

    const command = match[1].toLowerCase()
    const argument = (match[2] ?? '').trim()

    if (SONG_REQUEST_COMMANDS.has(command)) return { type: 'song-request', query: argument }
    if (SKIP_COMMANDS.has(command)) return { type: 'skip' }
    return { type: 'none' }
  }

  async removeFromQueue(requestId: string): Promise<void> {
    this.requestQueue = this.requestQueue.filter(r => r.id !== requestId)
    this.saveQueueCache()
    this.emit('queue-update', this.getQueue())
    this.emitNowPlaying()
  }

  async clearQueue(): Promise<void> {
    this.requestQueue = []
    this.saveQueueCache()
    this.emit('queue-update', this.getQueue())
    this.emitNowPlaying()
  }

  async skip(): Promise<void> {
    try {
      await this.client.skip()
      this.skipVotes.clear()
    } catch (e) {
      console.error('[Spotify] Skip failed:', e)
    }
  }

  async pause(): Promise<void> {
    await this.client.pause()
  }

  async resume(): Promise<void> {
    await this.client.play()
  }

  async likeCurrent(): Promise<void> {
    if (this.currentNowPlaying.trackId) {
      await this.client.saveTrack(this.currentNowPlaying.trackId)
    }
  }

  private startPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = setInterval(() => this.poll(), 5000)
    void this.poll()
  }

  private async poll(): Promise<void> {
    if (!this.connected) return
    try {
      const raw = await this.client.getPlaybackState()
      const state = this.mapper.mapPlaybackState(raw)
      this.currentNowPlaying = {
        ...this.mapper.mapNowPlaying(state),
        queue: this.getQueue()
      }
      this.emitNowPlaying()
    } catch (e: any) {
      const message = e instanceof Error ? e.message : String(e)
      console.error('[Spotify] Now playing poll failed:', message)

      if (message.includes('401')) {
        this.currentNowPlaying = { ...EMPTY_NOW_PLAYING, status: 'unauthorized' }
        this.handleAuthError('Spotify authorization expired. Reconnect Spotify.')
      } else if (message.includes('403')) {
        this.currentNowPlaying = { ...EMPTY_NOW_PLAYING, status: 'forbidden' }
      } else if (message.includes('404')) {
        this.currentNowPlaying = { ...EMPTY_NOW_PLAYING, status: 'no-device' }
      } else {
        this.currentNowPlaying = { ...EMPTY_NOW_PLAYING, status: 'error' }
      }

      this.emitNowPlaying()
    }
  }

  private emitNowPlaying(): void {
    this.currentNowPlaying = {
      ...this.currentNowPlaying,
      queue: this.getQueue()
    }
    this.emit('now-playing', this.currentNowPlaying)
  }

  private handleAuthError(error?: string): void {
    this.connected = false
    if (error) this.lastError = error
    this.emit('status', this.getStatus())
  }

  private saveQueueCache(): void {
    try {
      writeFileSync(join(app.getPath('userData'), 'spotify-queue.json'), JSON.stringify(this.requestQueue))
    } catch {}
  }

  private loadQueueCache(): void {
    const path = join(app.getPath('userData'), 'spotify-queue.json')
    if (existsSync(path)) {
      try {
        this.requestQueue = JSON.parse(readFileSync(path, 'utf-8')).filter((r: any) => r.requestedAt > Date.now() - 86400000)
      } catch {}
    }
  }

  async restoreSession(): Promise<void> {
    const settings = resolveAppSettings(this.db.getAllSettings())
    this.accessToken = settings.spotifyAccessToken || null
    this.refreshToken = settings.spotifyRefreshToken || null

    if (this.refreshToken) {
      if (!(settings.spotifyClientId || DEFAULT_SPOTIFY_CLIENT_ID).trim()) {
        this.lastError = 'Spotify Client ID is required before restoring Spotify.'
        this.emit('status', this.getStatus())
        return
      }

      try {
        await this.refreshAccessToken()
        this.profile = await this.client.getProfile()
        this.connected = true
        this.startPolling()
        this.emit('status', this.getStatus())
      } catch (e: any) {
        this.lastError = `Session restoration failed: ${e.message}`
      }
    }
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) return
    const settings = resolveAppSettings(this.db.getAllSettings())
    const clientId = (settings.spotifyClientId || DEFAULT_SPOTIFY_CLIENT_ID).trim()

    if (!clientId) {
      const error = 'Spotify Client ID is required before refreshing Spotify.'
      this.handleAuthError(error)
      throw new Error(error)
    }

    try {
      const tokens = await refreshSpotifyTokens(clientId, this.refreshToken)
      this.accessToken = tokens.accessToken
      this.refreshToken = tokens.refreshToken
      this.db.setSetting('spotifyAccessToken', tokens.accessToken)
      this.db.setSetting('spotifyRefreshToken', tokens.refreshToken)
      this.client.setAccessToken(tokens.accessToken)
      log.info('[Spotify] Access token refreshed')
    } catch (err: any) {
      log.error('[Spotify] Token refresh failed:', err)
      this.handleAuthError(`Token refresh failed: ${err.message}`)
      throw err
    }
  }

  async dispose(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.accessToken = null
  }
}
