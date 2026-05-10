import {IconPlus, IconArrowsMove, IconLock, IconLockOpen, IconEye, IconEyeOff, IconVideo, IconDeviceDesktop, IconStack2, IconWorld, IconTypography, IconPhoto as ImageIcon} from '@tabler/icons-react'
import type { StudioLayer, StudioScene } from '../../../../shared/studio'
import { LayerProperties } from './LayerProperties'

interface SourceSidebarProps {
  activeScene: StudioScene
  selectedLayerId: string | null
  onSelectLayer: (id: string | null) => void
  onUpdateLayer: (id: string, update: any) => void
  onReorderLayer: (id: string, index: number) => void
  onShowSourceModal: () => void
  onContextMenu: (e: React.MouseEvent, layer: StudioLayer) => void
  aspectRatio: string
  widgets: any[]
  devices: any[]
  sidebarWidth: number
  onSidebarResizeStart: () => void
}

const LAYER_TYPE_ICONS: Record<string, any> = {
  camera: IconVideo, display: IconDeviceDesktop, widget: IconStack2, browser: IconWorld, text: IconTypography, image: ImageIcon
}

export function SourceSidebar(props: SourceSidebarProps) {
  const { 
    activeScene, selectedLayerId, onSelectLayer, onUpdateLayer, onReorderLayer, 
    onShowSourceModal, onContextMenu, aspectRatio, widgets, devices, sidebarWidth, onSidebarResizeStart 
  } = props

  const selectedLayer = activeScene.layers.find(l => l.id === selectedLayerId) || null
  const isPortrait = aspectRatio === '9:16'

  return (
    <div className="flex shrink-0 min-h-0 bg-[#050505] relative animate-in slide-in-from-right duration-300" style={{ width: sidebarWidth }}>
      <div onPointerDown={onSidebarResizeStart} className="absolute left-0 top-0 bottom-0 w-6 -left-3 cursor-col-resize hover:bg-white/[0.02] transition-all z-50 group">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-12 bg-white/5 group-hover:bg-accent/40 rounded-r-lg flex items-center justify-center transition-all">
          <div className="w-0.5 h-4 bg-white/20" />
        </div>
      </div>
      
      <div className="flex-1 flex flex-col min-h-0 min-w-0 border-l border-white/[0.04]">
        <div className="flex flex-col min-h-0 h-1/2">
          <div className="px-5 py-5 flex items-center justify-between border-b border-white/[0.02] bg-white/[0.01]">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-white/30">Sources</h3>
            <button onClick={onShowSourceModal} className="text-accent hover:text-white transition-colors"><IconPlus size={20} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {[...activeScene.layers].reverse().map((layer, visIdx) => {
              const Icon = LAYER_TYPE_ICONS[layer.type] || IconStack2
              const isSelected = selectedLayerId === layer.id
              const isVisible = isPortrait ? (layer.portraitVisible ?? layer.visible) : layer.visible
              const isLocked = isPortrait ? (layer.portraitLocked ?? layer.locked) : layer.locked

              return (
                <div key={layer.id}>
                  <div
                    onClick={() => onSelectLayer(isSelected ? null : layer.id)}
                    onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, layer) }}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all border cursor-pointer ${isSelected ? 'bg-accent/10 border-accent/20 text-white shadow-xl shadow-accent/10' : 'bg-transparent border-transparent text-white/30 hover:bg-white/5'}`}
                  >
                    <IconArrowsMove size={14} className="text-white/10 shrink-0" />
                    <Icon size={18} className={isSelected ? 'text-accent' : ''} />
                    <span className="flex-1 text-[13px] font-black truncate text-left">{layer.name}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); onUpdateLayer(layer.id, isPortrait ? { portraitLocked: !isLocked } : { locked: !isLocked }) }} className="p-1.5 hover:bg-white/10 rounded-md transition-colors group">
                        {isLocked ? <IconLock size={14} className="text-amber-500/80" /> : <IconLockOpen size={14} className="text-white/40" />}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); onUpdateLayer(layer.id, isPortrait ? { portraitVisible: !isVisible } : { visible: !isVisible }) }} className="p-1.5 hover:bg-white/10 rounded-md transition-colors group">
                        {isVisible ? <IconEye size={14} className="text-white/40" /> : <IconEyeOff size={14} className="text-red-500/80" />}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {selectedLayer && (
          <div className="flex-1 min-h-0 border-t border-white/[0.04] overflow-y-auto custom-scrollbar">
            <LayerProperties layer={selectedLayer} sceneId={activeScene.id} widgets={widgets} devices={devices} />
          </div>
        )}
      </div>
    </div>
  )
}
