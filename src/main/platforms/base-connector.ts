import { EventEmitter } from 'events'
import {
  Platform,
  ConnectionStatus,
  AnyStreamEvent,
  PlatformConfig,
  PlatformChatCapability
} from './types'
import { UserCache } from './user-cache'

export interface ConnectorError {
  platform: Platform
  context: string
  message: string
  recoverable: boolean
  timestamp: Date
}

export abstract class BaseConnector extends EventEmitter {
  public status: ConnectionStatus = 'disconnected'
  public abstract readonly platform: Platform
  public lastError: ConnectorError | null = null

  protected currentConfig: PlatformConfig | null = null
  protected userCache = new UserCache()
  
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private baseReconnectDelayMs = 1000
  private maxReconnectDelayMs = 60_000
  private autoReconnect = true
  private isIntentionalDisconnect = false
  private connecting = false

  constructor() {
    super()
    this.setMaxListeners(50)
  }

  abstract validateConfig(config: PlatformConfig): string | null
  protected abstract doConnect(config: PlatformConfig): Promise<void>
  protected abstract doDisconnect(): Promise<void>

  async sendChatMessage(_text: string): Promise<void> {
    throw new Error(`${this.platform} outbound chat is not supported`)
  }

  getChatCapability(): PlatformChatCapability {
    if (this.status !== 'connected') {
      return { platform: this.platform, canSend: false, reason: 'Not connected' }
    }
    return { platform: this.platform, canSend: false, reason: `${this.platform} outbound chat is not supported` }
  }

  async connect(config: PlatformConfig): Promise<void> {
    if (this.connecting) throw new Error(`Already connecting to ${this.platform}`)
    if (this.status === 'connected') await this.disconnect()

    const validationError = this.validateConfig(config)
    if (validationError) {
      this.handleError(new Error(validationError), 'validation', false)
      throw new Error(validationError)
    }

    this.connecting = true
    this.isIntentionalDisconnect = false
    this.currentConfig = config
    this.reconnectAttempts = 0
    this.clearReconnectTimer()
    this.setStatus('connecting')

    try {
      await this.doConnect(config)
      if (this.isIntentionalDisconnect) {
        this.connecting = false
        return
      }
      this.connecting = false
      this.reconnectAttempts = 0
      this.setStatus('connected')
    } catch (error) {
      if (this.isIntentionalDisconnect) {
        this.connecting = false
        return
      }
      this.connecting = false
      this.handleError(error, 'connect', true)
      throw error
    }
  }

  async disconnect(): Promise<void> {
    this.isIntentionalDisconnect = true
    this.connecting = false
    this.clearReconnectTimer()
    try { await this.doDisconnect() } catch (error) { console.error(`[${this.platform}] Error during disconnect:`, error) }
    this.setStatus('disconnected')
  }

  protected onUnexpectedDisconnect(reason?: string): void {
    if (this.isIntentionalDisconnect) return
    console.warn(`[${this.platform}] Unexpected disconnect: ${reason || 'unknown'}`)
    this.setStatus('disconnected')
    this.scheduleReconnect()
  }

  protected onRecoverableError(error: unknown, context: string): void {
    this.handleError(error, context, true)
    if (this.status === 'connected' || this.status === 'connecting') {
      this.setStatus('disconnected')
      this.scheduleReconnect()
    }
  }

  protected handleError(error: unknown, context: string, recoverable = true): void {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[${this.platform}] ${context}: ${message}`)
    this.lastError = { platform: this.platform, context, message, recoverable, timestamp: new Date() }
    this.setStatus('error')
    this.emit('error', this.lastError)
    if (recoverable && !this.isIntentionalDisconnect) this.scheduleReconnect()
  }

  protected emitEvent(event: AnyStreamEvent): void {
    console.log(`[connector:${this.platform}] Emitting ${event.type} event...`)
    this.emit('event', event)
    this.emit(event.type, event)
  }

  protected setStatus(status: ConnectionStatus): void {
    if (this.status === status) return
    this.status = status
    this.emit('status', this.platform, status)
  }

  private scheduleReconnect(): void {
    if (!this.autoReconnect || this.isIntentionalDisconnect) return
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`[${this.platform}] Max reconnect attempts reached`)
      this.emit('reconnect-failed', this.platform)
      return
    }
    this.clearReconnectTimer()
    this.reconnectAttempts++
    const delay = Math.min(this.baseReconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1) + Math.random() * 1000, this.maxReconnectDelayMs)
    console.log(`[${this.platform}] Reconnecting in ${Math.round(delay / 1000)}s`)
    this.reconnectTimer = setTimeout(async () => {
      if (this.isIntentionalDisconnect || !this.currentConfig) return
      this.setStatus('connecting')
      this.connecting = true
      try {
        await this.doConnect(this.currentConfig)
        this.connecting = false
        this.reconnectAttempts = 0
        this.setStatus('connected')
      } catch (error) {
        this.connecting = false
        this.scheduleReconnect()
      }
    }, delay)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  setAutoReconnect(enabled: boolean): void { this.autoReconnect = enabled }
  setMaxReconnectAttempts(max: number): void { this.maxReconnectAttempts = max }
}
