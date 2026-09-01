import {
  IconBrandTwitch,
  IconCircleCheck,
  IconCopy,
  IconKey,
  IconLoader2,
  IconMessage2,
  IconRadio,
  IconSend,
  IconShieldCheck,
  IconUsers,
  IconWifi
} from '@tabler/icons-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  TwitchAuthPhase,
  TwitchAuthProgress,
  TwitchAuthStatus
} from '../../../shared/twitch-auth'
import { useConnectionStore } from '../../stores/connection-store'
import { getPlatformCapability } from '../../lib/platform-configs'
import {
  PlatformPageHeader,
  Metric,
  StatusBadge,
  DiagnosticLine
} from '../../components/platforms/PlatformPageLayout'

const PLATFORM_ID = 'twitch'

const DEFAULT_AUTH_STATUS: TwitchAuthStatus = {
  configured: false,
  connected: false,
  account: null,
  streamKeyAvailable: false,
  message: 'Checking Twitch authorization…'
}

const AUTH_STAGES: Array<{ phase: TwitchAuthPhase; label: string }> = [
  { phase: 'requesting-code', label: 'Secure code' },
  { phase: 'opening-browser', label: 'Open Twitch' },
  { phase: 'awaiting-consent', label: 'Authorize' },
  { phase: 'connecting', label: 'Connect' }
]

export default function TwitchPage() {
  const statuses = useConnectionStore((state) => state.statuses)
  const errors = useConnectionStore((state) => state.errors)
  const viewerCounts = useConnectionStore((state) => state.viewerCounts)
  const reconnectInfo = useConnectionStore((state) => state.reconnectInfo)
  const recentEvents = useConnectionStore((state) => state.recentEvents)
  const [authStatus, setAuthStatus] = useState<TwitchAuthStatus>(DEFAULT_AUTH_STATUS)
  const [authProgress, setAuthProgress] = useState<TwitchAuthProgress | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [streamKeyWarning, setStreamKeyWarning] = useState<string | null>(null)
  const [secondsRemaining, setSecondsRemaining] = useState(0)
  const [copiedCode, setCopiedCode] = useState(false)
  const [canSend, setCanSend] = useState({ canSend: false, reason: 'Initializing…' })
  const cancelledRef = useRef(false)

  const status = statuses[PLATFORM_ID] || 'disconnected'
  const connectorError = errors[PLATFORM_ID] || null
  const viewers = viewerCounts[PLATFORM_ID] || 0
  const isConnected = status === 'connected'
  const isConnecting = status === 'connecting'

  useEffect(() => {
    window.api.platform.twitch.getAuthStatus()
      .then(setAuthStatus)
      .catch((error) => setAuthError(formatAuthError(error)))

    window.api.platform.getChatCapabilities().then((capabilities) => {
      const capability = getPlatformCapability(capabilities, PLATFORM_ID)
      if (capability) {
        setCanSend({ canSend: capability.canSend, reason: capability.reason ?? '' })
      }
    })
  }, [status])

  useEffect(() => {
    return window.api.on('twitch:auth-progress', (payload: unknown) => {
      if (!cancelledRef.current) setAuthProgress(payload as TwitchAuthProgress)
    })
  }, [])

  useEffect(() => {
    if (!authBusy || !authProgress?.expiresAt) {
      setSecondsRemaining(0)
      return
    }

    const updateCountdown = () => {
      setSecondsRemaining(Math.max(0, Math.ceil((authProgress.expiresAt! - Date.now()) / 1000)))
    }
    updateCountdown()
    const interval = window.setInterval(updateCountdown, 1000)
    return () => window.clearInterval(interval)
  }, [authBusy, authProgress?.expiresAt])

  const platformEvents = useMemo(
    () => recentEvents.filter((event) => event.platform === PLATFORM_ID).slice(0, 15),
    [recentEvents]
  )

  const handleConnect = async () => {
    const startedAt = Date.now()
    cancelledRef.current = false
    setAuthBusy(true)
    setAuthError(null)
    setStreamKeyWarning(null)
    setAuthProgress({
      phase: 'requesting-code',
      message: 'Requesting a secure sign-in code from Twitch…',
      startedAt
    })

    try {
      const result = await window.api.platform.twitch.beginAuth()
      setAuthStatus(result)
      setAuthProgress({
        phase: 'connected',
        message: result.message,
        startedAt
      })
      if (result.streamKeyError) {
        setStreamKeyWarning(
          `${result.streamKeyError} Chat and event features are still connected.`
        )
      }
    } catch (error) {
      if (!cancelledRef.current) setAuthError(formatAuthError(error))
    } finally {
      setAuthBusy(false)
    }
  }

  const handleCancel = async () => {
    cancelledRef.current = true
    setAuthBusy(false)
    setAuthError(null)
    setAuthProgress(null)
    try {
      setAuthStatus(await window.api.platform.twitch.cancelAuth())
    } catch (error) {
      setAuthError(formatAuthError(error))
    }
  }

  const handleDisconnect = async () => {
    cancelledRef.current = true
    setAuthBusy(true)
    setAuthError(null)
    setStreamKeyWarning(null)
    try {
      setAuthStatus(await window.api.platform.twitch.disconnectAuth())
      setAuthProgress(null)
    } catch (error) {
      setAuthError(formatAuthError(error))
    } finally {
      setAuthBusy(false)
    }
  }

  const copyUserCode = async () => {
    if (!authProgress?.userCode) return
    await window.api.system.copyToClipboard(authProgress.userCode)
    setCopiedCode(true)
    window.setTimeout(() => setCopiedCode(false), 1500)
  }

  return (
    <div className="app-page">
      <PlatformPageHeader
        platformId={PLATFORM_ID}
        title="Twitch Integration"
        description="Connect your Twitch account for chat, alerts, live telemetry, and automatic stream setup."
      />

      <div className="grid grid-cols-1 gap-10 mb-20 md:grid-cols-3">
        <Metric
          icon={<IconUsers size={20} className="text-twitch" />}
          label="Twitch Viewers"
          value={(viewers || 0).toLocaleString()}
        />
        <Metric
          icon={<IconRadio size={20} className={isConnected ? 'text-success' : 'text-white/20'} />}
          label="IRC Status"
          value={isConnected ? 'Active' : isConnecting ? 'Connecting' : 'Offline'}
        />
        <Metric
          icon={<IconWifi size={20} className={connectorError ? 'text-danger' : 'text-white/20'} />}
          label="API Health"
          value={connectorError ? 'Error' : isConnected ? 'Optimal' : 'Standby'}
          tone={connectorError ? 'danger' : 'neutral'}
        />
      </div>

      <div className="grid gap-16 xl:grid-cols-[1fr_450px]">
        <div className="flex flex-col gap-16">
          <section className="app-section-card glass">
            <div className="app-section-head">
              <div>
                <h2>Twitch Account</h2>
                <p>Browser authorization through ilyStream's public Twitch application.</p>
              </div>
              <StatusBadge status={status} reconnect={reconnectInfo[PLATFORM_ID]} />
            </div>

            <div className="flex flex-col gap-8 p-10">
              {authStatus.account ? (
                <div className="flex flex-wrap items-center justify-between gap-6 rounded-xl border border-twitch/20 bg-twitch/[0.05] p-6">
                  <div className="flex min-w-0 items-center gap-5">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-twitch/25 bg-twitch/15 text-twitch">
                      <IconBrandTwitch size={27} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-base font-semibold text-white">@{authStatus.account.login}</p>
                        {isConnected && <IconCircleCheck size={17} className="shrink-0 text-success" />}
                      </div>
                      <p className="mt-1 text-xs text-white/35">
                        {authStatus.account.userId
                          ? `Twitch user ${authStatus.account.userId}`
                          : 'Account identity is linked'}
                      </p>
                    </div>
                  </div>
                  <div className={`rounded-full border px-3 py-1 text-[10px] font-semibold ${
                    isConnected
                      ? 'border-success/25 bg-success/10 text-success'
                      : 'border-white/10 bg-white/5 text-white/45'
                  }`}>
                    {isConnected ? 'Connected' : 'Authorized'}
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-5 rounded-xl border border-twitch/20 bg-twitch/[0.04] p-6">
                  <IconShieldCheck size={25} className="mt-0.5 shrink-0 text-twitch" />
                  <div>
                    <p className="text-sm font-semibold text-white">One secure sign-in</p>
                    <p className="mt-2 text-xs leading-relaxed text-white/40">
                      Twitch opens in your normal browser. Sign in and approve ilyStream; your channel,
                      account identity, permissions, and stream destination are filled in automatically.
                      No developer app, Client Secret, token generator, or pasted credentials are required.
                    </p>
                  </div>
                </div>
              )}

              {(authBusy || authProgress?.phase === 'connected') && (
                <AuthProgressPanel progress={authProgress} secondsRemaining={secondsRemaining} />
              )}

              {authBusy && authProgress?.phase === 'awaiting-consent' && authProgress.userCode && (
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-white/5 bg-black/20 px-5 py-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-white/25">Fallback activation code</p>
                    <code className="mt-1 block select-all text-sm font-semibold tracking-[0.18em] text-white/75">
                      {authProgress.userCode}
                    </code>
                  </div>
                  <button type="button" onClick={copyUserCode} className="app-button-secondary !h-9 !px-4 text-xs font-semibold">
                    <IconCopy size={14} />
                    {copiedCode ? 'Copied' : 'Copy code'}
                  </button>
                </div>
              )}

              {(authError || connectorError) && (
                <div className="rounded-lg border border-danger/20 bg-danger/10 px-5 py-4 text-xs font-semibold leading-relaxed text-danger" role="alert">
                  {authError || connectorError}
                </div>
              )}

              {streamKeyWarning && (
                <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-5 py-4 text-xs font-semibold leading-relaxed text-amber-200" role="status">
                  {streamKeyWarning}
                </div>
              )}

              {!authError && !connectorError && !streamKeyWarning && (
                <div className="rounded-lg border border-white/5 bg-white/[0.02] px-5 py-4 text-xs font-semibold text-white/40" role="status">
                  {authBusy ? authProgress?.message : authStatus.message}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-white/5 pt-8">
                {authBusy ? (
                  <>
                    <button type="button" onClick={handleCancel} className="app-button-secondary !h-11 !px-6 text-xs font-semibold">
                      Cancel
                    </button>
                    <button type="button" disabled className="app-button-primary !h-11 !px-7 text-xs font-semibold opacity-55">
                      <IconLoader2 size={16} className="animate-spin" />
                      {authProgress?.phase === 'awaiting-consent'
                        ? `Waiting for Twitch${secondsRemaining ? ` · ${formatCountdown(secondsRemaining)}` : ''}`
                        : 'Connecting…'}
                    </button>
                  </>
                ) : isConnected ? (
                  <button type="button" onClick={handleDisconnect} className="app-button-danger !h-11 !px-7 text-xs font-semibold">
                    Disconnect Twitch
                  </button>
                ) : (
                  <>
                    {authStatus.configured && (
                      <button type="button" onClick={handleDisconnect} className="app-button-secondary !h-11 !px-6 text-xs font-semibold">
                        Forget account
                      </button>
                    )}
                    <button type="button" onClick={handleConnect} className="app-button-primary !h-11 !px-8 text-xs font-semibold">
                      <IconBrandTwitch size={17} />
                      {authStatus.configured ? 'Reconnect with Twitch' : 'Connect with Twitch'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </section>

          <section className="app-section-card glass overflow-hidden">
            <div className="app-section-head">
              <div>
                <h2>API Status</h2>
                <p>Connectivity validation for Twitch services.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-8 p-12 md:grid-cols-3">
              <DiagnosticLine
                icon={<IconRadio size={16} />}
                label="Helix API"
                value={isConnected ? 'Ready / Token Valid' : status.toUpperCase()}
                tone={isConnected ? 'good' : status === 'error' ? 'bad' : 'muted'}
              />
              <DiagnosticLine
                icon={<IconSend size={16} />}
                label="Chat Write Capability"
                value={canSend.canSend ? 'Operational' : canSend.reason || 'Restricted'}
                tone={canSend.canSend ? 'good' : 'muted'}
              />
              <DiagnosticLine
                icon={<IconKey size={16} />}
                label="Stream Destination"
                value={authStatus.streamKeyAvailable ? 'Auto-configured' : 'Unavailable'}
                tone={authStatus.streamKeyAvailable ? 'good' : 'muted'}
              />
            </div>
          </section>
        </div>

        <section className="app-section-card glass flex flex-col">
          <div className="flex items-center justify-between px-8 py-5 border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <IconMessage2 size={18} className="text-twitch" />
              <h2 className="!text-lg">Twitch Feed</h2>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar min-h-[500px]">
            {platformEvents.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center p-12 text-center text-white/10">
                <IconWifi size={48} className="mb-6 opacity-10" />
                <p className="text-sm font-medium">Waiting for Twitch events…</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {platformEvents.map((event) => (
                  <div key={event.id} className="group p-6 transition-colors hover:bg-white/[0.02]">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="rounded bg-twitch/10 px-2 py-0.5 text-[10px] font-semibold tracking-tighter text-twitch">
                        {event.type}
                      </span>
                      <span className="font-mono text-[10px] text-white/20 group-hover:text-white/40">
                        {new Date(event.timestamp).toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-white/70 transition-colors group-hover:text-white">{event.summary}</p>
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

function AuthProgressPanel({
  progress,
  secondsRemaining
}: {
  progress: TwitchAuthProgress | null
  secondsRemaining: number
}) {
  const activeIndex = progress?.phase === 'connected'
    ? AUTH_STAGES.length
    : AUTH_STAGES.findIndex((stage) => stage.phase === progress?.phase)

  return (
    <div className="rounded-xl border border-white/5 bg-black/20 p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {AUTH_STAGES.map((stage, index) => {
          const complete = activeIndex > index
          const active = activeIndex === index
          return (
            <div
              key={stage.phase}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[10px] font-semibold ${
                complete
                  ? 'border-success/20 bg-success/5 text-success'
                  : active
                    ? 'border-twitch/30 bg-twitch/10 text-twitch'
                    : 'border-white/5 bg-white/[0.02] text-white/25'
              }`}
            >
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                complete ? 'border-success/40' : active ? 'border-twitch/40' : 'border-white/10'
              }`}>
                {complete ? <IconCircleCheck size={13} /> : index + 1}
              </span>
              <span>{stage.label}</span>
            </div>
          )
        })}
      </div>
      {progress?.phase === 'awaiting-consent' && secondsRemaining > 0 && (
        <div className="mt-3 flex items-center justify-between gap-3 text-[10px] font-semibold text-white/35">
          <span>Complete authorization in the Twitch browser tab.</span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 font-mono text-white/55">
            {formatCountdown(secondsRemaining)} remaining
          </span>
        </div>
      )}
    </div>
  )
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function formatAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim() || 'Twitch authorization failed. Try again.'
}
