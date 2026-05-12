import React, { ReactNode } from 'react'

export function SectionHeader({
  eyebrow,
  title,
  description,
  action
}: {
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-muted">{eyebrow}</p>
        <h4 className="mt-1 text-lg font-semibold">{title}</h4>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      {action}
    </div>
  )
}

export function FieldBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted mb-1 block">{label}</label>
      {children}
    </div>
  )
}

export function NumberInput({
  value,
  min,
  onChange,
  step = 1
}: {
  value: number
  min: number
  onChange: (value: number) => void
  step?: number
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      step={step}
      onChange={(event) => onChange(Math.max(min, Number(event.target.value) || 0))}
      className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent transition-colors"
    />
  )
}

export function TypeWrapper({
  typeLabel,
  typeValue,
  onTypeChange,
  typeOptions,
  onRemove,
  children
}: {
  typeLabel: string
  typeValue: string
  onTypeChange: (value: string) => void
  typeOptions: Array<{ value: string; label: string }>
  onRemove: () => void
  children: ReactNode
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="lg:w-64">
          <label className="text-xs text-muted mb-1 block">{typeLabel}</label>
          <select
            value={typeValue}
            onChange={(event) => onTypeChange(event.target.value)}
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {typeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 grid gap-3">{children}</div>
        <button
          onClick={onRemove}
          className="px-3 py-2 text-sm rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-colors"
        >
          Remove
        </button>
      </div>
    </div>
  )
}

export function HeaderRow({
  headerKey,
  value,
  onChange,
  onRemove
}: {
  headerKey: string
  value: string
  onChange: (key: string, value: string) => void
  onRemove: () => void
}) {
  return (
    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
      <input
        type="text"
        value={headerKey}
        onChange={(event) => onChange(event.target.value, value)}
        className="bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(headerKey, event.target.value)}
        className="bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <button
        onClick={onRemove}
        className="px-3 py-2 rounded-lg text-sm text-muted hover:text-danger hover:bg-danger/10 transition-colors"
      >
        Remove
      </button>
    </div>
  )
}

export function replaceHeader(
  headers: Record<string, string>,
  previousKey: string,
  nextKey: string,
  nextValue: string
): Record<string, string> {
  const nextHeaders: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (key === previousKey) continue
    nextHeaders[key] = value
  }
  if (nextKey.trim().length > 0) {
    nextHeaders[nextKey] = nextValue
  }
  return nextHeaders
}

export function removeHeader(
  headers: Record<string, string>,
  keyToRemove: string
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => key !== keyToRemove)
  )
}
