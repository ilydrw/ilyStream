import { useState } from 'react'
import { IconBolt, IconFilter, IconSend, IconTypography, IconVolume, IconPhoto, IconLayoutGrid, IconAdjustments, IconPalette } from '@tabler/icons-react'
import { IconCopy, IconPlus, IconTrash } from '../../components/ui/icons'
import { PlatformLogo } from '../../components/platforms/PlatformLogo'
import type { AlertRule, AlertRuleEventType, AlertRulePlatform } from '../../../shared/alert-rules'
import {
  ALERT_RULE_EVENT_TYPES,
  ALERT_RULE_PLATFORMS,
  SUPPORTED_EVENTS_BY_PLATFORM,
  composeAlertBackground
} from '../../../shared/alert-rules'
import type { AssetFile } from '../../hooks/useAssets'
import type { SoundFile } from '../../hooks/useSoundboard'
import {
  ColorField,
  EVENT_LABELS,
  Field,
  NumberField,
  PLATFORM_LABELS,
  RangeField,
  SelectField,
  Toggle,
  ToggleLine,
  TokenPicker,
  normalizeColorInput,
  simulateRule
} from './AlertRuleSection'
import { AlertLivePreview } from './AlertLivePreview'
import { SoundPickerGrid } from './components/SoundPickerGrid'
import { ImagePickerGrid } from './components/ImagePickerGrid'

interface AlertEditorPaneProps {
  rule: AlertRule | null
  sounds: SoundFile[]
  images: AssetFile[]
  totalRoutes: number
  onUpdateRule: (id: string, patch: Partial<AlertRule>) => void
  onDuplicateRule: (rule: AlertRule) => void
  onDeleteRule: (id: string) => void
  onCreateRule: (platform: AlertRulePlatform) => void
  onUploadSound?: () => void
  onUploadImage?: () => void
}

type TabKey = 'trigger' | 'media' | 'style' | 'advanced'

export function AlertEditorPane(props: AlertEditorPaneProps) {
  if (!props.rule) return <EmptyState totalRoutes={props.totalRoutes} onCreateRule={props.onCreateRule} />
  // No key on rule.id — keep the active tab when switching between routes so you
  // can, e.g., set sounds across several routes without re-clicking the tab.
  return <Editor {...props} rule={props.rule} />
}

function EmptyState({ totalRoutes, onCreateRule }: { totalRoutes: number; onCreateRule: (p: AlertRulePlatform) => void }) {
  return (
    <section className="app-section-card glass !overflow-visible flex flex-col items-center justify-center text-center px-8 py-12" style={{ minHeight: 420 }}>
      <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent mb-5">
        <IconBolt size={28} />
      </div>
      <h2 className="text-[18px] font-semibold text-white/90 mb-2">Pick a route to edit</h2>
      <p className="text-[13px] text-white/55 max-w-md mb-7 leading-relaxed">
        {totalRoutes === 0
          ? 'No alert routes yet. Create one for the platform you want to react to — its sound, image, and message all live in one place.'
          : 'Select a route from the rail on the left to edit it, or create a new one below.'}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button onClick={() => onCreateRule('all')} className="app-button-primary !h-10 !px-4 !text-[13px]">
          <IconPlus size={14} /> New shared route
        </button>
        {(['tiktok', 'twitch', 'youtube', 'kick'] as const).map((p) => (
          <button key={p} onClick={() => onCreateRule(p)} className="app-button !h-10 !px-4 !text-[13px]">
            <PlatformLogo platform={p} size={14} /> {PLATFORM_LABELS[p]}
          </button>
        ))}
      </div>
    </section>
  )
}

function Editor({
  rule,
  sounds,
  images,
  onUpdateRule,
  onDuplicateRule,
  onDeleteRule,
  onUploadSound,
  onUploadImage
}: AlertEditorPaneProps & { rule: AlertRule }) {
  const [tab, setTab] = useState<TabKey>('trigger')

  const update = (patch: Partial<AlertRule>) => onUpdateRule(rule.id, patch)
  const supportedEvents = supportedEventsFor(rule)
  const hasGiftEvent = rule.eventTypes.includes('gift')

  const mediaActive = rule.soundEnabled || rule.imageEnabled
  const advancedActive = rule.cooldownMs > 0 || rule.minGiftCount > 0 || rule.minAmountCents > 0

  const TABS: Array<{ key: TabKey; label: string; icon: typeof IconBolt; dot?: boolean }> = [
    { key: 'trigger', label: 'Trigger', icon: IconBolt },
    { key: 'media', label: 'Media', icon: IconVolume, dot: mediaActive },
    { key: 'style', label: 'Style', icon: IconTypography, dot: rule.textEnabled },
    { key: 'advanced', label: 'Advanced', icon: IconAdjustments, dot: advancedActive }
  ]

  return (
    <section className="app-section-card glass !p-0 !overflow-visible flex flex-col">
      {/* Header — enable + name + actions */}
      <div className="px-6 py-5 border-b border-white/[0.06] flex items-center gap-4">
        <Toggle
          value={rule.enabled}
          onClick={(e) => { e.stopPropagation(); update({ enabled: !rule.enabled }) }}
          title={rule.enabled ? 'Disable route' : 'Enable route'}
        />
        <input
          value={rule.name}
          onChange={(e) => update({ name: e.target.value })}
          className="flex-1 min-w-0 bg-transparent text-[18px] font-semibold text-white outline-none focus:bg-white/[0.03] rounded px-2 py-1.5 -mx-2 -my-1.5 placeholder:text-white/30"
          placeholder="Untitled route"
        />
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => onDuplicateRule(rule)} className="app-button !h-9 !px-3 !text-[12px]" title="Duplicate route">
            <IconCopy size={13} /> Duplicate
          </button>
          <button
            onClick={() => { if (confirm(`Delete route "${rule.name}"?`)) onDeleteRule(rule.id) }}
            className="app-button !h-9 !w-9 !p-0 hover:!text-danger hover:!border-danger/30"
            title="Delete route"
          >
            <IconTrash size={13} />
          </button>
        </div>
      </div>

      {/* At-a-glance summary — what fires it and what it outputs */}
      <RouteSummary rule={rule} />

      {/* Preview + Test (always visible, above the tabs) */}
      <div className="px-6 pt-5 space-y-3">
        <AlertLivePreview rule={rule} sounds={sounds} images={images} />
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-white/40">Preview replays the visual · Test fires the real alert to your overlays + soundboard.</p>
          <button
            onClick={() => simulateRule(rule)}
            className="app-button-primary !h-10 !px-5 !text-[13px] shrink-0"
            title="Send a test event"
          >
            <IconSend size={14} /> Test alert
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="px-6 pt-5">
        <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-1">
          {TABS.map((t) => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`relative flex flex-1 items-center justify-center gap-2 h-9 rounded-md text-[12.5px] font-semibold transition-colors ${
                  active ? 'bg-accent text-black shadow-[0_2px_10px_-3px_rgba(25,200,255,0.5)]' : 'text-white/55 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <t.icon size={14} />
                {t.label}
                {t.dot && !active && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="p-6">
        {tab === 'trigger' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TokenPicker
                label="Platforms"
                values={rule.platforms}
                options={ALERT_RULE_PLATFORMS}
                labels={PLATFORM_LABELS as Record<string, string>}
                onChange={(v) => update({ platforms: v as AlertRulePlatform[] })}
                platformIcons
              />
              <TokenPicker
                label="Events"
                values={rule.eventTypes}
                options={supportedEvents}
                labels={EVENT_LABELS}
                onChange={(v) => update({ eventTypes: v as AlertRuleEventType[] })}
              />
            </div>
            <Field label="Keyword filter" hint="optional — only fires when the message contains this">
              <input
                value={rule.keyword}
                onChange={(e) => update({ keyword: e.target.value })}
                placeholder="e.g. !hype"
                className="app-input !h-10 w-full !px-3.5 !text-sm"
              />
            </Field>
          </div>
        )}

        {tab === 'media' && (
          <div className="space-y-6">
            <EditorGroup icon={IconVolume} title="Sound" subtitle="Plays through the overlay browser source">
              <ToggleLine label="Play a sound" value={rule.soundEnabled} onChange={(v) => update({ soundEnabled: v })} />
              {rule.soundEnabled && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <SoundPickerGrid
                    sounds={sounds}
                    selectedId={rule.soundId}
                    volume={rule.soundVolume}
                    onSelect={(id) => update({ soundId: id })}
                    onAdd={onUploadSound}
                  />
                  <RangeField label="Volume" value={Math.round(rule.soundVolume * 100)} onChange={(v) => update({ soundVolume: v / 100 })} />
                </div>
              )}
            </EditorGroup>

            <EditorGroup icon={IconPhoto} title="Image" subtitle="A static asset, or the event's own avatar / gift icon">
              <ToggleLine label="Show an image" value={rule.imageEnabled} onChange={(v) => update({ imageEnabled: v })} />
              {rule.imageEnabled && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <ToggleLine
                    label="Use the event's image"
                    hint="Falls back to the user's avatar / gift icon when no asset is picked below"
                    value={rule.useEventImage}
                    onChange={(v) => update({ useEventImage: v })}
                  />
                  <ImagePickerGrid
                    images={images}
                    selectedId={rule.imageAssetId}
                    onSelect={(id) => update({ imageAssetId: id })}
                    onAdd={onUploadImage}
                  />
                </div>
              )}
            </EditorGroup>
          </div>
        )}

        {tab === 'style' && (
          <div className="space-y-6">
            <EditorGroup icon={IconTypography} title="Message" subtitle="Text overlaid on the alert">
              <ToggleLine label="Show text" value={rule.textEnabled} onChange={(v) => update({ textEnabled: v })} />
              {rule.textEnabled && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <Field label="Template" hint="{displayName} · {giftName} · {giftCount} · {amount} · {message} · {viewerCount}">
                    <textarea
                      value={rule.textTemplate}
                      onChange={(e) => update({ textTemplate: e.target.value })}
                      className="app-input min-h-[88px] w-full resize-none !px-3.5 !py-3 !text-sm leading-relaxed"
                    />
                  </Field>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <ColorField label="Text" value={rule.textColor} onChange={(v) => update({ textColor: v })} />
                    <NumberField label="Size" suffix="px" value={rule.fontSize} min={12} max={120} onChange={(v) => update({ fontSize: v })} />
                    <NumberField label="Weight" value={rule.fontWeight} min={100} max={900} onChange={(v) => update({ fontWeight: v })} />
                    <SelectField label="Alignment" value={rule.textAlign ?? 'auto'} options={['auto', 'left', 'center', 'right']} onChange={(v) => update({ textAlign: v as AlertRule['textAlign'] })} />
                  </div>
                </div>
              )}
            </EditorGroup>

            <CardStyleGroup rule={rule} update={update} />

            <EditorGroup
              icon={IconLayoutGrid}
              title="Layout & animation"
              subtitle="How the alert is arranged, enters, holds, and exits"
              headerExtras={
                <div className="hidden md:flex items-center gap-1.5 ml-auto text-[10px]">
                  <MetaBadge label="In" value={rule.animationIn} />
                  <MetaBadge label="Out" value={rule.animationOut} />
                  <MetaBadge label="Hold" value={`${Math.round(rule.durationMs / 100) / 10}s`} />
                </div>
              }
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <SelectField label="Layout" value={rule.layout} options={['stacked', 'side-by-side', 'text-only', 'image-only']} onChange={(v) => update({ layout: v as AlertRule['layout'] })} />
                <SelectField label="Animation in" value={rule.animationIn} options={['fade', 'slide', 'bounce', 'zoom']} onChange={(v) => update({ animationIn: v as AlertRule['animationIn'] })} />
                <SelectField label="Animation out" value={rule.animationOut} options={['fade', 'slide', 'tv-warp']} onChange={(v) => update({ animationOut: v as AlertRule['animationOut'] })} />
                <NumberField label="Duration" suffix="ms" value={rule.durationMs} min={500} max={20000} onChange={(v) => update({ durationMs: v })} />
              </div>
              {rule.layout !== 'text-only' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <SelectField label="Image placement" value={rule.imagePlacement ?? 'auto'} options={['auto', 'left', 'right', 'top', 'bottom']} onChange={(v) => update({ imagePlacement: v as AlertRule['imagePlacement'] })} />
                  <NumberField label="Image size" suffix="px" hint="0 = automatic" value={rule.imageSize ?? 0} min={0} max={1024} onChange={(v) => update({ imageSize: v })} />
                  <NumberField label="Image offset X" suffix="px" value={rule.imageLeft ?? 0} min={-1000} max={1000} onChange={(v) => update({ imageLeft: v })} />
                  <NumberField label="Image offset Y" suffix="px" value={rule.imageTop ?? 0} min={-1000} max={1000} onChange={(v) => update({ imageTop: v })} />
                </div>
              )}
              <PositionOverride rule={rule} update={update} />
            </EditorGroup>
          </div>
        )}

        {tab === 'advanced' && (
          <div className="space-y-6">
            <EditorGroup icon={IconFilter} title="Firing rules" subtitle="Priority and rate-limiting when multiple routes match">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <NumberField label="Priority" hint="higher fires first" value={rule.priority} min={0} max={999} onChange={(v) => update({ priority: v })} />
                <NumberField label="Cooldown" suffix="s" hint="per-user; 0 disables" value={Math.round(rule.cooldownMs / 1000)} min={0} max={3600} onChange={(v) => update({ cooldownMs: v * 1000 })} />
              </div>
            </EditorGroup>
            {hasGiftEvent ? (
              <EditorGroup icon={IconBolt} title="Gift thresholds" subtitle="Only fire for gifts at or above these values">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <NumberField label="Min gifts" value={rule.minGiftCount} min={0} max={9999} onChange={(v) => update({ minGiftCount: v })} />
                  <NumberField label="Min amount ($)" value={Math.round(rule.minAmountCents / 100)} min={0} max={1000} onChange={(v) => update({ minAmountCents: v * 100 })} />
                </div>
              </EditorGroup>
            ) : (
              <p className="text-[12px] text-white/35 px-1">Add a <strong className="text-white/55">Gift</strong> event on the Trigger tab to unlock gift-amount thresholds.</p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * Card (background + border + shape) controls. Background color and opacity
 * are separate: the opacity slider recomposes the color's alpha and goes all
 * the way to 0 for a fully transparent card (the overlay also scales the
 * card's shadow/blur away as opacity approaches 0).
 */
function CardStyleGroup({ rule, update }: { rule: AlertRule; update: (patch: Partial<AlertRule>) => void }) {
  // Legacy rules carry the alpha inside the rgba() color string; show that as
  // the slider position until the user takes explicit control of it.
  const composed = composeAlertBackground(rule.backgroundColor, rule.backgroundOpacity ?? -1)
  const bgOpacityPct = composed.alpha !== null ? Math.round(composed.alpha * 100) : 100

  const hasCustomRadius = (rule.borderRadius ?? -1) >= 0
  const hasCustomPadding = (rule.paddingX ?? -1) >= 0 || (rule.paddingY ?? -1) >= 0

  return (
    <EditorGroup icon={IconPalette} title="Card" subtitle="The panel behind the alert — turn opacity to 0 for no card at all">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
        <ColorField
          label="Background"
          value={normalizeColorInput(rule.backgroundColor, '#000000')}
          onChange={(v) => update({
            backgroundColor: v,
            // Picking a hex color would otherwise snap a legacy rgba() rule to
            // fully opaque — pin the slider's current value at the same time.
            backgroundOpacity: (rule.backgroundOpacity ?? -1) >= 0 ? rule.backgroundOpacity : bgOpacityPct
          })}
        />
        <RangeField label="Background opacity" value={bgOpacityPct} onChange={(v) => update({ backgroundOpacity: v })} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
        <ColorField
          label="Border / edge color"
          value={rule.borderColor === 'gradient' ? '#19c8ff' : normalizeColorInput(rule.borderColor, '#ffffff')}
          disabled={rule.borderColor === 'gradient'}
          onChange={(v) => update({ borderColor: v })}
        />
        <ToggleLine
          label="Animated gradient edge"
          hint="moving cyan → violet border; overrides the color above"
          value={rule.borderColor === 'gradient'}
          onChange={(on) => update({ borderColor: on ? 'gradient' : 'rgba(255,255,255,0.2)' })}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <NumberField label="Border width" suffix="px" hint="0 removes the border" value={rule.borderWidth ?? 1} min={0} max={20} onChange={(v) => update({ borderWidth: v })} />
        {hasCustomRadius && (
          <NumberField label="Corner radius" suffix="px" value={rule.borderRadius} min={0} max={200} onChange={(v) => update({ borderRadius: v })} />
        )}
        {hasCustomPadding && (
          <>
            <NumberField label="Padding X" suffix="px" value={Math.max(0, rule.paddingX ?? 50)} min={0} max={300} onChange={(v) => update({ paddingX: v, paddingY: (rule.paddingY ?? -1) >= 0 ? rule.paddingY : 35 })} />
            <NumberField label="Padding Y" suffix="px" value={Math.max(0, rule.paddingY ?? 35)} min={0} max={300} onChange={(v) => update({ paddingY: v, paddingX: (rule.paddingX ?? -1) >= 0 ? rule.paddingX : 50 })} />
          </>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ToggleLine
          label="Custom corner radius"
          hint="off = use the alerts widget's radius"
          value={hasCustomRadius}
          onChange={(on) => update({ borderRadius: on ? 24 : -1 })}
        />
        <ToggleLine
          label="Custom padding"
          hint="off = automatic per layout"
          value={hasCustomPadding}
          onChange={(on) => update(on ? { paddingX: 50, paddingY: 35 } : { paddingX: -1, paddingY: -1 })}
        />
      </div>
    </EditorGroup>
  )
}

/** Per-rule screen position; off defers to the global alert position setting. */
function PositionOverride({ rule, update }: { rule: AlertRule; update: (patch: Partial<AlertRule>) => void }) {
  const hasCustomPosition = (rule.alertTop ?? -1) >= 0 || (rule.alertLeft ?? -1) >= 0
  return (
    <>
      <ToggleLine
        label="Custom screen position"
        hint="off = the global alert position from Settings → Alerts"
        value={hasCustomPosition}
        onChange={(on) => update(on ? { alertTop: 10, alertLeft: 50 } : { alertTop: -1, alertLeft: -1 })}
      />
      {hasCustomPosition && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in duration-200">
          <RangeField label="Horizontal position" value={Math.max(0, rule.alertLeft ?? 50)} onChange={(v) => update({ alertLeft: v, alertTop: (rule.alertTop ?? -1) >= 0 ? rule.alertTop : 10 })} />
          <RangeField label="Vertical position" value={Math.max(0, rule.alertTop ?? 10)} onChange={(v) => update({ alertTop: v, alertLeft: (rule.alertLeft ?? -1) >= 0 ? rule.alertLeft : 50 })} />
        </div>
      )}
    </>
  )
}

function RouteSummary({ rule }: { rule: AlertRule }) {
  const outputs: Array<{ on: boolean; icon: typeof IconVolume; label: string }> = [
    { on: rule.soundEnabled, icon: IconVolume, label: 'Sound' },
    { on: rule.imageEnabled, icon: IconPhoto, label: 'Image' },
    { on: rule.textEnabled, icon: IconTypography, label: 'Text' }
  ]
  const activeOutputs = outputs.filter((o) => o.on)
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-6 py-3 bg-white/[0.015] border-b border-white/[0.05] text-[12px]">
      <span className="text-white/35">Fires on</span>
      {rule.eventTypes.length === 0 ? (
        <span className="text-white/30 italic">no events</span>
      ) : (
        rule.eventTypes.map((e) => (
          <span key={e} className="rounded-md bg-accent/12 px-1.5 py-0.5 text-[11px] font-semibold text-accent">
            {EVENT_LABELS[e] ?? e}
          </span>
        ))
      )}
      <span className="text-white/35">from</span>
      <span className="flex items-center gap-1">
        {rule.platforms.map((p) =>
          p === 'all' ? (
            <span key={p} className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-semibold text-white/70">All</span>
          ) : (
            <span key={p} className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-white/[0.05]">
              <PlatformLogo platform={p as any} size={11} />
            </span>
          )
        )}
      </span>
      <span className="mx-1 text-white/25">→</span>
      {activeOutputs.length === 0 ? (
        <span className="text-white/30 italic">no output</span>
      ) : (
        activeOutputs.map((o) => (
          <span key={o.label} className="inline-flex items-center gap-1 rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[11px] font-medium text-white/70">
            <o.icon size={11} /> {o.label}
          </span>
        ))
      )}
    </div>
  )
}

function MetaBadge({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 h-6 rounded-md bg-white/[0.04] border border-white/[0.06] text-white/60">
      <span className="text-white/35">{label}</span>
      <span className="font-medium text-white/80">{value}</span>
    </span>
  )
}

interface EditorGroupProps {
  icon: typeof IconBolt
  title: string
  subtitle?: string
  headerExtras?: React.ReactNode
  children: React.ReactNode
}

function EditorGroup({ icon: Icon, title, subtitle, headerExtras, children }: EditorGroupProps) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-5 space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-accent/10 border border-accent/15 flex items-center justify-center shrink-0">
          <Icon size={18} className="text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-white/90 leading-tight">{title}</h3>
          {subtitle && <p className="text-[12px] text-white/45 mt-1 leading-snug">{subtitle}</p>}
        </div>
        {headerExtras}
      </div>
      {children}
    </div>
  )
}

function supportedEventsFor(rule: AlertRule): readonly AlertRuleEventType[] {
  if (rule.platforms.length !== 1) return ALERT_RULE_EVENT_TYPES
  const p = rule.platforms[0]
  if (p === 'all') return ALERT_RULE_EVENT_TYPES
  return SUPPORTED_EVENTS_BY_PLATFORM[p] ?? ALERT_RULE_EVENT_TYPES
}
