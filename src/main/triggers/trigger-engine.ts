import { EventEmitter } from 'events'
import { AnyStreamEvent, GiftEvent } from '../platforms/types'
import { TriggerRule } from './trigger-types'
import { TTSEngine } from '../tts/tts-engine'
import { AIService } from '../ai/ai-service'
import { ConditionEvaluator } from './engine/condition-evaluator'
import { ActionExecutor } from './engine/action-executor'
import { randomUUID } from 'crypto'
import type {
  AutomationActionReceipt,
  AutomationRunReceipt,
  AutomationRuleReceipt
} from '../../shared/automation-receipts'
import type { EventLabSimulationPayload } from '../../shared/event-lab'

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
    void this.processEvent(event)
  }

  private handleGiftDebounce(event: GiftEvent): void {
    if (event.isCombo) return

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
            void this.processEvent({
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

  private async processEvent(event: AnyStreamEvent): Promise<void> {
    const startedAt = new Date()
    const startedMs = Date.now()
    const receipt: AutomationRunReceipt = {
      id: randomUUID(),
      eventId: event.id,
      eventType: event.type,
      platform: event.platform,
      username: 'user' in event ? event.user.username : undefined,
      displayName: 'user' in event ? event.user.displayName : undefined,
      startedAt: startedAt.toISOString(),
      finishedAt: startedAt.toISOString(),
      durationMs: 0,
      ruleCount: this.rules.length,
      matchedRules: 0,
      blockedRules: 0,
      actionsAttempted: 0,
      actionsRan: 0,
      actionsSkipped: 0,
      actionsFailed: 0,
      rules: [],
      testPayload: createTestPayload(event)
    }

    for (const rule of this.rules) {
      const ruleStartedMs = Date.now()
      const platformMatched = rule.platforms.includes(event.platform)
      const conditions = rule.enabled && platformMatched
        ? rule.conditions.map((condition, index) => this.evaluator.evaluateCondition(condition, event, index))
        : []
      const allConditionsMatched = conditions.every((condition) => condition.passed)
      const cooldownReason = rule.enabled && platformMatched && allConditionsMatched
        ? this.getCooldownReason(rule, event)
        : null
      const actions: AutomationActionReceipt[] = []
      let matched = false
      let skipReason: string | undefined

      if (!rule.enabled) {
        skipReason = 'Rule is disabled.'
      } else if (!platformMatched) {
        skipReason = `Rule does not listen to ${event.platform}.`
      } else if (!allConditionsMatched) {
        skipReason = conditions.find((condition) => !condition.passed)?.detail || 'One or more conditions failed.'
      } else if (cooldownReason) {
        skipReason = cooldownReason
        receipt.blockedRules += 1
      } else {
        matched = true
        receipt.matchedRules += 1

        for (const [index, action] of rule.actions.entries()) {
          const actionStartedMs = Date.now()
          receipt.actionsAttempted += 1
          try {
            const result = await this.executor.execute(action, event)
            const actionReceipt: AutomationActionReceipt = {
              index,
              type: action.type,
              status: result.status,
              summary: result.summary,
              durationMs: Date.now() - actionStartedMs,
              error: result.reason
            }
            actions.push(actionReceipt)
            if (result.status === 'ran') receipt.actionsRan += 1
            if (result.status === 'skipped') receipt.actionsSkipped += 1
            if (result.status === 'failed') receipt.actionsFailed += 1
          } catch (error) {
            receipt.actionsFailed += 1
            actions.push({
              index,
              type: action.type,
              status: 'failed',
              summary: `Action ${action.type} failed`,
              durationMs: Date.now() - actionStartedMs,
              error: error instanceof Error ? error.message : 'Unknown action failure.'
            })
          }
        }

        this.setCooldown(rule, event)
      }

      const ruleReceipt: AutomationRuleReceipt = {
        ruleId: rule.id,
        ruleName: rule.name,
        enabled: rule.enabled,
        platformMatched,
        matched,
        blockedByCooldown: Boolean(cooldownReason),
        skipReason,
        durationMs: Date.now() - ruleStartedMs,
        conditions,
        actions
      }

      receipt.rules.push(ruleReceipt)
    }

    receipt.finishedAt = new Date().toISOString()
    receipt.durationMs = Date.now() - startedMs
    this.emit('receipt', receipt)
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
    return Boolean(this.getCooldownReason(rule, event))
  }

  private getCooldownReason(rule: TriggerRule, event: AnyStreamEvent): string | null {
    const now = Date.now()
    if (rule.cooldown > 0) {
      const lastFired = this.globalCooldowns.get(rule.id) || 0
      const remainingMs = rule.cooldown * 1000 - (now - lastFired)
      if (remainingMs > 0) return `Global cooldown has ${Math.ceil(remainingMs / 1000)}s remaining.`
    }
    if (rule.userCooldown > 0 && 'user' in event) {
      const key = `${rule.id}:${(event as any).user.username}`
      const lastFired = this.userCooldowns.get(key) || 0
      const remainingMs = rule.userCooldown * 1000 - (now - lastFired)
      if (remainingMs > 0) return `User cooldown has ${Math.ceil(remainingMs / 1000)}s remaining.`
    }
    return null
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

function createTestPayload(event: AnyStreamEvent): EventLabSimulationPayload {
  if (event.type === 'viewer-count') {
    return {
      platform: event.platform,
      type: 'viewer-count',
      viewerCount: event.count
    }
  }

  const user = 'user' in event ? event.user : undefined
  const base: EventLabSimulationPayload = {
    platform: event.platform,
    type: event.type as EventLabSimulationPayload['type'],
    username: user?.username,
    displayName: user?.displayName
  }

  switch (event.type) {
    case 'chat':
      return { ...base, type: 'chat', message: event.message }
    case 'gift':
      return {
        ...base,
        type: 'gift',
        giftName: event.giftName,
        giftId: event.giftId,
        giftCount: event.giftCount
      }
    case 'subscription':
      return {
        ...base,
        type: user?.isFanClubMember ? 'superfan' : 'subscription',
        months: event.months
      }
    case 'raid':
      return { ...base, type: 'raid', viewerCount: event.viewerCount }
    case 'like':
      return { ...base, type: 'like', likeCount: event.likeCount, totalLikes: event.totalLikes }
    case 'follow':
    case 'share':
    case 'join':
      return base
    default:
      return {
        platform: event.platform,
        type: 'chat',
        username: user?.username,
        displayName: user?.displayName,
        message: `Replay for ${event.type}`
      }
  }
}
