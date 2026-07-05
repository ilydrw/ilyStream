import { useMemo } from 'react'
import {
  DEFAULT_CHAT_UNIFIED_CONFIG,
  type ChatUnifiedConfig,
  type Widget
} from '../../../../../shared/widgets'
import { Section, Field } from './Shared'
import { DesignSystemSection } from './DesignSystemSection'

const MAX_UNIFIED_CHAT_MESSAGES = 5

// The unified chat template also honors the classic chat's width/fontSize, so
// the editor surfaces them even though they aren't part of ChatUnifiedConfig.
type UnifiedChatEditorConfig = ChatUnifiedConfig & { width?: number; fontSize?: number }

const POSITION_OPTIONS: Array<{ value: ChatUnifiedConfig['position']; label: string }> = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-right', label: 'Top right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-right', label: 'Bottom right' }
]

export function ChatUnifiedConfigEditor({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const config = useMemo<UnifiedChatEditorConfig>(
    () => ({ ...DEFAULT_CHAT_UNIFIED_CONFIG, ...(draft.config as Partial<UnifiedChatEditorConfig>) }),
    [draft.config]
  )
  const maxItems = Math.min(
    MAX_UNIFIED_CHAT_MESSAGES,
    Math.max(1, Number(config.maxItems) || DEFAULT_CHAT_UNIFIED_CONFIG.maxItems)
  )
  const width = Math.max(240, Math.min(800, Number(config.width) || 480))
  const fontSize = Math.max(12, Math.min(28, Number(config.fontSize) || 15))

  const update = <K extends keyof UnifiedChatEditorConfig>(key: K, value: UnifiedChatEditorConfig[K]) => {
    onChange({ ...draft, config: { ...config, [key]: value } })
  }

  return (
    <div className="flex flex-col gap-8">
      <Section label="Feed">
        <Field label="Max messages" hint="Number of messages to keep in the overlay feed. Fewer = shorter stack.">
          <input
            type="number"
            min={1}
            max={MAX_UNIFIED_CHAT_MESSAGES}
            value={maxItems}
            onChange={(e) => {
              const value = parseInt(e.target.value, 10)
              update('maxItems', Math.min(MAX_UNIFIED_CHAT_MESSAGES, Math.max(1, value || DEFAULT_CHAT_UNIFIED_CONFIG.maxItems)))
            }}
            className="app-input !h-10 !px-4 w-32"
          />
        </Field>

        <Field label="Anchor corner" hint="Which corner of the browser source messages stick to.">
          <div className="grid grid-cols-2 gap-2">
            {POSITION_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => update('position', option.value)}
                className={`h-9 rounded-lg text-[10px] font-semibold border transition-all ${ config.position === option.value ? 'bg-accent text-white border-transparent' : 'bg-white/[0.03] text-white/60 border-white/10 hover:border-white/20' }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </Field>
      </Section>

      <Section label="Size">
        <Field label={`Feed Width — ${width}px`} hint="Max card width. Cards also shrink to fit the browser source.">
          <input
            type="range"
            min={240}
            max={800}
            step={10}
            value={width}
            onChange={(e) => update('width', Number(e.currentTarget.value))}
            className="w-full accent-[#19c8ff]"
          />
        </Field>

        <Field label={`Font Size — ${fontSize}px`} hint="Message text size; names, badges, and avatars scale with it.">
          <input
            type="range"
            min={12}
            max={28}
            step={1}
            value={fontSize}
            onChange={(e) => update('fontSize', Number(e.currentTarget.value))}
            className="w-full accent-[#19c8ff]"
          />
        </Field>

        <Field label={`Global Scale — ${Math.round(config.scale * 100)}%`}>
          <input
            type="range"
            min={0.5}
            max={2.0}
            step={0.1}
            value={config.scale}
            onChange={(e) => update('scale', parseFloat(e.target.value))}
            className="w-full accent-[#19c8ff]"
          />
        </Field>
      </Section>

      <Section label="Appearance">
        <Field label={`Overall Opacity — ${Math.round(config.opacity * 100)}%`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={config.opacity}
            onChange={(e) => update('opacity', parseFloat(e.target.value))}
            className="w-full accent-[#19c8ff]"
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
            className="w-full accent-[#19c8ff]"
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
            className="w-full accent-[#19c8ff]"
          />
        </Field>
      </Section>

      <DesignSystemSection config={config as any} onUpdate={update as any} />
    </div>
  )
}
