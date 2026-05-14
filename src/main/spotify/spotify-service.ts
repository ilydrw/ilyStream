import { EventEmitter } from 'events'
import { join } from 'path'
import log from 'electron-log'
import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import type { Database } from '../db/database'
import type { PlatformManager } from '../platforms/platform-manager'
import type { SpotifySongRequest, SpotifyStatus } from '../../shared/spotify-types'
import { EMPTY_NOW_PLAYING, type NowPlayingPayload } from '../../shared/widgets'
import { initiateSpotifyAuth, refreshSpotifyTokens, DEFAULT_SPOTIFY_CLIENT_ID } from './spotify-auth'
import { SpotifyClient, type SpotifyUserProfile } from './client/spotify-client'
import { SpotifyMapper } from './mappers/spotify-mapper'
import type { AnyStreamEvent, ChatEvent } from '../platforms/types'

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
      isActiveDevice: this.currentNowPlaying.status !== 'no-device'
    }
  }

  async connect(): Promise<void> {
    const settings = this.db.getAllSettings()
    const token = settings.spotifyAccessToken as string | undefined
    if (!token) {
      const tokens = await initiateSpotifyAuth(DEFAULT_SPOTIFY_CLIENT_ID)
      this.accessToken = tokens.accessToken
      this.refreshToken = tokens.refreshToken
      this.db.setSetting('spotifyAccessToken', tokens.accessToken)
      this.db.setSetting('spotifyRefreshToken', tokens.refreshToken)
      this.client.setAccessToken(tokens.accessToken)
      return
    }

    this.accessToken = token
    this.refreshToken = settings.spotifyRefreshToken as string | undefined || null
    this.client.setAccessToken(token)
    try {
      this.profile = await this.client.getProfile()
      this.connected = true
      this.startPolling()
      this.emit('status', this.getStatus())
    } catch (e) {
      this.handleAuthError()
    }
  }

  async processEvent(event: AnyStreamEvent): Promise<boolean> {
    if (event.type !== 'chat') return false
    const chat = event as ChatEvent
    const msg = chat.message.trim().toLowerCase()
    
    if (msg.startsWith('!sr ') || msg.startsWith('!songrequest ')) {
      const query = chat.message.split(' ').slice(1).join(' ')
      if (query) {
        await this.searchAndEnqueue(query, chat.user.username)
        return true
      }
    }
    
    if (msg === '!skip') {
      await this.skip()
      return true
    }

    return false
  }

  async searchAndEnqueue(query: string, username: string): Promise<SpotifySongRequest | null> {
    try {
      const rawTrack = await this.client.searchTrack(query)
      if (!rawTrack) return null

      const track = this.mapper.mapTrack(rawTrack)
      await this.client.enqueue(track.uri)

      const request: SpotifySongRequest = { 
        id: Math.random().toString(36).substring(2, 11), 
        track, 
        requestedBy: username,
        platform: 'all', // Default platform for manual sr
        requestedAt: Date.now(), 
        status: 'queued' 
      }
      this.requestQueue.push(request)
      this.saveQueueCache()
      this.emit('song-requested', request)
      return request
    } catch (e) {
      console.error('[Spotify] SR failed:', e)
      return null
    }
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
      const raw = await this.client.getCurrentlyPlaying()
      const state = this.mapper.mapPlaybackState(raw)
      this.currentNowPlaying = this.mapper.mapNowPlaying(state)
      this.emit('now-playing', this.currentNowPlaying)
    } catch (e) {
      // Handle auth error if needed
    }
  }

  private handleAuthError(): void {
    this.connected = false
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
    const settings = this.db.getAllSettings()
    this.accessToken = settings.spotifyAccessToken as string | null
    this.refreshToken = settings.spotifyRefreshToken as string | null
    
    if (this.refreshToken) {
      await this.refreshAccessToken()
    }
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) return
    try {
      const tokens = await refreshSpotifyTokens(DEFAULT_SPOTIFY_CLIENT_ID, this.refreshToken)
      this.accessToken = tokens.accessToken
      this.refreshToken = tokens.refreshToken
      this.db.setSetting('spotifyAccessToken', tokens.accessToken)
      this.db.setSetting('spotifyRefreshToken', tokens.refreshToken)
      this.client.setAccessToken(tokens.accessToken)
      log.info('[Spotify] Access token refreshed')
    } catch (err) {
      log.error('[Spotify] Token refresh failed:', err)
      this.handleAuthError()
    }
  }

  async dispose(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.accessToken = null
  }
}


