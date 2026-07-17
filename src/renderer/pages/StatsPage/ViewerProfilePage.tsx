import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { IconCheck, IconChevronLeft, IconExternalLink, IconPencil, IconStar, IconStarFilled, IconX } from '@tabler/icons-react'
import { Avatar } from '../../components/ui/Avatar'
import { PlatformLogo } from '../../components/platforms/PlatformLogo'
import type { UserIdentity } from '../../../shared/stats'
import type { Platform } from '../../../main/platforms/types'
import { formatCurrency, formatRelativeTime } from './utils'
import { buildIdentityBadges, BadgeChip } from '../../components/badges/BadgeUtils'
import { platformNames } from '../../lib/audience-labels'
import { sortPlatformsByDisplayOrder } from '../../lib/platform-order'
import { ViewerPersonalizationSection } from './components/ViewerPersonalizationSection'

function getProfileUrl(platform: string, username: string): string {
  switch (platform) {
    case 'tiktok': return `https://tiktok.com/@${username}`
    case 'twitch': return `https://twitch.tv/${username}`
    case 'youtube': return `https://youtube.com/@${username}`
    case 'kick': return `https://kick.com/${username}`
    default: return '#'
  }
}

export default function ViewerProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [identity, setIdentity] = useState<UserIdentity | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEditingName, setIsEditingName] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [savingPrimary, setSavingPrimary] = useState<string | null>(null)
  const [linkingSuggestion, setLinkingSuggestion] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Array<{ platform: Platform; username: string; displayName: string; profilePictureUrl: string | null; similarity: number; profileId: string | null }>>([])

  const loadIdentity = () => {
    if (!id) return
    setLoading(true)
    window.api.stats.getIdentity(id).then((res) => {
      setIdentity(res)
      setDraftName(res?.displayName || '')
      setLoading(false)
      if (res && res.id) {
        window.api.stats.getLinkSuggestions(res.id).then(setSuggestions).catch(console.error)
      }
    }).catch(err => {
      console.error('Failed to fetch identity:', err)
      setLoading(false)
    })
  }

  useEffect(() => {
    loadIdentity()
  }, [id])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0a0b0e]">
        <div className="w-8 h-8 border-2 border-accent/20 border-t-accent rounded-full animate-spin" />
      </div>
    )
  }

  if (!identity) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-[#0a0b0e] text-white/50">
        <div className="text-lg font-semibold">Viewer not found</div>
        <button
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white"
          onClick={() => navigate('/stats')}
        >
          <IconChevronLeft size={16} /> Back to audience
        </button>
      </div>
    )
  }

  const sortedAccounts = [...identity.accounts].sort((a, b) => b.totalChats - a.totalChats)
  const profileId = identity.accounts.find(account => account.profileId)?.profileId || (!identity.id.includes(':') ? identity.id : null)
  const ranks = identity.ranks

  // Subtle header tint derived from the primary platform (not the brand gradient).
  let primaryColor = '120, 120, 130'
  switch (identity.primaryPlatform) {
    case 'tiktok': primaryColor = '0, 200, 255'; break
    case 'twitch': primaryColor = '145, 70, 255'; break
    case 'youtube': primaryColor = '255, 60, 60'; break
    case 'kick': primaryColor = '83, 252, 24'; break
  }

  const badges = buildIdentityBadges(identity, 10, 20)

  const ensureEditableProfile = async (): Promise<string | null> => {
    if (profileId) return profileId

    const profile = await window.api.stats.createViewerProfile({
      displayName: identity.displayName,
      profilePictureUrl: identity.profilePictureUrl,
      primaryPlatform: identity.primaryPlatform,
      primaryUsername: identity.primaryUsername ?? identity.accounts.find((account) => account.platform === identity.primaryPlatform)?.username ?? identity.accounts[0]?.username,
      accounts: identity.accounts.map((account) => ({
        platform: account.platform,
        username: account.username,
        platformUserId: account.platformUserId ?? null,
        displayName: account.displayName,
        profilePictureUrl: account.profilePictureUrl
      }))
    })

    return profile?.id || null
  }

  const saveName = async () => {
    const nextName = draftName.trim()
    if (!nextName) {
      setIsEditingName(false)
      setDraftName(identity.displayName)
      return
    }
    const editableProfileId = await ensureEditableProfile()
    if (!editableProfileId) {
      setIsEditingName(false)
      setDraftName(identity.displayName)
      return
    }
    await window.api.stats.updateViewerProfile(editableProfileId, { displayName: nextName })
    setIsEditingName(false)
    if (editableProfileId !== profileId) {
      navigate(`/stats/viewer/${editableProfileId}`, { replace: true })
      return
    }
    loadIdentity()
  }

  const setPrimaryAccount = async (account: UserIdentity['accounts'][number]) => {
    const editableProfileId = await ensureEditableProfile()
    if (!editableProfileId) return

    const key = `${account.platform}:${account.username}`
    setSavingPrimary(key)
    try {
      await window.api.stats.updateViewerProfile(editableProfileId, {
        primaryPlatform: account.platform,
        primaryUsername: account.username,
        displayName: account.displayName || account.username,
        profilePictureUrl: account.profilePictureUrl ?? null
      })
      if (editableProfileId !== profileId) {
        navigate(`/stats/viewer/${editableProfileId}`, { replace: true })
        return
      }
      loadIdentity()
    } finally {
      setSavingPrimary(null)
    }
  }

  const linkSuggestedAccount = async (suggestion: typeof suggestions[number]) => {
    const editableProfileId = await ensureEditableProfile()
    if (!editableProfileId) return

    const key = `${suggestion.platform}:${suggestion.username}`
    setLinkingSuggestion(key)
    try {
      await window.api.stats.addViewerAccount(editableProfileId, {
        platform: suggestion.platform,
        username: suggestion.username,
        displayName: suggestion.displayName,
        profilePictureUrl: suggestion.profilePictureUrl
      })
      if (editableProfileId !== profileId) {
        navigate(`/stats/viewer/${editableProfileId}`, { replace: true })
        return
      }
      loadIdentity()
    } finally {
      setLinkingSuggestion(null)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0a0b0e] overflow-y-auto custom-scrollbar relative z-50">
      {/* Sticky breadcrumb bar */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/[0.05] bg-[#0a0b0e]/85 px-6 py-3 backdrop-blur-md">
        <button
          onClick={() => navigate('/stats')}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          <IconChevronLeft size={18} />
        </button>
        <span className="text-[13px] font-semibold text-white/40">Audience</span>
        <span className="text-white/20">/</span>
        <span className="truncate text-[13px] font-semibold text-white">{identity.displayName}</span>
      </div>

      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        {/* Profile header card */}
        <div className="relative mb-8 overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <div className="h-20" style={{ background: `linear-gradient(180deg, rgba(${primaryColor}, 0.20) 0%, transparent 100%)` }} />
          <div className="flex flex-col gap-6 px-7 pb-7 sm:flex-row sm:items-end">
            <div className="-mt-12 shrink-0 rounded-full ring-4 ring-[#0a0b0e]">
              <Avatar url={identity.profilePictureUrl} name={identity.displayName} size="xl" />
            </div>

            <div className="min-w-0 flex-1">
              {/* Name */}
              <div className="mb-3 flex items-center gap-2.5">
                {isEditingName ? (
                  <>
                    <input
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void saveName()
                        if (event.key === 'Escape') { setDraftName(identity.displayName); setIsEditingName(false) }
                      }}
                      autoFocus
                      className="h-10 max-w-[min(480px,60vw)] rounded-lg border border-white/12 bg-white/[0.06] px-3 text-2xl font-bold tracking-tight text-white outline-none focus:border-accent/60"
                    />
                    <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-accent text-black transition-colors hover:bg-accent-hover" onClick={() => void saveName()} title="Save nickname">
                      <IconCheck size={16} />
                    </button>
                    <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/55 hover:text-white" onClick={() => { setDraftName(identity.displayName); setIsEditingName(false) }} title="Cancel">
                      <IconX size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    <h1 className="truncate text-3xl font-bold tracking-tight text-white">{identity.displayName}</h1>
                    <button
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white"
                      onClick={() => { setDraftName(identity.displayName); setIsEditingName(true) }}
                      title="Edit nickname"
                    >
                      <IconPencil size={15} />
                    </button>
                  </>
                )}
              </div>

              {/* Platform glyphs + meta */}
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] font-medium text-white/40">
                <span className="flex items-center gap-1.5">
                  {sortPlatformsByDisplayOrder(identity.allPlatforms).map((p) => (
                    <span key={p} className="flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-black/30">
                      <PlatformLogo platform={p} size={11} />
                    </span>
                  ))}
                </span>
                <span className="h-1 w-1 rounded-full bg-white/15" />
                <span>Joined {formatRelativeTime(identity.firstSeenAt ?? null)}</span>
                <span className="h-1 w-1 rounded-full bg-white/15" />
                <span>Last seen {formatRelativeTime(identity.lastSeenAt)}</span>
              </div>

              {/* Badges */}
              {badges.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {badges.map(badge => (
                    <BadgeChip key={badge.key} badge={badge} />
                  ))}
                </div>
              )}
            </div>

            {/* Overall ranking */}
            <div className="shrink-0 sm:pb-1 sm:text-right">
              <div className="text-[10px] font-semibold text-white/35">Overall rank</div>
              <div className="mt-1 text-[42px] font-extrabold leading-none text-accent tabular-nums">
                {typeof identity.overallRank === 'number' && identity.overallRank > 0 ? `#${identity.overallRank}` : '—'}
              </div>
              <div className="mt-2 text-[11px] font-medium text-white/40">across all categories</div>
            </div>
          </div>
        </div>

        {/* Lifetime activity */}
        <h2 className="mb-4 text-[13px] font-semibold tracking-tight text-white/55">Lifetime activity</h2>
        <div className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Chats" value={identity.totalChats.toLocaleString()} color="255, 255, 255" rank={ranks?.totalChats} />
          <StatCard label="Likes" value={identity.totalLikes.toLocaleString()} color="244, 114, 182" rank={ranks?.totalLikes} />
          <StatCard label="Gifts" value={identity.totalGifts.toLocaleString()} color="253, 224, 71" rank={ranks?.totalGifts} />
          <StatCard label="Revenue" value={formatCurrency(identity.totalGiftValueCents)} color="52, 211, 153" rank={ranks?.totalGiftValueCents} />
          <StatCard label="Shares" value={identity.totalShares.toLocaleString()} color="34, 211, 238" rank={ranks?.totalShares} />
          <StatCard label="Raids" value={identity.totalRaids.toLocaleString()} color="251, 146, 60" rank={ranks?.totalRaids} />
          <StatCard label="Songs" value={identity.totalSongRequests.toLocaleString()} color="74, 222, 128" rank={ranks?.totalSongRequests} />
          <StatCard label="AI calls" value={(identity.totalCohostCalls || 0).toLocaleString()} color="239, 68, 68" rank={ranks?.totalCohostCalls} />
        </div>

        {/* Personalization: per-viewer TTS voice + join sound */}
        <ViewerPersonalizationSection
          profileId={profileId}
          displayName={identity.displayName}
          accounts={identity.accounts.map((account) => ({ platform: account.platform, username: account.username }))}
          ensureProfileId={ensureEditableProfile}
          onProfileCreated={(newProfileId) => navigate(`/stats/viewer/${newProfileId}`, { replace: true })}
        />

        {/* Connected accounts */}
        <h2 className="mb-4 mt-10 text-[13px] font-semibold tracking-tight text-white/55">Connected accounts</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {sortedAccounts.map((acc) => {
            const url = getProfileUrl(acc.platform, acc.username)
            const isPrimary = identity.primaryUsername
              ? acc.platform === identity.primaryPlatform && acc.username === identity.primaryUsername
              : acc.platform === identity.primaryPlatform && identity.accounts.find((candidate) => candidate.platform === identity.primaryPlatform)?.username === acc.username
            const accountKey = `${acc.platform}:${acc.username}`
            return (
              <div key={accountKey} className={`group rounded-xl border p-5 transition-colors ${isPrimary ? 'border-accent/35 bg-accent/[0.04]' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.035]'}`}>
                <div className="mb-5 flex items-start justify-between">
                  <div className="flex items-center gap-3.5">
                    <div className="relative shrink-0">
                      <Avatar url={acc.profilePictureUrl} name={acc.displayName || acc.username} size="lg" />
                      <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-[#0a0b0e] bg-[#111318]">
                        <PlatformLogo platform={acc.platform} size={11} />
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-bold leading-tight text-white">{acc.displayName || acc.username}</div>
                      <div className="mt-0.5 truncate text-[12px] font-medium text-white/40">@{acc.username}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={isPrimary || savingPrimary === accountKey}
                      onClick={() => void setPrimaryAccount(acc)}
                      className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-bold transition-colors disabled:cursor-default ${isPrimary ? 'border-accent/40 bg-accent/20 text-accent' : 'border-white/[0.08] bg-white/[0.03] text-white/50 hover:bg-white/[0.08] hover:text-white'}`}
                      title={isPrimary ? 'Primary account' : 'Make this account primary'}
                    >
                      {isPrimary ? <IconStarFilled size={14} /> : <IconStar size={14} />}
                      {isPrimary ? 'Primary' : 'Make primary'}
                    </button>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white"
                      title={`Open ${acc.username} on ${platformNames[acc.platform]}`}
                    >
                      <IconExternalLink size={16} />
                    </a>
                  </div>
                </div>

                <div className={`grid ${acc.platform === 'twitch' ? 'grid-cols-2' : 'grid-cols-3'} gap-2`}>
                  <MiniStat label="Chats" value={acc.totalChats.toLocaleString()} />
                  {acc.platform !== 'twitch' && <MiniStat label="Likes" value={acc.totalLikes.toLocaleString()} />}
                  <MiniStat label="Gifts" value={acc.totalGifts.toLocaleString()} />
                </div>
              </div>
            )
          })}
        </div>

        {/* Suggested connections */}
        {suggestions.length > 0 && (
          <>
            <h2 className="mb-4 mt-10 flex items-center gap-2 text-[13px] font-semibold tracking-tight text-accent">
              Suggested connections
              <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold">{suggestions.length}</span>
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {suggestions.map((s) => (
                <div key={`${s.platform}:${s.username}`} className="flex items-center justify-between gap-3 rounded-xl border border-accent/20 bg-accent/[0.04] p-4 transition-colors hover:border-accent/40 hover:bg-accent/[0.07]">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar url={s.profilePictureUrl} name={s.displayName} size="md" />
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-bold leading-tight text-white">{s.displayName || s.username}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] font-medium text-white/40">
                        <PlatformLogo platform={s.platform} size={11} />
                        @{s.username}
                        <span className="text-white/25">· {Math.round(s.similarity * 100)}% match</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={linkingSuggestion === `${s.platform}:${s.username}`}
                    onClick={() => void linkSuggestedAccount(s)}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent/20 px-3.5 py-2 text-[13px] font-bold text-accent transition-colors hover:bg-accent hover:text-black disabled:cursor-wait disabled:opacity-60"
                  >
                    <IconCheck size={15} />
                    {linkingSuggestion === `${s.platform}:${s.username}` ? 'Linking' : 'Link'}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, color, rank }: { label: string, value: React.ReactNode, color: string, rank?: number }) {
  const medal = rank === 1 ? '#FBBF24' : rank === 2 ? '#CBD5E1' : rank === 3 ? '#CD7F32' : null
  return (
    <div className="group relative overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 transition-colors hover:border-white/[0.14] hover:bg-white/[0.035]">
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-40"
        style={{ background: `linear-gradient(90deg, transparent 0%, rgb(${color}) 50%, transparent 100%)` }}
      />
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-semibold tracking-tight text-white/40">{label}</div>
        {typeof rank === 'number' && rank > 0 && (
          <span
            className="rounded-md border px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums"
            style={{
              color: medal ?? 'rgba(255,255,255,0.4)',
              borderColor: medal ? `${medal}55` : 'rgba(255,255,255,0.1)',
              background: medal ? `${medal}14` : 'rgba(255,255,255,0.04)'
            }}
          >
            #{rank}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold tabular-nums tracking-tight" style={{ color: `rgb(${color})` }}>{value}</div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string, value: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-white/[0.04] bg-black/20 px-2 py-3">
      <div className="mb-1 text-[10px] font-semibold text-white/35">{label}</div>
      <div className="text-[15px] font-bold tabular-nums text-white">{value}</div>
    </div>
  )
}
