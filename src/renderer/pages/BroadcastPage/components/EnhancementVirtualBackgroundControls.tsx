import { IconBlur, IconPalette, IconPhoto, IconSunHigh } from '@tabler/icons-react'
import { IconCheck } from '../../../components/ui/icons'
import { BACKGROUND_SCALING_MODES } from './EnhancementModal.constants'
import type { EnhancementPanelProps } from './EnhancementModal.types'
import { EnhancementSlider } from './EnhancementSlider'

const BACKGROUND_TYPE_OPTIONS = [
  { id: 'image', label: 'Image', icon: IconPhoto },
  { id: 'color', label: 'Color', icon: IconPalette },
  { id: 'blur', label: 'Blur', icon: IconBlur }
]

export function VirtualBackgroundControls({ enhancements, setEnhancements }: EnhancementPanelProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold tracking-tight text-white/85 flex items-center gap-2.5">
          <IconPhoto size={17} className="text-accent" />
          Virtual Background
        </h3>
        <button
          onClick={() => setEnhancements({
            ...enhancements,
            virtualBackground: {
              enabled: !enhancements.virtualBackground?.enabled,
              type: 'image',
              value: '',
              blurStrength: 20,
              opacity: 100,
              scalingMode: 'cover'
            }
          })}
          className={`text-[12px] font-semibold px-3.5 py-1.5 rounded-lg transition-all ${enhancements.virtualBackground?.enabled ? 'bg-accent text-white ' : 'bg-white/[0.07] text-white/75 border border-white/15'}`}
        >
          {enhancements.virtualBackground?.enabled ? 'Active' : 'Enable'}
        </button>
      </div>

      {enhancements.virtualBackground?.enabled && (
        <div className="space-y-6 animate-in slide-in-from-top-2 duration-300">
          <div className="flex bg-white/5 p-1 rounded-xl">
            {BACKGROUND_TYPE_OPTIONS.map(type => (
              <button
                key={type.id}
                onClick={() => setEnhancements({ ...enhancements, virtualBackground: { ...enhancements.virtualBackground, type: type.id as any } })}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[12px] font-semibold transition-all ${enhancements.virtualBackground?.type === type.id ? 'bg-white/20 text-white' : 'text-white/55 hover:text-white'}`}
              >
                <type.icon size={12} />
                {type.label}
              </button>
            ))}
          </div>

          {enhancements.virtualBackground?.type === 'image' && (
            <div className="space-y-3">
              <button
                onClick={async () => {
                  const path = await (window as any).api.studio.selectFile({ filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] })
                  if (path) setEnhancements({ ...enhancements, virtualBackground: { ...enhancements.virtualBackground, value: path } })
                }}
                className="w-full h-24 rounded-md border-2 border-dashed border-white/10 hover:border-accent/40 bg-white/5 hover:bg-white/10 transition-all flex flex-col items-center justify-center gap-2 group"
              >
                {enhancements.virtualBackground?.value ? (
                  <div className="text-center px-4">
                    <IconCheck size={20} className="text-accent mx-auto mb-1" />
                    <p className="text-[9px] font-mono text-white/40 truncate w-full">{enhancements.virtualBackground?.value.split(/[\\/]/).pop()}</p>
                  </div>
                ) : (
                  <>
                    <IconPhoto size={24} className="text-white/20 group-hover:text-accent/60 transition-colors" />
                    <p className="text-[10px] font-semibold tracking-tight text-white/30">Select Background</p>
                  </>
                )}
              </button>
            </div>
          )}

          {enhancements.virtualBackground?.type === 'color' && (
            <div className="flex items-center gap-3 bg-white/5 p-2 rounded-xl border border-white/5">
              <input
                type="color"
                value={enhancements.virtualBackground?.value || '#000000'}
                onChange={event => setEnhancements({ ...enhancements, virtualBackground: { ...enhancements.virtualBackground, value: event.target.value } })}
                className="w-8 h-8 rounded-lg border-0 bg-transparent cursor-pointer"
              />
              <input
                type="text"
                value={enhancements.virtualBackground?.value || '#000000'}
                onChange={event => setEnhancements({ ...enhancements, virtualBackground: { ...enhancements.virtualBackground, value: event.target.value } })}
                className="flex-1 bg-transparent border-0 text-[13px] font-mono text-white/80 focus:text-white outline-none"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <EnhancementSlider
              label="Background Blur"
              icon={IconBlur}
              value={enhancements.virtualBackground?.blurStrength || 0}
              min={0}
              max={100}
              def={0}
              onChange={value => setEnhancements({ ...enhancements, virtualBackground: { ...enhancements.virtualBackground, blurStrength: value } })}
            />
            <EnhancementSlider
              label="Opacity"
              icon={IconSunHigh}
              value={enhancements.virtualBackground?.opacity ?? 100}
              min={0}
              max={100}
              def={100}
              onChange={value => setEnhancements({ ...enhancements, virtualBackground: { ...enhancements.virtualBackground, opacity: value } })}
            />
          </div>

          {enhancements.virtualBackground?.type === 'image' && (
            <div className="space-y-4 pt-4 border-t border-white/5">
              <label className="text-[13px] font-semibold text-white/80 tracking-tight block">Scaling Mode</label>
              <div className="flex bg-white/5 p-1 rounded-xl">
                {BACKGROUND_SCALING_MODES.map(mode => (
                  <button
                    key={mode.id}
                    onClick={() => setEnhancements({ ...enhancements, virtualBackground: { ...enhancements.virtualBackground, scalingMode: mode.id as any } })}
                    className={`flex-1 py-2.5 rounded-lg text-[12px] font-semibold transition-all ${enhancements.virtualBackground?.scalingMode === mode.id ? 'bg-white/20 text-white' : 'text-white/55 hover:text-white'}`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
