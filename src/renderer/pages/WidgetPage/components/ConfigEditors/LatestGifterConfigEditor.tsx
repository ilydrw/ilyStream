import { useMemo } from 'react'
import {
  DEFAULT_LATEST_GIFTER_CONFIG,
  type LatestGifterConfig,
  type Widget
} from '../../../../../shared/widgets'
import { Section, PercentSlider, ColorRow, SegmentedRow, TextRow, SwitchRow, EditorNote } from './Shared'
import { DesignSystemSection } from './DesignSystemSection'

export function LatestGifterConfigEditor({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const config = useMemo<LatestGifterConfig>(
    () => ({ ...DEFAULT_LATEST_GIFTER_CONFIG, ...(draft.config as Partial<LatestGifterConfig>) }),
    [draft.config]
  )

  const update = <K extends keyof LatestGifterConfig>(key: K, value: LatestGifterConfig[K]) => {
    onChange({ ...draft, config: { ...config, [key]: value } })
  }

  return (
    <div className="flex flex-col gap-8">
      <EditorNote>
        Spotlights whoever sent the most recent gift — name and avatar update live as gifts
        arrive, from any connected platform.
      </EditorNote>

      <Section label="Card">
        <TextRow
          label="Label"
          hint="The heading above the gifter's name."
          value={config.label}
          placeholder="Latest gifter"
          onChange={(v) => update('label', v)}
        />
        <ColorRow label="Primary" value={config.primaryColor} onChange={(v) => update('primaryColor', v)} />
        <ColorRow label="Secondary" value={config.secondaryColor} onChange={(v) => update('secondaryColor', v)} />
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
        features={{ font: true, radius: true, glass: true, animation: true }}
      />
    </div>
  )
}
