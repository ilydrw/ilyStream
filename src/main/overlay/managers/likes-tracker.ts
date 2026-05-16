import type { LikeEvent } from '../../platforms/types'
import type { OverlayFeedItem } from '../../../shared/overlay'
import type { SSEManager } from '../sse-manager'
import type { LikesTrackerUser } from '../types'

export class LikesTracker {
  private users = new Map<string, LikesTrackerUser>()
  private totalLikes = 0
  private platformLikes = new Map<string, number>()
  private sse: SSEManager

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

  updateState(event: LikeEvent, feedItem: OverlayFeedItem): OverlayFeedItem & { totalLikes: number } {
    const amount = Math.max(1, Math.floor(event.likeCount || feedItem.amount || 1))
    const platformTotal = Number.isFinite(event.totalLikes) && event.totalLikes > 0
      ? Math.floor(event.totalLikes)
      : null

    const platform = event.platform?.toLowerCase() || 'unknown'

    if (platformTotal !== null) {
      this.platformLikes.set(platform, Math.max(this.platformLikes.get(platform) || 0, platformTotal))
    } else {
      this.platformLikes.set(platform, (this.platformLikes.get(platform) || 0) + amount)
    }

    let totalPlatformLikes = 0
    for (const count of this.platformLikes.values()) {
      totalPlatformLikes += count
    }
    this.totalLikes = totalPlatformLikes

    const key = `${event.platform}:${event.user.username || event.user.id || feedItem.displayName}`.toLowerCase()
    const existing = this.users.get(key) ?? {
      key,
      displayName: event.user.displayName || event.user.username || feedItem.displayName,
      profilePictureUrl: event.user.profilePictureUrl || feedItem.profilePictureUrl,
      count: 0
    }

    existing.displayName = event.user.displayName || event.user.username || existing.displayName
    existing.profilePictureUrl = event.user.profilePictureUrl || existing.profilePictureUrl
    existing.count += amount
    this.users.set(key, existing)

    const result = {
      ...feedItem,
      displayName: existing.displayName,
      profilePictureUrl: existing.profilePictureUrl,
      amount,
      totalLikes: this.totalLikes
    }

    this.sse.broadcast('likes', { type: 'snapshot', payload: this.getSnapshot() })

    return result
  }

  reset(): void {
    this.users.clear()
    this.platformLikes.clear()
    this.totalLikes = 0
  }
}
