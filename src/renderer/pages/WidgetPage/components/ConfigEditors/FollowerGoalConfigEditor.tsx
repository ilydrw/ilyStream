import { useMemo } from 'react'
import {
  DEFAULT_FOLLOWER_GOAL_CONFIG,
  type FollowerGoalConfig,
  type Widget
} from '../../../../../shared/widgets'
import {
  Section,
  Slider,
  PercentSlider,
  PositionGrid,
  SwitchRow,
  ColorRow,
  NumberRow,
  SegmentedRow,
  TextRow
} from './Shared'
import { DesignSystemSection } from './DesignSystemSection'

const POSITIONS = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right'
] as const

const GOAL_TYPES: Array<{ value: FollowerGoalConfig['goalType']; label: string }> = [
  { value: 'follows', label: 'Follows' },
  { value: 'subs', label: 'Subs' },
  { value: 'likes', label: 'Likes' },
  { value: 'gifts', label: 'Gifts' },
  { value: 'shares', label: 'Shares' },
  { value: 'raids', label: 'Raids' },
  { value: 'viewers', label: 'Viewers' }
]

export function FollowerGoalConfigEditor({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const config = useMemo<FollowerGoalConfig>(
    () => ({ ...DEFAULT_FOLLOWER_GOAL_CONFIG, ...(draft.config as Partial<FollowerGoalConfig>) }),
    [draft.config]
  )

  const update = <K extends keyof FollowerGoalConfig>(key: K, value: FollowerGoalConfig[K]) => {
    onChange({ ...draft, config: { ...config, [key]: value } })
  }

  return (
    <div className="flex flex-col gap-8">
      <Section label="Goal" description="What the bar counts and where it ends.">
        <SegmentedRow
          label="Metric"
          value={config.goalType}
          options={GOAL_TYPES}
          columns={4}
          onChange={(v) => update('goalType', v)}
        />
        <NumberRow
          label="Target"
          value={config.goal}
          min={1}
          max={100000000}
          onChange={(v) => update('goal', v)}
        />
        <NumberRow
          label="Head start"
          hint="Added to the live count — carry progress over from before the stream."
          value={config.startCount}
          min={0}
          max={100000000}
          onChange={(v) => update('startCount', v)}
        />
        <SegmentedRow
          label="Count from"
          value={config.platform}
          options={[
            { value: 'all', label: 'All platforms' },
            { value: 'twitch', label: 'Twitch' },
            { value: 'tiktok', label: 'TikTok' }
          ]}
          onChange={(v) => update('platform', v)}
        />
        <TextRow
          label="Label"
          hint="The heading above the bar."
          value={config.label}
          placeholder="Follower goal"
          onChange={(v) => update('label', v)}
        />
      </Section>

      <Section label="Readout">
        <SwitchRow
          label="Show count"
          hint="Current / target numbers next to the bar."
          value={config.showCount}
          onChange={(v) => update('showCount', v)}
        />
        <SwitchRow
          label="Show percentage"
          value={config.showPercentage}
          onChange={(v) => update('showPercentage', v)}
        />
      </Section>

      <Section label="Placement">
        <PositionGrid
          label="Anchor"
          value={config.position}
          allowed={POSITIONS}
          onChange={(v) => update('position', v)}
        />
        <Slider
          label="Bar width"
          value={config.width}
          min={200}
          max={800}
          step={10}
          unit="px"
          onChange={(v) => update('width', v)}
        />
      </Section>

      <Section label="Style">
        <ColorRow label="Accent" hint="Bar fill and highlights." value={config.accentColor} onChange={(v) => update('accentColor', v)} />
        <PercentSlider
          label="Card background"
          value={config.backgroundOpacity}
          onChange={(v) => update('backgroundOpacity', v)}
        />
        <Slider
          label="Backdrop blur"
          value={config.blur}
          min={0}
          max={80}
          unit="px"
          onChange={(v) => update('blur', v)}
        />
        <SwitchRow
          label="Animated border"
          value={config.showBorder}
          onChange={(v) => update('showBorder', v)}
        />
        {config.showBorder && (
          <SegmentedRow
            label="Border style"
            value={config.style}
            options={[
              { value: 'classic', label: 'Classic' },
              { value: 'chroma', label: 'Chroma' },
              { value: 'cyber', label: 'Cyber' },
              { value: 'gob-the-stopper', label: 'Gob' }
            ]}
            onChange={(v) => update('style', v)}
          />
        )}
      </Section>

      <Section label="Celebration" description="When the goal hits 100%.">
        <SwitchRow
          label="Celebrate at 100%"
          value={config.celebrateAt100 !== false}
          onChange={(v) => update('celebrateAt100', v)}
        />
        {config.celebrateAt100 !== false && (
          <SegmentedRow
            label="Effect"
            value={config.celebrationType || 'confetti'}
            options={[
              { value: 'confetti', label: 'Confetti' },
              { value: 'fireworks', label: 'Fireworks' },
              { value: 'hearts', label: 'Hearts' }
            ]}
            onChange={(v) => update('celebrationType', v)}
          />
        )}
      </Section>

      <DesignSystemSection
        config={config}
        onUpdate={update as (key: string, value: unknown) => void}
        features={{ font: false, radius: false, glass: false, animation: true }}
      />
    </div>
  )
}
