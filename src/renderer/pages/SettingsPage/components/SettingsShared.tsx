import React, { ReactNode } from 'react'
import type { OBSRuntimeStatus } from '../../../../shared/obs'
import type { OverlayRuntimeStatus } from '../../../../shared/overlay'

export function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <h4>{label}</h4>
        {hint && <p>{hint}</p>}
      </div>
      <div className="settings-row-control">{children}</div>
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
      className={`app-input settings-number-input ${className}`}
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
      className={`app-input settings-text-input ${className}`}
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
  if (!status) {
    return <span className="app-status-chip">Overlay</span>
  }

  if (status.running) {
    return <span className="app-status-chip is-good">Overlay port {status.port}</span>
  }

  return <span className="app-status-chip is-danger">Overlay offline</span>
}

export function OBSStatusBadge({ status }: { status: OBSRuntimeStatus | null }) {
  if (!status) {
    return <span className="app-status-chip">OBS Studio</span>
  }

  if (status.connecting) {
    return <span className="app-status-chip is-warning animate-pulse">OBS connecting</span>
  }

  if (status.connected) {
    return <span className="app-status-chip is-good">OBS connected</span>
  }

  return <span className="app-status-chip is-danger">OBS disconnected</span>
}
