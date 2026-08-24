import { useMemo } from 'react'
import {
  DEFAULT_TEXT_WIDGET_CONFIG,
  type TextWidgetConfig,
  type Widget
} from '../../../../../shared/widgets'
import {
  ColorRow,
  EditorNote,
  NumberRow,
  PercentSlider,
  Section,
  SegmentedRow,
  Slider,
  SwitchRow,
  TextAreaRow
} from './Shared'
import { DesignSystemSection } from './DesignSystemSection'

export function TextWidgetConfigEditor({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const config = useMemo<TextWidgetConfig>(
    () => ({ ...DEFAULT_TEXT_WIDGET_CONFIG, ...(draft.config as Partial<TextWidgetConfig>) }),
    [draft.config]
  )

  const update = <K extends keyof TextWidgetConfig>(key: K, value: TextWidgetConfig[K]) => {
    onChange({ ...draft, config: { ...config, [key]: value } })
  }

  return (
    <div className="flex flex-col gap-8">
      <Section label="Text" description="Changes appear in the preview while you type. Line breaks are preserved.">
        <TextAreaRow
          label="Content"
          value={config.text}
          placeholder="Type something for your scene…"
          rows={5}
          onChange={(v) => update('text', v)}
        />
        <SegmentedRow
          label="Letter case"
          value={config.textTransform}
          options={[
            { value: 'none', label: 'As typed' },
            { value: 'uppercase', label: 'Uppercase' },
            { value: 'lowercase', label: 'Lowercase' }
          ]}
          onChange={(v) => update('textTransform', v)}
        />
      </Section>

      <Section label="Typography">
        <Slider label="Font size" value={config.fontSize} min={8} max={300} step={2} unit="px" onChange={(v) => update('fontSize', v)} />
        <Slider label="Font weight" value={config.fontWeight} min={100} max={900} step={100} onChange={(v) => update('fontWeight', v)} />
        <SegmentedRow
          label="Style"
          value={config.fontStyle}
          options={[
            { value: 'normal', label: 'Normal' },
            { value: 'italic', label: 'Italic' }
          ]}
          onChange={(v) => update('fontStyle', v)}
        />
        <Slider label="Letter spacing" value={config.letterSpacing} min={-10} max={40} step={0.5} unit="px" onChange={(v) => update('letterSpacing', v)} />
        <Slider label="Line height" value={config.lineHeight} min={0.7} max={2.5} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => update('lineHeight', v)} />
        <ColorRow label="Text color" value={config.textColor} onChange={(v) => update('textColor', v)} />
      </Section>

      <Section label="Placement">
        <SegmentedRow
          label="Horizontal"
          value={config.textAlign}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'center', label: 'Center' },
            { value: 'right', label: 'Right' }
          ]}
          onChange={(v) => update('textAlign', v)}
        />
        <SegmentedRow
          label="Vertical"
          value={config.verticalAlign}
          options={[
            { value: 'top', label: 'Top' },
            { value: 'middle', label: 'Middle' },
            { value: 'bottom', label: 'Bottom' }
          ]}
          onChange={(v) => update('verticalAlign', v)}
        />
      </Section>

      <Section label="Outline & shadow">
        <Slider label="Outline width" value={config.outlineWidth} min={0} max={12} step={0.5} unit="px" onChange={(v) => update('outlineWidth', v)} />
        {config.outlineWidth > 0 && (
          <ColorRow label="Outline color" value={config.outlineColor} onChange={(v) => update('outlineColor', v)} />
        )}
        <ColorRow label="Shadow color" value={config.shadowColor} onChange={(v) => update('shadowColor', v)} />
        <PercentSlider label="Shadow opacity" value={config.shadowOpacity} onChange={(v) => update('shadowOpacity', v)} />
        <Slider label="Shadow blur" value={config.shadowBlur} min={0} max={80} unit="px" onChange={(v) => update('shadowBlur', v)} />
        <Slider label="Shadow X" value={config.shadowOffsetX} min={-40} max={40} unit="px" onChange={(v) => update('shadowOffsetX', v)} />
        <Slider label="Shadow Y" value={config.shadowOffsetY} min={-40} max={40} unit="px" onChange={(v) => update('shadowOffsetY', v)} />
      </Section>

      <Section label="Background">
        <SwitchRow label="Show text background" value={config.backgroundEnabled} onChange={(v) => update('backgroundEnabled', v)} />
        {config.backgroundEnabled && (
          <>
            <ColorRow label="Background color" value={config.backgroundColor} onChange={(v) => update('backgroundColor', v)} />
            <PercentSlider label="Background opacity" value={config.backgroundOpacity} onChange={(v) => update('backgroundOpacity', v)} />
            <Slider label="Horizontal padding" value={config.paddingHorizontal} min={0} max={120} step={2} unit="px" onChange={(v) => update('paddingHorizontal', v)} />
            <Slider label="Vertical padding" value={config.paddingVertical} min={0} max={120} step={2} unit="px" onChange={(v) => update('paddingVertical', v)} />
          </>
        )}
      </Section>

      <Section label="Canvas" description="Match these dimensions when adding the browser source to OBS. Broadcast Studio uses them for the initial layer size.">
        <NumberRow label="Width" value={config.canvasWidth} min={240} max={1920} step={10} onChange={(v) => update('canvasWidth', v)} />
        <NumberRow label="Height" value={config.canvasHeight} min={80} max={1080} step={10} onChange={(v) => update('canvasHeight', v)} />
        <EditorNote>Resize the source or layer any time; the text reflows inside the available canvas.</EditorNote>
      </Section>

      <DesignSystemSection
        config={config}
        onUpdate={update as (key: string, value: unknown) => void}
        features={{ font: true, radius: config.backgroundEnabled, glass: false, animation: true }}
      />
    </div>
  )
}
