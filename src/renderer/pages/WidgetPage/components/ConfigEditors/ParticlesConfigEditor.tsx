import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { IconPlayerPlay } from '../../../../components/ui/icons'
import {
  resolveParticlesWidgetConfig,
  type ParticlesWidgetConfig,
  type FollowerHeartsLayerConfig,
  type FallingRosesLayerConfig,
  type GalaxyLayerConfig,
  type GGsLayerConfig,
  type HeartMeLayerConfig,
  type GiftParticleLayerConfig,
  type Widget
} from '../../../../../shared/widgets'
import { NumberInput } from '../../../../components/ui/Inputs'
import { Field, SwitchRow, ColorRow, Section } from './Shared'
import { DesignSystemSection } from './DesignSystemSection'

const PARTICLE_LAYER_KEYS = [
  'followerHearts', 'fallingRoses', 'galaxy', 'ggs', 'heartMe',
  'bubbles', 'confetti', 'fireworks', 'lightning', 'moneyRain'
] as const
export type ParticleLayerKey = typeof PARTICLE_LAYER_KEYS[number]

export function buildParticlesPreviewWidget(
  draft: Widget,
  cfg: ParticlesWidgetConfig,
  layer: ParticleLayerKey,
  requestId: number
): Widget {
  const nextConfig: ParticlesWidgetConfig = {
    ...cfg,
    followerHearts: { ...cfg.followerHearts, enabled: layer === 'followerHearts' },
    fallingRoses: { ...cfg.fallingRoses, enabled: layer === 'fallingRoses' },
    galaxy: { ...cfg.galaxy, enabled: layer === 'galaxy' },
    ggs: { ...cfg.ggs, enabled: layer === 'ggs' },
    heartMe: { ...cfg.heartMe, enabled: layer === 'heartMe' },
    bubbles: { ...cfg.bubbles, enabled: layer === 'bubbles' },
    confetti: { ...cfg.confetti, enabled: layer === 'confetti' },
    fireworks: { ...cfg.fireworks, enabled: layer === 'fireworks' },
    lightning: { ...cfg.lightning, enabled: layer === 'lightning' },
    moneyRain: { ...cfg.moneyRain, enabled: layer === 'moneyRain' }
  }

  return {
    ...draft,
    config: { ...nextConfig, __previewRequest: requestId }
  }
}

interface TikTokGiftOption {
  id: string
  name: string
  diamonds: number
}

let giftCatalogPromise: Promise<TikTokGiftOption[]> | null = null

function loadGiftCatalog(): Promise<TikTokGiftOption[]> {
  if (!giftCatalogPromise) {
    giftCatalogPromise = window.api.platform.tiktok.getGifts()
      .then((rows: any[]) => rows.map((row) => ({
        id: String(row.gift_id),
        name: String(row.name || 'Unknown gift'),
        diamonds: Math.max(0, Number(row.diamond_count) || 0)
      })))
      .catch(() => [])
  }
  return giftCatalogPromise
}

// ---- shared sub-components ------------------------------------------------

function LayerRow({
  emoji,
  label,
  description,
  enabled,
  onToggle,
  onPreview,
  children
}: {
  emoji: string
  label: string
  description: string
  enabled: boolean
  onToggle: (v: boolean) => void
  onPreview: () => void
  children: ReactNode
}) {
  return (
    <div className={`rounded-xl border transition-colors ${enabled ? 'border-white/20 bg-white/[0.03]' : 'border-white/[0.07]'}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <label className="flex min-w-0 flex-1 items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="w-4 h-4 accent-accent flex-shrink-0"
          />
          <span className="text-lg leading-none">{emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white/90">{label}</p>
            {!enabled && <p className="text-[10px] text-white/30 mt-0.5">{description}</p>}
          </div>
        </label>
        {enabled && (
          <span className="text-[10px] font-semibold tracking-tight bg-accent bg-clip-text text-transparent flex-shrink-0">
            Active
          </span>
        )}
        <button
          type="button"
          onClick={onPreview}
          className="app-button !h-8 !w-8 !p-0 flex-shrink-0"
          title={`Preview ${label}`}
          aria-label={`Preview ${label}`}
        >
          <IconPlayerPlay size={13} />
        </button>
      </div>

      {enabled && (
        <div className="px-4 pb-4 border-t border-white/[0.06] pt-4 flex flex-col gap-4">
          {children}
        </div>
      )}
    </div>
  )
}

function PhysicsRow({ label, value, onChange, min = 0.1, max = 5, step = 0.1 }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number
}) {
  return (
    <Field label={`${label} — ${value.toFixed(1)}`}>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-accent"
      />
    </Field>
  )
}

// ---- layer editors --------------------------------------------------------

function FollowerHeartsEditor({
  cfg, onChange
}: { cfg: FollowerHeartsLayerConfig; onChange: (next: FollowerHeartsLayerConfig) => void }) {
  const set = <K extends keyof FollowerHeartsLayerConfig>(k: K, v: FollowerHeartsLayerConfig[K]) =>
    onChange({ ...cfg, [k]: v })

  return (
    <>
      <Field label="Burst count" hint="Hearts spawned per follow event.">
        <NumberInput value={cfg.count} onChange={(v) => set('count', v)} min={1} max={200} className="!w-32" />
      </Field>
      <PhysicsRow label="Rise speed" value={cfg.speed} onChange={(v) => set('speed', v)} />
      <PhysicsRow label="Scale" value={cfg.scale} onChange={(v) => set('scale', v)} min={0.2} max={3} />
      <Field label="Text inside heart">
        <input
          type="text" value={cfg.text}
          onChange={(e) => set('text', e.target.value)}
          className="app-input !h-9 !text-xs !px-3" placeholder="ily!"
        />
      </Field>
      <ColorRow label="Primary color" value={cfg.primaryColor} onChange={(v) => set('primaryColor', v)} />
      <ColorRow label="Secondary color" value={cfg.secondaryColor} onChange={(v) => set('secondaryColor', v)} />
      <ColorRow label="Text color" value={cfg.textColor} onChange={(v) => set('textColor', v)} />
      <SwitchRow label="Audio Reactive" hint="Particles pulse to stream audio" value={cfg.audioReactive || false} onChange={(v) => set('audioReactive', v)} />
    </>
  )
}

function FallingRosesEditor({
  cfg, onChange
}: { cfg: FallingRosesLayerConfig; onChange: (next: FallingRosesLayerConfig) => void }) {
  const set = <K extends keyof FallingRosesLayerConfig>(k: K, v: FallingRosesLayerConfig[K]) =>
    onChange({ ...cfg, [k]: v })

  return (
    <>
      <GiftTriggerPicker
        giftIds={cfg.giftIds}
        giftNames={cfg.giftNames}
        onChange={(giftIds, giftNames) => onChange({ ...cfg, giftIds, giftNames })}
      />
      <Field label="Burst count" hint="Roses spawned for Rose, Rosa, and related floral gifts.">
        <NumberInput value={cfg.count} onChange={(v) => set('count', v)} min={1} max={150} className="!w-32" />
      </Field>
      <PhysicsRow label="Fall speed" value={cfg.speed} onChange={(v) => set('speed', v)} />
      <PhysicsRow label="Scale" value={cfg.scale} onChange={(v) => set('scale', v)} min={0.2} max={3} />
      <ColorRow label="Primary color" value={cfg.primaryColor} onChange={(v) => set('primaryColor', v)} />
      <ColorRow label="Secondary color" value={cfg.secondaryColor} onChange={(v) => set('secondaryColor', v)} />
      <SwitchRow label="Audio Reactive" hint="Particles pulse to stream audio" value={cfg.audioReactive || false} onChange={(v) => set('audioReactive', v)} />
    </>
  )
}

function GalaxyEditor({
  cfg, onChange
}: { cfg: GalaxyLayerConfig; onChange: (next: GalaxyLayerConfig) => void }) {
  const set = <K extends keyof GalaxyLayerConfig>(k: K, v: GalaxyLayerConfig[K]) =>
    onChange({ ...cfg, [k]: v })

  return (
    <>
      <p className="text-[10px] text-white/30">Defaults to Galaxy, Meteor Shower, Interstellar, and TikTok Universe gifts.</p>
      <GiftTriggerPicker
        giftIds={cfg.giftIds}
        giftNames={cfg.giftNames}
        onChange={(giftIds, giftNames) => onChange({ ...cfg, giftIds, giftNames })}
      />
      <Field label="Particle count">
        <NumberInput value={cfg.count} onChange={(v) => set('count', v)} min={1} max={200} className="!w-32" />
      </Field>
      <PhysicsRow label="Speed" value={cfg.speed} onChange={(v) => set('speed', v)} />
      <PhysicsRow label="Scale" value={cfg.scale} onChange={(v) => set('scale', v)} min={0.2} max={3} />
      <ColorRow label="Primary color" value={cfg.primaryColor} onChange={(v) => set('primaryColor', v)} />
      <ColorRow label="Secondary color" value={cfg.secondaryColor} onChange={(v) => set('secondaryColor', v)} />
      <SwitchRow label="Audio Reactive" hint="Particles pulse to stream audio" value={cfg.audioReactive || false} onChange={(v) => set('audioReactive', v)} />
    </>
  )
}

function GGsEditor({
  cfg, onChange
}: { cfg: GGsLayerConfig; onChange: (next: GGsLayerConfig) => void }) {
  const set = <K extends keyof GGsLayerConfig>(k: K, v: GGsLayerConfig[K]) =>
    onChange({ ...cfg, [k]: v })

  return (
    <>
      <p className="text-[10px] text-white/30">Defaults to TikTok's GG gift.</p>
      <GiftTriggerPicker
        giftIds={cfg.giftIds}
        giftNames={cfg.giftNames}
        onChange={(giftIds, giftNames) => onChange({ ...cfg, giftIds, giftNames })}
      />
      <Field label="Text">
        <input
          type="text" value={cfg.text}
          onChange={(e) => set('text', e.target.value)}
          className="app-input !h-9 !text-xs !px-3" placeholder="GG"
        />
      </Field>
      <Field label="Count">
        <NumberInput value={cfg.count} onChange={(v) => set('count', v)} min={1} max={100} className="!w-32" />
      </Field>
      <PhysicsRow label="Speed" value={cfg.speed} onChange={(v) => set('speed', v)} />
      <PhysicsRow label="Scale" value={cfg.scale} onChange={(v) => set('scale', v)} min={0.2} max={3} />
      <ColorRow label="Color" value={cfg.color} onChange={(v) => set('color', v)} />
      <SwitchRow label="Audio Reactive" hint="Particles pulse to stream audio" value={cfg.audioReactive || false} onChange={(v) => set('audioReactive', v)} />
    </>
  )
}

function HeartMeEditor({
  cfg, onChange
}: { cfg: HeartMeLayerConfig; onChange: (next: HeartMeLayerConfig) => void }) {
  const set = <K extends keyof HeartMeLayerConfig>(k: K, v: HeartMeLayerConfig[K]) =>
    onChange({ ...cfg, [k]: v })

  return (
    <>
      <p className="text-[10px] text-white/30">Heart-family gifts produce finite bursts that grow with gift value or repeat count.</p>
      <GiftTriggerPicker
        giftIds={cfg.giftIds}
        giftNames={cfg.giftNames}
        onChange={(giftIds, giftNames) => onChange({ ...cfg, giftIds, giftNames })}
      />
      <Field label="Base hearts per burst" hint="Scales 1.5×/2×/3× at 100/1,000/10,000 diamonds or 5/25/100 repeats.">
        <NumberInput value={cfg.count} onChange={(v) => set('count', v)} min={1} max={20} className="!w-32" />
      </Field>
      <PhysicsRow label="Speed" value={cfg.speed} onChange={(v) => set('speed', v)} />
      <PhysicsRow label="Scale" value={cfg.scale} onChange={(v) => set('scale', v)} min={0.2} max={2} />
      <ColorRow label="Primary color" value={cfg.primaryColor} onChange={(v) => set('primaryColor', v)} />
      <ColorRow label="Secondary color" value={cfg.secondaryColor} onChange={(v) => set('secondaryColor', v)} />
      <SwitchRow label="Audio Reactive" hint="Particles pulse to stream audio" value={cfg.audioReactive || false} onChange={(v) => set('audioReactive', v)} />
    </>
  )
}

function GiftTriggerPicker({
  giftIds,
  giftNames,
  onChange
}: {
  giftIds: string[]
  giftNames: string[]
  onChange: (giftIds: string[], giftNames: string[]) => void
}) {
  const [options, setOptions] = useState<TikTokGiftOption[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    void loadGiftCatalog().then((rows) => {
      if (!cancelled) setOptions(rows)
    })
    return () => { cancelled = true }
  }, [])

  const selectedIds = useMemo(() => new Set(giftIds.map(String)), [giftIds])
  const visibleOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return options
      .filter((option) => !normalizedQuery ||
        option.name.toLowerCase().includes(normalizedQuery) ||
        option.id.includes(normalizedQuery))
      .sort((left, right) => Number(selectedIds.has(right.id)) - Number(selectedIds.has(left.id)))
      .slice(0, normalizedQuery ? 40 : 20)
  }, [options, query, selectedIds])

  const toggleGift = (option: TikTokGiftOption) => {
    const isSelected = selectedIds.has(option.id)
    const nextIds = isSelected
      ? giftIds.filter((id) => String(id) !== option.id)
      : [...giftIds, option.id]
    const normalizedName = option.name.trim().toLowerCase()
    const anotherSelectedUsesName = options.some((candidate) =>
      candidate.id !== option.id &&
      nextIds.includes(candidate.id) &&
      candidate.name.trim().toLowerCase() === normalizedName)
    const nextNames = isSelected && !anotherSelectedUsesName
      ? giftNames.filter((name) => name.trim().toLowerCase() !== normalizedName)
      : Array.from(new Set([...giftNames, option.name]))

    onChange(nextIds, nextNames)
  }

  return (
    <Field label="TikTok gift triggers" hint={`${giftIds.length} selected. Search the saved TikTok gift catalog.`}>
      <div className="flex flex-col gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="app-input !h-9 !text-xs !px-3"
          placeholder="Search gifts by name or ID"
        />
        <div className="max-h-44 overflow-y-auto rounded-lg border border-white/[0.08] bg-black/20 p-1.5">
          {visibleOptions.map((option) => {
            const selected = selectedIds.has(option.id)
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => toggleGift(option)}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                  selected ? 'bg-accent/15 text-white' : 'text-white/60 hover:bg-white/[0.06] hover:text-white/85'
                }`}
              >
                <span className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
                  selected ? 'border-accent bg-accent text-black' : 'border-white/20'
                }`}>
                  {selected ? '✓' : ''}
                </span>
                <span className="min-w-0 flex-1 truncate">{option.name}</span>
                <span className="text-[10px] tabular-nums text-white/30">{option.diamonds.toLocaleString()} ♦</span>
              </button>
            )
          })}
          {options.length === 0 && (
            <p className="px-2.5 py-3 text-[10px] text-white/30">Loading the TikTok gift catalog…</p>
          )}
          {options.length > 0 && visibleOptions.length === 0 && (
            <p className="px-2.5 py-3 text-[10px] text-white/30">No matching gifts.</p>
          )}
        </div>
      </div>
    </Field>
  )
}

function GiftParticleEditor({
  cfg,
  onChange,
  hint
}: {
  cfg: GiftParticleLayerConfig
  onChange: (next: GiftParticleLayerConfig) => void
  hint: string
}) {
  const set = <K extends keyof GiftParticleLayerConfig>(key: K, value: GiftParticleLayerConfig[K]) =>
    onChange({ ...cfg, [key]: value })

  return (
    <>
      <p className="text-[10px] text-white/30">{hint}</p>
      <GiftTriggerPicker
        giftIds={cfg.giftIds}
        giftNames={cfg.giftNames}
        onChange={(giftIds, giftNames) => onChange({ ...cfg, giftIds, giftNames })}
      />
      <Field label="Base particle count" hint="Scales 1.5×/2×/3× at 100/1,000/10,000 diamonds or 5/25/100 repeats.">
        <NumberInput value={cfg.count} onChange={(value) => set('count', value)} min={1} max={120} className="!w-32" />
      </Field>
      <PhysicsRow label="Speed" value={cfg.speed} onChange={(value) => set('speed', value)} />
      <PhysicsRow label="Scale" value={cfg.scale} onChange={(value) => set('scale', value)} min={0.2} max={3} />
      <ColorRow label="Primary color" value={cfg.primaryColor} onChange={(value) => set('primaryColor', value)} />
      <ColorRow label="Secondary color" value={cfg.secondaryColor} onChange={(value) => set('secondaryColor', value)} />
      <SwitchRow label="Audio Reactive" hint="Particles pulse to stream audio" value={cfg.audioReactive || false} onChange={(value) => set('audioReactive', value)} />
    </>
  )
}

// ---- main editor ----------------------------------------------------------

export function ParticlesConfigEditor({
  draft,
  onChange,
  onPreview
}: {
  draft: Widget
  onChange: (next: Widget) => void
  onPreview?: (next: Widget) => void
}) {
  const cfg = useMemo<ParticlesWidgetConfig>(
    () => resolveParticlesWidgetConfig(draft.config),
    [draft.config]
  )
  const previewRequestRef = useRef(0)

  const update = (partial: Partial<ParticlesWidgetConfig>) =>
    onChange({ ...draft, config: { ...cfg, ...partial } })

  const previewLayer = (layer: ParticleLayerKey) => {
    onPreview?.(buildParticlesPreviewWidget(draft, cfg, layer, ++previewRequestRef.current))
  }

  const activeCount = PARTICLE_LAYER_KEYS.map((layer) => cfg[layer])
    .filter((l) => l.enabled).length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] text-white/30">
          Check a layer to include it. Each runs in the same overlay — one URL for all.
        </p>
        {activeCount > 0 && (
          <span className="text-[10px] font-semibold tracking-tight text-white/40">
            {activeCount} active
          </span>
        )}
      </div>

      <LayerRow
        emoji="💜" label="Follower Hearts"
        description="Rising hearts that burst on new followers."
        enabled={cfg.followerHearts.enabled}
        onToggle={(v) => update({ followerHearts: { ...cfg.followerHearts, enabled: v } })}
        onPreview={() => previewLayer('followerHearts')}
      >
        <FollowerHeartsEditor
          cfg={cfg.followerHearts}
          onChange={(next) => update({ followerHearts: next })}
        />
      </LayerRow>

      <LayerRow
        emoji="🌹" label="Falling Roses"
        description="Black roses for TikTok Rose, Rosa, and rose-family gifts."
        enabled={cfg.fallingRoses.enabled}
        onToggle={(v) => update({ fallingRoses: { ...cfg.fallingRoses, enabled: v } })}
        onPreview={() => previewLayer('fallingRoses')}
      >
        <FallingRosesEditor
          cfg={cfg.fallingRoses}
          onChange={(next) => update({ fallingRoses: next })}
        />
      </LayerRow>

      <LayerRow
        emoji="✨" label="Galaxy"
        description="Falling sparkle burst triggered by TikTok Galaxy gifts."
        enabled={cfg.galaxy.enabled}
        onToggle={(v) => update({ galaxy: { ...cfg.galaxy, enabled: v } })}
        onPreview={() => previewLayer('galaxy')}
      >
        <GalaxyEditor
          cfg={cfg.galaxy}
          onChange={(next) => update({ galaxy: next })}
        />
      </LayerRow>

      <LayerRow
        emoji="🎮" label="GG's"
        description="Falling GG text burst triggered by TikTok GG gifts."
        enabled={cfg.ggs.enabled}
        onToggle={(v) => update({ ggs: { ...cfg.ggs, enabled: v } })}
        onPreview={() => previewLayer('ggs')}
      >
        <GGsEditor
          cfg={cfg.ggs}
          onChange={(next) => update({ ggs: next })}
        />
      </LayerRow>

      <LayerRow
        emoji="💗" label="Heart Gifts"
        description="Tiered hearts for Heart Puff, Heart Me, Finger Heart, Hand Hearts, and other heart gifts."
        enabled={cfg.heartMe.enabled}
        onToggle={(v) => update({ heartMe: { ...cfg.heartMe, enabled: v } })}
        onPreview={() => previewLayer('heartMe')}
      >
        <HeartMeEditor
          cfg={cfg.heartMe}
          onChange={(next) => update({ heartMe: next })}
        />
      </LayerRow>

      <LayerRow
        emoji="🫧" label="Bubbles"
        description="Floating bubbles triggered by TikTok's Blow Bubbles gift."
        enabled={cfg.bubbles.enabled}
        onToggle={(value) => update({ bubbles: { ...cfg.bubbles, enabled: value } })}
        onPreview={() => previewLayer('bubbles')}
      >
        <GiftParticleEditor
          cfg={cfg.bubbles}
          onChange={(next) => update({ bubbles: next })}
          hint="Defaults to Blow Bubbles (gift ID 14084)."
        />
      </LayerRow>

      <LayerRow
        emoji="🎉" label="Confetti"
        description="Colorful confetti for Confetti and Marvelous Confetti gifts."
        enabled={cfg.confetti.enabled}
        onToggle={(value) => update({ confetti: { ...cfg.confetti, enabled: value } })}
        onPreview={() => previewLayer('confetti')}
      >
        <GiftParticleEditor
          cfg={cfg.confetti}
          onChange={(next) => update({ confetti: next })}
          hint="Defaults to Confetti and Marvelous Confetti."
        />
      </LayerRow>

      <LayerRow
        emoji="🎆" label="Fireworks"
        description="Radial spark bursts for Fireworks and Mystery Firework gifts."
        enabled={cfg.fireworks.enabled}
        onToggle={(value) => update({ fireworks: { ...cfg.fireworks, enabled: value } })}
        onPreview={() => previewLayer('fireworks')}
      >
        <GiftParticleEditor
          cfg={cfg.fireworks}
          onChange={(next) => update({ fireworks: next })}
          hint="Defaults to Fireworks and Mystery Firework."
        />
      </LayerRow>

      <LayerRow
        emoji="⚡" label="Lightning"
        description="Electric bolt rain for Lightning and Level-up Sparks gifts."
        enabled={cfg.lightning.enabled}
        onToggle={(value) => update({ lightning: { ...cfg.lightning, enabled: value } })}
        onPreview={() => previewLayer('lightning')}
      >
        <GiftParticleEditor
          cfg={cfg.lightning}
          onChange={(next) => update({ lightning: next })}
          hint="Defaults to Lightning gifts and Level-up Sparks."
        />
      </LayerRow>

      <LayerRow
        emoji="💸" label="Cash & Diamonds"
        description="Money or gem rain for Money Gun, Gold Mine, Diamond, and Gem Gun gifts."
        enabled={cfg.moneyRain.enabled}
        onToggle={(value) => update({ moneyRain: { ...cfg.moneyRain, enabled: value } })}
        onPreview={() => previewLayer('moneyRain')}
      >
        <GiftParticleEditor
          cfg={cfg.moneyRain}
          onChange={(next) => update({ moneyRain: next })}
          hint="Defaults to Money Gun, Gold Mine, Diamond, Diamond Gun, and Gem Gun."
        />
      </LayerRow>

      <Section label="Design & Animation">
        <DesignSystemSection config={cfg as any} onUpdate={(key, value) => update({ [key]: value })} />

        <Field label={`Audio Noise Gate — ${Math.round((cfg.audioThreshold || 0.05) * 100)}%`} hint="Ignore audio levels below this threshold">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="0.5"
              step="0.01"
              value={cfg.audioThreshold ?? 0.05}
              onChange={(e) => update({ audioThreshold: parseFloat(e.target.value) })}
              className="flex-1 accent-accent"
            />
          </div>
        </Field>
      </Section>
    </div>
  )
}
