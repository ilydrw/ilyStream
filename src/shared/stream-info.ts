/**
 * Stream metadata the user sets before going live — a shared title plus the
 * Twitch category. Applied at go-live time: Twitch via a Helix channel update,
 * YouTube and TikTok by passing the title into their prepare-live calls.
 * Kick has no user-token OAuth wired up yet, so it is not covered here.
 */
export interface BroadcastStreamInfo {
  title: string
  twitchCategoryId: string
  twitchCategoryName: string
}

export const DEFAULT_BROADCAST_STREAM_INFO: BroadcastStreamInfo = {
  title: '',
  twitchCategoryId: '',
  twitchCategoryName: ''
}

export interface TwitchCategory {
  id: string
  name: string
  boxArtUrl: string
}

export function normalizeBroadcastStreamInfo(value: unknown): BroadcastStreamInfo {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    title: String(record.title ?? '').slice(0, 140),
    twitchCategoryId: String(record.twitchCategoryId ?? '').trim(),
    twitchCategoryName: String(record.twitchCategoryName ?? '').trim()
  }
}
