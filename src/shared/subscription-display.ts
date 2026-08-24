export interface SubscriptionDisplayUser {
  id?: string
  username?: string
  displayName?: string
  profilePictureUrl?: string
  isModerator?: boolean
  isSubscriber?: boolean
  isVip?: boolean
  isFollower?: boolean
  isFanClubMember?: boolean
  isSuperFan?: boolean
  isTeamMember?: boolean
  badges?: unknown[]
}

export interface SubscriptionDisplayEvent {
  platform?: string
  tier?: unknown
  months?: unknown
  isGift?: boolean
  user?: SubscriptionDisplayUser
  gifterUser?: SubscriptionDisplayUser
  raw?: unknown
}

export interface SubscriptionFeedPresentation {
  user: SubscriptionDisplayUser
  message: string
}

const TWITCH_TIER_LABELS: Record<string, string> = {
  '1000': 'Tier 1',
  '2000': 'Tier 2',
  '3000': 'Tier 3',
  prime: 'Prime'
}

export function formatSubscriptionTier(platform: unknown, tier: unknown): string {
  const value = String(tier ?? '').trim()
  if (!value) return ''
  if (String(platform ?? '').toLowerCase() !== 'twitch') return value
  return TWITCH_TIER_LABELS[value.toLowerCase()] ?? value
}

export function resolveSubscriptionGifter(event: SubscriptionDisplayEvent): SubscriptionDisplayUser | undefined {
  if (userHasIdentity(event.gifterUser)) return event.gifterUser

  const raw = asRecord(event.raw)
  const username = cleanText(raw?.gifter)
  const displayName = cleanText(raw?.gifterDisplayName) || username
  const id = cleanText(raw?.gifterUserId)
  if (!username && !displayName && !id) return undefined

  return {
    id,
    username: username || displayName,
    displayName: displayName || username,
    isModerator: false,
    isSubscriber: false,
    isVip: false,
    badges: []
  }
}

export function getSubscriptionFeedPresentation(
  event: SubscriptionDisplayEvent
): SubscriptionFeedPresentation {
  const recipient = event.user ?? {}
  const tier = formatSubscriptionTier(event.platform, event.tier)

  if (event.isGift) {
    const recipientName = displayName(recipient, 'someone')
    const subscription = tier ? `${tier} subscription` : 'subscription'
    const gifter = resolveSubscriptionGifter(event)

    if (gifter) {
      return {
        user: gifter,
        message: `gifted ${recipientName} a ${subscription}`
      }
    }

    return {
      user: recipient,
      message: `received a ${subscription} from an anonymous gifter`
    }
  }

  const months = Number(event.months)
  return {
    user: recipient,
    message: `subscribed${tier ? ` at ${tier}` : ''}${months > 1 ? ` for ${months} months` : ''}`
  }
}

export function formatGiftSubscriptionAlert(event: SubscriptionDisplayEvent): string {
  const presentation = getSubscriptionFeedPresentation(event)
  const name = displayName(presentation.user, 'Someone')
  return `${name} ${presentation.message}!`
}

function displayName(user: SubscriptionDisplayUser, fallback: string): string {
  return cleanText(user.displayName) || cleanText(user.username) || fallback
}

function userHasIdentity(user: SubscriptionDisplayUser | undefined): user is SubscriptionDisplayUser {
  return Boolean(user && (cleanText(user.id) || cleanText(user.username) || cleanText(user.displayName)))
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
