import { useMemo } from 'react'
import {
  DEFAULT_ROSE_CONFIG,
  type RoseConfig,
  type Widget
} from '../../../../../shared/widgets'
import { NumberInput } from '../../../../components/ui/Inputs'
import { Section, Field, SwitchRow, ColorRow } from './Shared'

export function RoseConfigEditor({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const config = useMemo<RoseConfig>(
    () => ({ ...DEFAULT_ROSE_CONFIG, ...(draft.config as Partial<RoseConfig>) }),
    [draft.config]
  )

  const update = <K extends keyof RoseConfig>(key: K, value: RoseConfig[K]) => {
    onChange({ ...draft, config: { ...config, [key]: value } })
  }

  return (
    <div className="flex flex-col gap-8">
      <Section label="Behavior">
        <SwitchRow
          label="Event Driven"
          hint="Roses now spawn only when a TikTok Rose gift occurs."
          value={config.eventDriven}
          onChange={(v) => update('eventDriven', v)}
        />
        
        <Field label="Rose count" hint="Number of roses to spawn in a burst.">
          <NumberInput
            value={config.count}
            onChange={(v) => update('count', v)}
            min={1}
            max={150}
            className="!w-24 !h-9 !text-xs text-right"
          />
        </Field>
      </Section>

      <Section label="Appearance">
        <ColorRow label="Primary Color" value={config.primaryColor} onChange={(v) => update('primaryColor', v)} />
        <ColorRow label="Secondary Color" value={config.secondaryColor} onChange={(v) => update('secondaryColor', v)} />
      </Section>

      <Section label="Physics">
        <Field label={`Fall Speed — ${config.speed}`}>
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
