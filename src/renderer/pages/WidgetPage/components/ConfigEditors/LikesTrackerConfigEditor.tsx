import { useMemo } from 'react'
import {
  DEFAULT_LIKES_TRACKER_CONFIG,
  type LikesTrackerConfig,
  type Widget
} from '../../../../../shared/widgets'
import { NumberInput } from '../../../../components/ui/Inputs'
import { Section, Field, SwitchRow, ColorRow } from './Shared'
import { DesignSystemSection } from './DesignSystemSection'

export function LikesTrackerConfigEditor({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const config = useMemo<LikesTrackerConfig>(
    () => ({ ...DEFAULT_LIKES_TRACKER_CONFIG, ...(draft.config as Partial<LikesTrackerConfig>) }),
    [draft.config]
  )

  const update = <K extends keyof LikesTrackerConfig>(key: K, value: LikesTrackerConfig[K]) => {
    onChange({ ...draft, config: { ...config, [key]: value } })
  }

  return (
    <div className="flex flex-col gap-6">
      <Section label="Leaderboard">
        <Field label="Visible users" hint="How many top likers stay on screen.">
          <NumberInput
            value={config.maxAvatars}
            onChange={(v) => update('maxAvatars', v)}
            min={1}
            max={25}
            className="!w-24 !h-9 !text-xs text-right"
          />
        </Field>

        <SwitchRow
          label="Show total likes"
          hint="Displays the stream-wide like counter in the header."
          value={config.showTotal}
          onChange={(v) => update('showTotal', v)}
        />
      </Section>

      <Section label="Style">
        <ColorRow
          label="Accent color"
          value={config.accentColor}
          onChange={(v) => update('accentColor', v)}
        />

        <Field label={`Opacity - ${Math.round(config.opacity * 100)}%`}>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={config.opacity}
            onChange={(e) => update('opacity', Number(e.currentTarget.value))}
            className="w-full accent-[#d035f1]"
          />
        </Field>

        <Field label={`Scale - ${config.scale.toFixed(1)}x`}>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={config.scale}
            onChange={(e) => update('scale', Number(e.currentTarget.value))}
            className="w-full accent-[#d035f1]"
          />
        </Field>
      </Section>

      <DesignSystemSection config={config as any} onUpdate={update as any} />
    </div>
  )
}
