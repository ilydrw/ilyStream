import { useMemo } from 'react'
import {
  DEFAULT_DISCORD_CALL_CONFIG,
  type DiscordCallWidgetConfig,
  type Widget
} from '../../../../../shared/widgets'
import { ColorRow, PercentSlider, Section, SegmentedRow, Slider, SwitchRow, TextRow } from './Shared'
import { DesignSystemSection } from './DesignSystemSection'

export function DiscordCallConfigEditor({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const config = useMemo<DiscordCallWidgetConfig>(
    () => ({ ...DEFAULT_DISCORD_CALL_CONFIG, ...(draft.config as Partial<DiscordCallWidgetConfig>) }),
    [draft.config]
  )

  const update = <K extends keyof DiscordCallWidgetConfig>(key: K, value: DiscordCallWidgetConfig[K]) => {
    onChange({ ...draft, config: { ...config, [key]: value } })
  }

  return (
    <div className="flex flex-col gap-7">
      <Section label="Call content" description="Live membership and speaking state come from the Discord desktop app.">
        <TextRow label="Widget title" value={config.title} onChange={(value) => update('title', value)} />
        <SwitchRow label="Show header" value={config.showHeader} onChange={(value) => update('showHeader', value)} />
        <SwitchRow label="Show voice channel" value={config.showChannelName} onChange={(value) => update('showChannelName', value)} />
        <SwitchRow label="Show participant names" value={config.showNames} onChange={(value) => update('showNames', value)} />
        <SwitchRow label="Show mute and deafen icons" value={config.showStatusIcons} onChange={(value) => update('showStatusIcons', value)} />
        <SwitchRow label="Show disconnected state" hint="Turn off for a completely hidden widget while Discord is disconnected or no call is active." value={config.showOfflineState} onChange={(value) => update('showOfflineState', value)} />
        <SwitchRow label="Use linked profile names" hint="Uses the ilyStream profile name and picture when this Discord account is linked from the Discord page." value={config.useLinkedProfileNames} onChange={(value) => update('useLinkedProfileNames', value)} />
      </Section>

      <Section label="Overall size" description="Sets the widget's actual footprint inside its browser source.">
        <Slider label="Widget width" value={config.panelWidth} min={240} max={1200} step={10} unit="px" onChange={(value) => update('panelWidth', value)} />
        <Slider label="Maximum height" hint="The participant list scrolls when it grows beyond this height." value={config.panelMaxHeight} min={140} max={900} step={10} unit="px" onChange={(value) => update('panelMaxHeight', value)} />
        <Slider label="Outside padding" value={config.outerPadding} min={0} max={40} unit="px" onChange={(value) => update('outerPadding', value)} />
        <Slider label="Overall scale" value={config.scale} min={0.25} max={2} step={0.05} format={(value) => `${Math.round(value * 100)}%`} onChange={(value) => update('scale', value)} />
      </Section>

      <Section label="Layout">
        <SegmentedRow
          label="Participant layout"
          value={config.layout}
          options={[
            { value: 'grid', label: 'Grid' },
            { value: 'speaker', label: 'Active speaker' },
            { value: 'row', label: 'Single row' }
          ]}
          onChange={(value) => update('layout', value)}
        />
        <Slider label="Maximum people" value={config.maxParticipants} min={1} max={25} onChange={(value) => update('maxParticipants', value)} />
        <Slider label="Avatar size" value={config.avatarSize} min={40} max={160} unit="px" onChange={(value) => update('avatarSize', value)} />
        <SegmentedRow
          label="Avatar shape"
          value={config.avatarShape}
          options={[
            { value: 'circle', label: 'Circle' },
            { value: 'rounded', label: 'Rounded' },
            { value: 'square', label: 'Square' }
          ]}
          onChange={(value) => update('avatarShape', value)}
        />
        <Slider label="Card spacing" value={config.cardGap} min={4} max={40} unit="px" onChange={(value) => update('cardGap', value)} />
        <Slider label="Card padding" value={config.cardPadding} min={6} max={32} unit="px" onChange={(value) => update('cardPadding', value)} />
      </Section>

      <Section label="Speaking style">
        <SwitchRow label="Speaking glow" value={config.showSpeakingGlow} onChange={(value) => update('showSpeakingGlow', value)} />
        <ColorRow label="Speaking" value={config.speakingColor} onChange={(value) => update('speakingColor', value)} />
        <ColorRow label="Discord accent" value={config.accentColor} onChange={(value) => update('accentColor', value)} />
        <ColorRow label="Mute and deafen" value={config.mutedColor} onChange={(value) => update('mutedColor', value)} />
      </Section>

      <Section label="Panel">
        <ColorRow label="Background" value={config.backgroundColor} onChange={(value) => update('backgroundColor', value)} />
        <ColorRow label="Text" value={config.textColor} onChange={(value) => update('textColor', value)} />
        <PercentSlider label="Background opacity" value={config.backgroundOpacity} onChange={(value) => update('backgroundOpacity', value)} />
        <PercentSlider label="Widget opacity" value={config.opacity} min={0.1} onChange={(value) => update('opacity', value)} />
      </Section>

      <DesignSystemSection config={config} onUpdate={update as (key: string, value: unknown) => void} />
    </div>
  )
}
