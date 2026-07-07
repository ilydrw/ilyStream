import { useMemo } from 'react'
import {
  DEFAULT_ROSE_CONFIG,
  type RoseConfig,
  type Widget
} from '../../../../../shared/widgets'
import { Section, Slider, PercentSlider, ColorRow, EditorNote } from './Shared'
import { DesignSystemSection } from './DesignSystemSection'

export function RoseConfigEditor({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const config = useMemo<RoseConfig>(
    () => ({ ...DEFAULT_ROSE_CONFIG, ...(draft.config as Partial<RoseConfig>) }),
    [draft.config]
  )

  const update = <K extends keyof RoseConfig>(key: K, value: RoseConfig[K]) => {
    onChange({ ...draft, config: { ...config, [key]: value } })
  }

  return (
    <div className="flex flex-col gap-8">
      <EditorNote>
        Roses drift down the scene whenever viewers send rose gifts — density follows the
        gift combo size.
      </EditorNote>

      <Section label="Fall">
        <Slider
          label="Rose count"
          value={config.count}
          min={5}
          max={150}
          step={5}
          onChange={(v) => update('count', v)}
        />
        <Slider
          label="Fall speed"
          value={config.speed}
          min={1}
          max={10}
          format={(v) => `${v}×`}
          onChange={(v) => update('speed', v)}
        />
        <PercentSlider
          label="Size"
          value={config.scale}
          min={0.5}
          max={3}
          step={0.1}
          onChange={(v) => update('scale', v)}
        />
      </Section>

      <Section label="Colors">
        <ColorRow label="Petals" value={config.primaryColor} onChange={(v) => update('primaryColor', v)} />
        <ColorRow label="Stem" value={config.secondaryColor} onChange={(v) => update('secondaryColor', v)} />
      </Section>

      <DesignSystemSection
        config={config}
        onUpdate={update as (key: string, value: unknown) => void}
        features={{ font: false, radius: false, glass: false, animation: true }}
      />
    </div>
  )
}
