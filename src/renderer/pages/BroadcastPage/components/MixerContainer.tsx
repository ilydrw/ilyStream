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
      className="broadcast-mixer-dock relative shrink-0 overflow-hidden flex flex-col z-[100]"
      style={{ height: isCollapsed ? '48px' : `${mixerHeight}px` }}
    >
      <div 
        onPointerDown={onResizeStart}
        className={`broadcast-mixer-resize absolute top-0 inset-x-0 h-4 cursor-ns-resize transition-all flex items-start justify-center group z-[110] ${isCollapsed ? 'pointer-events-none opacity-0' : ''}`}
      >
        <div className="w-full h-full" /> {/* Invisible larger hit area */}
        <div className="broadcast-mixer-resize-grip absolute top-1" />
      </div>

      <AudioMixer
        activeScene={activeScene}
        videoRefs={videoRefs}
        devices={devices}
        streamReady={streamReady}
        dockCollapsed={isCollapsed}
        onToggleDockCollapse={onToggleCollapse}
      />
    </div>
  )
}
