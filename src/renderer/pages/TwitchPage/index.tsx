import {IconMessage2, IconRadio, IconSend, IconUsers, IconWifi} from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { useConnectionStore } from '../../stores/connection-store'
import { 
  PlatformPageHeader, 
  Metric, 
  StatusBadge, 
  DiagnosticLine 
} from '../../components/platforms/PlatformPageLayout'

const PLATFORM_ID = 'twitch'
const FIELDS = [
  { key: 'channel', label: 'Channel name', type: 'text', placeholder: 'channel' },
  { key: 'clientId', label: 'Client ID', type: 'text', placeholder: 'Twitch app client ID' },
  { key: 'clientSecret', label: 'Client secret', type: 'password', placeholder: 'Client secret' },
  { key: 'accessToken', label: 'Access token', type: 'password', placeholder: 'OAuth access token' },
  { key: 'streamKey', label: 'Stream key', type: 'password', placeholder: 'Twitch stream key' }
]

export default function TwitchPage() {
  const statuses = useConnectionStore((s) => s.statuses)
  const errors = useConnectionStore((s) => s.errors)
  const viewerCounts = useConnectionStore((s) => s.viewerCounts)
  const reconnectInfo = useConnectionStore((s) => s.reconnectInfo)
  const recentEvents = useConnectionStore((s) => s.recentEvents)
  const [config, setConfig] = useState<Record<string, string>>({})
  const [canSend, setCanSend] = useState({ canSend: false, reason: 'Initializing...' })

  const status = statuses[PLATFORM_ID]
  const error = errors[PLATFORM_ID]
  const viewers = viewerCounts[PLATFORM_ID]
  const isConnected = status === 'connected'
  const isConnecting = status === 'connecting'

  useEffect(() => {
    window.api.platform.getConfigs().then((configs) => {
      if (configs[PLATFORM_ID]) {
        setConfig(configs[PLATFORM_ID])
      }
    })

    window.api.platform.getChatCapabilities().then((caps) => {
      if (caps[PLATFORM_ID]) {
        setCanSend(caps[PLATFORM_ID])
      }
    })
  }, [status])

  const platformEvents = useMemo(
    () => recentEvents.filter((event) => event.platform === PLATFORM_ID).slice(0, 15),
    [recentEvents]
  )

  const handleConnect = async () => {
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
    await window.api.platform.disconnect(PLATFORM_ID)
  }

  const updateField = (key: string, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="app-page">
      <PlatformPageHeader 
        platformId={PLATFORM_ID}
        title="Twitch Integration"
        description="Link your Twitch channel for IRC chat processing, subscription alerts, and live stream telemetry."
        icon={<IconWifi size={14} />}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-20">
        <Metric 
          icon={<IconUsers size={20} className="text-twitch" />} 
          label="Twitch Viewers" 
          value={viewers.toLocaleString()} 
        />
        <Metric 
          icon={<IconRadio size={20} className={isConnected ? 'text-success' : 'text-white/20'} />} 
          label="IRC Status" 
          value={isConnected ? 'Active' : isConnecting ? 'Auth' : 'Offline'} 
        />
        <Metric 
          icon={<IconWifi size={20} className={error ? 'text-danger' : 'text-white/20'} />} 
          label="API Health" 
          value={error ? 'Error' : isConnected ? 'Optimal' : 'Standby'} 
          tone={error ? 'danger' : 'neutral'}
        />
      </div>

      <div className="grid gap-16 xl:grid-cols-[1fr_450px]">
        <div className="flex flex-col gap-16">
          <section className="app-section-card glass">
            <div className="app-section-head">
              <div>
                <h2>Twitch Auth</h2>
                <p>IRC and Helix API credentials.</p>
              </div>
              <StatusBadge status={status} reconnect={reconnectInfo[PLATFORM_ID]} />
            </div>

            <div className="grid gap-10 p-12 md:grid-cols-2 bg-white/[0.01]">
              {FIELDS.map((field) => (
                <div key={field.key} className="flex flex-col gap-2">
                  <label className="text-xs font-black uppercase tracking-widest text-white/30">{field.label}</label>
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
                <p className="text-xs font-bold text-danger leading-relaxed">{error}</p>
              </div>
            )}

            <div className="flex items-center justify-end gap-6 p-10 border-t border-white/5 mt-auto">
              {isConnected ? (
                <button onClick={handleDisconnect} className="app-button-danger !h-12 !px-8 text-sm font-bold">
                  Disconnect Twitch
                </button>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="app-button-primary !h-12 !px-10 text-sm font-bold"
                >
                  {isConnecting ? 'Authenticating...' : 'Connect Service'}
                </button>
              )}
            </div>
          </section>

          <section className="app-section-card glass overflow-hidden">
            <div className="app-section-head">
              <div>
                <h2>API Status</h2>
                <p>Connectivity validation for Twitch services.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-12">
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
              <div className="flex flex-col items-center justify-center h-full text-white/10 p-12 text-center">
                <IconWifi size={48} className="mb-6 opacity-10" />
                <p className="text-sm font-medium">Waiting for Twitch events...</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {platformEvents.map((event) => (
                  <div key={event.id} className="p-6 hover:bg-white/[0.02] transition-colors group">
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 rounded bg-twitch/10 text-twitch text-[10px] font-black uppercase tracking-tighter">
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
