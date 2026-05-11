import {IconChartBar} from '@tabler/icons-react'
import type { GlobalStats } from '../../../shared/stats'
import type { Platform } from '../../../main/platforms/types'
import { PlatformLogo } from '../../../components/platforms/PlatformLogo'
import { formatCurrency, formatRelativeTime } from '../utils'

const PLATFORMS: Platform[] = ['tiktok', 'twitch', 'youtube', 'kick']
const PLATFORM_LABELS: Record<Platform, string> = {
  tiktok: 'TikTok',
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick'
}

interface PlatformTelemetryProps {
  global: GlobalStats
  activePlatformTab: Platform | 'all'
  onTabChange: (tab: Platform | 'all') => void
  isRelevant: (platform: Platform | 'all', key: string) => boolean
}

function PlatformStatRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between py-0.5 pr-1">
      <span className="text-white/40 font-medium">{label}</span>
      <div className="flex items-baseline gap-2">
        {sub && <span className="text-[10px] text-white/20 font-mono">{sub}</span>}
        <span className="text-white font-bold font-mono tabular-nums pr-1">{value}</span>
      </div>
    </div>
  )
}

export function PlatformTelemetry({ global, activePlatformTab, onTabChange, isRelevant }: PlatformTelemetryProps) {
  return (
    <div className="app-section-card glass !border-none !bg-transparent !shadow-none !p-0">
      <div className="app-section-head !items-center !justify-between !p-0 border-none mb-8">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center text-accent">
            <IconChartBar size={32} />
          </div>
          <div>
            <h2>Network Telemetry</h2>
            <p>
              {global.uniqueUserCount.toLocaleString()} unique users tracked · last update {formatRelativeTime(global.lastUpdatedAt)}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5 p-1.5 bg-white/[0.03] border border-white/5 rounded-2xl">
          <button
            onClick={() => onTabChange('all')}
            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
              activePlatformTab === 'all' ? 'bg-accent text-white shadow-lg' : 'text-white/40 hover:text-white/70'
            }`}
          >
            All Platforms
          </button>
          {PLATFORMS.map(p => (
            <button
              key={p}
              onClick={() => onTabChange(p)}
              className={`p-2 rounded-xl transition-all flex items-center justify-center min-w-[44px] ${
                activePlatformTab === p ? 'bg-white/10 ring-1 ring-white/20' : 'opacity-40 hover:opacity-80'
              }`}
              title={PLATFORM_LABELS[p]}
            >
              <PlatformLogo platform={p} size={18} />
            </button>
          ))}
        </div>
      </div>

      <div className={`grid gap-10 ${
        activePlatformTab === 'all' ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4' : 'grid-cols-1'
      }`}>
        {PLATFORMS.filter(p => activePlatformTab === 'all' || activePlatformTab === p).map((p) => {
          const ps = global.byPlatform[p]
          return (
            <div key={p} className="app-section-card glass p-6 flex flex-col group">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-10 h-10 flex items-center justify-center">
                  <PlatformLogo platform={p} size={32} />
                </div>
                <div>
                  <span className="text-[11px] font-black uppercase tracking-widest text-white/90 leading-none block mb-1">{PLATFORM_LABELS[p]}</span>
                  <span className="text-[9px] text-white/30 font-black uppercase tracking-wider">{ps.uniqueUserCount.toLocaleString()} Active Users</span>
                </div>
              </div>
              <div className="space-y-4 text-sm bg-white/[0.02] rounded-xl p-4 border border-white/[0.05]">
                {isRelevant(p, 'totalLikes') && <PlatformStatRow label="Likes" value={ps.totalLikes.toLocaleString()} />}
                {isRelevant(p, 'totalGifts') && <PlatformStatRow label="Gifts" value={ps.totalGifts.toLocaleString()} sub={formatCurrency(ps.totalGiftValueCents)} />}
                {isRelevant(p, 'totalSubscriptions') && <PlatformStatRow label="Subs" value={ps.totalSubscriptions.toLocaleString()} />}
                {isRelevant(p, 'totalFollows') && <PlatformStatRow label="Follows" value={ps.totalFollows.toLocaleString()} />}
                {isRelevant(p, 'totalShares') && <PlatformStatRow label="Shares" value={ps.totalShares.toLocaleString()} />}
                {isRelevant(p, 'totalRaids') && <PlatformStatRow label="Raids" value={ps.totalRaids.toLocaleString()} />}
                <PlatformStatRow label="Chats" value={ps.totalChats.toLocaleString()} />
                <PlatformStatRow label="Songs" value={ps.totalSongRequests.toLocaleString()} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
