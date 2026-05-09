import { EventEmitter } from 'events'
import {
  Platform,
  ConnectionStatus,
  AnyStreamEvent,
  PlatformConfig,
  PlatformChatCapability
} from './types'

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

  /**
   * Validate platform-specific config before connecting.
   * Subclasses should override to check required fields.
   */
  abstract validateConfig(config: PlatformConfig): string | null

  /**
   * Internal connect implementation. Subclasses implement this.
   */
  protected abstract doConnect(config: PlatformConfig): Promise<void>

  /**
   * Internal disconnect implementation. Subclasses implement this.
   */
  protected abstract doDisconnect(): Promise<void>

  async sendChatMessage(_text: string): Promise<void> {
    throw new Error(`${this.platform} outbound chat is not supported`)
  }

  getChatCapability(): PlatformChatCapability {
    if (this.status !== 'connected') {
      return {
        platform: this.platform,
        canSend: false,
        reason: 'Not connected'
      }
    }

    return {
      platform: this.platform,
      canSend: false,
      reason: `${this.platform} outbound chat is not supported`
    }
  }

  /**
   * Connect with validation, guard against double-connect, and auto-reconnect setup.
   */
  async connect(config: PlatformConfig): Promise<void> {
    // Guard against concurrent connect calls
    if (this.connecting) {
      throw new Error(`Already connecting to ${this.platform}`)
    }
    if (this.status === 'connected') {
      await this.disconnect()
    }

    // Validate config
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
      this.connecting = false
      this.reconnectAttempts = 0
      this.setStatus('connected')
    } catch (error) {
      this.connecting = false
      this.handleError(error, 'connect', true)
      throw error
    }
  }

  /**
   * Intentional disconnect - stops auto-reconnect.
   */
  async disconnect(): Promise<void> {
    this.isIntentionalDisconnect = true
    this.connecting = false
    this.clearReconnectTimer()

    try {
      await this.doDisconnect()
    } catch (error) {
      console.error(`[${this.platform}] Error during disconnect:`, error)
    }

    this.setStatus('disconnected')
  }

  /**
   * Called by subclasses when the connection drops unexpectedly.
   * Triggers auto-reconnect if enabled.
   */
  protected onUnexpectedDisconnect(reason?: string): void {
    if (this.isIntentionalDisconnect) return

    console.warn(`[${this.platform}] Unexpected disconnect: ${reason || 'unknown'}`)
    this.setStatus('disconnected')
    this.scheduleReconnect()
  }

  /**
   * Called by subclasses for recoverable errors (network, transient).
   * Triggers reconnect. For fatal errors (bad auth), use handleError with recoverable=false.
   */
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

    this.lastError = {
      platform: this.platform,
      context,
      message,
      recoverable,
      timestamp: new Date()
    }

    this.setStatus('error')
    this.emit('error', this.lastError)

    // Only auto-reconnect for recoverable errors
    if (recoverable && !this.isIntentionalDisconnect) {
      this.scheduleReconnect()
    }
  }

  protected emitEvent(event: AnyStreamEvent): void {
    this.emit('event', event)
    this.emit(event.type, event)
  }

  protected setStatus(status: ConnectionStatus): void {
    if (this.status === status) return

    this.status = status
    this.emit('status', this.platform, status)
  }

  // --- Reconnection ---

  private scheduleReconnect(): void {
    if (!this.autoReconnect || this.isIntentionalDisconnect) return
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`[${this.platform}] Max reconnect attempts (${this.maxReconnectAttempts}) reached`)
      this.emit('reconnect-failed', this.platform)
      return
    }

    this.clearReconnectTimer()
    this.reconnectAttempts++

    // Exponential backoff with jitter
    const delay = Math.min(
      this.baseReconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1) +
        Math.random() * 1000,
      this.maxReconnectDelayMs
    )

    console.log(
      `[${this.platform}] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    )

    this.emit('reconnecting', {
      platform: this.platform,
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      delayMs: delay
    })

    this.reconnectTimer = setTimeout(async () => {
      if (this.isIntentionalDisconnect || !this.currentConfig) return

      this.setStatus('connecting')
      this.connecting = true

      try {
        await this.doConnect(this.currentConfig)
        this.connecting = false
        this.reconnectAttempts = 0
        this.setStatus('connected')
        console.log(`[${this.platform}] Reconnected successfully`)
      } catch (error) {
        this.connecting = false
        const message = error instanceof Error ? error.message : String(error)
        console.error(`[${this.platform}] Reconnect failed: ${message}`)
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

  setAutoReconnect(enabled: boolean): void {
    this.autoReconnect = enabled
  }

  setMaxReconnectAttempts(max: number): void {
    this.maxReconnectAttempts = max
  }
}
