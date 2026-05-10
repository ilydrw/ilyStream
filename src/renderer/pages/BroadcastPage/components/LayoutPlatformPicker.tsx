import type { ReactNode } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import { PlatformLogo } from '../../../components/platforms/PlatformLogo'
import type { BroadcastLayoutId } from '../utils/streaming-config'

interface StreamPlatformOption {
  id: string
  name: string
}

interface LayoutPlatformPickerProps {
  layout: BroadcastLayoutId
  label: string
  icon: ReactNode
  platforms: StreamPlatformOption[]
  selectedIds: string[]
  blockedIds: string[]
  disabled: boolean
  isStreaming: boolean
  onToggle: (layout: BroadcastLayoutId, platformId: string) => void
  onRemove: (layout: BroadcastLayoutId, platformId: string) => void
}

export function LayoutPlatformPicker({
  layout,
  label,
  icon,
  platforms,
  selectedIds,
  blockedIds,
  disabled,
  isStreaming,
  onToggle,
  onRemove
}: LayoutPlatformPickerProps) {
  const selectedPlatforms = selectedIds
    .map((id) => platforms.find((platform) => platform.id === id))
    .filter((platform): platform is StreamPlatformOption => Boolean(platform))

  return (
    <div className={`flex items-center gap-2 rounded-xl border px-2 h-11 ${disabled ? 'border-white/5 bg-white/[0.02] opacity-40' : 'border-white/10 bg-white/5'}`}>
      <div className="flex items-center gap-1.5 text-white/45" title={`${label} output`}>
        {icon}
        <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
      </div>

      <div className="flex items-center gap-1 max-w-52 overflow-x-auto custom-scrollbar">
        {selectedPlatforms.map((platform) => (
          <button
            key={platform.id}
            onClick={() => onRemove(layout, platform.id)}
            className="h-7 px-2 rounded-lg bg-accent/15 border border-accent/25 text-white flex items-center gap-1.5 shrink-0"
            title={`Remove ${platform.name} from ${label}`}
            disabled={isStreaming}
          >
            <PlatformLogo platform={platform.id} size={14} />
            <span className="text-[10px] font-black">{platform.name}</span>
            <Trash2 size={11} className="text-white/45" />
          </button>
        ))}
      </div>

      <details className="relative" onToggle={(event) => {
        if (isStreaming || disabled) (event.currentTarget as HTMLDetailsElement).open = false
      }}>
        <summary className={`list-none h-7 w-7 rounded-lg border flex items-center justify-center transition-all ${isStreaming || disabled ? 'cursor-not-allowed border-white/5 text-white/15' : 'cursor-pointer border-white/10 bg-black/30 text-white/50 hover:text-white hover:bg-white/10'}`} title={`Add platform to ${label}`}>
          <Plus size={14} />
        </summary>
        <div className="absolute right-0 top-9 z-[200] w-52 rounded-xl border border-white/10 bg-[#080808] shadow-2xl p-1.5">
          {platforms.map((platform) => {
            const assignedElsewhere = blockedIds.includes(platform.id)
            const selectedHere = selectedIds.includes(platform.id)
            return (
              <button
                key={platform.id}
                onClick={(event) => {
                  event.preventDefault()
                  if (!isStreaming && !assignedElsewhere) onToggle(layout, platform.id)
                }}
                disabled={assignedElsewhere || isStreaming}
                className={`w-full h-9 px-2 rounded-lg flex items-center gap-2 text-left transition-all disabled:opacity-30 disabled:cursor-not-allowed ${selectedHere ? 'bg-accent/20 text-white' : 'text-white/55 hover:text-white hover:bg-white/8'}`}
                title={assignedElsewhere ? `${platform.name} is already assigned to the other layout` : platform.name}
              >
                <PlatformLogo platform={platform.id} size={16} />
                <span className="flex-1 text-[11px] font-black">{platform.name}</span>
                {selectedHere && <Check size={14} className="text-accent" />}
              </button>
            )
          })}
          {platforms.length === 0 && (
            <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white/25">
              Add stream keys in platform settings
            </div>
          )}
        </div>
      </details>
    </div>
  )
}
