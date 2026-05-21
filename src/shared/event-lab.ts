import type { Platform } from '../main/platforms/types'
import type { OverlayChannel } from '../main/overlay/types'

export type EventLabTestEventType =
  | 'chat'
  | 'gift'
  | 'subscription'
  | 'superfan'
  | 'follow'
  | 'raid'
  | 'like'
  | 'share'
  | 'join'
  | 'viewer-count'

export interface EventLabSimulationPayload {
  platform?: Platform
  type: EventLabTestEventType
  username?: string
  displayName?: string
  message?: string
  giftName?: string
  giftId?: string
  giftCount?: number
  likeCount?: number
  totalLikes?: number
  viewerCount?: number
  months?: number
  suppressSound?: boolean
}

export interface EventLabOverlayBroadcast {
  channel: OverlayChannel
  payload: unknown
  clientCount: number
  at: string
}

export interface EventLabDeviceBroadcast {
  type: string
  payload: unknown
  clientCount: number
  at: string
}
