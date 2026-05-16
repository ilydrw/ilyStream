import type { AnyStreamEvent, ChatEvent } from '../../platforms/types'
import type { TriggerRule, Condition } from '../trigger-types'

export class ConditionEvaluator {
  evaluate(rule: TriggerRule, event: AnyStreamEvent): boolean {
    return rule.conditions.every((condition) => this.matchCondition(condition, event))
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
}

function isSafeRegexPattern(pattern: string): boolean {
  if (/\\[1-9]/.test(pattern)) return false
  if (/\(\?<?[=!]/.test(pattern)) return false
  if (/([+*?]|\{\d+,?\d*\})\s*([+*?]|\{)/.test(pattern)) return false
  if (/\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)(?:[+*]|\{\d+,?\d*\})/.test(pattern)) return false
  if (/\((?:[^()\\]|\\.)*\|(?:[^()\\]|\\.)*\)(?:[+*]|\{\d+,?\d*\})/.test(pattern)) return false
  return true
}
