import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  IconActivity,
  IconCalendarPlus,
  IconCheck,
  IconChevronLeft,
  IconClock,
  IconCurrencyDollar,
  IconDeviceFloppy,
  IconExternalLink,
  IconGift,
  IconHeart,
  IconLink,
  IconMessageCircle,
  IconMusic,
  IconPencil,
  IconPhone,
  IconShare,
  IconSparkles,
  IconStar,
  IconStarFilled,
  IconSwords,
  IconTrophy,
  IconX
} from '@tabler/icons-react'
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
import { groupProfileAccounts, type ProfileConnection } from './profile-account-groups'
import './viewer-profile.css'

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

const PROFILE_TABS: Array<{ key: ProfileTab; label: string; icon: React.ReactNode }> = [
  { key: 'activity', label: 'Activity', icon: <IconActivity size={15} /> },
  { key: 'accounts', label: 'Connections', icon: <IconLink size={15} /> },
  { key: 'personalization', label: 'Personalization', icon: <IconSparkles size={15} /> }
]

function getRankHighlights(ranks?: UserIdentity['ranks']): Array<{ label: string; rank: number }> {
  return [
    { label: 'Chats', rank: ranks?.totalChats },
    { label: 'Likes', rank: ranks?.totalLikes },
    { label: 'Gifts', rank: ranks?.totalGifts },
    { label: 'Revenue', rank: ranks?.totalGiftValueCents },
    { label: 'Shares', rank: ranks?.totalShares },
    { label: 'Raids', rank: ranks?.totalRaids },
    { label: 'Song requests', rank: ranks?.totalSongRequests },
    { label: 'AI calls', rank: ranks?.totalCohostCalls }
  ]
    .filter((item): item is { label: string; rank: number } => typeof item.rank === 'number' && item.rank > 0)
    .sort((left, right) => left.rank - right.rank)
}

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
  /**
   * Set before a reload this page triggers itself (linking an account, or being
   * re-routed onto a profile that was just created for this viewer). Those reloads
   * must not clobber edits the user hasn't saved yet — only a genuine navigation
   * to a different viewer resets the drafts.
   */
  const preserveDraftsRef = useRef(false)
  /** Mirror of `originalSettings`, readable inside the async loader. */
  const originalSettingsRef = useRef<{ ttsUserVoiceOverrides: TTSUserVoiceOverride[], viewerJoinSounds: ViewerJoinSound[] } | null>(null)

  const loadIdentityAndSettings = async () => {
    if (!id) return
    const preserveDrafts = preserveDraftsRef.current
    preserveDraftsRef.current = false
    setLoading(true)
    try {
      const [res, settingsRaw] = await Promise.all([
        window.api.stats.getIdentity(id),
        window.api.settings.getAll()
      ])
      const resolvedSettings = resolveAppSettings((settingsRaw || {}) as Record<string, any>)
      setIdentity(res)

      const settings = {
        ttsUserVoiceOverrides: resolvedSettings.ttsUserVoiceOverrides || [],
        viewerJoinSounds: resolvedSettings.viewerJoinSounds || []
      }
      // Linking can merge profiles, which rewrites viewer-scoped settings in the
      // main process. Drafts taken before that rewrite reference the profile id
      // that was just merged away, so they can't be carried over — take the
      // rewritten values instead of saving stale ids back over them.
      const settingsRewrittenElsewhere = originalSettingsRef.current !== null &&
        JSON.stringify(originalSettingsRef.current) !== JSON.stringify(settings)
      const keepDrafts = preserveDrafts && !settingsRewrittenElsewhere

      if (!preserveDrafts) {
        setDraftName(res?.displayName || '')
        setDraftPrimaryAccount(null)
      }

      originalSettingsRef.current = settings
      setOriginalSettings(settings)
      if (!keepDrafts) {
        setDraftVoiceOverrides(settings.ttsUserVoiceOverrides)
        setDraftJoinSounds(settings.viewerJoinSounds)
      }

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

  const { streamingAccounts, profileConnections } = groupProfileAccounts(identity)
  const sortedAccounts = [...streamingAccounts].sort((a, b) => b.totalChats - a.totalChats)
  const streamingPlatforms = sortPlatformsByDisplayOrder(
    [...new Set(streamingAccounts.map((account) => account.platform))]
  )
  const profileId = streamingAccounts.find(account => account.profileId)?.profileId || (!identity.id.includes(':') ? identity.id : null)
  const ranks = identity.ranks
  const badges = buildIdentityBadges(identity, 10, 20)

  const ensureEditableProfile = async (): Promise<string | null> => {
    if (profileId) return profileId
    const profile = await window.api.stats.createViewerProfile({
      displayName: identity.displayName,
      profilePictureUrl: identity.profilePictureUrl,
      primaryPlatform: identity.primaryPlatform,
      primaryUsername: identity.primaryUsername ?? streamingAccounts.find((a) => a.platform === identity.primaryPlatform)?.username ?? streamingAccounts[0]?.username,
      accounts: streamingAccounts.map((a) => ({
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
      // Linking is not a save — whatever the user has typed or picked but not
      // saved yet has to survive the refresh below.
      preserveDraftsRef.current = true
      if (pid !== profileId) { navigate(`/stats/viewer/${pid}`, { replace: true }); return }
      loadIdentityAndSettings()
    } finally { setLinkingSuggestion(null) }
  }

  const originalPrimaryAccount = streamingAccounts.find((account) => (
    account.platform === identity.primaryPlatform &&
    (!identity.primaryUsername || account.username === identity.primaryUsername)
  )) ?? streamingAccounts.find((account) => account.platform === identity.primaryPlatform)
    ?? streamingAccounts[0]
  const originalPrimaryUsername = originalPrimaryAccount?.username

  const primaryUsername = draftPrimaryAccount?.username ?? originalPrimaryUsername
  const primaryPlatform = draftPrimaryAccount?.platform ?? originalPrimaryAccount?.platform ?? identity.primaryPlatform
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

  const displayName = draftName || identity.displayName
  const rankHighlights = getRankHighlights(ranks)
  const bestRank = rankHighlights[0]
  const lifetimeActions = identity.totalChats + identity.totalLikes + identity.totalGifts +
    identity.totalShares + identity.totalRaids + identity.totalSongRequests + (identity.totalCohostCalls || 0)
  const unsavedLabels = [
    isNameChanged ? 'Nickname' : null,
    isPrimaryChanged ? 'Primary account' : null,
    isOverridesChanged ? 'Voice rules' : null,
    isJoinSoundsChanged ? 'Join sound' : null
  ].filter((label): label is string => Boolean(label))

  return (
    <div className="viewer-profile-page custom-scrollbar">
      <header className="viewer-profile-topbar">
        <button
          type="button"
          onClick={() => navigate('/stats')}
          className="viewer-profile-back"
          aria-label="Back to audience stats"
        >
          <IconChevronLeft size={18} />
        </button>
        <div className="viewer-profile-breadcrumb">
          <span>Audience</span>
          <span aria-hidden="true">/</span>
          <strong>{displayName}</strong>
        </div>
        {hasUnsavedChanges && <span className="viewer-profile-unsaved-dot">Unsaved changes</span>}
      </header>

      <main className="viewer-profile-shell">
        <section className="viewer-profile-hero" aria-labelledby="viewer-profile-name">
          <div className="viewer-profile-glow viewer-profile-glow--one" />
          <div className="viewer-profile-glow viewer-profile-glow--two" />

          <div className="viewer-profile-hero-main">
            <div className="viewer-profile-identity">
              <div className="viewer-profile-avatar-wrap">
                <Avatar
                  url={displayProfilePictureUrl}
                  name={displayName}
                  size="2xl"
                  className="viewer-profile-avatar"
                />
                <span className="viewer-profile-avatar-platform">
                  <PlatformLogo platform={primaryPlatform} size={16} />
                </span>
              </div>

              <div className="viewer-profile-identity-copy">
                <span className="viewer-profile-eyebrow">Viewer profile</span>
                {isEditingName ? (
                  <div className="viewer-profile-name-editor">
                    <input
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') saveNameDraft()
                        if (event.key === 'Escape') {
                          setDraftName(identity.displayName)
                          setIsEditingName(false)
                        }
                      }}
                      autoFocus
                      aria-label="Viewer nickname"
                    />
                    <button type="button" onClick={saveNameDraft} title="Keep nickname draft" aria-label="Keep nickname draft">
                      <IconCheck size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDraftName(identity.displayName); setIsEditingName(false) }}
                      title="Cancel nickname edit"
                      aria-label="Cancel nickname edit"
                    >
                      <IconX size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="viewer-profile-title-row">
                    <h1 id="viewer-profile-name">{displayName}</h1>
                    <button
                      type="button"
                      className="viewer-profile-edit-name"
                      onClick={() => { setDraftName(draftName || identity.displayName); setIsEditingName(true) }}
                      title="Edit nickname"
                      aria-label="Edit nickname"
                    >
                      <IconPencil size={14} />
                    </button>
                  </div>
                )}

                <div className="viewer-profile-handle-row">
                  {primaryUsername && (
                    <span className="viewer-profile-handle">
                      <PlatformLogo platform={primaryPlatform} size={13} />
                      @{primaryUsername}
                    </span>
                  )}
                  {badges.length > 0 && (
                    <span className="viewer-profile-badges">
                      {badges.map((badge) => <BadgeChip key={badge.key} badge={badge} />)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <aside className="viewer-profile-standing" aria-label="Audience standing">
              <div className="viewer-profile-standing-heading">
                <span>Audience standing</span>
                <IconTrophy size={16} />
              </div>
              <div className="viewer-profile-standing-rank">
                {typeof identity.overallRank === 'number' && identity.overallRank > 0
                  ? <><small>#</small>{identity.overallRank.toLocaleString()}</>
                  : <span>Unranked</span>}
              </div>
              <div className="viewer-profile-standing-grid">
                <div>
                  <span>Best category</span>
                  <strong>{bestRank ? `${bestRank.label} · #${bestRank.rank}` : 'Building history'}</strong>
                </div>
                <div>
                  <span>Lifetime actions</span>
                  <strong>{lifetimeActions.toLocaleString()}</strong>
                </div>
              </div>
            </aside>
          </div>

          <div className="viewer-profile-meta-grid">
            <div className="viewer-profile-meta-item">
              <span className="viewer-profile-meta-icon-stack">
                {streamingPlatforms.map((platform) => (
                  <span key={platform}><PlatformLogo platform={platform} size={12} /></span>
                ))}
              </span>
              <span><strong>{streamingAccounts.length}</strong> streaming {streamingAccounts.length === 1 ? 'account' : 'accounts'}</span>
            </div>
            <div className="viewer-profile-meta-item">
              <IconLink size={15} />
              <span><strong>{profileConnections.length}</strong> connected {profileConnections.length === 1 ? 'identity' : 'identities'}</span>
            </div>
            <div className="viewer-profile-meta-item">
              <IconCalendarPlus size={15} />
              <span>Joined <strong>{formatRelativeTime(identity.firstSeenAt ?? null)}</strong></span>
            </div>
            <div className="viewer-profile-meta-item">
              <IconClock size={15} />
              <span>Seen <strong>{formatRelativeTime(identity.lastSeenAt)}</strong></span>
            </div>
          </div>
        </section>

        <nav className="viewer-profile-tabs" role="tablist" aria-label="Viewer profile sections">
          {PROFILE_TABS.map((tab) => {
            const isActive = activeTab === tab.key
            const count = tab.key === 'accounts' ? sortedAccounts.length + profileConnections.length : null
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={isActive ? 'is-active' : ''}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {count !== null && <span className="viewer-profile-tab-count">{count}</span>}
              </button>
            )
          })}
        </nav>

        <section className="viewer-profile-tab-body" role="tabpanel">
          {activeTab === 'activity' && <ActivityTab identity={identity} ranks={ranks} accounts={sortedAccounts} />}
          {activeTab === 'accounts' && (
            <AccountsTab identity={identity} sortedAccounts={sortedAccounts} suggestions={suggestions}
              profileConnections={profileConnections}
              savingPrimary={null} linkingSuggestion={linkingSuggestion}
              setPrimaryAccount={setPrimaryAccount} linkSuggestedAccount={linkSuggestedAccount}
              draftPrimaryAccount={draftPrimaryAccount}
            />
          )}
          {activeTab === 'personalization' && (
            <ViewerPersonalizationSection profileId={profileId} displayName={identity.displayName}
              accounts={streamingAccounts.map(a => ({ platform: a.platform, username: a.username }))}
              ensureProfileId={ensureEditableProfile}
              onProfileCreated={(newId) => {
                // The rule that triggered this is still an unsaved draft tagged
                // with the new profile id — don't reload it away.
                preserveDraftsRef.current = true
                navigate(`/stats/viewer/${newId}`, { replace: true })
              }}
              draftOverrides={draftVoiceOverrides ?? []}
              draftJoinSounds={draftJoinSounds ?? []}
              onUpdateOverrides={setDraftVoiceOverrides}
              onUpdateJoinSounds={setDraftJoinSounds}
            />
          )}
        </section>
      </main>

      {hasUnsavedChanges && (
        <div className="viewer-profile-save-dock animate-in slide-in-from-bottom-4">
          <div className="viewer-profile-save-dock-inner">
            <div className="viewer-profile-save-summary">
              <span className="viewer-profile-save-icon"><IconDeviceFloppy size={17} /></span>
              <div>
                <strong>{unsavedLabels.length} unsaved {unsavedLabels.length === 1 ? 'change' : 'changes'}</strong>
                <span>{unsavedLabels.join(' · ')}</span>
              </div>
            </div>
            <div className="viewer-profile-save-actions">
              <button
                type="button"
                onClick={discardAllChanges}
                disabled={savingAll}
                className="viewer-profile-discard"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={saveAllChanges}
                disabled={savingAll}
                className="app-button-primary viewer-profile-save-button"
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

/* ── Activity tab ─────────────────────────────────────────── */
function ActivityTab({
  identity,
  ranks,
  accounts
}: {
  identity: UserIdentity
  ranks?: UserIdentity['ranks']
  accounts: UserIdentity['accounts']
}) {
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

  const platformActivity = Array.from(accounts.reduce((totals, account) => {
    const activity = account.totalChats + account.totalLikes + account.totalGifts + account.totalShares +
      account.totalRaids + account.totalSongRequests + (account.totalCohostCalls || 0)
    totals.set(account.platform, (totals.get(account.platform) || 0) + activity)
    return totals
  }, new Map<Platform, number>()))
    .map(([platform, activity]) => ({ platform, activity }))
    .sort((left, right) => right.activity - left.activity)
  const platformActivityTotal = platformActivity.reduce((total, item) => total + item.activity, 0)

  return (
    <div className="viewer-profile-section">
      <SectionHeader
        eyebrow="Audience history"
        title="Lifetime activity"
        description="A complete view of how this person has shown up across your streams."
      />
      <div className="viewer-profile-activity-layout">
        <div className="viewer-profile-metric-grid">
          {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
        </div>

        <aside className="viewer-profile-platform-mix">
          <div className="viewer-profile-platform-mix-head">
            <div>
              <span>Engagement mix</span>
              <strong>By platform</strong>
            </div>
            <span>{platformActivity.length}</span>
          </div>
          <div className="viewer-profile-platform-list">
            {platformActivity.map(({ platform, activity }) => {
              const share = platformActivityTotal > 0 ? Math.round((activity / platformActivityTotal) * 100) : 0
              return (
                <div key={platform} className="viewer-profile-platform-row">
                  <div className="viewer-profile-platform-label">
                    <span><PlatformLogo platform={platform} size={14} /></span>
                    <strong>{platformNames[platform]}</strong>
                    <small>{share}%</small>
                  </div>
                  <div className="viewer-profile-platform-track">
                    <span style={{ width: `${share}%` }} />
                  </div>
                  <div className="viewer-profile-platform-value">{activity.toLocaleString()} actions</div>
                </div>
              )
            })}
            {platformActivity.length === 0 && (
              <div className="viewer-profile-empty-copy">No streaming activity has been recorded yet.</div>
            )}
          </div>
          <div className="viewer-profile-platform-foot">
            <IconActivity size={14} />
            <span>{platformActivityTotal.toLocaleString()} measured interactions</span>
          </div>
        </aside>
      </div>
    </div>
  )
}

function SectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="viewer-profile-section-header">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  )
}

/* ── Stat card ────────────────────────────────────────────── */
function StatCard({ icon, label, value, color, rank }: { icon: React.ReactNode; label: string; value: React.ReactNode; color: string; rank?: number }) {
  const medal = rank === 1 ? '#FBBF24' : rank === 2 ? '#CBD5E1' : rank === 3 ? '#CD7F32' : null
  return (
    <div
      className="viewer-profile-metric-card"
      style={{ '--metric-rgb': color } as React.CSSProperties}
    >
      <div className="viewer-profile-metric-topline">
        <span className="viewer-profile-metric-icon">{icon}</span>
        {typeof rank === 'number' && rank > 0 && (
          <span
            className="viewer-profile-metric-rank"
            style={{ color: medal ?? 'var(--fg-4)', background: medal ? `${medal}16` : undefined, borderColor: medal ? `${medal}32` : undefined }}
          >
            #{rank}
          </span>
        )}
      </div>
      <div className="viewer-profile-metric-value">{value}</div>
      <div className="viewer-profile-metric-label">{label}</div>
    </div>
  )
}

/* ── Accounts tab ─────────────────────────────────────────── */
function AccountsTab({
  identity, sortedAccounts, profileConnections, suggestions, savingPrimary, linkingSuggestion, setPrimaryAccount, linkSuggestedAccount, draftPrimaryAccount
}: {
  identity: UserIdentity
  sortedAccounts: UserIdentity['accounts']
  profileConnections: ProfileConnection[]
  suggestions: Array<{ platform: Platform; username: string; displayName: string; profilePictureUrl: string | null; similarity: number; profileId: string | null }>
  savingPrimary: string | null
  linkingSuggestion: string | null
  setPrimaryAccount: (a: UserIdentity['accounts'][number]) => void
  linkSuggestedAccount: (s: { platform: Platform; username: string; displayName: string; profilePictureUrl: string | null; similarity: number; profileId: string | null }) => void
  draftPrimaryAccount: UserIdentity['accounts'][number] | null
}) {
  return (
    <div className="viewer-profile-section">
      <SectionHeader
        eyebrow="Identity graph"
        title="Connected accounts"
        description="Choose how this viewer appears in ilyStream and see where their activity comes from."
      />
      <div className="viewer-profile-account-grid">
        {sortedAccounts.map(acc => {
          const url = generatePlatformProfileUrl(acc.platform, acc.username)

          const primaryAccount = sortedAccounts.find((account) => (
            account.platform === identity.primaryPlatform &&
            (!identity.primaryUsername || account.username === identity.primaryUsername)
          )) ?? sortedAccounts.find((account) => account.platform === identity.primaryPlatform)
            ?? sortedAccounts[0]
          const primaryUsername = draftPrimaryAccount?.username ?? primaryAccount?.username
          const primaryPlatform = draftPrimaryAccount?.platform ?? primaryAccount?.platform ?? identity.primaryPlatform

          const isPrimary = acc.platform === primaryPlatform && acc.username === primaryUsername
          const accountKey = `${acc.platform}:${acc.username}`

          return (
            <article key={accountKey} className={`viewer-profile-account-card ${isPrimary ? 'is-primary' : ''}`}>
              <div className="viewer-profile-account-card-body">
                <div className="viewer-profile-account-head">
                  <div className="viewer-profile-account-identity">
                    <div className="viewer-profile-account-avatar">
                      <Avatar url={acc.profilePictureUrl} name={acc.displayName || acc.username} size="lg" />
                      <span>
                        <PlatformLogo platform={acc.platform} size={10} />
                      </span>
                    </div>
                    <div className="viewer-profile-account-copy">
                      <strong>{acc.displayName || acc.username}</strong>
                      <span>@{acc.username}</span>
                    </div>
                  </div>
                  <div className="viewer-profile-account-actions">
                    <button
                      type="button"
                      disabled={isPrimary || savingPrimary === accountKey}
                      onClick={() => void setPrimaryAccount(acc)}
                      className={`viewer-profile-primary-button ${isPrimary ? 'is-primary' : ''}`}
                      title={isPrimary ? 'Primary account' : 'Make primary'}
                    >
                      {isPrimary ? <IconStarFilled size={11} /> : <IconStar size={11} />}
                      {isPrimary ? 'Primary' : 'Make primary'}
                    </button>
                    <a href={url} target="_blank" rel="noopener noreferrer" className="viewer-profile-external-link" title={`Open on ${platformNames[acc.platform]}`}>
                      <IconExternalLink size={13} />
                    </a>
                  </div>
                </div>
                <div className={`viewer-profile-account-stats ${acc.platform === 'twitch' ? 'is-two-column' : ''}`}>
                  <MiniStat label="Chats" value={acc.totalChats.toLocaleString()} />
                  {acc.platform !== 'twitch' && <MiniStat label="Likes" value={acc.totalLikes.toLocaleString()} />}
                  <MiniStat label="Gifts" value={acc.totalGifts.toLocaleString()} />
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {profileConnections.length > 0 && (
        <div className="viewer-profile-subsection">
          <SubsectionHeader
            title="Service identities"
            description="Used for recognition in connected services; these do not affect stream stats or the primary account."
            count={profileConnections.length}
          />
          <div className="viewer-profile-service-list">
            {profileConnections.map((connection) => {
              const isDiscord = connection.platform === 'discord'
              return (
                <div
                  key={`${connection.platform}:${connection.platformUserId || connection.username}`}
                  className={`viewer-profile-service-card ${isDiscord ? 'is-discord' : ''}`}
                >
                  <div className="viewer-profile-service-identity">
                    <span className="viewer-profile-service-icon">
                      <PlatformLogo platform={connection.platform} size={20} />
                    </span>
                    <div className="viewer-profile-service-copy">
                      <div>
                        <strong>{platformNames[connection.platform]}</strong>
                        <span>Connected identity</span>
                      </div>
                      <small>@{connection.username}</small>
                    </div>
                  </div>
                  <div className="viewer-profile-service-purpose">
                    <strong>Profile matching</strong>
                    <span>{isDiscord ? 'Calls and voice overlays' : 'Connected service identity'}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="viewer-profile-subsection">
          <SubsectionHeader
            title="Suggested matches"
            description="Potential accounts that may belong to this viewer. Review each match before linking it."
            count={suggestions.length}
            accent
          />
          <div className="viewer-profile-suggestion-grid">
            {suggestions.map(s => (
              <div key={`${s.platform}:${s.username}`} className="viewer-profile-suggestion-card">
                <div className="viewer-profile-suggestion-identity">
                  <Avatar url={s.profilePictureUrl} name={s.displayName} size="md" />
                  <div>
                    <strong>{s.displayName || s.username}</strong>
                    <span>
                      <PlatformLogo platform={s.platform} size={10} />
                      @{s.username} · {Math.round(s.similarity * 100)}% match
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={linkingSuggestion === `${s.platform}:${s.username}`}
                  onClick={() => void linkSuggestedAccount(s)}
                  className="viewer-profile-link-button"
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

function SubsectionHeader({
  title,
  description,
  count,
  accent = false
}: {
  title: string
  description: string
  count: number
  accent?: boolean
}) {
  return (
    <div className={`viewer-profile-subsection-header ${accent ? 'is-accent' : ''}`}>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <span>{count}</span>
    </div>
  )
}

/* ── MiniStat ─────────────────────────────────────────────── */
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="viewer-profile-mini-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
