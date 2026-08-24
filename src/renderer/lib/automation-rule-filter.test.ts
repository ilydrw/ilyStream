import { describe, expect, it } from 'vitest'
import type { TriggerRule } from '../../main/triggers/trigger-types'
import { filterAutomationRules } from './automation-rule-filter'

const rules: TriggerRule[] = [
  {
    id: 'welcome',
    name: 'Welcome subscribers',
    enabled: true,
    platforms: ['twitch'],
    conditions: [
      { type: 'event_type', value: 'chat' },
      { type: 'user_role', value: 'subscriber' }
    ],
    actions: [{ type: 'tts', template: 'Welcome {username}' }],
    cooldown: 0,
    userCooldown: 30,
    sortOrder: 0
  },
  {
    id: 'gift',
    name: 'Large gift alert',
    enabled: false,
    platforms: ['tiktok'],
    conditions: [{ type: 'gift_value_gte', value: 1000 }],
    actions: [{
      type: 'show_alert',
      template: 'Thank you!',
      durationMs: 5000,
      animationIn: 'wave',
      animationOut: 'dissolve'
    }],
    cooldown: 10,
    userCooldown: 0,
    sortOrder: 1
  }
]

describe('automation rule filtering', () => {
  it('filters rules by active state without changing their order', () => {
    expect(filterAutomationRules(rules, '', 'active').map((rule) => rule.id)).toEqual(['welcome'])
    expect(filterAutomationRules(rules, '', 'paused').map((rule) => rule.id)).toEqual(['gift'])
  })

  it('matches names, platforms, conditions, and actions case-insensitively', () => {
    expect(filterAutomationRules(rules, 'WELCOME', 'all').map((rule) => rule.id)).toEqual(['welcome'])
    expect(filterAutomationRules(rules, 'tiktok', 'all').map((rule) => rule.id)).toEqual(['gift'])
    expect(filterAutomationRules(rules, 'subscriber speak', 'all').map((rule) => rule.id)).toEqual(['welcome'])
    expect(filterAutomationRules(rules, 'gift alert', 'all').map((rule) => rule.id)).toEqual(['gift'])
  })

  it('combines search and status filters', () => {
    expect(filterAutomationRules(rules, 'gift', 'active')).toEqual([])
    expect(filterAutomationRules(rules, 'gift', 'paused').map((rule) => rule.id)).toEqual(['gift'])
  })
})
