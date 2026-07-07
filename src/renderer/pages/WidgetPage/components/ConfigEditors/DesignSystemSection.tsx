import { Section, SegmentedRow, Slider, TextRow, NumberRow, PercentSlider } from './Shared'

interface DesignSystemConfig {
  fontFamily?: string
  borderRadius?: number
  glassIntensity?: number
  animationStyle?: string
  animationDuration?: number
}

export interface DesignSystemFeatures {
  font?: boolean
  radius?: boolean
  glass?: boolean
  animation?: boolean
}

const ANIMATION_OPTIONS = [
  { value: 'fade', label: 'Fade' },
  { value: 'slide', label: 'Slide' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'none', label: 'None' }
]

/**
 * Cross-widget design controls. Pass `features` to show ONLY the knobs this
 * widget's overlay template actually honors — a control that silently does
 * nothing is worse than no control.
 */
export function DesignSystemSection({
  config,
  onUpdate,
  features
}: {
  config: DesignSystemConfig
  onUpdate: (key: string, value: unknown) => void
  features?: DesignSystemFeatures
}) {
  const show: Required<DesignSystemFeatures> = {
    font: features?.font ?? true,
    radius: features?.radius ?? true,
    glass: features?.glass ?? true,
    animation: features?.animation ?? true
  }

  const showAnimation = show.animation && config.animationStyle !== undefined
  if (!show.font && !show.radius && !show.glass && !showAnimation) return null

  return (
    <Section label="Design">
      {show.font && (
        <TextRow
          label="Font family"
          hint="Any Google Font name (Inter, Outfit, Space Grotesk…). Loaded automatically."
          value={config.fontFamily || 'Inter'}
          placeholder="Inter"
          onChange={(v) => onUpdate('fontFamily', v)}
        />
      )}

      {show.radius && (
        <NumberRow
          label="Corner radius"
          hint="Rounding of card corners, in pixels."
          value={config.borderRadius ?? 12}
          min={0}
          max={50}
          onChange={(v) => onUpdate('borderRadius', v)}
        />
      )}

      {show.glass && (
        <PercentSlider
          label="Glass intensity"
          hint="How frosted the card background looks — blends transparency and blur."
          value={config.glassIntensity ?? 0.5}
          step={0.1}
          onChange={(v) => onUpdate('glassIntensity', v)}
        />
      )}

      {showAnimation && (
        <>
          <SegmentedRow
            label="Entrance animation"
            value={config.animationStyle || 'fade'}
            options={ANIMATION_OPTIONS}
            onChange={(v) => onUpdate('animationStyle', v)}
          />
          {config.animationStyle !== 'none' && (
            <Slider
              label="Animation duration"
              value={config.animationDuration ?? 800}
              min={200}
              max={2000}
              step={50}
              unit="ms"
              onChange={(v) => onUpdate('animationDuration', v)}
            />
          )}
        </>
      )}
    </Section>
  )
}
