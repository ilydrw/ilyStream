import { EventEmitter } from 'events'
import { AnyStreamEvent, GiftEvent } from '../platforms/types'
import { TriggerRule } from './trigger-types'
import { TTSEngine } from '../tts/tts-engine'
import { AIService } from '../ai/ai-service'
import { ConditionEvaluator } from './engine/condition-evaluator'
import { ActionExecutor } from './engine/action-executor'

export class TriggerEngine extends EventEmitter {
  private rules: TriggerRule[] = []
  private globalCooldowns: Map<string, number> = new Map()
  private userCooldowns: Map<string, number> = new Map()
  
  private evaluator = new ConditionEvaluator()
  private executor: ActionExecutor
  private giftDebouncers: Map<string, { timer: NodeJS.Timeout; totalCount: number; totalValue: number; latestEvent: GiftEvent }> = new Map()

  constructor(ttsEngine: TTSEngine, aiService: AIService) {
    super()
    this.executor = new ActionExecutor(ttsEngine, aiService)
    this.setupForwarding()
  }

  private setupForwarding() {
    const events = [
      'play-sound', 'show-alert', 'run-command', 'obs-control', 
      'send-chat', 'voicemod', 'vtube', 'discord', 'physics'
    ]
    for (const event of events) {
      this.executor.on(event, (...args) => this.emit(`action:${event}`, ...args))
    }
  }

  loadRules(rules: TriggerRule[]): void {
    this.rules = [...rules].sort((a, b) => a.sortOrder - b.sortOrder)
  }

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
            this.processEvent({
              ...buffered.latestEvent,
              giftCount: buffered.totalCount,
              monetaryValue: buffered.totalValue,
              isCombo: false
            })
          }
        }, 2000)
      })
    }
  }

  private processEvent(event: AnyStreamEvent): void {
    for (const rule of this.rules) {
      if (!rule.enabled) continue
      if (!rule.platforms.includes(event.platform)) continue
      if (!this.evaluator.evaluate(rule, event)) continue
      if (this.isOnCooldown(rule, event)) continue

      for (const action of rule.actions) {
        void this.executor.execute(action, event)
      }
      this.setCooldown(rule, event)
    }
  }

  addRule(rule: TriggerRule): void {
    this.rules.push(rule)
    this.rules.sort((a, b) => a.sortOrder - b.sortOrder)
  }

  updateRule(rule: TriggerRule): void {
    const idx = this.rules.findIndex((r) => r.id === rule.id)
    if (idx === -1) this.rules.push(rule)
    else this.rules[idx] = rule
    this.rules.sort((a, b) => a.sortOrder - b.sortOrder)
  }

  removeRule(id: string): void {
    this.rules = this.rules.filter((r) => r.id !== id)
  }

  getRules(): TriggerRule[] {
    return [...this.rules]
  }

  private isOnCooldown(rule: TriggerRule, event: AnyStreamEvent): boolean {
    const now = Date.now()
    if (rule.cooldown > 0) {
      const lastFired = this.globalCooldowns.get(rule.id) || 0
      if (now - lastFired < rule.cooldown * 1000) return true
    }
    if (rule.userCooldown > 0 && 'user' in event) {
      const key = `${rule.id}:${(event as any).user.username}`
      const lastFired = this.userCooldowns.get(key) || 0
      if (now - lastFired < rule.userCooldown * 1000) return true
    }
    return false
  }

  private setCooldown(rule: TriggerRule, event: AnyStreamEvent): void {
    const now = Date.now()
    this.globalCooldowns.set(rule.id, now)
    if ('user' in event) {
      this.userCooldowns.set(`${rule.id}:${(event as any).user.username}`, now)
    }
    if (this.globalCooldowns.size > 500 || this.userCooldowns.size > 2000) {
      this.pruneExpiredCooldowns()
    }
  }

  private pruneExpiredCooldowns(): void {
    const cutoff = Date.now() - 86_400_000
    for (const [key, ts] of this.globalCooldowns) if (ts < cutoff) this.globalCooldowns.delete(key)
    for (const [key, ts] of this.userCooldowns) if (ts < cutoff) this.userCooldowns.delete(key)
  }
}
