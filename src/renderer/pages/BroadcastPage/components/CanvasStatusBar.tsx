import {IconMinimize, IconMaximize, IconRotate2} from '@tabler/icons-react'

interface CanvasStatusBarProps {
  fps: number
  outputFps: number
  format: string
  zoom: number
  canvasWidth: number
  canvasHeight: number
  aspectRatio: string
  onZoomIn: () => void
  onZoomOut: () => void
  onResetZoom: () => void
}

export function CanvasStatusBar(props: CanvasStatusBarProps) {
  const { fps, outputFps, format, zoom, canvasWidth, canvasHeight, aspectRatio, onZoomIn, onZoomOut, onResetZoom } = props
  
  return (
    <div className="shrink-0 h-10 px-4 bg-black/40 border-t border-white/5 flex items-center justify-between backdrop-blur-md">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded-md border border-white/5">
          <div className={`w-1.5 h-1.5 rounded-full ${fps >= (outputFps - 2) ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <span className="text-[10px] font-black tabular-nums text-white/60">{fps} FPS</span>
        </div>
        <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">{format.toUpperCase()}</span>
      </div>

      <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5 border border-white/10">
        <button 
          onClick={onZoomOut}
          className="p-1.5 hover:bg-white/10 rounded-md text-white/40 hover:text-white transition-all"
        >
          <IconMinimize size={14} />
        </button>
        
        <div className="px-2 min-w-[60px] text-center">
          <span className="text-[11px] font-black tabular-nums text-white/80">
            {Math.round(zoom * 100)}%
          </span>
        </div>

        <button 
          onClick={onZoomIn}
          className="p-1.5 hover:bg-white/10 rounded-md text-white/40 hover:text-white transition-all"
        >
          <IconMaximize size={14} />
        </button>

        <div className="w-px h-4 bg-white/10 mx-1" />

        <button 
          onClick={onResetZoom}
          className="p-1.5 hover:bg-white/10 rounded-md text-white/40 hover:text-white transition-all flex items-center gap-1.5"
        >
          <IconRotate2 size={14} />
          <span className="text-[9px] font-black uppercase">Fit</span>
        </button>
      </div>

      <div className="flex items-center gap-2 text-[10px] font-bold text-white/20">
        <span>{canvasWidth}x{canvasHeight}</span>
        <span className="opacity-50">|</span>
        <span className="uppercase">{aspectRatio}</span>
      </div>
    </div>
  )
}
