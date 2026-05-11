import React, { useState, useEffect } from 'react'
import {IconSearch, IconUsers, IconLink as LinkIcon, IconUnlink, IconChevronLeft, IconChevronRight, IconChevronDown, IconX} from '@tabler/icons-react'
import type { UserIdentity, UserStatSortKey, UserStat } from '../../../shared/stats'
import type { Platform } from '../../../main/platforms/types'
import { Avatar } from '../../../components/ui/Avatar'
import { TikTokHeartIcon } from '../../../components/ui/TikTokHeartIcon'
import { PlatformLogo } from '../../../components/platforms/PlatformLogo'
import { formatRelativeTime, formatCurrency } from '../utils'

const PLATFORMS: Platform[] = ['tiktok', 'twitch', 'youtube', 'kick']
const PLATFORM_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick'
}

const PAGE_SIZE = 50

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
  isRelevant: (platform: Platform | 'all', key: UserStatSortKey) => boolean
  SORT_COLUMNS: any[]
}

function InlineMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '6px 10px', minWidth: 0 }}>
      <div style={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.2)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, letterSpacing: '-0.02em', color: color }}>{value}</div>
    </div>
  )
}

function InlineUserDetail({ 
  identity, 
  onClose, 
  onStartLink, 
  onUnlink, 
  colSpan 
}: { 
  identity: UserIdentity
  onClose: () => void
  onStartLink: (user: UserStat) => void
  onUnlink: (platform: Platform, username: string) => void
  colSpan: number
}) {
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
                    {identity.isFanClubMember && <TikTokHeartIcon size={14} className="shrink-0" />}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                    {identity.allPlatforms.map(p => (
                      <div key={p} style={{ padding: 2, background: 'rgba(0,0,0,0.3)', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <PlatformLogo platform={p} size={10} />
                      </div>
                    ))}
                    <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.2)', marginLeft: 2 }}>
                      {identity.accounts.length > 1 ? 'Unified Identity' : PLATFORM_LABELS[identity.primaryPlatform]}
                    </span>
                  </div>
                </div>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                style={{ padding: 6, background: 'none', border: 'none', borderRadius: 6, color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.color = '#fff'; (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.3)'; (e.target as HTMLElement).style.background = 'none'; }}
              >
                <IconX size={14} />
              </button>
            </div>

            {/* Stat chips row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              <InlineMetric label="Likes" value={identity.totalLikes.toLocaleString()} color="#f472b6" />
              <InlineMetric label="Gifts" value={identity.totalGifts.toLocaleString()} color="#fde047" />
              <InlineMetric label="Earnings" value={formatCurrency(identity.totalGiftValueCents)} color="#34d399" />
              <InlineMetric label="Subs" value={identity.totalSubscriptions.toLocaleString()} color="#c084fc" />
              <InlineMetric label="Follows" value={identity.totalFollows.toLocaleString()} color="#60a5fa" />
              <InlineMetric label="Chats" value={identity.totalChats.toLocaleString()} color="rgba(255,255,255,0.6)" />
              <InlineMetric label="Songs" value={identity.totalSongRequests.toLocaleString()} color="#4ade80" />
              <InlineMetric label="Raids" value={identity.totalRaids.toLocaleString()} color="#fb923c" />
              <InlineMetric label="Shares" value={identity.totalShares.toLocaleString()} color="#22d3ee" />
            </div>

            {/* Linked accounts row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(255,255,255,0.2)', marginRight: 2 }}>Accounts</span>
              {identity.accounts.map(acc => (
                <div 
                  key={`${acc.platform}-${acc.username}`} 
                  className="group"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, paddingLeft: 8, paddingRight: 4, paddingTop: 5, paddingBottom: 5, fontSize: 11 }}
                >
                  <PlatformLogo platform={acc.platform} size={14} />
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>@{acc.username}</span>
                  <div className="flex items-center gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => { e.stopPropagation(); onStartLink(acc); }}
                      className="p-1 hover:bg-accent/20 rounded text-white/30 hover:text-accent transition-all"
                      title="Link with another account"
                    >
                      <LinkIcon size={12} />
                    </button>
                    {identity.accounts.length > 1 && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); onUnlink(acc.platform, acc.username); }}
                        className="p-1 hover:bg-red-500/20 rounded text-white/30 hover:text-red-400 transition-all"
                        title="Unlink this account"
                      >
                        <IconUnlink size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {identity.accounts.length < 5 && (
                <button 
                  onClick={(e) => { e.stopPropagation(); onStartLink(identity.accounts[0]); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', background: 'none', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 8, color: 'rgba(255,255,255,0.2)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer' }}
                  className="hover:border-accent/40 hover:text-accent/60 transition-all"
                >
                  <LinkIcon size={10} />
                  Link
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
  isRelevant,
  SORT_COLUMNS
}: UserStatTableProps) {
  const [page, setPage] = useState(0)

  // Reset to first page when filters/sort/search change
  useEffect(() => {
    setPage(0)
  }, [sortBy, platform, query, activePlatformTab])

  const totalPages = Math.max(1, Math.ceil(identities.length / PAGE_SIZE))
  const safePageIndex = Math.min(page, totalPages - 1)
  const startIdx = safePageIndex * PAGE_SIZE
  const endIdx = Math.min(startIdx + PAGE_SIZE, identities.length)
  const pageIdentities = identities.slice(startIdx, endIdx)

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
            <h2>Top users</h2>
            <p>Sorted by {sortBy.replace('total', '').toLowerCase()} · {isLinking ? 'select target to link' : 'click to expand'}</p>
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
          {/* Search */}
          <div className="relative flex items-center group">
            <IconSearch size={16} className="absolute left-4 text-white/20 group-focus-within:text-accent transition-colors" />
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search users..."
              className="h-11 bg-white/[0.03] border border-white/5 rounded-2xl pl-12 pr-4 text-xs font-bold text-white placeholder:text-white/20 focus:bg-white/[0.05] focus:border-white/10 outline-none transition-all"
              style={{ width: 320 }}
            />
          </div>
          {/* Platform filter */}
          <select
            value={platform}
            onChange={(e) => onPlatformChange(e.target.value as Platform | 'all')}
            className="h-11 bg-white/[0.03] border border-white/5 rounded-2xl px-4 text-xs font-bold text-white/80 focus:bg-white/[0.05] focus:border-white/10 outline-none transition-all cursor-pointer hover:text-white"
          >
            <option value="all">All platforms</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>
          {/* Sort select */}
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as UserStatSortKey)}
            className="h-11 bg-white/[0.03] border border-white/5 rounded-2xl px-4 text-xs font-bold text-white/80 focus:bg-white/[0.05] focus:border-white/10 outline-none transition-all cursor-pointer hover:text-white"
          >
            {SORT_COLUMNS.filter(c => isRelevant(platform, c.key)).map((c) => (
              <option key={c.key} value={c.key}>
                Sort by {c.label.toLowerCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Results Table */}
      <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: 12, overflow: 'hidden', minHeight: 400 }}>
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.25)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
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
                No users tracked yet — fire up a stream and let the events roll in.
              </td>
            </tr>
          )}
          {pageIdentities.map((identity, idx) => {
            const isSelected = selectedIdentityId === identity.id
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
                  <td style={{ padding: '8px 0 8px 24px', color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-mono, monospace)', fontSize: 10, width: 42 }}>{startIdx + idx + 1}</td>
                  <td style={{ padding: '8px 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <Avatar url={identity.profilePictureUrl} name={identity.displayName} size="sm" />
                      <span style={{ color: '#fff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{identity.displayName}</span>
                      {identity.isFanClubMember && (
                        <TikTokHeartIcon size={11} className="shrink-0" />
                      )}
                      <IconChevronDown 
                        size={10} 
                        style={{ flexShrink: 0, color: isSelected ? 'var(--color-accent)' : 'rgba(255,255,255,0.15)', transition: 'transform 0.2s ease, color 0.2s ease', transform: isSelected ? 'rotate(180deg)' : 'none' }}
                      />
                    </div>
                  </td>
                  <td style={{ padding: '8px 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {identity.allPlatforms.map(p => (
                        <PlatformLogo key={p} platform={p} size={16} />
                      ))}
                    </div>
                  </td>
                  {activeSortColumns.map((c) => (
                    <td
                      key={c.key}
                      style={{ textAlign: 'right', padding: '8px 10px', fontFamily: 'var(--font-mono, monospace)', fontVariantNumeric: 'tabular-nums', fontWeight: sortBy === c.key ? 700 : 400, color: sortBy === c.key ? '#fff' : 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}
                    >
                      {(identity as any)[c.key]?.toLocaleString() || '0'}
                    </td>
                  ))}
                  <td style={{ textAlign: 'right', padding: '8px 24px 8px 10px', color: 'rgba(255,255,255,0.25)', fontSize: 9, whiteSpace: 'nowrap' }}>{formatRelativeTime(identity.lastSeenAt)}</td>
                </tr>
                {isSelected && (
                  <InlineUserDetail 
                    key={`detail-${identity.id}`}
                    identity={identity} 
                    onClose={() => onSelectIdentity(null)} 
                    onStartLink={onStartLink}
                    onUnlink={onUnlink}
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
      {identities.length > PAGE_SIZE && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 24px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.25)', fontWeight: 900 }}>
            {startIdx + 1}–{endIdx} of {identities.length} users
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={safePageIndex === 0}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: 'none', border: 'none', color: safePageIndex === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)', cursor: safePageIndex === 0 ? 'not-allowed' : 'pointer' }}
            >
              <IconChevronLeft size={15} />
            </button>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono, monospace)', fontVariantNumeric: 'tabular-nums', color: 'rgba(255,255,255,0.4)', padding: '0 6px', userSelect: 'none' }}>
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
