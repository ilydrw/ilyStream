import type { ReactNode } from 'react'
import {IconHeart, IconGift, IconStar, IconUserPlus, IconShare, IconSwords, IconMessage, IconMusic, IconEye} from '@tabler/icons-react'
import type { GlobalStats } from '../../../shared/stats'
import { formatCurrency } from '../utils'

interface StatCardProps {
  icon: ReactNode
  label: string
  value: string
  accent: string
}

function StatCard({ icon, label, value, accent }: StatCardProps) {
  return (
    <div className="app-section-card glass !p-6 hover:border-white/10 transition-all group">
      <div className={`mb-3 transition-transform duration-300 ${accent}`}>{icon}</div>
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20 mb-1">{label}</div>
      <div className="text-xl font-black text-white tabular-nums leading-none truncate">{value}</div>
    </div>
  )
}

interface StatsMetricGridProps {
  global: GlobalStats
  activePlatformTab: string
}

export function StatsMetricGrid({ global, activePlatformTab }: StatsMetricGridProps) {
  const isRelevant = (key: string) => {
    if (activePlatformTab === 'all') return true
    // Logic from index.tsx moved here or passed down
    return true 
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-6 mb-16">
      {isRelevant('totalLikes') && <StatCard icon={<IconHeart size={20} />} label="Likes" value={global.totalLikes.toLocaleString()} accent="text-pink-400" />}
      {isRelevant('totalGifts') && <StatCard icon={<IconGift size={20} />} label="Gifts" value={global.totalGifts.toLocaleString()} accent="text-yellow-300" />}
      {isRelevant('totalGiftValueCents') && <StatCard icon={<IconGift size={20} />} label="Est. Revenue" value={formatCurrency(global.totalGiftValueCents)} accent="text-emerald-400" />}
      {isRelevant('totalSubscriptions') && <StatCard icon={<IconStar size={20} />} label="Subs" value={global.totalSubscriptions.toLocaleString()} accent="text-purple-400" />}
      {isRelevant('totalFollows') && <StatCard icon={<IconUserPlus size={20} />} label="Follows" value={global.totalFollows.toLocaleString()} accent="text-cyan-400" />}
      {isRelevant('totalShares') && <StatCard icon={<IconShare size={20} />} label="Shares" value={global.totalShares.toLocaleString()} accent="text-blue-400" />}
      {isRelevant('totalRaids') && <StatCard icon={<IconSwords size={20} />} label="Raids" value={global.totalRaids.toLocaleString()} accent="text-orange-400" />}
      <StatCard icon={<IconMessage size={20} />} label="Chats" value={global.totalChats.toLocaleString()} accent="text-white/80" />
      <StatCard icon={<IconMusic size={20} />} label="Songs" value={global.totalSongRequests.toLocaleString()} accent="text-green-400" />
      <StatCard icon={<IconEye size={20} />} label="Peak" value={global.peakViewerCount.toLocaleString()} accent="text-rose-400" />
    </div>
  )
}
