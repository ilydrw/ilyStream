import { IconUsers, IconMessage2, IconVolume } from '@tabler/icons-react'
import { IconBroadcast, IconChat, IconTTS, IconBolt } from '../../components/ui/icons/nav'
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
        <div className="app-page-title-cluster">
          <div className="app-page-title-icon">
            <IconBroadcast size={20} />
          </div>
          <div className="app-page-title-copy">
            <div className="app-page-title-kicker">Live</div>
            <h1>Broadcast Dashboard</h1>
          </div>
        </div>
      </header>

      {/* Hero Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-3">
        <MetricCard
          icon={<IconBroadcast size={18} />}
          label="Service Nodes"
          value={`${connectedCount}/4`}
          subValue={issueCount > 0 ? `${issueCount} node issues` : "All nodes healthy"}
          trend={issueCount > 0 ? 'down' : 'neutral'}
        />
        <MetricCard
          icon={<IconUsers size={18} />}
          label="Combined audience"
          value={(totalViewers || 0).toLocaleString()}
          subValue="Active concurrents"
          trend="neutral"
        />
        <MetricCard
          icon={<IconChat size={18} />}
          label="Data throughput"
          value={messages.length.toLocaleString()}
          subValue="Messages captured"
          trend="up"
        />
        <SpotifyMetricCard />
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-[1fr_320px] gap-4">
        <div className="flex flex-col gap-4">
          <section className="app-section-card glass">
            <div className="app-section-head">
              <h2>Service nodes</h2>
            </div>
            <div className="app-section-content grid grid-cols-1 md:grid-cols-2 gap-3 !pt-0">
              {platformRows.map((row) => (
                <Link
                  key={row.platform}
                  to={`/connections/${row.platform}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-3 rounded-md hover:bg-white/[0.03] transition-colors group overflow-hidden"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-white/[0.04] flex items-center justify-center">
                      <PlatformLogo platform={row.platform} size={16} />
                    </div>
                    <div className="min-w-0 flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-white">{row.label}</span>
                        <div className={`w-1.5 h-1.5 rounded-full ${statusDot(row.status)}`} />
                      </div>
                      <p className={`truncate text-[12px] font-normal ${statusStyles[row.status]}`}>
                        {row.status}
                      </p>
                    </div>
                  </div>
                  <div className="min-w-[56px] shrink-0 text-right flex flex-col items-end gap-0.5">
                    <div className="max-w-full truncate text-[16px] font-semibold text-white tabular-nums leading-none tracking-tight">{(row.viewers || 0).toLocaleString()}</div>
                    <div className="text-[11px] font-normal text-white/32">Viewers</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className="app-section-card glass !flex flex-col min-h-[480px]">
            <div className="app-section-head">
              <h2>Event pulse</h2>
              <div className="flex items-center gap-2">
                <Link to="/stats" className="app-button">
                  Lifetime stats
                </Link>
                <Link to="/chat" className="app-button-primary">
                  Deep diagnostics
                </Link>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar app-section-content !pt-0">
              {liveMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-white/18">
                  <IconMessage2 size={40} className="mb-3 opacity-40" />
                  <p className="text-[12px] font-normal text-white/32">Monitoring — waiting for interaction</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {liveMessages.map((msg) => (
                    <div key={msg.id} className="p-3 rounded-md hover:bg-white/[0.025] transition-colors animate-in fade-in slide-in-from-bottom-1 duration-300">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-md bg-white/[0.04] flex items-center justify-center">
                            <PlatformLogo platform={msg.platform} size={13} />
                          </div>
                          <div>
                            <span className="text-[13px] font-medium text-white">{msg.displayName}</span>
                            <p className="text-[11px] font-normal text-white/32 leading-none mt-0.5">{msg.platform}</p>
                          </div>
                        </div>
                        <span className="text-[11px] text-white/32 font-mono tabular-nums">
                          {msg.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[13px] text-white/55 leading-relaxed pl-10">{msg.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <section className="app-section-card glass">
            <div className="app-section-head">
              <h2>Speech engine</h2>
              <div className={`flex items-center gap-2 px-2 py-0.5 rounded text-[11px] font-medium ${ttsEnabled ? 'bg-success/10 text-success' : 'bg-white/[0.04] text-white/55'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${ttsEnabled ? 'bg-success' : 'bg-white/20'}`} />
                {ttsEnabled ? 'Active' : 'Standby'}
              </div>
            </div>
            <div className="app-section-content !pt-0 flex flex-col gap-2">
              {queuePreview.length === 0 ? (
                <div className="py-8 text-center text-white/32">
                  <IconVolume size={28} className="mx-auto mb-2 opacity-40" />
                  <p className="text-[12px] font-normal">Queue empty</p>
                </div>
              ) : (
                queuePreview.map((item, i) => (
                  <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-md bg-white/[0.025]">
                    <div className="w-7 h-7 rounded-md bg-white/[0.04] flex items-center justify-center text-[11px] font-medium text-white/55 tabular-nums">{i + 1}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-white truncate leading-tight">{item.username}</p>
                      <p className="text-[11px] text-white/32 truncate leading-tight mt-0.5">{item.text}</p>
                    </div>
                    <PlatformLogo platform={item.platform as any} size={12} />
                  </div>
                ))
              )}
              <Link to="/tts" className="app-button w-full mt-1">
                Manage voice logic
              </Link>
            </div>
          </section>

          <section className="app-section-card glass">
            <div className="app-section-head">
              <h2>Quick routes</h2>
            </div>
            <div className="grid grid-cols-2 gap-2 app-section-content !pt-0">
              <QuickLink to="/chat" icon={<IconChat size={16} />} label="Chat hub" />
              <QuickLink to="/tts" icon={<IconTTS size={16} />} label="Voice engine" />
              <QuickLink to="/spotify" icon={<SpotifyIcon size={16} />} label="Spotify hub" />
              <QuickLink to="/triggers" icon={<IconBolt size={16} />} label="Automations" />
            </div>
          </section>

          <section className="app-section-card glass">
            <div className="app-section-head">
              <h2>System health</h2>
            </div>
            <div className="app-section-content !pt-0 flex flex-col gap-0">
              <HealthRow label="Inbound nodes" value={`${connectedCount}/4`} tone={connectedCount === 4 ? 'good' : 'muted'} />
              <HealthRow label="Core latency" value="7.4ms" tone="good" />
              <HealthRow label="Memory pool" value="184MB" tone="good" />
              <HealthRow label="Socket flow" value="Optimal" tone="good" />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}


