import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconUsers, IconUnlink, IconStarFilled, IconStar } from '@tabler/icons-react'
import { IconSearch, IconLink as LinkIcon, IconChevronLeft, IconChevronRight, IconChevronDown, IconX } from '../../../components/ui/icons'
import type { UserIdentity, UserStatSortKey, UserStat } from '../../../../shared/stats'
import type { Platform } from '../../../../main/platforms/types'
import { Avatar } from '../../../components/ui/Avatar'
import { PlatformLogo } from '../../../components/platforms/PlatformLogo'
import { formatRelativeTime, formatCurrency } from '../utils'
import { buildIdentityBadges, BadgeChip } from '../../../components/badges/BadgeUtils'
import { OfficialBadge } from '../../../components/badges/OfficialBadge'
import { sortPlatformsByDisplayOrder } from '../../../lib/platform-order'

const PLATFORMS: Platform[] = ['tiktok', 'twitch', 'youtube', 'kick']
const PLATFORM_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick'
}

const PAGE_SIZE = 50

type StatusFilter =
  | 'none'
  | 'mod'
  | 'twitchSub'
  | 'tiktokFanClub'
  | 'tiktokSuperFan'
  | 'youtubeMember'
  | 'youtubeSuperFan'
  | 'kickSub'

const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  none: 'None',
  mod: 'Moderators',
  twitchSub: 'Twitch Subs',
  tiktokFanClub: 'TikTok Fan Club',
  tiktokSuperFan: 'TikTok Super Fans',
  youtubeMember: 'YouTube Members',
  youtubeSuperFan: 'YouTube Super Fans',
  kickSub: 'Kick Subs'
}

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilter; label: string; badge?: { platform: Platform; role: 'member' | 'superfan' | 'mod' } }> = [
  { value: 'none', label: 'None' },
  { value: 'mod', label: 'Moderators', badge: { platform: 'twitch', role: 'mod' } },
  { value: 'twitchSub', label: 'Twitch Subs', badge: { platform: 'twitch', role: 'member' } },
  { value: 'tiktokFanClub', label: 'TikTok Fan Club', badge: { platform: 'tiktok', role: 'member' } },
  { value: 'tiktokSuperFan', label: 'TikTok Super Fans', badge: { platform: 'tiktok', role: 'superfan' } },
  { value: 'youtubeMember', label: 'YouTube Members', badge: { platform: 'youtube', role: 'member' } },
  { value: 'youtubeSuperFan', label: 'YouTube Super Fans', badge: { platform: 'youtube', role: 'superfan' } },
  { value: 'kickSub', label: 'Kick Subs', badge: { platform: 'kick', role: 'member' } }
]

function isPlatformSubscriber(account: UserStat, platform: Platform) {
  if (account.platform !== platform) return false
  if (platform === 'tiktok') return Boolean(account.isFanClubMember)
  return Boolean(account.isFanClubMember || account.totalSubscriptions > 0)
}

function matchesStatusFilter(identity: UserIdentity, statusFilter: StatusFilter) {
  switch (statusFilter) {
    case 'none':
      return true
    case 'mod':
      return identity.accounts.some(account => account.isModerator)
    case 'twitchSub':
      return identity.accounts.some(account => isPlatformSubscriber(account, 'twitch'))
    case 'tiktokFanClub':
      return identity.accounts.some(account => isPlatformSubscriber(account, 'tiktok'))
    case 'tiktokSuperFan':
      return identity.accounts.some(account => account.platform === 'tiktok' && account.isSuperFan)
    case 'youtubeMember':
      return identity.accounts.some(account => isPlatformSubscriber(account, 'youtube'))
    case 'youtubeSuperFan':
      return identity.accounts.some(account => account.platform === 'youtube' && account.isSuperFan)
    case 'kickSub':
      return identity.accounts.some(account => isPlatformSubscriber(account, 'kick'))
    default:
      return true
  }
}

function isPrimaryAccount(identity: UserIdentity, account: UserStat) {
  if (identity.primaryUsername) {
    return account.platform === identity.primaryPlatform && account.username === identity.primaryUsername
  }
  return identity.accounts.find((candidate) => candidate.platform === identity.primaryPlatform)?.username === account.username &&
    account.platform === identity.primaryPlatform
}

interface UserStatTableProps {
  identities: UserIdentity[]
  activePlatformTab: Platform | 'all'
  sortBy: UserStatSortKey
  platform: Platform | 'all'
  query: string
  loading: boolean
  selectedIdentityId: string | null
  isLinking: boolean
  linkSource: UserStat | null
  activeSortColumns: any[]
  onQueryChange: (q: string) => void
  onPlatformChange: (p: Platform | 'all') => void
  onSortChange: (s: UserStatSortKey) => void
  onSelectIdentity: (id: string | null) => void
  onLink: (target: UserStat) => void
  onCancelLink: () => void
  onStartLink: (user: UserStat) => void
  onUnlink: (platform: Platform, username: string) => void
  onSetPrimary: (identity: UserIdentity, account: UserStat) => void
  isRelevant: (platform: Platform | 'all', key: UserStatSortKey) => boolean
  SORT_COLUMNS: any[]
}

function InlineMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '6px 10px', minWidth: 0 }}>
      <div style={{ fontSize: 8, fontWeight: 500, letterSpacing: '0', color: 'rgba(255,255,255,0.2)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, letterSpacing: '-0.02em', color: color }}>{value}</div>
    </div>
  )
}

function InlineUserDetail({
  identity,
  onClose,
  onStartLink,
  onUnlink,
  onSetPrimary,
  colSpan
}: {
  identity: UserIdentity
  onClose: () => void
  onStartLink: (user: UserStat) => void
  onUnlink: (platform: Platform, username: string) => void
  onSetPrimary: (account: UserStat) => void
  colSpan: number
}) {
  const navigate = useNavigate()
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 0 }}>
        <div style={{ background: 'rgba(25,200,255,0.02)', borderTop: '1px solid rgba(25,200,255,0.08)', borderBottom: '1px solid rgba(25,200,255,0.08)' }}>
          <div style={{ padding: '16px 24px' }}>
            {/* Top bar: user info + close */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar url={identity.profilePictureUrl} name={identity.displayName} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: '#fff', fontWeight: 700, fontSize: 13, letterSpacing: '-0.01em' }}>{identity.displayName}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      {buildIdentityBadges(identity, 10, 20).map(badge => (
                        <BadgeChip key={badge.key} badge={badge} />
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                    {sortPlatformsByDisplayOrder(identity.allPlatforms).map(p => (
                      <div key={p} style={{ padding: 2, background: 'rgba(0,0,0,0.3)', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <PlatformLogo platform={p} size={10} />
                      </div>
                    ))}
                    <span style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0', color: 'rgba(255,255,255,0.2)', marginLeft: 2 }}>
                      {identity.accounts.length > 1 ? 'Unified Identity' : PLATFORM_LABELS[identity.primaryPlatform]}
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); navigate(`/stats/viewer/${identity.id}`); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)'; }}
                >
                  View Profile
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); onClose(); }}
                  style={{ padding: 6, background: 'none', border: 'none', borderRadius: 6, color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#fff'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.3)'; (e.currentTarget as HTMLElement).style.background = 'none'; }}
                >
                  <IconX size={14} />
                </button>
              </div>
            </div>

            {/* Stat chips row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              <InlineMetric label="Overall" value={typeof identity.overallRank === 'number' && identity.overallRank > 0 ? `#${identity.overallRank.toLocaleString()}` : '—'} color="var(--color-accent)" />
              <InlineMetric label="Likes" value={identity.totalLikes.toLocaleString()} color="#f472b6" />
              <InlineMetric label="Gifts" value={identity.totalGifts.toLocaleString()} color="#fde047" />
              <InlineMetric label="Earnings" value={formatCurrency(identity.totalGiftValueCents)} color="#34d399" />
              <InlineMetric label="Chats" value={identity.totalChats.toLocaleString()} color="rgba(255,255,255,0.6)" />
              <InlineMetric label="Songs" value={identity.totalSongRequests.toLocaleString()} color="#4ade80" />
              <InlineMetric label="AI Calls" value={(identity.totalCohostCalls || 0).toLocaleString()} color="#ef4444" />
              <InlineMetric label="Raids" value={identity.totalRaids.toLocaleString()} color="#fb923c" />
              <InlineMetric label="Shares" value={identity.totalShares.toLocaleString()} color="#22d3ee" />
            </div>

            {/* Linked accounts row — a horizontal bar of avatar chips, one per
                connected account, each tagged with its platform glyph. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginRight: 2 }}>Accounts</span>
              {identity.accounts.map(acc => {
                const isPrimary = identity.accounts.length > 1 && isPrimaryAccount(identity, acc)
                return (
                <div
                  key={`${acc.platform}-${acc.username}`}
                  className="group"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, background: isPrimary ? 'rgba(25,200,255,0.06)' : 'rgba(255,255,255,0.03)', border: isPrimary ? '1px solid rgba(25,200,255,0.35)' : '1px solid rgba(255,255,255,0.06)', borderRadius: 999, paddingLeft: 4, paddingRight: 8, paddingTop: 4, paddingBottom: 4 }}
                >
                  <div style={{ position: 'relative', flexShrink: 0, lineHeight: 0 }}>
                    <Avatar url={acc.profilePictureUrl} name={acc.displayName || acc.username} size="sm" />
                    <div style={{ position: 'absolute', bottom: -3, right: -3, background: '#15171c', borderRadius: '50%', padding: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #15171c' }}>
                      <PlatformLogo platform={acc.platform} size={11} />
                    </div>
                  </div>
                  <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600, fontSize: 12 }}>@{acc.username}</span>
                  {isPrimary && (
                    <span title="Primary account" style={{ display: 'flex', alignItems: 'center', color: 'var(--color-accent)' }}>
                      <IconStarFilled size={11} />
                    </span>
                  )}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {identity.accounts.length > 1 && !isPrimary && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onSetPrimary(acc); }}
                        className="p-1 hover:bg-accent/20 rounded-full text-white/30 hover:text-accent transition-all"
                        title="Make primary (use this avatar + platform)"
                      >
                        <IconStar size={12} />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onStartLink(acc); }}
                      className="p-1 hover:bg-accent/20 rounded-full text-white/30 hover:text-accent transition-all"
                      title="Link with another account"
                    >
                      <LinkIcon size={12} />
                    </button>
                    {identity.accounts.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onUnlink(acc.platform, acc.username); }}
                        className="p-1 hover:bg-red-500/20 rounded-full text-white/30 hover:text-red-400 transition-all"
                        title="Unlink this account"
                      >
                        <IconUnlink size={12} />
                      </button>
                    )}
                  </div>
                </div>
                )
              })}
              {identity.accounts.length < 5 && (
                <button
                  onClick={(e) => { e.stopPropagation(); onStartLink(identity.accounts[0]); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'none', border: '1px dashed rgba(255,255,255,0.12)', borderRadius: 999, color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: 600, letterSpacing: '0', cursor: 'pointer' }}
                  className="hover:border-accent/40 hover:text-accent/70 transition-all"
                >
                  <LinkIcon size={12} />
                  Link account
                </button>
              )}
            </div>
          </div>
        </div>
      </td>
    </tr>
  )
}

export function UserStatTable({
  identities,
  activePlatformTab,
  sortBy,
  platform,
  query,
  loading,
  selectedIdentityId,
  isLinking,
  linkSource,
  activeSortColumns,
  onQueryChange,
  onPlatformChange,
  onSortChange,
  onSelectIdentity,
  onLink,
  onCancelLink,
  onStartLink,
  onUnlink,
  onSetPrimary,
  isRelevant,
  SORT_COLUMNS
}: UserStatTableProps) {
  const [page, setPage] = useState(0)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('none')
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  const statusDropdownRef = useRef<HTMLDivElement | null>(null)

  // Filter identities by status (badges)
  const filteredIdentities = React.useMemo(() => {
    return identities.filter(identity => matchesStatusFilter(identity, statusFilter))
  }, [identities, statusFilter])

  useEffect(() => {
    if (!statusDropdownOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!statusDropdownRef.current?.contains(event.target as Node)) {
        setStatusDropdownOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [statusDropdownOpen])

  // Reset to first page when filters/sort/search change
  useEffect(() => {
    setPage(0)
  }, [sortBy, platform, query, activePlatformTab, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filteredIdentities.length / PAGE_SIZE))
  const safePageIndex = Math.min(page, totalPages - 1)
  const startIdx = safePageIndex * PAGE_SIZE
  const endIdx = Math.min(startIdx + PAGE_SIZE, filteredIdentities.length)
  const pageIdentities = filteredIdentities.slice(startIdx, endIdx)

  // Total column count for colSpan on the inline detail row
  const totalCols = 3 + activeSortColumns.length + 1 // #, Identity, Platforms, ...sorts, Last seen

  return (
    <div className="app-section-card glass" style={{ padding: 0, overflow: 'visible' }}>
      {/* Header */}
      <div className="app-section-head" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="text-accent" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {activePlatformTab === 'all' ? (
              <IconUsers size={28} />
            ) : (
              <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.1)', borderRadius: 10, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.2)' }}>
                <PlatformLogo platform={activePlatformTab as Platform} size={22} />
              </div>
            )}
          </div>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>Top users</h2>
            <p>Sorted by {sortBy === 'overall' ? 'overall ranking' : sortBy.replace('total', '').toLowerCase()} · {isLinking ? 'select target to link' : 'click to expand'}</p>
            {isLinking && (
              <div style={{ marginTop: 8, padding: '4px 10px', background: 'rgba(234,179,8,0.15)', color: '#facc15', fontSize: 10, fontWeight: 700, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 6, border: '1px solid rgba(234,179,8,0.2)' }}>
                <LinkIcon size={12} />
                LINKING @{linkSource?.username} ({linkSource?.platform})
                <button onClick={onCancelLink} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 800, fontSize: 10 }} className="hover:text-white">Cancel</button>
              </div>
            )}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {/* Search — icon + input are flex siblings so the glyph can never
              overlap the placeholder or get clipped. */}
          <div className="group flex h-11 items-center gap-2.5 rounded-md border border-white/5 bg-white/[0.03] px-3.5 transition-all focus-within:border-white/10 focus-within:bg-white/[0.05]" style={{ width: 320 }}>
            <IconSearch size={16} className="shrink-0 text-white/30 transition-colors group-focus-within:text-accent" />
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search users..."
              className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-white placeholder:text-white/25 outline-none"
            />
          </div>
          {/* Platform filter */}
          <select
            value={platform}
            onChange={(e) => onPlatformChange(e.target.value as Platform | 'all')}
            className="h-11 bg-white/[0.03] border border-white/5 rounded-md px-4 text-sm font-bold text-white/90 focus:bg-[#15171c] focus:border-white/10 outline-none transition-all cursor-pointer hover:text-white"
            style={{ fontSize: 13 }}
          >
            <option value="all" style={{ fontSize: 14, background: '#15171c' }}>All platforms</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p} style={{ fontSize: 14, background: '#15171c' }}>
                {PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>
          {/* Sort select */}
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as UserStatSortKey)}
            className="h-11 bg-white/[0.03] border border-white/5 rounded-md px-4 text-sm font-bold text-white/90 focus:bg-[#15171c] focus:border-white/10 outline-none transition-all cursor-pointer hover:text-white"
            style={{ fontSize: 13 }}
          >
            {SORT_COLUMNS.filter(c => isRelevant(platform, c.key)).map((c) => (
              <option key={c.key} value={c.key} style={{ fontSize: 14, background: '#15171c' }}>
                Sort by {c.label.toLowerCase()}
              </option>
            ))}
          </select>
          {/* Status filter dropdown */}
          <div
            ref={statusDropdownRef}
            className="relative"
          >
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={statusDropdownOpen}
              onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
              className="h-11 bg-white/[0.03] border border-white/5 rounded-md px-4 text-sm font-bold text-white/90 focus:bg-white/[0.05] focus:border-white/10 outline-none transition-all cursor-pointer hover:text-white flex items-center gap-2"
              style={{ minWidth: 160, fontSize: 13 }}
            >
              <span>Status: {STATUS_FILTER_LABELS[statusFilter]}</span>
              <IconChevronDown size={12} style={{ marginLeft: 'auto' }} />
            </button>
            {statusDropdownOpen && (
              <div
                className="absolute left-0 bg-[#15171c] border border-white/10 rounded-lg shadow-2xl z-[120] py-1 overflow-hidden"
                style={{ top: '100%', minWidth: 220 }}
                role="menu"
              >
                {STATUS_FILTER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={statusFilter === option.value}
                    onClick={() => { setStatusFilter(option.value); setStatusDropdownOpen(false); }}
                    className="w-full text-left px-4 py-3 text-sm font-bold hover:bg-white/[0.05] transition-colors flex items-center gap-3 text-white/90 hover:text-white"
                  >
                    {option.badge && (
                      <OfficialBadge platform={option.badge.platform} role={option.badge.role} size={18} />
                    )}
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: 12, overflow: 'hidden', minHeight: 400 }}>
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ fontSize: 11, letterSpacing: '0', color: 'rgba(255,255,255,0.55)', fontWeight: 500, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <th style={{ textAlign: 'left', fontWeight: 900, padding: '10px 0 10px 24px', width: 42 }}>#</th>
            <th style={{ textAlign: 'left', fontWeight: 900, padding: '10px 8px' }}>Identity</th>
            <th style={{ textAlign: 'left', fontWeight: 900, padding: '10px 8px' }}>Platforms</th>
            {activeSortColumns.map((c) => (
              <th
                key={c.key}
                style={{ textAlign: 'right', fontWeight: 900, padding: '10px 10px', cursor: 'pointer', color: sortBy === c.key ? 'var(--color-accent)' : undefined, whiteSpace: 'nowrap' }}
                onClick={() => onSortChange(c.key)}
              >
                {c.short}
              </th>
            ))}
            <th style={{ textAlign: 'right', fontWeight: 900, padding: '10px 24px 10px 10px', whiteSpace: 'nowrap' }}>Last seen</th>
          </tr>
        </thead>
        <tbody>
          {pageIdentities.length === 0 && !loading && (
            <tr>
              <td colSpan={totalCols} style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', padding: '48px 0', fontSize: 13 }}>
                {statusFilter === 'none' ? 'No users tracked yet — fire up a stream and let the events roll in.' : 'No users match that status filter yet.'}
              </td>
            </tr>
          )}
          {pageIdentities.map((identity, idx) => {
            const isSelected = selectedIdentityId === identity.id
            const rank = startIdx + idx + 1
            let rankColor = 'rgba(255,255,255,0.25)'
            let rankWeight = '500'
            let avatarStyle: React.CSSProperties | undefined = undefined
            
            // Medal avatars override the Avatar's built-in white ring/shadow
            // (boxShadow: 'none') so only one clean solid colored ring shows.
            if (rank === 1) {
              rankColor = '#FBBF24' // Gold
              rankWeight = '800'
              avatarStyle = { border: '2px solid #FBBF24', boxShadow: 'none' }
            } else if (rank === 2) {
              rankColor = '#CBD5E1' // Silver
              rankWeight = '700'
              avatarStyle = { border: '2px solid #CBD5E1', boxShadow: 'none' }
            } else if (rank === 3) {
              rankColor = '#CD7F32' // Bronze
              rankWeight = '700'
              avatarStyle = { border: '2px solid #CD7F32', boxShadow: 'none' }
            }

            return (
              <React.Fragment key={identity.id}>
                <tr
                  onClick={() => {
                    if (isLinking) {
                      onLink(identity.accounts[0])
                    } else {
                      onSelectIdentity(isSelected ? null : identity.id)
                    }
                  }}
                  style={{
                    borderBottom: isSelected ? 'none' : '1px solid rgba(255,255,255,0.02)',
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(25,200,255,0.04)' : undefined,
                    transition: 'background 0.15s ease'
                  }}
                  className={isLinking ? 'hover:bg-yellow-500/10' : (isSelected ? '' : 'hover:bg-white/[0.02]')}
                >
                  <td style={{ padding: '17px 0 17px 24px', color: rankColor, fontWeight: rankWeight, fontSize: rank <= 3 ? 13 : 11, width: 42 }}>
                    {rank}
                  </td>
                  <td style={{ padding: '17px 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <Avatar url={identity.profilePictureUrl} name={identity.displayName} size="md" style={avatarStyle} />
                      <span style={{ color: '#fff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 15 }}>{identity.displayName}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        {buildIdentityBadges(identity, 10, 20).map(badge => (
                          <BadgeChip key={badge.key} badge={badge} />
                        ))}
                      </div>
                      <IconChevronDown 
                        size={10} 
                        style={{ flexShrink: 0, color: isSelected ? 'var(--color-accent)' : 'rgba(255,255,255,0.15)', transition: 'transform 0.2s ease, color 0.2s ease', transform: isSelected ? 'rotate(180deg)' : 'none' }}
                      />
                    </div>
                  </td>
                  <td style={{ padding: '17px 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {sortPlatformsByDisplayOrder(identity.allPlatforms).map(p => (
                        <PlatformLogo key={p} platform={p} size={16} />
                      ))}
                    </div>
                  </td>
                  {activeSortColumns.map((c) => (
                    <td
                      key={c.key}
                      style={{ textAlign: 'right', padding: '17px 10px', fontVariantNumeric: 'tabular-nums', fontWeight: sortBy === c.key ? 700 : 400, color: sortBy === c.key ? '#fff' : 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}
                    >
                      {c.format ? c.format(identity as any) : ((identity as any)[c.key]?.toLocaleString() || '0')}
                    </td>
                  ))}
                  <td style={{ textAlign: 'right', padding: '17px 24px 17px 10px', color: 'rgba(255,255,255,0.25)', fontSize: 9, whiteSpace: 'nowrap' }}>{formatRelativeTime(identity.lastSeenAt)}</td>
                </tr>
                {isSelected && (
                  <InlineUserDetail
                    key={`detail-${identity.id}`}
                    identity={identity}
                    onClose={() => onSelectIdentity(null)}
                    onStartLink={onStartLink}
                    onUnlink={onUnlink}
                    onSetPrimary={(acc) => onSetPrimary(identity, acc)}
                    colSpan={totalCols}
                  />
                )}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </div>

      {/* Pagination bar */}
      {filteredIdentities.length > PAGE_SIZE && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 24px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <span style={{ fontSize: 9, letterSpacing: '0', color: 'rgba(255,255,255,0.25)', fontWeight: 600 }}>
            {startIdx + 1}–{endIdx} of {filteredIdentities.length} users
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={safePageIndex === 0}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: 'none', border: 'none', color: safePageIndex === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)', cursor: safePageIndex === 0 ? 'not-allowed' : 'pointer' }}
            >
              <IconChevronLeft size={15} />
            </button>
            <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', color: 'rgba(255,255,255,0.4)', padding: '0 6px', userSelect: 'none' }}>
              {safePageIndex + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={safePageIndex >= totalPages - 1}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: 'none', border: 'none', color: safePageIndex >= totalPages - 1 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)', cursor: safePageIndex >= totalPages - 1 ? 'not-allowed' : 'pointer' }}
            >
              <IconChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
