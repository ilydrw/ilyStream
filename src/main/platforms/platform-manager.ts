import { EventEmitter } from 'events'
import {
  Platform,
  ConnectionStatus,
  AnyStreamEvent,
  AnyPlatformConfig,
  PlatformChatCapability,
  PlatformChatSendResult
} from './types'
import { BaseConnector } from './base-connector'
import { TikTokConnector } from './tiktok/tiktok-connector'
import { TwitchConnector } from './twitch/twitch-connector'
import { YouTubeConnector } from './youtube/youtube-connector'
import { KickConnector } from './kick/kick-connector'
import { DiscordConnector } from './discord/discord-connector'
import { resolveDiscordCallProfiles } from './discord/discord-profile-resolution'
import type { DiscordCallState } from '../../shared/discord-call'
import { Database } from '../db/database'
import { TikTokChatSender } from './tiktok/tiktok-chat-sender'
import { resolveAppSettings } from '../../shared/app-settings'
import { LIKE_LOG_VERBOSE } from '../../shared/debug-flags'

export class PlatformManager extends EventEmitter {
  private connectors: Map<Platform, BaseConnector> = new Map()
  private viewerCounts: Partial<Record<Platform, number>> = {}
  private discordConnector: DiscordConnector
  private resolvedDiscordCallState: DiscordCallState | null = null

  constructor(private db: Database, private tiktokChatSender: TikTokChatSender) {
    super()
    this.setMaxListeners(100)

    this.discordConnector = new DiscordConnector()

    // Initialize all connectors
    const platforms: BaseConnector[] = [
      new TikTokConnector(this.db, this.tiktokChatSender),
      new TwitchConnector(this.db),
      new YouTubeConnector(),
      new KickConnector({ db: this.db }),
      this.discordConnector
    ]

    const autoReconnect = resolvePlatformAutoReconnect(this.db.getAllSettings?.() || {})

    for (const connector of platforms) {
      this.connectors.set(connector.platform, connector)
      connector.setAutoReconnect(autoReconnect)

      connector.on('event', (event: AnyStreamEvent) => {
        if (event.type !== 'like' || LIKE_LOG_VERBOSE) {
          console.log(`[platform-manager] Relaying ${event.type} from ${connector.platform}`)
        }

        if (event.type === 'viewer-count') {
          this.viewerCounts[event.platform] = (event as any).count
        }

        this.emit('event', event)
        this.emit(event.type, event)
      })

      connector.on('status', (platform: Platform, status: ConnectionStatus) => {
        this.emit('status', platform, status)
      })

      connector.on('error', (err: unknown) => {
        this.emit('connector-error', err)
      })

      connector.on('token-refresh', (data: unknown) => {
        this.persistRefreshedPlatformToken(data)
        this.emit('token-refresh', data)
      })

      connector.on('token-invalidated', (data: unknown) => {
        this.clearPersistedPlatformAccessToken(data)
        this.emit('token-invalidated', data)
      })

      connector.on('reconnecting', (data: unknown) => {
        this.emit('reconnecting', data)
      })

      connector.on('profile-health', (data: unknown) => {
        this.emit('profile-health', data)
      })
    }

    this.discordConnector.on('call-state', () => {
      this.resolvedDiscordCallState = null
      this.emit('discord-call-state', this.getDiscordCallState())
    })
  }

  setAutoReconnect(enabled: boolean): void {
    for (const connector of this.connectors.values()) {
      connector.setAutoReconnect(enabled)
    }
  }

  async retryWaitingConnections(): Promise<Platform[]> {
    const results = await Promise.all(
      Array.from(this.connectors.entries()).map(async ([platform, connector]) => {
        return await connector.retryWaitingNow() ? platform : null
      })
    )
    return results.filter((platform): platform is Platform => platform !== null)
  }

  async connect(config: AnyPlatformConfig): Promise<void> {
    const connector = this.connectors.get(config.platform)
    if (!connector) {
      // Social/presence platforms have no live connector yet. The config was
      // already persisted by the IPC handler, so credentials are kept.
      throw new Error(
        `${config.platform} settings saved — live connection for this platform is coming soon.`
      )
    }
    await connector.connect(config)
  }

  private persistRefreshedPlatformToken(data: unknown): void {
    if (!data || typeof data !== 'object') return

    const token = data as {
      platform?: Platform
      accessToken?: unknown
      refreshToken?: unknown
      scopes?: unknown
      accessTokenExpiresAt?: unknown
      expiresIn?: unknown
      userAccessToken?: unknown
      userRefreshToken?: unknown
      userTokenExpiresAt?: unknown
      userScopes?: unknown
    }

    if (token.platform === 'kick' && typeof token.userAccessToken === 'string' && token.userAccessToken.trim()) {
      const existing = this.db.getPlatformConfig('kick')
      if (!existing) return
      this.db.savePlatformConfig({
        ...existing,
        userAccessToken: token.userAccessToken,
        userRefreshToken: typeof token.userRefreshToken === 'string' && token.userRefreshToken.trim()
          ? token.userRefreshToken
          : (existing as any).userRefreshToken,
        userTokenExpiresAt: typeof token.userTokenExpiresAt === 'number'
          ? token.userTokenExpiresAt
          : (existing as any).userTokenExpiresAt,
        userScopes: typeof token.userScopes === 'string' && token.userScopes.trim()
          ? token.userScopes
          : (existing as any).userScopes
      } as AnyPlatformConfig)
      return
    }

    if (!token.platform || typeof token.accessToken !== 'string' || token.accessToken.trim().length === 0) {
      return
    }

    const existing = this.db.getPlatformConfig(token.platform)
    if (!existing) return

    const nextConfig = { ...existing } as AnyPlatformConfig & {
      accessToken?: string
      refreshToken?: string
      tokenScopes?: string[]
      accessTokenExpiresAt?: number
    }
    nextConfig.accessToken = token.accessToken
    if (typeof token.refreshToken === 'string' && token.refreshToken.trim().length > 0) {
      nextConfig.refreshToken = token.refreshToken
    }
    if (Array.isArray(token.scopes)) {
      nextConfig.tokenScopes = token.scopes.filter((scope): scope is string => typeof scope === 'string')
    }
    if (typeof token.accessTokenExpiresAt === 'number' && Number.isFinite(token.accessTokenExpiresAt)) {
      nextConfig.accessTokenExpiresAt = token.accessTokenExpiresAt
    } else if (typeof token.expiresIn === 'number' && Number.isFinite(token.expiresIn) && token.expiresIn > 0) {
      nextConfig.accessTokenExpiresAt = Date.now() + token.expiresIn * 1000
    }

    this.db.savePlatformConfig(nextConfig)
  }

  private clearPersistedPlatformAccessToken(data: unknown): void {
    if (!data || typeof data !== 'object') return

    const platform = (data as { platform?: Platform }).platform
    if (platform !== 'discord') return

    const existing = this.db.getPlatformConfig(platform)
    if (!existing || !('accessToken' in existing)) return

    const nextConfig = { ...existing }
    delete nextConfig.accessToken
    this.db.savePlatformConfig(nextConfig)
  }

  async disconnect(platform: Platform): Promise<void> {
    const connector = this.connectors.get(platform)
    // Platforms without live connectors have nothing to tear down.
    if (!connector) return
    await connector.disconnect()
  }

  async disconnectAll(): Promise<void> {
    const promises = Array.from(this.connectors.values()).map((c) =>
      c.disconnect().catch(() => {})
    )
    await Promise.all(promises)
  }

  getStatus(platform: Platform): ConnectionStatus {
    return this.connectors.get(platform)?.status ?? 'disconnected'
  }

  getAllStatuses(): Record<Platform, ConnectionStatus> {
    const statuses = {} as Record<Platform, ConnectionStatus>
    for (const [platform, connector] of this.connectors) {
      statuses[platform] = connector.status
    }
    return statuses
  }

  getAllErrors(): Record<Platform, string | null> {
    const errors = {} as Record<Platform, string | null>
    for (const [platform, connector] of this.connectors) {
      errors[platform] = connector.lastError?.message ?? null
    }
    return errors
  }

  getChatCapabilities(): Partial<Record<Platform, PlatformChatCapability>> {
    const caps: Partial<Record<Platform, PlatformChatCapability>> = {}
    for (const [platform, connector] of this.connectors) {
      caps[platform] = connector.getChatCapability()
    }
    return caps
  }


  async sendChatMessage(platform: Platform, text: string): Promise<void> {
    const connector = this.connectors.get(platform)
    if (!connector) throw new Error(`Unknown platform: ${platform}`)
    await connector.sendChatMessage(text)
  }

  async sendChatMessageToPlatforms(
    platforms: Platform[],
    text: string
  ): Promise<PlatformChatSendResult[]> {
    const results = await Promise.all(
      platforms.map(async (platform) => {
        try {
          await this.sendChatMessage(platform, text)
          return { platform, ok: true } satisfies PlatformChatSendResult
        } catch (error) {
          return {
            platform,
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          } satisfies PlatformChatSendResult
        }
      })
    )

    return results
  }

  emitTestEvent(event: AnyStreamEvent): void {
    console.log(`[platform-manager] Emitting test event: ${event.type}`)
    this.emit('event', event)
    this.emit(event.type, event)
  }

  getViewerCounts(): Record<Platform, number> {
    return { ...this.viewerCounts } as Record<Platform, number>
  }

  getDiscordCallState(): DiscordCallState {
    if (!this.resolvedDiscordCallState) {
      this.resolvedDiscordCallState = resolveDiscordCallProfiles(this.discordConnector.getCallState(), this.db)
    }
    return {
      ...this.resolvedDiscordCallState,
      participants: this.resolvedDiscordCallState.participants.map((participant) => ({ ...participant }))
    }
  }

  refreshDiscordCallProfiles(): DiscordCallState {
    this.resolvedDiscordCallState = null
    const state = this.getDiscordCallState()
    this.emit('discord-call-state', state)
    return state
  }
}

export function resolvePlatformAutoReconnect(settings: Record<string, unknown>): boolean {
  return resolveAppSettings(settings).platform.autoReconnect
}
