import { useState, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { IconX, IconCheck, IconRotateClockwise2, IconSparkles, IconContrast, IconBrightnessUp, IconColorSwatch, IconSunHigh, IconFocus2, IconHistory, IconCircle, IconSquare, IconStar, IconHeart, IconDiamond, IconHexagon, IconArrowsMove, IconBan, IconArrowsMaximize as IconMaximize } from '@tabler/icons-react'
import { StudioLayer } from '../../../../shared/studio'

interface Props {
  open: boolean
  onClose: () => void
  layer: StudioLayer | null
  onUpdate: (id: string, updates: Partial<StudioLayer>) => void
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>
  aspectContext?: '16:9' | '9:16'
}

const PRESETS = [
  { id: 'none', label: 'None' },
  { id: 'bw', label: 'B&W' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'vintage', label: 'Vintage' },
  { id: 'vivid', label: 'Vivid' },
  { id: 'kodachrome', label: 'Kodachrome' },
  { id: 'polaroid', label: 'Polaroid' },
  { id: 'cold', label: 'Cold' },
  { id: 'warm', label: 'Warm' },
  { id: 'faded', label: 'Faded' }
]

function EnhancementSlider({ label, icon: Icon, value, onChange, min = 0, max = 200, def = 100 }: {
  label: string; icon: any; value: number; onChange: (v: number) => void; min?: number; max?: number; def?: number
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2 text-white/60">
          <Icon size={14} />
          <label className="text-[10px] font-black uppercase tracking-widest">{label}</label>
        </div>
        <span className="text-[10px] font-mono text-white/80">{Math.round(value)}</span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range" min={min} max={max} step={1}
          value={value}
          onChange={e => onChange(parseInt(e.target.value))}
          className="flex-1 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-accent"
        />
        <button 
          onClick={() => onChange(def)}
          className="p-1 rounded hover:bg-white/5 text-white/20 hover:text-white transition-colors"
          title="Reset"
        >
          <IconRotateClockwise2 size={12} />
        </button>
      </div>
    </div>
  )
}

export function EnhancementModal({ open, onClose, layer, onUpdate, videoRefs, aspectContext }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [showOriginal, setShowOriginal] = useState(false)
  const [isDragging, setIsDragging] = useState<'mask' | 'capture' | null>(null)
  
  // Local state for instant feedback without spamming store
  const [localEnhancements, setLocalEnhancements] = useState<any>(layer?.enhancements || {})

  useEffect(() => {
    if (layer) setLocalEnhancements(layer.enhancements || {})
  }, [layer?.id])

  const apply = () => {
    if (!layer) return
    onUpdate(layer.id, { enhancements: localEnhancements })
    onClose()
  }

  useEffect(() => {
    if (!open || !layer) return
    let frameId: number
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    const render = () => {
      const video = videoRefs.current[layer.id]
      if (video && video.readyState >= 2) {
        // Adjust canvas size to match aspect ratio
        const container = containerRef.current
        const containerW = container?.clientWidth || 800
        const containerH = container?.clientHeight || 600
        const videoRatio = video.videoWidth / video.videoHeight
        
        let targetW = containerW
        let targetH = containerW / videoRatio
        
        if (targetH > containerH) {
          targetH = containerH
          targetW = containerH * videoRatio
        }

        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW
          canvas.height = targetH
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        
        if (!showOriginal) {
          const e = localEnhancements
          const getFilters = (withBlur = false) => {
            const f = []
            if (e.filterPreset && e.filterPreset !== 'none') {
              switch (e.filterPreset) {
                case 'bw': f.push('grayscale(100%)'); break
                case 'sepia': f.push('sepia(100%)'); break
                case 'vintage': f.push('sepia(50%) hue-rotate(-30deg) saturate(120%) contrast(110%)'); break
                case 'kodachrome': f.push('saturate(150%) contrast(110%) brightness(105%)'); break
                case 'polaroid': f.push('sepia(20%) saturate(140%) contrast(120%) brightness(110%)'); break
                case 'cold': f.push('hue-rotate(180deg) saturate(80%)'); break
                case 'warm': f.push('sepia(30%) saturate(120%)'); break
              }
            }
            if (e.brightness !== undefined) f.push(`brightness(${e.brightness}%)`)
            if (e.contrast !== undefined) f.push(`contrast(${e.contrast}%)`)
            if (e.saturation !== undefined) f.push(`saturate(${e.saturation}%)`)
            if (e.beauty && e.beauty > 0) {
              f.push(`blur(${(e.beauty / 100) * 2}px)`)
              f.push(`contrast(${100 + (e.beauty / 2)}%)`)
            }
            if (e.temperature !== undefined && e.temperature !== 0) {
              f.push(`hue-rotate(${e.temperature * 0.2}deg)`)
            }
            if (withBlur && e.focusCircle?.enabled) {
              f.push(`blur(${(e.focusCircle.blur / 100) * 40}px)`)
            }
            return f.join(' ')
          }

          // Apply Framing (Rounding / Shape)
          ctx.save()
          const shapeObj = typeof e.shape === 'object' ? e.shape : { type: e.shape || 'rect', x: 50, y: 50, scale: 100, scope: 'both', captureX: 50, captureY: 50 }
          const { type: shape, x: sxp, y: syp, scale: ssc, captureX = 50, captureY = 50 } = shapeObj
          
          const sx = (sxp / 100) * canvas.width
          const sy = (syp / 100) * canvas.height
          const sw = (ssc / 100) * canvas.width
          const sh = (ssc / 100) * canvas.height
          
          // Radius calculation for oval: cornerRadius 100 should be half of the smallest dimension of the MASK
          const radius = (e.cornerRadius || 0) * (Math.min(sw, sh) / 200)
          const r = Math.min(sw, sh) / 2

          // Capture Offset
          const cx = ((captureX - 50) / 100) * canvas.width
          const cy = ((captureY - 50) / 100) * canvas.height

          ctx.beginPath()
          if (shape === 'none') {
            ctx.rect(0, 0, canvas.width, canvas.height)
          } else if (shape === 'circle') {
            ctx.arc(sx, sy, r, 0, Math.PI * 2)
          } else if (shape === 'star') {
            const spikes = 5, outerR = r, innerR = r/2.5
            let rot = Math.PI/2*3, x = sx, y = sy, step = Math.PI/spikes
            ctx.moveTo(sx, sy - outerR)
            for(let i=0; i<spikes; i++) {
              x = sx + Math.cos(rot) * outerR; y = sy + Math.sin(rot) * outerR; ctx.lineTo(x, y); rot += step
              x = sx + Math.cos(rot) * innerR; y = sy + Math.sin(rot) * innerR; ctx.lineTo(x, y); rot += step
            }
            ctx.lineTo(sx, sy - outerR)
          } else if (shape === 'heart') {
            const d = r * 2.2 
            const hx = sx, hy = sy - d/4
            ctx.moveTo(hx, hy + d/4)
            ctx.bezierCurveTo(hx, hy + d/4, hx - d/2, hy, hx - d/2, hy - d/4)
            ctx.bezierCurveTo(hx - d/2, hy - d/2, hx, hy - d/2, hx, hy - d/4)
            ctx.bezierCurveTo(hx, hy - d/2, hx + d/2, hy - d/2, hx + d/2, hy - d/4)
            ctx.bezierCurveTo(hx + d/2, hy, hx, hy + d/4, hx, hy + d/4)
          } else if (shape === 'diamond') {
            ctx.moveTo(sx, sy - r); ctx.lineTo(sx + r, sy); ctx.lineTo(sx, sy + r); ctx.lineTo(sx - r, sy)
          } else if (shape === 'hexagon') {
            for(let i=0; i<6; i++) { ctx.lineTo(sx + r * Math.cos(i * Math.PI/3), sy + r * Math.sin(i * Math.PI/3)) }
          } else {
            // Rect fallback if roundRect is missing
            if (ctx.roundRect) {
              ctx.roundRect(sx - sw/2, sy - sh/2, sw, sh, radius)
            } else {
              const rx = sx - sw/2, ry = sy - sh/2
              ctx.moveTo(rx + radius, ry); ctx.lineTo(rx + sw - radius, ry); ctx.quadraticCurveTo(rx + sw, ry, rx + sw, ry + radius)
              ctx.lineTo(rx + sw, ry + sh - radius); ctx.quadraticCurveTo(rx + sw, ry + sh, rx + sw - radius, ry + sh)
              ctx.lineTo(rx + radius, ry + sh); ctx.quadraticCurveTo(rx, ry + sh, rx, ry + sh - radius)
              ctx.lineTo(rx, ry + radius); ctx.quadraticCurveTo(rx, ry, rx + radius, ry)
            }
          }
          ctx.clip()

          // Draw Base (Blurred if focus enabled)
          ctx.filter = getFilters(e.focusCircle?.enabled)
          ctx.drawImage(video, -cx, -cy, canvas.width, canvas.height)

          // Draw Sharp Area if focus circle is enabled
          if (e.focusCircle?.enabled) {
            ctx.save()
            ctx.filter = getFilters(false)
            ctx.beginPath()
            const fx = (e.focusCircle.x / 100) * canvas.width
            const fy = (e.focusCircle.y / 100) * canvas.height
            const fr = (e.focusCircle.radius / 100) * (Math.max(canvas.width, canvas.height) / 2)
            ctx.arc(fx, fy, fr, 0, Math.PI * 2)
            ctx.clip()
            ctx.drawImage(video, -cx, -cy, canvas.width, canvas.height)
            ctx.restore()
          }

          // Apply Vignette
          if (e.vignette > 0) {
            ctx.filter = 'none'
            const grad = ctx.createRadialGradient(
              canvas.width/2, canvas.height/2, 0,
              canvas.width/2, canvas.height/2, Math.max(canvas.width, canvas.height) / 1.5
            )
            const alpha = (e.vignette / 100) * 0.8
            grad.addColorStop(0, 'rgba(0,0,0,0)')
            grad.addColorStop(1, `rgba(0,0,0,${alpha})`)
            ctx.fillStyle = grad
            ctx.fillRect(0, 0, canvas.width, canvas.height)
          }
          ctx.restore()
        } else {
          ctx.filter = 'none'
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        }
      } else {
        // Fallback for non-video sources (e.g. image)
        ctx.fillStyle = '#111'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#fff'
        ctx.textAlign = 'center'
        ctx.fillText('Loading Preview...', canvas.width/2, canvas.height/2)
      }
      frameId = requestAnimationFrame(render)
    }

    frameId = requestAnimationFrame(render)
    return () => cancelAnimationFrame(frameId)
  }, [open, layer, localEnhancements, showOriginal])

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    
    // Determine if we are dragging mask or capture
    // Default to mask, but maybe check proximity if we wanted to be fancy.
    // For now, let's just use Alt key to drag capture point.
    if (e.altKey) setIsDragging('capture')
    else setIsDragging('mask')

    updateDrag(x, y, e.altKey ? 'capture' : 'mask')
  }

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))
    updateDrag(x, y, isDragging)
  }

  const updateDrag = (x: number, y: number, target: 'mask' | 'capture') => {
    const curr = typeof localEnhancements.shape === 'object' ? localEnhancements.shape : { type: localEnhancements.shape || 'rect', x: 50, y: 50, scale: 100, scope: 'both', captureX: 50, captureY: 50 }
    if (target === 'mask') {
      setLocalEnhancements({ ...localEnhancements, shape: { ...curr, x, y } })
    } else {
      setLocalEnhancements({ ...localEnhancements, shape: { ...curr, captureX: x, captureY: y } })
    }
  }

  if (!layer) return null

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-12">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/90 backdrop-blur-3xl"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-6xl aspect-[16/9] bg-[#0c0d10] border border-white/10 rounded-[32px] shadow-[0_50px_100px_rgba(0,0,0,0.8)] overflow-hidden flex"
          >
            {/* Header / Toolbar */}
            <div className="absolute top-0 left-0 right-0 h-16 border-b border-white/5 flex items-center justify-between px-8 z-10 bg-gradient-to-b from-[#0c0d10] to-transparent">
              <div className="flex items-center gap-4">
                <div className="p-2.5 rounded-xl bg-accent/10 text-accent">
                  <IconSparkles size={20} />
                </div>
                <div>
                  <h2 className="text-sm font-black text-white uppercase tracking-widest">Enhance Source</h2>
                  <p className="text-[10px] text-white/30 font-bold uppercase tracking-tight">{layer.name}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onMouseDown={() => setShowOriginal(true)}
                  onMouseUp={() => setShowOriginal(false)}
                  onMouseLeave={() => setShowOriginal(false)}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all border border-white/5"
                >
                  Hold to Compare
                </button>
                <button
                  onClick={onClose}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all border border-white/5"
                >
                  <IconX size={20} />
                </button>
              </div>
            </div>

            {/* Preview Area */}
            <div ref={containerRef} className="flex-1 flex items-center justify-center p-12 bg-black/40">
              <div className="relative group cursor-crosshair">
                <canvas 
                  ref={canvasRef} 
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={() => setIsDragging(null)}
                  onMouseLeave={() => setIsDragging(null)}
                  className="rounded-2xl shadow-2xl transition-shadow group-hover:shadow-accent/20" 
                />
                <div className="absolute top-4 left-4 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                  <p className="text-[9px] font-black uppercase text-white/50 tracking-widest flex items-center gap-2">
                    <IconArrowsMove size={12} />
                    Drag to Position Mask <span className="text-accent/60 mx-1">•</span> Hold ALT to Pan Source
                  </p>
                </div>
              </div>
            </div>

            <div className="w-[340px] border-l border-white/5 flex flex-col bg-[#0c0d10]/50 backdrop-blur-xl">
              <div className="flex-1 overflow-y-auto p-6 space-y-10 custom-scrollbar">
                
                {/* Focus Engine */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 flex items-center gap-2">
                      <IconFocus2 size={12} className="text-accent" />
                      Focus Engine
                    </h3>
                    <button 
                      onClick={() => setLocalEnhancements({ ...localEnhancements, focusCircle: { ...localEnhancements.focusCircle, enabled: !localEnhancements.focusCircle?.enabled, x: 50, y: 50, radius: 30, blur: 50 } })}
                      className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg transition-all ${localEnhancements.focusCircle?.enabled ? 'bg-accent text-black' : 'bg-white/5 text-white/30'}`}
                    >
                      {localEnhancements.focusCircle?.enabled ? 'Active' : 'Enable'}
                    </button>
                  </div>
                  
                  {localEnhancements.focusCircle?.enabled && (
                    <div className="space-y-6 animate-in slide-in-from-top-2 duration-300">
                      <EnhancementSlider 
                        label="Focus Radius" icon={IconCircle}
                        value={localEnhancements.focusCircle.radius} min={5} max={100} def={30}
                        onChange={v => setLocalEnhancements({ ...localEnhancements, focusCircle: { ...localEnhancements.focusCircle, radius: v } })}
                      />
                      <EnhancementSlider 
                        label="Background Blur" icon={IconSparkles}
                        value={localEnhancements.focusCircle.blur} min={0} max={100} def={50}
                        onChange={v => setLocalEnhancements({ ...localEnhancements, focusCircle: { ...localEnhancements.focusCircle, blur: v } })}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <EnhancementSlider 
                          label="X Position" icon={IconX}
                          value={localEnhancements.focusCircle.x} min={0} max={100} def={50}
                          onChange={v => setLocalEnhancements({ ...localEnhancements, focusCircle: { ...localEnhancements.focusCircle, x: v } })}
                        />
                        <EnhancementSlider 
                          label="Y Position" icon={IconX}
                          value={localEnhancements.focusCircle.y} min={0} max={100} def={50}
                          onChange={v => setLocalEnhancements({ ...localEnhancements, focusCircle: { ...localEnhancements.focusCircle, y: v } })}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Master Controls */}
                <div className="space-y-6">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 flex items-center gap-2">
                    <IconSunHigh size={12} className="text-accent" />
                    Master Controls
                  </h3>
                  <div className="space-y-6">
                    <EnhancementSlider 
                      label="Beauty (Smoothing)" icon={IconSparkles}
                      value={localEnhancements.beauty || 0} min={0} max={100} def={0}
                      onChange={v => setLocalEnhancements({ ...localEnhancements, beauty: v })}
                    />
                    <EnhancementSlider 
                      label="Brightness" icon={IconBrightnessUp}
                      value={localEnhancements.brightness ?? 100} 
                      onChange={v => setLocalEnhancements({ ...localEnhancements, brightness: v })}
                    />
                    <EnhancementSlider 
                      label="Contrast" icon={IconContrast}
                      value={localEnhancements.contrast ?? 100} 
                      onChange={v => setLocalEnhancements({ ...localEnhancements, contrast: v })}
                    />
                    <EnhancementSlider 
                      label="Saturation" icon={IconColorSwatch}
                      value={localEnhancements.saturation ?? 100} 
                      onChange={v => setLocalEnhancements({ ...localEnhancements, saturation: v })}
                    />
                    <EnhancementSlider 
                      label="Temperature" icon={IconSunHigh}
                      value={localEnhancements.temperature || 0} min={-100} max={100} def={0}
                      onChange={v => setLocalEnhancements({ ...localEnhancements, temperature: v })}
                    />
                    <EnhancementSlider 
                      label="Vignette" icon={IconFocus2}
                      value={localEnhancements.vignette || 0} min={0} max={100} def={0}
                      onChange={v => setLocalEnhancements({ ...localEnhancements, vignette: v })}
                    />
                  </div>
                </div>

                {/* Source Framing */}
                <div className="space-y-6">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 flex items-center gap-2">
                    <IconSquare size={12} className="text-accent" />
                    Source Framing
                  </h3>
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <label className="text-[9px] font-black uppercase text-white/40 tracking-widest">Application Scope</label>
                      <div className="flex bg-white/5 p-1 rounded-lg">
                        {[
                          { id: 'both', label: 'All' },
                          { id: '16:9', label: '16:9' },
                          { id: '9:16', label: '9:16' },
                        ].map(s => (
                          <button
                            key={s.id}
                            onClick={() => {
                              const curr = typeof localEnhancements.shape === 'object' ? localEnhancements.shape : { type: localEnhancements.shape || 'rect', x: 50, y: 50, scale: 100, scope: 'both', captureX: 50, captureY: 50 }
                              setLocalEnhancements({ ...localEnhancements, shape: { ...curr, scope: s.id } })
                            }}
                            className={`px-2 py-1 rounded-md text-[8px] font-black uppercase transition-all ${
                              (typeof localEnhancements.shape === 'object' ? localEnhancements.shape.scope : 'both') === s.id ? 'bg-white/20 text-white' : 'text-white/20 hover:text-white/40'
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { id: 'none', icon: IconBan, label: 'None' },
                        { id: 'circle', icon: IconCircle, label: 'Circle' },
                        { id: 'rect', icon: IconSquare, label: 'Square' },
                        { id: 'star', icon: IconStar, label: 'Star' },
                        { id: 'heart', icon: IconHeart, label: 'Heart' },
                        { id: 'diamond', icon: IconDiamond, label: 'Diamond' },
                        { id: 'hexagon', icon: IconHexagon, label: 'Hexagon' },
                      ].map(s => (
                        <button
                          key={s.id}
                          onClick={() => {
                            const curr = typeof localEnhancements.shape === 'object' ? localEnhancements.shape : { type: localEnhancements.shape || 'rect', x: 50, y: 50, scale: 100, scope: 'both', captureX: 50, captureY: 50 }
                            const wasUnset = !curr.type || curr.type === 'none' || curr.type === 'rect'
                            const pickingRealShape = s.id !== 'none' && s.id !== 'rect'
                            const nextScope = wasUnset && pickingRealShape && aspectContext ? aspectContext : curr.scope
                            setLocalEnhancements({ ...localEnhancements, shape: { ...curr, type: s.id, scope: nextScope } })
                          }}
                          className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all ${
                            (typeof localEnhancements.shape === 'object' ? localEnhancements.shape.type : localEnhancements.shape) === s.id
                              ? 'bg-accent/20 border-accent text-accent'
                              : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          <s.icon size={16} />
                          <span className="text-[8px] font-black uppercase mt-1 tracking-tighter">{s.label}</span>
                        </button>
                      ))}
                    </div>

                    <div className="space-y-6 p-4 bg-white/5 rounded-2xl border border-white/5">
                      {(() => {
                        const shapeType = typeof localEnhancements.shape === 'object' ? localEnhancements.shape.type : localEnhancements.shape
                        const isHeart = shapeType === 'heart'
                        return (
                          <EnhancementSlider
                            label="Mask Scale" icon={IconMaximize}
                            value={typeof localEnhancements.shape === 'object' ? localEnhancements.shape.scale : 100}
                            min={10}
                            max={isHeart ? 250 : 100}
                            def={100}
                            onChange={v => {
                              const curr = typeof localEnhancements.shape === 'object' ? localEnhancements.shape : { type: localEnhancements.shape || 'rect', x: 50, y: 50, scale: 100, scope: 'both', captureX: 50, captureY: 50 }
                              setLocalEnhancements({ ...localEnhancements, shape: { ...curr, scale: v } })
                            }}
                          />
                        )
                      })()}
                      
                      <div className="space-y-4 pt-2 border-t border-white/5">
                        <label className="text-[9px] font-black uppercase text-white/40 tracking-widest block">Capture Point (Pan/Zoom)</label>
                        <div className="grid grid-cols-2 gap-4">
                          <EnhancementSlider 
                            label="Capture X" icon={IconArrowsMove}
                            value={typeof localEnhancements.shape === 'object' ? (localEnhancements.shape.captureX ?? 50) : 50} min={0} max={100} def={50}
                            onChange={v => {
                              const curr = typeof localEnhancements.shape === 'object' ? localEnhancements.shape : { type: localEnhancements.shape || 'rect', x: 50, y: 50, scale: 100, scope: 'both', captureX: 50, captureY: 50 }
                              setLocalEnhancements({ ...localEnhancements, shape: { ...curr, captureX: v } })
                            }}
                          />
                          <EnhancementSlider 
                            label="Capture Y" icon={IconArrowsMove}
                            value={typeof localEnhancements.shape === 'object' ? (localEnhancements.shape.captureY ?? 50) : 50} min={0} max={100} def={50}
                            onChange={v => {
                              const curr = typeof localEnhancements.shape === 'object' ? localEnhancements.shape : { type: localEnhancements.shape || 'rect', x: 50, y: 50, scale: 100, scope: 'both', captureX: 50, captureY: 50 }
                              setLocalEnhancements({ ...localEnhancements, shape: { ...curr, captureY: v } })
                            }}
                          />
                        </div>
                      </div>

                      <div className="space-y-4 pt-2 border-t border-white/5">
                        <label className="text-[9px] font-black uppercase text-white/40 tracking-widest block">Mask Position</label>
                        <div className="grid grid-cols-2 gap-4">
                          <EnhancementSlider 
                            label="Mask X" icon={IconX}
                            value={typeof localEnhancements.shape === 'object' ? localEnhancements.shape.x : 50} min={0} max={100} def={50}
                            onChange={v => {
                              const curr = typeof localEnhancements.shape === 'object' ? localEnhancements.shape : { type: localEnhancements.shape || 'rect', x: 50, y: 50, scale: 100, scope: 'both', captureX: 50, captureY: 50 }
                              setLocalEnhancements({ ...localEnhancements, shape: { ...curr, x: v } })
                            }}
                          />
                          <EnhancementSlider 
                            label="Mask Y" icon={IconX}
                            value={typeof localEnhancements.shape === 'object' ? localEnhancements.shape.y : 50} min={0} max={100} def={50}
                            onChange={v => {
                              const curr = typeof localEnhancements.shape === 'object' ? localEnhancements.shape : { type: localEnhancements.shape || 'rect', x: 50, y: 50, scale: 100, scope: 'both', captureX: 50, captureY: 50 }
                              setLocalEnhancements({ ...localEnhancements, shape: { ...curr, y: v } })
                            }}
                          />
                        </div>
                      </div>
                      <EnhancementSlider 
                        label="Corner Rounding" icon={IconRotateClockwise2}
                        value={localEnhancements.cornerRadius || 0} min={0} max={100} def={0}
                        onChange={v => setLocalEnhancements({ ...localEnhancements, cornerRadius: v })}
                      />
                    </div>
                  </div>
                </div>

                {/* Style Presets */}
                <div className="space-y-4 pb-4">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 flex items-center gap-2">
                    <IconColorSwatch size={12} className="text-accent" />
                    Style Presets
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {PRESETS.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setLocalEnhancements({ ...localEnhancements, filterPreset: p.id })}
                        className={`
                          px-3 py-2.5 rounded-xl text-[11px] font-bold transition-all border
                          ${localEnhancements.filterPreset === p.id 
                            ? 'bg-accent border-accent text-black shadow-lg shadow-accent/20' 
                            : 'bg-white/10 border-white/5 text-white/70 hover:text-white hover:bg-white/20 hover:border-white/10'}
                        `}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="p-6 border-t border-white/5 grid grid-cols-2 gap-3">
                <button
                  onClick={() => setLocalEnhancements({})}
                  className="flex items-center justify-center gap-2 h-11 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-all text-xs font-bold border border-white/5"
                >
                  <IconHistory size={16} />
                  Reset All
                </button>
                <button
                  onClick={apply}
                  className="flex items-center justify-center gap-2 h-11 rounded-xl bg-accent text-black hover:scale-[1.02] active:scale-[0.98] transition-all text-xs font-black"
                >
                  <IconCheck size={18} />
                  Apply
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
