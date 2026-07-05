import type { LikeEvent } from '../../platforms/types'
import type { OverlayFeedItem } from '../../../shared/overlay'
import type { SSEManager } from '../sse-manager'
import type { LikesTrackerUser } from '../types'

export class LikesTracker {
  private users = new Map<string, LikesTrackerUser>()
  private totalLikes = 0
  private platformSessionLikes = new Map<string, number>()
  private platformBaselines = new Map<string, number>()
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
    const previousPlatformLikes = this.platformSessionLikes.get(platform) || 0
    let acceptedAmount = amount

    if (platformTotal !== null) {
      const baseline = this.getPlatformBaseline(platform, platformTotal, amount)
      const platformSessionTotal = Math.max(0, platformTotal - baseline)
      const platformDelta = Math.max(0, platformSessionTotal - previousPlatformLikes)

      if (platformDelta <= 0) return null

      acceptedAmount = Math.min(amount, platformDelta)
      this.platformSessionLikes.set(platform, platformSessionTotal)
    } else {
      this.platformSessionLikes.set(platform, previousPlatformLikes + amount)
    }

    if (acceptedAmount <= 0) return null

    let totalPlatformLikes = 0
    for (const count of this.platformSessionLikes.values()) {
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
    this.platformSessionLikes.clear()
    this.platformBaselines.clear()
    this.recentEventSignatures = []
    this.recentEventSignatureSet.clear()
    this.totalLikes = 0
  }

  private getPlatformBaseline(platform: string, platformTotal: number, amount: number): number {
    const existing = this.platformBaselines.get(platform)
    if (existing !== undefined && platformTotal >= existing) return existing

    const baseline = Math.max(0, platformTotal - amount)
    this.platformBaselines.set(platform, baseline)
    if (existing !== undefined && platformTotal < existing) {
      this.platformSessionLikes.set(platform, 0)
    }
    return baseline
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
