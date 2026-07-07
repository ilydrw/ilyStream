import { useMemo } from 'react'
import {
  DEFAULT_NODE_NETWORK_CONFIG,
  type NodeNetworkConfig,
  type Widget
} from '../../../../../shared/widgets'
import { Section, Slider, PercentSlider, ColorRow, SegmentedRow, SwitchRow } from './Shared'
import { DesignSystemSection } from './DesignSystemSection'

export function NodeNetworkConfigEditor({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const config = useMemo<NodeNetworkConfig>(
    () => ({ ...DEFAULT_NODE_NETWORK_CONFIG, ...(draft.config as Partial<NodeNetworkConfig>) }),
    [draft.config]
  )

  const update = <K extends keyof NodeNetworkConfig>(key: K, value: NodeNetworkConfig[K]) => {
    onChange({ ...draft, config: { ...config, [key]: value } })
  }

  return (
    <div className="flex flex-col gap-8">
      <Section
        label="Network"
        description="Ambient constellation background — nodes drift and connect when close."
      >
        <Slider
          label="Node count"
          hint="More nodes = denser web, more GPU. 60–100 is a good stream-safe range."
          value={config.nodeCount}
          min={10}
          max={300}
          step={5}
          onChange={(v) => update('nodeCount', v)}
        />
        <Slider
          label="Link distance"
          hint="How close two nodes must be before a line forms."
          value={config.maxDistance}
          min={40}
          max={400}
          step={10}
          unit="px"
          onChange={(v) => update('maxDistance', v)}
        />
        <Slider
          label="Drift speed"
          value={config.speed}
          min={1}
          max={10}
          format={(v) => `${v}×`}
          onChange={(v) => update('speed', v)}
        />
      </Section>

      <Section label="Colors">
        <ColorRow label="Nodes" value={config.primaryColor} onChange={(v) => update('primaryColor', v)} />
        <ColorRow label="Links" value={config.secondaryColor} onChange={(v) => update('secondaryColor', v)} />
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
