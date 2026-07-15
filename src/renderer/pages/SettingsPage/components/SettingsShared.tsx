import React, { ReactNode } from 'react'
import type { OBSRuntimeStatus } from '../../../../shared/obs'
import type { OverlayRuntimeStatus } from '../../../../shared/overlay'

export function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-border py-8 last:border-0 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 md:pr-10">
        <h4 className="mb-1 text-sm font-semibold text-foreground">{label}</h4>
        {hint && <p className="text-xs leading-relaxed text-muted">{hint}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  className = ""
}: {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  className?: string
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(event) => {
        const nextValue = Number(event.target.value)
        if (nextValue >= min && nextValue <= max) onChange(nextValue)
      }}
      min={min}
      max={max}
      className={`app-input !w-28 text-right !h-10 !px-4 font-mono text-sm ${className}`}
    />
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  className = ""
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: 'text' | 'password'
  className?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={`app-input !w-64 !h-12 !px-4 !text-sm ${className}`}
    />
  )
}

export function Metric({
  icon,
  label,
  value
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="app-section-card glass group flex flex-col items-start gap-4 p-6 transition-all hover:!bg-[var(--theme-surface-hover)]">
      <div className="flex items-center justify-center text-muted transition-all group-hover:text-accent">
        {icon}
      </div>
      <div>
        <p className="mb-1 text-[10px] font-medium tracking-normal text-muted">{label}</p>
        <p className="text-xl font-semibold tracking-tight text-foreground">{value}</p>
      </div>
    </div>
  )
}

export function RuntimeValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs font-medium">
      <span className="tracking-tight text-muted">{label}</span>
      <span className="ml-4 truncate font-mono text-foreground">{value}</span>
    </div>
  )
}

export function StatusBadge({ status }: { status: OverlayRuntimeStatus | null }) {
  const baseClasses = "px-3 py-1 rounded-md text-[12px] font-medium tracking-tight border transition-colors"
  
  if (!status) {
    return <span className={`${baseClasses} bg-white/5 border-white/5 text-white/20`}>Overlay</span>
  }

  if (status.running) {
    return <span className={`${baseClasses} bg-accent/10 border-accent/20 text-accent shadow-[0_0_10px_rgba(var(--accent-rgb),0.2)]`}>Port {status.port}</span>
  }

  return <span className={`${baseClasses} bg-danger/10 border-danger/20 text-danger`}>Offline</span>
}

export function OBSStatusBadge({ status }: { status: OBSRuntimeStatus | null }) {
  const baseClasses = "px-3 py-1 rounded-md text-[12px] font-medium tracking-tight border transition-colors"
  
  if (!status) {
    return <span className={`${baseClasses} bg-white/5 border-white/5 text-white/20`}>OBS Studio</span>
  }

  if (status.connecting) {
    return <span className={`${baseClasses} bg-warning/10 border-warning/20 text-warning animate-pulse`}>Connecting</span>
  }

  if (status.connected) {
    return <span className={`${baseClasses} bg-success/10 border-success/20 text-success shadow-[0_0_10px_rgba(var(--success-rgb),0.2)]`}>Connected</span>
  }

  return <span className={`${baseClasses} bg-danger/10 border-danger/20 text-danger`}>Disconnected</span>
}
