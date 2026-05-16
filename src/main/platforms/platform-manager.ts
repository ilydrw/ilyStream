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
import { Database } from '../db/database'
import { TikTokChatSender } from './tiktok/tiktok-chat-sender'

export class PlatformManager extends EventEmitter {
  private connectors: Map<Platform, BaseConnector> = new Map()
  private viewerCounts: Partial<Record<Platform, number>> = {}

  constructor(private db: Database, private tiktokChatSender: TikTokChatSender) {
    super()
    this.setMaxListeners(100)

    // Initialize all connectors
    const platforms: BaseConnector[] = [
      new TikTokConnector(this.db, this.tiktokChatSender),
      new TwitchConnector(this.db),
      new YouTubeConnector(),
      new KickConnector()
    ]

    const autoReconnect = !!this.db.getSetting('platformAutoReconnect')

    for (const connector of platforms) {
      this.connectors.set(connector.platform, connector)
      connector.setAutoReconnect(autoReconnect)

      connector.on('event', (event: AnyStreamEvent) => {
        console.log(`[platform-manager] Relaying ${event.type} from ${connector.platform}`)

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
        this.emit('token-refresh', data)
      })

      connector.on('reconnecting', (data: unknown) => {
        this.emit('reconnecting', data)
      })
    }
  }

  setAutoReconnect(enabled: boolean): void {
    for (const connector of this.connectors.values()) {
      connector.setAutoReconnect(enabled)
    }
  }

  async connect(config: AnyPlatformConfig): Promise<void> {
    const connector = this.connectors.get(config.platform)
    if (!connector) throw new Error(`Unknown platform: ${config.platform}`)
    await connector.connect(config)
  }

  async disconnect(platform: Platform): Promise<void> {
    const connector = this.connectors.get(platform)
    if (!connector) throw new Error(`Unknown platform: ${platform}`)
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

  getChatCapabilities(): Record<Platform, PlatformChatCapability> {
    const caps = {} as Record<Platform, PlatformChatCapability>
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
}
