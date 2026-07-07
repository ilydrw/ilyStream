import { useMemo } from 'react'
import {
  DEFAULT_CHAT_CONFIG,
  type ChatConfig,
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
  SegmentedRow
} from './Shared'
import { DesignSystemSection } from './DesignSystemSection'

const POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const

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

  return (
    <div className="flex flex-col gap-8">
      <Section label="Feed">
        <NumberRow
          label="Messages shown"
          value={config.maxItems}
          min={1}
          max={30}
          onChange={(v) => update('maxItems', v)}
        />
        <SwitchRow
          label="Chat only"
          hint="Hide follows, gifts, and other events — pure conversation."
          value={config.chatOnly}
          onChange={(v) => update('chatOnly', v)}
        />
        <SwitchRow
          label="Platform badges"
          hint="Show which platform each message came from."
          value={config.showPlatformBadge}
          onChange={(v) => update('showPlatformBadge', v)}
        />
        <Slider
          label="Fade out after"
          hint="Messages quietly disappear once they have been read. 0 keeps them forever."
          value={config.fadeOutAfterSeconds}
          min={0}
          max={120}
          step={5}
          format={(v) => (v === 0 ? 'never' : `${v}s`)}
          onChange={(v) => update('fadeOutAfterSeconds', v)}
        />
      </Section>

      <Section label="Placement">
        <PositionGrid
          label="Anchor corner"
          value={config.position}
          allowed={POSITIONS}
          onChange={(v) => update('position', v)}
        />
        <SegmentedRow
          label="Canvas shape"
          hint="Matches the browser source you will paste this into."
          value={config.aspectRatio}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'landscape', label: '16:9' },
            { value: 'tiktok', label: '9:16' }
          ]}
          onChange={(v) => update('aspectRatio', v)}
        />
        {config.aspectRatio === 'tiktok' && (
          <SwitchRow
            label="Force TikTok dimensions"
            hint="Locks the layout to 1080×1920 even if the source reports otherwise."
            value={config.forceTikTokDimensions}
            onChange={(v) => update('forceTikTokDimensions', v)}
          />
        )}
      </Section>

      <Section label="Size">
        <Slider
          label="Feed width"
          value={config.width}
          min={240}
          max={800}
          step={10}
          unit="px"
          onChange={(v) => update('width', v)}
        />
        <Slider
          label="Text size"
          value={config.fontSize}
          min={10}
          max={32}
          unit="px"
          onChange={(v) => update('fontSize', v)}
        />
      </Section>

      <Section label="Surface">
        <ColorRow
          label="Accent"
          hint="Usernames and event highlights."
          value={config.accentColor}
          onChange={(v) => update('accentColor', v)}
        />
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
      </Section>

      <DesignSystemSection
        config={config}
        onUpdate={update as (key: string, value: unknown) => void}
        features={{ font: false, radius: false, glass: false, animation: true }}
      />
    </div>
  )
}
