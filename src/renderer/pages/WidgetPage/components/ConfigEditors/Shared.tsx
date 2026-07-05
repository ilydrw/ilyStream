import React from 'react'
import { Toggle, NumberInput } from '../../../../components/ui/Inputs'

export function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[10px] font-semibold tracking-tight text-white/40">{label}</h3>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-semibold text-white/85">{label}</span>
      </div>
      {children}
      {hint && <p className="text-[11px] text-white/35 leading-snug">{hint}</p>}
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
        <p className="text-[12px] font-semibold text-white/85">{label}</p>
        {hint && <p className="text-[11px] text-white/35 mt-0.5 leading-snug">{hint}</p>}
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
      <span className="text-[12px] font-semibold text-white/85">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          className="w-10 h-10 rounded-md border border-white/10 cursor-pointer bg-transparent p-0"
          style={{ background: 'none' }}
          aria-label={`${label} color picker`}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          className="app-input !h-10 !text-[13px] !px-3 font-mono w-28"
          aria-label={`${label} hex value`}
        />
      </div>
    </div>
  )
}
