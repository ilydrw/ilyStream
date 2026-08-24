import { create } from 'zustand'
import type { Platform } from '../../main/platforms/types'

/**
 * A viewer identity observed during the current live session. This is not proof
 * that the person is still watching: platforms expose an authoritative audience
 * count, but only a partial roster and incomplete join/leave activity.
 */
export interface ViewerPresence {
  id: string // `${platform}:${username}`
  platform: Platform
  username: string
  displayName: string
  profilePictureUrl?: string
  isModerator?: boolean
  isSubscriber?: boolean
  isVip?: boolean
  isFanClub?: boolean
  isSuperFan?: boolean
  badges?: Array<{ id: string; name: string; imageUrl?: string }>
  firstSeenAt: number
  lastSeenAt: number
  lastActivityAt?: number
  lastRosterSeenAt?: number
  lastAction: string
}

export interface ViewerIdentityInput {
  username: string
  displayName?: string
  profilePictureUrl?: string
  isModerator?: boolean
  isSubscriber?: boolean
  isVip?: boolean
  isFanClub?: boolean
  isSuperFan?: boolean
  badges?: Array<{ id: string; name: string; imageUrl?: string }>
}

export interface ViewerRosterSnapshot {
  receivedAt: number
  viewerIds: string[]
}

export interface LiveViewerGroup {
  platform: Platform
  reportedCount?: number
  viewers: ViewerPresence[]
}

export interface LiveAudienceSnapshot {
  groups: LiveViewerGroup[]
  identifiedCount: number
  reportedTotal: number
  hasReportedTotal: boolean
}

/** Activity without a corresponding leave event is only useful briefly. */
export const ACTIVITY_PRESENCE_TTL_MS = 2 * 60 * 1000

/** Roster payloads are snapshots and must be refreshed to remain trustworthy. */
export const ROSTER_SNAPSHOT_TTL_MS = 90 * 1000

const PLATFORM_ORDER: Platform[] = ['tiktok', 'twitch', 'youtube', 'kick']

export interface RecordPresenceInput extends ViewerIdentityInput {
  platform: Platform
  action: string
}

interface LiveViewersStore {
  viewers: Record<string, ViewerPresence>
  rosterSnapshots: Partial<Record<Platform, ViewerRosterSnapshot>>
  recordPresence: (input: RecordPresenceInput) => void
  syncRoster: (platform: Platform, viewers: ViewerIdentityInput[]) => void
  clearPlatform: (platform: Platform) => void
  prune: (ttlMs?: number) => void
  clear: () => void
}

function viewerId(platform: Platform, username: string): string {
  return `${platform}:${username.toLowerCase()}`
}

function mergeViewer(
  existing: ViewerPresence | undefined,
  platform: Platform,
  input: ViewerIdentityInput,
  now: number
): ViewerPresence {
  const username = input.username.trim()
  return {
    id: viewerId(platform, username),
    platform,
    username,
    displayName: input.displayName?.trim() || existing?.displayName || username,
    profilePictureUrl: input.profilePictureUrl || existing?.profilePictureUrl,
    // Role flags are sticky for the live session because later payloads often
    // omit role metadata.
    isModerator: Boolean(input.isModerator || existing?.isModerator),
    isSubscriber: Boolean(input.isSubscriber || existing?.isSubscriber),
    isVip: Boolean(input.isVip || existing?.isVip),
    isFanClub: Boolean(input.isFanClub || existing?.isFanClub),
    isSuperFan: Boolean(input.isSuperFan || existing?.isSuperFan),
    badges: input.badges?.length ? input.badges : existing?.badges,
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastSeenAt: now,
    lastActivityAt: existing?.lastActivityAt,
    lastRosterSeenAt: existing?.lastRosterSeenAt,
    lastAction: existing?.lastAction ?? 'roster'
  }
}

function roleWeight(viewer: ViewerPresence): number {
  if (viewer.isModerator) return 4
  if (viewer.isSuperFan) return 3
  if (viewer.isFanClub || viewer.isSubscriber) return 2
  if (viewer.isVip) return 1
  return 0
}

function normalizeReportedCount(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.max(0, Math.floor(value))
}

/**
 * Reconciles partial viewer identities with the platform-reported audience.
 * The reported count controls cardinality; names are a freshness-ranked,
 * best-effort subset and can never imply more viewers than the platform reports.
 */
export function selectLiveAudience(
  viewers: Record<string, ViewerPresence>,
  rosterSnapshots: Partial<Record<Platform, ViewerRosterSnapshot>>,
  viewerCounts: Partial<Record<Platform, number>>,
  now = Date.now()
): LiveAudienceSnapshot {
  const reportedCounts = new Map<Platform, number>()
  for (const [platform, count] of Object.entries(viewerCounts)) {
    const normalized = normalizeReportedCount(count)
    if (normalized !== undefined) reportedCounts.set(platform as Platform, normalized)
  }

  const platforms = new Set<Platform>([
    ...PLATFORM_ORDER,
    ...(Object.keys(rosterSnapshots) as Platform[]),
    ...reportedCounts.keys(),
    ...Object.values(viewers).map((viewer) => viewer.platform)
  ])

  const groups: LiveViewerGroup[] = []
  for (const platform of platforms) {
    const reportedCount = reportedCounts.get(platform)
    const roster = rosterSnapshots[platform]
    const rosterIsFresh = Boolean(
      roster && now - roster.receivedAt <= ROSTER_SNAPSHOT_TTL_MS
    )
    const rosterPositions = new Map<string, number>()
    if (rosterIsFresh && roster) {
      roster.viewerIds.forEach((id, index) => rosterPositions.set(id, index))
    }

    const candidates = new Map<string, ViewerPresence>()
    for (const id of rosterPositions.keys()) {
      const viewer = viewers[id]
      if (viewer) candidates.set(id, viewer)
    }
    for (const viewer of Object.values(viewers)) {
      if (viewer.platform !== platform || !viewer.lastActivityAt) continue
      if (now - viewer.lastActivityAt <= ACTIVITY_PRESENCE_TTL_MS) {
        candidates.set(viewer.id, viewer)
      }
    }

    const ranked = [...candidates.values()].sort((a, b) => {
      const aRosterAt = rosterPositions.has(a.id) && roster ? roster.receivedAt : 0
      const bRosterAt = rosterPositions.has(b.id) && roster ? roster.receivedAt : 0
      const freshness =
        Math.max(b.lastActivityAt ?? 0, bRosterAt) -
        Math.max(a.lastActivityAt ?? 0, aRosterAt)
      if (freshness !== 0) return freshness

      const rosterOrder =
        (rosterPositions.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (rosterPositions.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      if (rosterOrder !== 0) return rosterOrder

      return roleWeight(b) - roleWeight(a) || a.displayName.localeCompare(b.displayName)
    })

    const visible =
      reportedCount === undefined ? ranked : ranked.slice(0, reportedCount)
    if (visible.length > 0 || (reportedCount ?? 0) > 0) {
      groups.push({ platform, reportedCount, viewers: visible })
    }
  }

  const identifiedCount = groups.reduce((sum, group) => sum + group.viewers.length, 0)
  const reportedTotal = [...reportedCounts.values()].reduce((sum, count) => sum + count, 0)

  return {
    groups,
    identifiedCount,
    reportedTotal,
    hasReportedTotal: reportedCounts.size > 0
  }
}

export const useLiveViewersStore = create<LiveViewersStore>((set) => ({
  viewers: {},
  rosterSnapshots: {},

  recordPresence: (input) =>
    set((state) => {
      const username = (input.username || '').trim()
      if (!username) return state
      const id = viewerId(input.platform, username)
      const existing = state.viewers[id]
      const now = Date.now()

      // Throttle churn from high-frequency events (TikTok like spam): if we just
      // saw this viewer and they bring nothing new, skip the state update so the
      // panel doesn't re-render on every like.
      if (existing && now - (existing.lastActivityAt ?? 0) < 2000) {
        const gainsRole =
          (input.isModerator && !existing.isModerator) ||
          (input.isSubscriber && !existing.isSubscriber) ||
          (input.isVip && !existing.isVip) ||
          (input.isFanClub && !existing.isFanClub) ||
          (input.isSuperFan && !existing.isSuperFan)
        const gainsAvatar = Boolean(input.profilePictureUrl && !existing.profilePictureUrl)
        if (!gainsRole && !gainsAvatar) return state
      }

      const next = mergeViewer(existing, input.platform, input, now)
      next.lastActivityAt = now
      next.lastAction = input.action

      return { viewers: { ...state.viewers, [id]: next } }
    }),

  syncRoster: (platform, roster) =>
    set((state) => {
      const now = Date.now()
      const nextViewers = { ...state.viewers }
      const viewerIds: string[] = []
      const seen = new Set<string>()

      for (const input of roster) {
        const username = (input.username || '').trim()
        if (!username) continue
        const id = viewerId(platform, username)
        if (seen.has(id)) continue
        seen.add(id)
        viewerIds.push(id)

        const next = mergeViewer(state.viewers[id], platform, input, now)
        next.lastRosterSeenAt = now
        nextViewers[id] = next
      }

      return {
        viewers: nextViewers,
        rosterSnapshots: {
          ...state.rosterSnapshots,
          [platform]: { receivedAt: now, viewerIds }
        }
      }
    }),

  clearPlatform: (platform) =>
    set((state) => {
      let viewersChanged = false
      const nextViewers: Record<string, ViewerPresence> = {}
      for (const [id, viewer] of Object.entries(state.viewers)) {
        if (viewer.platform === platform) viewersChanged = true
        else nextViewers[id] = viewer
      }

      if (!viewersChanged && !state.rosterSnapshots[platform]) return state
      const nextSnapshots = { ...state.rosterSnapshots }
      delete nextSnapshots[platform]
      return { viewers: nextViewers, rosterSnapshots: nextSnapshots }
    }),

  prune: (ttlMs = ACTIVITY_PRESENCE_TTL_MS) =>
    set((state) => {
      const now = Date.now()
      const cutoff = now - ttlMs
      let viewersChanged = false
      const nextViewers: Record<string, ViewerPresence> = {}
      for (const [id, viewer] of Object.entries(state.viewers)) {
        if (viewer.lastSeenAt >= cutoff) nextViewers[id] = viewer
        else viewersChanged = true
      }

      let snapshotsChanged = false
      const nextSnapshots = { ...state.rosterSnapshots }
      for (const [platform, snapshot] of Object.entries(state.rosterSnapshots)) {
        if (snapshot && now - snapshot.receivedAt > ROSTER_SNAPSHOT_TTL_MS) {
          delete nextSnapshots[platform as Platform]
          snapshotsChanged = true
        }
      }

      return viewersChanged || snapshotsChanged
        ? { viewers: nextViewers, rosterSnapshots: nextSnapshots }
        : state
    }),

  clear: () => set({ viewers: {}, rosterSnapshots: {} })
}))
