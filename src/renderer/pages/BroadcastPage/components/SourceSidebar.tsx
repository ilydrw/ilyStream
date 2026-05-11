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
  broadcastLayoutMode: string
  widgets: any[]
  devices: any[]
  sidebarWidth: number
  onSidebarResizeStart: () => void
  selectionContext: '16:9' | '9:16'
  onSelectionContextChange: (ctx: '16:9' | '9:16') => void
}

const LAYER_TYPE_ICONS: Record<string, any> = {
  camera: IconVideo, display: IconDeviceDesktop, widget: IconStack2, browser: IconWorld, text: IconTypography, image: ImageIcon
}

export function SourceSidebar(props: SourceSidebarProps) {
  const { 
    activeScene, selectedLayerId, onSelectLayer, onUpdateLayer, onReorderLayer, 
    onShowSourceModal, onContextMenu, aspectRatio, broadcastLayoutMode, widgets, devices, sidebarWidth, onSidebarResizeStart,
    selectionContext, onSelectionContextChange
  } = props

  const selectedLayer = activeScene.layers.find(l => l.id === selectedLayerId) || null

  const renderLayerList = (orientation: '16:9' | '9:16', title: string) => {
    const isPortraitList = orientation === '9:16'
    const isCurrentContext = selectionContext === orientation

    return (
      <div className="flex flex-col min-h-0 flex-1 border-b border-white/[0.04]">
        <div className="px-5 py-3 flex items-center justify-between border-b border-white/[0.02] bg-white/[0.01]">
          <h3 className={`kicker !opacity-100 transition-colors ${isCurrentContext ? '!text-accent' : ''}`}>{title}</h3>
          {!isPortraitList && (
            <button onClick={onShowSourceModal} className="text-accent hover:text-white transition-colors p-1"><IconPlus size={16} /></button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {[...activeScene.layers].reverse().map((layer) => {
            const Icon = LAYER_TYPE_ICONS[layer.type] || IconStack2
            const isSelected = selectedLayerId === layer.id && isCurrentContext
            const isVisible = isPortraitList ? (layer.portraitVisible ?? layer.visible) : layer.visible
            const isLocked = isPortraitList ? (layer.portraitLocked ?? layer.locked) : layer.locked

            return (
              <div
                key={`${orientation}-${layer.id}`}
                onClick={() => {
                  onSelectLayer(layer.id)
                  onSelectionContextChange(orientation)
                }}
                onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, layer) }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all border cursor-pointer ${isSelected ? 'bg-accent/10 border-accent/20 text-white shadow-lg shadow-accent/5' : 'bg-transparent border-transparent text-white/30 hover:bg-white/5'}`}
              >
                <IconArrowsMove size={12} className="text-white/10 shrink-0" />
                <Icon size={16} className={isSelected ? 'text-accent' : ''} />
                <span className="flex-1 text-[12px] font-black truncate text-left">{layer.name}</span>
                <div className="flex items-center gap-1">
                  <button onClick={(e) => { e.stopPropagation(); onUpdateLayer(layer.id, isPortraitList ? { portraitLocked: !isLocked } : { locked: !isLocked }) }} className="p-1 hover:bg-white/10 rounded-md transition-colors group">
                    {isLocked ? <IconLock size={12} className="text-amber-500/80" /> : <IconLockOpen size={12} className="text-white/40" />}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onUpdateLayer(layer.id, isPortraitList ? { portraitVisible: !isVisible } : { visible: !isVisible }) }} className="p-1 hover:bg-white/10 rounded-md transition-colors group">
                    {isVisible ? <IconEye size={12} className="text-white/40" /> : <IconEyeOff size={12} className="text-red-500/80" />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="flex shrink-0 min-h-0 bg-[#050505] relative animate-in slide-in-from-right duration-300" style={{ width: sidebarWidth }}>
      <div onPointerDown={onSidebarResizeStart} className="absolute left-0 top-0 bottom-0 w-6 -left-3 cursor-col-resize hover:bg-white/[0.02] transition-all z-50 group">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-12 bg-white/5 group-hover:bg-accent/40 rounded-r-lg flex items-center justify-center transition-all">
          <div className="w-0.5 h-4 bg-white/20" />
        </div>
      </div>
      
      <div className="flex-1 flex flex-col min-h-0 min-w-0 border-l border-white/[0.04]">
        <div className="flex flex-col min-h-0 flex-1">
          {renderLayerList('16:9', 'Sources (Horizontal / Twitch)')}
          <div className="h-1.5 bg-black/40 border-y border-white/[0.02]" />
          {renderLayerList('9:16', 'Sources (Vertical / TikTok)')}
        </div>

        {selectedLayer && (
          <div className="flex-1 min-h-0 border-t border-white/[0.04] overflow-y-auto custom-scrollbar bg-[#080808]">
            <LayerProperties 
              layer={selectedLayer} 
              sceneId={activeScene.id} 
              widgets={widgets} 
              devices={devices} 
              broadcastLayoutMode={broadcastLayoutMode}
              activeOrientation={selectionContext}
            />
          </div>
        )}
      </div>
    </div>
  )
}
