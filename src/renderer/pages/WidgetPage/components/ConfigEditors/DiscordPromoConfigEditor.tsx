import { useMemo } from 'react'
import {
  DEFAULT_DISCORD_PROMO_CONFIG,
  type DiscordPromoConfig,
  type Widget
} from '../../../../../shared/widgets'
import { Section, PercentSlider, ColorRow, SegmentedRow, TextRow, SwitchRow } from './Shared'
import { DesignSystemSection } from './DesignSystemSection'

export function DiscordPromoConfigEditor({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const config = useMemo<DiscordPromoConfig>(
    () => ({ ...DEFAULT_DISCORD_PROMO_CONFIG, ...(draft.config as Partial<DiscordPromoConfig>) }),
    [draft.config]
  )

  const update = <K extends keyof DiscordPromoConfig>(key: K, value: DiscordPromoConfig[K]) => {
    onChange({ ...draft, config: { ...config, [key]: value } })
  }

  return (
    <div className="flex flex-col gap-8">
      <Section label="Message">
        <TextRow
          label="Headline"
          value={config.message}
          placeholder="Join the Discord"
          onChange={(v) => update('message', v)}
        />
        <TextRow
          label="Subline"
          hint="Usually the invite link or a call to action."
          value={config.subMessage}
          placeholder="discord.gg/yourserver"
          onChange={(v) => update('subMessage', v)}
        />
      </Section>

      <Section label="Colors">
        <ColorRow label="Card" value={config.primaryColor} onChange={(v) => update('primaryColor', v)} />
        <ColorRow label="Text" value={config.textColor} onChange={(v) => update('textColor', v)} />
        <ColorRow label="Icon" value={config.iconColor} onChange={(v) => update('iconColor', v)} />
      </Section>

      <Section label="Size">
        <PercentSlider
          label="Scale"
          value={config.scale}
          min={0.5}
          max={2}
          step={0.1}
          onChange={(v) => update('scale', v)}
        />
        <PercentSlider
          label="Opacity"
          value={config.opacity}
          onChange={(v) => update('opacity', v)}
        />
      </Section>

      <Section label="Canvas">
        <SegmentedRow
          label="Canvas shape"
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
            value={config.forceTikTokDimensions}
            onChange={(v) => update('forceTikTokDimensions', v)}
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
