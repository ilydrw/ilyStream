import type { IncomingMessage, ServerResponse } from 'http'
import type { OverlayAlertItem, OverlayFeedItem, OverlayGoalState, OverlayRuntimeStatus } from '../../shared/overlay'

export type OverlayChannel =
  | 'chat'
  | 'chat-unified'
  | 'alerts'
  | 'goals'
  | 'now-playing'
  | 'follower-goal'
  | 'text'
  | 'socials'
  | 'screen-border'
  | 'camera-frame'
  | 'brb-screen'
  | 'event-particles'
  | 'falling-roses'
  | 'gift-overlays'
  | 'particles'
  | 'discord-promo'
  | 'discord-call'
  | 'node-network'
  | 'latest-gifter'
  | 'physics'
  | 'deck'
  | 'leaderboard'
  | 'timer'
  | 'likes'

export const OVERLAY_CHANNELS: readonly OverlayChannel[] = [
  'chat', 'chat-unified', 'alerts', 'goals', 'now-playing', 'follower-goal',
  'text', 'socials', 'screen-border', 'camera-frame', 'brb-screen',
  'event-particles', 'falling-roses', 'gift-overlays', 'particles',
  'discord-promo', 'discord-call', 'node-network', 'latest-gifter', 'physics',
  'deck', 'leaderboard', 'timer', 'likes'
]

const OVERLAY_CHANNEL_SET = new Set<OverlayChannel>(OVERLAY_CHANNELS)

export function isOverlayChannel(value: unknown): value is OverlayChannel {
  return typeof value === 'string' && OVERLAY_CHANNEL_SET.has(value as OverlayChannel)
}

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
export const SSE_EVENT_HISTORY_LIMIT = 120
export const DEFAULT_PORT = 8899
