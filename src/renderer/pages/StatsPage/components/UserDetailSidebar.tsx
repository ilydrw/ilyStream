import {IconTrash, IconLink as LinkIcon, IconUnlink, IconMessage, IconSwords} from '@tabler/icons-react'
import type { UserIdentity, UserStat } from '../../../shared/stats'
import type { Platform } from '../../../main/platforms/types'
import { Avatar } from '../../../components/ui/Avatar'
import { TikTokHeartIcon } from '../../../components/ui/TikTokHeartIcon'
import { PlatformLogo } from '../../../components/platforms/PlatformLogo'

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick'
}

interface UserDetailSidebarProps {
  identity: UserIdentity | null
  onClose: () => void
  onStartLink: (user: UserStat) => void
  onUnlink: (platform: Platform, username: string) => void
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

export function UserDetailSidebar({ identity, onClose, onStartLink, onUnlink }: UserDetailSidebarProps) {
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
          <IconTrash size={16} />
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
                  <IconUnlink size={14} />
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
          icon={<IconMessage size={12} className="text-white/60" />} 
          label="Total Chats" 
          value={identity.totalChats.toLocaleString()} 
        />
        <DetailRow 
          icon={<IconSwords size={12} className="text-orange-400" />} 
          label="Total Raids" 
          value={identity.totalRaids.toLocaleString()} 
        />
      </div>
    </div>
  )
}
