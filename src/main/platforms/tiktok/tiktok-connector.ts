import { randomUUID } from 'crypto'
import { BaseConnector } from '../base-connector'
import {
  Platform,
  TikTokConfig,
  PlatformConfig,
  PlatformChatCapability
} from '../types'
import { Database } from '../../db/database'
import { TikTokChatSender } from './tiktok-chat-sender'
import { TikTokMapper } from '../mappers/tiktok-mapper'

export class TikTokConnector extends BaseConnector {
  readonly platform: Platform = 'tiktok'
  private connection: any = null
  private connectionToken = 0
  private mapper = new TikTokMapper()

  constructor(private db: Database, private chatSender: TikTokChatSender) {
    super()
    this.setMaxReconnectAttempts(120)
  }

  validateConfig(config: PlatformConfig): string | null {
    const c = config as TikTokConfig
    if (!c.username?.trim()) return 'TikTok username is required'
    return null
  }

  protected async doConnect(config: PlatformConfig): Promise<void> {
    const tiktokConfig = config as TikTokConfig
    const username = tiktokConfig.username.replace(/^@/, '')
    const { WebcastPushConnection } = await import('tiktok-live-connector')

    this.cleanupConnection()
    const token = ++this.connectionToken
    const connection = new WebcastPushConnection(username, { enableExtendedGiftInfo: true })
    this.connection = connection

    connection.on('chat', (data: any) => {
      if (this.connectionToken !== token) return
      const event = this.mapper.mapChat(data)
      this.userCache.set('tiktok', event.user)
      this.emitEvent(event)
    })

    connection.on('gift', (data: any) => {
      if (this.connectionToken !== token) return
      const event = this.mapper.mapGift(data)
      this.userCache.set('tiktok', event.user)
      this.emitEvent(event)
    })

    connection.on('follow', (data: any) => {
      if (this.connectionToken !== token) return
      const event = this.mapper.mapFollow(data)
      this.userCache.set('tiktok', event.user)
      this.emitEvent(event)
    })

    connection.on('like', (data: any) => {
      if (this.connectionToken !== token) return
      this.emitEvent(this.mapper.mapLike(data))
    })

    connection.on('roomUser', (data: any) => {
      if (this.connectionToken !== token) return
      this.emitEvent(this.mapper.mapViewerCount(data))
    })

    connection.on('streamEnd', () => this.onUnexpectedDisconnect('TikTok reported stream end'))
    connection.on('disconnected', () => this.onUnexpectedDisconnect('TikTok WebSocket closed'))
    connection.on('error', (err: any) => this.onRecoverableError(err, 'connection'))

    await connection.connect()
    this.setStatus('connected')
  }

  protected async doDisconnect(): Promise<void> { this.cleanupConnection() }

  override getChatCapability(): PlatformChatCapability {
    return this.chatSender?.getStatus().isChatReady ? { platform: 'tiktok', canSend: true } : { platform: 'tiktok', canSend: false, reason: 'Chat sender not ready' }
  }

  override async sendChatMessage(text: string): Promise<void> {
    if (await this.chatSender.sendMessage(text)) return
    throw new Error('TikTok chat sending failed')
  }

  private cleanupConnection(): void {
    this.connectionToken++
    if (this.connection) try { this.connection.disconnect() } catch {}
    this.connection = null
  }
}
