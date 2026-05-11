import {IconX, IconZoomIn, IconZoomOut, IconArrowsMove, IconRotate2, IconDeviceFloppy, IconRotateClockwise2, IconGridDots, IconHash, IconChevronUp, IconChevronDown, IconChevronLeft, IconChevronRight, IconFlipHorizontal, IconFlipVertical, IconSquare, IconCircle, IconHexagon, IconDiamond, IconStar, IconTriangle, IconOvalVertical} from '@tabler/icons-react'
import { useState, useEffect } from 'react'
import { AssetFile } from '../../../hooks/useAssets'
import { motion, AnimatePresence } from 'framer-motion'

interface ImageAdjustmentModalProps {
  image: AssetFile
  isOpen: boolean
  onClose: () => void
}

export type AssetShape = 'rectangle' | 'circle' | 'ellipse' | 'hexagon' | 'diamond' | 'star' | 'triangle'

const SHAPE_CLIP: Record<AssetShape, string> = {
  rectangle: 'none',
  circle: 'circle(50% at 50% 50%)',
  ellipse: 'ellipse(50% 50% at 50% 50%)',
  hexagon: 'polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0% 50%)',
  diamond: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
  star: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
  triangle: 'polygon(50% 0%, 100% 100%, 0% 100%)'
}

const SHAPE_OPTIONS: Array<{ id: AssetShape; label: string; Icon: typeof IconSquare }> = [
  { id: 'rectangle', label: 'Rect', Icon: IconSquare },
  { id: 'circle', label: 'Circle', Icon: IconCircle },
  { id: 'ellipse', label: 'Oval', Icon: IconOvalVertical },
  { id: 'hexagon', label: 'Hex', Icon: IconHexagon },
  { id: 'diamond', label: 'Diamond', Icon: IconDiamond },
  { id: 'star', label: 'Star', Icon: IconStar },
  { id: 'triangle', label: 'Tri', Icon: IconTriangle }
]

export interface ImageAdjustment {
  zoom: number
  x: number
  y: number
  rotation: number
  flipX?: boolean
  flipY?: boolean
  shape?: AssetShape
  rounding?: number
  aspect?: 'square' | 'wide' | 'tall'
}

const DEFAULT_ADJUSTMENT: ImageAdjustment = {
  zoom: 1, x: 0, y: 0, rotation: 0, flipX: false, flipY: false,
  shape: 'rectangle', rounding: 0, aspect: 'square'
}

export function ImageAdjustmentModal({ image, isOpen, onClose }: ImageAdjustmentModalProps) {
  const [adjustment, setAdjustment] = useState<ImageAdjustment>(DEFAULT_ADJUSTMENT)
  const [initialAdjustment, setInitialAdjustment] = useState<ImageAdjustment | null>(null)
  const [isSnapping, setIsSnapping] = useState(false)
  const [activeTool, setActiveTool] = useState<'move' | 'rotate'>('move')

  useEffect(() => {
    if (isOpen && image?.id) {
      const saved = localStorage.getItem(`asset_adjust_${image.id}`)
      let data: ImageAdjustment = { ...DEFAULT_ADJUSTMENT }
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          data = { ...data, ...parsed }
        } catch (e) {
          console.error('Failed to load image adjustment', e)
        }
      }
      setAdjustment(data)
      setInitialAdjustment(data)
    }
  }, [isOpen, image.id])

  const hasChanges = initialAdjustment && (
    Math.abs(adjustment.zoom - initialAdjustment.zoom) > 0.001 ||
    Math.abs(adjustment.x - initialAdjustment.x) > 0.1 ||
    Math.abs(adjustment.y - initialAdjustment.y) > 0.1 ||
    Math.abs(adjustment.rotation - (initialAdjustment.rotation || 0)) > 0.1 ||
    adjustment.flipX !== initialAdjustment.flipX ||
    adjustment.flipY !== initialAdjustment.flipY ||
    (adjustment.shape ?? 'rectangle') !== (initialAdjustment.shape ?? 'rectangle') ||
    Math.abs((adjustment.rounding ?? 0) - (initialAdjustment.rounding ?? 0)) > 0.1 ||
    (adjustment.aspect ?? 'square') !== (initialAdjustment.aspect ?? 'square')
  )

  const snap = (val: number, step: number) => {
    if (!isSnapping) return val
    return Math.round(val / step) * step
  }

  const nudge = (axis: 'x' | 'y', amount: number) => {
    setAdjustment(prev => ({
      ...prev,
      [axis]: prev[axis] + (isSnapping ? amount : amount / 5)
    }))
  }

  const handleSave = () => {
    if (!hasChanges) return
    localStorage.setItem(`asset_adjust_${image.id}`, JSON.stringify(adjustment))
    window.dispatchEvent(new CustomEvent('asset-adjustment-updated', { detail: { id: image.id, adjustment } }))
    onClose()
  }

  const reset = () => {
    setAdjustment({ ...DEFAULT_ADJUSTMENT })
  }

  const currentShape = adjustment.shape ?? 'rectangle'
  const currentRounding = adjustment.rounding ?? 0
  const currentAspect = adjustment.aspect ?? 'square'
  const aspectClass = currentAspect === 'wide' ? 'aspect-video' : currentAspect === 'tall' ? 'aspect-[9/16]' : 'aspect-square'

  if (!isOpen) return null

  const imageUrl = `asset:///app/${encodeURIComponent(image.id)}`

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-8 bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[1280px] h-[min(820px,95vh)] bg-[#0c0d0f] border border-white/10 rounded-xl overflow-hidden shadow-2xl flex flex-col"
      >
        {/* Minimal Header */}
        <div className="h-12 border-b border-white/5 flex items-center justify-between px-6 bg-[#0c0d0f]">
          <div className="flex items-center gap-3">
             <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Asset Adjuster</span>
             <div className="w-[1px] h-3 bg-white/10" />
             <span className="text-[10px] font-medium text-white/20 uppercase tracking-widest truncate max-w-[200px]">{image.name}</span>
          </div>
          <button onClick={onClose} className="text-white/20 hover:text-white transition-all"><IconX size={16} /></button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Simple Toolbar */}
          <div className="w-12 border-r border-white/5 flex flex-col items-center py-6 gap-4">
             <button
               onClick={() => setActiveTool('move')}
               className={`w-8 h-8 rounded-md flex items-center justify-center transition-all ${activeTool === 'move' ? 'bg-white text-black' : 'text-white/20 hover:bg-white/5'}`}
             >
               <IconArrowsMove size={16} />
             </button>
             <button
               onClick={() => setActiveTool('rotate')}
               className={`w-8 h-8 rounded-md flex items-center justify-center transition-all ${activeTool === 'rotate' ? 'bg-white text-black' : 'text-white/20 hover:bg-white/5'}`}
             >
               <IconRotateClockwise2 size={16} />
             </button>
             <div className="w-6 h-[1px] bg-white/5 my-1" />
             <button
               onClick={() => setIsSnapping(!isSnapping)}
               className={`w-8 h-8 rounded-md flex items-center justify-center transition-all ${isSnapping ? 'text-white bg-white/10' : 'text-white/20 hover:bg-white/5'}`}
             >
               <IconGridDots size={16} />
             </button>
          </div>

          {/* Minimal Canvas */}
          <div className="flex-1 relative bg-[#08090a] flex items-center justify-center overflow-hidden">
             <div className="absolute inset-0 opacity-[0.02] pointer-events-none"
                  style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

             <div className="w-full h-full flex items-center justify-center p-6">
                <div
                  className={`relative ${aspectClass} flex items-center justify-center overflow-hidden border border-white/5 shadow-inner bg-[#1a1c1e]`}
                  style={{
                    width: currentAspect === 'tall' ? 'auto' : '100%',
                    height: currentAspect === 'tall' ? '100%' : 'auto',
                    maxWidth: currentAspect === 'tall' ? '440px' : '720px',
                    maxHeight: '720px',
                    backgroundImage: 'conic-gradient(#111 90deg, #16181a 90deg 180deg, #111 180deg 270deg, #16181a 270deg)',
                    backgroundSize: '20px 20px',
                    clipPath: SHAPE_CLIP[currentShape],
                    borderRadius: currentShape === 'rectangle' ? `${currentRounding}%` : undefined
                  }}
                >
                   <div className="absolute inset-0 pointer-events-none z-10 opacity-10">
                      <div className="absolute top-1/2 left-0 right-0 h-[0.5px] bg-white/20" />
                      <div className="absolute left-1/2 top-0 bottom-0 w-[0.5px] bg-white/20" />
                   </div>

                    <motion.img
                      src={imageUrl}
                      className="max-w-none cursor-move select-none"
                      animate={{
                        scaleX: (adjustment.flipX ? -1 : 1) * adjustment.zoom,
                        scaleY: (adjustment.flipY ? -1 : 1) * adjustment.zoom,
                        x: adjustment.x,
                        y: adjustment.y,
                        rotate: adjustment.rotation
                      }}
                      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                      drag
                      dragMomentum={false}
                      onDragEnd={(_, info) => {
                         setAdjustment(prev => ({
                             ...prev,
                             x: snap(prev.x + info.offset.x, 5),
                             y: snap(prev.y + info.offset.y, 5)
                         }))
                      }}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      alt="Asset"
                      draggable={false}
                    />
                </div>
             </div>
          </div>

          {/* Minimal Controls */}
          <div className="w-[300px] border-l border-white/5 bg-[#0c0d0f] flex flex-col">
             <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                {/* Scale */}
                <div className="space-y-4">
                   <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Scale</span>
                      <span className="text-[10px] font-mono text-white/60">{Math.round(adjustment.zoom * 100)}%</span>
                   </div>
                   <div className="flex items-center gap-2">
                      <button onClick={() => setAdjustment(prev => ({ ...prev, zoom: Math.max(0.1, prev.zoom - 0.2) }))} className="w-8 h-8 rounded-md bg-white/5 flex items-center justify-center text-white/20 hover:text-white transition-all"><IconZoomOut size={14} /></button>
                      <input
                        type="range" min="0.1" max="8" step="0.01" value={adjustment.zoom}
                        onChange={e => setAdjustment(prev => ({ ...prev, zoom: parseFloat(e.target.value) }))}
                        className="flex-1 h-1 bg-white/5 rounded-full appearance-none cursor-pointer accent-white"
                      />
                      <button onClick={() => setAdjustment(prev => ({ ...prev, zoom: Math.min(8, prev.zoom + 0.2) }))} className="w-8 h-8 rounded-md bg-white/5 flex items-center justify-center text-white/20 hover:text-white transition-all"><IconZoomIn size={14} /></button>
                   </div>
                </div>

                {/* Flip & Mirror */}
                <div className="space-y-4">
                   <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Mirror & Flip</span>
                   <div className="flex gap-2">
                      <button
                        onClick={() => setAdjustment(prev => ({ ...prev, flipX: !prev.flipX }))}
                        className={`flex-1 h-12 rounded-md flex items-center justify-center gap-2 text-[10px] font-bold transition-all ${adjustment.flipX ? 'bg-white text-black' : 'bg-white/5 text-white/40 hover:text-white'}`}
                      >
                         <IconFlipHorizontal size={16} /> Mirror
                      </button>
                      <button
                        onClick={() => setAdjustment(prev => ({ ...prev, flipY: !prev.flipY }))}
                        className={`flex-1 h-12 rounded-md flex items-center justify-center gap-2 text-[10px] font-bold transition-all ${adjustment.flipY ? 'bg-white text-black' : 'bg-white/5 text-white/40 hover:text-white'}`}
                      >
                         <IconFlipVertical size={16} /> Flip
                      </button>
                   </div>
                </div>

                {/* Rotation */}
                <div className="space-y-4">
                   <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Rotation</span>
                      <span className="text-[10px] font-mono text-white/60">{Math.round(adjustment.rotation)}°</span>
                   </div>
                   <input
                     type="range" min="-180" max="180" step={isSnapping ? 15 : 1} value={adjustment.rotation}
                     onChange={e => setAdjustment(prev => ({ ...prev, rotation: parseFloat(e.target.value) }))}
                     className="w-full h-1 bg-white/5 rounded-full appearance-none cursor-pointer accent-white"
                   />
                   <div className="flex gap-2">
                      <button onClick={() => setAdjustment(prev => ({ ...prev, rotation: snap(prev.rotation - 90, 90) }))} className="flex-1 h-10 bg-white/5 rounded-md text-white/40 hover:text-white transition-all text-[10px] font-bold">-90°</button>
                      <button onClick={() => setAdjustment(prev => ({ ...prev, rotation: snap(prev.rotation + 90, 90) }))} className="flex-1 h-10 bg-white/5 rounded-md text-white/40 hover:text-white transition-all text-[10px] font-bold">+90°</button>
                   </div>
                </div>

                {/* Shape */}
                <div className="space-y-4">
                   <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Shape</span>
                   <div className="grid grid-cols-4 gap-2">
                      {SHAPE_OPTIONS.map(({ id, label, Icon }) => {
                         const active = currentShape === id
                         return (
                            <button
                              key={id}
                              onClick={() => setAdjustment(prev => ({ ...prev, shape: id }))}
                              className={`h-12 rounded-md flex flex-col items-center justify-center gap-0.5 text-[9px] font-bold uppercase tracking-wider transition-all ${active ? 'bg-white text-black' : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10'}`}
                              title={label}
                            >
                               <Icon size={14} />
                               <span>{label}</span>
                            </button>
                         )
                      })}
                   </div>
                </div>

                {/* Frame Aspect */}
                <div className="space-y-4">
                   <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Frame</span>
                   <div className="flex gap-2">
                      {(['square', 'wide', 'tall'] as const).map(opt => {
                         const active = currentAspect === opt
                         return (
                            <button
                              key={opt}
                              onClick={() => setAdjustment(prev => ({ ...prev, aspect: opt }))}
                              className={`flex-1 h-10 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${active ? 'bg-white text-black' : 'bg-white/5 text-white/40 hover:text-white'}`}
                            >
                               {opt === 'square' ? '1:1' : opt === 'wide' ? '16:9' : '9:16'}
                            </button>
                         )
                      })}
                   </div>
                </div>

                {/* Rounding */}
                <div className="space-y-4">
                   <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Rounding</span>
                      <span className="text-[10px] font-mono text-white/60">{Math.round(currentRounding)}%</span>
                   </div>
                   <input
                     type="range" min="0" max="50" step="1"
                     value={currentRounding}
                     disabled={currentShape !== 'rectangle'}
                     onChange={e => setAdjustment(prev => ({ ...prev, rounding: parseFloat(e.target.value) }))}
                     className="w-full h-1 bg-white/5 rounded-full appearance-none cursor-pointer accent-white disabled:opacity-30 disabled:cursor-not-allowed"
                   />
                   <p className="text-[9px] text-white/20 leading-relaxed">
                      {currentShape === 'rectangle'
                         ? 'Slide to 50% for a full oval / circle on the selected frame.'
                         : 'Only applies when shape is set to Rectangle.'}
                   </p>
                </div>

                {/* Slight Nudge */}
                <div className="space-y-4 pt-2">
                   <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest px-1">Nudge</span>
                   <div className="flex flex-col items-center gap-1">
                      <button onClick={() => nudge('y', -5)} className="w-14 h-10 bg-white/5 rounded-t-md flex items-center justify-center hover:bg-white/10 text-white/20 hover:text-white transition-all"><IconChevronUp size={18} /></button>
                      <div className="flex gap-1">
                         <button onClick={() => nudge('x', -5)} className="w-14 h-10 bg-white/5 rounded-l-md flex items-center justify-center hover:bg-white/10 text-white/20 hover:text-white transition-all"><IconChevronLeft size={18} /></button>
                         <div className="w-10 h-10 flex items-center justify-center text-[8px] font-bold text-white/5">POS</div>
                         <button onClick={() => nudge('x', 5)} className="w-14 h-10 bg-white/5 rounded-r-md flex items-center justify-center hover:bg-white/10 text-white/20 hover:text-white transition-all"><IconChevronRight size={18} /></button>
                      </div>
                      <button onClick={() => nudge('y', 5)} className="w-14 h-10 bg-white/5 rounded-b-md flex items-center justify-center hover:bg-white/10 text-white/20 hover:text-white transition-all"><IconChevronDown size={18} /></button>
                   </div>
                </div>

                <button onClick={reset} className="w-full py-4 text-red-500/30 hover:text-red-500/60 transition-all text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                   <IconRotate2 size={12} /> Reset
                </button>
             </div>

             {/* Slight Rounding Actions */}
             <div className="p-6 border-t border-white/5 space-y-3">
                <button
                   onClick={onClose}
                   className="w-full h-12 rounded-md bg-white/5 hover:bg-white/10 text-white/20 hover:text-white transition-all text-[10px] font-bold uppercase tracking-widest"
                >
                   Discard
                </button>
                <button
                   onClick={handleSave}
                   disabled={!hasChanges}
                   className={`w-full h-14 rounded-md transition-all duration-300 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-3 ${
                      hasChanges
                         ? 'bg-white text-black'
                         : 'bg-white/5 text-white/10 cursor-not-allowed'
                   }`}
                >
                   <IconDeviceFloppy size={16} /> Apply Changes
                </button>
             </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
