import { MessageSquareMore, Radio, Send, Users, Wifi } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useConnectionStore } from '../../stores/connection-store'
import { 
  PlatformPageHeader, 
  Metric, 
  StatusBadge, 
  DiagnosticLine 
} from '../../components/platforms/PlatformPageLayout'

const PLATFORM_ID = 'youtube'
const FIELDS = [
  { key: 'apiKey', label: 'API key', type: 'password', placeholder: 'YouTube Data API v3 key' },
  { key: 'accessToken', label: 'Access token', type: 'password', placeholder: 'Optional for sending' },
  { key: 'liveChatId', label: 'Live Chat ID', type: 'text', placeholder: 'Auto-detected if live' },
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
        title="YouTube Integration"
        description="Connect your YouTube stream. Process Super Chats, memberships, and live chat using the YouTube Data API."
        icon={<Wifi size={14} />}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-20">
        <Metric 
          icon={<Users size={20} className="text-youtube" />} 
          label="YouTube Audience" 
          value={viewers.toLocaleString()} 
        />
        <Metric 
          icon={<Radio size={20} className={isConnected ? 'text-success' : 'text-white/20'} />} 
          label="Poller Status" 
          value={isConnected ? 'Active' : isConnecting ? 'Auth' : 'Offline'} 
        />
        <Metric 
          icon={<Wifi size={20} className={error ? 'text-danger' : 'text-white/20'} />} 
          label="Quota Health" 
          value={error ? 'Quota Error' : isConnected ? 'Healthy' : 'Standby'} 
          tone={error ? 'danger' : 'neutral'}
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
                  Disconnect YouTube
                </button>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="app-button-primary !h-12 !px-10 text-sm font-bold"
                >
                  {isConnecting ? 'Linking...' : 'Connect Service'}
                </button>
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
                icon={<Radio size={16} />}
                label="Chat Poller"
                value={isConnected ? 'Polling / 5s Interval' : status.toUpperCase()}
                tone={isConnected ? 'good' : status === 'error' ? 'bad' : 'muted'}
              />
              <DiagnosticLine
                icon={<Send size={16} />}
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
              <MessageSquareMore size={18} className="text-youtube" />
              <h2 className="!text-lg">YouTube Feed</h2>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar min-h-[500px]">
            {platformEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-white/10 p-12 text-center">
                <Wifi size={48} className="mb-6 opacity-10" />
                <p className="text-sm font-medium">Waiting for YouTube events...</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {platformEvents.map((event) => (
                  <div key={event.id} className="p-6 hover:bg-white/[0.02] transition-colors group">
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 rounded bg-youtube/10 text-youtube text-[10px] font-black uppercase tracking-tighter">
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
