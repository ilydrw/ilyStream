import { useMemo } from 'react'
import {
  DEFAULT_LIKES_TRACKER_CONFIG,
  type LikesTrackerConfig,
  type Widget
} from '../../../../../shared/widgets'
import { NumberInput, TextInput } from '../../../../components/ui/Inputs'
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
      <Section label="Content">
        <Field label="Header title" hint="Shown above the live like rankings.">
          <TextInput
            value={config.title}
            onChange={(v) => update('title', v)}
            placeholder="Top Likers"
            className="!h-9 !text-xs"
          />
        </Field>

        <SwitchRow
          label="Show header"
          hint="Hides the title and total row for a compact board."
          value={config.showHeader}
          onChange={(v) => update('showHeader', v)}
        />

        <SwitchRow
          label="Show total likes"
          hint="Displays the stream-wide like counter in the header."
          value={config.showTotal}
          onChange={(v) => update('showTotal', v)}
        />
      </Section>

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

        <div className="grid grid-cols-2 gap-4">
          <Field label="Row height" hint="Vertical spacing in pixels.">
            <NumberInput
              value={config.rowHeight}
              onChange={(v) => update('rowHeight', v)}
              min={44}
              max={88}
              className="!h-9 !text-xs"
            />
          </Field>

          <Field label="Avatar size" hint="Profile picture size in pixels.">
            <NumberInput
              value={config.avatarSize}
              onChange={(v) => update('avatarSize', v)}
              min={28}
              max={64}
              className="!h-9 !text-xs"
            />
          </Field>
        </div>

        <Field label="Profile picture shape">
          <div className="grid grid-cols-2 gap-2">
            {(['circle', 'square'] as const).map((shape) => (
              <button
                key={shape}
                type="button"
                onClick={() => update('avatarShape', shape)}
                className={`h-9 rounded-lg border text-[10px] font-black uppercase tracking-normal transition-all ${
                  config.avatarShape === shape
                    ? 'border-[#d035f1]/70 bg-[#d035f1]/20 text-white shadow-glow'
                    : 'border-white/10 bg-white/[0.03] text-white/40 hover:border-white/20 hover:text-white/70'
                }`}
              >
                {shape}
              </button>
            ))}
          </div>
        </Field>

        <SwitchRow
          label="Show rank numbers"
          hint="Turns the #1, #2, #3 labels on or off."
          value={config.showRankNumbers}
          onChange={(v) => update('showRankNumbers', v)}
        />

        <SwitchRow
          label="Crown first place"
          hint="Adds a small crown to the current top liker."
          value={config.showFirstPlaceCrown}
          onChange={(v) => update('showFirstPlaceCrown', v)}
        />
      </Section>

      <Section label="Style">
        <ColorRow
          label="Accent color"
          value={config.accentColor}
          onChange={(v) => update('accentColor', v)}
        />

        <ColorRow
          label="Secondary color"
          value={config.secondaryColor}
          onChange={(v) => update('secondaryColor', v)}
        />

        <ColorRow
          label="Panel color"
          value={config.backgroundColor}
          onChange={(v) => update('backgroundColor', v)}
        />

        <ColorRow
          label="Text color"
          value={config.textColor}
          onChange={(v) => update('textColor', v)}
        />

        <ColorRow
          label="Crown color"
          value={config.crownColor}
          onChange={(v) => update('crownColor', v)}
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
