import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  Heart,
  Gift,
  UserPlus,
  Star,
  Share2,
  Swords,
  MessageSquare,
  Music2,
  Eye,
  Users,
  RefreshCw,
  Trash2,
  Search
} from 'lucide-react'
import type { GlobalStats, UserStat, UserStatSortKey } from '../../../shared/stats'
import { EMPTY_GLOBAL_STATS } from '../../../shared/stats'
import type { Platform } from '../../../main/platforms/types'
import { Avatar } from '../../components/ui/Avatar'
import { TikTokHeartIcon } from '../../components/ui/TikTokHeartIcon'
import { PlatformLogo } from '../../components/platforms/PlatformLogo'

const PLATFORMS: Platform[] = ['tiktok', 'twitch', 'youtube', 'kick']

const PLATFORM_LABELS: Record<Platform, string> = {
  tiktok: 'TikTok',
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick'
}

interface SortColumn {
  key: UserStatSortKey
  label: string
  short: string
  format: (stat: UserStat) => string
}

const SORT_COLUMNS: SortColumn[] = [
  { key: 'totalLikes', label: 'Likes', short: 'Likes', format: (s) => s.totalLikes.toLocaleString() },
  { key: 'totalGifts', label: 'Gifts', short: 'Gifts', format: (s) => s.totalGifts.toLocaleString() },
  {
    key: 'totalGiftValueCents',
    label: 'Earnings',
    short: 'Value',
    format: (s) => formatCurrency(s.totalGiftValueCents)
  },
  { key: 'totalSubscriptions', label: 'Subs', short: 'Subs', format: (s) => s.totalSubscriptions.toLocaleString() },
  { key: 'totalFollows', label: 'Follows', short: 'Follows', format: (s) => s.totalFollows.toLocaleString() },
  { key: 'totalShares', label: 'Shares', short: 'Shares', format: (s) => s.totalShares.toLocaleString() },
  { key: 'totalRaids', label: 'Raids', short: 'Raids', format: (s) => s.totalRaids.toLocaleString() },
  { key: 'totalChats', label: 'Chats', short: 'Chats', format: (s) => s.totalChats.toLocaleString() },
  {
    key: 'totalSongRequests',
    label: 'Song requests',
    short: 'Songs',
    format: (s) => s.totalSongRequests.toLocaleString()
  }
]

function formatCurrency(cents: number): string {
  if (!cents) return '$0.00'
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms) || ms < 0) return 'just now'
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  const month = Math.floor(day / 30)
  if (month < 12) return `${month}mo ago`
  const yr = Math.floor(day / 365)
  return `${yr}y ago`
}

export default function StatsPage() {
  const [global, setGlobal] = useState<GlobalStats>(EMPTY_GLOBAL_STATS)
  const [users, setUsers] = useState<UserStat[]>([])
  const [sortBy, setSortBy] = useState<UserStatSortKey>('totalLikes')
  const [platform, setPlatform] = useState<Platform | 'all'>('all')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState<UserStat | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [activePlatformTab, setActivePlatformTab] = useState<Platform | 'all'>('all')

  // Debounce the search box so we don't spam IPC on every keystroke
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), 200)
    return () => clearTimeout(handle)
  }, [query])

  const loadAll = async () => {
    if (!window.api?.stats) return
    setLoading(true)
    try {
      const [g, u] = await Promise.all([
        window.api.stats.getGlobal(),
        window.api.stats.getTopUsers({ sortBy, platform, query: debouncedQuery, limit: 200 })
      ])
      setGlobal(g as GlobalStats)
      setUsers(u as UserStat[])
    } catch (err) {
      console.error('[Stats] Load failed', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // Light auto-refresh so the page reflects new events while you're watching it
    const interval = setInterval(loadAll, 10_000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, platform, debouncedQuery])

  const sortColumn = useMemo(
    () => SORT_COLUMNS.find((c) => c.key === sortBy) ?? SORT_COLUMNS[0],
    [sortBy]
  )

  const handleReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true)
      setTimeout(() => setConfirmReset(false), 4000)
      return
    }
    setConfirmReset(false)
    if (!window.api?.stats) return
    await window.api.stats.reset()
    setSelectedUser(null)
    await loadAll()
  }

  return (
    <div className="app-page">
      <header className="app-page-header">
        <div className="flex items-center gap-6">
          <div className="flex items-center justify-center">
            {activePlatformTab === 'all' ? (
              <BarChart3 size={32} className="text-accent" />
            ) : (
              <div className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl ring-1 ring-white/20">
                <PlatformLogo platform={activePlatformTab as Platform} size={28} />
              </div>
            )}
          </div>
          <div>
            <div className="app-header-eyebrow">
              <BarChart3 size={14} className="text-accent" />
              <span>Lifetime Telemetry</span>
            </div>
            <h1>Stream Stats</h1>
            <p className="app-page-intro">
              Lifetime totals across every platform you've connected — likes, gifts, follows, song requests, and more.
              Counters tick up live as new events arrive.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadAll}
            disabled={loading}
            className="app-button !h-10 !px-4 text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
            title="Refresh now"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={handleReset}
            className={`app-button !h-10 !px-4 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${
              confirmReset
                ? 'bg-danger/20 border-danger/40 text-danger'
                : 'text-white/40 hover:text-danger hover:border-danger/30'
            }`}
            title="Wipe all lifetime stats"
          >
            <Trash2 size={14} />
            {confirmReset ? 'Click again to confirm' : 'Reset stats'}
          </button>
        </div>
      </header>

      {/* Lifetime metric grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-6 mb-16">
        <StatCard icon={<Heart size={20} />} label="Likes" value={global.totalLikes.toLocaleString()} accent="text-pink-400" />
        <StatCard icon={<Gift size={20} />} label="Gifts" value={global.totalGifts.toLocaleString()} accent="text-yellow-300" />
        <StatCard icon={<Gift size={20} />} label="Est. Revenue" value={formatCurrency(global.totalGiftValueCents)} accent="text-emerald-400" />
        <StatCard icon={<Star size={20} />} label="Subs" value={global.totalSubscriptions.toLocaleString()} accent="text-purple-400" />
        <StatCard icon={<UserPlus size={20} />} label="Follows" value={global.totalFollows.toLocaleString()} accent="text-cyan-400" />
        <StatCard icon={<Share2 size={20} />} label="Shares" value={global.totalShares.toLocaleString()} accent="text-blue-400" />
        <StatCard icon={<Swords size={20} />} label="Raids" value={global.totalRaids.toLocaleString()} accent="text-orange-400" />
        <StatCard icon={<MessageSquare size={20} />} label="Chats" value={global.totalChats.toLocaleString()} accent="text-white/80" />
        <StatCard icon={<Music2 size={20} />} label="Songs" value={global.totalSongRequests.toLocaleString()} accent="text-green-400" />
        <StatCard icon={<Eye size={20} />} label="Peak" value={global.peakViewerCount.toLocaleString()} accent="text-rose-400" />
      </div>

      {/* Per-platform Nav */}
        <div className="app-section-card glass !border-none !bg-transparent !shadow-none !p-0">
          <div className="app-section-head !items-center !justify-between !p-0 border-none mb-8">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center text-accent">
                <BarChart3 size={32} />
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
                onClick={() => {
                  setActivePlatformTab('all')
                  setPlatform('all')
                }}
                className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${
                  activePlatformTab === 'all' ? 'bg-accent text-white shadow-lg' : 'text-white/40 hover:text-white/70'
                }`}
              >
                All Platforms
              </button>
              {PLATFORMS.map(p => (
                <button
                  key={p}
                  onClick={() => {
                    setActivePlatformTab(p)
                    setPlatform(p)
                  }}
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
                <div key={p} className="app-section-card glass flex flex-col group">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-10 h-10 flex items-center justify-center">
                      <PlatformLogo platform={p} size={32} />
                    </div>
                    <div>
                      <span className="text-[11px] font-black uppercase tracking-widest text-white/90 leading-none block mb-0.5">{PLATFORM_LABELS[p]}</span>
                      <span className="text-[9px] text-white/30 font-black uppercase tracking-tighter">{ps.uniqueUserCount} Active Users</span>
                    </div>
                  </div>
                  <div className="space-y-5 text-sm">
                    <PlatformStatRow label="Likes" value={ps.totalLikes.toLocaleString()} />
                    <PlatformStatRow label="Gifts" value={ps.totalGifts.toLocaleString()} sub={formatCurrency(ps.totalGiftValueCents)} />
                    <PlatformStatRow label="Subs" value={ps.totalSubscriptions.toLocaleString()} />
                    <PlatformStatRow label="Follows" value={ps.totalFollows.toLocaleString()} />
                    <PlatformStatRow label="Shares" value={ps.totalShares.toLocaleString()} />
                    <PlatformStatRow label="Raids" value={ps.totalRaids.toLocaleString()} />
                    <PlatformStatRow label="Chats" value={ps.totalChats.toLocaleString()} />
                    <PlatformStatRow label="Songs" value={ps.totalSongRequests.toLocaleString()} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      {/* Leaderboard + detail */}
      <section className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-12">
        <div className="app-section-card glass !p-0">
          <div className="app-section-head">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center text-accent">
                {activePlatformTab === 'all' ? (
                  <Users size={32} />
                ) : (
                  <div className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl ring-1 ring-white/20">
                    <PlatformLogo platform={activePlatformTab as Platform} size={28} />
                  </div>
                )}
              </div>
              <div>
                <h2>Top users</h2>
                <p>Sorted by {sortColumn.label.toLowerCase()} · click for breakdown</p>
              </div>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search users..."
                  className="pl-9 pr-3 py-2 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-white/80 placeholder:text-white/30 focus:outline-none focus:border-accent/40 w-44"
                />
              </div>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as Platform | 'all')}
                className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-white/80 focus:outline-none focus:border-accent/40"
              >
                <option value="all">All platforms</option>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {PLATFORM_LABELS[p]}
                  </option>
                ))}
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as UserStatSortKey)}
                className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-white/80 focus:outline-none focus:border-accent/40"
              >
                {SORT_COLUMNS.map((c) => (
                  <option key={c.key} value={c.key}>
                    Sort by {c.label.toLowerCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-white/30 border-b border-white/[0.04]">
                  <th className="text-left font-black px-6 py-3">#</th>
                  <th className="text-left font-black py-3">User</th>
                  <th className="text-left font-black py-3">Platform</th>
                  {SORT_COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      className={`text-right font-black py-3 px-3 cursor-pointer hover:text-white/70 ${
                        sortBy === c.key ? 'text-accent' : ''
                      }`}
                      onClick={() => setSortBy(c.key)}
                    >
                      {c.short}
                    </th>
                  ))}
                  <th className="text-right font-black py-3 pr-6">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5 + SORT_COLUMNS.length} className="text-center text-white/30 py-12 text-sm">
                      No users tracked yet — fire up a stream and let the events roll in.
                    </td>
                  </tr>
                )}
                {users.map((user, idx) => (
                  <tr
                    key={`${user.platform}:${user.username}`}
                    onClick={() => setSelectedUser(user)}
                    className={`border-b border-white/[0.02] cursor-pointer transition-colors ${
                      selectedUser?.username === user.username && selectedUser?.platform === user.platform
                        ? 'bg-accent/5'
                        : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <td className="px-6 py-3 text-white/30 font-mono">{idx + 1}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar url={user.profilePictureUrl} name={user.displayName} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-white font-semibold truncate">{user.displayName}</span>
                            {user.platform === 'tiktok' && user.isFanClubMember && (
                              <TikTokHeartIcon size={12} className="shrink-0" />
                            )}
                          </div>
                          <div className="text-white/30 text-[10px] truncate">@{user.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1.5">
                        <PlatformLogo platform={user.platform} size={14} />
                        <span className="text-white/50">{PLATFORM_LABELS[user.platform]}</span>
                      </div>
                    </td>
                    {SORT_COLUMNS.map((c) => (
                      <td
                        key={c.key}
                        className={`text-right py-3 px-3 tabular-nums ${
                          sortBy === c.key ? 'text-white font-bold' : 'text-white/50'
                        }`}
                      >
                        {c.format(user)}
                      </td>
                    ))}
                    <td className="text-right py-3 pr-6 text-white/30 text-[10px]">{formatRelativeTime(user.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <UserDetail user={selectedUser} onClose={() => setSelectedUser(null)} currentPlatform={platform} />
      </section>
    </div>
  )
}

function StatCard({ icon, label, value, accent }: { icon: any; label: string; value: string; accent: string }) {
  return (
    <div className="app-section-card glass !p-6 hover:border-white/10 transition-all group">
      <div className={`mb-3 transition-transform duration-300 ${accent}`}>{icon}</div>
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20 mb-1">{label}</div>
      <div className="text-xl font-black text-white tabular-nums leading-none truncate">{value}</div>
    </div>
  )
}

function PlatformStatRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between py-0.5">
      <span className="text-white/40 font-medium">{label}</span>
      <div className="flex items-baseline gap-2">
        {sub && <span className="text-[10px] text-white/20 font-mono">{sub}</span>}
        <span className="text-white font-bold font-mono tabular-nums">{value}</span>
      </div>
    </div>
  )
}

function UserDetail({ user, onClose, currentPlatform }: { user: UserStat | null; onClose: () => void, currentPlatform: Platform | 'all' }) {
  if (!user) {
    return (
      <div className="app-section-card glass p-8 flex items-center justify-center text-white/30 text-sm text-center min-h-[400px]">
        Select a user from the table to see their lifetime breakdown.
      </div>
    )
  }
  return (
    <div className="app-section-card glass p-6 self-start">
      <div className="flex items-start gap-3 mb-5">
        <Avatar url={user.profilePictureUrl} name={user.displayName} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold truncate">{user.displayName}</span>
            {user.platform === 'tiktok' && user.isFanClubMember && (
              <TikTokHeartIcon size={14} className="shrink-0" />
            )}
          </div>
          <div className="text-white/40 text-xs flex items-center gap-1.5 mt-0.5">
            <PlatformLogo platform={user.platform} size={12} />
            <span>@{user.username}</span>
          </div>
        </div>
        <button onClick={onClose} className="text-white/30 hover:text-white text-xs">
          Close
        </button>
      </div>

      <div className="space-y-2 text-xs mb-5">
        <DetailRow icon={<Heart size={12} className="text-pink-400" />} label="Likes" value={user.totalLikes.toLocaleString()} />
        <DetailRow icon={<Gift size={12} className="text-yellow-300" />} label="Gifts" value={user.totalGifts.toLocaleString()} />
        <DetailRow
          icon={<Gift size={12} className="text-emerald-400" />}
          label="Total Earnings"
          value={formatCurrency(user.totalGiftValueCents)}
        />
        <DetailRow
          icon={<Star size={12} className="text-purple-400" />}
          label="Subscriptions"
          value={user.totalSubscriptions.toLocaleString()}
        />
        <DetailRow icon={<UserPlus size={12} className="text-cyan-400" />} label="Follows" value={user.totalFollows.toLocaleString()} />
        <DetailRow icon={<Share2 size={12} className="text-blue-400" />} label="Shares" value={user.totalShares.toLocaleString()} />
        <DetailRow icon={<Swords size={12} className="text-orange-400" />} label="Raids" value={user.totalRaids.toLocaleString()} />
        <DetailRow
          icon={<MessageSquare size={12} className="text-white/60" />}
          label="Chat messages"
          value={user.totalChats.toLocaleString()}
        />
        <DetailRow
          icon={<Music2 size={12} className="text-green-400" />}
          label="Song requests"
          value={user.totalSongRequests.toLocaleString()}
        />
      </div>

      <div className="border-t border-white/[0.04] pt-4 space-y-1.5 text-[10px] text-white/30 uppercase tracking-widest font-bold">
        <div className="flex justify-between">
          <span>First seen</span>
          <span className="text-white/50 normal-case tracking-normal">{formatRelativeTime(user.firstSeenAt)}</span>
        </div>
        <div className="flex justify-between">
          <span>Last seen</span>
          <span className="text-white/50 normal-case tracking-normal">{formatRelativeTime(user.lastSeenAt)}</span>
        </div>
      </div>
    </div>
  )
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/[0.02] last:border-0">
      <div className="flex items-center gap-2 text-white/60">
        {icon}
        <span>{label}</span>
      </div>
      <span className="text-white font-mono tabular-nums">{value}</span>
    </div>
  )
}
