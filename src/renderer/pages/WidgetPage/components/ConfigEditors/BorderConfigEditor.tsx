import { useMemo } from 'react'
import {
  DEFAULT_BORDER_CONFIG,
  type BorderConfig,
  type Widget
} from '../../../../../shared/widgets'
import { Section, Slider, PercentSlider, ColorRow, SegmentedRow, SwitchRow } from './Shared'
import { DesignSystemSection } from './DesignSystemSection'

export function BorderConfigEditor({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const config = useMemo<BorderConfig>(
    () => ({ ...DEFAULT_BORDER_CONFIG, ...(draft.config as Partial<BorderConfig>) }),
    [draft.config]
  )

  const update = <K extends keyof BorderConfig>(key: K, value: BorderConfig[K]) => {
    onChange({ ...draft, config: { ...config, [key]: value } })
  }

  return (
    <div className="flex flex-col gap-8">
      <Section label="Style" description="A glowing frame around the whole scene.">
        <SegmentedRow
          label="Look"
          value={config.style}
          options={[
            { value: 'classic', label: 'Classic' },
            { value: 'chroma', label: 'Chroma' },
            { value: 'cyber', label: 'Cyber' },
            { value: 'gob-the-stopper', label: 'Gob' }
          ]}
          onChange={(v) => update('style', v)}
        />
        <ColorRow label="Color A" value={config.color1} onChange={(v) => update('color1', v)} />
        <ColorRow
          label="Color B"
          hint="Chroma and cyber sweep between the two colors."
          value={config.color2}
          onChange={(v) => update('color2', v)}
        />
      </Section>

      <Section label="Shape">
        <Slider
          label="Thickness"
          value={config.thickness}
          min={1}
          max={40}
          unit="px"
          onChange={(v) => update('thickness', v)}
        />
        <Slider
          label="Corner radius"
          value={config.borderRadius}
          min={0}
          max={80}
          unit="px"
          onChange={(v) => update('borderRadius', v)}
        />
        <PercentSlider
          label="Glow"
          value={config.glowIntensity}
          onChange={(v) => update('glowIntensity', v)}
        />
        <PercentSlider
          label="Opacity"
          value={config.opacity}
          onChange={(v) => update('opacity', v)}
        />
        <Slider
          label="Sweep speed"
          hint="How fast the gradient travels around the frame."
          value={config.speed}
          min={1}
          max={20}
          format={(v) => `${v}×`}
          onChange={(v) => update('speed', v)}
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
            value={config.forceTikTokDimensions === true}
            onChange={(v) => update('forceTikTokDimensions', v)}
          />
        )}
        <SwitchRow
          label="Preview backdrop"
          hint="Adds a placeholder scene behind the frame in the preview only."
          value={config.showPreviewBackground === true}
          onChange={(v) => update('showPreviewBackground', v)}
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
