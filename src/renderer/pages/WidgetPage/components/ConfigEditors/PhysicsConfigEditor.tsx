import { useMemo } from 'react'
import {
  DEFAULT_PHYSICS_CONFIG,
  type PhysicsConfig,
  type Widget
} from '../../../../../shared/widgets'
import { NumberInput } from '../../../../components/ui/Inputs'
import { Section, Field, SwitchRow } from './Shared'

export function PhysicsConfigEditor({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const config = useMemo<PhysicsConfig>(
    () => ({ ...DEFAULT_PHYSICS_CONFIG, ...(draft.config as Partial<PhysicsConfig>) }),
    [draft.config]
  )

  const update = <K extends keyof PhysicsConfig>(key: K, value: PhysicsConfig[K]) => {
    onChange({ ...draft, config: { ...config, [key]: value } })
  }

  return (
    <div className="flex flex-col gap-8">
      <Section label="Physics Engine">
        <Field label={`Gravity — ${config.gravity}`} hint="How fast objects fall.">
          <input
            type="range"
            min={0}
            max={5}
            step={0.1}
            value={config.gravity}
            onChange={(e) => update('gravity', parseFloat(e.target.value))}
            className="w-full accent-white"
          />
        </Field>

        <Field label={`Bounciness — ${Math.round(config.restitution * 100)}%`} hint="Higher values make objects bounce more.">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={config.restitution}
            onChange={(e) => update('restitution', parseFloat(e.target.value))}
            className="w-full accent-white"
          />
        </Field>

        <Field label={`Friction — ${Math.round(config.friction * 100)}%`} hint="Resistance when objects slide.">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={config.friction}
            onChange={(e) => update('friction', parseFloat(e.target.value))}
            className="w-full accent-white"
          />
        </Field>
      </Section>

      <Section label="World Rules">
        <SwitchRow
          label="Enable Walls"
          hint="Keep objects within screen boundaries."
          value={config.enableWalls}
          onChange={(v) => update('enableWalls', v)}
        />

        <Field label="Max Objects" hint="Maximum objects allowed on screen.">
          <NumberInput
            value={config.maxObjects}
            onChange={(v) => update('maxObjects', v)}
            min={1}
            max={200}
            className="!w-24 !h-9 !text-xs text-right"
          />
        </Field>

        <Field label="Lifespan (Seconds)" hint="How long objects stay on screen.">
          <NumberInput
            value={config.particleLifeSec}
            onChange={(v) => update('particleLifeSec', v)}
            min={1}
            max={120}
            className="!w-24 !h-9 !text-xs text-right"
          />
        </Field>
      </Section>

      <Section label="Layout">
        <Field label="Aspect ratio" hint="TikTok uses Vertical (9:16). Auto fills area.">
          <div className="grid grid-cols-3 gap-2">
            {(['auto', 'tiktok', 'landscape'] as const).map((r) => (
              <button
                key={r}
                onClick={() => update('aspectRatio', r)}
                className={`h-9 rounded-lg text-[10px] font-bold border transition-all ${
                  config.aspectRatio === r
                    ? 'bg-white text-black border-white'
                    : 'bg-white/[0.03] text-white/60 border-white/10 hover:border-white/20'
                }`}
              >
                {r === 'auto' ? 'Auto' : r === 'tiktok' ? '9:16' : '16:9'}
              </button>
            ))}
          </div>
        </Field>

        <SwitchRow
          label="Force TikTok Dimensions"
          hint="Specifically restrict simulation to a central column."
          value={config.forceTikTokDimensions}
          onChange={(v) => update('forceTikTokDimensions', v)}
        />
      </Section>
    </div>
  )
}
