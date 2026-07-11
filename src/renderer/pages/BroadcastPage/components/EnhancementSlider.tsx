import { IconRotateClockwise2 } from '@tabler/icons-react'

interface EnhancementSliderProps {
  label: string
  icon: any
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  def?: number
}

export function EnhancementSlider({
  label,
  icon: Icon,
  value,
  onChange,
  min = 0,
  max = 200,
  def = 100
}: EnhancementSliderProps) {
  return (
    <div className="space-y-2.5">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2.5 text-white/85">
          <Icon size={17} />
          <label className="text-[13px] font-semibold tracking-tight">{label}</label>
        </div>
        <span className="min-w-[2.5rem] text-right text-[13px] font-mono font-semibold text-white tabular-nums">{Math.round(value)}</span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={event => onChange(parseInt(event.target.value))}
          className="flex-1 h-2.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-accent"
        />
        <button
          onClick={() => onChange(def)}
          className="p-1.5 rounded-lg hover:bg-white/10 text-white/45 hover:text-white transition-colors shrink-0"
          title="Reset to default"
        >
          <IconRotateClockwise2 size={16} />
        </button>
      </div>
    </div>
  )
}
