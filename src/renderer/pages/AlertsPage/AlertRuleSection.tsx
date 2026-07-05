import type { ReactNode } from 'react'
import type { AlertRule, AlertRuleEventType, AlertRulePlatform } from '../../../shared/alert-rules'
import { PlatformLogo } from '../../components/platforms/PlatformLogo'

/**
 * Shared helpers for the Alerts page.
 *
 * This file used to render the whole rules section inline. The Alerts page
 * was redesigned into a two-pane layout — `AlertRoutesPane` (left rail) +
 * `AlertEditorPane` (right pane with live preview). Both panes import the
 * helpers below.
 */

// ─── Bucketing ─────────────────────────────────────────────────────────────

export type RuleBuckets = {
  shared: AlertRule[]
  tiktok: AlertRule[]
  twitch: AlertRule[]
  youtube: AlertRule[]
  kick: AlertRule[]
}

/**
 * A rule belongs to a single platform's bucket iff it's tagged with exactly
 * that one platform (e.g. `['tiktok']`). Everything else — `['all']`, empty,
 * or multi-platform like `['twitch','kick']` — goes to the **shared** bucket
 * since it's not specific to any one platform.
 */
export function bucketRules(rules: AlertRule[]): RuleBuckets {
  const buckets: RuleBuckets = { shared: [], tiktok: [], twitch: [], youtube: [], kick: [] }
  for (const rule of rules) {
    const platforms = rule.platforms ?? []
    if (platforms.length === 1) {
      const p = platforms[0]
      if (p === 'tiktok' || p === 'twitch' || p === 'youtube' || p === 'kick') {
        buckets[p].push(rule)
        continue
      }
    }
    buckets.shared.push(rule)
  }
  for (const key of Object.keys(buckets) as (keyof RuleBuckets)[]) {
    buckets[key].sort((a, b) => b.priority - a.priority)
  }
  return buckets
}

// ─── Labels ────────────────────────────────────────────────────────────────

export const PLATFORM_LABELS: Partial<Record<AlertRulePlatform, string>> = {
  all: 'All',
  tiktok: 'TikTok',
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick'
}

export const EVENT_LABELS: Record<AlertRuleEventType, string> = {
  chat: 'Chat',
  gift: 'Gift',
  subscription: 'Sub/Member',
  follow: 'Follow',
  raid: 'Raid',
  like: 'Like',
  share: 'Share',
  join: 'Join'
}

// ─── Actions ───────────────────────────────────────────────────────────────

export function simulateRule(rule: AlertRule): void {
  const platform = rule.platforms.find(p => p !== 'all') || 'tiktok'
  const type = rule.eventTypes[0] || 'follow'
  void window.api?.events?.simulate?.({ platform, type } as any)
}

export function normalizeColorInput(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  if (/^#[0-9a-f]{6}$/i.test(value)) return value
  if (/^#[0-9a-f]{8}$/i.test(value)) return value.slice(0, 7)
  return fallback
}

// ─── Form primitives ───────────────────────────────────────────────────────
// All primitives use the bumped type scale: 13px body, 11px labels (sentence-
// case, not uppercase), 11px hints. Touch targets are min 40px tall. See the
// design critique notes — the old 9-11px scale read as a dense admin form,
// not a creative-control surface.

export function TokenPicker<T extends string>({
  label,
  values,
  options,
  labels,
  onChange,
  platformIcons
}: {
  label: string
  values: T[]
  options: readonly T[]
  labels: Record<string, string>
  onChange: (values: T[]) => void
  platformIcons?: boolean
}) {
  const toggle = (option: T) => {
    if (option === 'all') {
      onChange(values.includes(option) ? [] : [option])
      return
    }
    const next = values.includes(option) ? values.filter(value => value !== option) : [...values.filter(value => value !== 'all'), option]
    onChange(next.length ? next : [options[0]])
  }

  return (
    <Field label={label}>
      {/* Equal-width pills — the grid gives every option the same footprint so
          short labels ("All", "Gift", "Raid") aren't tiny next to long ones. */}
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))' }}>
        {options.map(option => {
          const selected = values.includes(option)
          return (
            <button
              key={option}
              onClick={() => toggle(option)}
              className={`h-10 w-full rounded-lg border px-3 text-[13px] font-semibold transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
                selected
                  ? 'border-accent bg-accent text-black shadow-[0_2px_10px_-2px_rgba(25,200,255,0.4)]'
                  : 'border-white/[0.08] bg-white/[0.02] text-white/60 hover:text-white hover:border-white/20 hover:bg-white/[0.05]'
              }`}
            >
              {platformIcons && option !== 'all' && <PlatformLogo platform={option as any} size={14} />}
              {labels[option] ?? option}
            </button>
          )
        })}
      </div>
    </Field>
  )
}

export function ToggleLine({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="space-y-1.5">
      <button
        onClick={() => onChange(!value)}
        className="flex w-full items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-left transition-all hover:border-white/15 hover:bg-white/[0.04]"
      >
        <span className="text-[13px] font-medium text-white/85">{label}</span>
        <Toggle value={value} />
      </button>
      {hint && <p className="text-[11px] text-white/40 pl-1">{hint}</p>}
    </div>
  )
}

/**
 * Standalone toggle switch — single canonical size used across the editor,
 * the rail, and the section headers. h-6 w-11 (24×44px) — meets touch-target
 * comfort on tablet/Car Thing while staying compact in dense rows.
 */
export function Toggle({ value, onClick, title }: { value: boolean; onClick?: (e: React.MouseEvent) => void; title?: string }) {
  return (
    <span
      role={onClick ? 'switch' : undefined}
      aria-checked={value}
      onClick={onClick}
      title={title}
      className={`relative inline-block h-6 w-11 rounded-full transition-all shrink-0 ${value ? 'bg-accent' : 'bg-white/15'} ${onClick ? 'cursor-pointer' : ''}`}
    >
      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${value ? 'left-6' : 'left-1'}`} />
    </span>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 px-0.5">
        <span className="text-[11px] font-semibold text-white/55">{label}</span>
        {hint && <span className="text-[11px] text-white/35 text-right">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

export function NumberField({ label, hint, value, min, max, suffix = '', onChange }: { label: string; hint?: string; value: number; min: number; max: number; suffix?: string; onChange: (value: number) => void }) {
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="app-input !h-10 w-full !px-3.5 !pr-10 !text-sm font-mono"
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-white/40">{suffix}</span>
        )}
      </div>
    </Field>
  )
}

export function RangeField({ label, value, disabled, onChange }: { label: string; value: number; disabled?: boolean; onChange: (value: number) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          className="studio-range disabled:opacity-30 flex-1"
        />
        <span className="text-[12px] font-mono text-white/70 w-12 text-right shrink-0">{value}%</span>
      </div>
    </Field>
  )
}

export function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="app-input !h-10 w-full !px-3 !text-sm"
      >
        {options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    </Field>
  )
}

export function ColorField({ label, value, disabled, onChange }: { label: string; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  const hex = normalizeColorInput(value, '#ffffff')
  return (
    <Field label={label}>
      <label className="relative flex items-center gap-3 h-10 px-2.5 rounded-lg border border-white/[0.08] bg-black/30 cursor-pointer transition-colors hover:border-white/20">
        <span
          className="w-7 h-7 rounded-md border border-white/15 shrink-0"
          style={{ backgroundColor: hex }}
        />
        <span className="text-[12px] font-mono text-white/75 uppercase">{hex}</span>
        <input
          type="color"
          value={hex}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />
      </label>
    </Field>
  )
}
