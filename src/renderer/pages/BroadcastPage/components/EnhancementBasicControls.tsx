import {
  IconBrightnessUp,
  IconCircle,
  IconColorSwatch,
  IconContrast,
  IconFocus2,
  IconHistory,
  IconSparkles,
  IconSunHigh
} from '@tabler/icons-react'
import { IconCheck, IconX } from '../../../components/ui/icons'
import { FILTER_PRESETS } from './EnhancementModal.constants'
import type { EnhancementPanelProps } from './EnhancementModal.types'
import { EnhancementSlider } from './EnhancementSlider'

export function FocusEngineControls({ enhancements, setEnhancements }: EnhancementPanelProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold tracking-tight text-white/85 flex items-center gap-2.5">
          <IconFocus2 size={17} className="text-accent" />
          Focus Engine
        </h3>
        <button
          onClick={() => setEnhancements({ ...enhancements, focusCircle: { ...enhancements.focusCircle, enabled: !enhancements.focusCircle?.enabled, x: 50, y: 50, radius: 30, blur: 50 } })}
          className={`text-[12px] font-semibold px-3.5 py-1.5 rounded-lg transition-all ${enhancements.focusCircle?.enabled ? 'bg-accent text-white ' : 'bg-white/[0.07] text-white/75 border border-white/15'}`}
        >
          {enhancements.focusCircle?.enabled ? 'Active' : 'Enable'}
        </button>
      </div>

      {enhancements.focusCircle?.enabled && (
        <div className="space-y-6 animate-in slide-in-from-top-2 duration-300">
          <EnhancementSlider
            label="Focus Radius"
            icon={IconCircle}
            value={enhancements.focusCircle.radius}
            min={5}
            max={100}
            def={30}
            onChange={value => setEnhancements({ ...enhancements, focusCircle: { ...enhancements.focusCircle, radius: value } })}
          />
          <EnhancementSlider
            label="Background Blur"
            icon={IconSparkles}
            value={enhancements.focusCircle.blur}
            min={0}
            max={100}
            def={50}
            onChange={value => setEnhancements({ ...enhancements, focusCircle: { ...enhancements.focusCircle, blur: value } })}
          />
          <div className="grid grid-cols-2 gap-4">
            <EnhancementSlider
              label="X Position"
              icon={IconX}
              value={enhancements.focusCircle.x}
              min={0}
              max={100}
              def={50}
              onChange={value => setEnhancements({ ...enhancements, focusCircle: { ...enhancements.focusCircle, x: value } })}
            />
            <EnhancementSlider
              label="Y Position"
              icon={IconX}
              value={enhancements.focusCircle.y}
              min={0}
              max={100}
              def={50}
              onChange={value => setEnhancements({ ...enhancements, focusCircle: { ...enhancements.focusCircle, y: value } })}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export function MasterControls({ enhancements, setEnhancements }: EnhancementPanelProps) {
  return (
    <div className="space-y-6">
      <h3 className="text-[14px] font-semibold tracking-tight text-white/85 flex items-center gap-2.5">
        <IconSunHigh size={17} className="text-accent" />
        Master Controls
      </h3>
      <div className="space-y-6">
        <EnhancementSlider
          label="Beauty (Smoothing)"
          icon={IconSparkles}
          value={enhancements.beauty || 0}
          min={0}
          max={100}
          def={0}
          onChange={value => setEnhancements({ ...enhancements, beauty: value })}
        />
        <EnhancementSlider
          label="Brightness"
          icon={IconBrightnessUp}
          value={enhancements.brightness ?? 100}
          onChange={value => setEnhancements({ ...enhancements, brightness: value })}
        />
        <EnhancementSlider
          label="Contrast"
          icon={IconContrast}
          value={enhancements.contrast ?? 100}
          onChange={value => setEnhancements({ ...enhancements, contrast: value })}
        />
        <EnhancementSlider
          label="Saturation"
          icon={IconColorSwatch}
          value={enhancements.saturation ?? 100}
          onChange={value => setEnhancements({ ...enhancements, saturation: value })}
        />
        <EnhancementSlider
          label="Temperature"
          icon={IconSunHigh}
          value={enhancements.temperature || 0}
          min={-100}
          max={100}
          def={0}
          onChange={value => setEnhancements({ ...enhancements, temperature: value })}
        />
        <EnhancementSlider
          label="Vignette"
          icon={IconFocus2}
          value={enhancements.vignette || 0}
          min={0}
          max={100}
          def={0}
          onChange={value => setEnhancements({ ...enhancements, vignette: value })}
        />
        <EnhancementSlider
          label="Global Blur"
          icon={IconSparkles}
          value={enhancements.blur || 0}
          min={0}
          max={100}
          def={0}
          onChange={value => setEnhancements({ ...enhancements, blur: value })}
        />
      </div>
    </div>
  )
}

export function ChromaKeyControls({ enhancements, setEnhancements }: EnhancementPanelProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold tracking-tight text-white/85 flex items-center gap-2.5">
          <IconColorSwatch size={17} className="text-accent" />
          Chroma Key
        </h3>
        <button
          onClick={() => setEnhancements({
            ...enhancements,
            chromaKey: {
              enabled: !enhancements.chromaKey?.enabled,
              color: '#00ff00',
              similarity: 40,
              smoothness: 10,
              spill: 10
            }
          })}
          className={`text-[12px] font-semibold px-3.5 py-1.5 rounded-lg transition-all ${enhancements.chromaKey?.enabled ? 'bg-accent text-white ' : 'bg-white/[0.07] text-white/75 border border-white/15'}`}
        >
          {enhancements.chromaKey?.enabled ? 'Active' : 'Enable'}
        </button>
      </div>

      {enhancements.chromaKey?.enabled && (
        <div className="space-y-6 animate-in slide-in-from-top-2 duration-300">
          <div className="space-y-2">
            <label className="text-[13px] font-semibold text-white/80 tracking-tight block">Key Color</label>
            <div className="flex items-center gap-3 bg-white/5 p-2 rounded-xl border border-white/5">
              <input
                type="color"
                value={enhancements.chromaKey.color}
                onChange={event => setEnhancements({ ...enhancements, chromaKey: { ...enhancements.chromaKey, color: event.target.value } })}
                className="w-8 h-8 rounded-lg border-0 bg-transparent cursor-pointer"
              />
              <input
                type="text"
                value={enhancements.chromaKey.color}
                onChange={event => setEnhancements({ ...enhancements, chromaKey: { ...enhancements.chromaKey, color: event.target.value } })}
                className="flex-1 bg-transparent border-0 text-[13px] font-mono text-white/80 focus:text-white outline-none"
              />
            </div>
          </div>
          <EnhancementSlider
            label="Similarity"
            icon={IconSparkles}
            value={enhancements.chromaKey.similarity}
            min={1}
            max={100}
            def={40}
            onChange={value => setEnhancements({ ...enhancements, chromaKey: { ...enhancements.chromaKey, similarity: value } })}
          />
          <EnhancementSlider
            label="Smoothness"
            icon={IconSparkles}
            value={enhancements.chromaKey.smoothness}
            min={0}
            max={100}
            def={10}
            onChange={value => setEnhancements({ ...enhancements, chromaKey: { ...enhancements.chromaKey, smoothness: value } })}
          />
          <EnhancementSlider
            label="Spill Reduction"
            icon={IconSparkles}
            value={enhancements.chromaKey.spill}
            min={0}
            max={100}
            def={10}
            onChange={value => setEnhancements({ ...enhancements, chromaKey: { ...enhancements.chromaKey, spill: value } })}
          />
        </div>
      )}
    </div>
  )
}

export function StylePresetControls({ enhancements, setEnhancements }: EnhancementPanelProps) {
  return (
    <div className="space-y-4 pb-4">
      <h3 className="text-[14px] font-semibold tracking-tight text-white/85 flex items-center gap-2.5">
        <IconColorSwatch size={17} className="text-accent" />
        Style Presets
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {FILTER_PRESETS.map(preset => (
          <button
            key={preset.id}
            onClick={() => setEnhancements({ ...enhancements, filterPreset: preset.id })}
            className={`px-3 py-2.5 rounded-xl text-[11px] font-semibold transition-all border ${enhancements.filterPreset === preset.id ? 'bg-accent border-accent text-black font-semibold' : 'bg-white/10 border-white/5 text-white/70 hover:text-white hover:bg-white/20 hover:border-white/10'}`}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  )
}

interface EnhancementFooterProps {
  onReset: () => void
  onApply: () => void
}

export function EnhancementFooter({ onReset, onApply }: EnhancementFooterProps) {
  return (
    <div className="p-8 border-t border-white/5 grid grid-cols-2 gap-3 bg-black/40">
      <button
        onClick={onReset}
        className="flex items-center justify-center gap-2 h-12 rounded-md bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition-all text-xs font-semibold border border-white/5 cursor-pointer"
      >
        <IconHistory size={16} />
        Reset All
      </button>
      <button
        onClick={onApply}
        className="flex items-center justify-center gap-2 h-12 rounded-md bg-accent text-black hover:scale-[1.02] active:scale-[0.98] transition-all text-xs font-semibold tracking-tight cursor-pointer"
      >
        <IconCheck size={18} />
        Save Changes
      </button>
    </div>
  )
}
