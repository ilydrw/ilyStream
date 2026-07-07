import { useMemo } from 'react'
import {
  DEFAULT_PARTICLE_CONFIG,
  type ParticleConfig,
  type Widget
} from '../../../../../shared/widgets'
import { Section, Slider, PercentSlider, SwitchRow, ColorRow, TextRow } from './Shared'
import { DesignSystemSection } from './DesignSystemSection'

export function ParticleConfigEditor({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const config = useMemo<ParticleConfig>(
    () => ({ ...DEFAULT_PARTICLE_CONFIG, ...(draft.config as Partial<ParticleConfig>) }),
    [draft.config]
  )

  const update = <K extends keyof ParticleConfig>(key: K, value: ParticleConfig[K]) => {
    onChange({ ...draft, config: { ...config, [key]: value } })
  }

  return (
    <div className="flex flex-col gap-8">
      <Section label="Behavior">
        <SwitchRow
          label="Event driven"
          hint="Bursts on follows, gifts, and subs. Off = a constant ambient stream."
          value={config.eventDriven}
          onChange={(v) => update('eventDriven', v)}
        />
        <Slider
          label="Particle count"
          hint={config.eventDriven ? 'Per burst.' : 'On screen at once.'}
          value={config.count}
          min={5}
          max={200}
          step={5}
          onChange={(v) => update('count', v)}
        />
        <Slider
          label="Speed"
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

      <Section label="Look">
        <ColorRow label="Primary" value={config.primaryColor} onChange={(v) => update('primaryColor', v)} />
        <ColorRow label="Secondary" value={config.secondaryColor} onChange={(v) => update('secondaryColor', v)} />
        <TextRow
          label="Floating text"
          hint="Rises with the particles — leave empty for none."
          value={config.text}
          placeholder="+1"
          onChange={(v) => update('text', v)}
        />
        {config.text.trim().length > 0 && (
          <ColorRow label="Text color" value={config.textColor} onChange={(v) => update('textColor', v)} />
        )}
      </Section>

      <Section label="Audio reactive" description="Particles pulse with your stream audio.">
        <SwitchRow
          label="React to audio"
          value={config.audioReactive === true}
          onChange={(v) => update('audioReactive', v)}
        />
        {config.audioReactive && (
          <PercentSlider
            label="Trigger threshold"
            hint="Lower fires on quiet sounds; higher waits for peaks."
            value={config.audioThreshold ?? 0.5}
            step={0.05}
            onChange={(v) => update('audioThreshold', v)}
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
