import { useMemo } from 'react'
import {
  DEFAULT_PHYSICS_CONFIG,
  type PhysicsConfig,
  type Widget
} from '../../../../../shared/widgets'
import { Section, Slider, SwitchRow, NumberRow, EditorNote } from './Shared'
import { DesignSystemSection } from './DesignSystemSection'

export function PhysicsConfigEditor({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const config = useMemo<PhysicsConfig>(
    () => ({ ...DEFAULT_PHYSICS_CONFIG, ...(draft.config as Partial<PhysicsConfig>) }),
    [draft.config]
  )

  const update = <K extends keyof PhysicsConfig>(key: K, value: PhysicsConfig[K]) => {
    onChange({ ...draft, config: { ...config, [key]: value } })
  }

  return (
    <div className="flex flex-col gap-8">
      <EditorNote>
        Chat events drop physical objects (emotes, gift icons) that bounce around the scene.
        Tuning is about feel — heavy and lazy, or floaty and chaotic.
      </EditorNote>

      <Section label="World">
        <Slider
          label="Gravity"
          hint="Below 1 floats, above 1 slams."
          value={config.gravity}
          min={0}
          max={3}
          step={0.1}
          format={(v) => `${v.toFixed(1)}×`}
          onChange={(v) => update('gravity', v)}
        />
        <Slider
          label="Friction"
          hint="How quickly objects lose momentum sliding along edges."
          value={config.friction}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => update('friction', v)}
        />
        <Slider
          label="Bounciness"
          hint="0 = dead drop, 1 = superball."
          value={config.restitution}
          min={0}
          max={1}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => update('restitution', v)}
        />
        <SwitchRow
          label="Walls"
          hint="Keep objects inside the frame instead of letting them tumble out the sides."
          value={config.enableWalls}
          onChange={(v) => update('enableWalls', v)}
        />
      </Section>

      <Section label="Objects">
        <Slider
          label="Lifetime"
          hint="Objects pop after this long so the scene never clogs."
          value={config.particleLifeSec}
          min={2}
          max={60}
          unit="s"
          onChange={(v) => update('particleLifeSec', v)}
        />
        <NumberRow
          label="Max objects"
          hint="Oldest objects pop early when the cap is hit."
          value={config.maxObjects}
          min={5}
          max={200}
          onChange={(v) => update('maxObjects', v)}
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
