import type { TriggerRule } from '../../main/triggers/trigger-types'
import { describeAction, describeCondition } from './trigger-editor'

export type AutomationRuleStatusFilter = 'all' | 'active' | 'paused'

export function filterAutomationRules(
  rules: TriggerRule[],
  query: string,
  status: AutomationRuleStatusFilter
): TriggerRule[] {
  const terms = query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  return rules.filter((rule) => {
    if (status === 'active' && !rule.enabled) return false
    if (status === 'paused' && rule.enabled) return false
    if (terms.length === 0) return true

    const searchableText = [
      rule.name,
      ...rule.platforms,
      ...rule.conditions.map(describeCondition),
      ...rule.actions.map(describeAction)
    ].join(' ').toLocaleLowerCase()

    return terms.every((term) => searchableText.includes(term))
  })
}
