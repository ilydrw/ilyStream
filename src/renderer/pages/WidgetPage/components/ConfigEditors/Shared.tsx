import React from 'react'
import { Toggle } from '../../../../components/ui/Inputs'

/**
 * Shared control kit for widget config editors. Every control renders a
 * consistent flat row: sentence-case label on the left, live value readout on
 * the right, cyan accent for active states. Editors compose these instead of
 * raw inputs so the whole editing surface feels deliberate.
 */

export function Section({
  label,
  description,
  children
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-[11px] font-semibold text-white/40">{label}</h3>
        {description && <p className="mt-1 text-[11px] leading-snug text-white/30">{description}</p>}
      </div>
      <div className="flex flex-col gap-3.5">{children}</div>
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
  hint,
  value,
  onChange
}: {
  label: string
  hint?: string
  value: string
  onChange: (next: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <span className="text-[12px] font-semibold text-white/85">{label}</span>
        {hint && <p className="text-[11px] text-white/35 mt-0.5 leading-snug">{hint}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="color"
          value={toHexColor(value)}
          onChange={(e) => onChange(e.currentTarget.value)}
          className="w-9 h-9 rounded-md border border-white/10 cursor-pointer bg-transparent p-0"
          style={{ background: 'none' }}
          aria-label={`${label} color picker`}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          className="app-input !h-9 !text-[12px] !px-2.5 font-mono w-24"
          aria-label={`${label} hex value`}
        />
      </div>
    </div>
  )
}

/** Native color inputs only accept #rrggbb — degrade rgba()/names gracefully. */
function toHexColor(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#19c8ff'
}

/**
 * Labeled range slider with a live value readout. `format` controls the
 * readout (defaults to the raw value + unit).
 */
export function Slider({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  unit = '',
  format,
  onChange
}: {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  format?: (value: number) => string
  onChange: (next: number) => void
}) {
  const readout = format ? format(value) : `${value}${unit}`
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] font-semibold text-white/85">{label}</span>
        <span className="text-[11px] font-mono text-white/45 tabular-nums">{readout}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        className="w-full accent-[#19c8ff]"
        aria-label={label}
      />
      {hint && <p className="text-[11px] text-white/35 leading-snug">{hint}</p>}
    </div>
  )
}

/** Slider for 0–1 configs displayed as a percentage. */
export function PercentSlider(props: {
  label: string
  hint?: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (next: number) => void
}) {
  const { min = 0, max = 1, step = 0.05, ...rest } = props
  return (
    <Slider
      {...rest}
      min={min}
      max={max}
      step={step}
      format={(v) => `${Math.round(v * 100)}%`}
    />
  )
}

export interface SegmentOption<T extends string> {
  value: T
  label: string
}

/**
 * Flat segmented control for small enum choices. Grows to a grid when there
 * are more than four options so labels stay readable.
 */
export function SegmentedRow<T extends string>({
  label,
  hint,
  value,
  options,
  columns,
  onChange
}: {
  label: string
  hint?: string
  value: T
  options: Array<SegmentOption<T>>
  columns?: number
  onChange: (next: T) => void
}) {
  const cols = columns ?? (options.length <= 4 ? options.length : Math.ceil(options.length / 2))
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-semibold text-white/85">{label}</span>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={`h-8 rounded-md px-2 text-[11px] font-semibold border transition-all cursor-pointer ${
              value === option.value
                ? 'bg-accent text-[#0a0b0e] border-transparent'
                : 'bg-white/[0.03] text-white/55 border-white/10 hover:border-white/25 hover:text-white/80'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {hint && <p className="text-[11px] text-white/35 leading-snug">{hint}</p>}
    </div>
  )
}

const POSITION_CELLS: Array<{ value: string; title: string }> = [
  { value: 'top-left', title: 'Top left' },
  { value: 'top-center', title: 'Top center' },
  { value: 'top-right', title: 'Top right' },
  { value: 'middle-left', title: 'Middle left' },
  { value: 'middle-center', title: 'Center' },
  { value: 'middle-right', title: 'Middle right' },
  { value: 'bottom-left', title: 'Bottom left' },
  { value: 'bottom-center', title: 'Bottom center' },
  { value: 'bottom-right', title: 'Bottom right' }
]

/**
 * Visual anchor picker — a mini stage with selectable dots. Pass the anchor
 * values the widget actually supports; unsupported cells render as spacers so
 * the grid always reads as a screen.
 */
export function PositionGrid<T extends string>({
  label,
  hint,
  value,
  allowed,
  onChange
}: {
  label: string
  hint?: string
  value: T
  allowed: readonly T[]
  onChange: (next: T) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 pt-0.5">
        <span className="text-[12px] font-semibold text-white/85">{label}</span>
        {hint && <p className="text-[11px] text-white/35 mt-0.5 leading-snug">{hint}</p>}
      </div>
      <div
        className="grid grid-cols-3 gap-1 rounded-lg border border-white/10 bg-white/[0.02] p-1.5 shrink-0"
        role="radiogroup"
        aria-label={label}
      >
        {POSITION_CELLS.map((cell) => {
          const enabled = (allowed as readonly string[]).includes(cell.value)
          const selected = value === cell.value
          if (!enabled) {
            return <span key={cell.value} className="w-7 h-7" aria-hidden="true" />
          }
          return (
            <button
              key={cell.value}
              role="radio"
              aria-checked={selected}
              title={cell.title}
              onClick={() => onChange(cell.value as T)}
              className={`w-7 h-7 rounded-md grid place-items-center border transition-all cursor-pointer ${
                selected
                  ? 'bg-accent/15 border-accent/60'
                  : 'bg-transparent border-white/10 hover:border-white/30'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${selected ? 'bg-accent' : 'bg-white/25'}`}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function TextRow({
  label,
  hint,
  value,
  placeholder,
  onChange
}: {
  label: string
  hint?: string
  value: string
  placeholder?: string
  onChange: (next: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-semibold text-white/85">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.currentTarget.value)}
        className="app-input !h-9 !text-[12px] !px-3 w-full"
        aria-label={label}
      />
      {hint && <p className="text-[11px] text-white/35 leading-snug">{hint}</p>}
    </div>
  )
}

export function NumberRow({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  onChange
}: {
  label: string
  hint?: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (next: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <span className="text-[12px] font-semibold text-white/85">{label}</span>
        {hint && <p className="text-[11px] text-white/35 mt-0.5 leading-snug">{hint}</p>}
      </div>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const next = Number(e.currentTarget.value)
          if (!Number.isFinite(next)) return
          const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next))
          onChange(clamped)
        }}
        className="app-input !h-9 !text-[12px] !px-3 w-24 shrink-0 tabular-nums"
        aria-label={label}
      />
    </div>
  )
}

/** Quiet inline note for editor-level guidance (where settings live, etc). */
export function EditorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[11px] leading-relaxed text-white/45">
      {children}
    </p>
  )
}
