import {IconChevronRight} from '@tabler/icons-react'
import { AudioMixer } from './AudioMixer'

interface MixerContainerProps {
  isCollapsed: boolean
  onToggleCollapse: () => void
  mixerHeight: number
  onResizeStart: () => void
  activeScene: any
  videoRefs: any
  devices: any
  streamReady: number
}

export function MixerContainer(props: MixerContainerProps) {
  const { isCollapsed, onToggleCollapse, mixerHeight, onResizeStart, activeScene, videoRefs, devices, streamReady } = props

  return (
    <div 
      className="absolute bottom-0 left-0 right-0 overflow-hidden border-t border-white/[0.08] bg-[#030303] shadow-[0_-25px_60px_rgba(0,0,0,0.9)] flex flex-col z-[100]"
      style={{ height: isCollapsed ? '48px' : `${mixerHeight}px` }}
    >
      <div 
        onPointerDown={onResizeStart}
        className={`absolute top-0 inset-x-0 h-4 cursor-ns-resize hover:bg-accent/35 transition-all flex items-start justify-center group z-[110] ${isCollapsed ? 'pointer-events-none opacity-0' : ''}`}
      >
        <div className="w-full h-full" /> {/* Invisible larger hit area */}
        <div className="absolute top-1 w-32 h-1.5 bg-white/10 group-hover:bg-white/60 rounded-full transition-all" />
      </div>

      <div className="absolute top-0 right-6 h-12 flex items-center z-[120]">
        <button 
          onClick={onToggleCollapse}
          className="p-2 rounded-lg bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all"
        >
          {isCollapsed ? <IconChevronRight className="-rotate-90" size={16} /> : <IconChevronRight className="rotate-90" size={16} />}
        </button>
      </div>
      
      <AudioMixer activeScene={activeScene} videoRefs={videoRefs} devices={devices} streamReady={streamReady} />
    </div>
  )
}
