import type { ReactNode } from 'react'
import { IconHeart, IconGift, IconStar, IconUserPlus, IconShare, IconSwords, IconMessage, IconMusic, IconCurrencyDollar, IconRobot } from '@tabler/icons-react'
import { IconEye } from '../../../components/ui/icons'
import type { GlobalStats } from '../../../../shared/stats'
import { formatCurrency } from '../utils'

/**
 * Stat card — Pro Console pattern from the design system's ViewerBody
 * (page-stats.jsx). Tinted 30px icon chip on top, mono uppercase eyebrow label,
 * tabular-num stat-big value. Matches the same visual cadence used elsewhere
 * (dashboard-metric-card, dashboard-hero-stat) so the Stats grid reads as
 * part of the same family rather than its own dialect.
 */
interface StatCardProps {
  icon: ReactNode
  label: string
  value: string
  /** A tint applied to the icon-chip background + icon foreground. CSS color expression. */
  tint: string
}

function StatCard({ icon, label, value, tint }: StatCardProps) {
  return (
    <div className="flex items-center gap-3.5 rounded-lg border border-white/[0.04] bg-[#0c0d12] p-4 shadow-sm">
      <div 
        className="flex h-[30px] w-[30px] items-center justify-center rounded-[6px]"
        style={{
          backgroundColor: `rgba(255, 255, 255, 0.03)`,
          border: '1px solid rgba(255, 255, 255, 0.05)',
          color: tint
        }}
      >
        {icon}
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] font-bold text-white/35">{label}</span>
        <div className="mt-0.5 text-[15px] font-extrabold text-white tabular-nums truncate leading-none">
          {value}
        </div>
      </div>
    </div>
  )
}

interface StatsMetricGridProps {
  global: GlobalStats
  activePlatformTab: string
}

export function StatsMetricGrid({ global }: StatsMetricGridProps) {
  return (
    // 5-up matches the design's ViewerBody grid; collapses on narrower widths.
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      <StatCard icon={<IconHeart size={16} />} label="Likes" value={global.totalLikes.toLocaleString()} tint="#F472B6" />
      <StatCard icon={<IconGift size={16} />} label="Gifts" value={global.totalGifts.toLocaleString()} tint="var(--accent)" />
      <StatCard icon={<IconCurrencyDollar size={16} />} label="Revenue" value={formatCurrency(global.totalGiftValueCents)} tint="var(--success)" />
      <StatCard icon={<IconStar size={16} />} label="Paid members" value={global.totalSubscriptions.toLocaleString()} tint="var(--warning)" />
      <StatCard icon={<IconUserPlus size={16} />} label="Follows" value={global.totalFollows.toLocaleString()} tint="var(--accent)" />
      <StatCard icon={<IconShare size={16} />} label="Shares" value={global.totalShares.toLocaleString()} tint="#22D3EE" />
      <StatCard icon={<IconSwords size={16} />} label="Raids" value={global.totalRaids.toLocaleString()} tint="var(--warning)" />
      <StatCard icon={<IconMessage size={16} />} label="Chats" value={global.totalChats.toLocaleString()} tint="var(--accent)" />
      <StatCard icon={<IconMusic size={16} />} label="Songs" value={global.totalSongRequests.toLocaleString()} tint="#A783FF" />
      <StatCard icon={<IconRobot size={16} />} label="AI Calls" value={(global.totalCohostCalls || 0).toLocaleString()} tint="#4ADE80" />
      <StatCard icon={<IconEye size={16} />} label="Peak" value={global.peakViewerCount.toLocaleString()} tint="var(--accent)" />
    </div>
  )
}
