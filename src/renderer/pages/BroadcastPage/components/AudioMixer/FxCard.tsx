import React from 'react'
import { IconPower, IconTrash } from '@tabler/icons-react'
import { FX_PRESETS } from './constants'
import { formatParam, getParamRange } from './utils'

export function FxCard({ fx, index, onToggle, onRemove, onParam }: {
  fx: { id: string; type: string; params: Record<string, number>; enabled: boolean }
  index: number
  onToggle: () => void
  onRemove: () => void
  onParam: (key: string, value: number) => void
}) {
  const preset = FX_PRESETS.find(item => item.type === fx.type)
  const params = fx.params || {}
  return (
    <div className={`rounded-2xl ring-1 p-6 transition-all duration-400 ${fx.enabled ? 'bg-white/[0.06] ring-white/[0.15] shadow-2xl' : 'bg-white/[0.02] ring-white/[0.06] opacity-30'}`}>
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-black text-white/20 tabular-nums leading-none mb-1.5">{String(index + 1).padStart(2, '0')}</span>
            <div className={`w-1.5 h-6 rounded-full transition-all duration-500 ${fx.enabled ? 'bg-accent shadow-[0_0_12px_rgba(var(--accent-rgb),0.8)]' : 'bg-white/10'}`} />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-black uppercase tracking-[0.08em] text-white/95 truncate">{preset?.label || fx.type}</div>
            <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-accent/40">Insert Node</div>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-black/50 p-1.5 rounded-xl border border-white/10">
          <button onClick={onToggle} className={`h-9 w-9 flex items-center justify-center rounded-lg transition-all ${fx.enabled ? 'bg-accent/25 text-accent shadow-inner' : 'text-white/20 hover:text-white/40'}`} title="Toggle Bypass">
            <IconPower size={15} />
          </button>
          <button onClick={onRemove} className="h-9 w-9 flex items-center justify-center rounded-lg text-white/20 hover:text-red-400 hover:bg-red-400/20 transition-all" title="Remove Insert">
            <IconTrash size={15} />
          </button>
        </div>
      </div>
      <div className="space-y-4">
        {Object.entries(params).map(([key, value]) => (
          <div key={key} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-[9px] font-black uppercase tracking-widest text-white/35">{key}</span>
              <span className="text-[9px] font-black text-white/50 tabular-nums">{formatParam(key, value)}</span>
            </div>
            <input
              type="range"
              min={getParamRange(key).min}
              max={getParamRange(key).max}
              step={getParamRange(key).step}
              value={value}
              onChange={event => onParam(key, Number(event.target.value))}
              onContextMenu={e => {
                e.preventDefault()
                const defaultValue = preset?.params[key] ?? 0
                onParam(key, defaultValue)
              }}
              className="accent-accent w-full h-1.5 rounded-full bg-white/[0.05] appearance-none cursor-pointer"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
