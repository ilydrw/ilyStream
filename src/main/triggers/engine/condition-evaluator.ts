import type { AnyStreamEvent, ChatEvent } from '../../platforms/types'
import type { TriggerRule, Condition } from '../trigger-types'
import type { AutomationConditionReceipt } from '../../../shared/automation-receipts'

export class ConditionEvaluator {
  evaluate(rule: TriggerRule, event: AnyStreamEvent): boolean {
    return rule.conditions.every((condition) => this.matchCondition(condition, event))
  }

  evaluateCondition(condition: Condition, event: AnyStreamEvent, index: number): AutomationConditionReceipt {
    const passed = this.matchCondition(condition, event)
    return {
      index,
      type: condition.type,
      passed,
      summary: describeCondition(condition),
      detail: passed ? 'Condition matched.' : this.getFailureDetail(condition, event)
    }
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
        return event.type === 'gift' && (event as any).monetaryValue >= condition.value

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
            const badges = (user as any).badges || []
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
          case 'is_fan_club': return !!(user as any).isFanClubMember
          case 'is_team': return !!(user as any).isTeamMember
        }
        return false
      }
      default:
        return false
    }
  }

  private getEventMessage(event: AnyStreamEvent): string | null {
    if ('message' in event) return (event as ChatEvent).message
    return null
  }

  private getEventUser(event: AnyStreamEvent): any | null {
    if ('user' in event) return (event as any).user
    return null
  }

  private safeRegexTest(pattern: string, message: string, caseSensitive: boolean): boolean {
    if (pattern.length > 200 || message.length > 2000) return false
    if (!isSafeRegexPattern(pattern)) return false
    try {
      return new RegExp(pattern, caseSensitive ? '' : 'i').test(message)
    } catch {
      return false
    }
  }

  private getFailureDetail(condition: Condition, event: AnyStreamEvent): string {
    switch (condition.type) {
      case 'event_type':
        return `Event type was "${event.type}", expected "${condition.value}".`
      case 'keyword': {
        const message = this.getEventMessage(event)
        if (!message) return 'This event has no chat message to match.'
        if (condition.matchMode === 'regex' && !isSafeRegexPattern(condition.value)) {
          return 'Regex pattern was rejected by the safety filter.'
        }
        return `Message did not ${condition.matchMode.replace('_', ' ')} "${condition.value}".`
      }
      case 'gift_value_gte':
        return event.type === 'gift'
          ? `Gift value was ${(event as any).monetaryValue ?? 0} cents, below ${condition.value}.`
          : 'This event is not a gift.'
      case 'user_role': {
        const user = this.getEventUser(event)
        return user ? `User does not have the ${condition.value} role.` : 'This event has no user.'
      }
      case 'username': {
        const user = this.getEventUser(event)
        return user ? `Username "${user.username}" did not match "${condition.value}".` : 'This event has no user.'
      }
      case 'viewer_count_gte':
        return event.type === 'viewer-count'
          ? `Viewer count was ${(event as any).count ?? 0}, below ${condition.value}.`
          : 'This event is not a viewer-count update.'
      case 'user_status': {
        const user = this.getEventUser(event)
        return user ? `User does not satisfy ${condition.status.replace(/_/g, ' ')}.` : 'This event has no user.'
      }
    }
  }
}

function describeCondition(condition: Condition): string {
  switch (condition.type) {
    case 'event_type':
      return `Event type is ${condition.value}`
    case 'keyword':
      return `Message ${condition.matchMode.replace('_', ' ')} "${condition.value || '...'}"`
    case 'gift_value_gte':
      return `Gift value is at least ${condition.value} cents`
    case 'user_role':
      return `User is a ${condition.value}`
    case 'username':
      return `Username ${condition.matchMode} "${condition.value || '...'}"`
    case 'viewer_count_gte':
      return `Viewer count is at least ${condition.value}`
    case 'user_status':
      return `User status is ${condition.status.replace(/is_/g, '').replace(/_/g, ' ')}`
  }
}

function isSafeRegexPattern(pattern: string): boolean {
  if (/\\[1-9]/.test(pattern)) return false
  if (/\(\?<?[=!]/.test(pattern)) return false
  if (/([+*?]|\{\d+,?\d*\})\s*([+*?]|\{)/.test(pattern)) return false
  if (/\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)(?:[+*]|\{\d+,?\d*\})/.test(pattern)) return false
  if (/\((?:[^()\\]|\\.)*\|(?:[^()\\]|\\.)*\)(?:[+*]|\{\d+,?\d*\})/.test(pattern)) return false
  return true
}
