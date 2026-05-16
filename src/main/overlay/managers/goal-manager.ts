import type { AnyStreamEvent } from '../../platforms/types'
import type { OverlayGoalState } from '../../../shared/overlay'
import type { SSEManager } from '../sse-manager'
import type { DeviceApi } from '../device-api'

export class GoalManager {
  private state: OverlayGoalState = {
    totalLikes: 0,
    totalGiftCount: 0,
    totalGiftValueCents: 0,
    totalSubscriptions: 0,
    totalFollows: 0,
    totalShares: 0,
    totalRaids: 0,
    currentViewerCount: 0,
    twitchFollows: 0,
    twitchSubs: 0,
    tiktokFollows: 0,
    tiktokLikes: 0,
    tiktokGifts: 0,
    lastUpdatedAt: null
  }
  private seenFollowKeys = new Set<string>()
  private viewerCounts = new Map<string, number>()
  private platformLikes = new Map<string, number>()
  private sse: SSEManager
  private deviceApi: DeviceApi | null = null

  constructor(sse: SSEManager, deviceApi: DeviceApi | null) {
    this.sse = sse
    this.deviceApi = deviceApi
  }

  setDeviceApi(deviceApi: DeviceApi): void {
    this.deviceApi = deviceApi
  }

  getState(): OverlayGoalState {
    return { ...this.state }
  }

  handleEvent(event: AnyStreamEvent): void {
    const platform = event.platform?.toLowerCase() || 'unknown'

    switch (event.type) {
      case 'like': {
        const platformTotal = Number.isFinite(event.totalLikes) && event.totalLikes > 0
          ? Math.floor(event.totalLikes)
          : null

        const delta = Math.max(1, Math.floor(event.likeCount || 1))

        if (platformTotal !== null) {
          // If we got an absolute total from the platform, just use it
          this.platformLikes.set(platform, Math.max(this.platformLikes.get(platform) || 0, platformTotal))
        } else {
          // Otherwise, accumulate the delta
          this.platformLikes.set(platform, (this.platformLikes.get(platform) || 0) + delta)
        }

        let totalPlatformLikes = 0
        for (const count of this.platformLikes.values()) {
          totalPlatformLikes += count
        }
        this.state.totalLikes = totalPlatformLikes

        if (platform === 'tiktok') {
          // Just sync tiktokLikes to the platform specific counter
          this.state.tiktokLikes = this.platformLikes.get('tiktok') || 0
        }
        break
      }
      case 'gift':
        if (event.isCombo) return
        this.state.totalGiftCount += event.giftCount
        this.state.totalGiftValueCents += event.monetaryValue
        if (platform === 'tiktok') {
          this.state.tiktokGifts += event.giftCount
        }
        break
      case 'subscription':
        this.state.totalSubscriptions += 1
        if (platform === 'twitch') {
          this.state.twitchSubs += 1
        }
        break
      case 'follow': {
        const followKey = `${event.platform}:${(event.user?.username || event.user?.id || '').toLowerCase()}`
        if (!followKey.endsWith(':') && this.seenFollowKeys.has(followKey)) {
          return
        }
        if (!followKey.endsWith(':')) this.seenFollowKeys.add(followKey)
        this.state.totalFollows += 1

        if (platform === 'twitch') this.state.twitchFollows += 1
        if (platform === 'tiktok') this.state.tiktokFollows += 1
        break
      }
      case 'share':
        this.state.totalShares += 1
        break
      case 'raid':
        this.state.totalRaids += 1
        break
      case 'viewer-count':
        this.viewerCounts.set(platform, event.count)
        let totalViewers = 0
        for (const count of this.viewerCounts.values()) {
          totalViewers += count
        }
        this.state.currentViewerCount = totalViewers
        break
      default:
        return
    }

    this.state.lastUpdatedAt = new Date().toISOString()
    this.sse.broadcast('goals', { type: 'snapshot', payload: this.state })
    this.deviceApi?.broadcast('goals', this.state)
  }

  reset(): void {
    this.state = {
      totalLikes: 0,
      totalGiftCount: 0,
      totalGiftValueCents: 0,
      totalSubscriptions: 0,
      totalFollows: 0,
      totalShares: 0,
      totalRaids: 0,
      currentViewerCount: 0,
      twitchFollows: 0,
      twitchSubs: 0,
      tiktokFollows: 0,
      tiktokLikes: 0,
      tiktokGifts: 0,
      lastUpdatedAt: null
    }
    this.seenFollowKeys.clear()
    this.viewerCounts.clear()
    this.platformLikes.clear()
  }
}
