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
    lastUpdatedAt: null
  }
  private seenFollowKeys = new Set<string>()
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
    switch (event.type) {
      case 'like': {
        const platformTotal = Number.isFinite(event.totalLikes) && event.totalLikes > 0
          ? Math.floor(event.totalLikes)
          : null
        if (platformTotal !== null) {
          if (platformTotal > this.state.totalLikes) {
            this.state.totalLikes = platformTotal
          }
        } else {
          this.state.totalLikes += Math.max(1, Math.floor(event.likeCount || 1))
        }
        break
      }
      case 'gift':
        if (event.isCombo) return
        this.state.totalGiftCount += event.giftCount
        this.state.totalGiftValueCents += event.monetaryValue
        break
      case 'subscription':
        this.state.totalSubscriptions += 1
        break
      case 'follow': {
        const followKey = `${event.platform}:${(event.user?.username || event.user?.id || '').toLowerCase()}`
        if (!followKey.endsWith(':') && this.seenFollowKeys.has(followKey)) {
          return
        }
        if (!followKey.endsWith(':')) this.seenFollowKeys.add(followKey)
        this.state.totalFollows += 1
        break
      }
      case 'share':
        this.state.totalShares += 1
        break
      case 'raid':
        this.state.totalRaids += 1
        break
      case 'viewer-count':
        this.state.currentViewerCount = event.count
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
      lastUpdatedAt: null
    }
    this.seenFollowKeys.clear()
  }
}
