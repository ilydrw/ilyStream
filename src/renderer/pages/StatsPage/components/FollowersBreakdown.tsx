import { useState } from 'react'
import type { GlobalStats, PlatformStats } from '../../../../shared/stats'
import type { Platform } from '../../../../main/platforms/types'
import { PlatformLogo } from '../../../components/platforms/PlatformLogo'
import { IconPencil, IconCheck, IconX } from '../../../components/ui/icons'
import { formatRelativeTime } from '../utils'

const PLATFORM_ORDER: Platform[] = ['twitch', 'tiktok', 'youtube', 'kick']

const PLATFORM_LABEL: Record<Platform, string> = {
  twitch: 'Twitch',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  kick: 'Kick',
  x: 'X',
  discord: 'Discord',
  facebook: 'Facebook',
  instagram: 'Instagram',
  restream: 'Restream',
  linkedin: 'LinkedIn',
  telegram: 'Telegram'
}

interface DeltaTileProps {
  delta: number | null | undefined
  period: '24h' | '7d' | '30d'
}

/**
 * Single 24h/7d/30d delta tile. Matches the design's FollowerCard
 * (page-stats.jsx VFOLLOWERS section): three equal-width tiles in a row,
 * each a small mat-thin pill with the delta number on top and a tiny mono
 * period label below.
 */
function DeltaTile({ delta, period }: DeltaTileProps) {
  const hasValue = typeof delta === 'number'
  const isUp = hasValue && delta! > 0
  const isDown = hasValue && delta! < 0
  const label = !hasValue
    ? '—'
    : isUp
      ? `+${delta!.toLocaleString()}`
      : delta!.toLocaleString()
  const color = !hasValue
    ? 'text-white/30'
    : isUp
      ? 'text-success'
      : isDown
        ? 'text-danger'
        : 'text-white/55'
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-[3px] rounded-md border border-white/[0.035] bg-white/[0.025] px-1 py-[5px]">
      <span className={`whitespace-nowrap text-[11px] font-semibold tabular-nums ${color}`}>{label}</span>
      <span className="font-mono text-[8px] uppercase tracking-[0.06em] text-white/30">{period}</span>
    </div>
  )
}

function PlatformFollowerCard({
  platform,
  stats,
  onSaved
}: {
  platform: Platform
  stats: PlatformStats
  onSaved?: () => void
}) {
  const count = stats.followerCount
  const isManual = stats.followerCountIsManual
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const startEdit = () => {
    setDraft(count !== null ? String(count) : '')
    setEditing(true)
  }

  const save = async () => {
    const n = parseInt(draft.replace(/[^0-9]/g, ''), 10)
    if (!Number.isFinite(n) || n < 0) { setEditing(false); return }
    setSaving(true)
    try {
      if (typeof window.api?.stats?.setFollowerCount !== 'function') {
        throw new Error('stats.setFollowerCount is unavailable — restart the app so the main process picks up the new IPC handler')
      }
      await window.api.stats.setFollowerCount(platform, n)
      setEditing(false)
      onSaved?.()
    } catch (err) {
      // Surface the failure instead of leaving the check button looking dead.
      console.error('[FollowersBreakdown] Failed to set follower count:', err)
    } finally {
      setSaving(false)
    }
  }

  // Status label: manual counts read differently from API-synced ones.
  const statusLabel = isManual
    ? 'Manual · tracking follows live'
    : stats.followersLastSyncedAt
      ? `Synced ${formatRelativeTime(stats.followersLastSyncedAt)}`
      : 'Awaiting sync'

  return (
    <div className="app-section-card group flex min-w-0 flex-col gap-3 p-4">
      {/* Head: platform glyph + label + status dot. The dot is success when
          we have follower data, muted otherwise (Kick awaiting-sync pattern
          from the design). */}
      <div className="flex items-center gap-2">
        <PlatformLogo platform={platform} size={16} />
        <span className="text-[13px] font-semibold tracking-tight text-white">
          {PLATFORM_LABEL[platform]}
        </span>
        {isManual && (
          <span className="rounded-full bg-accent/15 px-1.5 py-[1px] font-mono text-[8px] uppercase tracking-[0.06em] text-accent">
            Manual
          </span>
        )}
        <span className="flex-1" />
        {!editing && count !== null && (
          <button
            onClick={startEdit}
            title="Edit follower count"
            className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-accent transition-all"
          >
            <IconPencil size={13} />
          </button>
        )}
        <span
          className={`h-[7px] w-[7px] rounded-full ${
            count !== null ? 'bg-success shadow-[0_0_8px_rgba(52,199,89,0.5)]' : 'bg-white/25'
          }`}
        />
      </div>

      {/* Total — 26px tabular display for "stat-big" treatment. When the count
          is unknown the streamer can enter it (TikTok has no follower API); an
          inline editor handles both first-time entry and later corrections. */}
      {editing ? (
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            inputMode="numeric"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
            placeholder="0"
            className="h-9 w-full min-w-0 rounded-md border border-accent/40 bg-white/[0.04] px-2 text-[18px] font-semibold tabular-nums text-white outline-none"
          />
          <button
            onClick={save}
            disabled={saving}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-accent text-black hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            <IconCheck size={15} />
          </button>
          <button
            onClick={() => setEditing(false)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white/5 text-white/70 hover:bg-white/10 transition-colors"
          >
            <IconX size={15} />
          </button>
        </div>
      ) : count !== null ? (
        <span className="text-[26px] font-semibold leading-none tracking-tight text-white tabular-nums">
          {count.toLocaleString()}
        </span>
      ) : (
        <button
          onClick={startEdit}
          className="flex h-[26px] items-center gap-1.5 rounded-md text-[12px] font-semibold text-accent/80 hover:text-accent transition-colors"
        >
          <IconPencil size={12} />
          Set follower count
        </button>
      )}

      {/* 24h / 7d / 30d delta tiles in equal-width row. */}
      <div className="flex gap-[6px]">
        <DeltaTile delta={stats.followerDelta24h} period="24h" />
        <DeltaTile delta={stats.followerDelta7d} period="7d" />
        <DeltaTile delta={stats.followerDelta30d} period="30d" />
      </div>

      <span className="mt-auto font-mono text-[10px] tracking-tight text-white/30">{statusLabel}</span>
    </div>
  )
}

interface FollowersBreakdownProps {
  global: GlobalStats
  onChanged?: () => void
}

export function FollowersBreakdown({ global, onChanged }: FollowersBreakdownProps) {
  const total = PLATFORM_ORDER.reduce((sum, p) => {
    const c = global.byPlatform[p]?.followerCount
    return sum + (typeof c === 'number' ? c : 0)
  }, 0)
  const anyCount = PLATFORM_ORDER.some((p) => global.byPlatform[p]?.followerCount !== null)

  return (
    // Whole section spaced to sit between the metric grid and the
    // PlatformTelemetry block. The header uses the design's "eyebrow"
    // micro-label pattern: a left-side noun phrase + a right-side total.
    <section className="flex flex-col gap-[10px]">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] font-semibold text-white/40">
          Followers across platforms
        </span>
        {anyCount && (
          <span className="text-[11px] text-white/40">
            Total <span className="font-semibold text-white tabular-nums">{total.toLocaleString()}</span>
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PLATFORM_ORDER.map((platform) => (
          <PlatformFollowerCard key={platform} platform={platform} stats={global.byPlatform[platform]} onSaved={onChanged} />
        ))}
      </div>
    </section>
  )
}
