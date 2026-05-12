import { useEffect, useMemo, useState } from 'react'
import {IconBell, IconLayout, IconMessage, IconSend, IconShieldCheck, IconWifi} from '@tabler/icons-react'
import { useConnectionStore } from '../../stores/connection-store'
import { 
  PlatformPageHeader, 
  Metric, 
  StatusBadge, 
  DiagnosticLine 
} from '../../components/platforms/PlatformPageLayout'

const PLATFORM_ID: Platform = 'discord'
const FIELDS = [
  { key: 'webhookUrl', label: 'Webhook URL', type: 'text', placeholder: 'https://discord.com/api/webhooks/...' },
  { key: 'botToken', label: 'Bot Token', type: 'password', placeholder: 'Discord Bot Token' },
  { key: 'clientId', label: 'Client ID', type: 'text', placeholder: 'Discord Application ID' }
]

export default function DiscordPage() {
  const statuses = useConnectionStore((s) => s.statuses)
  const errors = useConnectionStore((s) => s.errors)
  const reconnectInfo = useConnectionStore((s) => s.reconnectInfo)
  const recentEvents = useConnectionStore((s) => s.recentEvents)
  const [config, setConfig] = useState<Record<string, string>>({})

  const status = statuses[PLATFORM_ID] || 'disconnected'
  const error = errors[PLATFORM_ID]
  const isConnected = status === 'connected'
  const isConnecting = status === 'connecting'

  useEffect(() => {
    window.api.platform.getConfigs().then((configs) => {
      if (configs[PLATFORM_ID]) {
        setConfig(configs[PLATFORM_ID])
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

  return (
    <div className="app-page">
      <PlatformPageHeader 
        platformId={PLATFORM_ID}
        title="Discord Integration"
        description="Bridge your stream community to your Discord server. Send automated alerts, sync chat messages, and manage roles based on viewer activity."
        icon={<IconMessage size={14} />}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-20">
        <Metric 
          icon={<IconBell size={20} className="text-indigo-400" />} 
          label="Active Webhooks" 
          value="0" 
        />
        <Metric 
          icon={<IconShieldCheck size={20} className="text-success" />} 
          label="Robot Status" 
          value={isConnected ? 'Ready' : isConnecting ? 'Auth' : 'Standby'} 
        />
        <Metric 
          icon={<IconLayout size={20} className={isConnected ? 'text-accent' : 'text-white/20'} />} 
          label="Presence Sync" 
          value={isConnected ? 'Active' : 'Off'} 
        />
      </div>

      <div className="grid gap-16 xl:grid-cols-[1fr_450px]">
        <div className="flex flex-col gap-16">
          <section className="app-section-card glass">
            <div className="app-section-head">
              <div>
                <h2>Integration Core</h2>
                <p>Connect your Discord Application or Webhooks.</p>
              </div>
              <StatusBadge status={status} reconnect={reconnectInfo[PLATFORM_ID]} />
            </div>

            <div className="grid gap-10 p-12 md:grid-cols-1 bg-white/[0.01]">
              {FIELDS.map((field) => (
                <div key={field.key} className="flex flex-col gap-2">
                  <label className="text-xs font-black uppercase tracking-widest text-white/30">{field.label}</label>
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
            </div>

            {error && (
              <div className="px-8 py-4 bg-danger/10 border-y border-danger/20">
                <p className="text-xs font-bold text-danger leading-relaxed">{error}</p>
              </div>
            )}

            <div className="flex items-center justify-end gap-6 p-10 border-t border-white/5 mt-auto">
              {isConnected ? (
                <button onClick={handleDisconnect} className="app-button-danger !h-12 !px-8 text-sm font-bold">
                  Disconnect Discord
                </button>
              ) : isConnecting ? (
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleDisconnect}
                    className="app-button-secondary !h-12 !px-8 text-sm font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    disabled
                    className="app-button-primary !h-12 !px-10 text-sm font-bold opacity-50 cursor-not-allowed"
                  >
                    Authenticating...
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleConnect}
                  className="app-button-primary !h-12 !px-10 text-sm font-bold shadow-[0_0_20px_rgba(var(--accent-rgb),0.2)]"
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
                label="Gateway Socket"
                value={isConnected ? 'Online' : 'Offline'}
                tone={isConnected ? 'good' : 'muted'}
              />
              <DiagnosticLine
                icon={<IconSend size={16} />}
                label="Webhook Delivery"
                value={isConnected ? 'Ready' : 'Standby'}
                tone={isConnected ? 'good' : 'muted'}
              />
            </div>
          </section>
        </div>

        <section className="app-section-card glass flex flex-col">
          <div className="flex items-center justify-between px-8 py-5 border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <IconMessage size={18} className="text-indigo-400" />
              <h2 className="!text-lg">Relay Log</h2>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar min-h-[500px]">
            {platformEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-white/10 p-12 text-center">
                <IconMessage size={48} className="mb-6 opacity-10" />
                <p className="text-sm font-medium">Waiting for Discord bridge activity...</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {platformEvents.map((event) => (
                  <div key={event.id} className="p-6 hover:bg-white/[0.02] transition-colors group">
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 rounded bg-indigo-400/10 text-indigo-400 text-[10px] font-black uppercase tracking-tighter">
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
