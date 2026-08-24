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
const CHAT_EVENT_DEDUP_WINDOW_MS = 10 * 60 * 1000
const MAX_RECENT_CHAT_EVENT_IDS = 2_000
const DEFAULT_MAX_PENDING_AUTO_RELAYS_PER_TARGET = 2
const DEFAULT_AUTO_RELAY_MAX_AGE_MS = 15_000
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

interface PendingAutoRelay {
  text: string
  enqueuedAt: number
}

interface AutoRelayTargetQueue {
  draining: boolean
  pending: PendingAutoRelay[]
}

export class ChatRelayService {
  private readonly suppressionWindowMs: number
  private readonly autoRelayFailureCooldownMs: number
  private readonly maxPendingAutoRelaysPerTarget: number
  private readonly autoRelayMaxAgeMs: number

  // Tracks recently sent messages per target platform so echoed bot messages do not bounce back.
  private readonly suppressedInbound = new Map<Platform, SuppressionEntry[]>()
  // Recently displayed originals across ALL platforms. Lets us catch relayed
  // copies we did not send ourselves (StreamElements, Restream, ...) and tag
  // modes whose output carries no "[Platform]" marker.
  private readonly recentOriginals: RecentOriginal[] = []
  // Connector reconnects can replay the same platform message. Keep its stable
  // ID long enough to stop a replay from becoming another outbound relay.
  private readonly recentChatEventIds = new Map<string, number>()
  // Auto relays are real-time conversation, not a durable delivery queue. A
  // slow target gets a small, fresh backlog instead of minutes of old chat.
  private readonly autoRelayTargetQueues = new Map<Platform, AutoRelayTargetQueue>()
  private readonly pausedAutoRelayTargets = new Map<Platform, { until: number; reason: string }>()
  private disposed = false

  private readonly handlePlatformEvent = (event: AnyStreamEvent) => {
    if (event.type !== 'chat') {
      return
    }

    if (this.isDuplicateChatEvent(event)) {
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
    this.handleChatEvent(event)
  }

  constructor(
    private readonly platformManager: PlatformManager,
    private readonly getSettings: () => AppSettings,
    options: {
      suppressionWindowMs?: number
      autoRelayFailureCooldownMs?: number
      maxPendingAutoRelaysPerTarget?: number
      autoRelayMaxAgeMs?: number
    } = {}
  ) {
    this.suppressionWindowMs = options.suppressionWindowMs ?? 90_000
    this.autoRelayFailureCooldownMs = options.autoRelayFailureCooldownMs ?? DEFAULT_AUTO_RELAY_FAILURE_COOLDOWN_MS
    this.maxPendingAutoRelaysPerTarget = Math.max(
      1,
      options.maxPendingAutoRelaysPerTarget ?? DEFAULT_MAX_PENDING_AUTO_RELAYS_PER_TARGET
    )
    this.autoRelayMaxAgeMs = Math.max(0, options.autoRelayMaxAgeMs ?? DEFAULT_AUTO_RELAY_MAX_AGE_MS)
    this.platformManager.on('event', this.handlePlatformEvent)
  }

  dispose(): void {
    this.disposed = true
    this.platformManager.off('event', this.handlePlatformEvent)
    this.suppressedInbound.clear()
    this.recentOriginals.length = 0
    this.recentChatEventIds.clear()
    this.autoRelayTargetQueues.clear()
    this.pausedAutoRelayTargets.clear()
  }

  async sendManualMessage(
    platforms: Platform[],
    text: string
  ): Promise<PlatformChatSendResult[]> {
    return this.sendToPlatforms(platforms, htmlToSingleLinePlainText(text))
  }

  private handleChatEvent(event: ChatEvent): void {
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
        message: event.message,
        emotes: event.emotes
      },
      settings.chatRelayTagMode
    )

    if (normalizeRelayText(relayText).length === 0) {
      return
    }

    for (const target of targets) {
      this.enqueueAutoRelay(target, relayText)
    }
  }

  private enqueueAutoRelay(platform: Platform, text: string): void {
    if (this.disposed) return

    let queue = this.autoRelayTargetQueues.get(platform)
    if (!queue) {
      queue = { draining: false, pending: [] }
      this.autoRelayTargetQueues.set(platform, queue)
    }

    if (queue.pending.length >= this.maxPendingAutoRelaysPerTarget) {
      queue.pending.splice(0, queue.pending.length - this.maxPendingAutoRelaysPerTarget + 1)
    }
    queue.pending.push({ text, enqueuedAt: Date.now() })

    if (!queue.draining) {
      void this.drainAutoRelayQueue(platform, queue)
    }
  }

  private async drainAutoRelayQueue(platform: Platform, queue: AutoRelayTargetQueue): Promise<void> {
    queue.draining = true

    try {
      while (!this.disposed && queue.pending.length > 0) {
        const delivery = queue.pending.shift()
        if (!delivery) continue
        if (Date.now() - delivery.enqueuedAt > this.autoRelayMaxAgeMs) continue
        if (this.isAutoRelayTargetPaused(platform)) {
          queue.pending.length = 0
          return
        }

        let result: PlatformChatSendResult | undefined
        try {
          const results = await this.sendToPlatforms([platform], delivery.text)
          result = results[0]
        } catch (error) {
          result = {
            platform,
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          }
        }

        if (!result?.ok) {
          const error = result?.error || 'Unknown error'
          this.pauseAutoRelayTargetOnQuotaFailure(platform, error)
          // A failed real-time delivery invalidates the backlog. Future source
          // messages can try again after the target recovers, but old ones
          // must not burst out after a page reload or reconnect.
          queue.pending.length = 0
          console.warn(`[chat-relay] Auto relay failure: ${platform}: ${error}`)
          return
        }
      }
    } finally {
      queue.draining = false
      if (this.disposed) {
        queue.pending.length = 0
      } else if (queue.pending.length > 0) {
        void this.drainAutoRelayQueue(platform, queue)
      } else if (this.autoRelayTargetQueues.get(platform) === queue) {
        this.autoRelayTargetQueues.delete(platform)
      }
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

  private isDuplicateChatEvent(event: ChatEvent): boolean {
    const id = String(event.id || '').trim()
    if (!id) return false

    const now = Date.now()
    const key = `${event.platform}:${id}`
    const existingExpiry = this.recentChatEventIds.get(key)
    if (existingExpiry && existingExpiry > now) {
      return true
    }
    if (existingExpiry) {
      this.recentChatEventIds.delete(key)
    }

    if (this.recentChatEventIds.size >= MAX_RECENT_CHAT_EVENT_IDS) {
      for (const [candidate, expiresAt] of this.recentChatEventIds) {
        if (expiresAt <= now) {
          this.recentChatEventIds.delete(candidate)
        }
      }
    }

    while (this.recentChatEventIds.size >= MAX_RECENT_CHAT_EVENT_IDS) {
      const oldest = this.recentChatEventIds.keys().next().value as string | undefined
      if (!oldest) break
      this.recentChatEventIds.delete(oldest)
    }

    this.recentChatEventIds.set(key, now + CHAT_EVENT_DEDUP_WINDOW_MS)
    return false
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
