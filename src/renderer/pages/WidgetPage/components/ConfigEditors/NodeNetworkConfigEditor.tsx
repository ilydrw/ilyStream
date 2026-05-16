import { useMemo } from 'react'
import {
  DEFAULT_NODE_NETWORK_CONFIG,
  type NodeNetworkConfig,
  type Widget
} from '../../../../../shared/widgets'
import { NumberInput } from '../../../../components/ui/Inputs'
import { Section, Field, ColorRow } from './Shared'
import { DesignSystemSection } from './DesignSystemSection'

export function NodeNetworkConfigEditor({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const config = useMemo<NodeNetworkConfig>(
    () => ({ ...DEFAULT_NODE_NETWORK_CONFIG, ...(draft.config as Partial<NodeNetworkConfig>) }),
    [draft.config]
  )

  const update = <K extends keyof NodeNetworkConfig>(key: K, value: NodeNetworkConfig[K]) => {
    onChange({ ...draft, config: { ...config, [key]: value } })
  }

  return (
    <div className="flex flex-col gap-8">
      <Section label="Complexity">
        <Field label="Node count">
          <NumberInput
            value={config.nodeCount}
            onChange={(v) => update('nodeCount', v)}
            min={10}
            max={200}
            className="!w-24 !h-9 !text-xs text-right"
          />
        </Field>
        <Field label="Max connection distance">
          <NumberInput
            value={config.maxDistance}
            onChange={(v) => update('maxDistance', v)}
            min={50}
            max={500}
            className="!w-24 !h-9 !text-xs text-right"
          />
        </Field>
      </Section>

      <Section label="Movement">
        <Field label={`Drift speed — ${config.speed.toFixed(2)}`}>
          <input
            type="range"
            min={0.05}
            max={2.0}
            step={0.05}
            value={config.speed}
            onChange={(e) => update('speed', parseFloat(e.target.value))}
            className="w-full accent-[#d035f1]"
          />
        </Field>
      </Section>

      <Section label="Colors">
        <div className="grid grid-cols-2 gap-4">
          <ColorRow label="Primary" value={config.primaryColor} onChange={(v) => update('primaryColor', v)} />
          <ColorRow label="Secondary" value={config.secondaryColor} onChange={(v) => update('secondaryColor', v)} />
        </div>

        <Field label={`Opacity — ${Math.round(config.opacity * 100)}%`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={config.opacity}
            onChange={(e) => update('opacity', parseFloat(e.target.value))}
            className="w-full accent-[#d035f1]"
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

      <DesignSystemSection config={config as any} onUpdate={update as any} />
    </div>
  )
}
