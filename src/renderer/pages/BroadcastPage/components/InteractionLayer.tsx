import {IconRotateClockwise2} from '@tabler/icons-react'
import type { StudioLayer, StudioScene } from '../../../../shared/studio'
import type { HandleDir } from './CanvasEditor.types'

interface InteractionLayerProps {
  layers: StudioLayer[]
  selectedLayerId: string | null
  aspectRatio: '16:9' | '9:16'
  canvasWidth: number
  resolve: (layer: StudioLayer) => any
  onMouseDown: (e: React.MouseEvent, layer: StudioLayer) => void
  onRotateStart: (e: React.MouseEvent, layer: StudioLayer) => void
  onResizeStart: (e: React.MouseEvent, layer: StudioLayer, handle: HandleDir) => void
  onAutoCrop: (layer: StudioLayer) => void
  isCropping: (layerId: string) => boolean
}

const HANDLE_CURSORS: Record<HandleDir, string> = {
  nw: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', se: 'nwse-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize'
}

export function InteractionLayer(props: InteractionLayerProps) {
  const { 
    layers, selectedLayerId, canvasWidth, resolve, 
    onMouseDown, onRotateStart, onResizeStart, onAutoCrop, isCropping 
  } = props

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {layers.map(layer => {
        const layout = resolve(layer)
        if (!layout.visible) return null
        const isSelected = selectedLayerId === layer.id
        const isLocked = Boolean(layout.locked)
        const cropping = isCropping(layer.id)
        
        return (
          <div
            key={layer.id}
            onMouseDown={(e) => onMouseDown(e, layer)}
            className={`absolute pointer-events-auto transition-shadow duration-300 ${isLocked ? 'cursor-default' : 'cursor-move'} ${
              isSelected 
                ? `${isLocked ? 'ring-2 ring-amber-400/70 shadow-[0_0_24px_rgba(251,191,36,0.22)]' : cropping ? 'ring-2 ring-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.3)]' : 'ring-2 ring-accent shadow-[0_0_30px_rgba(var(--accent-rgb),0.3)]'} z-10` 
                : 'hover:ring-1 hover:ring-white/20'
            }`}
            style={{
              left: `${layout.x}px`,
              top: `${layout.y}px`,
              width: `${layout.width}px`,
              height: `${layout.height}px`,
              transform: `rotate(${Number(layout.rotation || 0)}deg)`,
              transformOrigin: 'center center'
            }}
          >
            {isSelected && (
              <>
                <div className={`absolute left-1/2 top-0 h-9 w-px -translate-x-1/2 -translate-y-full pointer-events-none ${isLocked ? 'bg-amber-400/70' : 'bg-accent/70'}`} />
                {!isLocked && (
                  <>
                    <button
                      onMouseDown={(e) => onRotateStart(e, layer)}
                      className="absolute left-1/2 top-0 flex h-7 w-7 -translate-x-1/2 -translate-y-[calc(100%+30px)] items-center justify-center rounded-full border-2 border-accent bg-[#050505] text-accent shadow-lg hover:scale-110 hover:bg-accent hover:text-white transition-all pointer-events-auto z-40"
                    >
                      <IconRotateClockwise2 size={14} />
                    </button>
                    {(['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'] as HandleDir[]).map(dir => (
                      <div
                        key={dir}
                        onMouseDown={(e) => onResizeStart(e, layer, dir)}
                        className={`absolute ${dir.length === 1 ? 'w-5 h-2' : 'w-3.5 h-3.5'} bg-white border-2 ${cropping ? 'border-emerald-500 bg-emerald-50' : 'border-accent'} rounded-full -translate-x-1/2 -translate-y-1/2 shadow-lg hover:scale-125 transition-transform cursor-pointer pointer-events-auto z-30`}
                        style={{
                          left: dir.includes('e') ? '100%' : (dir.includes('w') ? '0%' : '50%'),
                          top: dir.includes('s') ? '100%' : (dir.includes('n') ? '0%' : '50%'),
                          cursor: HANDLE_CURSORS[dir],
                          width: dir.length === 1 ? (['n', 's'].includes(dir) ? '16px' : '6px') : '14px',
                          height: dir.length === 1 ? (['n', 's'].includes(dir) ? '6px' : '16px') : '14px',
                          borderRadius: dir.length === 1 ? '2px' : '50%'
                        }}
                      />
                    ))}
                  </>
                )}
                <div 
                  className="absolute flex items-center gap-1 z-20"
                  style={{
                    bottom: layout.y < 40 ? 'auto' : '100%',
                    top: layout.y < 40 ? '100%' : 'auto',
                    left: layout.x < 120 ? '0' : (layout.x + layout.width > canvasWidth - 120 ? 'auto' : '50%'),
                    right: layout.x + layout.width > canvasWidth - 120 ? '0' : 'auto',
                    transform: `${layout.y < 40 ? 'translateY(8px)' : 'translateY(-8px)'} ${layout.x < 120 || layout.x + layout.width > canvasWidth - 120 ? 'translateX(0)' : 'translateX(-50%)'}`,
                    maxWidth: '300px',
                    width: 'max-content'
                  }}
                >
                  <div className={`px-2 py-1 ${cropping ? 'bg-emerald-500' : 'bg-accent'} text-white text-[9px] font-black rounded uppercase tracking-widest shadow-lg whitespace-nowrap`}>
                    {isLocked ? `Locked: ${layer.name}` : cropping ? `Cropping: ${layer.name}` : layer.name}
                  </div>
                  {!isLocked && (layer.type === 'widget' || layer.type === 'browser' || layer.type === 'image') && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onAutoCrop(layer) }}
                      className="px-2 py-1 bg-white text-accent hover:bg-accent hover:text-white transition-colors text-[9px] font-black rounded uppercase tracking-widest shadow-lg pointer-events-auto"
                    >
                      Auto-Wrap
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
