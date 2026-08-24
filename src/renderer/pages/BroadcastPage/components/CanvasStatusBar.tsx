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
    <div className="broadcast-canvas-statusbar">
      <div className="flex items-center gap-4">
        <div className="broadcast-canvas-status-chip">
          <div className={`w-1.5 h-1.5 rounded-full ${fps >= (outputFps - 2) ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <span>{fps} FPS</span>
        </div>
        <span className="broadcast-canvas-format">{format.toUpperCase()}</span>
      </div>

      <div className="broadcast-canvas-zoom">
        <button 
          onClick={onZoomOut}
          className="broadcast-canvas-icon-button is-compact"
        >
          <IconMinimize size={14} />
        </button>
        
        <div className="px-2 min-w-[60px] text-center">
          <span className="broadcast-canvas-zoom-value">
            {Math.round(zoom * 100)}%
          </span>
        </div>

        <button 
          onClick={onZoomIn}
          className="broadcast-canvas-icon-button is-compact"
        >
          <IconMaximize size={14} />
        </button>

        <div className="broadcast-canvas-divider" />

        <button 
          onClick={onResetZoom}
          className="broadcast-canvas-icon-button is-fit"
        >
          <IconRotate2 size={14} />
          <span className="text-[9px] font-semibold">Fit</span>
        </button>
      </div>

      <div className="broadcast-canvas-dimensions">
        <span>{canvasWidth}x{canvasHeight}</span>
        <span className="opacity-50">|</span>
        <span className="">{aspectRatio}</span>
      </div>
    </div>
  )
}
