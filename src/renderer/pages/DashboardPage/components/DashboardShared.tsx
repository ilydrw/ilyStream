import { ReactNode, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SpotifyIcon } from '../../../components/ui/SpotifyIcon'

export function MetricCard({ icon, label, value, subValue, trend, accent = 'text-accent' }: { icon: ReactNode; label: string; value: string; subValue: string; trend: 'up' | 'down' | 'neutral'; accent?: string }) {
  return (
    <div className="dashboard-metric-card app-section-card glass transition-colors group">
      <div className={`dashboard-metric-icon ${accent}`}>
        {icon}
      </div>
      <div className="dashboard-metric-label truncate">
        {label}
      </div>
      <div className="dashboard-metric-value tabular-nums">{value}</div>
      <div className={`dashboard-metric-sub ${trend === 'up' ? 'text-success' : trend === 'down' ? 'text-danger' : 'text-white/32'}`}>
        {subValue}
      </div>
    </div>
  )
}

export function QuickLink({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <Link to={to} className="dashboard-quick-link group">
      <div className="transition-colors">
        {icon}
      </div>
      <span>{label}</span>
    </Link>
  )
}

export function HealthRow({ label, value, tone }: { label: string; value: string; tone: 'good' | 'bad' | 'muted' }) {
  const toneClass = tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-danger' : 'text-white/55'
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[12px] font-normal text-white/55">{label}</span>
      <span className={`text-[12px] font-mono font-medium tabular-nums ${toneClass}`}>{value}</span>
    </div>
  )
}



export function SpotifyMetricCard() {
  const [status, setStatus] = useState<any>({ connected: false })
  const [queue, setQueue] = useState<any[]>([])

  useEffect(() => {
    if (!window.api?.spotify) return
    window.api.spotify.getStatus().then(setStatus)
    window.api.spotify.getQueue().then(setQueue)
    const unsubStatus = window.api.on('spotify:status-changed', setStatus)
    const unsubQueue = window.api.on('spotify:queue-update', setQueue)
    return () => { unsubStatus(); unsubQueue(); }
  }, [])

  const activeQueue = queue.filter((r) => r.status === 'queued')

  return (
    <MetricCard
      icon={<SpotifyIcon size={20} />}
      label="Spotify engine"
      value={status.connected ? activeQueue.length.toString() : 'OFF'}
      subValue={status.connected ? `${activeQueue.length} tracks in queue` : "Service disabled"}
      trend={status.connected ? 'neutral' : 'down'}
    />
  )
}
