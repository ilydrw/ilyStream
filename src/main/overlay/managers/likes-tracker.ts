import type { LikeEvent } from '../../platforms/types'
import type { OverlayFeedItem } from '../../../shared/overlay'
import type { SSEManager } from '../sse-manager'
import type { LikesTrackerUser } from '../types'

export class LikesTracker {
  private users = new Map<string, LikesTrackerUser>()
  private totalLikes = 0
  private platformLikes = new Map<string, number>()
  private recentEventSignatures: string[] = []
  private recentEventSignatureSet = new Set<string>()
  private sse: SSEManager
  private readonly maxRecentEventSignatures = 500

  constructor(sse: SSEManager) {
    this.sse = sse
  }

  getSnapshot(): { totalLikes: number; users: LikesTrackerUser[] } {
    return {
      totalLikes: this.totalLikes,
      users: Array.from(this.users.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 50)
    }
  }

  updateState(event: LikeEvent, feedItem: OverlayFeedItem): (OverlayFeedItem & { totalLikes: number }) | null {
    if (this.hasSeenEventSignature(this.getEventSignature(event, feedItem))) return null

    const amount = Math.max(1, Math.floor(event.likeCount || feedItem.amount || 1))
    const platformTotal = Number.isFinite(event.totalLikes) && event.totalLikes > 0
      ? Math.floor(event.totalLikes)
      : null

    const platform = (event.platform || feedItem.platform || 'unknown').toLowerCase()
    const previousPlatformLikes = this.platformLikes.get(platform) || 0
    let acceptedAmount = amount

    if (platformTotal !== null) {
      const platformDelta = Math.max(0, platformTotal - previousPlatformLikes)
      this.platformLikes.set(platform, Math.max(previousPlatformLikes, platformTotal))

      if (previousPlatformLikes > 0) {
        acceptedAmount = Math.min(amount, platformDelta)
      }
    } else {
      this.platformLikes.set(platform, (this.platformLikes.get(platform) || 0) + amount)
    }

    if (acceptedAmount <= 0) return null

    let totalPlatformLikes = 0
    for (const count of this.platformLikes.values()) {
      totalPlatformLikes += count
    }
    this.totalLikes = totalPlatformLikes

    const identity = event.user.username || event.user.id || feedItem.displayName || 'anonymous'
    const key = `${platform}:${identity}`.trim().toLowerCase()
    const existing = this.users.get(key) ?? {
      key,
      displayName: event.user.displayName || event.user.username || feedItem.displayName,
      profilePictureUrl: event.user.profilePictureUrl || feedItem.profilePictureUrl,
      count: 0
    }

    existing.displayName = event.user.displayName || event.user.username || existing.displayName
    existing.profilePictureUrl = event.user.profilePictureUrl || existing.profilePictureUrl
    existing.count += acceptedAmount
    this.users.set(key, existing)

    const result = {
      ...feedItem,
      displayName: existing.displayName,
      profilePictureUrl: existing.profilePictureUrl,
      amount: acceptedAmount,
      totalLikes: this.totalLikes
    }

    this.sse.broadcast('likes', { type: 'snapshot', payload: this.getSnapshot() })

    return result
  }

  reset(): void {
    this.users.clear()
    this.platformLikes.clear()
    this.recentEventSignatures = []
    this.recentEventSignatureSet.clear()
    this.totalLikes = 0
  }

  private getEventSignature(event: LikeEvent, feedItem: OverlayFeedItem): string | undefined {
    if (!event.id) return undefined
    const platform = (event.platform || feedItem.platform || 'unknown').toLowerCase()
    const user = event.user?.username || event.user?.id || feedItem.displayName || 'anonymous'
    const amount = Math.max(1, Math.floor(event.likeCount || feedItem.amount || 1))
    const total = Number.isFinite(event.totalLikes) && event.totalLikes > 0 ? Math.floor(event.totalLikes) : 0
    const packetStamp = total > 0 ? '' : getTimestampMs(event.timestamp)
    return `${event.id}:${platform}:${String(user).toLowerCase()}:${amount}:${total}:${packetStamp}`
  }

  private hasSeenEventSignature(signature: string | undefined): boolean {
    if (!signature) return false
    if (this.recentEventSignatureSet.has(signature)) return true

    this.recentEventSignatureSet.add(signature)
    this.recentEventSignatures.push(signature)

    while (this.recentEventSignatures.length > this.maxRecentEventSignatures) {
      const expired = this.recentEventSignatures.shift()
      if (expired) this.recentEventSignatureSet.delete(expired)
    }

    return false
  }
}

function getTimestampMs(timestamp: unknown): number | string {
  if (timestamp instanceof Date) return timestamp.getTime()
  const parsed = Date.parse(String(timestamp || ''))
  return Number.isFinite(parsed) ? parsed : ''
}
