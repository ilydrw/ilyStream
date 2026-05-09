import { EventEmitter } from 'events'
import { AnyStreamEvent, ChatEvent, GiftEvent } from '../platforms/types'
import { TriggerRule, Condition, Action, AIRespondAction } from './trigger-types'
import { TTSEngine } from '../tts/tts-engine'
import { AIService } from '../ai/ai-service'

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;'
}

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]!)
}

export class TriggerEngine extends EventEmitter {
  private rules: TriggerRule[] = []
  private globalCooldowns: Map<string, number> = new Map()
  private userCooldowns: Map<string, number> = new Map()
  private ttsEngine: TTSEngine
  private aiService: AIService
  private giftDebouncers: Map<string, { timer: NodeJS.Timeout; totalCount: number; totalValue: number; latestEvent: GiftEvent }> = new Map()

  constructor(ttsEngine: TTSEngine, aiService: AIService) {
    super()
    this.ttsEngine = ttsEngine
    this.aiService = aiService
  }

  /** Load rules from database */
  loadRules(rules: TriggerRule[]): void {
    this.rules = [...rules].sort((a, b) => a.sortOrder - b.sortOrder)
  }

  /** Evaluate all rules against an incoming event */
  evaluate(event: AnyStreamEvent): void {
    if (event.type === 'gift') {
      this.handleGiftDebounce(event as GiftEvent)
      return
    }

    this.processEvent(event)
  }

  private handleGiftDebounce(event: GiftEvent): void {
    const key = `${event.platform}:${event.user.username}:${event.giftId}`
    const existing = this.giftDebouncers.get(key)

    if (existing) {
      clearTimeout(existing.timer)
      existing.totalCount += event.giftCount
      existing.totalValue += event.monetaryValue
      existing.latestEvent = event
    } else {
      this.giftDebouncers.set(key, {
        totalCount: event.giftCount,
        totalValue: event.monetaryValue,
        latestEvent: event,
        timer: setTimeout(() => {
          const buffered = this.giftDebouncers.get(key)
          if (buffered) {
            this.giftDebouncers.delete(key)
            const finalEvent: GiftEvent = {
              ...buffered.latestEvent,
              giftCount: buffered.totalCount,
              monetaryValue: buffered.totalValue,
              isCombo: false
            }
            this.processEvent(finalEvent)
          }
        }, 2000)
      })
    }
  }

  private processEvent(event: AnyStreamEvent): void {
    for (const rule of this.rules) {
      if (!rule.enabled) continue
      if (!rule.platforms.includes(event.platform)) continue
      if (!this.matchesConditions(rule, event)) continue
      if (this.isOnCooldown(rule, event)) continue

      this.executeActions(rule, event)
      this.setCooldown(rule, event)
    }
  }

  /** CRUD operations */
  addRule(rule: TriggerRule): void {
    this.rules.push(rule)
    this.rules.sort((a, b) => a.sortOrder - b.sortOrder)
  }

  updateRule(rule: TriggerRule): void {
    const idx = this.rules.findIndex((r) => r.id === rule.id)
    if (idx === -1) {
      this.rules.push(rule)
    } else {
      this.rules[idx] = rule
    }

    this.rules.sort((a, b) => a.sortOrder - b.sortOrder)
  }

  removeRule(id: string): void {
    this.rules = this.rules.filter((r) => r.id !== id)
  }

  getRules(): TriggerRule[] {
    return [...this.rules]
  }

  // --- Condition matching ---

  private matchesConditions(rule: TriggerRule, event: AnyStreamEvent): boolean {
    return rule.conditions.every((condition) =>
      this.matchCondition(condition, event)
    )
  }

  private matchCondition(condition: Condition, event: AnyStreamEvent): boolean {
    switch (condition.type) {
      case 'event_type':
        return event.type === condition.value

      case 'keyword': {
        const message = this.getEventMessage(event)
        if (!message) return false
        const text = condition.caseSensitive ? message : message.toLowerCase()
        const value = condition.caseSensitive ? condition.value : condition.value.toLowerCase()

        switch (condition.matchMode) {
          case 'exact': return text === value
          case 'contains': return text.includes(value)
          case 'starts_with': return text.startsWith(value)
          case 'regex': return this.safeRegexTest(condition.value, message, condition.caseSensitive)
        }
        return false
      }

      case 'gift_value_gte':
        return event.type === 'gift' && (event as GiftEvent).monetaryValue >= condition.value

      case 'user_role': {
        const user = this.getEventUser(event)
        if (!user) return false
        switch (condition.value) {
          case 'moderator': return user.isModerator
          case 'subscriber': return user.isSubscriber
          case 'vip': return user.isVip
        }
        return false
      }

      case 'username': {
        const user = this.getEventUser(event)
        if (!user) return false
        const uname = user.username.toLowerCase()
        const value = condition.value.toLowerCase()
        return condition.matchMode === 'exact' ? uname === value : uname.includes(value)
      }

      case 'viewer_count_gte':
        return event.type === 'viewer-count' && (event as any).count >= condition.value

      case 'user_status': {
        const user = this.getEventUser(event)
        if (!user) return false
        
        switch (condition.status) {
          case 'is_super_fan': {
            // Super fans are users with specific premium badges or high levels
            const badges = user.badges || []
            const badgeText = badges.map((b: any) => `${b.id} ${b.name}`).join(' ').toLowerCase()
            return (
              badgeText.includes('superfan') ||
              badgeText.includes('top gifter') || 
              badgeText.includes('level 20') || 
              badgeText.includes('level 30') ||
              badgeText.includes('level 40') ||
              badgeText.includes('level 50') ||
              user.isVip
            )
          }
          case 'is_fan_club': return !!user.isFanClubMember
          case 'is_team': return !!user.isTeamMember
        }
        return false
      }
    }
  }

  // --- Action execution ---

  private executeActions(rule: TriggerRule, event: AnyStreamEvent): void {
    for (const action of rule.actions) {
      this.executeAction(action, event)
    }
  }

  private executeAction(action: Action, event: AnyStreamEvent): void {
    switch (action.type) {
      case 'tts': {
        const speechMessage =
          event.type === 'chat' ? this.ttsEngine.prepareChatSpeechMessage(event as ChatEvent) : null
        if (event.type === 'chat' && !speechMessage) return

        const text = action.template
          ? this.fillTemplate(action.template, event, speechMessage ?? undefined)
          : speechMessage || this.getEventMessage(event) || ''
        const user = this.getEventUser(event)
        this.ttsEngine.enqueue({
          text,
          username: user?.username || '',
          platform: event.platform,
          priority: 'high',
          voiceProfileId: action.voiceProfileId,
          eventType: event.type
        })
        break
      }

      case 'play_sound':
        this.emit('action:play-sound', action, event)
        break

      case 'show_alert': {
        const alertHtml = this.fillTemplateHtml(action.template, event)
        this.emit('action:show-alert', { ...action, template: alertHtml, imageUrl: action.imageUrl }, event)
        break
      }

      case 'http_webhook':
        this.executeWebhook(action, event)
        break

      case 'run_command':
        this.emit('action:run-command', action, event)
        break

      case 'obs_set_scene':
      case 'obs_set_source_visibility':
      case 'obs_toggle_source_visibility':
        this.emit('action:obs-control', action, event)
        break

      case 'ai_respond':
        this.executeAIRespond(action, event)
        break

      case 'voicemod_voice':
      case 'voicemod_sound':
        this.emit('action:voicemod', action, event)
        break

      case 'vtube_expression':
      case 'vtube_animation':
      case 'vtube_throw':
        this.emit('action:vtube', action, event)
        break

      case 'discord_embed':
        this.executeDiscordEmbed(action, event)
        break

      case 'physics_spawn':
        this.emit('action:physics', action, event)
        break
    }
  }

  private async executeDiscordEmbed(action: Action & { type: 'discord_embed' }, event: AnyStreamEvent): Promise<void> {
    const settings = (this as any)._settings // We might need to pass settings or use a callback
    // For now, emit it so Orchestrator can handle it with access to DB/Settings
    this.emit('action:discord', action, event)
  }

  private async executeAIRespond(action: AIRespondAction, event: AnyStreamEvent): Promise<void> {
    const user = this.getEventUser(event)
    const speechMessage =
      event.type === 'chat' ? this.ttsEngine.prepareChatSpeechMessage(event as ChatEvent) : null
    if (event.type === 'chat' && !speechMessage) return

    const message = speechMessage || this.getEventMessage(event) || '(no message)'
    
    const responseText = await this.aiService.generateResponse(message, {
      username: user?.username || 'Unknown',
      platform: event.platform
    })

    if (action.output === 'chat' || action.output === 'both') {
      this.emit('action:send-chat', {
        platform: event.platform,
        message: responseText
      })
    }

    if (action.output === 'tts' || action.output === 'both') {
      this.ttsEngine.enqueue({
        text: responseText,
        username: 'AI Assistant',
        platform: event.platform,
        priority: 'high',
        voiceProfileId: action.voiceProfileId,
        eventType: 'chat'
      })
    }
  }

  private async executeWebhook(action: Action & { type: 'http_webhook' }, event: AnyStreamEvent): Promise<void> {
    try {
      const body = this.fillTemplate(action.body, event)
      await fetch(action.url, {
        method: action.method,
        headers: { 'Content-Type': 'application/json', ...action.headers },
        body: action.method !== 'GET' ? body : undefined
      })
    } catch (error) {
      console.error('[triggers] Webhook failed:', error)
    }
  }

  // --- Cooldown management ---

  private isOnCooldown(rule: TriggerRule, event: AnyStreamEvent): boolean {
    const now = Date.now()

    // Global cooldown
    if (rule.cooldown > 0) {
      const lastFired = this.globalCooldowns.get(rule.id) || 0
      if (now - lastFired < rule.cooldown * 1000) return true
    }

    // Per-user cooldown
    if (rule.userCooldown > 0) {
      const user = this.getEventUser(event)
      if (user) {
        const key = `${rule.id}:${user.username}`
        const lastFired = this.userCooldowns.get(key) || 0
        if (now - lastFired < rule.userCooldown * 1000) return true
      }
    }

    return false
  }

  private setCooldown(rule: TriggerRule, event: AnyStreamEvent): void {
    const now = Date.now()
    this.globalCooldowns.set(rule.id, now)

    const user = this.getEventUser(event)
    if (user) {
      this.userCooldowns.set(`${rule.id}:${user.username}`, now)
    }

    // Prune stale entries if the maps are growing large
    if (this.globalCooldowns.size > 500 || this.userCooldowns.size > 2000) {
      this.pruneExpiredCooldowns()
    }
  }

  // --- Helpers ---

  private getEventMessage(event: AnyStreamEvent): string | null {
    if ('message' in event) return (event as ChatEvent).message
    return null
  }

  private getEventUser(event: AnyStreamEvent): any | null {
    if ('user' in event) return (event as any).user
    return null
  }

  private safeRegexTest(pattern: string, message: string, caseSensitive: boolean): boolean {
    if (pattern.length > 500) return false
    try {
      return new RegExp(pattern, caseSensitive ? '' : 'i').test(message)
    } catch {
      return false
    }
  }

  /** Fill template with plain-text substitutions (TTS, webhook body). */
  private fillTemplate(template: string, event: AnyStreamEvent, messageOverride?: string): string {
    const user = this.getEventUser(event)
    let text = template
      .replace(/\{username\}/g, user?.displayName || user?.username || 'Unknown')
      .replace(/\{displayName\}/g, user?.displayName || user?.username || 'Unknown')
      .replace(/\{message\}/g, messageOverride ?? this.getEventMessage(event) ?? '')
      .replace(/\{platform\}/g, event.platform)
      .replace(/\{event_type\}/g, event.type)

    if (event.type === 'gift') {
      text = text
        .replace(/\{giftName\}/g, event.giftName || 'Gift')
        .replace(/\{giftCount\}/g, String(event.giftCount || 1))
        .replace(/\{amount\}/g, String((event.monetaryValue || 0) / 100))
    }

    if (event.type === 'subscription') {
      text = text
        .replace(/\{tier\}/g, event.tier || 'Superfan')
        .replace(/\{months\}/g, String(event.months || 1))
    }

    return text
  }

  /**
   * Fill template with HTML-escaped substitutions (alert HTML templates).
   * User-provided values (username, message) are escaped to prevent XSS.
   */
  private fillTemplateHtml(template: string, event: AnyStreamEvent): string {
    const user = this.getEventUser(event)
    const esc = escapeHtml
    let text = template
      .replace(/\{username\}/g, esc(user?.displayName || user?.username || 'Unknown'))
      .replace(/\{displayName\}/g, esc(user?.displayName || user?.username || 'Unknown'))
      .replace(/\{message\}/g, esc(this.getEventMessage(event) || ''))
      .replace(/\{platform\}/g, esc(event.platform))
      .replace(/\{event_type\}/g, esc(event.type))

    if (event.type === 'gift') {
      text = text
        .replace(/\{giftName\}/g, esc(event.giftName || 'Gift'))
        .replace(/\{giftCount\}/g, esc(String(event.giftCount || 1)))
        .replace(/\{amount\}/g, esc(String((event.monetaryValue || 0) / 100)))
    }

    if (event.type === 'subscription') {
      text = text
        .replace(/\{tier\}/g, esc(event.tier || 'Superfan'))
        .replace(/\{months\}/g, esc(String(event.months || 1)))
    }

    return text
  }

  private pruneExpiredCooldowns(): void {
    const maxAgeMs = 86_400_000 // 24 hours — no trigger cooldown should exceed this
    const cutoff = Date.now() - maxAgeMs
    for (const [key, ts] of this.globalCooldowns) {
      if (ts < cutoff) this.globalCooldowns.delete(key)
    }
    for (const [key, ts] of this.userCooldowns) {
      if (ts < cutoff) this.userCooldowns.delete(key)
    }
  }
}
