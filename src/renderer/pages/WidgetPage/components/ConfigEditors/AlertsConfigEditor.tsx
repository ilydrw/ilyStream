import { useMemo } from 'react'
import {
  DEFAULT_ALERTS_CONFIG,
  type AlertsConfig,
  type Widget
} from '../../../../../shared/widgets'
import { Section, Field, ColorRow } from './Shared'
import { DesignSystemSection } from './DesignSystemSection'

export function AlertsConfigEditor({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const config = useMemo<AlertsConfig>(
    () => ({ ...DEFAULT_ALERTS_CONFIG, ...(draft.config as Partial<AlertsConfig>) }),
    [draft.config]
  )

  const update = <K extends keyof AlertsConfig>(key: K, value: AlertsConfig[K]) => {
    onChange({ ...draft, config: { ...config, [key]: value } })
  }

  return (
    <div className="flex flex-col gap-8">
      <Section label="Core Settings">
        <div className="grid grid-cols-2 gap-4">
          <ColorRow label="Accent color" value={config.accentColor} onChange={(v) => update('accentColor', v)} />
          <ColorRow label="Text color" value={config.textColor} onChange={(v) => update('textColor', v)} />
        </div>

        <Field label={`Duration — ${config.duration / 1000}s`}>
          <input
            type="range"
            min={1000}
            max={30000}
            step={500}
            value={config.duration}
            onChange={(e) => update('duration', parseInt(e.target.value))}
            className="w-full accent-[#d035f1]"
          />
        </Field>
      </Section>

      <DesignSystemSection config={config as any} onUpdate={update as any} />
    </div>
  )
}
