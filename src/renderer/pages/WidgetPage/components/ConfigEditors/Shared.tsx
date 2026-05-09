import React from 'react'
import { Toggle, NumberInput } from '../../../../components/ui/Inputs'

export function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[10px] font-black uppercase tracking-widest text-white/40">{label}</h3>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-bold text-white/80">{label}</span>
      </div>
      {children}
      {hint && <p className="text-[10px] text-white/30">{hint}</p>}
    </div>
  )
}

export function SwitchRow({
  label,
  hint,
  value,
  onChange
}: {
  label: string
  hint?: string
  value: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-bold text-white/80">{label}</p>
        {hint && <p className="text-[10px] text-white/30 mt-0.5">{hint}</p>}
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  )
}

export function ColorRow({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (next: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-bold text-white/80">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          className="w-9 h-9 rounded-md border border-white/10 cursor-pointer bg-transparent p-0"
          style={{ background: 'none' }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          className="app-input !h-9 !text-xs !px-2 font-mono w-24"
        />
      </div>
    </div>
  )
}
