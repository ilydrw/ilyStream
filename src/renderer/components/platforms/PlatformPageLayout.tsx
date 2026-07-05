import { ReactNode } from 'react'
import type { Platform as PlatformId } from '../../../main/platforms/types'
import { PlatformLogo } from './PlatformLogo'
import { ReconnectInfo } from '../../stores/connection-store'
import { PageHeader } from '../layout/PageHeader'

export function StatusBadge({ status, reconnect }: { status: string; reconnect?: ReconnectInfo | null }) {
  // A reconnect carrying a reason is a calm "waiting to go live" state, not an
  // error — style and label it distinctly from a failure-driven retry.
  const isWaiting = status === 'connecting' && Boolean(reconnect?.reason)

  const styles: Record<string, string> = {
    connected: 'bg-success/10 text-success',
    connecting: 'bg-warning/10 text-warning',
    disconnected: 'bg-white/5 text-white/40',
    error: 'bg-danger/10 text-danger'
  }
  const badgeClass = isWaiting ? 'bg-info/10 text-info' : styles[status] || styles.disconnected

  const label = isWaiting
    ? 'Waiting'
    : status === 'connecting' && reconnect
      ? `Retrying ${reconnect.attempt}/${reconnect.maxAttempts}`
      : status.toUpperCase()

  return (
    <span className={`flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-semibold tracking-normal ${badgeClass}`}>
      {status === 'connected' && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-40" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
        </span>
      )}
      {status === 'connecting' && (
        <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${isWaiting ? 'bg-info' : 'bg-warning'}`} />
      )}
      {label}
    </span>
  )
}

export function Metric({
  icon,
  label,
  value,
  tone = 'neutral'
}: {
  icon: ReactNode
  label: string
  value: string
  tone?: 'neutral' | 'warning' | 'danger'
}) {
  const toneClass = tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : ''

  return (
    <div className="app-section-card glass !p-10 flex flex-col items-center justify-center text-center gap-6">
      <div className={`flex items-center justify-center ${toneClass}`}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-semibold tracking-normal text-white/30 mb-2">{label}</p>
        <p className={`text-3xl font-semibold font-mono ${toneClass || 'text-white'}`}>{value}</p>
      </div>
    </div>
  )
}

export function DiagnosticLine({
  icon,
  label,
  value,
  tone
}: {
  icon: ReactNode
  label: string
  value: string
  tone: 'good' | 'bad' | 'muted'
}) {
  const toneClasses = {
    good: 'text-success bg-success/5 border-success/10',
    bad: 'text-danger bg-danger/5 border-danger/10',
    muted: 'text-white/20 bg-white/5 border-white/5'
  }

  return (
    <div className={`flex items-center gap-4 p-5 rounded-xl border ${toneClasses[tone]} transition-all`}>
      <div className="flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold tracking-normal opacity-40 mb-1">{label}</p>
        <p className="text-sm font-semibold truncate leading-none">{value}</p>
      </div>
    </div>
  )
}

export function PlatformPageHeader({ 
  platformId, 
  title, 
  description
}: { 
  platformId: PlatformId, 
  title: string, 
  description: string
}) {
  return (
    <PageHeader
      title={title}
      description={description}
      iconNode={<PlatformLogo platform={platformId} size={24} />}
    />
  )
}
