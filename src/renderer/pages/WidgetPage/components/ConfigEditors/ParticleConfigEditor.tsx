import { useMemo } from 'react'
import {
  DEFAULT_PARTICLE_CONFIG,
  type ParticleConfig,
  type Widget
} from '../../../../../shared/widgets'
import { NumberInput } from '../../../../components/ui/Inputs'
import { Section, Field, SwitchRow, ColorRow } from './Shared'

export function ParticleConfigEditor({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const config = useMemo<ParticleConfig>(
    () => ({ ...DEFAULT_PARTICLE_CONFIG, ...(draft.config as Partial<ParticleConfig>) }),
    [draft.config]
  )

  const update = <K extends keyof ParticleConfig>(key: K, value: ParticleConfig[K]) => {
    onChange({ ...draft, config: { ...config, [key]: value } })
  }

  return (
    <div className="flex flex-col gap-8">
      <Section label="Behavior">
        <SwitchRow
          label="Event Driven"
          hint="Only spawn hearts when a follower event occurs. If off, they float continuously."
          value={config.eventDriven}
          onChange={(v) => update('eventDriven', v)}
        />
        
        <Field label="Particle count" hint="Number of hearts to spawn in a burst (or total on screen).">
          <NumberInput
            value={config.count}
            onChange={(v) => update('count', v)}
            min={1}
            max={200}
            className="!w-24 !h-9 !text-xs text-right"
          />
        </Field>
      </Section>

      <Section label="Appearance">
        <Field label="Internal Text">
          <input
            type="text"
            value={config.text}
            onChange={(e) => update('text', e.target.value)}
            className="app-input !h-9 !text-xs !px-3"
            placeholder="ily!"
          />
        </Field>

        <ColorRow label="Primary Color" value={config.primaryColor} onChange={(v) => update('primaryColor', v)} />
        <ColorRow label="Secondary Color" value={config.secondaryColor} onChange={(v) => update('secondaryColor', v)} />
        <ColorRow label="Text Color" value={config.textColor} onChange={(v) => update('textColor', v)} />
      </Section>

      <Section label="Physics">
        <Field label={`Rise Speed — ${config.speed}`}>
          <input
            type="range"
            min={0.1}
            max={5}
            step={0.1}
            value={config.speed}
            onChange={(e) => update('speed', parseFloat(e.target.value))}
            className="w-full accent-white"
          />
        </Field>

        <Field label={`Scale — ${config.scale}`}>
          <input
            type="range"
            min={0.2}
            max={3}
            step={0.1}
            value={config.scale}
            onChange={(e) => update('scale', parseFloat(e.target.value))}
            className="w-full accent-white"
          />
        </Field>
      </Section>
    </div>
  )
}
