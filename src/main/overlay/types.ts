import type { IncomingMessage, ServerResponse } from 'http'
import type { OverlayAlertItem, OverlayFeedItem, OverlayGoalState, OverlayRuntimeStatus } from '../../shared/overlay'

export type OverlayChannel =
  | 'chat'
  | 'chat-unified'
  | 'alerts'
  | 'goals'
  | 'now-playing'
  | 'follower-goal'
  | 'socials'
  | 'screen-border'
  | 'event-particles'
  | 'falling-roses'
  | 'gift-overlays'
  | 'particles'
  | 'discord-promo'
  | 'node-network'
  | 'latest-gifter'
  | 'physics'
  | 'deck'
  | 'leaderboard'
  | 'timer'
  | 'likes'

export type SseClient = ServerResponse<IncomingMessage>

export interface LikesTrackerUser {
  key: string
  displayName: string
  profilePictureUrl?: string
  count: number
}

export const CHAT_HISTORY_LIMIT = 80
export const ALERT_HISTORY_LIMIT = 20
export const SSE_PING_INTERVAL_MS = 15000
export const DEFAULT_PORT = 8899
