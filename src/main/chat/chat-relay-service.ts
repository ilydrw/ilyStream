import { buildRelayText, getAutoRelayTargets, normalizeRelayText } from '../../shared/chat-relay'
import { isRelayFormattedEchoText, shouldSuppressStreamEventFromChat } from '../../shared/chat-event-filter'
import { htmlToSingleLinePlainText } from '../../shared/plain-text'
import type { AppSettings } from '../../shared/app-settings'
import { PlatformManager } from '../platforms/platform-manager'
import type { AnyStreamEvent, ChatEvent, Platform, PlatformChatSendResult } from '../platforms/types'

const CHAT_RELAY_SUPPRESSED_ECHO = Symbol('chatRelaySuppressedEcho')
const DEFAULT_AUTO_RELAY_FAILURE_COOLDOWN_MS = 30 * 60 * 1000

export class ChatRelayService {
  private readonly suppressionWindowMs: number
  private readonly autoRelayFailureCooldownMs: number

  // Tracks recently sent messages per target platform so echoed bot messages do not bounce back.
  private readonly suppressedInbound = new Map<string, number>()
  private readonly pausedAutoRelayTargets = new Map<Platform, { until: number; reason: string }>()

  private readonly handlePlatformEvent = (event: AnyStreamEvent) => {
    if (event.type !== 'chat') {
      return
    }

    if (isRelayFormattedEchoText(event.message, event.platform)) {
      markSuppressedChatRelayEcho(event)
      return
    }

    if (shouldSuppressStreamEventFromChat(event)) {
      return
    }

    void this.handleChatEvent(event)
  }

  constructor(
    private readonly platformManager: PlatformManager,
    private readonly getSettings: () => AppSettings,
    options: { suppressionWindowMs?: number; autoRelayFailureCooldownMs?: number } = {}
  ) {
    this.suppressionWindowMs = options.suppressionWindowMs ?? 90_000
    this.autoRelayFailureCooldownMs = options.autoRelayFailureCooldownMs ?? DEFAULT_AUTO_RELAY_FAILURE_COOLDOWN_MS
    this.platformManager.on('event', this.handlePlatformEvent)
  }

  dispose(): void {
    this.platformManager.off('event', this.handlePlatformEvent)
    this.suppressedInbound.clear()
    this.pausedAutoRelayTargets.clear()
  }

  async sendManualMessage(
    platforms: Platform[],
    text: string
  ): Promise<PlatformChatSendResult[]> {
    return this.sendToPlatforms(platforms, htmlToSingleLinePlainText(text))
  }

  private async handleChatEvent(event: ChatEvent): Promise<void> {
    const incomingText = normalizeRelayText(event.message)
    if (incomingText.length === 0) {
      return
    }

    if (this.consumeSuppression(event.platform, incomingText)) {
      markSuppressedChatRelayEcho(event)
      return
    }

    const settings = this.getSettings()
    if (!settings.chatAutoRelayEnabled) {
      return
    }

    if (!settings.chatAutoRelayPlatforms[event.platform]) {
      return
    }

    const targets = getAutoRelayTargets(
      this.platformManager.getChatCapabilities(),
      settings.chatAutoRelayPlatforms,
      event.platform
    ).filter((platform) => !this.isAutoRelayTargetPaused(platform))

    if (targets.length === 0) {
      return
    }

    const relayText = buildRelayText(
      {
        platform: event.platform,
        displayName: event.user.displayName,
        message: event.message
      },
      settings.chatRelayTagMode
    )

    if (normalizeRelayText(relayText).length === 0) {
      return
    }

    const results = await this.sendToPlatforms(targets, relayText)
    const failures = results.filter((result) => !result.ok)

    if (failures.length > 0) {
      for (const failure of failures) {
        this.pauseAutoRelayTargetOnQuotaFailure(failure.platform, failure.error)
      }

      console.warn(
        '[chat-relay] Auto relay failures:',
        failures.map((failure) => `${failure.platform}: ${failure.error || 'Unknown error'}`).join(' | ')
      )
    }
  }

  private async sendToPlatforms(
    platforms: Platform[],
    text: string
  ): Promise<PlatformChatSendResult[]> {
    const uniquePlatforms = Array.from(new Set(platforms))
    if (uniquePlatforms.length === 0) {
      return []
    }

    const chatText = htmlToSingleLinePlainText(text)
    if (!chatText) {
      return []
    }

    const normalizedText = normalizeRelayText(chatText)
    const shouldSuppressEcho = normalizedText.length > 0

    // Some platforms echo the sent chat message before their send promise
    // resolves. Reserve suppression before the send so those fast echoes do not
    // show up as duplicate relay messages or bounce back through auto-relay.
    if (shouldSuppressEcho) {
      for (const platform of uniquePlatforms) {
        this.rememberSuppression(platform, normalizedText)
      }
    }

    let results: PlatformChatSendResult[]
    try {
      results = await this.platformManager.sendChatMessageToPlatforms(uniquePlatforms, chatText)
    } catch (error) {
      if (shouldSuppressEcho) {
        for (const platform of uniquePlatforms) {
          this.forgetSuppression(platform, normalizedText)
        }
      }
      throw error
    }

    if (shouldSuppressEcho) {
      for (const result of results) {
        if (!result.ok) {
          this.forgetSuppression(result.platform, normalizedText)
        }
      }
    }

    return results
  }

  private rememberSuppression(platform: Platform, text: string): void {
    const now = Date.now()
    this.cleanupExpiredSuppressions(now)
    this.suppressedInbound.set(this.getSuppressionKey(platform, text), now + this.suppressionWindowMs)
  }

  private consumeSuppression(platform: Platform, text: string): boolean {
    const now = Date.now()
    this.cleanupExpiredSuppressions(now)

    const key = this.getSuppressionKey(platform, text)
    const expiresAt = this.suppressedInbound.get(key)

    if (!expiresAt) {
      return false
    }

    if (expiresAt <= now) {
      this.suppressedInbound.delete(key)
      return false
    }

    this.suppressedInbound.delete(key)
    return true
  }

  private forgetSuppression(platform: Platform, text: string): void {
    this.suppressedInbound.delete(this.getSuppressionKey(platform, text))
  }

  private cleanupExpiredSuppressions(now: number): void {
    for (const [key, expiresAt] of this.suppressedInbound) {
      if (expiresAt <= now) {
        this.suppressedInbound.delete(key)
      }
    }
  }

  private getSuppressionKey(platform: Platform, text: string): string {
    return `${platform}:${text}`
  }

  private isAutoRelayTargetPaused(platform: Platform): boolean {
    const paused = this.pausedAutoRelayTargets.get(platform)
    if (!paused) return false

    if (paused.until <= Date.now()) {
      this.pausedAutoRelayTargets.delete(platform)
      return false
    }

    return true
  }

  private pauseAutoRelayTargetOnQuotaFailure(platform: Platform, reason: unknown): void {
    if (!isQuotaOrRateLimitError(reason)) return

    const until = Date.now() + this.autoRelayFailureCooldownMs
    this.pausedAutoRelayTargets.set(platform, {
      until,
      reason: typeof reason === 'string' ? reason : String(reason || 'quota or rate limit')
    })
  }
}

function isQuotaOrRateLimitError(error: unknown): boolean {
  const text = String(error || '').toLowerCase()
  return (
    text.includes('quota') ||
    text.includes('rate limit') ||
    text.includes('ratelimit') ||
    text.includes('too many requests') ||
    text.includes('exceeded')
  )
}

export function markSuppressedChatRelayEcho(event: AnyStreamEvent): void {
  event.chatRelayEcho = true
  Object.defineProperty(event, CHAT_RELAY_SUPPRESSED_ECHO, {
    value: true,
    enumerable: false,
    configurable: true
  })
}

export function isSuppressedChatRelayEcho(event: AnyStreamEvent): boolean {
  return Boolean(event.chatRelayEcho || (event as any)[CHAT_RELAY_SUPPRESSED_ECHO])
}
