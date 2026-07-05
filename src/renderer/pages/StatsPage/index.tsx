import { useEffect, useMemo, useState } from 'react'
import { IconRefresh, IconTrash, IconActivity, IconAlertTriangle } from '../../components/ui/icons'
import type { GlobalStats, UserStat, UserStatSortKey, UserIdentity } from '../../../shared/stats'
import { EMPTY_GLOBAL_STATS } from '../../../shared/stats'
import type { Platform } from '../../../main/platforms/types'
import { PlatformLogo } from '../../components/platforms/PlatformLogo'
import { Modal } from '../../components/ui/Modal'

// Components
import { StatsMetricGrid } from './components/StatsMetricGrid'
import { PlatformTelemetry } from './components/PlatformTelemetry'
import { UserStatTable } from './components/UserStatTable'
import { FollowersBreakdown } from './components/FollowersBreakdown'

// Utils
import { formatCurrency, formatRelativeTime } from './utils'

interface SortColumn {
  key: UserStatSortKey
  label: string
  short: string
  format: (stat: UserStat) => string
}

const SORT_COLUMNS: SortColumn[] = [
  // All-time ranking — combines each user's position across every other stat.
  { key: 'overall', label: 'Overall', short: 'Overall', format: (s) => {
    const rank = (s as { overallRank?: number }).overallRank
    return typeof rank === 'number' && rank > 0 ? `#${rank.toLocaleString()}` : '—'
  } },
  { key: 'totalLikes', label: 'Likes', short: 'Likes', format: (s) => s.totalLikes.toLocaleString() },
  { key: 'totalGifts', label: 'Gifts', short: 'Gifts', format: (s) => s.totalGifts.toLocaleString() },
  { key: 'totalGiftValueCents', label: 'Estimated revenue', short: 'Revenue', format: (s) => formatCurrency(s.totalGiftValueCents) },
  // Twitch subscriptions ("members") are still tracked, but intentionally not
  // surfaced as a per-user column — it's a near-binary number that doesn't
  // earn a spot on the table.
  { key: 'totalShares', label: 'Shares', short: 'Shares', format: (s) => s.totalShares.toLocaleString() },
  { key: 'totalRaids', label: 'Raids', short: 'Raids', format: (s) => s.totalRaids.toLocaleString() },
  { key: 'totalChats', label: 'Chats', short: 'Chats', format: (s) => s.totalChats.toLocaleString() },
  { key: 'totalSongRequests', label: 'Song requests', short: 'Songs', format: (s) => s.totalSongRequests.toLocaleString() }
]

const RELEVANT_STATS: Record<Platform, UserStatSortKey[]> = {
  tiktok: ['totalLikes', 'totalGifts', 'totalGiftValueCents', 'totalShares', 'totalChats', 'totalSongRequests'],
  twitch: ['totalGifts', 'totalGiftValueCents', 'totalRaids', 'totalChats', 'totalSongRequests'],
  youtube: ['totalChats', 'totalSongRequests'],
  kick: ['totalChats', 'totalSongRequests']
}

function isRelevant(platform: Platform | 'all', key: UserStatSortKey): boolean {
  if (key === 'overall') return true
  if (platform === 'all') return true
  return RELEVANT_STATS[platform]?.includes(key) || key === 'lastSeenAt'
}

export default function StatsPage() {
  const [global, setGlobal] = useState<GlobalStats>(EMPTY_GLOBAL_STATS)
  const [identities, setIdentities] = useState<UserIdentity[]>([])
  const [sortBy, setSortBy] = useState<UserStatSortKey>('overall')
  const [platform, setPlatform] = useState<Platform | 'all'>('all')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedIdentityId, setSelectedIdentityId] = useState<string | null>(null)
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [resetting, setResetting] = useState(false)
  const [activePlatformTab, setActivePlatformTab] = useState<Platform | 'all'>('all')
  
  // Linking state
  const [linkSource, setLinkSource] = useState<UserStat | null>(null)
  const [isLinking, setIsLinking] = useState(false)

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
    const interval = setInterval(loadAll, 10_000)
    return () => clearInterval(interval)
  }, [sortBy, platform, debouncedQuery])

  const activeSortColumns = useMemo(
    () => SORT_COLUMNS.filter(c => isRelevant(activePlatformTab, c.key)),
    [activePlatformTab]
  )

  const openResetModal = () => {
    setResetConfirmText('')
    setResetModalOpen(true)
  }

  const performReset = async () => {
    if (!window.api?.stats || resetConfirmText.trim().toUpperCase() !== 'RESET') return
    setResetting(true)
    try {
      await window.api.stats.reset()
      setSelectedIdentityId(null)
      setResetModalOpen(false)
      setResetConfirmText('')
      await loadAll()
    } finally {
      setResetting(false)
    }
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

  // Make one linked account the "face" of the identity — its avatar + platform
  // become how the person is represented in the table and elsewhere.
  const handleSetPrimary = async (identity: UserIdentity, account: UserStat) => {
    if (!window.api?.stats) return
    const profileId = identity.accounts.find((a) => a.profileId)?.profileId
      || (!identity.id.includes(':') ? identity.id : null)
    if (!profileId) return
    setLoading(true)
    try {
      await window.api.stats.updateViewerProfile(profileId, {
        primaryPlatform: account.platform,
        profilePictureUrl: account.profilePictureUrl ?? null
      })
      loadAll()
    } catch (err) {
      console.error('[Stats] Set primary failed', err)
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
              <IconActivity size={20} className="text-accent" />
            ) : (
              <div className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl ring-1 ring-white/20">
                <PlatformLogo platform={activePlatformTab as Platform} size={28} />
              </div>
            )}
          </div>
          <div>
            <h1>Stream Stats</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadAll} disabled={loading} className="app-button !h-10 !px-4 text-[10px] font-semibold tracking-tight flex items-center gap-2">
            <IconRefresh size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={openResetModal}
            className="app-button !h-10 !px-4 text-[10px] font-semibold tracking-tight flex items-center gap-2 transition-all text-white/40 hover:text-danger hover:border-danger/30"
          >
            <IconTrash size={14} />
            Reset stats
          </button>
        </div>
      </header>

      <StatsMetricGrid global={global} activePlatformTab={activePlatformTab} />

      <FollowersBreakdown global={global} onChanged={loadAll} />

      <PlatformTelemetry
        global={global}
        activePlatformTab={activePlatformTab}
        onTabChange={setActivePlatformTab}
        isRelevant={isRelevant}
      />

      <div className="mt-12" />

      <UserStatTable 
        identities={identities}
        activePlatformTab={activePlatformTab}
        sortBy={sortBy}
        platform={platform}
        query={query}
        loading={loading}
        selectedIdentityId={selectedIdentityId}
        isLinking={isLinking}
        linkSource={linkSource}
        activeSortColumns={activeSortColumns}
        onQueryChange={setQuery}
        onPlatformChange={setPlatform}
        onSortChange={setSortBy}
        onSelectIdentity={setSelectedIdentityId}
        onLink={handleLink}
        onCancelLink={() => { setIsLinking(false); setLinkSource(null); }}
        onStartLink={(u) => { setLinkSource(u); setIsLinking(true); }}
        onUnlink={handleUnlink}
        onSetPrimary={handleSetPrimary}
        isRelevant={isRelevant}
        SORT_COLUMNS={SORT_COLUMNS}
      />

      <Modal
        open={resetModalOpen}
        onClose={() => { if (!resetting) setResetModalOpen(false) }}
        title="Reset all stats"
        className="!max-w-md"
        headerActions={
          <span className="grid h-8 w-8 place-items-center rounded-md bg-danger/15 text-danger">
            <IconAlertTriangle size={16} />
          </span>
        }
      >
        <div className="p-5 flex flex-col gap-4">
          <p className="text-[13px] leading-relaxed text-white/70">
            This permanently erases <strong className="text-white">every lifetime stat</strong> — all
            viewer totals, leaderboards, and global counters. This cannot be undone. (Your platform
            follower counts are kept.)
          </p>
          <div>
            <label className="block text-[11px] font-semibold text-white/45 mb-2">
              Type <span className="font-mono text-danger">RESET</span> to confirm
            </label>
            <input
              autoFocus
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') performReset() }}
              placeholder="RESET"
              className="h-11 w-full bg-white/[0.03] border border-white/10 rounded-md px-3 text-sm font-semibold text-white placeholder:text-white/20 focus:border-danger/40 outline-none transition-all"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setResetModalOpen(false)}
              disabled={resetting}
              className="app-button !h-10 !px-4 text-[11px] font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={performReset}
              disabled={resetting || resetConfirmText.trim().toUpperCase() !== 'RESET'}
              className="!h-10 !px-4 rounded-md text-[11px] font-bold flex items-center gap-2 transition-all bg-danger/20 border border-danger/40 text-danger hover:bg-danger/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <IconTrash size={14} />
              {resetting ? 'Resetting…' : 'Reset everything'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
