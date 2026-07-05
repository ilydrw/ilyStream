import {IconBrandYoutube, IconChevronDown, IconCopy, IconDeviceFloppy, IconMessage2, IconRadio, IconRefresh, IconSend, IconUsers, IconWifi} from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { useConnectionStore } from '../../stores/connection-store'
import { getPlatformCapability, getPlatformConfig } from '../../lib/platform-configs'
import {
  PlatformPageHeader,
  Metric,
  StatusBadge,
  DiagnosticLine
} from '../../components/platforms/PlatformPageLayout'

const PLATFORM_ID = 'youtube'
// Must stay in sync with YOUTUBE_REDIRECT_URI in
// src/main/platforms/youtube/youtube-auth.ts — the loopback URI Google
// redirects back to. "Web application" OAuth clients must register this exact
// string; "Desktop app" clients accept it automatically.
const OAUTH_REDIRECT_URI = 'http://127.0.0.1:8790/callback'

// Reading chat is quota-free: a channel handle alone connects via YouTube's
// own web endpoints (no API key needed). Google credentials only unlock
// sending chat and auto-discovery while the channel input is empty.
const CORE_FIELDS = [
  { key: 'channelId', label: 'Channel handle / URL', type: 'text', placeholder: '@yourhandle — quota-free chat, no key needed' },
  { key: 'apiKey', label: 'API key', type: 'password', placeholder: 'Optional — legacy fallback only' },
  { key: 'clientId', label: 'OAuth client ID', type: 'password', placeholder: 'Google OAuth client ID (for sending chat)' },
  { key: 'clientSecret', label: 'OAuth client secret', type: 'password', placeholder: 'Google OAuth client secret' }
]

// Everything the OAuth button fills in for you, plus manual overrides for power
// users (paste a video URL / chat ID to skip discovery entirely).
const ADVANCED_FIELDS = [
  { key: 'accessToken', label: 'Access token', type: 'password', placeholder: 'Filled in by Connect with Google' },
  { key: 'refreshToken', label: 'Refresh token', type: 'password', placeholder: 'Filled in by Connect with Google' },
  { key: 'liveChatId', label: 'Live Chat ID override', type: 'text', placeholder: 'Optional — forces Data API polling; leave blank' },
  { key: 'streamKey', label: 'Stream key', type: 'password', placeholder: 'YouTube stream key' }
]

export default function YouTubePage() {
  const statuses = useConnectionStore((s) => s.statuses)
  const errors = useConnectionStore((s) => s.errors)
  const viewerCounts = useConnectionStore((s) => s.viewerCounts)
  const reconnectInfo = useConnectionStore((s) => s.reconnectInfo)
  const recentEvents = useConnectionStore((s) => s.recentEvents)
  const [config, setConfig] = useState<Record<string, string>>({})
  const [canSend, setCanSend] = useState({ canSend: false, reason: 'Initializing...' })
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isAuthorizing, setIsAuthorizing] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [copiedRedirect, setCopiedRedirect] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null)

  const status = statuses[PLATFORM_ID] || 'disconnected'
  const error = errors[PLATFORM_ID] || null
  const viewers = viewerCounts[PLATFORM_ID] || 0
  const isConnected = status === 'connected'
  const isConnecting = status === 'connecting'
  const isBusy = isConnecting || isAuthorizing
  const hasOAuthTokens = Boolean(config.refreshToken?.trim())

  useEffect(() => {
    window.api.platform.getConfigs().then((configs) => {
      const platformConfig = getPlatformConfig(configs, PLATFORM_ID)
      if (platformConfig) setConfig(platformConfig as unknown as Record<string, string>)
    })

    window.api.platform.getChatCapabilities().then((caps) => {
      const capability = getPlatformCapability(caps, PLATFORM_ID)
      if (capability) setCanSend({ canSend: capability.canSend, reason: capability.reason ?? '' })
    })
  }, [status])

  useEffect(() => {
    if (!isConnected) return

    const refreshCapability = () => {
      window.api.platform.getChatCapabilities().then((caps) => {
        const capability = getPlatformCapability(caps, PLATFORM_ID)
        if (capability) setCanSend({ canSend: capability.canSend, reason: capability.reason ?? '' })
      })
    }

    refreshCapability()
    const timer = window.setInterval(refreshCapability, 2000)
    return () => window.clearInterval(timer)
  }, [isConnected])

  const platformEvents = useMemo(
    () => recentEvents.filter((event) => event.platform === PLATFORM_ID).slice(0, 15),
    [recentEvents]
  )
  const isMissingLiveChat = isConnected && canSend.reason === 'YouTube live chat ID is missing'
  const serviceHealthLabel = error ? 'Service Error' : isMissingLiveChat ? 'Waiting' : isConnected ? 'Healthy' : 'Standby'
  const pollerLabel = isMissingLiveChat ? 'Finding Chat' : isConnected ? 'Active' : isConnecting ? 'Auth' : 'Offline'
  const pollerDetail = isMissingLiveChat
    ? 'Waiting for active live chat'
    : isConnected
      ? 'Polling / 5s Interval'
      : status.toUpperCase()

  useEffect(() => {
    if (isMissingLiveChat || error?.toLowerCase().includes('quota')) {
      setShowAdvanced(true)
    }
  }, [error, isMissingLiveChat])

  const buildConfig = (values: Record<string, string>, enabled = true) => ({
    ...values,
    platform: PLATFORM_ID,
    enabled
  })

  const handleConnect = async (overrides?: Record<string, string>) => {
    const merged = { ...config, ...(overrides || {}) }
    setAuthError(null)
    setSaveFeedback(null)
    setConfig(merged)
    await window.api.platform.connect(buildConfig(merged, true))
  }

  const handleSaveSetup = async () => {
    setAuthError(null)
    setSaveFeedback(null)
    try {
      await window.api.platform.saveConfig(buildConfig(config, isConnected || status === 'error'))
      setSaveFeedback('Saved')
      window.setTimeout(() => setSaveFeedback(null), 1500)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setAuthError(message.replace(/^Error:\s*/, ''))
    }
  }

  const buildReadOnlyConfig = () => ({
    ...config,
    accessToken: '',
    refreshToken: '',
    liveChatId: ''
  })

  const handleClearOAuth = async () => {
    const next = buildReadOnlyConfig()
    setAuthError(null)
    setSaveFeedback(null)
    setConfig(next)
    try {
      await window.api.platform.saveConfig(buildConfig(next, isConnected || status === 'error'))
      setSaveFeedback('OAuth cleared')
      window.setTimeout(() => setSaveFeedback(null), 1500)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setAuthError(message.replace(/^Error:\s*/, ''))
    }
  }

  const handleConnectReadOnly = async () => {
    await handleConnect(buildReadOnlyConfig())
  }

  // One-click OAuth: opens the Google consent screen, then auto-fills the
  // access/refresh tokens and connects. From here on the refresh token lets
  // ilyStream discover the live broadcast on its own — no URL pasting.
  const handleGoogleAuth = async () => {
    setAuthError(null)
    setIsAuthorizing(true)
    try {
      const result = await window.api.platform.youtube.beginAuth({
        clientId: config.clientId,
        clientSecret: config.clientSecret
      })
      const merged = {
        ...config,
        clientId: result.clientId,
        clientSecret: result.clientSecret,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      }
      setConfig(merged)
      await handleConnect(merged)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setAuthError(message.replace(/^Error:\s*/, ''))
      console.error('YouTube OAuth failed:', err)
    } finally {
      setIsAuthorizing(false)
    }
  }

  const handleDisconnect = async () => {
    await window.api.platform.disconnect(PLATFORM_ID)
  }

  const handleCopyRedirect = async () => {
    await window.api.system.copyToClipboard(OAUTH_REDIRECT_URI)
    setCopiedRedirect(true)
    window.setTimeout(() => setCopiedRedirect(false), 1500)
  }

  const updateField = (key: string, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  const renderField = (field: { key: string; label: string; type: string; placeholder: string }) => (
    <div key={field.key} className="flex flex-col gap-2">
      <label className="text-xs font-semibold tracking-tight text-white/30">{field.label}</label>
      <input
        type={field.type}
        placeholder={field.placeholder}
        value={config[field.key] || ''}
        onChange={(e) => updateField(field.key, e.target.value)}
        disabled={isBusy}
        className="app-input disabled:opacity-30 disabled:cursor-not-allowed"
      />
    </div>
  )

  return (
    <div className="app-page">
      <PlatformPageHeader
        platformId={PLATFORM_ID}
        title="YouTube Integration"
        description="Connect your YouTube stream. Live chat, Super Chats, and memberships are read quota-free through YouTube's own web endpoints — no API key required. Sign in with Google only if you want to send chat from ilyStream."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-20">
        <Metric
          icon={<IconUsers size={20} className="text-youtube" />}
          label="YouTube Audience"
          value={(viewers || 0).toLocaleString()}
        />
        <Metric
          icon={<IconRadio size={20} className={isConnected ? 'text-success' : 'text-white/20'} />}
          label="Poller Status"
          value={pollerLabel}
        />
        <Metric
          icon={<IconWifi size={20} className={error ? 'text-danger' : 'text-white/20'} />}
          label="Service Health"
          value={serviceHealthLabel}
          tone={error ? 'danger' : isMissingLiveChat ? 'warning' : 'neutral'}
        />
      </div>

      <div className="grid gap-16 xl:grid-cols-[1fr_450px]">
        <div className="flex flex-col gap-16">
          <section className="app-section-card glass">
            <div className="app-section-head">
              <div>
                <h2>YouTube API Settings</h2>
                <p>Google Cloud Console credentials.</p>
              </div>
              <StatusBadge status={status} reconnect={reconnectInfo[PLATFORM_ID]} />
            </div>

            {/* One-click OAuth hero */}
            <div className="p-12 border-b border-white/5 bg-youtube/[0.03]">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <IconBrandYoutube size={20} className="text-youtube" />
                  <h3 className="text-sm font-semibold text-white">One-click connect</h3>
                  {hasOAuthTokens && !isConnected && (
                    <span className="px-2 py-0.5 rounded bg-success/10 text-success text-[10px] font-semibold tracking-tight">
                      Authorized
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/40 leading-relaxed max-w-xl">
                  Sign in with Google to link your channel. ilyStream then finds your live broadcast
                  automatically every stream — no video URL to paste — and unlocks sending chat.
                  Requires an OAuth <span className="text-white/60">client ID</span> and{' '}
                  <span className="text-white/60">secret</span> from a Google Cloud project (same
                  project as your API key).
                </p>

                {/* Redirect URI — Web-application OAuth clients must register this
                    exact value or Google returns redirect_uri_mismatch. */}
                <div className="flex flex-col gap-1.5 mt-1">
                  <span className="text-[11px] font-semibold tracking-tight text-white/30">
                    Authorized redirect URI — add this to your OAuth client
                  </span>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-[11px] font-mono text-white/70 select-all">
                      {OAUTH_REDIRECT_URI}
                    </code>
                    <button
                      onClick={handleCopyRedirect}
                      className="app-button-secondary !h-9 !px-3 text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
                    >
                      <IconCopy size={14} />
                      {copiedRedirect ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <span className="text-[11px] text-white/25 leading-relaxed">
                    Using a “Web application” client? Paste this under Authorized redirect URIs.
                    A “Desktop app” client accepts it automatically — no setup needed.
                  </span>
                </div>

                {authError && (
                  <div className="px-4 py-3 rounded-lg bg-danger/10 border border-danger/20">
                    <p className="text-xs font-semibold text-danger leading-relaxed">{authError}</p>
                  </div>
                )}

                <div className="flex items-center gap-3 mt-1">
                  <button
                    onClick={handleGoogleAuth}
                    disabled={isBusy}
                    className="app-button-primary !h-11 !px-6 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
                  >
                    <IconBrandYoutube size={16} />
                    {isAuthorizing
                      ? 'Waiting for Google…'
                      : hasOAuthTokens
                        ? 'Reconnect with Google'
                        : 'Connect with Google'}
                  </button>
                  {isAuthorizing && (
                    <span className="text-xs text-white/40">Complete the sign-in in your browser…</span>
                  )}
                </div>
                {hasOAuthTokens && (
                  <button
                    onClick={handleClearOAuth}
                    disabled={isBusy}
                    className="app-button-secondary !h-9 !px-4 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed self-start"
                  >
                    Clear OAuth tokens
                  </button>
                )}
              </div>
            </div>

            <div className="grid gap-10 p-12 md:grid-cols-2 bg-white/[0.01]">
              {CORE_FIELDS.map(renderField)}
            </div>

            <div className="border-t border-white/5">
              <button
                onClick={() => setShowAdvanced((v) => !v)}
                className="w-full flex items-center justify-between px-12 py-4 text-xs font-semibold text-white/40 hover:text-white/70 transition-colors"
              >
                <span>Advanced — manual tokens &amp; stream key</span>
                <IconChevronDown
                  size={16}
                  className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
                />
              </button>
              {showAdvanced && (
                <div className="grid gap-10 px-12 pb-12 md:grid-cols-2 bg-white/[0.01]">
                  {ADVANCED_FIELDS.map(renderField)}
                </div>
              )}
            </div>

            {error && (
              <div className="px-8 py-4 bg-danger/10 border-y border-danger/20">
                <p className="text-xs font-semibold text-danger leading-relaxed">{error}</p>
              </div>
            )}

            <div className="flex items-center justify-end gap-6 p-10 border-t border-white/5 mt-auto">
              {isConnected ? (
                <>
                  <button
                    onClick={handleSaveSetup}
                    disabled={isBusy}
                    className="app-button-secondary !h-12 !px-6 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
                  >
                    <IconDeviceFloppy size={16} />
                    {saveFeedback || 'Save setup'}
                  </button>
                  <button
                    onClick={() => handleConnect()}
                    disabled={isBusy}
                    className="app-button-primary !h-12 !px-8 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
                  >
                    <IconRefresh size={16} />
                    Apply / rediscover chat
                  </button>
                  <button
                    onClick={handleConnectReadOnly}
                    disabled={isBusy}
                    className="app-button-secondary !h-12 !px-6 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    API key read-only
                  </button>
                  <button onClick={handleDisconnect} className="app-button-danger !h-12 !px-8 text-sm font-semibold">
                    Disconnect YouTube
                  </button>
                </>
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
                    Linking...
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={handleSaveSetup}
                    disabled={isBusy}
                    className="app-button-secondary !h-12 !px-6 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
                  >
                    <IconDeviceFloppy size={16} />
                    {saveFeedback || 'Save setup'}
                  </button>
                  <button
                    onClick={() => handleConnect()}
                    disabled={isBusy}
                    className="app-button-primary !h-12 !px-10 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
                  >
                    <IconRefresh size={16} />
                    Connect with key / manual tokens
                  </button>
                  <button
                    onClick={handleConnectReadOnly}
                    disabled={isBusy}
                    className="app-button-secondary !h-12 !px-6 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    API key read-only
                  </button>
                </>
              )}
            </div>
          </section>

          <section className="app-section-card glass overflow-hidden">
            <div className="app-section-head">
              <div>
                <h2>Poller Heartbeat</h2>
                <p>Status of the YouTube API polling mechanism.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-12">
              <DiagnosticLine
                icon={<IconRadio size={16} />}
                label="Chat Poller"
                value={pollerDetail}
                tone={isMissingLiveChat ? 'muted' : isConnected ? 'good' : status === 'error' ? 'bad' : 'muted'}
              />
              <DiagnosticLine
                icon={<IconSend size={16} />}
                label="Message Write API"
                value={canSend.canSend ? 'Operational' : canSend.reason || 'Restricted'}
                tone={canSend.canSend ? 'good' : 'muted'}
              />
            </div>
          </section>
        </div>

        <section className="app-section-card glass flex flex-col">
          <div className="flex items-center justify-between px-8 py-5 border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <IconMessage2 size={18} className="text-youtube" />
              <h2 className="!text-lg">YouTube Feed</h2>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar min-h-[500px]">
            {platformEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-white/10 p-12 text-center">
                <IconWifi size={48} className="mb-6 opacity-10" />
                <p className="text-sm font-medium">Waiting for YouTube events...</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {platformEvents.map((event) => (
                  <div key={event.id} className="p-6 hover:bg-white/[0.02] transition-colors group">
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 rounded bg-youtube/10 text-youtube text-[10px] font-semibold tracking-tighter">
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
