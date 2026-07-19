import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { IconCheck, IconChevronLeft, IconExternalLink, IconPencil, IconStar, IconStarFilled, IconX, IconMessageCircle, IconHeart, IconGift, IconCurrencyDollar, IconShare, IconSwords, IconMusic, IconPhone, IconTrophy, IconUsers, IconClock, IconCalendarPlus } from '@tabler/icons-react'
import { Avatar } from '../../components/ui/Avatar'
import { PlatformLogo } from '../../components/platforms/PlatformLogo'
import type { UserIdentity } from '../../../shared/stats'
import type { Platform } from '../../../main/platforms/types'
import { formatCurrency, formatRelativeTime } from './utils'
import { buildIdentityBadges, BadgeChip } from '../../components/badges/BadgeUtils'
import { platformNames } from '../../lib/audience-labels'
import { ViewerPersonalizationSection } from './components/ViewerPersonalizationSection'
import type { TTSUserVoiceOverride, ViewerJoinSound } from '../../../shared/app-settings'
import { resolveAppSettings } from '../../../shared/app-settings'

function sortPlatformsByDisplayOrder(platforms: Platform[]): Platform[] {
  const order: Platform[] = ['twitch', 'youtube', 'tiktok', 'kick']
  return [...platforms].sort((a, b) => {
    let ia = order.indexOf(a); if (ia === -1) ia = 999
    let ib = order.indexOf(b); if (ib === -1) ib = 999
    return ia - ib
  })
}

function generatePlatformProfileUrl(platform: Platform, username: string): string {
  switch (platform) {
    case 'tiktok': return `https://tiktok.com/@${username}`
    case 'twitch': return `https://twitch.tv/${username}`
    case 'youtube': return `https://youtube.com/@${username}`
    case 'kick': return `https://kick.com/${username}`
    default: return '#'
  }
}

type ProfileTab = 'activity' | 'accounts' | 'personalization'

export default function ViewerProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [identity, setIdentity] = useState<UserIdentity | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEditingName, setIsEditingName] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftPrimaryAccount, setDraftPrimaryAccount] = useState<UserIdentity['accounts'][number] | null>(null)
  const [originalSettings, setOriginalSettings] = useState<{ ttsUserVoiceOverrides: TTSUserVoiceOverride[], viewerJoinSounds: ViewerJoinSound[] } | null>(null)
  const [draftVoiceOverrides, setDraftVoiceOverrides] = useState<TTSUserVoiceOverride[] | null>(null)
  const [draftJoinSounds, setDraftJoinSounds] = useState<ViewerJoinSound[] | null>(null)
  const [savingAll, setSavingAll] = useState(false)
  const [linkingSuggestion, setLinkingSuggestion] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Array<{ platform: Platform; username: string; displayName: string; profilePictureUrl: string | null; similarity: number; profileId: string | null }>>([])
  const [activeTab, setActiveTab] = useState<ProfileTab>('activity')

  const loadIdentityAndSettings = async () => {
    if (!id) return
    setLoading(true)
    try {
      const [res, settingsRaw] = await Promise.all([
        window.api.stats.getIdentity(id),
        window.api.settings.getAll()
      ])
      const resolvedSettings = resolveAppSettings((settingsRaw || {}) as Record<string, any>)
      setIdentity(res)
      setDraftName(res?.displayName || '')
      setDraftPrimaryAccount(null)

      const settings = {
        ttsUserVoiceOverrides: resolvedSettings.ttsUserVoiceOverrides || [],
        viewerJoinSounds: resolvedSettings.viewerJoinSounds || []
      }
      setOriginalSettings(settings)
      setDraftVoiceOverrides(settings.ttsUserVoiceOverrides)
      setDraftJoinSounds(settings.viewerJoinSounds)

      if (res && res.id) {
        window.api.stats.getLinkSuggestions(res.id).then(setSuggestions).catch(console.error)
      }
    } catch (err) {
      console.error('Failed to fetch identity/settings:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadIdentityAndSettings()
  }, [id])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="w-8 h-8 border-2 border-accent/20 border-t-accent rounded-full animate-spin" />
      </div>
    )
  }

  if (!identity) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-white/50" style={{ background: 'var(--bg-base)' }}>
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
  const badges = buildIdentityBadges(identity, 10, 20)

  const ensureEditableProfile = async (): Promise<string | null> => {
    if (profileId) return profileId
    const profile = await window.api.stats.createViewerProfile({
      displayName: identity.displayName,
      profilePictureUrl: identity.profilePictureUrl,
      primaryPlatform: identity.primaryPlatform,
      primaryUsername: identity.primaryUsername ?? identity.accounts.find((a) => a.platform === identity.primaryPlatform)?.username ?? identity.accounts[0]?.username,
      accounts: identity.accounts.map((a) => ({
        platform: a.platform, username: a.username, platformUserId: a.platformUserId ?? null,
        displayName: a.displayName, profilePictureUrl: a.profilePictureUrl
      }))
    })
    return profile?.id || null
  }

  const saveNameDraft = () => {
    setIsEditingName(false)
  }

  const setPrimaryAccount = (account: UserIdentity['accounts'][number]) => {
    setDraftPrimaryAccount(account)
    setDraftName(account.displayName || account.username)
  }

  const linkSuggestedAccount = async (suggestion: typeof suggestions[number]) => {
    const pid = await ensureEditableProfile()
    if (!pid) return
    const key = `${suggestion.platform}:${suggestion.username}`
    setLinkingSuggestion(key)
    try {
      await window.api.stats.addViewerAccount(pid, {
        platform: suggestion.platform, username: suggestion.username,
        displayName: suggestion.displayName, profilePictureUrl: suggestion.profilePictureUrl
      })
      if (pid !== profileId) { navigate(`/stats/viewer/${pid}`, { replace: true }); return }
      loadIdentityAndSettings()
    } finally { setLinkingSuggestion(null) }
  }

  const originalPrimaryUsername = identity.primaryUsername
    ?? identity.accounts.find(a => a.platform === identity.primaryPlatform)?.username
    ?? identity.accounts[0]?.username

  const primaryUsername = draftPrimaryAccount?.username ?? originalPrimaryUsername
  const primaryPlatform = draftPrimaryAccount?.platform ?? identity.primaryPlatform
  const displayProfilePictureUrl = draftPrimaryAccount?.profilePictureUrl ?? identity.profilePictureUrl

  const isNameChanged = draftName.trim() !== identity.displayName && draftName.trim() !== ''
  const isPrimaryChanged = draftPrimaryAccount !== null &&
    (draftPrimaryAccount.platform !== identity.primaryPlatform || draftPrimaryAccount.username !== originalPrimaryUsername)
  const isOverridesChanged = JSON.stringify(draftVoiceOverrides) !== JSON.stringify(originalSettings?.ttsUserVoiceOverrides)
  const isJoinSoundsChanged = JSON.stringify(draftJoinSounds) !== JSON.stringify(originalSettings?.viewerJoinSounds)

  const hasUnsavedChanges = isNameChanged || isPrimaryChanged || isOverridesChanged || isJoinSoundsChanged

  const discardAllChanges = () => {
    setDraftName(identity.displayName)
    setDraftPrimaryAccount(null)
    setDraftVoiceOverrides(originalSettings?.ttsUserVoiceOverrides || null)
    setDraftJoinSounds(originalSettings?.viewerJoinSounds || null)
  }

  const saveAllChanges = async () => {
    setSavingAll(true)
    try {
      const pid = await ensureEditableProfile()
      if (!pid) return

      const profilePatch: any = {}
      if (isPrimaryChanged && draftPrimaryAccount) {
        profilePatch.primaryPlatform = draftPrimaryAccount.platform
        profilePatch.primaryUsername = draftPrimaryAccount.username
        profilePatch.displayName = isNameChanged ? draftName.trim() : (draftPrimaryAccount.displayName || draftPrimaryAccount.username)
        profilePatch.profilePictureUrl = draftPrimaryAccount.profilePictureUrl ?? null
      } else if (isNameChanged) {
        profilePatch.displayName = draftName.trim()
      }

      if (Object.keys(profilePatch).length > 0) {
        await window.api.stats.updateViewerProfile(pid, profilePatch)
      }

      if (isOverridesChanged || isJoinSoundsChanged) {
        const settingsPatch: any = {}
        if (isOverridesChanged && draftVoiceOverrides) settingsPatch.ttsUserVoiceOverrides = draftVoiceOverrides
        if (isJoinSoundsChanged && draftJoinSounds) settingsPatch.viewerJoinSounds = draftJoinSounds
        await window.api.settings.setMany(settingsPatch)
      }

      if (pid !== profileId) {
        navigate(`/stats/viewer/${pid}`, { replace: true })
      } else {
        await loadIdentityAndSettings()
      }
    } finally {
      setSavingAll(false)
    }
  }

  const tabs: { key: ProfileTab; label: string; count?: number }[] = [
    { key: 'activity', label: 'Activity' },
    { key: 'accounts', label: 'Accounts', count: sortedAccounts.length },
    { key: 'personalization', label: 'Personalization' }
  ]

  const displayName = draftName || identity.displayName
  const accentRing = 'linear-gradient(135deg, rgba(var(--accent-rgb), 0.65), rgba(var(--accent-rgb), 0.12))'

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto custom-scrollbar relative z-50" style={{ background: 'var(--bg-base)' }}>

      {/* ── Breadcrumb bar ─────────────────────────────────── */}
      <div className="sticky top-0 z-30 flex items-center gap-3 px-6 py-3 backdrop-blur-xl" style={{ borderBottom: '1px solid var(--hairline)', background: 'rgba(20, 21, 24, 0.75)' }}>
        <button onClick={() => navigate('/stats')} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white">
          <IconChevronLeft size={18} />
        </button>
        <span className="text-[13px] font-medium text-white/35">Audience</span>
        <span className="text-white/15">/</span>
        <span className="truncate text-[13px] font-semibold text-white/80">{displayName}</span>
      </div>

      <div className="mx-auto w-full max-w-[960px] px-8 pb-16">

        {/* ── Banner + identity ────────────────────────────── */}
        <div
          className="mt-5 h-28 rounded-2xl"
          style={{
            border: '1px solid var(--hairline)',
            background: `radial-gradient(120% 140% at 15% 0%, rgba(var(--accent-rgb), 0.20), transparent 55%), radial-gradient(120% 160% at 95% 10%, rgba(var(--accent-rgb), 0.08), transparent 50%), var(--mat-thin)`
          }}
        />

        <div className="flex items-end gap-5 -mt-12 px-2">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="rounded-full p-[2.5px]" style={{ background: accentRing }}>
              <div className="rounded-full p-[3px]" style={{ background: 'var(--bg-base)' }}>
                <Avatar url={displayProfilePictureUrl} name={displayName} size="2xl" />
              </div>
            </div>
            <span className="absolute bottom-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-full shadow-lg" style={{ background: 'var(--bg-1)', border: '2.5px solid var(--bg-base)' }}>
              <PlatformLogo platform={primaryPlatform} size={15} />
            </span>
          </div>

          {/* Name + handle + badges */}
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex items-center gap-2 h-9">
              {isEditingName ? (
                <>
                  <input
                    value={draftName} onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveNameDraft(); if (e.key === 'Escape') { setDraftName(identity.displayName); setIsEditingName(false) } }}
                    autoFocus className="h-9 w-64 rounded-lg border px-3 text-xl font-bold text-white outline-none"
                    style={{ borderColor: 'var(--hairline-strong)', background: 'var(--mat-regular)' }}
                  />
                  <button className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-black transition-transform hover:scale-105" onClick={saveNameDraft} title="Save draft"><IconCheck size={15} /></button>
                  <button className="flex h-8 w-8 items-center justify-center rounded-full text-white/40 hover:text-white" style={{ background: 'var(--mat-thin)' }} onClick={() => { setDraftName(identity.displayName); setIsEditingName(false) }} title="Cancel"><IconX size={15} /></button>
                </>
              ) : (
                <>
                  <h1 className="truncate text-2xl font-bold tracking-tight text-white">{displayName}</h1>
                  {badges.length > 0 && (
                    <span className="flex items-center gap-1 shrink-0">
                      {badges.map(b => <BadgeChip key={b.key} badge={b} />)}
                    </span>
                  )}
                  <button className="flex shrink-0 items-center justify-center h-6 w-6 rounded-full text-white/30 hover:bg-white/[0.08] hover:text-white transition-colors" onClick={() => { setDraftName(draftName || identity.displayName); setIsEditingName(true) }} title="Edit nickname">
                    <IconPencil size={14} />
                  </button>
                </>
              )}
            </div>
            {primaryUsername && (
              <div className="mt-0.5 flex items-center gap-1.5 text-[14px] font-medium text-white/40">
                <PlatformLogo platform={primaryPlatform} size={12} />
                <span className="truncate">@{primaryUsername}</span>
              </div>
            )}
          </div>

          {/* Rank */}
          {typeof identity.overallRank === 'number' && identity.overallRank > 0 && (
            <div className="flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-4 py-2 pb-1" style={{ background: 'var(--mat-thin)', border: '1px solid var(--hairline)' }}>
              <div className="flex items-center gap-1">
                <IconTrophy size={13} style={{ color: identity.overallRank <= 3 ? '#FBBF24' : 'var(--fg-5)' }} />
                <span className="text-lg font-extrabold tabular-nums text-accent leading-none">#{identity.overallRank}</span>
              </div>
              <span className="text-[10px] font-medium text-white/35">Audience rank</span>
            </div>
          )}
        </div>

        {/* ── Registry meta row ────────────────────────────── */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-2 text-[12px] font-medium text-white/40">
          <span className="flex items-center gap-1.5">
            <span className="flex items-center gap-1">
              {sortPlatformsByDisplayOrder(identity.allPlatforms).map(p => (
                <span key={p} className="flex h-5 w-5 items-center justify-center rounded-full" style={{ background: 'var(--mat-regular)' }}>
                  <PlatformLogo platform={p} size={10} />
                </span>
              ))}
            </span>
            <span>{identity.accounts.length} linked {identity.accounts.length === 1 ? 'account' : 'accounts'}</span>
          </span>
          <MetaDot />
          <span className="flex items-center gap-1.5"><IconCalendarPlus size={13} className="text-white/25" /> Joined {formatRelativeTime(identity.firstSeenAt ?? null)}</span>
          <MetaDot />
          <span className="flex items-center gap-1.5"><IconClock size={13} className="text-white/25" /> Seen {formatRelativeTime(identity.lastSeenAt)}</span>
        </div>

        {/* ── Headline totals ──────────────────────────────── */}
        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <HeadlineStat icon={<IconMessageCircle size={15} />} value={identity.totalChats.toLocaleString()} label="Chats" rank={ranks?.totalChats} />
          <HeadlineStat icon={<IconHeart size={15} />} value={identity.totalLikes.toLocaleString()} label="Likes" rank={ranks?.totalLikes} />
          <HeadlineStat icon={<IconGift size={15} />} value={identity.totalGifts.toLocaleString()} label="Gifts" rank={ranks?.totalGifts} />
          <HeadlineStat icon={<IconCurrencyDollar size={15} />} value={formatCurrency(identity.totalGiftValueCents)} label="Revenue" rank={ranks?.totalGiftValueCents} />
        </div>

        {/* ── Tabs ─────────────────────────────────────────── */}
        <div className="mt-7 flex justify-center">
          <div className="app-segment">
            {tabs.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`app-segment-btn ${activeTab === tab.key ? 'is-active' : ''}`}>
                {tab.label}
                {typeof tab.count === 'number' && (
                  <span className="rounded-full px-1.5 text-[11px] font-bold leading-[18px]" style={{ background: activeTab === tab.key ? 'rgba(var(--accent-rgb), 0.15)' : 'var(--mat-regular)', color: activeTab === tab.key ? 'var(--accent)' : 'var(--fg-4)' }}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab content ──────────────────────────────────── */}
        <div className="mt-6">
          {activeTab === 'activity' && <ActivityTab identity={identity} ranks={ranks} />}
          {activeTab === 'accounts' && (
            <AccountsTab identity={identity} sortedAccounts={sortedAccounts} suggestions={suggestions}
              savingPrimary={null} linkingSuggestion={linkingSuggestion}
              setPrimaryAccount={setPrimaryAccount} linkSuggestedAccount={linkSuggestedAccount}
              draftPrimaryAccount={draftPrimaryAccount}
            />
          )}
          {activeTab === 'personalization' && (
            <ViewerPersonalizationSection profileId={profileId} displayName={identity.displayName}
              accounts={identity.accounts.map(a => ({ platform: a.platform, username: a.username }))}
              ensureProfileId={ensureEditableProfile}
              onProfileCreated={(newId) => navigate(`/stats/viewer/${newId}`, { replace: true })}
              draftOverrides={draftVoiceOverrides ?? []}
              draftJoinSounds={draftJoinSounds ?? []}
              onUpdateOverrides={setDraftVoiceOverrides}
              onUpdateJoinSounds={setDraftJoinSounds}
            />
          )}
        </div>
      </div>

      {hasUnsavedChanges && (
        <div className="sticky bottom-0 z-50 p-4 animate-in slide-in-from-bottom-4">
          <div className="mx-auto max-w-[640px] flex items-center justify-between rounded-xl bg-white/[0.08] backdrop-blur-xl border border-white/10 px-5 py-3 shadow-2xl">
            <span className="text-[13px] font-semibold text-white">You have unsaved changes</span>
            <div className="flex items-center gap-2">
              <button
                onClick={discardAllChanges}
                disabled={savingAll}
                className="px-4 py-2 text-[12px] font-bold text-white/50 hover:text-white/80 transition-colors"
              >
                Discard
              </button>
              <button
                onClick={saveAllChanges}
                disabled={savingAll}
                className="app-button-primary !h-8 !px-4 text-[12px] font-bold disabled:opacity-40"
              >
                {savingAll ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MetaDot() {
  return <span className="h-1 w-1 rounded-full bg-white/15" />
}

/* ── Headline stat (topline count under identity) ─────────── */
function HeadlineStat({ icon, value, label, rank }: { icon: React.ReactNode; value: string; label: string; rank?: number }) {
  const medal = rank === 1 ? '#FBBF24' : rank === 2 ? '#CBD5E1' : rank === 3 ? '#CD7F32' : null
  return (
    <div className="rounded-xl px-4 py-3" style={{ background: 'var(--mat-thin)', border: '1px solid var(--hairline)', boxShadow: 'var(--inset-top)' }}>
      <div className="flex items-center justify-between text-white/35">
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-white/45">
          <span className="text-white/30">{icon}</span>
          {label}
        </span>
        {typeof rank === 'number' && rank > 0 && (
          <span className="text-[10px] font-bold tabular-nums rounded px-1 leading-none py-[2px]" style={{ color: medal ?? 'var(--fg-5)', background: medal ? `${medal}18` : 'var(--mat-regular)' }}>#{rank}</span>
        )}
      </div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight text-white leading-none">{value}</div>
    </div>
  )
}

/* ── Activity tab ─────────────────────────────────────────── */
function ActivityTab({ identity, ranks }: { identity: UserIdentity; ranks?: UserIdentity['ranks'] }) {
  const stats: { icon: React.ReactNode; label: string; value: string; color: string; rank?: number }[] = [
    { icon: <IconMessageCircle size={16} />, label: 'Chat messages', value: identity.totalChats.toLocaleString(), color: '255, 255, 255', rank: ranks?.totalChats },
    { icon: <IconHeart size={16} />, label: 'Likes', value: identity.totalLikes.toLocaleString(), color: '244, 114, 182', rank: ranks?.totalLikes },
    { icon: <IconGift size={16} />, label: 'Gifts', value: identity.totalGifts.toLocaleString(), color: '253, 224, 71', rank: ranks?.totalGifts },
    { icon: <IconCurrencyDollar size={16} />, label: 'Revenue', value: formatCurrency(identity.totalGiftValueCents), color: '52, 211, 153', rank: ranks?.totalGiftValueCents },
    { icon: <IconShare size={16} />, label: 'Shares', value: identity.totalShares.toLocaleString(), color: '34, 211, 238', rank: ranks?.totalShares },
    { icon: <IconSwords size={16} />, label: 'Raids', value: identity.totalRaids.toLocaleString(), color: '251, 146, 60', rank: ranks?.totalRaids },
    { icon: <IconMusic size={16} />, label: 'Song requests', value: identity.totalSongRequests.toLocaleString(), color: '74, 222, 128', rank: ranks?.totalSongRequests },
    { icon: <IconPhone size={16} />, label: 'AI co-host calls', value: (identity.totalCohostCalls || 0).toLocaleString(), color: '239, 68, 68', rank: ranks?.totalCohostCalls }
  ]
  return (
    <div>
      <SectionLabel>Lifetime activity</SectionLabel>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {stats.map(s => <StatCard key={s.label} {...s} />)}
      </div>
    </div>
  )
}

/* ── Section label ────────────────────────────────────────── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 text-[12px] font-semibold text-white/35">{children}</div>
}

/* ── Stat card ────────────────────────────────────────────── */
function StatCard({ icon, label, value, color, rank }: { icon: React.ReactNode; label: string; value: React.ReactNode; color: string; rank?: number }) {
  const medal = rank === 1 ? '#FBBF24' : rank === 2 ? '#CBD5E1' : rank === 3 ? '#CD7F32' : null
  return (
    <div className="relative rounded-xl p-3.5 group transition-colors" style={{ background: 'var(--mat-thin)', border: '1px solid var(--hairline)', boxShadow: 'var(--inset-top)' }}>
      <div className="absolute inset-x-3 bottom-0 h-px opacity-0 group-hover:opacity-40 transition-opacity" style={{ background: `rgb(${color})` }} />
      <div className="flex items-center justify-between mb-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ color: `rgb(${color})`, background: `rgba(${color}, 0.08)` }}>{icon}</span>
        {typeof rank === 'number' && rank > 0 && (
          <span className="text-[9px] font-extrabold tabular-nums rounded px-1 py-[2px] leading-none" style={{ color: medal ?? 'var(--fg-5)', background: medal ? `${medal}18` : 'var(--mat-thin)', border: `1px solid ${medal ? `${medal}33` : 'var(--hairline)'}` }}>#{rank}</span>
        )}
      </div>
      <div className="text-lg font-bold tabular-nums tracking-tight leading-none" style={{ color: `rgb(${color})` }}>{value}</div>
      <div className="mt-1.5 text-[10px] font-medium text-white/30">{label}</div>
    </div>
  )
}

/* ── Accounts tab ─────────────────────────────────────────── */
function AccountsTab({
  identity, sortedAccounts, suggestions, savingPrimary, linkingSuggestion, setPrimaryAccount, linkSuggestedAccount, draftPrimaryAccount
}: {
  identity: UserIdentity
  sortedAccounts: UserIdentity['accounts']
  suggestions: Array<{ platform: Platform; username: string; displayName: string; profilePictureUrl: string | null; similarity: number; profileId: string | null }>
  savingPrimary: string | null
  linkingSuggestion: string | null
  setPrimaryAccount: (a: UserIdentity['accounts'][number]) => void
  linkSuggestedAccount: (s: { platform: Platform; username: string; displayName: string; profilePictureUrl: string | null; similarity: number; profileId: string | null }) => void
  draftPrimaryAccount: UserIdentity['accounts'][number] | null
}) {
  return (
    <div>
      <SectionLabel>Connected accounts</SectionLabel>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {sortedAccounts.map(acc => {
          const url = generatePlatformProfileUrl(acc.platform, acc.username)

          const primaryUsername = draftPrimaryAccount?.username ?? identity.primaryUsername
            ?? identity.accounts.find(a => a.platform === identity.primaryPlatform)?.username
            ?? identity.accounts[0]?.username
          const primaryPlatform = draftPrimaryAccount?.platform ?? identity.primaryPlatform

          const isPrimary = acc.platform === primaryPlatform && acc.username === primaryUsername
          const accountKey = `${acc.platform}:${acc.username}`

          return (
            <div key={accountKey} className="relative rounded-xl overflow-hidden transition-colors" style={{
              background: isPrimary ? 'rgba(var(--accent-rgb), 0.04)' : 'var(--mat-thin)',
              border: isPrimary ? '1px solid rgba(var(--accent-rgb), 0.22)' : '1px solid var(--hairline)',
              boxShadow: 'var(--inset-top)'
            }}>
              {isPrimary && <div className="h-[2px]" style={{ background: 'linear-gradient(90deg, var(--accent), rgba(var(--accent-rgb), 0.15), transparent)' }} />}
              <div className="p-4">
                <div className="flex items-center justify-between mb-3.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <Avatar url={acc.profilePictureUrl} name={acc.displayName || acc.username} size="lg" />
                      <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full" style={{ background: 'var(--bg-1)', border: '2px solid var(--bg-base)' }}>
                        <PlatformLogo platform={acc.platform} size={10} />
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-bold text-white leading-tight">{acc.displayName || acc.username}</div>
                      <div className="truncate text-[11px] font-medium text-white/30 mt-0.5">@{acc.username}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button type="button" disabled={isPrimary || savingPrimary === accountKey} onClick={() => void setPrimaryAccount(acc)}
                      className="flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-bold transition-colors disabled:cursor-default"
                      style={{ background: isPrimary ? 'rgba(var(--accent-rgb), 0.10)' : 'var(--mat-thin)', border: isPrimary ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid var(--hairline)', color: isPrimary ? 'var(--accent)' : 'var(--fg-4)' }}
                      title={isPrimary ? 'Primary account' : 'Make primary'}
                    >
                      {isPrimary ? <IconStarFilled size={11} /> : <IconStar size={11} />}
                      {isPrimary ? 'Primary' : 'Make primary'}
                    </button>
                    <a href={url} target="_blank" rel="noopener noreferrer" className="flex h-7 w-7 items-center justify-center rounded-lg text-white/30 hover:bg-white/[0.06] hover:text-white/60 transition-colors" style={{ border: '1px solid var(--hairline)' }} title={`Open on ${platformNames[acc.platform]}`}>
                      <IconExternalLink size={13} />
                    </a>
                  </div>
                </div>
                <div className={`grid gap-1.5 ${acc.platform === 'twitch' ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  <MiniStat label="Chats" value={acc.totalChats.toLocaleString()} />
                  {acc.platform !== 'twitch' && <MiniStat label="Likes" value={acc.totalLikes.toLocaleString()} />}
                  <MiniStat label="Gifts" value={acc.totalGifts.toLocaleString()} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {suggestions.length > 0 && (
        <div className="mt-8">
          <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-accent">
            Suggested connections
            <span className="rounded-full px-1.5 text-[10px] font-bold leading-[18px]" style={{ background: 'rgba(var(--accent-rgb), 0.10)' }}>{suggestions.length}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {suggestions.map(s => (
              <div key={`${s.platform}:${s.username}`} className="flex items-center justify-between gap-3 rounded-xl p-3.5 transition-colors" style={{ background: 'rgba(var(--accent-rgb), 0.02)', border: '1px solid rgba(var(--accent-rgb), 0.12)' }}>
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar url={s.profilePictureUrl} name={s.displayName} size="md" />
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-bold text-white">{s.displayName || s.username}</div>
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-white/30 mt-0.5">
                      <PlatformLogo platform={s.platform} size={10} />
                      <span className="truncate">@{s.username}</span>
                      <span className="text-white/15">·</span>
                      <span className="shrink-0">{Math.round(s.similarity * 100)}% match</span>
                    </div>
                  </div>
                </div>
                <button type="button" disabled={linkingSuggestion === `${s.platform}:${s.username}`} onClick={() => void linkSuggestedAccount(s)}
                  className="flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-bold text-accent hover:bg-accent/20 disabled:cursor-wait disabled:opacity-50 transition-colors"
                  style={{ background: 'rgba(var(--accent-rgb), 0.10)' }}
                >
                  <IconCheck size={13} />
                  {linkingSuggestion === `${s.platform}:${s.username}` ? 'Linking…' : 'Link'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── MiniStat ─────────────────────────────────────────────── */
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg py-2" style={{ background: 'rgba(0,0,0,0.15)' }}>
      <div className="text-[9px] font-semibold text-white/25 mb-0.5">{label}</div>
      <div className="text-[13px] font-bold tabular-nums text-white/80">{value}</div>
    </div>
  )
}
