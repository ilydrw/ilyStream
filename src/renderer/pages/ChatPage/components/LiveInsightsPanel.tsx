import { IconCash, IconClock, IconEye, IconGift, IconHeart, IconShare3, IconStar } from '@tabler/icons-react'
import { useMemo, type ReactNode } from 'react'
import { PlatformLogo } from '../../../components/platforms/PlatformLogo'
import { useConnectionStore } from '../../../stores/connection-store'
import { useLiveInsightsStore } from '../../../stores/live-insights-store'

interface LiveInsightsPanelProps {
  now: number
}

export function LiveInsightsPanel({ now }: LiveInsightsPanelProps) {
  const startedAt = useLiveInsightsStore((s) => s.startedAt)
  const revenueCents = useLiveInsightsStore((s) => s.revenueCents)
  const giftCount = useLiveInsightsStore((s) => s.giftCount)
  const subscriptionCount = useLiveInsightsStore((s) => s.subscriptionCount)
  const followCount = useLiveInsightsStore((s) => s.followCount)
  const shareCount = useLiveInsightsStore((s) => s.shareCount)
  const likeCount = useLiveInsightsStore((s) => s.likeCount)
  const peakViewers = useLiveInsightsStore((s) => s.peakViewers)
  const latestGift = useLiveInsightsStore((s) => s.latestGift)
  const viewerCounts = useConnectionStore((s) => s.viewerCounts)

  const currentViewers = useMemo(
    () => Object.values(viewerCounts).reduce((sum, count) => sum + (count || 0), 0),
    [viewerCounts]
  )
  const uptime = startedAt ? formatDuration(Math.max(0, now - startedAt)) : 'Not live'
  const revenue = formatCurrency(revenueCents)
  const revenuePerHour = startedAt && now > startedAt
    ? formatCurrency(Math.round(revenueCents / Math.max((now - startedAt) / 3_600_000, 1 / 60)))
    : '$0.00'

  return (
    <section className="app-section-card glass !p-0 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.05] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-accent/25 bg-accent/10 text-accent">
            <IconStar size={19} />
          </div>
          <div>
            <h2 className="text-[13px] font-bold leading-none tracking-tight text-white">Live insights</h2>
            <p className="mt-1.5 text-[11px] font-medium leading-none text-white/35">Session since ilyStream connected.</p>
          </div>
        </div>
        <span className={`h-2 w-2 rounded-full ${startedAt ? 'bg-success shadow-[0_0_16px_rgba(34,197,94,0.8)]' : 'bg-white/20'}`} />
      </div>

      <div className="grid grid-cols-2 gap-px bg-white/[0.05]">
        <InsightTile icon={<IconClock size={15} />} label="Runtime" value={uptime} />
        <InsightTile icon={<IconCash size={15} />} label="Revenue" value={revenue} accent />
        <InsightTile icon={<IconGift size={15} />} label="Gifts" value={giftCount.toLocaleString()} />
        <InsightTile icon={<IconHeart size={15} />} label="Likes" value={compactNumber(likeCount)} />
        <InsightTile icon={<IconEye size={15} />} label="Peak / Now" value={`${Math.max(peakViewers, currentViewers).toLocaleString()} / ${currentViewers.toLocaleString()}`} />
        <InsightTile icon={<IconShare3 size={15} />} label="Follows / Shares" value={`${followCount.toLocaleString()} / ${shareCount.toLocaleString()}`} />
      </div>

      <div className="space-y-3 px-5 py-4">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-white/35">Revenue pace</span>
          <span className="font-extrabold tabular-nums text-white">{revenuePerHour}/hr</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-white/35">Subscriptions</span>
          <span className="font-extrabold tabular-nums text-white">{subscriptionCount.toLocaleString()}</span>
        </div>

        {latestGift ? (
          <div className="flex items-center gap-3 rounded-md border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
            <PlatformLogo platform={latestGift.platform} size={15} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-bold text-white">{latestGift.username}</p>
              <p className="mt-0.5 truncate text-[10px] font-semibold text-white/35">
                {latestGift.giftName} x{latestGift.count}
              </p>
            </div>
            <span className="text-[11px] font-extrabold tabular-nums text-accent">{formatCurrency(latestGift.valueCents)}</span>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-white/[0.07] px-3 py-3 text-center text-[11px] font-semibold text-white/25">
            No gifts recorded this session
          </div>
        )}
      </div>
    </section>
  )
}

function InsightTile({
  icon,
  label,
  value,
  accent = false
}: {
  icon: ReactNode
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="bg-[#171a20] px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-white/30">
        {icon}
        <span className="text-[9px] font-bold">{label}</span>
      </div>
      <div className={`text-[17px] font-extrabold leading-none tabular-nums ${accent ? 'text-accent' : 'text-white'}`}>
        {value}
      </div>
    </div>
  )
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`
  return `${minutes}:${pad(seconds)}`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Math.max(0, cents) / 100)
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(Math.max(0, value))
}
