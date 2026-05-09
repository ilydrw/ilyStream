import { useMemo } from 'react'
import {
  DEFAULT_LATEST_GIFTER_CONFIG,
  type LatestGifterConfig,
  type Widget
} from '../../../../../shared/widgets'
import { Section, Field, ColorRow, SwitchRow } from './Shared'

export function LatestGifterConfigEditor({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const config = useMemo<LatestGifterConfig>(
    () => ({ ...DEFAULT_LATEST_GIFTER_CONFIG, ...(draft.config as Partial<LatestGifterConfig>) }),
    [draft.config]
  )

  const update = <K extends keyof LatestGifterConfig>(key: K, value: LatestGifterConfig[K]) => {
    onChange({ ...draft, config: { ...config, [key]: value } })
  }

  return (
    <div className="flex flex-col gap-8">
      <Section label="Content">
        <Field label="Label Text">
          <input
            type="text"
            value={config.label}
            onChange={(e) => update('label', e.target.value)}
            className="app-input !h-10 !px-4"
            placeholder="LATEST GIFTER"
          />
        </Field>
        
        <SwitchRow
          label="Show amount & gift name"
          value={config.showAmount}
          onChange={(v) => update('showAmount', v)}
        />
      </Section>

      <Section label="Appearance">
        <div className="grid grid-cols-2 gap-4">
          <ColorRow label="Primary" value={config.primaryColor} onChange={(v) => update('primaryColor', v)} />
          <ColorRow label="Secondary" value={config.secondaryColor} onChange={(v) => update('secondaryColor', v)} />
        </div>
        <ColorRow label="Text" value={config.textColor} onChange={(v) => update('textColor', v)} />
        
        <Field label={`Scale — ${Math.round(config.scale * 100)}%`}>
          <input
            type="range"
            min={0.5}
            max={2.0}
            step={0.1}
            value={config.scale}
            onChange={(e) => update('scale', parseFloat(e.target.value))}
            className="w-full accent-white"
          />
        </Field>

        <Field label={`Opacity — ${Math.round(config.opacity * 100)}%`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={config.opacity}
            onChange={(e) => update('opacity', parseFloat(e.target.value))}
            className="w-full accent-white"
          />
        </Field>
      </Section>

      <Section label="Layout & TikTok">
        <Field label="Aspect ratio" hint="TikTok uses Vertical (9:16). Auto fills the entire area.">
          <div className="grid grid-cols-3 gap-2">
            {(['auto', 'tiktok', 'landscape'] as const).map((r) => (
              <button
                key={r}
                onClick={() => update('aspectRatio', r)}
                className={`h-9 rounded-lg text-[10px] font-bold border transition-all ${
                  config.aspectRatio === r
                    ? 'bg-white text-black border-white'
                    : 'bg-white/[0.03] text-white/60 border-white/10 hover:border-white/20'
                }`}
              >
                {r === 'auto' ? 'Auto (Fill)' : r === 'tiktok' ? 'Vertical (9:16)' : 'Landscape (16:9)'}
              </button>
            ))}
          </div>
        </Field>

        <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10">
          <div>
            <div className="text-xs font-bold text-white uppercase tracking-wider mb-0.5">Force TikTok Dimensions</div>
            <div className="text-[10px] text-white/40">Locks resolution to 1080x1920 for TikTok Live Studio "Fit to Screen"</div>
          </div>
          <button
            onClick={() => update('forceTikTokDimensions', !config.forceTikTokDimensions)}
            className={`w-10 h-5 rounded-full transition-colors relative ${config.forceTikTokDimensions ? 'bg-indigo-500' : 'bg-white/10'}`}
          >
            <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${config.forceTikTokDimensions ? 'left-6' : 'left-1'}`} />
          </button>
        </div>
      </Section>
    </div>
  )
}
