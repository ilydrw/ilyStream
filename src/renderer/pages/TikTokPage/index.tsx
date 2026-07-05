import { IconAlertCircle, IconBrowser, IconChartBar, IconHeart, IconLayout, IconMessage2, IconRadio, IconSend, IconUsers, IconWifi } from '@tabler/icons-react'
import { IconCircleCheck, IconPlayerPlay } from '../../components/ui/icons'
import { useEffect, useMemo, useState } from 'react'
import { PlatformLogo } from '../../components/platforms/PlatformLogo'
import { useConnectionStore } from '../../stores/connection-store'
import { getPlatformCapability, getPlatformConfig } from '../../lib/platform-configs'
import type { TikTokSenderStatus } from '../../../main/platforms/tiktok/tiktok-chat-sender'
import type { OverlayRuntimeStatus } from '../../../shared/overlay'
import { 
  PlatformPageHeader, 
  Metric, 
  StatusBadge, 
  DiagnosticLine 
} from '../../components/platforms/PlatformPageLayout'

const PLATFORM_ID = 'tiktok'
const FIELDS = [
  { key: 'username', label: 'TikTok username', type: 'text', placeholder: '@username' },
  { key: 'sessionId', label: 'Session ID', type: 'password', placeholder: 'Optional for sending' },
  { key: 'ttTargetIdc', label: 'tt-target-idc', type: 'text', placeholder: 'useast1a' },
  { key: 'signApiKey', label: 'Sign API key', type: 'password', placeholder: 'Optional connector signing key' },
  { key: 'streamKey', label: 'Stream key', type: 'password', placeholder: 'TikTok stream key' }
]

const DEFAULT_SENDER_STATUS: TikTokSenderStatus = {
  isWindowOpen: false,
  isLoggedIn: false,
  isChatReady: false,
  isOnTikTok: false,
  statusMessage: 'Open the TikTok host chat sender',
  maxMessageLength: 150,
  sendCooldownMs: 1500
}

export default function TikTokPage() {
  const statuses = useConnectionStore((s) => s.statuses)
  const errors = useConnectionStore((s) => s.errors)
  const viewerCounts = useConnectionStore((s) => s.viewerCounts)
  const reconnectInfo = useConnectionStore((s) => s.reconnectInfo)
  const recentEvents = useConnectionStore((s) => s.recentEvents)
  const [config, setConfig] = useState<Record<string, string>>({})
  const [canSend, setCanSend] = useState({ canSend: false, reason: 'Initializing...' })
  const [senderStatus, setSenderStatus] = useState<TikTokSenderStatus>(DEFAULT_SENDER_STATUS)
  const [senderTest, setSenderTest] = useState<{ state: 'idle' | 'sending' | 'sent' | 'failed'; message?: string }>({ state: 'idle' })
  const [overlayStatus, setOverlayStatus] = useState<OverlayRuntimeStatus | null>(null)
  const [likeHealth, setLikeHealth] = useState<{ count: number; lastAt: number | null; lastUser: string | null }>({
    count: 0,
    lastAt: null,
    lastUser: null
  })
  const [likeTest, setLikeTest] = useState<{ state: 'idle' | 'sending' | 'sent' | 'failed'; message?: string }>({ state: 'idle' })

  const status = statuses[PLATFORM_ID] || 'disconnected'
  const error = errors[PLATFORM_ID] || null
  const viewers = viewerCounts[PLATFORM_ID] || 0
  const isConnected = status === 'connected'
  const isConnecting = status === 'connecting'

  useEffect(() => {
    if (!window.api?.platform) return

    window.api.platform.getConfigs().then((configs) => {
      const platformConfig = getPlatformConfig(configs, PLATFORM_ID)
      if (platformConfig) setConfig(platformConfig)
    })

    const updateCaps = () => {
      window.api.platform.getChatCapabilities().then((caps) => {
        const capability = getPlatformCapability(caps, PLATFORM_ID)
        if (capability) setCanSend(capability)
      })
      window.api.platform.tiktok?.getSenderStatus?.().then((status: TikTokSenderStatus) => {
        setSenderStatus({ ...DEFAULT_SENDER_STATUS, ...status })
      })
    }

    updateCaps()
    const interval = setInterval(updateCaps, 2000)
    return () => clearInterval(interval)
  }, [status])

  useEffect(() => {
    if (!window.api?.overlay) return

    const loadOverlayStatus = () => {
      void window.api.overlay.getStatus().then((status: OverlayRuntimeStatus) => {
        setOverlayStatus(status)
      })
    }

    loadOverlayStatus()
    const interval = window.setInterval(loadOverlayStatus, 3000)
    const unsubscribe = window.api.on('overlay:status-changed', (status: unknown) => {
      setOverlayStatus(status as OverlayRuntimeStatus)
    })

    return () => {
      window.clearInterval(interval)
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    const unsubscribe = window.api?.on?.('event:stream', (event: any) => {
      if (event?.platform !== PLATFORM_ID || event?.type !== 'like') return
      const amount = Math.max(1, Math.floor(Number(event.likeCount) || 1))
      const reportedTotal = !event.raw?.simulated && Number.isFinite(Number(event.totalLikes)) && Number(event.totalLikes) > 0
        ? Math.floor(Number(event.totalLikes))
        : 0
      setLikeHealth((prev) => ({
        count: reportedTotal > 0 ? Math.max(prev.count + amount, reportedTotal) : prev.count + amount,
        lastAt: Date.now(),
        lastUser: event.user?.displayName || event.user?.username || 'TikTok viewer'
      }))
    })

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [])

  const platformEvents = useMemo(
    () => recentEvents.filter((event) => event.platform === PLATFORM_ID).slice(0, 15),
    [recentEvents]
  )
  const leaderboardClients = overlayStatus?.leaderboardClientCount || 0
  const likesTrackerClients = overlayStatus?.likesClientCount || 0
  const overlayRunning = Boolean(overlayStatus?.running)
  const likeHealthLabel = likeHealth.lastAt
    ? `${likeHealth.count.toLocaleString()} likes, last from ${likeHealth.lastUser}`
    : 'No like events this session'
  const senderChecks = [
    { label: 'Window', ok: senderStatus.isWindowOpen },
    { label: 'TikTok', ok: senderStatus.isOnTikTok },
    { label: 'Logged in', ok: senderStatus.isLoggedIn },
    { label: 'Chat ready', ok: senderStatus.isChatReady }
  ]
  const senderStatusClass = senderStatus.isChatReady
    ? 'bg-success/10 text-success'
    : senderStatus.isWindowOpen
      ? 'bg-warning/10 text-warning'
      : 'bg-white/5 text-white/40'
  const senderCooldownSeconds = senderStatus.nextSendAvailableAt
    ? Math.max(0, Math.ceil((senderStatus.nextSendAvailableAt - Date.now()) / 1000))
    : 0
  const senderSetupSteps = [
    {
      label: 'Open sender window',
      detail: senderStatus.isWindowOpen ? 'Window is available' : 'Launch the visible sender browser',
      ok: senderStatus.isWindowOpen
    },
    {
      label: 'Sign in to TikTok',
      detail: senderStatus.isLoggedIn ? 'Host account detected' : 'Complete login in the visible TikTok window',
      ok: senderStatus.isLoggedIn
    },
    {
      label: 'Open LIVE chat',
      detail: senderStatus.isChatReady ? 'Chat input is ready' : 'Navigate to LIVE Studio chat or chat pop-out',
      ok: senderStatus.isChatReady
    },
    {
      label: 'Send test message',
      detail: senderTest.state === 'sent'
        ? 'Test message sent'
        : senderTest.state === 'failed'
          ? senderTest.message || 'Test failed'
          : 'Verify the session before enabling chat recipes',
      ok: senderTest.state === 'sent'
    }
  ]

  const handleConnect = async () => {
    if (!window.api?.platform) return
    try {
      await window.api.platform.connect({
        platform: PLATFORM_ID,
        enabled: true,
        ...config
      })
    } catch (err) {
      console.error('Failed to connect:', err)
    }
  }

  const handleDisconnect = async () => {
    if (!window.api?.platform) return
    await window.api.platform.disconnect(PLATFORM_ID)
  }

  const updateField = (key: string, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  const handleOpenSender = async () => {
    if (!window.api?.platform?.tiktok) return
    await window.api.platform.tiktok.openSender()
  }

  const handleCloseSender = async () => {
    if (!window.api?.platform?.tiktok) return
    await window.api.platform.tiktok.closeSender()
  }

  const handleTestSender = async () => {
    if (!window.api?.platform) return
    setSenderTest({ state: 'sending' })
    try {
      const results = await window.api.platform.sendChatMessage({
        platforms: ['tiktok'],
        text: 'ilyStream sender test'
      })
      const result = results?.[0]
      if (result?.ok) {
        setSenderTest({ state: 'sent', message: 'Test message sent.' })
      } else {
        setSenderTest({ state: 'failed', message: result?.error || 'TikTok sender was not ready.' })
      }
    } catch (err: any) {
      setSenderTest({ state: 'failed', message: err?.message || 'Could not send the test message.' })
    }
  }

  const handleTestLike = async () => {
    if (!window.api?.events?.simulate) return
    setLikeTest({ state: 'sending' })
    try {
      await window.api.events.simulate({
        platform: PLATFORM_ID,
        type: 'like',
        username: 'leaderboard_test',
        displayName: 'Leaderboard Test',
        likeCount: 25,
        totalLikes: 100000000,
        suppressSound: true
      })
      setLikeTest({ state: 'sent', message: 'Test like sent through the widget pipeline.' })
    } catch (err: any) {
      setLikeTest({ state: 'failed', message: err?.message || 'Could not send the test like.' })
    }
  }

  return (
    <div className="app-page">
      <PlatformPageHeader 
        platformId={PLATFORM_ID}
        title="TikTok Integration"
        description="Connect your TikTok Live stream to IlyStream. Monitor real-time gifts, follows, and chat events with professional-grade diagnostics."
        icon={<IconWifi size={14} />}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <Metric 
          icon={<IconUsers size={20} className="text-tiktok" />} 
          label="TikTok Viewers" 
          value={(viewers || 0).toLocaleString()} 
        />
        <Metric 
          icon={<IconRadio size={20} className={isConnected ? 'text-success' : 'text-white/20'} />} 
          label="Connection State" 
          value={isConnected ? 'Active' : isConnecting ? 'Linking' : 'Offline'} 
          tone={isConnected ? 'neutral' : 'neutral'}
        />
        <Metric 
          icon={<IconWifi size={20} className={error ? 'text-danger' : 'text-white/20'} />} 
          label="Service Health" 
          value={error ? 'Error' : isConnected ? 'Optimal' : 'Standby'} 
          tone={error ? 'danger' : 'neutral'}
        />
      </div>

      <div className="grid gap-8 xl:grid-cols-[1fr_400px]">
        <div className="flex flex-col gap-8">
          <section className="app-section-card glass">
            <div className="app-section-head">
              <div>
                <h2>Configuration</h2>
                <p>Authentication and stream parameters.</p>
              </div>
              <StatusBadge status={status} reconnect={reconnectInfo[PLATFORM_ID]} />
            </div>

            <div className="grid gap-6 p-8 md:grid-cols-2 bg-white/[0.01]">
              {FIELDS.map((field) => (
                <div key={field.key} className="flex flex-col gap-2">
                  <label className="text-xs font-semibold tracking-tight text-white/30">{field.label}</label>
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    value={config[field.key] || ''}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    disabled={isConnected || isConnecting}
                    className="app-input disabled:opacity-30 disabled:cursor-not-allowed"
                  />
                </div>
              ))}
            </div>

            {error && (
              <div className="px-8 py-4 bg-danger/10 border-y border-danger/20">
                <p className="text-xs font-semibold text-danger leading-relaxed">{error}</p>
              </div>
            )}

            <div className="flex items-center justify-end gap-6 p-8 border-t border-white/5 mt-auto">
              {isConnected ? (
                <button onClick={handleDisconnect} className="app-button-danger !h-10 !px-8 text-sm font-semibold">
                  Disconnect TikTok
                </button>
              ) : isConnecting ? (
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleDisconnect}
                    className="app-button-secondary !h-10 !px-6 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    disabled
                    className="app-button-primary !h-10 !px-8 text-sm font-semibold opacity-50 cursor-not-allowed"
                  >
                    Establishing...
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleConnect}
                  className="app-button-primary !h-10 !px-8 text-sm font-semibold"
                >
                  Connect Service
                </button>
              )}
            </div>
          </section>

          <section className="app-section-card glass overflow-hidden">
            <div className="app-section-head">
              <div>
                <h2>Diagnostics</h2>
                <p>Connect, test, live status, errors, and widget delivery.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8">
              <DiagnosticLine
                icon={<IconRadio size={16} />}
                label="Inbound Data Stream"
                value={isConnected ? 'Healthy / Receiving' : status.toUpperCase()}
                tone={isConnected ? 'good' : status === 'error' ? 'bad' : 'muted'}
              />
              <DiagnosticLine
                icon={<IconSend size={16} />}
                label="Outbound Engine"
                value={canSend.canSend ? 'Operational' : canSend.reason || 'Restricted'}
                tone={canSend.canSend ? 'good' : 'muted'}
              />
              <DiagnosticLine
                icon={<IconHeart size={16} />}
                label="Like Events"
                value={likeHealthLabel}
                tone={likeHealth.lastAt ? 'good' : isConnected ? 'muted' : 'bad'}
              />
              <DiagnosticLine
                icon={<IconLayout size={16} />}
                label="Likes Tracker Source"
                value={overlayRunning ? `${likesTrackerClients} attached` : 'Overlay server offline'}
                tone={overlayRunning && likesTrackerClients > 0 ? 'good' : overlayRunning ? 'muted' : 'bad'}
              />
              <DiagnosticLine
                icon={<IconChartBar size={16} />}
                label="Leaderboard Source"
                value={overlayRunning ? `${leaderboardClients} attached` : 'Overlay server offline'}
                tone={overlayRunning && leaderboardClients > 0 ? 'good' : overlayRunning ? 'muted' : 'bad'}
              />
              <DiagnosticLine
                icon={<IconAlertCircle size={16} />}
                label="Recent Errors"
                value={error || overlayStatus?.lastError || 'None'}
                tone={error || overlayStatus?.lastError ? 'bad' : 'good'}
              />
            </div>
            <div className="flex flex-col gap-3 border-t border-white/5 px-8 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold text-white/60">Widget pipeline test</p>
                <p className={`mt-1 text-[11px] font-semibold ${likeTest.state === 'failed' ? 'text-danger/80' : 'text-white/30'}`}>
                  {likeTest.message || 'Sends a local TikTok like through the same event path as the live connector.'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleTestLike}
                disabled={likeTest.state === 'sending'}
                className="app-button-secondary !h-10 !px-5 text-xs font-semibold disabled:opacity-40"
              >
                {likeTest.state === 'sending' ? <IconAlertCircle size={15} /> : <IconHeart size={15} />}
                Send Test Like
              </button>
            </div>
          </section>

          <section className="app-section-card glass overflow-hidden relative">
            <div className="app-section-head">
              <div>
                <h2>Host Chat Sender</h2>
                <p>Visible browser session for sending messages from the host account.</p>
              </div>
              <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-semibold tracking-tight ${senderStatusClass}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${senderStatus.isChatReady ? 'bg-success animate-pulse' : 'bg-white/20'}`} />
                {senderStatus.isChatReady ? 'Ready' : 'Setup Needed'}
              </div>
            </div>
            <div className="p-8">
              <div className="bg-white/[0.03] border border-white/5 rounded-xl p-6 mb-6">
                <p className="text-sm text-white/50 leading-relaxed mb-4">
                  To send messages as yourself, log in inside the sender window and keep it on the LIVE dashboard or chat pop-out.
                  ilyStream only controls that visible session after you authenticate it.
                </p>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-lg border border-white/5">
                    <IconBrowser size={16} className="text-white/40" />
                    <span className="text-xs font-semibold text-white/70">Isolated Session</span>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-lg border border-white/5">
                    <IconWifi size={16} className="text-white/40" />
                    <span className="text-xs font-semibold text-white/70">Visible Browser Control</span>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-lg border border-white/5">
                    <IconSend size={16} className="text-white/40" />
                    <span className="text-xs font-semibold text-white/70">{senderStatus.maxMessageLength} char cap</span>
                  </div>
                </div>
              </div>

              <div className="mb-6 grid gap-3">
                {senderSetupSteps.map((step, index) => (
                  <div
                    key={step.label}
                    className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${ step.ok ? 'border-success/20 bg-success/5' : 'border-white/5 bg-white/[0.02]' }`}
                  >
                    <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${ step.ok ? 'border-success/40 text-success' : 'border-white/10 text-white/30' }`}>
                      {step.ok ? <IconCircleCheck size={14} /> : index + 1}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold tracking-tight ${step.ok ? 'text-success' : 'text-white/55'}`}>
                        {step.label}
                      </p>
                      <p className={`mt-1 text-[11px] font-semibold ${senderTest.state === 'failed' && step.label === 'Send test message' ? 'text-danger/80' : 'text-white/35'}`}>
                        {step.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 mb-6">
                {senderChecks.map((check) => (
                  <div
                    key={check.label}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 ${ check.ok ? 'border-success/20 bg-success/5 text-success' : 'border-white/5 bg-white/[0.02] text-white/35' }`}
                  >
                    <span className="text-[10px] font-semibold tracking-tight">{check.label}</span>
                    <span className="text-xs font-semibold">{check.ok ? 'OK' : '-'}</span>
                  </div>
                ))}
              </div>

              <div className="mb-6 rounded-xl border border-white/5 bg-black/20 px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs font-semibold text-white/60">{senderStatus.statusMessage}</p>
                  {senderCooldownSeconds > 0 && (
                    <span className="text-[10px] font-semibold tracking-tight text-white/25">
                      Cooldown {senderCooldownSeconds}s
                    </span>
                  )}
                </div>
                {senderStatus.lastError && (
                  <p className="mt-2 text-[10px] font-semibold text-danger/80">{senderStatus.lastError}</p>
                )}
              </div>
              
              <div className="flex items-center gap-4">
                <button 
                  onClick={handleOpenSender}
                  className="app-button-primary !h-12 flex-1 !px-8 text-sm font-semibold tracking-tight"
                >
                  {senderStatus.isWindowOpen ? 'Focus Sender Window' : 'Open Chat Session'}
                </button>
                {senderStatus.isWindowOpen && (
                  <button 
                    onClick={handleCloseSender}
                    className="app-button-secondary !h-12 !px-8 text-sm font-semibold"
                  >
                    Close
                  </button>
                )}
                <button
                  onClick={handleTestSender}
                  disabled={!senderStatus.isChatReady || senderTest.state === 'sending'}
                  className="app-button-secondary !h-12 !px-6 text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
                  title={senderStatus.isChatReady ? 'Send a short TikTok test message' : 'Finish sender setup before testing'}
                >
                  {senderTest.state === 'sending' ? <IconAlertCircle size={16} /> : <IconPlayerPlay size={16} />}
                  Test
                </button>
              </div>
            </div>
          </section>
        </div>

        <section className="app-section-card glass flex flex-col">
          <div className="flex items-center justify-between px-8 py-5 border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <IconMessage2 size={18} className="text-accent" />
              <h2 className="!text-lg">Event Feed</h2>
            </div>
            <span className="text-[10px] font-semibold tracking-tight text-white/20">Live Stream</span>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar min-h-[500px]">
            {platformEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-white/10 p-12 text-center">
                <IconWifi size={48} className="mb-6 opacity-10" />
                <p className="text-sm font-medium">Waiting for TikTok heartbeat...</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {platformEvents.map((event) => (
                  <div key={event.id} className="p-6 hover:bg-white/[0.02] transition-colors group">
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 rounded bg-accent/10 text-accent text-[10px] font-semibold tracking-tighter">
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

