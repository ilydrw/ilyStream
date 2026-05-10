import { MessageSquareMore, Radio, Users, Volume2, WandSparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PlatformLogo } from '../../components/platforms/PlatformLogo'
import { useChatStore } from '../../stores/chat-store'
import { useConnectionStore } from '../../stores/connection-store'
import { useTTSStore } from '../../stores/tts-store'
import { SpotifyIcon } from '../../components/ui/SpotifyIcon'

import { MetricCard, QuickLink, HealthRow, SpotifyMetricCard } from './components/DashboardShared'

const platformLabels: Record<string, string> = {
  tiktok: 'TikTok',
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick'
}

const statusStyles: Record<string, string> = {
  connected: 'text-success',
  connecting: 'text-warning',
  disconnected: 'text-muted',
  error: 'text-danger'
}

function statusDot(status: string): string {
  switch (status) {
    case 'connected': return 'bg-success'
    case 'connecting': return 'bg-warning'
    case 'error': return 'bg-danger'
    default: return 'bg-white/10'
  }
}

export default function DashboardPage() {
  const statuses = useConnectionStore((s) => s.statuses)
  const viewerCounts = useConnectionStore((s) => s.viewerCounts)
  const errors = useConnectionStore((s) => s.errors)
  const messages = useChatStore((s) => s.messages)
  const ttsQueue = useTTSStore((s) => s.queue)
  const ttsEnabled = useTTSStore((s) => s.enabled)

  const connectedCount = Object.values(statuses).filter((status) => status === 'connected').length
  const totalViewers = Object.values(viewerCounts).reduce((sum, count) => sum + count, 0)
  const issueCount = Object.values(statuses).filter((status) => status === 'error').length
  const liveMessages = [...messages].slice(-10).reverse()
  const queuePreview = ttsQueue.slice(0, 5)
  const platformRows = (Object.keys(statuses) as Array<keyof typeof statuses>).map((platform) => ({
    platform,
    label: platformLabels[platform],
    status: statuses[platform],
    viewers: viewerCounts[platform],
    error: errors[platform]
  }))

  return (
    <div className="app-page">
      <header className="app-page-header">
        <div className="flex items-center gap-6">
          <div className="flex items-center justify-center">
            <Radio size={32} className="text-accent" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <div className="app-header-eyebrow">
                <Radio size={14} className="text-accent" />
                <span>Operational Center</span>
              </div>
              <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-black tracking-widest text-white/40">
                v0.0.6
              </span>
            </div>
            <h1>Broadcast Dashboard</h1>
            <p className="app-page-intro">
              Real-time telemetry and control interface for your unified stream environment. 
              Monitor audience engagement and system health across all connected platforms.
            </p>
          </div>
        </div>
      </header>

      {/* Hero Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-6 mb-12">
        <MetricCard 
          icon={<Radio size={20} />} 
          label="Service Nodes" 
          value={`${connectedCount}/4`} 
          subValue={issueCount > 0 ? `${issueCount} Node Issues` : "All Nodes Healthy"}
          trend={issueCount > 0 ? 'down' : 'neutral'}
        />
        <MetricCard 
          icon={<Users size={20} />} 
          label="Combined Audience" 
          value={totalViewers.toLocaleString()} 
          subValue="Active Concurrents"
          trend="neutral"
        />
        <MetricCard 
          icon={<MessageSquareMore size={20} />} 
          label="Data Throughput" 
          value={messages.length.toLocaleString()} 
          subValue="Messages Captured"
          trend="up"
        />
        <SpotifyMetricCard />
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-[1fr_360px] gap-8">
        <div className="flex flex-col gap-8">
          <section className="app-section-card glass">
            <div className="app-section-head">
              <div>
                <h2 className="text-sm font-black tracking-tight">Service Nodes</h2>
                <p className="text-[10px] opacity-40">Real-time status of connected platform ingest servers.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8 pt-0">
              {platformRows.map((row) => (
                <Link 
                  key={row.platform} 
                  to={`/connections/${row.platform}`}
                  className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.015] border border-white/5 hover:border-white/10 hover:bg-white/[0.02] transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center transition-transform">
                      <PlatformLogo platform={row.platform} size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold text-white">{row.label}</span>
                        <div className={`w-1.5 h-1.5 rounded-full ${statusDot(row.status)}`} />
                      </div>
                      <p className={`text-[10px] font-black tracking-widest ${statusStyles[row.status]}`}>
                        {row.status}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black text-white tabular-nums leading-none">{row.viewers.toLocaleString()}</div>
                    <div className="text-[9px] font-black tracking-widest text-white/20 mt-1">Viewers</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className="app-section-card glass !flex flex-col min-h-[600px]">
            <div className="app-section-head">
              <div>
                <h2 className="text-sm font-black tracking-tight">Event Pulse</h2>
                <p className="text-[10px] opacity-40">Consolidated real-time stream interaction telemetry.</p>
              </div>
              <div className="flex items-center gap-2">
                <Link to="/stats" className="app-button !bg-white/[0.03] !border-white/10 !h-10 !px-5 text-[10px] font-black tracking-widest hover:!bg-white/[0.05]">
                  Lifetime Stats
                </Link>
                <Link to="/chat" className="app-button !h-10 !px-5 text-[10px] font-black tracking-widest">
                  Deep Diagnostics
                </Link>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-8 pt-0">
              {liveMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-white/10">
                  <MessageSquareMore size={48} className="mb-4 opacity-10" />
                  <p className="text-[10px] font-black tracking-widest opacity-20">Monitoring - Waiting for Interaction</p>
                </div>
              ) : (
                <div className="flex flex-col gap-8">
                  {liveMessages.map((msg) => (
                    <div key={msg.id} className="p-4 rounded-2xl bg-white/[0.01] border border-white/[0.03] hover:border-white/10 hover:bg-white/[0.02] transition-all animate-in fade-in slide-in-from-bottom-2 duration-500">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-center">
                            <PlatformLogo platform={msg.platform} size={14} />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-white/90">{msg.displayName}</span>
                            <p className="text-[9px] font-black tracking-widest text-white/20">{msg.platform}</p>
                          </div>
                        </div>
                        <span className="text-[10px] text-white/20 font-mono tracking-tighter">
                          {msg.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-white/50 leading-relaxed pl-11">{msg.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-8">
          <section className="app-section-card glass">
            <div className="app-section-head">
              <div>
                <h2 className="text-sm font-black tracking-tight">Speech Engine</h2>
                <p className="text-[10px] opacity-40">Active Text-to-Speech queue status.</p>
              </div>
              <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black tracking-widest ${ttsEnabled ? 'bg-success/10 text-success' : 'bg-white/5 text-white/20'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${ttsEnabled ? 'bg-success' : 'bg-white/10'}`} />
                {ttsEnabled ? 'Active' : 'Standby'}
              </div>
            </div>
            <div className="p-8 pt-0 flex flex-col gap-4">
              {queuePreview.length === 0 ? (
                <div className="py-12 text-center text-white/10">
                  <Volume2 size={32} className="mx-auto mb-3 opacity-10" />
                  <p className="text-[10px] font-black tracking-widest opacity-20">Queue Neutral</p>
                </div>
              ) : (
                queuePreview.map((item, i) => (
                  <div key={item.id} className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.015] border border-white/5">
                    <div className="w-8 h-8 rounded-lg bg-white/[0.03] flex items-center justify-center text-[10px] font-black text-white/30">{i + 1}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-white truncate">{item.username}</p>
                      <p className="text-[10px] text-white/20 truncate">{item.text}</p>
                    </div>
                    <PlatformLogo platform={item.platform as any} size={12} />
                  </div>
                ))
              )}
              <Link to="/tts" className="app-button w-full !h-10 !text-[10px] font-black tracking-widest mt-2">
                Manage Voice Logic
              </Link>
            </div>
          </section>

          <section className="app-section-card glass">
            <div className="app-section-head">
              <div>
                <h2 className="text-sm font-black tracking-tight">Quick Routes</h2>
                <p className="text-[10px] opacity-40">Primary navigation entry points.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 p-8 pt-0">
              <QuickLink to="/chat" icon={<MessageSquareMore size={18} />} label="Chat Hub" />
              <QuickLink to="/tts" icon={<Volume2 size={18} />} label="Voice Engine" />
              <QuickLink to="/spotify" icon={<SpotifyIcon size={18} />} label="Spotify Hub" />
              <QuickLink to="/triggers" icon={<WandSparkles size={18} />} label="Automations" />
            </div>
          </section>

          <section className="app-section-card glass">
            <div className="app-section-head">
              <div>
                <h2 className="text-sm font-black tracking-tight">System Health</h2>
                <p className="text-[10px] opacity-40">Diagnostic telemetry summary.</p>
              </div>
            </div>
            <div className="p-8 pt-0 space-y-6">
              <HealthRow label="Inbound Nodes" value={`${connectedCount}/4`} tone={connectedCount === 4 ? 'good' : 'muted'} />
              <HealthRow label="Core Latency" value="7.4ms" tone="good" />
              <HealthRow label="Memory Pool" value="184MB" tone="good" />
              <HealthRow label="Socket Flow" value="Optimal" tone="good" />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

