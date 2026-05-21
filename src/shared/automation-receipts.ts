import type { Platform } from '../main/platforms/types'
import type { Action, Condition } from '../main/triggers/trigger-types'
import type { EventLabSimulationPayload } from './event-lab'

export type AutomationActionStatus = 'ran' | 'skipped' | 'failed'

export interface AutomationConditionReceipt {
  index: number
  type: Condition['type']
  passed: boolean
  summary: string
  detail?: string
}

export interface AutomationActionReceipt {
  index: number
  type: Action['type']
  status: AutomationActionStatus
  summary: string
  durationMs: number
  error?: string
}

export interface AutomationRuleReceipt {
  ruleId: string
  ruleName: string
  enabled: boolean
  platformMatched: boolean
  matched: boolean
  blockedByCooldown: boolean
  skipReason?: string
  durationMs: number
  conditions: AutomationConditionReceipt[]
  actions: AutomationActionReceipt[]
}

export interface AutomationRunReceipt {
  id: string
  eventId: string
  eventType: string
  platform: Platform
  username?: string
  displayName?: string
  startedAt: string
  finishedAt: string
  durationMs: number
  ruleCount: number
  matchedRules: number
  blockedRules: number
  actionsAttempted: number
  actionsRan: number
  actionsSkipped: number
  actionsFailed: number
  rules: AutomationRuleReceipt[]
  testPayload?: EventLabSimulationPayload
}
