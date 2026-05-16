import { useMemo } from 'react'
import {
  DEFAULT_LEADERBOARD_CONFIG,
  type LeaderboardConfig,
  type Widget
} from '../../../../../shared/widgets'
import { Section, Field, ColorRow } from './Shared'
import { DesignSystemSection } from './DesignSystemSection'

export function LeaderboardConfigEditor({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const config = useMemo<LeaderboardConfig>(
    () => ({ ...DEFAULT_LEADERBOARD_CONFIG, ...(draft.config as Partial<LeaderboardConfig>) }),
    [draft.config]
  )

  const update = <K extends keyof LeaderboardConfig>(key: K, value: LeaderboardConfig[K]) => {
    onChange({ ...draft, config: { ...config, [key]: value } })
  }

  return (
    <div className="flex flex-col gap-8">
      <Section label="Appearance">
        <ColorRow label="Accent Color" value={config.accentColor} onChange={(v) => update('accentColor', v)} />

        <Field label={`Scale — ${Math.round(config.scale * 100)}%`}>
          <input
            type="range"
            min={0.5}
            max={2.0}
            step={0.1}
            value={config.scale}
            onChange={(e) => update('scale', parseFloat(e.target.value))}
            className="w-full accent-[#d035f1]"
          />
        </Field>

        <Field label={`Opacity — ${Math.round(config.opacity * 100)}%`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={config.opacity}
            onChange={(e) => update('opacity', parseFloat(e.target.value))}
            className="w-full accent-[#d035f1]"
          />
        </Field>
      </Section>

      <DesignSystemSection config={config as any} onUpdate={update as any} />
    </div>
  )
}
