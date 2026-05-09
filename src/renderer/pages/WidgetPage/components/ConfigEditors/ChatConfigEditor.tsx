import { useMemo } from 'react'
import {
  DEFAULT_CHAT_CONFIG,
  type ChatConfig,
  type Widget
} from '../../../../../shared/widgets'
import { NumberInput } from '../../../../components/ui/Inputs'
import { Section, Field, SwitchRow, ColorRow } from './Shared'

export function ChatConfigEditor({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const config = useMemo<ChatConfig>(
    () => ({ ...DEFAULT_CHAT_CONFIG, ...(draft.config as Partial<ChatConfig>) }),
    [draft.config]
  )

  const update = <K extends keyof ChatConfig>(key: K, value: ChatConfig[K]) => {
    onChange({ ...draft, config: { ...config, [key]: value } })
  }

  const positions: ChatConfig['position'][] = [
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right'
  ]

  return (
    <div className="flex flex-col gap-6">
      <Section label="Layout">
        <Field label="Anchor position">
          <div className="grid grid-cols-2 gap-2">
            {positions.map((pos) => (
              <button
                key={pos}
                onClick={() => update('position', pos)}
                className={`h-10 rounded-lg text-[11px] font-bold border transition-all ${
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

        <Field label="Feed width (px)">
          <NumberInput
            value={config.width}
            onChange={(v) => update('width', v)}
            min={240}
            max={900}
            step={10}
            className="!w-24 !h-9 !text-xs text-right"
          />
        </Field>

        <Field label="Message font size (px)">
          <NumberInput
            value={config.fontSize}
            onChange={(v) => update('fontSize', v)}
            min={10}
            max={32}
            className="!w-24 !h-9 !text-xs text-right"
          />
        </Field>

        <Field label="Aspect ratio" hint="TikTok uses Vertical (9:16). Auto fills the entire area.">
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
                {r === 'auto' ? 'Auto (Fill)' : r === 'tiktok' ? 'Vertical (9:16)' : 'Landscape (16:9)'}
              </button>
            ))}
          </div>
        </Field>

        <SwitchRow
          label="Force TikTok Dimensions"
          hint="Locks resolution to 1080x1920 for TikTok Live Studio 'Fit to Screen'"
          value={config.forceTikTokDimensions}
          onChange={(v) => update('forceTikTokDimensions', v)}
        />
      </Section>

      <Section label="Behavior">
        <Field label="Max visible messages" hint="Older messages roll off as new ones arrive.">
          <NumberInput
            value={config.maxItems}
            onChange={(v) => update('maxItems', v)}
            min={1}
            max={30}
            className="!w-24 !h-9 !text-xs text-right"
          />
        </Field>

        <Field
          label="Auto-fade after (seconds)"
          hint="Messages disappear after N seconds. Set 0 to keep forever."
        >
          <NumberInput
            value={config.fadeOutAfterSeconds}
            onChange={(v) => update('fadeOutAfterSeconds', v)}
            min={0}
            max={300}
            className="!w-24 !h-9 !text-xs text-right"
          />
        </Field>

        <SwitchRow
          label="Show platform badge"
          hint="Tiny pill showing TikTok / Twitch / etc."
          value={config.showPlatformBadge}
          onChange={(v) => update('showPlatformBadge', v)}
        />

        <SwitchRow
          label="Chat only"
          hint="Hide gifts, subs, and follows from the feed."
          value={config.chatOnly}
          onChange={(v) => update('chatOnly', v)}
        />
      </Section>

      <Section label="Glassmorphism">
        <ColorRow
          label="Fallback accent"
          value={config.accentColor}
          onChange={(v) => update('accentColor', v)}
        />

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
