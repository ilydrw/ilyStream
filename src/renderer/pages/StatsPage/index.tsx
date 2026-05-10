import { useEffect, useMemo, useState } from 'react'
import {IconChartBar, IconRefresh, IconTrash} from '@tabler/icons-react'
import type { GlobalStats, UserStat, UserStatSortKey, UserIdentity } from '../../../shared/stats'
import { EMPTY_GLOBAL_STATS } from '../../../shared/stats'
import type { Platform } from '../../../main/platforms/types'
import { PlatformLogo } from '../../components/platforms/PlatformLogo'

// Components
import { StatsMetricGrid } from './components/StatsMetricGrid'
import { PlatformTelemetry } from './components/PlatformTelemetry'
import { UserStatTable } from './components/UserStatTable'
import { UserDetailSidebar } from './components/UserDetailSidebar'

// Utils
import { formatCurrency, formatRelativeTime } from './utils'

interface SortColumn {
  key: UserStatSortKey
  label: string
  short: string
  format: (stat: UserStat) => string
}

const SORT_COLUMNS: SortColumn[] = [
  { key: 'totalLikes', label: 'Likes', short: 'Likes', format: (s) => s.totalLikes.toLocaleString() },
  { key: 'totalGifts', label: 'Gifts', short: 'Gifts', format: (s) => s.totalGifts.toLocaleString() },
  { key: 'totalGiftValueCents', label: 'Earnings', short: 'Value', format: (s) => formatCurrency(s.totalGiftValueCents) },
  { key: 'totalSubscriptions', label: 'Subs', short: 'Subs', format: (s) => s.totalSubscriptions.toLocaleString() },
  { key: 'totalFollows', label: 'Follows', short: 'Follows', format: (s) => s.totalFollows.toLocaleString() },
  { key: 'totalShares', label: 'Shares', short: 'Shares', format: (s) => s.totalShares.toLocaleString() },
  { key: 'totalRaids', label: 'Raids', short: 'Raids', format: (s) => s.totalRaids.toLocaleString() },
  { key: 'totalChats', label: 'Chats', short: 'Chats', format: (s) => s.totalChats.toLocaleString() },
  { key: 'totalSongRequests', label: 'Song requests', short: 'Songs', format: (s) => s.totalSongRequests.toLocaleString() }
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
      console.error('[Stats] IconUnlink failed', err)
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
              <IconChartBar size={32} className="text-accent" />
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
          <button onClick={loadAll} disabled={loading} className="app-button !h-10 !px-4 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
            <IconRefresh size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={handleReset}
            className={`app-button !h-10 !px-4 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${
              confirmReset ? 'bg-danger/20 border-danger/40 text-danger' : 'text-white/40 hover:text-danger hover:border-danger/30'
            }`}
          >
            <IconTrash size={14} />
            {confirmReset ? 'Confirm Reset' : 'Reset stats'}
          </button>
        </div>
      </header>

      <StatsMetricGrid global={global} activePlatformTab={activePlatformTab} />

      <PlatformTelemetry 
        global={global} 
        activePlatformTab={activePlatformTab} 
        onTabChange={setActivePlatformTab}
        isRelevant={isRelevant}
      />

      <div className="mt-12" />

      <section className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-12">
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
          isRelevant={isRelevant}
          SORT_COLUMNS={SORT_COLUMNS}
        />

        <UserDetailSidebar 
          identity={selectedIdentity} 
          onClose={() => setSelectedIdentityId(null)} 
          onStartLink={(u) => { setLinkSource(u); setIsLinking(true); }}
          onUnlink={handleUnlink}
        />
      </section>
    </div>
  )
}
