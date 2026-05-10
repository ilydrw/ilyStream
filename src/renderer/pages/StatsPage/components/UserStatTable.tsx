import {IconSearch, IconUsers, IconLink as LinkIcon} from '@tabler/icons-react'
import type { UserIdentity, UserStatSortKey, UserStat } from '../../../shared/stats'
import type { Platform } from '../../../main/platforms/types'
import { Avatar } from '../../../components/ui/Avatar'
import { TikTokHeartIcon } from '../../../components/ui/TikTokHeartIcon'
import { PlatformLogo } from '../../../components/platforms/PlatformLogo'
import { formatRelativeTime } from '../utils'

const PLATFORMS: Platform[] = ['tiktok', 'twitch', 'youtube', 'kick']
const PLATFORM_LABELS: Record<Platform, string> = {
  tiktok: 'TikTok',
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick'
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
  onSelectIdentity: (id: string) => void
  onLink: (target: UserStat) => void
  onCancelLink: () => void
  isRelevant: (platform: Platform | 'all', key: UserStatSortKey) => boolean
  SORT_COLUMNS: any[]
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
  isRelevant,
  SORT_COLUMNS
}: UserStatTableProps) {
  return (
    <div className="app-section-card glass !p-0">
      <div className="app-section-head">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center text-accent">
            {activePlatformTab === 'all' ? (
              <IconUsers size={32} />
            ) : (
              <div className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl ring-1 ring-white/20">
                <PlatformLogo platform={activePlatformTab as Platform} size={28} />
              </div>
            )}
          </div>
          <div>
            <h2>Top users</h2>
            <p>Sorted by {sortBy.toLowerCase()} · {isLinking ? 'select target to link' : 'click for breakdown'}</p>
            {isLinking && (
              <div className="mt-2 px-3 py-1.5 bg-yellow-500/20 text-yellow-400 text-[10px] font-bold rounded-xl flex items-center gap-2 border border-yellow-500/20">
                <LinkIcon size={12} />
                LINKING @{linkSource?.username} ({linkSource?.platform})
                <button onClick={onCancelLink} className="ml-auto hover:text-white uppercase">Cancel</button>
              </div>
            )}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <div className="relative">
            <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search users..."
              className="pl-9 pr-3 py-2 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-white/80 placeholder:text-white/30 focus:outline-none focus:border-accent/40 w-44"
            />
          </div>
          <select
            value={platform}
            onChange={(e) => onPlatformChange(e.target.value as Platform | 'all')}
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
            onChange={(e) => onSortChange(e.target.value as UserStatSortKey)}
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
                  onClick={() => onSortChange(c.key)}
                >
                  {c.short}
                </th>
              ))}
              <th className="text-right font-black py-3 pr-0">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {identities.length === 0 && !loading && (
              <tr>
                <td colSpan={10} className="text-center text-white/30 py-12 text-sm">
                  No users tracked yet — fire up a stream and let the events roll in.
                </td>
              </tr>
            )}
            {identities.map((identity, idx) => (
              <tr
                key={identity.id}
                onClick={() => {
                  if (isLinking) {
                    onLink(identity.accounts[0])
                  } else {
                    onSelectIdentity(identity.id)
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
                <td className="text-right py-3 pr-0 text-white/30 text-[10px]">{formatRelativeTime(identity.lastSeenAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
