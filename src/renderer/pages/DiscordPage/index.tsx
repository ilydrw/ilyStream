import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {IconBell, IconLayout, IconLink, IconMessage, IconMicrophone, IconSend, IconShieldCheck, IconUnlink, IconWifi} from '@tabler/icons-react'
import { useConnectionStore } from '../../stores/connection-store'
import { getPlatformConfig } from '../../lib/platform-configs'
import { 
  PlatformPageHeader, 
  Metric, 
  StatusBadge, 
  DiagnosticLine 
} from '../../components/platforms/PlatformPageLayout'
import { Avatar } from '../../components/ui/Avatar'
import { Select } from '../../components/ui/Select'
import type { SelectOption } from '../../components/ui/Select'
import type { DiscordCallParticipant, DiscordCallState } from '../../../shared/discord-call'
import type { UserIdentity } from '../../../shared/stats'

const PLATFORM_ID = 'discord'
const DEFAULT_REDIRECT_URL = 'http://localhost:8888/callback/discord'
const FIELDS = [
  { key: 'webhookUrl', label: 'Webhook URL', type: 'text', placeholder: 'https://discord.com/api/webhooks/...' },
  { key: 'botToken', label: 'Bot Token', type: 'password', placeholder: 'Discord Bot Token' },
  { key: 'clientId', label: 'Client ID', type: 'text', placeholder: 'Discord Application ID' },
  { key: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'Discord OAuth2 Client Secret' },
  { key: 'redirectUrl', label: 'Redirect URL', type: 'text', placeholder: DEFAULT_REDIRECT_URL }
]

export default function DiscordPage() {
  const statuses = useConnectionStore((s) => s.statuses)
  const errors = useConnectionStore((s) => s.errors)
  const reconnectInfo = useConnectionStore((s) => s.reconnectInfo)
  const recentEvents = useConnectionStore((s) => s.recentEvents)
  const [config, setConfig] = useState<Record<string, string>>({ redirectUrl: DEFAULT_REDIRECT_URL })
  const [connectFeedback, setConnectFeedback] = useState<string | null>(null)
  const [callState, setCallState] = useState<DiscordCallState | null>(null)
  const [profileOptions, setProfileOptions] = useState<SelectOption[]>([])
  const [selectedProfiles, setSelectedProfiles] = useState<Record<string, string>>({})
  const [linkingParticipant, setLinkingParticipant] = useState<string | null>(null)
  const [linkFeedback, setLinkFeedback] = useState<string | null>(null)
  // Maps option value -> identity metadata for entries that lack a viewer profile
  const identityMapRef = useRef<Map<string, UserIdentity>>(new Map())

  const status = statuses[PLATFORM_ID] || 'disconnected'
  const error = errors[PLATFORM_ID] || connectFeedback
  const isConnected = status === 'connected'
  const isConnecting = status === 'connecting'

  useEffect(() => {
    window.api.platform.getConfigs().then((configs) => {
      const platformConfig = getPlatformConfig(configs, PLATFORM_ID)
      if (platformConfig) {
        setConfig({ redirectUrl: DEFAULT_REDIRECT_URL, ...(platformConfig as unknown as Record<string, string>) })
      }
    })
  }, [status])

  useEffect(() => {
    let active = true
    const refresh = () => {
      window.api.discord.getCallState().then((state) => {
        if (active) setCallState(state)
      }).catch(() => undefined)
    }
    refresh()
    const timer = window.setInterval(refresh, 1000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  /** Build the Select options from viewer profiles + identities, deduplicating by profile id. */
  const buildProfileOptions = useCallback(async (query?: string) => {
    const trimmed = query?.trim()
    const [profiles, identities] = await Promise.all([
      window.api.stats.getViewerProfiles({ query: trimmed, limit: 200 }),
      window.api.stats.getTopIdentities({ sortBy: 'totalChats', query: trimmed, limit: 200 })
    ])

    const seen = new Set<string>()
    const options: SelectOption[] = []
    const nextIdentityMap = new Map<string, UserIdentity>()

    // Existing viewer profiles first (they already have an id we can link to directly)
    for (const profile of profiles) {
      seen.add(profile.id)
      options.push({
        value: profile.id,
        label: profile.displayName,
        group: 'Profiles',
        icon: (
          <Avatar
            url={profile.profilePictureUrl}
            name={profile.displayName}
            size="sm"
            className="!w-5 !h-5 !text-[8px]"
          />
        )
      })
    }

    // Identities from user_stats that don't already have a viewer profile entry
    for (const identity of identities) {
      // If the identity has a profile id that we already listed, skip it
      if (seen.has(identity.id)) continue
      // Also skip identities whose id is a profileId (UUID-shaped) that was already in profiles
      const isProfileBacked = identity.id.includes('-') && identity.id.length === 36
      if (isProfileBacked && seen.has(identity.id)) continue
      if (isProfileBacked) {
        // This is a profile-backed identity we missed — add it
        seen.add(identity.id)
      }

      const key = isProfileBacked ? identity.id : `identity:${identity.id}`
      nextIdentityMap.set(key, identity)
      options.push({
        value: key,
        label: identity.displayName,
        group: 'All Users',
        icon: (
          <Avatar
            url={identity.profilePictureUrl}
            name={identity.displayName}
            size="sm"
            className="!w-5 !h-5 !text-[8px]"
          />
        )
      })
    }

    identityMapRef.current = nextIdentityMap
    setProfileOptions(options)
  }, [])

  // Load initial options when participants change
  useEffect(() => {
    void buildProfileOptions()
  }, [buildProfileOptions, callState?.participants.length])

  // Debounced server-side search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const handleSearchChange = useCallback((query: string) => {
    clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => void buildProfileOptions(query), 200)
  }, [buildProfileOptions])

  const platformEvents = useMemo(
    () => recentEvents.filter((event) => event.platform === PLATFORM_ID).slice(0, 15),
    [recentEvents]
  )

  const handleConnect = async () => {
    setConnectFeedback(null)
    try {
      await window.api.platform.connect({
        ...config,
        redirectUrl: config.redirectUrl || DEFAULT_REDIRECT_URL,
        platform: PLATFORM_ID,
        enabled: true
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setConnectFeedback(message.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, ''))
    }
  }

  const handleDisconnect = async () => {
    await window.api.platform.disconnect(PLATFORM_ID)
  }

  const linkParticipant = async (participant: DiscordCallParticipant) => {
    const selectedValue = selectedProfiles[participant.id]
    if (!selectedValue) return
    setLinkFeedback(null)
    setLinkingParticipant(participant.id)
    try {
      let profileId = selectedValue

      // If the selected value is an identity without a viewer profile, create one first
      if (selectedValue.startsWith('identity:')) {
        const identity = identityMapRef.current.get(selectedValue)
        if (!identity) return
        const primaryAccount = identity.accounts[0]
        const newProfile = await window.api.stats.createViewerProfile({
          displayName: identity.displayName,
          profilePictureUrl: identity.profilePictureUrl,
          primaryPlatform: identity.primaryPlatform,
          primaryUsername: identity.primaryUsername || primaryAccount?.username,
          accounts: identity.accounts.map((account) => ({
            platform: account.platform,
            username: account.username,
            platformUserId: account.platformUserId,
            displayName: account.displayName,
            profilePictureUrl: account.profilePictureUrl
          }))
        })
        profileId = newProfile.id
      }

      await window.api.stats.addViewerAccount(profileId, {
        platform: 'discord',
        username: participant.username,
        platformUserId: participant.id,
        displayName: participant.username,
        profilePictureUrl: participant.avatarUrl
      })
      setCallState(await window.api.discord.getCallState())
    } catch (err) {
      setLinkFeedback(err instanceof Error ? err.message : String(err))
    } finally {
      setLinkingParticipant(null)
    }
  }

  const unlinkParticipant = async (participant: DiscordCallParticipant) => {
    setLinkFeedback(null)
    setLinkingParticipant(participant.id)
    try {
      await window.api.stats.unlinkAccount({
        platform: 'discord',
        username: participant.linkedAccountUsername || participant.username
      })
      setCallState(await window.api.discord.getCallState())
    } catch (err) {
      setLinkFeedback(err instanceof Error ? err.message : String(err))
    } finally {
      setLinkingParticipant(null)
    }
  }

  return (
    <div className="app-page">
      <PlatformPageHeader 
        platformId={PLATFORM_ID}
        title="Discord Integration"
        description="Connect the Discord desktop app for a live call overlay, speaking activity, participant avatars, and ilyStream profile linking."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-20">
        <Metric 
          icon={<IconBell size={20} className="text-indigo-400" />} 
          label="Call members"
          value={String(callState?.participants.length || 0)}
        />
        <Metric 
          icon={<IconShieldCheck size={20} className="text-success" />} 
          label="Robot Status" 
          value={isConnected ? 'Ready' : isConnecting ? 'Auth' : 'Standby'} 
        />
        <Metric 
          icon={<IconLayout size={20} className={isConnected ? 'text-accent' : 'text-white/20'} />} 
          label="Voice channel"
          value={callState?.channelName || (isConnected ? 'Waiting' : 'Off')}
        />
      </div>

      <div className="grid gap-16 xl:grid-cols-[1fr_450px]">
        <div className="flex flex-col gap-16">
          <section className="app-section-card glass">
            <div className="app-section-head">
              <div>
                <h2>Integration Core</h2>
                <p>Connect your Discord application for local voice state. Webhooks and bot settings remain available for automations.</p>
              </div>
              <StatusBadge status={status} reconnect={reconnectInfo[PLATFORM_ID]} />
            </div>

            <div className="grid gap-10 p-12 md:grid-cols-1 bg-white/[0.01]">
              {FIELDS.map((field) => (
                <div key={field.key} className="flex flex-col gap-2">
                  <label className="text-xs font-semibold tracking-tight text-white/30">{field.label}</label>
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    value={config[field.key] || ''}
                    onChange={(e) => setConfig(prev => ({ ...prev, [field.key]: e.target.value }))}
                    disabled={isConnected || isConnecting}
                    className="app-input disabled:opacity-30 disabled:cursor-not-allowed"
                  />
                </div>
              ))}
              <p className="text-[11px] leading-relaxed text-white/35">
                Add <span className="font-mono text-white/55">{DEFAULT_REDIRECT_URL}</span> to your Discord application's OAuth2 redirects. ilyStream uses your application credentials to authorize local RPC voice access.
              </p>
            </div>

            {error && (
              <div className="px-8 py-4 bg-danger/10 border-y border-danger/20">
                <p className="text-xs font-semibold text-danger leading-relaxed">{error}</p>
              </div>
            )}

            <div className="flex items-center justify-end gap-6 p-10 border-t border-white/5 mt-auto">
              {isConnected ? (
                <button onClick={handleDisconnect} className="app-button-danger !h-12 !px-8 text-sm font-semibold">
                  Disconnect Discord
                </button>
              ) : isConnecting ? (
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleDisconnect}
                    className="app-button-secondary !h-12 !px-8 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    disabled
                    className="app-button-primary !h-12 !px-10 text-sm font-semibold opacity-50 cursor-not-allowed"
                  >
                    Authenticating...
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleConnect}
                  className="app-button-primary !h-12 !px-10 text-sm font-semibold shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)]"
                >
                  Connect Discord
                </button>
              )}
            </div>
          </section>

          <section className="app-section-card glass overflow-hidden">
            <div className="app-section-head">
              <div>
                <h2>Bridge Status</h2>
                <p>Diagnostic telemetry for Discord connectivity.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-12">
              <DiagnosticLine
                icon={<IconWifi size={16} />}
                label="Discord desktop RPC"
                value={isConnected ? 'Online' : 'Offline'}
                tone={isConnected ? 'good' : 'muted'}
              />
              <DiagnosticLine
                icon={<IconSend size={16} />}
                label="Voice events"
                value={callState?.channelId ? 'Live' : isConnected ? 'Waiting for call' : 'Standby'}
                tone={isConnected ? 'good' : 'muted'}
              />
            </div>
          </section>
        </div>

        <section className="app-section-card glass flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-8 py-5 border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <IconMicrophone size={18} className="text-indigo-400" />
              <div>
                <h2 className="!text-lg">Live Call</h2>
                <p className="mt-0.5 text-[11px] text-white/30">{callState?.channelName || 'No active voice channel'}</p>
              </div>
            </div>
          </div>

          {linkFeedback && (
            <div className="border-b border-danger/20 bg-danger/10 px-6 py-3 text-[11px] font-semibold text-danger">
              {linkFeedback}
            </div>
          )}

          <div className="max-h-[520px] overflow-y-auto custom-scrollbar p-5">
            {!callState?.participants.length ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center p-8 text-center text-white/20">
                <IconMicrophone size={42} className="mb-4 opacity-30" />
                <p className="text-sm font-semibold text-white/45">Join a Discord voice channel</p>
                <p className="mt-1 max-w-[290px] text-[11px] leading-relaxed text-white/25">
                  The call roster and speaking activity will appear here and in the Discord Call widget.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {callState.participants.map((participant) => (
                  <div key={participant.id} className={`rounded-xl border p-4 transition-colors ${participant.isSpeaking ? 'border-emerald-400/50 bg-emerald-400/[0.07]' : 'border-white/8 bg-white/[0.025]'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`rounded-full p-0.5 ${participant.isSpeaking ? 'ring-2 ring-emerald-400/80' : ''}`}>
                        <Avatar url={participant.avatarUrl} name={participant.linkedProfileName || participant.username} size="md" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-bold text-white">{participant.linkedProfileName || participant.username}</span>
                          {participant.isCurrentUser && <span className="rounded bg-indigo-400/15 px-1.5 py-0.5 text-[8px] font-black text-indigo-300">YOU</span>}
                        </div>
                        <p className={`mt-0.5 text-[10px] font-semibold ${participant.isSpeaking ? 'text-emerald-400' : 'text-white/30'}`}>
                          {participant.isSpeaking ? 'Speaking now' : [participant.isMuted && 'Muted', participant.isDeafened && 'Deafened'].filter(Boolean).join(' · ') || 'Listening'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 border-t border-white/5 pt-3">
                      {participant.linkedProfileId ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold text-accent">
                            <IconLink size={12} />
                            <span className="truncate">Linked to {participant.linkedProfileName}</span>
                          </span>
                          <button
                            type="button"
                            disabled={linkingParticipant === participant.id}
                            onClick={() => void unlinkParticipant(participant)}
                            className="flex shrink-0 items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-bold text-white/40 transition-colors hover:border-danger/30 hover:text-danger disabled:opacity-40"
                          >
                            <IconUnlink size={11} /> Unlink
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Select
                            value={selectedProfiles[participant.id] || ''}
                            options={profileOptions}
                            onChange={(value) => setSelectedProfiles((current) => ({ ...current, [participant.id]: value }))}
                            onSearchChange={handleSearchChange}
                            placeholder="Link to ilyStream profile…"
                            searchable
                            emptyLabel="No profiles found."
                            className="min-w-0 flex-1"
                            buttonClassName="!h-8 !px-2.5 !text-[10px]"
                            maxListHeight={260}
                          />
                          <button
                            type="button"
                            disabled={!selectedProfiles[participant.id] || linkingParticipant === participant.id}
                            onClick={() => void linkParticipant(participant)}
                            className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-accent/15 px-3 text-[10px] font-bold text-accent transition-colors hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <IconLink size={11} /> Link
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-y border-white/5 bg-white/[0.02] px-6 py-3">
            <IconMessage size={14} className="text-indigo-400" />
            <h3 className="text-[11px] font-bold text-white/60">Relay activity</h3>
          </div>
          <div className="max-h-[220px] overflow-y-auto custom-scrollbar">
            {platformEvents.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-[11px] font-medium text-white/20">Waiting for Discord bridge activity…</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {platformEvents.map((event) => (
                  <div key={event.id} className="p-6 hover:bg-white/[0.02] transition-colors group">
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 rounded bg-indigo-400/10 text-indigo-400 text-[10px] font-semibold tracking-tighter">
                        {event.type}
                      </span>
                      <span className="text-[10px] font-mono text-white/20 group-hover:text-white/40">
                        {new Date(event.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm text-white/70 group-hover:text-white transition-colors">{event.summary}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
