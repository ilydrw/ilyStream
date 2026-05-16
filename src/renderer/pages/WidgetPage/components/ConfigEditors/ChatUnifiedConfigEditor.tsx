import { useMemo } from 'react'
import {
  DEFAULT_CHAT_UNIFIED_CONFIG,
  type ChatUnifiedConfig,
  type Widget
} from '../../../../../shared/widgets'
import { Section, Field } from './Shared'
import { DesignSystemSection } from './DesignSystemSection'

export function ChatUnifiedConfigEditor({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const config = useMemo<ChatUnifiedConfig>(
    () => ({ ...DEFAULT_CHAT_UNIFIED_CONFIG, ...(draft.config as Partial<ChatUnifiedConfig>) }),
    [draft.config]
  )

  const update = <K extends keyof ChatUnifiedConfig>(key: K, value: ChatUnifiedConfig[K]) => {
    onChange({ ...draft, config: { ...config, [key]: value } })
  }

  return (
    <div className="flex flex-col gap-8">
      <Section label="Feed">
        <Field label="Max messages" hint="Number of messages to keep in the overlay feed.">
          <input
            type="number"
            min={10}
            max={200}
            value={config.maxItems}
            onChange={(e) => update('maxItems', parseInt(e.target.value, 10) || 75)}
            className="app-input !h-10 !px-4 w-32"
          />
        </Field>
      </Section>

      <Section label="Appearance">
        <Field label={`Global Scale — ${Math.round(config.scale * 100)}%`}>
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

        <Field label={`Overall Opacity — ${Math.round(config.opacity * 100)}%`}>
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

        <Field label={`Message BG Opacity — ${Math.round(config.backgroundOpacity * 100)}%`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={config.backgroundOpacity}
            onChange={(e) => update('backgroundOpacity', Number(e.currentTarget.value))}
            className="w-full accent-[#d035f1]"
          />
        </Field>

        <Field label={`Glass Blur — ${config.blur}px`}>
          <input
            type="range"
            min={0}
            max={80}
            step={1}
            value={config.blur}
            onChange={(e) => update('blur', Number(e.currentTarget.value))}
            className="w-full accent-[#d035f1]"
          />
        </Field>
      </Section>

      <Section label="Layout">
        <Field label="Aspect ratio" hint="TikTok uses Vertical (9:16). Auto fills the entire area.">
          <div className="grid grid-cols-3 gap-2">
            {(['auto', 'tiktok', 'landscape'] as const).map((r) => (
              <button
                key={r}
                onClick={() => update('aspectRatio', r)}
                className={`h-9 rounded-lg text-[10px] font-bold border transition-all ${
                  config.aspectRatio === r
                    ? 'bg-brand-gradient text-white border-transparent shadow-glow'
                    : 'bg-white/[0.03] text-white/60 border-white/10 hover:border-white/20'
                }`}
              >
                {r === 'auto' ? 'Auto (Fill)' : r === 'tiktok' ? 'Vertical (9:16)' : 'Landscape (16:9)'}
              </button>
            ))}
          </div>
        </Field>
      </Section>

      <DesignSystemSection config={config as any} onUpdate={update as any} />
    </div>
  )
}
