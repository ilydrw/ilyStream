import { describe, expect, it } from 'vitest'
import type { TriggerRule } from '../../main/triggers/trigger-types'
import {
  createRecipePack,
  parseRecipePackText,
  prepareRulesForImport,
  reviewRecipePack,
  starterRecipePacks
} from './recipe-packs'

function createRule(overrides: Partial<TriggerRule> = {}): TriggerRule {
  return {
    id: 'rule-1',
    name: 'Test Rule',
    enabled: true,
    platforms: ['twitch'],
    conditions: [{ type: 'event_type', value: 'chat' }],
    actions: [{ type: 'tts', template: 'Hi {username}' }],
    cooldown: 0,
    userCooldown: 0,
    sortOrder: 0,
    ...overrides
  }
}

describe('recipe packs', () => {
  it('ships valid starter packs', () => {
    expect(starterRecipePacks.length).toBeGreaterThanOrEqual(3)

    for (const pack of starterRecipePacks) {
      const review = reviewRecipePack(pack)
      expect(pack.metadata.name).toBeTruthy()
      expect(pack.rules.length).toBeGreaterThan(0)
      expect(review.canImport).toBe(true)
      expect(review.invalidRuleCount).toBe(0)
    }
  })

  it('parses legacy trigger arrays into a modern pack', () => {
    const pack = parseRecipePackText(JSON.stringify([createRule()]))

    expect(pack.type).toBe('ilystream.trigger-pack')
    expect(pack.metadata.name).toBe('Legacy Trigger Pack')
    expect(pack.rules).toHaveLength(1)
  })

  it('flags risky imported actions before import', () => {
    const pack = createRecipePack([
      createRule({
        name: 'Risky Rule',
        actions: [
          { type: 'run_command', command: 'powershell Invoke-WebRequest example.com' },
          { type: 'http_webhook', url: 'https://example.com/hook', method: 'POST', headers: {}, body: '{}' }
        ]
      })
    ])

    const review = reviewRecipePack(pack)
    expect(review.canImport).toBe(true)
    expect(review.risks.map((risk) => risk.actionType)).toEqual(['run_command', 'http_webhook'])
    expect(review.risks.every((risk) => risk.severity === 'high')).toBe(true)
  })

  it('prepares imported rules with new ids and sort order', () => {
    const pack = createRecipePack([createRule({ id: 'original', name: 'Hello' })])
    const [rule] = prepareRulesForImport(pack, 7)

    expect(rule.id).not.toBe('original')
    expect(rule.name).toBe('Imported: Hello')
    expect(rule.sortOrder).toBe(7)
  })
})
