import { ReactNode, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SpotifyIcon } from '../../../components/ui/SpotifyIcon'

export function MetricCard({ icon, label, value, subValue, trend, accent = 'text-accent' }: { icon: ReactNode; label: string; value: string; subValue: string; trend: 'up' | 'down' | 'neutral'; accent?: string }) {
  return (
    <div className="app-section-card glass !p-5 hover:border-white/10 transition-all group min-w-0">
      <div className={`mb-3 transition-transform duration-300 ${accent}`}>
        {icon}
      </div>
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20 mb-1 truncate">
        {label}
      </div>
      <div className="text-xl font-black text-white tabular-nums leading-none mb-1 truncate">{value}</div>
      <div className={`text-[9px] font-black uppercase tracking-wider truncate ${trend === 'up' ? 'text-success' : trend === 'down' ? 'text-danger' : 'text-white/10'}`}>
        {subValue}
      </div>
    </div>
  )
}

export function QuickLink({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <Link to={to} className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-white/[0.015] border border-white/5 hover:bg-accent/5 hover:border-accent/30 hover:text-accent transition-all group">
      <div className="text-white/20 group-hover:text-accent transition-colors scale-90">
        {icon}
      </div>
      <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
    </Link>
  )
}

export function HealthRow({ label, value, tone }: { label: string; value: string; tone: 'good' | 'bad' | 'muted' }) {
  const toneClass = tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-danger' : 'text-white/20'
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[10px] font-black uppercase tracking-widest text-white/20">{label}</span>
      <span className={`text-xs font-mono font-bold ${toneClass}`}>{value}</span>
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
