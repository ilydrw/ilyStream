/**
 * Stream metadata the user sets before going live — a shared title plus
 * per-platform categories. Applied at go-live time (and on demand while
 * live): Twitch via a Helix channel update, YouTube on the broadcast's video,
 * Kick via its channels PATCH, and TikTok by passing the title into its
 * prepare-live call.
 */
export interface BroadcastStreamInfo {
  title: string
  twitchCategoryId: string
  twitchCategoryName: string
  youtubeCategoryId: string
  kickCategoryId: string
  kickCategoryName: string
}

export const DEFAULT_BROADCAST_STREAM_INFO: BroadcastStreamInfo = {
  title: '',
  twitchCategoryId: '',
  twitchCategoryName: '',
  youtubeCategoryId: '',
  kickCategoryId: '',
  kickCategoryName: ''
}

export interface StreamCategory {
  id: string
  name: string
  boxArtUrl: string
}

/** @deprecated alias kept for readability at Twitch call sites. */
export type TwitchCategory = StreamCategory

/**
 * YouTube's assignable video categories are a fixed list (no search API
 * needed). Gaming first — it's the common case for stream overlays.
 */
export const YOUTUBE_CATEGORIES: Array<{ id: string; name: string }> = [
  { id: '20', name: 'Gaming' },
  { id: '24', name: 'Entertainment' },
  { id: '10', name: 'Music' },
  { id: '22', name: 'People & Blogs' },
  { id: '23', name: 'Comedy' },
  { id: '28', name: 'Science & Technology' },
  { id: '17', name: 'Sports' },
  { id: '27', name: 'Education' },
  { id: '26', name: 'Howto & Style' },
  { id: '25', name: 'News & Politics' },
  { id: '1', name: 'Film & Animation' },
  { id: '2', name: 'Autos & Vehicles' },
  { id: '15', name: 'Pets & Animals' },
  { id: '19', name: 'Travel & Events' },
  { id: '29', name: 'Nonprofits & Activism' }
]

export function normalizeBroadcastStreamInfo(value: unknown): BroadcastStreamInfo {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    title: String(record.title ?? '').slice(0, 140),
    twitchCategoryId: String(record.twitchCategoryId ?? '').trim(),
    twitchCategoryName: String(record.twitchCategoryName ?? '').trim(),
    youtubeCategoryId: String(record.youtubeCategoryId ?? '').trim(),
    kickCategoryId: String(record.kickCategoryId ?? '').trim(),
    kickCategoryName: String(record.kickCategoryName ?? '').trim()
  }
}

/** A named title/category combo — "variety night", "dev stream" — applied with one click. */
export interface StreamInfoPreset {
  id: string
  name: string
  info: BroadcastStreamInfo
}

export const MAX_STREAM_INFO_PRESETS = 20

export function normalizeStreamInfoPresets(value: unknown): StreamInfoPreset[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry) => entry && typeof entry === 'object')
    .slice(0, MAX_STREAM_INFO_PRESETS)
    .map((entry: any, index: number) => ({
      id: String(entry.id || `preset-${index + 1}`),
      name: String(entry.name ?? '').trim().slice(0, 60) || `Preset ${index + 1}`,
      info: normalizeBroadcastStreamInfo(entry.info)
    }))
}
