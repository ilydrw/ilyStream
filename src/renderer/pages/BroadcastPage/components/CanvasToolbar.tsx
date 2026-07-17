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
    <div className="broadcast-canvas-toolbar">
      <div className="flex items-center gap-4">
        <div className="broadcast-canvas-badge">
          <IconDeviceDesktop size={14} />
          <span>
            {canvasWidth}x{canvasHeight}
          </span>
        </div>
        <Tooltip content={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} position="bottom">
          <button
            onClick={onToggleFullscreen}
            className="broadcast-canvas-icon-button"
          >
            {isFullscreen ? <IconMinimize size={16} /> : <IconMaximize size={16} />}
          </button>
        </Tooltip>
      </div>
      
      <div className="flex items-center gap-2">
        <div className="broadcast-canvas-control-group">
          <Tooltip content={snapToGrid ? 'Snap to grid on' : 'Snap to grid off'} position="bottom">
            <button
              onClick={onToggleSnapToGrid}
              aria-pressed={snapToGrid}
              className={`broadcast-canvas-icon-button is-compact ${snapToGrid ? 'is-active' : ''}`}
            >
              <IconMagnet size={15} />
            </button>
          </Tooltip>
          <div className={`flex items-center gap-1 pl-1 transition-opacity ${snapToGrid ? 'opacity-100' : 'opacity-35'}`}>
            <IconGridDots size={14} />
            <select
              value={gridSize}
              onChange={(event) => onGridSizeChange(Number(event.target.value))}
              disabled={!snapToGrid}
              className="broadcast-canvas-grid-select"
            >
              {gridSizeOptions.map(size => (
                <option key={size} value={size}>{size}px</option>
              ))}
            </select>
          </div>
        </div>
        <button 
          onClick={onResetView}
          className="broadcast-canvas-reset group"
        >
          <IconRotate2 size={14} className="group-hover:rotate-[-45deg] transition-transform" />
          <span>Reset view</span>
        </button>
      </div>
    </div>
  )
}
