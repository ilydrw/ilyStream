import { useMemo } from 'react'
import {
  DEFAULT_BORDER_CONFIG,
  type BorderConfig,
  type Widget
} from '../../../../../shared/widgets'
import { NumberInput } from '../../../../components/ui/Inputs'
import { Section, Field, ColorRow } from './Shared'

export function BorderConfigEditor({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const config = useMemo<BorderConfig>(
    () => ({ ...DEFAULT_BORDER_CONFIG, ...(draft.config as Partial<BorderConfig>) }),
    [draft.config]
  )

  const update = <K extends keyof BorderConfig>(key: K, value: BorderConfig[K]) => {
    onChange({ ...draft, config: { ...config, [key]: value } })
  }

  return (
    <div className="flex flex-col gap-8">
      <Section label="Colors">
        <Field label="Theme">
          <div className="grid grid-cols-3 gap-2">
            {(['classic', 'chroma', 'cyber'] as const).map((s) => (
              <button
                key={s}
                onClick={() => update('style', s)}
                className={`h-9 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${
                  config.style === s
                    ? 'bg-white text-black border-white'
                    : 'bg-white/[0.03] text-white/60 border-white/10 hover:border-white/20'
                }`}
              >
                {s.replace('-', ' ')}
              </button>
            ))}
          </div>
        </Field>

        <ColorRow label="Primary" value={config.color1} onChange={(v) => update('color1', v)} />
        <ColorRow label="Secondary" value={config.color2} onChange={(v) => update('color2', v)} />

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

      <Section label="Dimensions">
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

        <Field label="Corner radius (px)">
          <NumberInput
            value={config.borderRadius}
            onChange={(v) => update('borderRadius', v)}
            min={0}
            max={200}
            className="!w-24 !h-9 !text-xs text-right"
          />
        </Field>
      </Section>

      <Section label="Size & Glow">
        <Field label="Thickness (px)">
          <NumberInput
            value={config.thickness}
            onChange={(v) => update('thickness', v)}
            min={1}
            max={50}
            className="!w-24 !h-9 !text-xs text-right"
          />
        </Field>

        <Field label="Glow intensity">
          <input
            type="range"
            min={0}
            max={5}
            step={0.1}
            value={config.glowIntensity}
            onChange={(e) => update('glowIntensity', parseFloat(e.target.value))}
            className="w-full accent-white"
          />
        </Field>

        <Field label="Animation speed">
          <input
            type="range"
            min={0.1}
            max={10}
            step={0.1}
            value={config.speed}
            onChange={(e) => update('speed', parseFloat(e.target.value))}
            className="w-full accent-white"
          />
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
