import { useMemo } from 'react'
import {
  DEFAULT_CAMERA_FRAME_CONFIG,
  type CameraFrameConfig,
  type Widget
} from '../../../../../shared/widgets'
import { ColorRow, Field, PercentSlider, Section, SegmentedRow, Slider, SwitchRow } from './Shared'

export function CameraFrameConfigEditor({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const config = useMemo<CameraFrameConfig>(
    () => ({ ...DEFAULT_CAMERA_FRAME_CONFIG, ...(draft.config as Partial<CameraFrameConfig>) }),
    [draft.config]
  )

  const update = <K extends keyof CameraFrameConfig>(key: K, value: CameraFrameConfig[K]) => {
    onChange({ ...draft, config: { ...config, [key]: value } })
  }

  const supportsCornerRadius = config.shape === 'rounded'

  return (
    <div className="flex flex-col gap-8">
      <Section
        label="Camera opening"
        description="Place this widget above the camera, then resize its bounds to match. Fixed shapes stay centered and perfectly proportioned."
      >
        <SegmentedRow
          label="Shape"
          value={config.shape}
          columns={4}
          options={[
            { value: 'rectangle', label: 'Rectangle' },
            { value: 'rounded', label: 'Rounded' },
            { value: 'square', label: 'Square' },
            { value: 'circle', label: 'Circle' },
            { value: 'ellipse', label: 'Ellipse' },
            { value: 'pill', label: 'Pill' },
            { value: 'hexagon', label: 'Hexagon' },
            { value: 'diamond', label: 'Diamond' }
          ]}
          onChange={(value) => update('shape', value)}
        />
        <Slider
          label="Frame inset"
          hint="Adds breathing room between the browser-source edge and the frame."
          value={config.frameInset}
          min={0}
          max={120}
          unit="px"
          onChange={(value) => update('frameInset', value)}
        />
        {supportsCornerRadius && (
          <Slider
            label="Corner radius"
            value={config.cornerRadius}
            min={0}
            max={240}
            unit="px"
            onChange={(value) => update('cornerRadius', value)}
          />
        )}
      </Section>

      <Section label="Border" description="Choose a clean base line, a second inset line, or a moving accent segment.">
        <SegmentedRow
          label="Frame style"
          value={config.frameStyle}
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'double', label: 'Double' },
            { value: 'dashed', label: 'Dashed' },
            { value: 'accent', label: 'Accent' }
          ]}
          onChange={(value) => update('frameStyle', value)}
        />
        <SegmentedRow
          label="Line ends"
          value={config.lineCap}
          options={[
            { value: 'round', label: 'Round' },
            { value: 'square', label: 'Square' }
          ]}
          onChange={(value) => update('lineCap', value)}
        />
        <Slider
          label="Main width"
          value={config.borderWidth}
          min={1}
          max={40}
          unit="px"
          onChange={(value) => update('borderWidth', value)}
        />
        {(config.frameStyle === 'double' || config.frameStyle === 'accent' || config.animationStyle === 'orbit') && (
          <Slider
            label="Accent width"
            value={config.secondaryBorderWidth}
            min={1}
            max={24}
            unit="px"
            onChange={(value) => update('secondaryBorderWidth', value)}
          />
        )}
        {config.frameStyle === 'double' && (
          <Slider
            label="Double-line gap"
            value={config.doubleGap}
            min={2}
            max={40}
            unit="px"
            onChange={(value) => update('doubleGap', value)}
          />
        )}
        {(config.frameStyle === 'dashed' || config.animationStyle === 'march') && (
          <>
            <Slider
              label="Dash length"
              value={config.dashLength}
              min={4}
              max={120}
              onChange={(value) => update('dashLength', value)}
            />
            <Slider
              label="Dash gap"
              value={config.dashGap}
              min={2}
              max={120}
              onChange={(value) => update('dashGap', value)}
            />
          </>
        )}
      </Section>

      <Section label="Color and depth">
        <ColorRow label="Primary color" value={config.primaryColor} onChange={(value) => update('primaryColor', value)} />
        <ColorRow label="Accent color" value={config.secondaryColor} onChange={(value) => update('secondaryColor', value)} />
        <PercentSlider label="Frame opacity" value={config.opacity} onChange={(value) => update('opacity', value)} />
        <PercentSlider label="Glow" value={config.glowIntensity} onChange={(value) => update('glowIntensity', value)} />
        <PercentSlider label="Drop shadow" value={config.shadowIntensity} onChange={(value) => update('shadowIntensity', value)} />
      </Section>

      <Section
        label="Outside matte"
        description="Optionally cover the camera outside the opening. Match this color to the surrounding scene, or leave it off for an outline-only overlay."
      >
        <SwitchRow
          label="Fill outside opening"
          value={config.matteEnabled}
          onChange={(value) => update('matteEnabled', value)}
        />
        {config.matteEnabled && (
          <>
            <ColorRow label="Matte color" value={config.matteColor} onChange={(value) => update('matteColor', value)} />
            <PercentSlider label="Matte opacity" value={config.matteOpacity} onChange={(value) => update('matteOpacity', value)} />
          </>
        )}
      </Section>

      <Section label="Details" description="Small accents make the frame recognizable without crowding the camera.">
        <SegmentedRow
          label="Decoration"
          value={config.decorationStyle}
          options={[
            { value: 'none', label: 'None' },
            { value: 'corners', label: 'Corners' },
            { value: 'ticks', label: 'Ticks' },
            { value: 'nodes', label: 'Nodes' }
          ]}
          onChange={(value) => update('decorationStyle', value)}
        />
        {config.decorationStyle !== 'none' && (
          <Slider
            label="Decoration size"
            value={config.decorationSize}
            min={12}
            max={120}
            unit="px"
            onChange={(value) => update('decorationSize', value)}
          />
        )}
        <SwitchRow
          label="Camera label"
          value={config.labelEnabled}
          onChange={(value) => update('labelEnabled', value)}
        />
        {config.labelEnabled && (
          <>
            <Field label="Label text">
              <input
                className="app-input"
                value={config.labelText}
                maxLength={48}
                placeholder="LIVE"
                onChange={(event) => update('labelText', event.currentTarget.value)}
              />
            </Field>
            <SegmentedRow
              label="Label position"
              value={config.labelPosition}
              columns={3}
              options={[
                { value: 'top-left', label: 'Top left' },
                { value: 'top-center', label: 'Top center' },
                { value: 'top-right', label: 'Top right' },
                { value: 'bottom-left', label: 'Bottom left' },
                { value: 'bottom-center', label: 'Bottom center' },
                { value: 'bottom-right', label: 'Bottom right' }
              ]}
              onChange={(value) => update('labelPosition', value)}
            />
            <ColorRow label="Label text" value={config.labelTextColor} onChange={(value) => update('labelTextColor', value)} />
            <ColorRow label="Label background" value={config.labelBackgroundColor} onChange={(value) => update('labelBackgroundColor', value)} />
            <PercentSlider
              label="Label background opacity"
              value={config.labelBackgroundOpacity}
              onChange={(value) => update('labelBackgroundOpacity', value)}
            />
          </>
        )}
      </Section>

      <Section label="Motion and preview">
        <SegmentedRow
          label="Motion"
          value={config.animationStyle}
          options={[
            { value: 'none', label: 'Still' },
            { value: 'march', label: 'March' },
            { value: 'orbit', label: 'Orbit' }
          ]}
          onChange={(value) => update('animationStyle', value)}
        />
        {config.animationStyle !== 'none' && (
          <Slider
            label="Motion speed"
            hint="Lower values move faster."
            value={config.animationSpeed}
            min={1}
            max={30}
            unit="s"
            onChange={(value) => update('animationSpeed', value)}
          />
        )}
        <SwitchRow
          label="Preview camera silhouette"
          hint="Editor-only backdrop that makes the transparent camera window easy to judge."
          value={config.showPreviewBackground}
          onChange={(value) => update('showPreviewBackground', value)}
        />
      </Section>
    </div>
  )
}
