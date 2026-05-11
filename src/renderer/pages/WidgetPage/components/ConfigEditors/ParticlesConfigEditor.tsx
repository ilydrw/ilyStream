import { useMemo, type ReactNode } from 'react'
import {IconPlayerPlay} from '@tabler/icons-react'
import {
  DEFAULT_PARTICLES_CONFIG,
  type ParticlesWidgetConfig,
  type FollowerHeartsLayerConfig,
  type FallingRosesLayerConfig,
  type GalaxyLayerConfig,
  type GGsLayerConfig,
  type HeartMeLayerConfig,
  type Widget
} from '../../../../../shared/widgets'
import { NumberInput } from '../../../../components/ui/Inputs'
import { Field, SwitchRow, ColorRow } from './Shared'

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
            className="w-4 h-4 accent-white flex-shrink-0"
          />
          <span className="text-lg leading-none">{emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white/90">{label}</p>
            {!enabled && <p className="text-[10px] text-white/30 mt-0.5">{description}</p>}
          </div>
        </label>
        {enabled && (
          <span className="text-[10px] font-black uppercase tracking-widest text-green-400/80 flex-shrink-0">
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
        className="w-full accent-white"
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
        <NumberInput value={cfg.count} onChange={(v) => set('count', v)} min={1} max={200} className="!w-24 !h-9 !text-xs text-right" />
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
      <Field label="Burst count" hint="Roses spawned per TikTok Rose gift event.">
        <NumberInput value={cfg.count} onChange={(v) => set('count', v)} min={1} max={150} className="!w-24 !h-9 !text-xs text-right" />
      </Field>
      <PhysicsRow label="Fall speed" value={cfg.speed} onChange={(v) => set('speed', v)} />
      <PhysicsRow label="Scale" value={cfg.scale} onChange={(v) => set('scale', v)} min={0.2} max={3} />
      <ColorRow label="Primary color" value={cfg.primaryColor} onChange={(v) => set('primaryColor', v)} />
      <ColorRow label="Secondary color" value={cfg.secondaryColor} onChange={(v) => set('secondaryColor', v)} />
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
      <p className="text-[10px] text-white/30">Falls when a TikTok Galaxy gift is received.</p>
      <Field label="Particle count">
        <NumberInput value={cfg.count} onChange={(v) => set('count', v)} min={1} max={200} className="!w-24 !h-9 !text-xs text-right" />
      </Field>
      <PhysicsRow label="Speed" value={cfg.speed} onChange={(v) => set('speed', v)} />
      <PhysicsRow label="Scale" value={cfg.scale} onChange={(v) => set('scale', v)} min={0.2} max={3} />
      <ColorRow label="Primary color" value={cfg.primaryColor} onChange={(v) => set('primaryColor', v)} />
      <ColorRow label="Secondary color" value={cfg.secondaryColor} onChange={(v) => set('secondaryColor', v)} />
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
      <p className="text-[10px] text-white/30">Falls when a TikTok GG gift is received.</p>
      <Field label="Text">
        <input
          type="text" value={cfg.text}
          onChange={(e) => set('text', e.target.value)}
          className="app-input !h-9 !text-xs !px-3" placeholder="GG"
        />
      </Field>
      <Field label="Count">
        <NumberInput value={cfg.count} onChange={(v) => set('count', v)} min={1} max={100} className="!w-24 !h-9 !text-xs text-right" />
      </Field>
      <PhysicsRow label="Speed" value={cfg.speed} onChange={(v) => set('speed', v)} />
      <PhysicsRow label="Scale" value={cfg.scale} onChange={(v) => set('scale', v)} min={0.2} max={3} />
      <ColorRow label="Color" value={cfg.color} onChange={(v) => set('color', v)} />
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
      <p className="text-[10px] text-white/30">Spawns small hearts on TikTok likes. Throttled to avoid floods.</p>
      <Field label="Hearts per burst">
        <NumberInput value={cfg.count} onChange={(v) => set('count', v)} min={1} max={20} className="!w-24 !h-9 !text-xs text-right" />
      </Field>
      <PhysicsRow label="Speed" value={cfg.speed} onChange={(v) => set('speed', v)} />
      <PhysicsRow label="Scale" value={cfg.scale} onChange={(v) => set('scale', v)} min={0.2} max={2} />
      <ColorRow label="Primary color" value={cfg.primaryColor} onChange={(v) => set('primaryColor', v)} />
      <ColorRow label="Secondary color" value={cfg.secondaryColor} onChange={(v) => set('secondaryColor', v)} />
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
  const cfg = useMemo<ParticlesWidgetConfig>(() => ({
    followerHearts: { ...DEFAULT_PARTICLES_CONFIG.followerHearts, ...(draft.config as any)?.followerHearts },
    fallingRoses:   { ...DEFAULT_PARTICLES_CONFIG.fallingRoses,   ...(draft.config as any)?.fallingRoses   },
    galaxy:         { ...DEFAULT_PARTICLES_CONFIG.galaxy,         ...(draft.config as any)?.galaxy         },
    ggs:            { ...DEFAULT_PARTICLES_CONFIG.ggs,            ...(draft.config as any)?.ggs            },
    heartMe:        { ...DEFAULT_PARTICLES_CONFIG.heartMe,        ...(draft.config as any)?.heartMe        }
  }), [draft.config])

  const update = (partial: Partial<ParticlesWidgetConfig>) =>
    onChange({ ...draft, config: { ...cfg, ...partial } })

  const previewLayer = (layer: keyof ParticlesWidgetConfig) => {
    const nextConfig: ParticlesWidgetConfig = {
      followerHearts: { ...cfg.followerHearts, enabled: layer === 'followerHearts' },
      fallingRoses: { ...cfg.fallingRoses, enabled: layer === 'fallingRoses' },
      galaxy: { ...cfg.galaxy, enabled: layer === 'galaxy' },
      ggs: { ...cfg.ggs, enabled: layer === 'ggs' },
      heartMe: { ...cfg.heartMe, enabled: layer === 'heartMe' }
    }

    onPreview?.({ ...draft, config: nextConfig })
  }

  const activeCount = [cfg.followerHearts, cfg.fallingRoses, cfg.galaxy, cfg.ggs, cfg.heartMe]
    .filter((l) => l.enabled).length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] text-white/30">
          Check a layer to include it. Each runs in the same overlay — one URL for all.
        </p>
        {activeCount > 0 && (
          <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
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
        description="Black roses that fall when TikTok Rose gifts arrive."
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
        emoji="💗" label="Heart Me"
        description="Small hearts that pop on TikTok likes."
        enabled={cfg.heartMe.enabled}
        onToggle={(v) => update({ heartMe: { ...cfg.heartMe, enabled: v } })}
        onPreview={() => previewLayer('heartMe')}
      >
        <HeartMeEditor
          cfg={cfg.heartMe}
          onChange={(next) => update({ heartMe: next })}
        />
      </LayerRow>
    </div>
  )
}
