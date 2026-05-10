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
  Search,
  Link as LinkIcon,
  Unlink,
  ExternalLink
} from 'lucide-react'
import type { GlobalStats, UserStat, UserStatSortKey, UserIdentity } from '../../../shared/stats'
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

const RELEVANT_STATS: Record<Platform, UserStatSortKey[]> = {
  tiktok: ['totalLikes', 'totalGifts', 'totalGiftValueCents', 'totalSubscriptions', 'totalFollows', 'totalShares', 'totalChats', 'totalSongRequests'],
  twitch: ['totalGifts', 'totalGiftValueCents', 'totalSubscriptions', 'totalRaids', 'totalChats', 'totalSongRequests'],
  youtube: ['totalSubscriptions', 'totalChats', 'totalSongRequests'],
  kick: ['totalFollows', 'totalSubscriptions', 'totalChats', 'totalSongRequests']
}

function isRelevant(platform: Platform | 'all', key: UserStatSortKey): boolean {
  if (platform === 'all') return true
  return RELEVANT_STATS[platform]?.includes(key) || key === 'lastSeenAt'
}

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
  const [identities, setIdentities] = useState<UserIdentity[]>([])
  const [sortBy, setSortBy] = useState<UserStatSortKey>('totalLikes')
  const [platform, setPlatform] = useState<Platform | 'all'>('all')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedIdentityId, setSelectedIdentityId] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [activePlatformTab, setActivePlatformTab] = useState<Platform | 'all'>('all')
  
  // Linking state
  const [linkSource, setLinkSource] = useState<UserStat | null>(null)
  const [isLinking, setIsLinking] = useState(false)

  const selectedIdentity = useMemo(
    () => identities.find(i => i.id === selectedIdentityId) || null,
    [identities, selectedIdentityId]
  )

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
        window.api.stats.getTopIdentities({ sortBy, platform, query: debouncedQuery, limit: 200 })
      ])
      setGlobal(g as GlobalStats)
      setIdentities(u as UserIdentity[])
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

  const activeSortColumns = useMemo(
    () => SORT_COLUMNS.filter(c => isRelevant(activePlatformTab, c.key)),
    [activePlatformTab]
  )

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
    setSelectedIdentityId(null)
    await loadAll()
  }

  const handleLink = async (target: UserStat) => {
    if (!linkSource || !window.api?.stats) return
    if (linkSource.username === target.username && linkSource.platform === target.platform) {
      alert("Can't link an account to itself!")
      return
    }
    setLoading(true)
    try {
      await window.api.stats.linkAccounts({
        p1: linkSource.platform,
        u1: linkSource.username,
        p2: target.platform,
        u2: target.username
      })
      setLinkSource(null)
      setIsLinking(false)
      loadAll()
    } catch (err) {
      console.error('[Stats] Link failed', err)
    } finally {
      setLoading(false)
    }
  }

  const handleUnlink = async (platform: Platform, username: string) => {
    if (!window.api?.stats) return
    setLoading(true)
    try {
      await window.api.stats.unlinkAccount({ platform, username })
      loadAll()
    } catch (err) {
      console.error('[Stats] Unlink failed', err)
    } finally {
      setLoading(false)
    }
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
        {isRelevant(activePlatformTab, 'totalLikes') && <StatCard icon={<Heart size={20} />} label="Likes" value={global.totalLikes.toLocaleString()} accent="text-pink-400" />}
        {isRelevant(activePlatformTab, 'totalGifts') && <StatCard icon={<Gift size={20} />} label="Gifts" value={global.totalGifts.toLocaleString()} accent="text-yellow-300" />}
        {isRelevant(activePlatformTab, 'totalGiftValueCents') && <StatCard icon={<Gift size={20} />} label="Est. Revenue" value={formatCurrency(global.totalGiftValueCents)} accent="text-emerald-400" />}
        {isRelevant(activePlatformTab, 'totalSubscriptions') && <StatCard icon={<Star size={20} />} label="Subs" value={global.totalSubscriptions.toLocaleString()} accent="text-purple-400" />}
        {isRelevant(activePlatformTab, 'totalFollows') && <StatCard icon={<UserPlus size={20} />} label="Follows" value={global.totalFollows.toLocaleString()} accent="text-cyan-400" />}
        {isRelevant(activePlatformTab, 'totalShares') && <StatCard icon={<Share2 size={20} />} label="Shares" value={global.totalShares.toLocaleString()} accent="text-blue-400" />}
        {isRelevant(activePlatformTab, 'totalRaids') && <StatCard icon={<Swords size={20} />} label="Raids" value={global.totalRaids.toLocaleString()} accent="text-orange-400" />}
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
                <div key={p} className="app-section-card glass p-6 flex flex-col group">
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
                <p>Sorted by {sortColumn.label.toLowerCase()} · {isLinking ? 'select target to link' : 'click for breakdown'}</p>
                {isLinking && (
                  <div className="mt-2 px-3 py-1.5 bg-yellow-500/20 text-yellow-400 text-[10px] font-bold rounded-xl flex items-center gap-2 border border-yellow-500/20">
                    <LinkIcon size={12} />
                    LINKING @{linkSource?.username} ({linkSource?.platform})
                    <button onClick={() => { setIsLinking(false); setLinkSource(null); }} className="ml-auto hover:text-white uppercase">Cancel</button>
                  </div>
                )}
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
                {SORT_COLUMNS.filter(c => isRelevant(platform, c.key)).map((c) => (
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
                  <th className="text-left font-black py-3">Identity</th>
                  <th className="text-left font-black py-3">Platforms</th>
                  {activeSortColumns.map((c) => (
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
                {identities.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5 + SORT_COLUMNS.length} className="text-center text-white/30 py-12 text-sm">
                      No users tracked yet — fire up a stream and let the events roll in.
                    </td>
                  </tr>
                )}
                {identities.map((identity, idx) => (
                  <tr
                    key={identity.id}
                    onClick={() => {
                      if (isLinking) {
                        handleLink(identity.accounts[0])
                      } else {
                        setSelectedIdentityId(identity.id)
                      }
                    }}
                    className={`border-b border-white/[0.02] cursor-pointer transition-colors ${
                      selectedIdentityId === identity.id
                        ? 'bg-accent/5'
                        : 'hover:bg-white/[0.02]'
                    } ${isLinking ? 'hover:bg-yellow-500/10' : ''}`}
                  >
                    <td className="px-6 py-3 text-white/30 font-mono">{idx + 1}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar url={identity.profilePictureUrl} name={identity.displayName} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-white font-semibold truncate">{identity.displayName}</span>
                            {identity.isFanClubMember && (
                              <TikTokHeartIcon size={12} className="shrink-0" />
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1">
                        {identity.allPlatforms.map(p => (
                          <PlatformLogo key={p} platform={p} size={14} />
                        ))}
                      </div>
                    </td>
                    {activeSortColumns.map((c) => (
                      <td
                        key={c.key}
                        className={`text-right py-3 px-3 tabular-nums ${
                          sortBy === c.key ? 'text-white font-bold' : 'text-white/50'
                        }`}
                      >
                        {(identity as any)[c.key]?.toLocaleString() || '0'}
                      </td>
                    ))}
                    <td className="text-right py-3 pr-6 text-white/30 text-[10px]">{formatRelativeTime(identity.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <UserDetail 
          identity={selectedIdentity} 
          onClose={() => setSelectedIdentityId(null)} 
          onStartLink={(u) => { setLinkSource(u); setIsLinking(true); }}
          onUnlink={handleUnlink}
        />
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
    <div className="flex items-baseline justify-between py-0.5 pr-1">
      <span className="text-white/40 font-medium">{label}</span>
      <div className="flex items-baseline gap-2">
        {sub && <span className="text-[10px] text-white/20 font-mono">{sub}</span>}
        <span className="text-white font-bold font-mono tabular-nums pr-1">{value}</span>
      </div>
    </div>
  )
}

function UserDetail({ 
  identity, 
  onClose,
  onStartLink,
  onUnlink
}: { 
  identity: UserIdentity | null; 
  onClose: () => void;
  onStartLink: (user: UserStat) => void;
  onUnlink: (platform: Platform, username: string) => void;
}) {
  if (!identity) {
    return (
      <div className="app-section-card glass p-8 flex items-center justify-center text-white/30 text-sm text-center min-h-[400px]">
        Select a user from the table to see their lifetime breakdown across all linked platforms.
      </div>
    )
  }
  return (
    <div className="app-section-card glass p-6 self-start">
      <div className="flex items-start gap-3 mb-6">
        <Avatar url={identity.profilePictureUrl} name={identity.displayName} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold truncate text-lg tracking-tight">{identity.displayName}</span>
            {identity.isFanClubMember && (
              <TikTokHeartIcon size={16} className="shrink-0" />
            )}
          </div>
          <div className="text-white/40 text-xs flex items-center gap-2 mt-1">
            <div className="flex items-center -space-x-1">
              {identity.allPlatforms.map(p => (
                <div key={p} className="p-0.5 bg-black/40 rounded-full border border-white/10">
                  <PlatformLogo platform={p} size={10} />
                </div>
              ))}
            </div>
            <span className="uppercase tracking-widest text-[9px] font-black text-white/20">Unified Identity</span>
          </div>
        </div>
        <button onClick={onClose} className="text-white/30 hover:text-white transition-colors">
          <Trash2 size={16} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-8">
        <MetricBox label="Likes" value={identity.totalLikes} color="text-pink-400" />
        <MetricBox label="Gifts" value={identity.totalGifts} color="text-yellow-300" />
        <MetricBox label="Subs" value={identity.totalSubscriptions} color="text-purple-400" />
        <MetricBox label="Songs" value={identity.totalSongRequests} color="text-green-400" />
      </div>

      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20 mb-4 px-1">Linked Accounts</h3>
      <div className="space-y-3 mb-8">
        {identity.accounts.map(acc => (
          <div key={`${acc.platform}-${acc.username}`} className="group relative bg-white/[0.03] border border-white/5 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <PlatformLogo platform={acc.platform} size={16} />
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">@{acc.username}</div>
                <div className="text-[10px] text-white/30 uppercase tracking-tighter">{PLATFORM_LABELS[acc.platform]}</div>
              </div>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={() => onStartLink(acc)}
                className="p-1.5 hover:bg-accent/20 rounded-lg text-white/40 hover:text-accent transition-all"
                title="Link with another account"
              >
                <LinkIcon size={14} />
              </button>
              {identity.accounts.length > 1 && (
                <button 
                  onClick={() => onUnlink(acc.platform, acc.username)}
                  className="p-1.5 hover:bg-red-500/20 rounded-lg text-white/40 hover:text-red-400 transition-all"
                  title="Unlink this account"
                >
                  <Unlink size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
        
        {identity.accounts.length < 5 && (
          <button 
            onClick={() => onStartLink(identity.accounts[0])}
            className="w-full py-3 border border-dashed border-white/10 rounded-xl text-white/20 text-[10px] font-black uppercase tracking-widest hover:border-accent/40 hover:text-accent/60 transition-all flex items-center justify-center gap-2"
          >
            <LinkIcon size={12} />
            Link New Account
          </button>
        )}
      </div>

      <div className="space-y-2 text-xs">
        <DetailRow 
          icon={<MessageSquare size={12} className="text-white/60" />} 
          label="Total Chats" 
          value={identity.totalChats.toLocaleString()} 
        />
        <DetailRow 
          icon={<Swords size={12} className="text-orange-400" />} 
          label="Total Raids" 
          value={identity.totalRaids.toLocaleString()} 
        />
      </div>
    </div>
  )
}

function MetricBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
      <div className="text-[9px] font-black uppercase tracking-widest text-white/20 mb-1">{label}</div>
      <div className={`text-xl font-mono font-bold tracking-tighter ${color}`}>{value.toLocaleString()}</div>
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
      <span className="text-white font-mono tabular-nums pr-2">{value}</span>
    </div>
  )
}
