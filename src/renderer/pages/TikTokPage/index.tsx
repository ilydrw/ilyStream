import { MessageSquareMore, Radio, Send, Users, Wifi } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { PlatformLogo } from '../../components/platforms/PlatformLogo'
import { useConnectionStore } from '../../stores/connection-store'
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
  { key: 'signApiKey', label: 'Sign API key', type: 'password', placeholder: 'Required for TikTok sendMessage' },
  { key: 'streamKey', label: 'Stream key', type: 'password', placeholder: 'TikTok stream key' }
]

export default function TikTokPage() {
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
        title="TikTok Integration"
        description="Connect your TikTok Live stream to IlyStream. Monitor real-time gifts, follows, and chat events with professional-grade diagnostics."
        icon={<Wifi size={14} />}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <Metric 
          icon={<Users size={20} className="text-tiktok" />} 
          label="TikTok Viewers" 
          value={viewers.toLocaleString()} 
        />
        <Metric 
          icon={<Radio size={20} className={isConnected ? 'text-success' : 'text-white/20'} />} 
          label="Connection State" 
          value={isConnected ? 'Active' : isConnecting ? 'Linking' : 'Offline'} 
          tone={isConnected ? 'neutral' : 'neutral'}
        />
        <Metric 
          icon={<Wifi size={20} className={error ? 'text-danger' : 'text-white/20'} />} 
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

            <div className="flex items-center justify-end gap-6 p-8 border-t border-white/5 mt-auto">
              {isConnected ? (
                <button onClick={handleDisconnect} className="app-button-danger !h-10 !px-8 text-sm font-bold">
                  Disconnect TikTok
                </button>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="app-button-primary !h-10 !px-8 text-sm font-bold"
                >
                  {isConnecting ? 'Establishing...' : 'Connect Service'}
                </button>
              )}
            </div>
          </section>

          <section className="app-section-card glass overflow-hidden">
            <div className="app-section-head">
              <div>
                <h2>Diagnostics</h2>
                <p>Technical heartbeat for the TikTok node.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8">
              <DiagnosticLine
                icon={<Radio size={16} />}
                label="Inbound Data Stream"
                value={isConnected ? 'Healthy / Receiving' : status.toUpperCase()}
                tone={isConnected ? 'good' : status === 'error' ? 'bad' : 'muted'}
              />
              <DiagnosticLine
                icon={<Send size={16} />}
                label="Outbound Engine"
                value={canSend.canSend ? 'Operational' : canSend.reason || 'Restricted'}
                tone={canSend.canSend ? 'good' : 'muted'}
              />
            </div>
          </section>
        </div>

        <section className="app-section-card glass flex flex-col">
          <div className="flex items-center justify-between px-8 py-5 border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <MessageSquareMore size={18} className="text-accent" />
              <h2 className="!text-lg">Event Feed</h2>
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Live Stream</span>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar min-h-[500px]">
            {platformEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-white/10 p-12 text-center">
                <Wifi size={48} className="mb-6 opacity-10" />
                <p className="text-sm font-medium">Waiting for TikTok heartbeat...</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {platformEvents.map((event) => (
                  <div key={event.id} className="p-6 hover:bg-white/[0.02] transition-colors group">
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 rounded bg-accent/10 text-accent text-[10px] font-black uppercase tracking-tighter">
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
