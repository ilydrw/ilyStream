import {
  IconPlus,
  IconArrowsMove,
  IconLock,
  IconLockOpen,
  IconEye,
  IconEyeOff,
  IconVideo,
  IconDeviceDesktop,
  IconStack2,
  IconWorld,
  IconTypography,
  IconPhoto as ImageIcon,
  IconAdjustments,
  IconLayersSubtract
} from '@tabler/icons-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { StudioLayer, StudioScene } from '../../../../shared/studio'
import { LayerProperties } from './LayerProperties'

interface SourceSidebarProps {
  activeScene: StudioScene
  selectedLayerId: string | null
  onSelectLayer: (id: string | null) => void
  onUpdateLayer: (id: string, update: any) => void
  onReorderLayer: (id: string, index: number) => void
  onShowSourceModal: () => void
  onContextMenu: (e: React.MouseEvent, layer: StudioLayer, aspectRatio: '16:9' | '9:16') => void
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
  camera: IconVideo,
  display: IconDeviceDesktop,
  widget: IconStack2,
  browser: IconWorld,
  text: IconTypography,
  image: ImageIcon
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
      <div className={`flex flex-col min-h-0 transition-all duration-500 ${isCurrentContext ? 'flex-[2]' : 'flex-1 opacity-40'}`}>
        <div
          onClick={() => onSelectionContextChange(orientation)}
          className={`px-5 py-3 flex items-center justify-between border-b border-white/[0.04] cursor-pointer transition-colors ${isCurrentContext ? 'bg-white/[0.03]' : 'hover:bg-white/[0.01]'}`}
        >
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-4 rounded-full transition-all ${isCurrentContext ? 'bg-accent shadow-glow' : 'bg-white/10'}`} />
            <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${isCurrentContext ? 'text-white' : 'text-white/40'}`}>{title}</h3>
          </div>
          {isCurrentContext && (
            <button
              onClick={(e) => { e.stopPropagation(); onShowSourceModal() }}
              className="w-7 h-7 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 hover:text-white transition-all flex items-center justify-center shadow-lg shadow-accent/5"
            >
              <IconPlus size={16} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {[...activeScene.layers].reverse().map((layer) => {
            const Icon = LAYER_TYPE_ICONS[layer.type] || IconStack2
            const isSelected = selectedLayerId === layer.id && isCurrentContext
            const isVisible = isPortraitList ? (layer.portraitVisible ?? layer.visible) : layer.visible
            const isLocked = isPortraitList ? (layer.portraitLocked ?? layer.locked) : layer.locked

            return (
              <motion.div
                layout
                key={`${orientation}-${layer.id}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectLayer(layer.id)
                  onSelectionContextChange(orientation)
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  onSelectionContextChange(orientation)
                  onContextMenu(e, layer, orientation)
                }}
                className={`group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all border cursor-pointer ${isSelected ? 'bg-brand-gradient text-white border-transparent shadow-glow shadow-accent/10' : 'bg-transparent border-transparent text-white/30 hover:bg-white/[0.03]'}`}
              >
                <div className={`shrink-0 transition-colors ${isSelected ? 'text-white/100' : 'text-white/10 group-hover:text-white/30'}`}>
                  <IconArrowsMove size={12} />
                </div>

                <div className={`p-1.5 rounded-lg transition-colors ${isSelected ? 'bg-white/20' : 'bg-white/5 group-hover:bg-white/10'}`}>
                  <Icon size={14} className={isSelected ? 'text-white' : ''} />
                </div>

                <span className={`flex-1 text-[11px] font-bold truncate text-left transition-colors ${isSelected ? 'text-white' : 'group-hover:text-white/60'}`}>
                  {layer.name}
                </span>

                <div className={`flex items-center gap-1 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                  <button
                    onClick={(e) => { e.stopPropagation(); onUpdateLayer(layer.id, isPortraitList ? { portraitLocked: !isLocked } : { locked: !isLocked }) }}
                    className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    {isLocked ? <IconLock size={13} className="text-amber-400" /> : <IconLockOpen size={13} className="text-white/20" />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onUpdateLayer(layer.id, isPortraitList ? { portraitVisible: !isVisible } : { visible: !isVisible }) }}
                    className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    {isVisible ? <IconEye size={13} className="text-white/40" /> : <IconEyeOff size={13} className="text-red-500/60" />}
                  </button>
                </div>

                {isSelected && (
                  <motion.div
                    layoutId="active-indicator"
                    className="absolute -left-1 top-1/4 bottom-1/4 w-1 bg-white rounded-full shadow-glow"
                  />
                )}
              </motion.div>
            )
          })}

          {activeScene.layers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-4 text-white/10">
                <IconLayersSubtract size={24} />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Empty Stage</p>
              <p className="text-[9px] font-bold text-white/10 mt-1 uppercase tracking-tight">Add sources to begin</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex shrink-0 min-h-0 bg-[#050505] relative animate-in slide-in-from-right duration-300" style={{ width: sidebarWidth }}>
      {/* Resize Handle */}
      <div onPointerDown={onSidebarResizeStart} className="absolute left-0 top-0 bottom-0 w-6 -left-3 cursor-col-resize hover:bg-white/[0.02] transition-all z-50 group">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-12 bg-white/5 group-hover:bg-accent/40 rounded-r-lg flex items-center justify-center transition-all shadow-xl">
          <div className="w-0.5 h-4 bg-white/20 group-hover:bg-white/60" />
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 min-w-0 border-l border-white/[0.04] bg-[#0c0c0e]">
        {/* Source Lists */}
        <div className="flex flex-col min-h-0 flex-1">
          {renderLayerList('16:9', 'Desktop Environment')}
          <div className="h-px bg-white/[0.04]" />
          {renderLayerList('9:16', 'Mobile Environment')}
        </div>

        {/* Selected Layer Properties */}
        <AnimatePresence mode="wait">
          {selectedLayer ? (
            <motion.div
              key="properties"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="h-[45%] min-h-[300px] border-t border-white/[0.08] flex flex-col overflow-hidden bg-[#080808] shadow-[0_-20px_50px_rgba(0,0,0,0.5)]"
            >
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.04] bg-white/[0.01]">
                <div className="flex items-center gap-2">
                  <IconAdjustments size={14} className="text-accent" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Source Inspector</span>
                </div>
                <button
                  onClick={() => onSelectLayer(null)}
                  className="text-white/20 hover:text-white transition-colors"
                >
                  <IconPlus className="rotate-45" size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <LayerProperties
                  layer={selectedLayer}
                  sceneId={activeScene.id}
                  widgets={widgets}
                  devices={devices}
                  broadcastLayoutMode={broadcastLayoutMode}
                  activeOrientation={selectionContext}
                />
              </div>
            </motion.div>
          ) : (
            <div className="px-5 py-8 border-t border-white/[0.04] bg-[#080808] flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-3 text-white/10">
                <IconAdjustments size={20} />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/10">No Selection</p>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
