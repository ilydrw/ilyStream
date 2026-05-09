import { useMemo } from 'react'
import {
  DEFAULT_FOLLOWER_GOAL_CONFIG,
  type FollowerGoalConfig,
  type Widget
} from '../../../../../shared/widgets'
import { NumberInput } from '../../../../components/ui/Inputs'
import { Section, Field, SwitchRow, ColorRow } from './Shared'

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

  const positions: FollowerGoalConfig['position'][] = [
    'top-left',
    'top-center',
    'top-right',
    'bottom-left',
    'bottom-center',
    'bottom-right'
  ]

  return (
    <div className="flex flex-col gap-6">
      <Section label="Goal">
        <Field label="Starting follower count">
          <NumberInput
            value={config.startCount}
            onChange={(v) => update('startCount', v)}
            min={0}
            max={10000000}
            step={1}
            className="!w-32 !h-9 !text-xs text-right"
          />
        </Field>

        <Field label="Target follower count">
          <NumberInput
            value={config.goal}
            onChange={(v) => update('goal', v)}
            min={1}
            max={10000000}
            step={10}
            className="!w-32 !h-9 !text-xs text-right"
          />
        </Field>

        <Field label="Label">
          <input
            type="text"
            value={config.label}
            onChange={(e) => update('label', e.currentTarget.value)}
            className="app-input !h-9 !text-xs !px-3"
            placeholder="Follower Goal"
          />
        </Field>
      </Section>

      <Section label="Layout">
        <Field label="Anchor position">
          <div className="grid grid-cols-3 gap-2">
            {positions.map((pos) => (
              <button
                key={pos}
                onClick={() => update('position', pos)}
                className={`h-10 rounded-lg text-[10px] font-bold border transition-all ${
                  config.position === pos
                    ? 'bg-white text-black border-white'
                    : 'bg-white/[0.03] text-white/60 border-white/10 hover:border-white/20'
                }`}
              >
                {pos.replace('-', ' ')}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Card width (px)">
          <NumberInput
            value={config.width}
            onChange={(v) => update('width', v)}
            min={240}
            max={800}
            step={10}
            className="!w-24 !h-9 !text-xs text-right"
          />
        </Field>
      </Section>

      <Section label="Display">
        <SwitchRow
          label="Show count"
          value={config.showCount}
          onChange={(v) => update('showCount', v)}
        />
        <SwitchRow
          label="Show percentage"
          value={config.showPercentage}
          onChange={(v) => update('showPercentage', v)}
        />
        <SwitchRow
          label="Show card border"
          value={config.showBorder}
          onChange={(v) => update('showBorder', v)}
        />
      </Section>

      <Section label="Glassmorphism">
        <Field label="Accent color">
          <div className="flex flex-col gap-3">
            <ColorRow label="Base color" value={config.accentColor.startsWith('#') ? config.accentColor : '#ff7a45'} onChange={(v) => update('accentColor', v)} />
            
            <div className="pt-2 border-t border-white/5">
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2 block">Special Effects</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => update('accentColor', 'chroma')}
                  className={`h-9 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${
                    config.accentColor === 'chroma'
                      ? 'bg-gradient-to-r from-red-500 via-green-500 to-blue-500 text-white border-transparent'
                      : 'bg-white/[0.03] text-white/60 border-white/10 hover:border-white/20'
                  }`}
                >
                  Chroma
                </button>
                <button
                  onClick={() => update('accentColor', 'cyberneon')}
                  className={`h-9 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${
                    config.accentColor === 'cyberneon'
                      ? 'bg-gradient-to-r from-[#D035F1] to-[#19C8FF] text-white border-transparent'
                      : 'bg-white/[0.03] text-white/60 border-white/10 hover:border-white/20'
                  }`}
                >
                  Cyberneon
                </button>
              </div>
            </div>
          </div>
        </Field>

        <Field label={`Background opacity — ${Math.round(config.backgroundOpacity * 100)}%`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={config.backgroundOpacity}
            onChange={(e) => update('backgroundOpacity', Number(e.currentTarget.value))}
            className="w-full accent-white"
          />
        </Field>

        <Field label={`Blur — ${config.blur}px`}>
          <input
            type="range"
            min={0}
            max={40}
            step={1}
            value={config.blur}
            onChange={(e) => update('blur', Number(e.currentTarget.value))}
            className="w-full accent-white"
          />
        </Field>
      </Section>
    </div>
  )
}
