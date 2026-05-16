import { useState, useMemo } from 'react'
import {
  IconBell,
  IconBolt,
  IconChevronDown,
  IconChevronUp,
  IconCopy,
  IconFilter,
  IconPlayerPlay,
  IconPlus,
  IconSend,
  IconTrash,
  IconTypography,
  IconUpload,
  IconVolume,
  IconSearch,
  IconCheck,
  IconX,
  IconPhoto
} from '@tabler/icons-react'
import type { Icon } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import type { AlertRule, AlertRuleEventType, AlertRulePlatform } from '../../../shared/alert-rules'
import { ALERT_RULE_EVENT_TYPES, ALERT_RULE_PLATFORMS, DEFAULT_ALERT_RULES } from '../../../shared/alert-rules'
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
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [platformFilter, setPlatformFilter] = useState<AlertRulePlatform | 'all'>('all')

  const filteredRules = useMemo(() => {
    return rules
      .filter(rule => {
        const matchesSearch = rule.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             rule.eventTypes.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
        const matchesPlatform = platformFilter === 'all' || rule.platforms.includes(platformFilter)
        return matchesSearch && matchesPlatform
      })
      .sort((a, b) => b.priority - a.priority)
  }, [rules, searchQuery, platformFilter])

  const updateRule = (id: string, patch: Partial<AlertRule>) => {
    onChange(rules.map(rule => rule.id === id ? { ...rule, ...patch } : rule))
  }

  const duplicateRule = (rule: AlertRule) => {
    const newId = crypto.randomUUID()
    onChange([
      ...rules,
      {
        ...rule,
        id: newId,
        name: `${rule.name} Copy`,
        priority: Math.max(0, rule.priority - 1)
      }
    ])
    setExpandedId(newId)
  }

  const addRule = () => {
    const newId = crypto.randomUUID()
    const template = rules[0] ?? DEFAULT_ALERT_RULES[0]
    onChange([
      ...rules,
      {
        ...template,
        id: newId,
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
        textTemplate: '{displayName} triggered {eventType}!'
      }
    ])
    setExpandedId(newId)
  }

  return (
    <section className="app-section-card glass !p-0 overflow-hidden flex flex-col">
      <div className="app-section-head !border-b-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center text-accent">
            <IconBell size={28} />
          </div>
          <div>
            <h2 className="text-base font-black uppercase tracking-widest">Alert Rules</h2>
            <p className="text-[10px] text-white/40">Manage what happens when events occur on your stream.</p>
          </div>
        </div>
        <button onClick={addRule} className="app-button !bg-brand-gradient !h-10 !px-5 !text-[10px] font-black tracking-widest group">
          <IconPlus size={13} className="group-hover:rotate-90 transition-transform" />
          Create Alert
        </button>
      </div>

      {/* Filter Bar */}
      <div className="px-6 py-4 bg-white/[0.02] border-y border-white/[0.05] flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <IconSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
          <input
            type="text"
            placeholder="Search rules by name or event..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="app-input !h-9 !pl-9 !text-[11px] w-full"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-white/20 mr-1">Platform</span>
          {ALERT_RULE_PLATFORMS.map(p => (
            <button
              key={p}
              onClick={() => setPlatformFilter(p)}
              className={`h-8 px-3 rounded-lg border text-[10px] font-black transition-all flex items-center gap-2 ${
                platformFilter === p ? 'border-accent/40 bg-accent/10 text-white' : 'border-white/[0.06] bg-black/20 text-white/40 hover:text-white'
              }`}
            >
              {p !== 'all' && <PlatformLogo platform={p} size={12} />}
              {PLATFORM_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col">
        {filteredRules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-40">
            <IconFilter size={40} stroke={1} />
            <p className="text-xs mt-4">No matching alerts found.</p>
          </div>
        ) : (
          filteredRules.map(rule => (
            <div key={rule.id} className={`group border-b border-white/[0.05] last:border-0 transition-colors ${expandedId === rule.id ? 'bg-white/[0.03]' : 'hover:bg-white/[0.01]'}`}>
              {/* Header / Summary */}
              <div
                className="flex items-center gap-4 px-6 py-4 cursor-pointer"
                onClick={() => setExpandedId(expandedId === rule.id ? null : rule.id)}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    updateRule(rule.id, { enabled: !rule.enabled })
                  }}
                  className={`h-5 w-9 rounded-full p-0.5 transition-all ${rule.enabled ? 'bg-accent/80' : 'bg-white/10'}`}
                >
                  <span className={`block h-3.5 w-3.5 rounded-full bg-white transition-all ${rule.enabled ? 'translate-x-4' : ''}`} />
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-white/90 truncate">{rule.name}</span>
                  </div>
                  <div className="flex items-center gap-4 mt-1">
                    <div className="flex items-center gap-1.5">
                      <div className="flex -space-x-1">
                        {rule.platforms.map(p => (
                          <div key={p} className="w-4 h-4 rounded-full bg-black border border-white/10 flex items-center justify-center overflow-hidden">
                            {p === 'all' ? <span className="text-[8px] font-bold">A</span> : <PlatformLogo platform={p} size={10} />}
                          </div>
                        ))}
                      </div>
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{rule.eventTypes.map(t => EVENT_LABELS[t]).join(', ')}</span>
                    </div>

                    <div className="h-1 w-1 rounded-full bg-white/10" />

                    <div className="flex items-center gap-3">
                      {rule.soundEnabled && <IconVolume size={12} className="text-accent/60" />}
                      {rule.imageEnabled && <IconPhoto size={12} className="text-accent/60" />}
                      {rule.textEnabled && <IconTypography size={12} className="text-accent/60" />}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); simulateRule(rule); }}
                    className="app-button !h-8 !px-3 !text-[9px]"
                  >
                    <IconSend size={11} />
                    Test
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); duplicateRule(rule); }}
                    className="app-button !h-8 !w-8 !p-0"
                  >
                    <IconCopy size={11} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (confirm('Delete rule?')) onChange(rules.filter(r => r.id !== rule.id)); }}
                    className="app-button !h-8 !w-8 !p-0 !text-red-400/50 hover:!text-red-400"
                  >
                    <IconTrash size={11} />
                  </button>
                </div>

                <div className={`text-white/20 transition-transform ${expandedId === rule.id ? 'rotate-180' : ''}`}>
                  <IconChevronDown size={16} />
                </div>
              </div>

              {/* Expansion Panel */}
              {expandedId === rule.id && (
                <div className="px-6 pb-8 animate-in slide-in-from-top-2 fade-in duration-200">
                  <div className="h-px bg-white/[0.05] mb-6" />
                  <RuleEditor
                    rule={rule}
                    updateRule={(patch) => updateRule(rule.id, patch)}
                    sounds={sounds}
                    images={images}
                    onUploadSound={onUploadSound}
                    onUploadImage={onUploadImage}
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function simulateRule(rule: AlertRule) {
  const platform = rule.platforms.find(platform => platform !== 'all') || 'tiktok'
  const type = rule.eventTypes[0] || 'follow'
  void window.api?.events?.simulate?.({
    platform,
    type
  } as any)
}

function RuleEditor({
  rule,
  updateRule,
  sounds,
  images,
  onUploadSound,
  onUploadImage
}: {
  rule: AlertRule
  updateRule: (patch: Partial<AlertRule>) => void
  sounds: SoundFile[]
  images: AssetFile[]
  onUploadSound?: () => void
  onUploadImage?: () => void
}) {
  const [activeTab, setActiveTab] = useState<'general' | 'media' | 'display' | 'advanced'>('general')

  const tabs = [
    { id: 'general', label: 'General', icon: IconBolt },
    { id: 'media', label: 'Media', icon: IconVolume },
    { id: 'display', label: 'Display', icon: IconTypography },
    { id: 'advanced', label: 'Advanced', icon: IconFilter },
  ] as const

  return (
    <div className="flex flex-col gap-6">
      {/* Tabs */}
      <div className="flex items-center gap-2 p-1 rounded-2xl bg-white/[0.02] border border-white/[0.05] w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 h-9 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === tab.id ? 'bg-white/10 text-white shadow-lg' : 'text-white/30 hover:text-white/50'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white/[0.015] border border-white/[0.04] rounded-2xl p-6">
        {activeTab === 'general' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Field label="Rule Name">
              <input
                value={rule.name}
                onChange={(e) => updateRule({ name: e.target.value })}
                className="app-input !h-10 w-full !px-3 !text-xs font-bold"
              />
            </Field>

            <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
              <TokenPicker
                label="Platforms"
                values={rule.platforms}
                options={ALERT_RULE_PLATFORMS}
                labels={PLATFORM_LABELS}
                onChange={(v) => updateRule({ platforms: v as AlertRulePlatform[] })}
                platformIcons
              />
              <TokenPicker
                label="Events"
                values={rule.eventTypes}
                options={ALERT_RULE_EVENT_TYPES}
                labels={EVENT_LABELS}
                onChange={(v) => updateRule({ eventTypes: v as AlertRuleEventType[] })}
              />
            </div>
          </div>
        )}

        {activeTab === 'media' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="space-y-4">
              <ToggleLine label="Play Sound" value={rule.soundEnabled} onChange={(v) => updateRule({ soundEnabled: v })} />
              {rule.soundEnabled && (
                <div className="space-y-3 animate-in fade-in duration-200 p-4 rounded-xl bg-black/20 border border-white/[0.05]">
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <select
                      value={rule.soundId}
                      onChange={(e) => updateRule({ soundId: e.target.value })}
                      className="app-input !h-10 min-w-0 !px-3 !text-xs"
                    >
                      <option value="">No sound selected</option>
                      {sounds.map(s => <option key={s.id} value={s.id}>{(s.emoji ? `${s.emoji} ` : '') + s.name}</option>)}
                    </select>
                    <button
                      onClick={() => void window.api?.sound?.play?.(rule.soundId, rule.soundVolume)}
                      disabled={!rule.soundId}
                      className="app-button !h-10 !w-10 !p-0 disabled:opacity-30"
                    >
                      <IconPlayerPlay size={13} className="fill-current" />
                    </button>
                  </div>
                  <RangeField label="Volume" value={Math.round(rule.soundVolume * 100)} onChange={(v) => updateRule({ soundVolume: v / 100 })} />
                  <button onClick={onUploadSound} className="app-button !h-9 !text-[10px] w-full !bg-white/5"><IconUpload size={12} /> Add Sound</button>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <ToggleLine label="Show Image/Video" value={rule.imageEnabled} onChange={(v) => updateRule({ imageEnabled: v })} />
              {rule.imageEnabled && (
                <div className="space-y-3 animate-in fade-in duration-200 p-4 rounded-xl bg-black/20 border border-white/[0.05]">
                  <ToggleLine label="Use Event Graphic" hint="Use user avatar or gift icon if available" value={rule.useEventImage} onChange={(v) => updateRule({ useEventImage: v })} />
                  <select
                    value={rule.imageAssetId}
                    onChange={(e) => updateRule({ imageAssetId: e.target.value })}
                    className="app-input !h-10 w-full !px-3 !text-xs"
                  >
                    <option value="">Default/System image</option>
                    {images.map(img => <option key={img.id} value={img.id}>{img.name}</option>)}
                  </select>
                  <button onClick={onUploadImage} className="app-button !h-9 !text-[10px] w-full !bg-white/5"><IconUpload size={12} /> Add Image</button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'display' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="space-y-4">
              <ToggleLine label="Show Text" value={rule.textEnabled} onChange={(v) => updateRule({ textEnabled: v })} />
              {rule.textEnabled && (
                <div className="space-y-4 animate-in fade-in duration-200 p-4 rounded-xl bg-black/20 border border-white/[0.05]">
                  <Field label="Message Template" hint="{displayName}, {eventType}, {amount}">
                    <textarea
                      value={rule.textTemplate}
                      onChange={(e) => updateRule({ textTemplate: e.target.value })}
                      className="app-input min-h-[80px] w-full resize-none !px-3 !py-2 !text-xs"
                    />
                  </Field>
                  <div className="grid grid-cols-3 gap-2">
                    <ColorField label="Text" value={rule.textColor} onChange={(v) => updateRule({ textColor: v })} />
                    <ColorField label="Bg" value={normalizeColorInput(rule.backgroundColor, '#000000')} onChange={(v) => updateRule({ backgroundColor: `${v}33` })} />
                    <NumberField label="Size" value={rule.fontSize} min={12} max={120} onChange={(v) => updateRule({ fontSize: v })} />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-black/20 border border-white/[0.05] space-y-4">
                <SelectField label="Alert Layout" value={rule.layout} options={['stacked', 'side-by-side', 'text-only', 'image-only']} onChange={(v) => updateRule({ layout: v as AlertRule['layout'] })} />
                <div className="grid grid-cols-2 gap-3">
                  <SelectField label="In Anim" value={rule.animationIn} options={['fade', 'slide', 'bounce', 'zoom']} onChange={(v) => updateRule({ animationIn: v as AlertRule['animationIn'] })} />
                  <SelectField label="Out Anim" value={rule.animationOut} options={['fade', 'slide', 'tv-warp']} onChange={(v) => updateRule({ animationOut: v as AlertRule['animationOut'] })} />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'advanced' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="space-y-4">
              <NumberField label="Priority" hint="Higher numbers trigger first" value={rule.priority} min={0} max={999} onChange={(v) => updateRule({ priority: v })} />
              <NumberField label="Cooldown" suffix="s" value={Math.round(rule.cooldownMs / 1000)} min={0} max={3600} onChange={(v) => updateRule({ cooldownMs: v * 1000 })} />
              <Field label="Keyword Filter" hint="Only triggers if message contains this text">
                <input
                  value={rule.keyword}
                  onChange={(e) => updateRule({ keyword: e.target.value })}
                  placeholder="e.g. !hype"
                  className="app-input !h-10 w-full !px-3 !text-xs"
                />
              </Field>
            </div>

            {(rule.eventTypes.includes('gift')) && (
              <div className="space-y-4 p-4 rounded-xl bg-accent/5 border border-accent/10">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-accent/80 mb-2">Gift Thresholds</h3>
                <NumberField label="Min Gifts" value={rule.minGiftCount} min={0} max={9999} onChange={(v) => updateRule({ minGiftCount: v })} />
                <NumberField label="Min Amount (Cents)" value={Math.round(rule.minAmountCents / 100)} min={0} max={1000} onChange={(v) => updateRule({ minAmountCents: v * 100 })} />
              </div>
            )}
          </div>
        )}
      </div>
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
            className={`h-7 rounded-lg border px-2 text-[9px] font-black transition-all flex items-center gap-1.5 ${values.includes(option) ? 'border-accent/40 bg-accent/20 text-white' : 'border-white/[0.06] bg-black/40 text-white/30 hover:text-white'}`}
          >
            {platformIcons && option !== 'all' && <PlatformLogo platform={option} size={11} />}
            {labels[option]}
          </button>
        ))}
      </div>
    </Field>
  )
}

function ToggleLine({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="space-y-1.5">
      <button onClick={() => onChange(!value)} className="flex w-full items-center justify-between rounded-xl border border-white/[0.04] bg-white/[0.02] p-3 text-left transition-all hover:border-white/10">
        <span className="text-[11px] font-bold text-white/70">{label}</span>
        <span className={`relative h-5 w-9 rounded-full transition-all ${value ? 'bg-accent/80' : 'bg-white/10'}`}>
          <span className={`absolute top-1 h-3 w-3 rounded-full bg-white transition-all ${value ? 'left-5' : 'left-1'}`} />
        </span>
      </button>
      {hint && <p className="text-[9px] text-white/20 pl-1">{hint}</p>}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[9px] font-black uppercase tracking-[0.15em] text-white/25">{label}</span>
        {hint && <span className="text-[8px] text-white/15 lowercase">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function NumberField({ label, hint, value, min, max, suffix = '', onChange }: { label: string; hint?: string; value: number; min: number; max: number; suffix?: string; onChange: (value: number) => void }) {
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="app-input !h-9 w-full !px-3 !pr-8 !text-xs font-mono" />
        {suffix && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-black text-white/20 uppercase">{suffix}</span>}
      </div>
    </Field>
  )
}

function RangeField({ label, value, disabled, onChange }: { label: string; value: number; disabled?: boolean; onChange: (value: number) => void }) {
  return (
    <Field label={`${label}: ${value}%`}>
      <input type="range" min={0} max={100} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} className="studio-range disabled:opacity-30" />
    </Field>
  )
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="app-input !h-9 w-full !px-2 !text-xs">
        {options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    </Field>
  )
}

function ColorField({ label, value, disabled, onChange }: { label: string; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <div className="relative group/color">
        <input
          type="color"
          value={normalizeColorInput(value, '#ffffff')}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-full cursor-pointer rounded-xl border border-white/[0.06] bg-black/40 p-1.5 transition-colors group-hover/color:border-white/20 disabled:opacity-30"
        />
      </div>
    </Field>
  )
}

function normalizeColorInput(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  if (/^#[0-9a-f]{6}$/i.test(value)) return value
  if (/^#[0-9a-f]{8}$/i.test(value)) return value.slice(0, 7)
  return fallback
}
