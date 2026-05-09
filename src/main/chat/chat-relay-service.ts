import { buildRelayText, getAutoRelayTargets, normalizeRelayText } from '../../shared/chat-relay'
import type { AppSettings } from '../../shared/app-settings'
import { PlatformManager } from '../platforms/platform-manager'
import type { AnyStreamEvent, ChatEvent, Platform, PlatformChatSendResult } from '../platforms/types'

export class ChatRelayService {
  private readonly suppressionWindowMs: number

  // Tracks recently sent messages per target platform so echoed bot messages do not bounce back.
  private readonly suppressedInbound = new Map<string, number>()

  private readonly handlePlatformEvent = (event: AnyStreamEvent) => {
    if (event.type !== 'chat') {
      return
    }

    void this.handleChatEvent(event)
  }

  constructor(
    private readonly platformManager: PlatformManager,
    private readonly getSettings: () => AppSettings,
    options: { suppressionWindowMs?: number } = {}
  ) {
    this.suppressionWindowMs = options.suppressionWindowMs ?? 90_000
    this.platformManager.on('event', this.handlePlatformEvent)
  }

  dispose(): void {
    this.platformManager.off('event', this.handlePlatformEvent)
    this.suppressedInbound.clear()
  }

  async sendManualMessage(
    platforms: Platform[],
    text: string
  ): Promise<PlatformChatSendResult[]> {
    return this.sendToPlatforms(platforms, text)
  }

  private async handleChatEvent(event: ChatEvent): Promise<void> {
    const incomingText = normalizeRelayText(event.message)
    if (incomingText.length === 0) {
      return
    }

    if (this.consumeSuppression(event.platform, incomingText)) {
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
    )

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

    const results = await this.platformManager.sendChatMessageToPlatforms(uniquePlatforms, text)
    const normalizedText = normalizeRelayText(text)

    if (normalizedText.length > 0) {
      for (const result of results) {
        if (result.ok) {
          this.rememberSuppression(result.platform, normalizedText)
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
}
