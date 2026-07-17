import {IconMessage2, IconRadio, IconSend, IconUsers, IconWifi} from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { useConnectionStore } from '../../stores/connection-store'
import { getPlatformCapability, getPlatformConfig } from '../../lib/platform-configs'
import { 
  PlatformPageHeader, 
  Metric, 
  StatusBadge, 
  DiagnosticLine 
} from '../../components/platforms/PlatformPageLayout'

const PLATFORM_ID = 'kick'
const DEFAULT_WEBHOOK_PORT = '8792'
const DEFAULT_WEBHOOK_PATH = '/kick/webhook'

type ConfigValue = string | number | boolean | undefined

const STREAM_FIELDS = [
  { key: 'channelName', label: 'Channel name', type: 'text', placeholder: 'Your Kick channel' },
  { key: 'streamUrl', label: 'Stream URL', type: 'text', placeholder: 'rtmps://.../app' },
  { key: 'streamKey', label: 'Stream key', type: 'password', placeholder: 'Kick stream key' }
]

const EVENT_FIELDS = [
  { key: 'webhookPublicUrl', label: 'Public webhook URL', type: 'text', placeholder: 'https://your-tunnel.example/kick/webhook' },
  { key: 'webhookPort', label: 'Local receiver port', type: 'number', placeholder: DEFAULT_WEBHOOK_PORT }
]

const DEVELOPER_FIELDS = [
  { key: 'clientId', label: 'Client ID', type: 'text', placeholder: 'Kick developer client ID' },
  { key: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'Kick developer client secret' },
  { key: 'broadcasterUserId', label: 'Broadcaster user ID', type: 'number', placeholder: 'Kick user ID' }
]

export default function KickPage() {
  const statuses = useConnectionStore((s) => s.statuses)
  const errors = useConnectionStore((s) => s.errors)
  const viewerCounts = useConnectionStore((s) => s.viewerCounts)
  const reconnectInfo = useConnectionStore((s) => s.reconnectInfo)
  const recentEvents = useConnectionStore((s) => s.recentEvents)
  const [config, setConfig] = useState<Record<string, ConfigValue>>({})
  const [canSend, setCanSend] = useState({ canSend: false, reason: 'Initializing...' })
  const [setupMessage, setSetupMessage] = useState<{ tone: 'success' | 'danger' | 'neutral'; text: string } | null>(null)
  const [userAuth, setUserAuth] = useState<{ connected: boolean; redirectUri: string } | null>(null)
  const [userAuthBusy, setUserAuthBusy] = useState(false)

  const status = statuses[PLATFORM_ID] || 'disconnected'
  const error = errors[PLATFORM_ID] || null
  const viewers = viewerCounts[PLATFORM_ID] || 0
  const isConnected = status === 'connected'
  const isConnecting = status === 'connecting'
  const receiverLocked = isConnected || isConnecting
  const webhookPort = String(config.webhookPort || DEFAULT_WEBHOOK_PORT).trim() || DEFAULT_WEBHOOK_PORT
  const webhookPath = normalizeWebhookPath(String(config.webhookPath || DEFAULT_WEBHOOK_PATH))
  const localWebhookUrl = `http://127.0.0.1:${webhookPort}${webhookPath}`
  const canSubscribeEvents = Boolean(
    String(config.clientId || '').trim() &&
    String(config.clientSecret || '').trim() &&
    (String(config.broadcasterUserId || '').trim() || String(config.channelName || '').trim())
  )

  useEffect(() => {
    window.api.platform.getConfigs().then((configs) => {
      const platformConfig = getPlatformConfig(configs, PLATFORM_ID)
      if (platformConfig) setConfig(platformConfig as unknown as Record<string, ConfigValue>)
    })

    window.api.platform.getChatCapabilities().then((caps) => {
      const capability = getPlatformCapability(caps, PLATFORM_ID)
      if (capability) setCanSend({ canSend: capability.canSend, reason: capability.reason ?? '' })
    })

    window.api.platform.kick.getUserAuthStatus().then(setUserAuth).catch(() => {})
  }, [status])

  const platformEvents = useMemo(
    () => recentEvents.filter((event) => event.platform === PLATFORM_ID).slice(0, 15),
    [recentEvents]
  )

  const handleConnect = async () => {
    try {
      setSetupMessage(null)
      await window.api.platform.connect(buildKickConfig(true))
    } catch (err) {
      console.error('Failed to connect:', err)
    }
  }

  const handleDisconnect = async () => {
    await window.api.platform.disconnect(PLATFORM_ID)
  }

  const handleSaveConfig = async () => {
    await window.api.platform.saveConfig(buildKickConfig(isConnected))
    setSetupMessage({ tone: 'success', text: 'Kick setup saved.' })
  }

  const handleSubscribeEvents = async () => {
    try {
      setSetupMessage({ tone: 'neutral', text: 'Subscribing Kick events...' })
      await window.api.platform.saveConfig(buildKickConfig(isConnected))
      const result = await window.api.platform.kick.subscribeEvents({
        clientId: String(config.clientId || ''),
        clientSecret: String(config.clientSecret || ''),
        broadcasterUserId: String(config.broadcasterUserId || ''),
        channelName: String(config.channelName || '')
      })
      const failed = result.subscriptions.filter((entry: any) => entry.error)
      setSetupMessage({
        tone: failed.length > 0 ? 'danger' : 'success',
        text: failed.length > 0
          ? `Kick returned ${failed.length} event subscription error${failed.length === 1 ? '' : 's'}.`
          : `Subscribed ${result.subscriptions.length} Kick event${result.subscriptions.length === 1 ? '' : 's'}.`
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setSetupMessage({ tone: 'danger', text: message })
    }
  }

  const handleConnectAccount = async () => {
    try {
      setUserAuthBusy(true)
      setSetupMessage({ tone: 'neutral', text: 'Complete the Kick authorization in your browser...' })
      // Persist any freshly typed client credentials first — the auth flow
      // reads them from the saved config in the main process.
      await window.api.platform.saveConfig(buildKickConfig(isConnected))
      await window.api.platform.kick.beginUserAuth()
      const status = await window.api.platform.kick.getUserAuthStatus()
      setUserAuth(status)
      setSetupMessage({ tone: 'success', text: 'Kick account connected — stream title and category can now be set from the Broadcast page.' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setSetupMessage({ tone: 'danger', text: message })
    } finally {
      setUserAuthBusy(false)
    }
  }

  const handleDisconnectAccount = async () => {
    await window.api.platform.kick.disconnectUserAuth()
    const status = await window.api.platform.kick.getUserAuthStatus()
    setUserAuth(status)
    setSetupMessage({ tone: 'neutral', text: 'Kick account disconnected.' })
  }

  const updateField = (key: string, value: ConfigValue) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  const buildKickConfig = (enabled: boolean) => {
    const parsedWebhookPort = Number(webhookPort)
    return {
      ...config,
      platform: PLATFORM_ID,
      enabled,
      webhookPort: Number.isFinite(parsedWebhookPort) && parsedWebhookPort > 0 ? parsedWebhookPort : Number(DEFAULT_WEBHOOK_PORT),
      webhookPath,
      legacySocket: config.legacySocket === true
    }
  }

  return (
    <div className="app-page">
      <PlatformPageHeader 
        platformId={PLATFORM_ID}
        title="Kick Integration"
        description="Connect your Kick.com channel. ilyStream handles sub alerts, chat interaction, and streamer telemetry on the Kick platform."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-20">
        <Metric 
          icon={<IconUsers size={20} className="text-kick" />} 
          label="Kick Audience" 
          value={(viewers || 0).toLocaleString()} 
        />
        <Metric 
          icon={<IconRadio size={20} className={isConnected ? 'text-success' : 'text-white/20'} />} 
          label="Receiver Status" 
          value={isConnected ? 'Healthy' : isConnecting ? 'Linking' : 'Offline'} 
        />
        <Metric 
          icon={<IconWifi size={20} className={error ? 'text-danger' : 'text-white/20'} />} 
          label="Service Health" 
          value={error ? 'Critical' : isConnected ? 'Optimal' : 'Standby'} 
          tone={error ? 'danger' : 'neutral'}
        />
      </div>

      <div className="grid gap-16 xl:grid-cols-[1fr_450px]">
        <div className="flex flex-col gap-16">
          <section className="app-section-card glass">
            <div className="app-section-head">
              <div>
                <h2>Kick Configuration</h2>
                <p>Channel, stream destination, and event receiver.</p>
              </div>
              <StatusBadge status={status} reconnect={reconnectInfo[PLATFORM_ID]} />
            </div>

            <div className="grid gap-10 p-12 md:grid-cols-3 bg-white/[0.01]">
              {STREAM_FIELDS.map((field) => (
                <div key={field.key} className="flex flex-col gap-2">
                  <label className="text-xs font-semibold tracking-tight text-white/30">{field.label}</label>
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    value={String(config[field.key] || '')}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    disabled={isConnecting || (field.key === 'channelName' && isConnected)}
                    className="app-input disabled:opacity-30 disabled:cursor-not-allowed"
                  />
                </div>
              ))}
            </div>

            <div className="grid gap-10 px-12 pb-12 md:grid-cols-2 bg-white/[0.01]">
              <div className="flex flex-col gap-2 md:col-span-2">
                <label className="text-xs font-semibold tracking-tight text-white/30">Local webhook endpoint</label>
                <input
                  type="text"
                  value={localWebhookUrl}
                  readOnly
                  className="app-input text-white/55"
                />
              </div>

              {EVENT_FIELDS.map((field) => (
                <div key={field.key} className="flex flex-col gap-2">
                  <label className="text-xs font-semibold tracking-tight text-white/30">{field.label}</label>
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    value={String(config[field.key] || '')}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    disabled={isConnecting || (field.key === 'webhookPort' && isConnected)}
                    className="app-input disabled:opacity-30 disabled:cursor-not-allowed"
                  />
                </div>
              ))}

              {DEVELOPER_FIELDS.map((field) => (
                <div key={field.key} className="flex flex-col gap-2">
                  <label className="text-xs font-semibold tracking-tight text-white/30">{field.label}</label>
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    value={String(config[field.key] || '')}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    disabled={isConnecting}
                    className="app-input disabled:opacity-30 disabled:cursor-not-allowed"
                  />
                </div>
              ))}

              <label className="flex items-center gap-3 text-xs font-semibold text-white/45 md:col-span-2">
                <input
                  type="checkbox"
                  checked={config.legacySocket === true}
                  onChange={(e) => updateField('legacySocket', e.target.checked)}
                  disabled={receiverLocked}
                  className="h-4 w-4 accent-kick disabled:opacity-30"
                />
                Try legacy socket fallback
              </label>

              <div className="md:col-span-2 rounded-xl border border-white/[0.05] bg-white/[0.02] p-6 flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">Kick account</p>
                    <p className="mt-1 text-xs leading-relaxed text-white/35">
                      {userAuth?.connected
                        ? 'Connected — the Broadcast page can set your stream title and category.'
                        : 'Authorize your Kick account so ilyStream can set your stream title and category before you go live.'}
                    </p>
                  </div>
                  {userAuth?.connected ? (
                    <button
                      onClick={handleDisconnectAccount}
                      className="app-button-secondary !h-10 !px-6 text-xs font-semibold"
                    >
                      Disconnect account
                    </button>
                  ) : (
                    <button
                      onClick={handleConnectAccount}
                      disabled={userAuthBusy || !String(config.clientId || '').trim() || !String(config.clientSecret || '').trim()}
                      className="app-button-primary !h-10 !px-6 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {userAuthBusy ? 'Waiting for Kick…' : 'Connect Kick account'}
                    </button>
                  )}
                </div>
                {!userAuth?.connected && userAuth?.redirectUri && (
                  <p className="text-[11px] leading-relaxed text-white/30">
                    Requires the Client ID and Secret above, and this redirect URI registered on your Kick app:{' '}
                    <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-white/55">{userAuth.redirectUri}</code>
                  </p>
                )}
              </div>
            </div>

            {setupMessage && (
              <div className={`px-8 py-4 border-y ${
                setupMessage.tone === 'danger'
                  ? 'bg-danger/10 border-danger/20 text-danger'
                  : setupMessage.tone === 'success'
                    ? 'bg-success/10 border-success/20 text-success'
                    : 'bg-white/[0.03] border-white/10 text-white/55'
              }`}>
                <p className="text-xs font-semibold leading-relaxed">{setupMessage.text}</p>
              </div>
            )}

            {error && (
              <div className="px-8 py-4 bg-danger/10 border-y border-danger/20">
                <p className="text-xs font-semibold text-danger leading-relaxed">{error}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-6 p-10 border-t border-white/5 mt-auto">
              <button
                onClick={handleSaveConfig}
                disabled={isConnecting}
                className="app-button-secondary !h-12 !px-8 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save Setup
              </button>
              <button
                onClick={handleSubscribeEvents}
                disabled={isConnecting || !canSubscribeEvents}
                className="app-button-secondary !h-12 !px-8 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Subscribe Events
              </button>
              {isConnected ? (
                <button onClick={handleDisconnect} className="app-button-danger !h-12 !px-8 text-sm font-semibold">
                  Disconnect Kick
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
                    Linking...
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleConnect}
                  className="app-button-primary !h-12 !px-10 text-sm font-semibold"
                >
                  Start Receiver
                </button>
              )}
            </div>
          </section>

          <section className="app-section-card glass overflow-hidden">
            <div className="app-section-head">
              <div>
                <h2>Real-time Stream</h2>
                <p>Status of the Kick event receiver.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-12">
              <DiagnosticLine
                icon={<IconRadio size={16} />}
                label="Webhook Receiver"
                value={isConnected ? 'Listening / Ready' : status.toUpperCase()}
                tone={isConnected ? 'good' : status === 'error' ? 'bad' : 'muted'}
              />
              <DiagnosticLine
                icon={<IconSend size={16} />}
                label="Chat Write Engine"
                value={canSend.canSend ? 'Operational' : canSend.reason || 'Restricted'}
                tone={canSend.canSend ? 'good' : 'muted'}
              />
            </div>
          </section>
        </div>

        <section className="app-section-card glass flex flex-col">
          <div className="flex items-center justify-between px-8 py-5 border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <IconMessage2 size={18} className="text-kick" />
              <h2 className="!text-lg">Kick Feed</h2>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar min-h-[500px]">
            {platformEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-white/10 p-12 text-center">
                <IconWifi size={48} className="mb-6 opacity-10" />
                <p className="text-sm font-medium">Waiting for Kick events...</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {platformEvents.map((event) => (
                  <div key={event.id} className="p-6 hover:bg-white/[0.02] transition-colors group">
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 rounded bg-kick/10 text-kick text-[10px] font-semibold tracking-tighter">
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

function normalizeWebhookPath(value: string): string {
  const trimmed = value.trim() || DEFAULT_WEBHOOK_PATH
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}
