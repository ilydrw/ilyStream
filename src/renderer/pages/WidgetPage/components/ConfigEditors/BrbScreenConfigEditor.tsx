import { useMemo } from 'react'
import {
  DEFAULT_BRB_SCREEN_CONFIG,
  type BrbScreenConfig,
  type Widget
} from '../../../../../shared/widgets'
import {
  ColorRow,
  EditorNote,
  NumberRow,
  PercentSlider,
  PositionGrid,
  Section,
  SegmentedRow,
  Slider,
  SwitchRow,
  TextRow
} from './Shared'
import { DesignSystemSection } from './DesignSystemSection'

const CONTENT_POSITIONS: readonly BrbScreenConfig['contentPosition'][] = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'middle-center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right'
]

export function BrbScreenConfigEditor({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const config = useMemo<BrbScreenConfig>(
    () => ({ ...DEFAULT_BRB_SCREEN_CONFIG, ...(draft.config as Partial<BrbScreenConfig>) }),
    [draft.config]
  )

  const update = <K extends keyof BrbScreenConfig>(key: K, value: BrbScreenConfig[K]) => {
    onChange({ ...draft, config: { ...config, [key]: value } })
  }

  return (
    <div className="flex flex-col gap-8">
      <Section label="Message" description="Every line can be hidden independently for anything from a sparse pause card to a full status screen.">
        <SwitchRow label="Show status label" value={config.showEyebrow} onChange={(v) => update('showEyebrow', v)} />
        {config.showEyebrow && (
          <TextRow label="Status label" value={config.eyebrow} placeholder="Stream paused" onChange={(v) => update('eyebrow', v)} />
        )}
        <TextRow label="Headline" value={config.title} placeholder="Be right back" onChange={(v) => update('title', v)} />
        <SwitchRow label="Show message" value={config.showMessage} onChange={(v) => update('showMessage', v)} />
        {config.showMessage && (
          <TextRow label="Message" value={config.message} placeholder="Taking a quick break…" onChange={(v) => update('message', v)} />
        )}
        <SwitchRow label="Show footer" value={config.showFooter} onChange={(v) => update('showFooter', v)} />
        {config.showFooter && (
          <TextRow label="Footer" value={config.footerText} placeholder="Thanks for hanging out." onChange={(v) => update('footerText', v)} />
        )}
      </Section>

      <Section label="Time & countdown">
        <SwitchRow label="Show local time" value={config.showLocalTime} onChange={(v) => update('showLocalTime', v)} />
        {config.showLocalTime && (
          <SegmentedRow
            label="Clock format"
            value={config.clockFormat}
            options={[
              { value: '12-hour', label: '12 hour' },
              { value: '24-hour', label: '24 hour' }
            ]}
            onChange={(v) => update('clockFormat', v)}
          />
        )}
        <SwitchRow
          label="Show countdown"
          hint="Starts when the browser source loads or reloads."
          value={config.countdownEnabled}
          onChange={(v) => update('countdownEnabled', v)}
        />
        {config.countdownEnabled && (
          <>
            <NumberRow label="Minutes" value={config.countdownMinutes} min={0.5} max={180} step={0.5} onChange={(v) => update('countdownMinutes', v)} />
            <TextRow label="Countdown label" value={config.countdownLabel} placeholder="Back in" onChange={(v) => update('countdownLabel', v)} />
            <TextRow label="Finished text" value={config.countdownCompleteText} placeholder="Any moment now" onChange={(v) => update('countdownCompleteText', v)} />
            <SwitchRow label="Show progress line" value={config.showCountdownProgress} onChange={(v) => update('showCountdownProgress', v)} />
          </>
        )}
      </Section>

      <Section label="Layout">
        <PositionGrid
          label="Content position"
          value={config.contentPosition}
          allowed={CONTENT_POSITIONS}
          onChange={(v) => update('contentPosition', v)}
        />
        <SegmentedRow
          label="Text alignment"
          value={config.textAlign}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'center', label: 'Center' },
            { value: 'right', label: 'Right' }
          ]}
          onChange={(v) => update('textAlign', v)}
        />
        <Slider label="Content width" value={config.contentWidth} min={320} max={1500} step={20} unit="px" onChange={(v) => update('contentWidth', v)} />
        <Slider label="Headline size" value={config.titleSize} min={42} max={180} step={2} unit="px" onChange={(v) => update('titleSize', v)} />
        <PercentSlider label="Overall scale" value={config.scale} min={0.5} max={1.5} step={0.05} onChange={(v) => update('scale', v)} />
      </Section>

      <Section label="Background">
        <ColorRow label="Background" value={config.backgroundColor} onChange={(v) => update('backgroundColor', v)} />
        <PercentSlider label="Background opacity" value={config.backgroundOpacity} onChange={(v) => update('backgroundOpacity', v)} />
        <TextRow
          label="Background image URL"
          hint="Optional. Use an HTTPS image URL or an ilyStream-served /overlay path. Leave blank for the clean solid background."
          value={config.backgroundImageUrl}
          placeholder="https://…"
          onChange={(v) => update('backgroundImageUrl', v)}
        />
        {config.backgroundImageUrl.trim() && (
          <>
            <PercentSlider label="Image opacity" value={config.backgroundImageOpacity} onChange={(v) => update('backgroundImageOpacity', v)} />
            <Slider label="Image blur" value={config.backgroundImageBlur} min={0} max={40} step={1} unit="px" onChange={(v) => update('backgroundImageBlur', v)} />
            <SegmentedRow
              label="Image fit"
              value={config.backgroundImageFit}
              options={[
                { value: 'cover', label: 'Cover' },
                { value: 'contain', label: 'Contain' }
              ]}
              onChange={(v) => update('backgroundImageFit', v)}
            />
          </>
        )}
      </Section>

      <Section label="Accent artwork" description="A restrained background detail keeps the screen recognizable without competing with the message.">
        <ColorRow label="Primary accent" value={config.accentColor} onChange={(v) => update('accentColor', v)} />
        <ColorRow label="Secondary accent" value={config.secondaryColor} onChange={(v) => update('secondaryColor', v)} />
        <ColorRow label="Main text" value={config.textColor} onChange={(v) => update('textColor', v)} />
        <ColorRow label="Muted text" value={config.mutedTextColor} onChange={(v) => update('mutedTextColor', v)} />
        <SegmentedRow
          label="Decoration"
          value={config.decorationStyle}
          options={[
            { value: 'orbit', label: 'Orbit' },
            { value: 'lines', label: 'Lines' },
            { value: 'dots', label: 'Dots' },
            { value: 'none', label: 'None' }
          ]}
          onChange={(v) => update('decorationStyle', v)}
        />
        {config.decorationStyle !== 'none' && (
          <>
            <SegmentedRow
              label="Motion"
              value={config.decorationMotion}
              options={[
                { value: 'rotate', label: 'Rotate' },
                { value: 'float', label: 'Float' },
                { value: 'still', label: 'Still' }
              ]}
              onChange={(v) => update('decorationMotion', v)}
            />
            {config.decorationMotion !== 'still' && (
              <Slider label="Motion speed" value={config.decorationSpeed} min={4} max={60} step={1} unit="s" onChange={(v) => update('decorationSpeed', v)} />
            )}
            <PercentSlider label="Decoration opacity" value={config.decorationOpacity} onChange={(v) => update('decorationOpacity', v)} />
          </>
        )}
      </Section>

      <Section label="Content panel">
        <SwitchRow
          label="Show panel"
          hint="Adds a focused glass card behind the copy; leave off for the most minimal look."
          value={config.panelEnabled}
          onChange={(v) => update('panelEnabled', v)}
        />
        {config.panelEnabled && (
          <>
            <ColorRow label="Panel color" value={config.panelColor} onChange={(v) => update('panelColor', v)} />
            <PercentSlider label="Panel opacity" value={config.panelOpacity} onChange={(v) => update('panelOpacity', v)} />
            <Slider label="Backdrop blur" value={config.panelBlur} min={0} max={40} unit="px" onChange={(v) => update('panelBlur', v)} />
            <SwitchRow label="Show subtle border" value={config.showPanelBorder} onChange={(v) => update('showPanelBorder', v)} />
          </>
        )}
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
          <SwitchRow label="Force TikTok dimensions" value={config.forceTikTokDimensions} onChange={(v) => update('forceTikTokDimensions', v)} />
        )}
        <EditorNote>For a full BRB scene, set the browser source to the same dimensions as your OBS or TikTok canvas.</EditorNote>
      </Section>

      <DesignSystemSection
        config={config}
        onUpdate={update as (key: string, value: unknown) => void}
        features={{ font: true, radius: config.panelEnabled, glass: false, animation: true }}
      />
    </div>
  )
}
