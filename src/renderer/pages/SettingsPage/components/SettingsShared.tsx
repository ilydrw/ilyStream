import React, { ReactNode, useState } from 'react'
import {IconCheck, IconCopy} from '@tabler/icons-react'
import type { OBSRuntimeStatus } from '../../../../shared/obs'
import type { OverlayRuntimeStatus } from '../../../../shared/overlay'

export function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 py-8 border-b border-white/[0.03] last:border-0 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 md:pr-10">
        <h4 className="text-sm font-bold text-white mb-1">{label}</h4>
        {hint && <p className="text-xs text-white/20 leading-relaxed">{hint}</p>}
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
    <div className="app-section-card glass p-6 flex flex-col items-start gap-4 hover:bg-white/[0.02] transition-all group">
      <div className="flex items-center justify-center text-white/20 group-hover:text-accent transition-all">
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-1">{label}</p>
        <p className="text-xl font-black text-white tracking-tight">{value}</p>
      </div>
    </div>
  )
}

export function RuntimeValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs font-medium">
      <span className="text-white/20 uppercase tracking-widest">{label}</span>
      <span className="text-white/60 font-mono truncate ml-4">{value}</span>
    </div>
  )
}

export function RuntimeLink({
  label,
  href,
  fallback
}: {
  label: string
  href?: string
  fallback: string
}) {
  const target = href ?? fallback
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    void navigator.clipboard.writeText(target).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-black uppercase tracking-widest text-white/20 mb-1">{label}</p>
        <p className="text-sm text-accent font-mono truncate hover:underline cursor-pointer" onClick={() => window.open(target, '_blank')}>
          {target}
        </p>
      </div>
      <button
        onClick={handleCopy}
        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${copied ? 'bg-success/20 text-success' : 'bg-white/5 text-white/20 hover:bg-white/10 hover:text-white/40'}`}
      >
        {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
      </button>
    </div>
  )
}

export function StatusBadge({ status }: { status: OverlayRuntimeStatus | null }) {
  const baseClasses = "px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest border transition-all"
  
  if (!status) {
    return <span className={`${baseClasses} bg-white/5 border-white/5 text-white/20`}>Overlay</span>
  }

  if (status.running) {
    return <span className={`${baseClasses} bg-accent/10 border-accent/20 text-accent shadow-[0_0_10px_rgba(var(--accent-rgb),0.2)]`}>Port {status.port}</span>
  }

  return <span className={`${baseClasses} bg-danger/10 border-danger/20 text-danger`}>Offline</span>
}

export function OBSStatusBadge({ status }: { status: OBSRuntimeStatus | null }) {
  const baseClasses = "px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest border transition-all"
  
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
