import {IconDeviceDesktop, IconGridDots, IconMagnet, IconMaximize, IconMinimize, IconRotate2} from '@tabler/icons-react'
import { Tooltip } from '../../../components/ui/Tooltip'

interface CanvasToolbarProps {
  canvasWidth: number
  canvasHeight: number
  isFullscreen: boolean
  snapToGrid: boolean
  gridSize: number
  onToggleFullscreen: () => void
  onResetView: () => void
  onToggleSnapToGrid: () => void
  onGridSizeChange: (size: number) => void
}

const GRID_SIZE_OPTIONS = [5, 10, 20, 40, 80]

export function CanvasToolbar({
  canvasWidth,
  canvasHeight,
  isFullscreen,
  snapToGrid,
  gridSize,
  onToggleFullscreen,
  onResetView,
  onToggleSnapToGrid,
  onGridSizeChange
}: CanvasToolbarProps) {
  const gridSizeOptions = GRID_SIZE_OPTIONS.includes(gridSize)
    ? GRID_SIZE_OPTIONS
    : [...GRID_SIZE_OPTIONS, gridSize].sort((a, b) => a - b)

  return (
    <div className="h-12 px-4 border-b border-white/5 flex items-center justify-between bg-black/20 z-20">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 border border-white/10">
          <IconDeviceDesktop size={14} className="text-accent" />
          <span className="text-[10px] font-semibold tracking-tighter text-white/60">
            {canvasWidth}x{canvasHeight}
          </span>
        </div>
        <Tooltip content={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} position="bottom">
          <button
            onClick={onToggleFullscreen}
            className="p-2 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors cursor-pointer"
          >
            {isFullscreen ? <IconMinimize size={16} /> : <IconMaximize size={16} />}
          </button>
        </Tooltip>
      </div>
      
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded bg-white/[0.035] border border-white/10 px-1.5 py-1">
          <Tooltip content={snapToGrid ? 'Snap to grid on' : 'Snap to grid off'} position="bottom">
            <button
              onClick={onToggleSnapToGrid}
              aria-pressed={snapToGrid}
              className={`h-7 w-7 grid place-items-center rounded transition-all cursor-pointer ${snapToGrid ? 'bg-accent/20 text-accent ring-1 ring-accent/30' : 'text-white/35 hover:bg-white/10 hover:text-white/70'}`}
            >
              <IconMagnet size={15} />
            </button>
          </Tooltip>
          <div className={`flex items-center gap-1 pl-1 transition-opacity ${snapToGrid ? 'opacity-100' : 'opacity-35'}`}>
            <IconGridDots size={14} className="text-white/40" />
            <select
              value={gridSize}
              onChange={(event) => onGridSizeChange(Number(event.target.value))}
              disabled={!snapToGrid}
              className="h-7 bg-transparent text-[10px] font-semibold tracking-tight text-white/65 outline-none disabled:cursor-not-allowed cursor-pointer"
            >
              {gridSizeOptions.map(size => (
                <option key={size} value={size}>{size}px</option>
              ))}
            </select>
          </div>
        </div>
        <button 
          onClick={onResetView}
          className="flex items-center gap-2 px-3 py-1.5 rounded bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-all group cursor-pointer"
        >
          <IconRotate2 size={14} className="group-hover:rotate-[-45deg] transition-transform" />
          <span className="text-[10px] font-semibold tracking-tight">Reset View</span>
        </button>
      </div>
    </div>
  )
}
