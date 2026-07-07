import { useMemo } from 'react'
import {
  DEFAULT_CHAT_UNIFIED_CONFIG,
  type ChatUnifiedConfig,
  type Widget
} from '../../../../../shared/widgets'
import { Section, Slider, PercentSlider, PositionGrid, SwitchRow, NumberRow } from './Shared'
import { DesignSystemSection } from './DesignSystemSection'

const MAX_UNIFIED_CHAT_MESSAGES = 5
const POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const

// The unified chat template also honors width / fontSize / showPlatformBadge
// from the classic chat config, so the editor surfaces them even though they
// are not part of ChatUnifiedConfig.
type UnifiedChatEditorConfig = ChatUnifiedConfig & {
  width?: number
  fontSize?: number
  showPlatformBadge?: boolean
}

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
      <Section
        label="Feed"
        description="Messages from every connected platform, merged into one stack. Relay echoes are filtered before they reach this widget."
      >
        <NumberRow
          label="Messages shown"
          hint="How many messages stay on screen. Fewer keeps the stack short — this widget usually shares space with gameplay."
          value={maxItems}
          min={1}
          max={MAX_UNIFIED_CHAT_MESSAGES}
          onChange={(v) => update('maxItems', v)}
        />
        <SwitchRow
          label="Platform badges"
          hint="Show a small TikTok / Twitch / YouTube / Kick mark next to each name."
          value={config.showPlatformBadge !== false}
          onChange={(v) => update('showPlatformBadge', v)}
        />
        <PositionGrid
          label="Anchor corner"
          hint="Messages grow away from this corner."
          value={config.position}
          allowed={POSITIONS}
          onChange={(v) => update('position', v)}
        />
      </Section>

      <Section label="Size">
        <Slider
          label="Feed width"
          hint="Cards also shrink to fit narrower browser sources."
          value={width}
          min={240}
          max={800}
          step={10}
          unit="px"
          onChange={(v) => update('width', v)}
        />
        <Slider
          label="Text size"
          hint="Names, badges, and avatars scale with it."
          value={fontSize}
          min={12}
          max={28}
          unit="px"
          onChange={(v) => update('fontSize', v)}
        />
        <PercentSlider
          label="Overall scale"
          value={config.scale}
          min={0.5}
          max={2}
          step={0.1}
          onChange={(v) => update('scale', v)}
        />
      </Section>

      <Section label="Surface">
        <PercentSlider
          label="Widget opacity"
          value={config.opacity}
          onChange={(v) => update('opacity', v)}
        />
        <PercentSlider
          label="Card background"
          hint="0% floats the text straight over your scene."
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
      </Section>

      <DesignSystemSection
        config={config}
        onUpdate={update as (key: string, value: unknown) => void}
        features={{ font: true, radius: true, glass: false, animation: true }}
      />
    </div>
  )
}
