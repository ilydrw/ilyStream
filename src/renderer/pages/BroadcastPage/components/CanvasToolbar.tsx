import {IconDeviceDesktop, IconMaximize, IconMinimize, IconRotate2} from '@tabler/icons-react'

interface CanvasToolbarProps {
  canvasWidth: number
  canvasHeight: number
  isFullscreen: boolean
  onToggleFullscreen: () => void
  onResetView: () => void
}

export function CanvasToolbar({ canvasWidth, canvasHeight, isFullscreen, onToggleFullscreen, onResetView }: CanvasToolbarProps) {
  return (
    <div className="h-12 px-4 border-b border-white/5 flex items-center justify-between bg-black/20 backdrop-blur-md z-20">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 border border-white/10">
          <IconDeviceDesktop size={14} className="text-accent" />
          <span className="text-[10px] font-black uppercase tracking-tighter text-white/60">
            {canvasWidth}x{canvasHeight}
          </span>
        </div>
        <button 
          onClick={onToggleFullscreen}
          className="p-2 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors"
        >
          {isFullscreen ? <IconMinimize size={16} /> : <IconMaximize size={16} />}
        </button>
      </div>
      
      <div className="flex items-center gap-2">
        <button 
          onClick={onResetView}
          className="flex items-center gap-2 px-3 py-1.5 rounded bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-all group"
        >
          <IconRotate2 size={14} className="group-hover:rotate-[-45deg] transition-transform" />
          <span className="text-[10px] font-black uppercase tracking-widest">Reset View</span>
        </button>
      </div>
    </div>
  )
}
