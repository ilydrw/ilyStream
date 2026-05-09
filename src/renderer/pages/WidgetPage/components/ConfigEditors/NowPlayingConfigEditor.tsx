import { useMemo } from 'react'
import {
  DEFAULT_NOW_PLAYING_CONFIG,
  type NowPlayingConfig,
  type Widget
} from '../../../../../shared/widgets'
import { NumberInput } from '../../../../components/ui/Inputs'
import { Section, Field, SwitchRow, ColorRow } from './Shared'

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
    <div className="flex flex-col gap-6">
      <Section label="Layout">
        <Field label="Mode" hint="Compact hides the artist line.">
          <div className="grid grid-cols-2 gap-2">
            {(['wide', 'compact'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => update('layout', mode)}
                className={`h-10 rounded-lg text-xs font-bold border transition-all ${
                  config.layout === mode
                    ? 'bg-white text-black border-white'
                    : 'bg-white/[0.03] text-white/60 border-white/10 hover:border-white/20'
                }`}
              >
                {mode === 'wide' ? 'Wide' : 'Compact'}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Anchor position">
          <div className="grid grid-cols-3 gap-2">
            {(['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'] as const).map((pos) => (
              <button
                key={pos}
                onClick={() => update('position', pos)}
                className={`h-10 rounded-lg text-[10px] font-bold border transition-all ${
                  config.position === pos
                    ? 'bg-white text-black border-white'
                    : 'bg-white/[0.03] text-white/60 border-white/10 hover:border-white/20'
                }`}
              >
                {pos.replace('-', ' ')}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Title font size">
          <NumberInput
            value={config.fontSize}
            onChange={(v) => update('fontSize', v)}
            min={12}
            max={48}
            className="!w-24 !h-9 !text-xs text-right"
          />
        </Field>

        <Field label="Widget width (px)">
          <NumberInput
            value={config.width}
            onChange={(v) => update('width', v)}
            min={240}
            max={800}
            step={10}
            className="!w-24 !h-9 !text-xs text-right"
          />
        </Field>
      </Section>

      <Section label="Show / Hide">
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
          label="Requester credit"
          hint="Shows the chat user who used !play."
          value={config.showRequester}
          onChange={(v) => update('showRequester', v)}
        />
        <SwitchRow
          label="Hide when nothing playing"
          value={config.hideWhenIdle}
          onChange={(v) => update('hideWhenIdle', v)}
        />
        <SwitchRow
          label="Show queue"
          hint="Displays upcoming songs below the track."
          value={config.showQueue}
          onChange={(v) => update('showQueue', v)}
        />
        {config.showQueue && (
          <Field label="Max queue items">
            <NumberInput
              value={config.maxQueueItems}
              onChange={(v) => update('maxQueueItems', v)}
              min={1}
              max={10}
              className="!w-24 !h-9 !text-xs text-right"
            />
          </Field>
        )}
      </Section>

      <Section label="Borders">
        <SwitchRow
          label="Show border"
          value={config.showBorder}
          onChange={(v) => update('showBorder', v)}
        />
        {config.showBorder && (
          <>
            <Field label="Border Type">
              <div className="grid grid-cols-3 gap-2">
                {(['solid', 'chroma', 'cyber'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => update('borderType', type)}
                    className={`h-9 rounded-lg text-[10px] font-bold border transition-all ${
                      config.borderType === type
                        ? 'bg-white text-black border-white'
                        : 'bg-white/[0.03] text-white/60 border-white/10 hover:border-white/20'
                    }`}
                  >
                    {type.toUpperCase()}
                  </button>
                ))}
              </div>
            </Field>

            {config.borderType === 'solid' && (
              <ColorRow
                label="Border Color"
                value={config.borderColor}
                onChange={(v) => update('borderColor', v)}
              />
            )}

            <Field label="Border Width">
              <NumberInput
                value={config.borderWidth}
                onChange={(v) => update('borderWidth', v)}
                min={1}
                max={10}
                className="!w-24 !h-9 !text-xs text-right"
              />
            </Field>
          </>
        )}
      </Section>

      <Section label="Colors">
        <ColorRow label="Accent" value={config.accentColor} onChange={(v) => update('accentColor', v)} />
        <ColorRow
          label="Background"
          value={config.backgroundColor}
          onChange={(v) => update('backgroundColor', v)}
        />
        <ColorRow label="Text" value={config.textColor} onChange={(v) => update('textColor', v)} />

        <Field label={`Background opacity — ${Math.round(config.backgroundOpacity * 100)}%`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={config.backgroundOpacity}
            onChange={(e) => update('backgroundOpacity', Number(e.currentTarget.value))}
            className="w-full accent-white"
          />
        </Field>
      </Section>
    </div>
  )
}
