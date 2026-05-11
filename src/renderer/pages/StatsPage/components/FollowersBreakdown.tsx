import { IconUserPlus, IconTrendingUp, IconTrendingDown, IconMinus } from '@tabler/icons-react'
import type { GlobalStats, PlatformStats } from '../../../../shared/stats'
import type { Platform } from '../../../../main/platforms/types'
import { PlatformLogo } from '../../../components/platforms/PlatformLogo'
import { formatRelativeTime } from '../utils'

const PLATFORM_ORDER: Platform[] = ['twitch', 'tiktok', 'youtube', 'kick']

const PLATFORM_LABEL: Record<Platform, string> = {
  twitch: 'Twitch',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  kick: 'Kick'
}

interface DeltaInfo {
  label: string
  tone: 'up' | 'down' | 'flat' | 'unknown'
}

function formatDelta(delta: number | null | undefined): DeltaInfo {
  if (delta === null || delta === undefined) return { label: '—', tone: 'unknown' }
  if (delta > 0) return { label: `+${delta.toLocaleString()}`, tone: 'up' }
  if (delta < 0) return { label: delta.toLocaleString(), tone: 'down' }
  return { label: '0', tone: 'flat' }
}

function DeltaPill({ delta, period }: { delta: number | null | undefined; period: string }) {
  const { label, tone } = formatDelta(delta)
  const toneClasses = {
    up: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    down: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    flat: 'text-white/50 bg-white/5 border-white/10',
    unknown: 'text-white/25 bg-white/5 border-white/10'
  }
  const Icon = tone === 'up' ? IconTrendingUp : tone === 'down' ? IconTrendingDown : IconMinus
  return (
    <div className={`px-2 py-1 rounded-md text-[10px] font-bold tracking-wide flex items-center gap-1 border ${toneClasses[tone]}`}>
      <Icon size={11} />
      <span className="tabular-nums">{label}</span>
      <span className="opacity-60 uppercase">{period}</span>
    </div>
  )
}

function PlatformFollowerCard({ platform, stats }: { platform: Platform; stats: PlatformStats }) {
  const count = stats.followerCount
  return (
    <div className="app-section-card glass !p-5 flex flex-col gap-3 min-h-[160px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PlatformLogo platform={platform} size={22} />
          <span className="text-xs font-bold uppercase tracking-wider text-white/70">{PLATFORM_LABEL[platform]}</span>
        </div>
        <IconUserPlus size={14} className="text-white/30" />
      </div>
      <div className="text-3xl font-black text-white tabular-nums leading-none">
        {count === null ? <span className="text-white/30 text-2xl">—</span> : count.toLocaleString()}
      </div>
      <div className="flex flex-wrap gap-1">
        <DeltaPill delta={stats.followerDelta24h} period="24h" />
        <DeltaPill delta={stats.followerDelta7d} period="7d" />
        <DeltaPill delta={stats.followerDelta30d} period="30d" />
      </div>
      <div className="text-[9px] font-bold uppercase tracking-widest text-white/30 mt-auto">
        {stats.followersLastSyncedAt
          ? `Synced ${formatRelativeTime(stats.followersLastSyncedAt)}`
          : 'Awaiting sync'}
      </div>
    </div>
  )
}

interface FollowersBreakdownProps {
  global: GlobalStats
}

export function FollowersBreakdown({ global }: FollowersBreakdownProps) {
  const total = PLATFORM_ORDER.reduce((sum, p) => {
    const c = global.byPlatform[p]?.followerCount
    return sum + (typeof c === 'number' ? c : 0)
  }, 0)
  const anyCount = PLATFORM_ORDER.some(p => global.byPlatform[p]?.followerCount !== null)

  return (
    <div className="mb-12">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-xs font-black uppercase tracking-[0.3em] text-white/40">Followers Across Platforms</h3>
        {anyCount && (
          <div className="text-[10px] font-bold uppercase tracking-widest text-white/30">
            Total: <span className="text-white/80 tabular-nums">{total.toLocaleString()}</span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {PLATFORM_ORDER.map((platform) => (
          <PlatformFollowerCard
            key={platform}
            platform={platform}
            stats={global.byPlatform[platform]}
          />
        ))}
      </div>
    </div>
  )
}
