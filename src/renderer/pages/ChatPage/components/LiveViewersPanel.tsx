import { useEffect, useMemo, type ReactNode } from 'react'
import { IconUsers } from '@tabler/icons-react'
import { Avatar } from '../../../components/ui/Avatar'
import { PlatformLogo } from '../../../components/platforms/PlatformLogo'
import { OfficialBadge } from '../../../components/badges/OfficialBadge'
import {
  selectLiveAudience,
  useLiveViewersStore,
  type ViewerPresence
} from '../../../stores/live-viewers-store'
import { useConnectionStore } from '../../../stores/connection-store'

const PLATFORM_LABEL: Record<string, string> = {
  tiktok: 'TikTok',
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick'
}
const PLATFORM_ACCENT: Record<string, string> = {
  tiktok: '#fe2c55',
  twitch: '#9146ff',
  youtube: '#ff3b3b',
  kick: '#53fc18'
}

function ViewerBadges({ viewer }: { viewer: ViewerPresence }) {
  const badges: ReactNode[] = []
  if (viewer.isModerator) {
    badges.push(<OfficialBadge key="mod" platform={viewer.platform} role="mod" size={15} />)
  }
  if (viewer.platform === 'tiktok' && (viewer.isFanClub || viewer.isSuperFan)) {
    badges.push(<OfficialBadge key="fc" platform="tiktok" role="member" size={15} />)
  }
  if (viewer.platform === 'tiktok' && viewer.isSuperFan) {
    badges.push(<OfficialBadge key="sf" platform="tiktok" role="superfan" size={15} />)
  }
  if (viewer.platform === 'twitch' && (viewer.isSubscriber || viewer.isFanClub)) {
    badges.push(<OfficialBadge key="sub" platform="twitch" role="member" size={15} />)
  }
  if (viewer.platform === 'youtube' && viewer.isSuperFan) {
    badges.push(<OfficialBadge key="yt" platform="youtube" role="superfan" size={15} />)
  }
  if (badges.length === 0) return null
  return <div className="flex shrink-0 items-center gap-1">{badges}</div>
}

export function LiveViewersPanel() {
  const viewers = useLiveViewersStore((s) => s.viewers)
  const rosterSnapshots = useLiveViewersStore((s) => s.rosterSnapshots)
  const prune = useLiveViewersStore((s) => s.prune)
  const viewerCounts = useConnectionStore((s) => s.viewerCounts)

  // Expire activity and roster snapshots that are no longer trustworthy.
  useEffect(() => {
    const timer = setInterval(() => prune(), 20_000)
    return () => clearInterval(timer)
  }, [prune])

  const audience = useMemo(
    () => selectLiveAudience(viewers, rosterSnapshots, viewerCounts),
    [rosterSnapshots, viewerCounts, viewers]
  )
  const headlineCount = audience.hasReportedTotal
    ? audience.reportedTotal
    : audience.identifiedCount

  return (
    <section className="app-section-card glass !flex h-full min-h-0 min-w-0 flex-col overflow-hidden !p-0">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.05] px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          <div>
            <h2 className="text-[13px] font-bold leading-none tracking-tight text-white">Live audience</h2>
            <p className="mt-1.5 text-[11px] font-medium leading-none text-white/35">
              {audience.identifiedCount.toLocaleString()} identified
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[22px] font-extrabold leading-none tabular-nums text-white">
            {headlineCount.toLocaleString()}
          </div>
          <div className="mt-1 text-[9px] font-semibold leading-none text-white/30">
            {audience.hasReportedTotal ? 'watching' : 'recently active'}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {audience.groups.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <IconUsers size={32} className="text-white/15" />
            <p className="text-xs font-medium text-white/30">No live audience yet</p>
            <p className="text-[11px] text-white/20">Identifiable viewers appear as platforms report them.</p>
          </div>
        ) : (
          audience.groups.map((group) => {
            const accent = PLATFORM_ACCENT[group.platform] ?? 'rgba(255,255,255,0.25)'
            return (
              <div key={group.platform}>
                <div
                  className="sticky top-0 z-10 flex items-center gap-2 border-b border-white/[0.05] bg-[#15171c]/95 px-4 py-2 backdrop-blur-sm"
                  style={{ boxShadow: `inset 3px 0 0 ${accent}` }}
                >
                  <PlatformLogo platform={group.platform} size={13} />
                  <span className="text-[11px] font-bold text-white/55">
                    {PLATFORM_LABEL[group.platform] ?? group.platform}
                  </span>
                  <span className="ml-auto rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold tabular-nums text-white/50">
                    {group.reportedCount === undefined
                      ? `${group.viewers.length.toLocaleString()} active`
                      : `${group.reportedCount.toLocaleString()} watching`}
                  </span>
                </div>

                {group.viewers.length === 0 ? (
                  <div className="px-4 py-4 text-center text-[11px] text-white/25">
                    Viewer names are unavailable from this platform.
                  </div>
                ) : (
                  group.viewers.map((viewer) => (
                    <div
                      key={viewer.id}
                      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.03]"
                    >
                      <Avatar url={viewer.profilePictureUrl} name={viewer.displayName} size="md" />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white/90">
                        {viewer.displayName}
                      </span>
                      <ViewerBadges viewer={viewer} />
                    </div>
                  ))
                )}
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
