import {
  buildRelayText,
  getAutoRelayTargets,
  getRelayEchoCandidates,
  normalizeRelayText,
  relayTextsMatch
} from '../../shared/chat-relay'
import { isRelayFormattedEchoText, shouldSuppressStreamEventFromChat } from '../../shared/chat-event-filter'
import { htmlToSingleLinePlainText } from '../../shared/plain-text'
import type { AppSettings } from '../../shared/app-settings'
import { PlatformManager } from '../platforms/platform-manager'
import type { AnyStreamEvent, ChatEvent, Platform, PlatformChatSendResult } from '../platforms/types'

const CHAT_RELAY_SUPPRESSED_ECHO = Symbol('chatRelaySuppressedEcho')
const DEFAULT_AUTO_RELAY_FAILURE_COOLDOWN_MS = 30 * 60 * 1000
const MAX_SUPPRESSIONS_PER_PLATFORM = 64
const MAX_RECENT_ORIGINALS = 300
/** Undecorated duplicates must be at least this long to count as relays —
 * "lol" showing up on two platforms within a minute is coincidence. */
const MIN_UNDECORATED_DUPLICATE_LENGTH = 12

interface SuppressionEntry {
  text: string
  expiresAt: number
}

interface RecentOriginal {
  platform: Platform
  text: string
  displayName: string
  expiresAt: number
}

export class ChatRelayService {
  private readonly suppressionWindowMs: number
  private readonly autoRelayFailureCooldownMs: number

  // Tracks recently sent messages per target platform so echoed bot messages do not bounce back.
  private readonly suppressedInbound = new Map<Platform, SuppressionEntry[]>()
  // Recently displayed originals across ALL platforms. Lets us catch relayed
  // copies we did not send ourselves (StreamElements, Restream, ...) and tag
  // modes whose output carries no "[Platform]" marker.
  private readonly recentOriginals: RecentOriginal[] = []
  private readonly pausedAutoRelayTargets = new Map<Platform, { until: number; reason: string }>()

  private readonly handlePlatformEvent = (event: AnyStreamEvent) => {
    if (event.type !== 'chat') {
      return
    }

    if (isRelayFormattedEchoText(event.message, event.platform)) {
      markSuppressedChatRelayEcho(event)
      return
    }

    const normalizedText = normalizeRelayText(event.message)

    if (normalizedText.length > 0 && this.matchesSuppressedInbound(event.platform, normalizedText)) {
      markSuppressedChatRelayEcho(event)
      return
    }

    if (normalizedText.length > 0 && this.matchesRecentOriginal(event, normalizedText)) {
      markSuppressedChatRelayEcho(event)
      return
    }

    if (shouldSuppressStreamEventFromChat(event)) {
      return
    }

    this.rememberOriginal(event, normalizedText)
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
    this.recentOriginals.length = 0
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

    let entries = this.suppressedInbound.get(platform)
    if (!entries) {
      entries = []
      this.suppressedInbound.set(platform, entries)
    }
    entries.push({ text, expiresAt: now + this.suppressionWindowMs })
    if (entries.length > MAX_SUPPRESSIONS_PER_PLATFORM) {
      entries.splice(0, entries.length - MAX_SUPPRESSIONS_PER_PLATFORM)
    }
  }

  /**
   * True when `text` matches something we recently sent to `platform`.
   * Deliberately NOT consume-once: platforms can deliver the same sent
   * message more than once (reconnect replays, dual read paths), and each
   * copy must stay suppressed until the window expires. Matching tolerates
   * server-side truncation of what we sent.
   */
  private matchesSuppressedInbound(platform: Platform, text: string): boolean {
    const now = Date.now()
    this.cleanupExpiredSuppressions(now)

    const entries = this.suppressedInbound.get(platform)
    if (!entries) return false
    return entries.some((entry) => entry.expiresAt > now && relayTextsMatch(entry.text, text))
  }

  private forgetSuppression(platform: Platform, text: string): void {
    const entries = this.suppressedInbound.get(platform)
    if (!entries) return
    const remaining = entries.filter((entry) => entry.text !== text)
    if (remaining.length === 0) {
      this.suppressedInbound.delete(platform)
    } else {
      this.suppressedInbound.set(platform, remaining)
    }
  }

  private cleanupExpiredSuppressions(now: number): void {
    for (const [platform, entries] of this.suppressedInbound) {
      const remaining = entries.filter((entry) => entry.expiresAt > now)
      if (remaining.length === 0) {
        this.suppressedInbound.delete(platform)
      } else if (remaining.length !== entries.length) {
        this.suppressedInbound.set(platform, remaining)
      }
    }
  }

  private rememberOriginal(event: ChatEvent, normalizedText: string): void {
    if (normalizedText.length === 0) return
    const now = Date.now()
    this.pruneRecentOriginals(now)
    this.recentOriginals.push({
      platform: event.platform,
      text: normalizedText,
      displayName: htmlToSingleLinePlainText(event.user.displayName || '').toLowerCase(),
      expiresAt: now + this.suppressionWindowMs
    })
    if (this.recentOriginals.length > MAX_RECENT_ORIGINALS) {
      this.recentOriginals.splice(0, this.recentOriginals.length - MAX_RECENT_ORIGINALS)
    }
  }

  /**
   * Detects relayed COPIES of a message we already displayed, regardless of
   * who did the relaying — ilyStream's own auto-relay in any tag mode, or a
   * third-party bridge (StreamElements, Restream) writing "name: message"
   * into another platform's chat. A stripped "name:" prefix only counts when
   * the implied author lines up with the original's author, so ordinary
   * messages that happen to contain a colon are left alone.
   */
  private matchesRecentOriginal(event: ChatEvent, normalizedText: string): boolean {
    const now = Date.now()
    this.pruneRecentOriginals(now)
    if (this.recentOriginals.length === 0) return false

    const candidates = getRelayEchoCandidates(event.message)

    for (const original of this.recentOriginals) {
      if (original.platform === event.platform) continue
      if (original.expiresAt <= now) continue

      for (const candidate of candidates) {
        if (candidate.sourcePlatform && candidate.sourcePlatform !== original.platform) continue
        if (!relayTextsMatch(original.text, candidate.core)) continue
        if (candidate.displayName && !namesRoughlyMatch(candidate.displayName, original.displayName)) continue
        return true
      }

      // Undecorated exact duplicate on another platform inside the window —
      // a "message-only" relay. Long enough that coincidence is implausible.
      if (
        normalizedText.length >= MIN_UNDECORATED_DUPLICATE_LENGTH &&
        original.text === normalizedText
      ) {
        return true
      }
    }

    return false
  }

  private pruneRecentOriginals(now: number): void {
    let firstAlive = 0
    while (firstAlive < this.recentOriginals.length && this.recentOriginals[firstAlive].expiresAt <= now) {
      firstAlive += 1
    }
    if (firstAlive > 0) {
      this.recentOriginals.splice(0, firstAlive)
    }
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

function namesRoughlyMatch(guess: string, original: string): boolean {
  const left = guess.trim().toLowerCase()
  const right = original.trim().toLowerCase()
  if (!left || !right) return false
  if (left === right) return true
  // Relays truncate long display names — allow prefix matches with substance.
  return (left.length >= 4 && right.startsWith(left)) || (right.length >= 4 && left.startsWith(right))
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
