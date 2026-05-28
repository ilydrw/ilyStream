import { ReactNode, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SpotifyIcon } from '../../../components/ui/SpotifyIcon'

export function MetricCard({ icon, label, value, subValue, trend, accent = 'text-accent' }: { icon: ReactNode; label: string; value: string; subValue: string; trend: 'up' | 'down' | 'neutral'; accent?: string }) {
  return (
    <div className="app-section-card glass !p-5 transition-colors group min-w-0">
      <div className={`mb-3 ${accent}`}>
        {icon}
      </div>
      <div className="text-[11px] font-medium text-white/55 mb-1 truncate">
        {label}
      </div>
      <div className="text-[22px] font-semibold text-white tabular-nums leading-none mb-1.5 truncate tracking-tight">{value}</div>
      <div className={`text-[11px] font-mono font-medium truncate ${trend === 'up' ? 'text-success' : trend === 'down' ? 'text-danger' : 'text-white/32'}`}>
        {subValue}
      </div>
    </div>
  )
}

export function QuickLink({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <Link to={to} className="flex flex-col items-center justify-center gap-2 px-3 py-4 rounded-md bg-white/[0.025] hover:bg-white/[0.04] transition-colors group">
      <div className="text-white/55 group-hover:text-accent transition-colors">
        {icon}
      </div>
      <span className="text-[12px] font-medium text-white/55 group-hover:text-accent transition-colors tracking-tight">{label}</span>
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
      label="Spotify Engine"
      value={status.connected ? activeQueue.length.toString() : 'OFF'}
      subValue={status.connected ? `${activeQueue.length} Tracks in Queue` : "Service Disabled"}
      trend={status.connected ? 'neutral' : 'down'}
    />
  )
}
