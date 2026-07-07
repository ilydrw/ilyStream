import { useMemo } from 'react'
import {
  DEFAULT_NOW_PLAYING_CONFIG,
  type NowPlayingConfig,
  type Widget
} from '../../../../../shared/widgets'
import {
  Section,
  Slider,
  PercentSlider,
  PositionGrid,
  SwitchRow,
  ColorRow,
  NumberRow,
  SegmentedRow
} from './Shared'
import { DesignSystemSection } from './DesignSystemSection'

const POSITIONS = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right'
] as const

export function NowPlayingConfigEditor({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const config = useMemo<NowPlayingConfig>(
    () => ({ ...DEFAULT_NOW_PLAYING_CONFIG, ...(draft.config as Partial<NowPlayingConfig>) }),
    [draft.config]
  )

  const update = <K extends keyof NowPlayingConfig>(key: K, value: NowPlayingConfig[K]) => {
    onChange({ ...draft, config: { ...config, [key]: value } })
  }

  return (
    <div className="flex flex-col gap-8">
      <Section label="Content" description="Fed live by Spotify — track, art, progress, and the song-request queue.">
        <SwitchRow
          label="Album art"
          value={config.showAlbumArt}
          onChange={(v) => update('showAlbumArt', v)}
        />
        <SwitchRow
          label="Progress bar"
          value={config.showProgressBar}
          onChange={(v) => update('showProgressBar', v)}
        />
        <SwitchRow
          label="Requested by"
          hint="Credits the viewer whose song request is playing."
          value={config.showRequester}
          onChange={(v) => update('showRequester', v)}
        />
        <SwitchRow
          label="Up next queue"
          hint="Shows pending song requests under the current track."
          value={config.showQueue}
          onChange={(v) => update('showQueue', v)}
        />
        {config.showQueue && (
          <NumberRow
            label="Queue items"
            value={config.maxQueueItems}
            min={1}
            max={10}
            onChange={(v) => update('maxQueueItems', v)}
          />
        )}
        <SwitchRow
          label="Hide when nothing plays"
          hint="The card fades out between tracks instead of sitting empty."
          value={config.hideWhenIdle}
          onChange={(v) => update('hideWhenIdle', v)}
        />
      </Section>

      <Section label="Placement">
        <PositionGrid
          label="Anchor"
          value={config.position}
          allowed={POSITIONS}
          onChange={(v) => update('position', v)}
        />
        <Slider
          label="Card width"
          value={config.width}
          min={240}
          max={720}
          step={10}
          unit="px"
          onChange={(v) => update('width', v)}
        />
        <Slider
          label="Title size"
          value={config.fontSize}
          min={10}
          max={32}
          unit="px"
          onChange={(v) => update('fontSize', v)}
        />
      </Section>

      <Section label="Colors">
        <ColorRow label="Accent" hint="Progress bar and queue markers." value={config.accentColor} onChange={(v) => update('accentColor', v)} />
        <ColorRow label="Text" value={config.textColor} onChange={(v) => update('textColor', v)} />
        <ColorRow label="Background" value={config.backgroundColor} onChange={(v) => update('backgroundColor', v)} />
        <PercentSlider
          label="Background opacity"
          value={config.backgroundOpacity}
          onChange={(v) => update('backgroundOpacity', v)}
        />
      </Section>

      <Section label="Border">
        <SwitchRow
          label="Show border"
          value={config.showBorder}
          onChange={(v) => update('showBorder', v)}
        />
        {config.showBorder && (
          <>
            <SegmentedRow
              label="Border style"
              value={config.borderType}
              options={[
                { value: 'solid', label: 'Solid' },
                { value: 'chroma', label: 'Chroma' },
                { value: 'cyber', label: 'Cyber' },
                { value: 'gob-the-stopper', label: 'Gob' }
              ]}
              onChange={(v) => update('borderType', v)}
            />
            <Slider
              label="Border width"
              value={config.borderWidth}
              min={1}
              max={12}
              unit="px"
              onChange={(v) => update('borderWidth', v)}
            />
            {config.borderType === 'solid' && (
              <ColorRow label="Border color" value={config.borderColor} onChange={(v) => update('borderColor', v)} />
            )}
          </>
        )}
      </Section>

      <DesignSystemSection
        config={config}
        onUpdate={update as (key: string, value: unknown) => void}
        features={{ font: true, radius: true, glass: true, animation: true }}
      />
    </div>
  )
}
