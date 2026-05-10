import { Bell, Copy, Image, Play, Plus, Send, Trash2, Type, Upload, Volume2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { AlertRule, AlertRuleEventType, AlertRulePlatform } from '../../../shared/alert-rules'
import { ALERT_RULE_EVENT_TYPES, ALERT_RULE_PLATFORMS } from '../../../shared/alert-rules'
import type { AssetFile } from '../../hooks/useAssets'
import type { SoundFile } from '../../hooks/useSoundboard'
import { PlatformLogo } from '../../components/platforms/PlatformLogo'

interface AlertRuleSectionProps {
  rules: AlertRule[]
  sounds: SoundFile[]
  images: AssetFile[]
  onChange: (rules: AlertRule[]) => void
  onUploadSound?: () => void
  onUploadImage?: () => void
}

const PLATFORM_LABELS: Record<AlertRulePlatform, string> = {
  all: 'All',
  tiktok: 'TikTok',
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick'
}

const EVENT_LABELS: Record<AlertRuleEventType, string> = {
  chat: 'Chat',
  gift: 'Gift',
  subscription: 'Sub/Member',
  follow: 'Follow',
  raid: 'Raid',
  like: 'Like',
  share: 'Share',
  join: 'Join'
}

export function AlertRuleSection({
  rules,
  sounds,
  images,
  onChange,
  onUploadSound,
  onUploadImage
}: AlertRuleSectionProps) {
  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority)

  const updateRule = (id: string, patch: Partial<AlertRule>) => {
    onChange(rules.map(rule => rule.id === id ? { ...rule, ...patch } : rule))
  }

  const duplicateRule = (rule: AlertRule) => {
    onChange([
      ...rules,
      {
        ...rule,
        id: crypto.randomUUID(),
        name: `${rule.name} Copy`,
        priority: Math.max(0, rule.priority - 1)
      }
    ])
  }

  const addRule = () => {
    onChange([
      ...rules,
      {
        ...rules[0],
        id: crypto.randomUUID(),
        name: 'New alert route',
        enabled: true,
        platforms: ['all'],
        eventTypes: ['follow'],
        priority: 50,
        cooldownMs: 0,
        minGiftCount: 0,
        minAmountCents: 0,
        keyword: '',
        soundEnabled: false,
        soundId: '',
        imageEnabled: true,
        imageAssetId: '',
        useEventImage: true,
        textEnabled: true,
        textTemplate: '{displayName} triggered {eventType} on {platform}!'
      }
    ])
  }

  return (
    <section className="app-section-card glass !p-0 overflow-hidden">
      <div className="app-section-head">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center text-accent">
            <Bell size={32} />
          </div>
          <div>
            <h2>Platform Alert Routes</h2>
            <p>Target any supported event across TikTok, Twitch, YouTube, Kick, or all platforms.</p>
          </div>
        </div>
        <button onClick={addRule} className="app-button !h-10 !px-5 !text-[10px] font-black tracking-widest">
          <Plus size={13} />
          Add Route
        </button>
      </div>

      <div className="divide-y divide-white/[0.05]">
        {sortedRules.map(rule => (
          <div key={rule.id} className="p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-[280px] flex-1">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => updateRule(rule.id, { enabled: !rule.enabled })}
                    className={`h-6 w-11 rounded-full p-1 transition-all ${rule.enabled ? 'bg-accent/80' : 'bg-white/10'}`}
                    title={rule.enabled ? 'Disable route' : 'Enable route'}
                  >
                    <span className={`block h-4 w-4 rounded-full bg-white transition-all ${rule.enabled ? 'translate-x-5' : ''}`} />
                  </button>
                  <input
                    value={rule.name}
                    onChange={(event) => updateRule(rule.id, { name: event.target.value })}
                    className="app-input !h-10 min-w-0 flex-1 !px-3 !text-sm font-black"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => simulateRule(rule)} className="app-button !h-10 !px-4 !text-[10px]">
                  <Send size={13} />
                  Test
                </button>
                <button onClick={() => duplicateRule(rule)} className="app-button !h-10 !w-10 !p-0" title="Duplicate route">
                  <Copy size={13} />
                </button>
                <button
                  onClick={() => onChange(rules.filter(candidate => candidate.id !== rule.id))}
                  disabled={rules.length <= 1}
                  className="app-button !h-10 !w-10 !p-0 !text-red-300 disabled:opacity-25"
                  title="Delete route"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1.1fr_0.8fr]">
              <RoutePanel icon={Bell} title="Match">
                <div className="grid grid-cols-2 gap-3">
                  <TokenPicker
                    label="Platforms"
                    values={rule.platforms}
                    options={ALERT_RULE_PLATFORMS}
                    labels={PLATFORM_LABELS}
                    onChange={(platforms) => updateRule(rule.id, { platforms: platforms as AlertRulePlatform[] })}
                    platformIcons
                  />
                  <TokenPicker
                    label="Events"
                    values={rule.eventTypes}
                    options={ALERT_RULE_EVENT_TYPES}
                    labels={EVENT_LABELS}
                    onChange={(eventTypes) => updateRule(rule.id, { eventTypes: eventTypes as AlertRuleEventType[] })}
                  />
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <NumberField label="Priority" value={rule.priority} min={0} max={999} onChange={(priority) => updateRule(rule.id, { priority })} />
                  <NumberField label="Cooldown" value={Math.round(rule.cooldownMs / 1000)} min={0} max={3600} suffix="s" onChange={(seconds) => updateRule(rule.id, { cooldownMs: seconds * 1000 })} />
                  <NumberField label="Min Gifts" value={rule.minGiftCount} min={0} max={999999} onChange={(minGiftCount) => updateRule(rule.id, { minGiftCount })} />
                  <NumberField label="Min $" value={Math.round(rule.minAmountCents / 100)} min={0} max={1000000} onChange={(dollars) => updateRule(rule.id, { minAmountCents: dollars * 100 })} />
                </div>
                <Field label="Keyword">
                  <input
                    value={rule.keyword}
                    onChange={(event) => updateRule(rule.id, { keyword: event.target.value })}
                    placeholder="Optional message/gift/user filter"
                    className="app-input !h-10 w-full !px-3 !text-xs"
                  />
                </Field>
              </RoutePanel>

              <RoutePanel icon={Volume2} title="Audio & Visual">
                <ToggleLine label="Play sound" value={rule.soundEnabled} onChange={(soundEnabled) => updateRule(rule.id, { soundEnabled })} />
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <select
                    value={rule.soundId}
                    disabled={!rule.soundEnabled}
                    onChange={(event) => updateRule(rule.id, { soundId: event.target.value })}
                    className="app-input !h-10 min-w-0 !px-3 !text-xs disabled:opacity-35"
                  >
                    <option value="">No sound</option>
                    {sounds.map(sound => <option key={sound.id} value={sound.id}>{(sound.emoji ? `${sound.emoji} ` : '') + sound.name.replace(/\.[^/.]+$/, '')}</option>)}
                  </select>
                  <button onClick={() => void window.api?.sound?.play?.(rule.soundId, rule.soundVolume)} disabled={!rule.soundId} className="app-button !h-10 !w-10 !p-0 disabled:opacity-30" title="Preview sound">
                    <Play size={13} className="fill-current" />
                  </button>
                </div>
                <RangeField label="Volume" value={Math.round(rule.soundVolume * 100)} disabled={!rule.soundEnabled} onChange={(value) => updateRule(rule.id, { soundVolume: value / 100 })} />
                <ToggleLine label="Show image" value={rule.imageEnabled} onChange={(imageEnabled) => updateRule(rule.id, { imageEnabled })} />
                <ToggleLine label="Prefer event avatar/gift art" value={rule.useEventImage} onChange={(useEventImage) => updateRule(rule.id, { useEventImage })} />
                <select
                  value={rule.imageAssetId}
                  disabled={!rule.imageEnabled}
                  onChange={(event) => updateRule(rule.id, { imageAssetId: event.target.value })}
                  className="app-input !h-10 w-full !px-3 !text-xs disabled:opacity-35"
                >
                  <option value="">Event/default visual</option>
                  {images.map(image => <option key={image.id} value={image.id}>{image.name}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={onUploadSound} className="app-button !h-9 !text-[10px]"><Upload size={12} /> Audio</button>
                  <button onClick={onUploadImage} className="app-button !h-9 !text-[10px]"><Upload size={12} /> Image</button>
                </div>
              </RoutePanel>

              <RoutePanel icon={Type} title="Message">
                <ToggleLine label="Show text" value={rule.textEnabled} onChange={(textEnabled) => updateRule(rule.id, { textEnabled })} />
                <Field label="Template">
                  <textarea
                    value={rule.textTemplate}
                    disabled={!rule.textEnabled}
                    onChange={(event) => updateRule(rule.id, { textTemplate: event.target.value })}
                    className="app-input min-h-[86px] w-full resize-none !px-3 !py-2 !text-xs disabled:opacity-35"
                    placeholder="{displayName} triggered {eventType} on {platform}"
                  />
                </Field>
                <div className="grid grid-cols-3 gap-3">
                  <ColorField label="Text" value={rule.textColor} disabled={!rule.textEnabled} onChange={(textColor) => updateRule(rule.id, { textColor })} />
                  <ColorField label="Panel" value={normalizeColorInput(rule.backgroundColor, '#000000')} disabled={!rule.textEnabled} onChange={(backgroundColor) => updateRule(rule.id, { backgroundColor: `${backgroundColor}33` })} />
                  <NumberField label="Size" value={rule.fontSize} min={16} max={128} onChange={(fontSize) => updateRule(rule.id, { fontSize })} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <SelectField label="Layout" value={rule.layout} options={['stacked', 'side-by-side', 'text-only', 'image-only']} onChange={(layout) => updateRule(rule.id, { layout: layout as AlertRule['layout'] })} />
                  <SelectField label="In" value={rule.animationIn} options={['fade', 'slide', 'bounce', 'zoom']} onChange={(animationIn) => updateRule(rule.id, { animationIn: animationIn as AlertRule['animationIn'] })} />
                  <SelectField label="Out" value={rule.animationOut} options={['fade', 'slide', 'tv-warp']} onChange={(animationOut) => updateRule(rule.id, { animationOut: animationOut as AlertRule['animationOut'] })} />
                </div>
              </RoutePanel>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function simulateRule(rule: AlertRule) {
  const platform = rule.platforms.find(platform => platform !== 'all') || 'tiktok'
  const type = rule.eventTypes[0] || 'follow'
  void window.api?.events?.simulate?.({
    platform,
    type,
    suppressSound: true
  } as any)
}

function RoutePanel({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
      <div className="flex items-center gap-2 text-white/55">
        <Icon size={15} className="text-accent" />
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em]">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function TokenPicker<T extends string>({
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
      <div className="flex flex-wrap gap-1.5">
        {options.map(option => (
          <button
            key={option}
            onClick={() => toggle(option)}
            className={`h-8 rounded-lg border px-2 text-[10px] font-black transition-all flex items-center gap-1.5 ${values.includes(option) ? 'border-accent/35 bg-accent/15 text-white' : 'border-white/[0.06] bg-black/20 text-white/35 hover:text-white'}`}
          >
            {platformIcons && option !== 'all' && <PlatformLogo platform={option} size={13} />}
            {labels[option]}
          </button>
        ))}
      </div>
    </Field>
  )
}

function ToggleLine({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className="flex h-10 items-center justify-between rounded-xl border border-white/[0.06] bg-black/20 px-3 text-left transition-all hover:border-white/20">
      <span className="text-[11px] font-bold text-white/60">{label}</span>
      <span className={`relative h-5 w-9 rounded-full transition-all ${value ? 'bg-accent/80' : 'bg-white/10'}`}>
        <span className={`absolute top-1 h-3 w-3 rounded-full bg-white transition-all ${value ? 'left-5' : 'left-1'}`} />
      </span>
    </button>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="block text-[9px] font-black uppercase tracking-[0.2em] text-white/22">{label}</span>
      {children}
    </label>
  )
}

function NumberField({ label, value, min, max, suffix = '', onChange }: { label: string; value: number; min: number; max: number; suffix?: string; onChange: (value: number) => void }) {
  return (
    <Field label={label}>
      <div className="relative">
        <input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="app-input !h-10 w-full !px-3 !pr-8 !text-xs" />
        {suffix && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-black text-white/20">{suffix}</span>}
      </div>
    </Field>
  )
}

function RangeField({ label, value, disabled, onChange }: { label: string; value: number; disabled?: boolean; onChange: (value: number) => void }) {
  return (
    <Field label={`${label} ${value}%`}>
      <input type="range" min={0} max={100} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} className="studio-range disabled:opacity-35" />
    </Field>
  )
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="app-input !h-10 w-full !px-2 !text-xs">
        {options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    </Field>
  )
}

function ColorField({ label, value, disabled, onChange }: { label: string; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <input type="color" value={normalizeColorInput(value, '#ffffff')} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-10 w-full cursor-pointer rounded-xl border border-white/[0.06] bg-black/20 p-1 disabled:opacity-35" />
    </Field>
  )
}

function normalizeColorInput(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  if (/^#[0-9a-f]{6}$/i.test(value)) return value
  if (/^#[0-9a-f]{8}$/i.test(value)) return value.slice(0, 7)
  return fallback
}
