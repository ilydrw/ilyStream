import { useState, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { IconX, IconCheck, IconRotateClockwise2, IconSparkles, IconContrast, IconBrightnessUp, IconColorSwatch, IconSunHigh, IconFocus2, IconHistory, IconCircle, IconSquare, IconStar, IconHeart, IconDiamond, IconHexagon, IconArrowsMove, IconBan, IconPhoto, IconPalette, IconBlur, IconArrowsMaximize as IconMaximize } from '@tabler/icons-react'
import { StudioLayer } from '../../../../shared/studio'
import { segmentationService } from '../../../services/SegmentationService'
import { traceShapePath } from './CanvasEditor.utils'

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

import { Modal } from '../../../components/ui/Modal'

export function EnhancementModal({ open, onClose, layer, onUpdate, videoRefs, aspectContext }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [showOriginal, setShowOriginal] = useState(false)
  const [isDragging, setIsDragging] = useState<'mask' | 'capture' | null>(null)

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
          const vb = e.virtualBackground
          const isVbEnabled = vb?.enabled
          const isCamera = layer.type === 'camera'

          if (isVbEnabled && isCamera) {
            segmentationService.processVideo(layer.id, video)
          }

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
            if (e.blur > 0) {
              f.push(`blur(${(e.blur / 100) * 20}px)`)
            }
            return f.join(' ')
          }

          ctx.save()
          const shapeObj = typeof e.shape === 'object' ? e.shape : { type: e.shape || 'rect', x: 50, y: 50, scale: 100, scope: 'both', captureX: 50, captureY: 50 }
          const { type: shape, x: sxp, y: syp, scale: ssc, captureX = 50, captureY = 50 } = shapeObj

          const sx = (sxp / 100) * canvas.width
          const sy = (syp / 100) * canvas.height
          const sw = (ssc / 100) * canvas.width
          const sh = (ssc / 100) * canvas.height

          const radius = (e.cornerRadius || 0) * (Math.min(sw, sh) / 200)
          const r = Math.min(sw, sh) / 2

          const cx = ((captureX - 50) / 100) * canvas.width
          const cy = ((captureY - 50) / 100) * canvas.height

          traceShapePath(ctx, shape === 'none' ? 'rect' : shape, sx, sy, r, sw, sh, radius)

          if (shapeObj.shadow?.enabled) {
            ctx.save()
            const s = shapeObj.shadow
            ctx.shadowColor = s.color || '#000000'
            ctx.shadowBlur = s.blur ?? 15
            ctx.shadowOffsetX = s.offsetX ?? 0
            ctx.shadowOffsetY = s.offsetY ?? 10
            ctx.fillStyle = 'black'
            ctx.fill()
            ctx.restore()
          }

          ctx.clip()

          const maskResult = isVbEnabled && isCamera ? segmentationService.getMask(layer.id) : null

          if (maskResult && maskResult.mask) {
            const tempCanvas = document.createElement('canvas')
            tempCanvas.width = canvas.width
            tempCanvas.height = canvas.height
            const tCtx = tempCanvas.getContext('2d')
            if (tCtx) {
              tCtx.filter = getFilters(e.focusCircle?.enabled)
              tCtx.drawImage(video, -cx, -cy, canvas.width, canvas.height)
              tCtx.globalCompositeOperation = 'destination-in'
              tCtx.drawImage(maskResult.mask, -cx, -cy, canvas.width, canvas.height)
              ctx.drawImage(tempCanvas, 0, 0)
            }
          } else {
            ctx.filter = getFilters(e.focusCircle?.enabled)
            ctx.drawImage(video, -cx, -cy, canvas.width, canvas.height)
          }

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

          // --- PREVIEW BORDER ---
          if (shape !== 'none' && shapeObj.border?.enabled) {
            const b = shapeObj.border
            ctx.save()
            traceShapePath(ctx, shape, sx, sy, r, sw, sh, radius)

            const vol = (window as any).__masterVolume || 0
            const sensitivity = (b.reactivity ?? 100) / 100
            const reactiveScale = b.audioReactive ? 1 + (vol * 1.5 * sensitivity) : 1

            ctx.lineWidth = ((b.thickness || 4) * (canvas.width / 1920)) * reactiveScale // Scale thickness for preview
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'
            ctx.globalAlpha = Math.min(1, ((b.opacity ?? 100) / 100) * (b.audioReactive ? 0.8 + vol * 0.4 : 1))

            if (b.type === 'chroma') {
              const grad = ctx.createLinearGradient(sx - r, sy - r, sx + r, sy + r)
              const time = performance.now() / 2000
              grad.addColorStop(0, `hsl(${(time * 360) % 360}, 100%, 50%)`)
              grad.addColorStop(0.5, `hsl(${(time * 360 + 180) % 360}, 100%, 50%)`)
              grad.addColorStop(1, `hsl(${(time * 360 + 360) % 360}, 100%, 50%)`)
              ctx.strokeStyle = grad
              ctx.shadowBlur = 15 * reactiveScale
              ctx.shadowColor = `hsl(${(time * 360) % 360}, 100%, 50%)`
            } else if (b.type === 'cyber') {
              const grad = ctx.createLinearGradient(sx - r, sy, sx + r, sy)
              grad.addColorStop(0, '#00f2ff')
              grad.addColorStop(1, '#d035f1')
              ctx.strokeStyle = grad
              ctx.shadowBlur = 20 * reactiveScale
              ctx.shadowColor = '#d035f1'
            } else {
              ctx.strokeStyle = b.color || '#ffffff'
            }

            ctx.stroke()
            ctx.restore()
          }
        } else {
          ctx.filter = 'none'
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        }

        // --- DRAW VIRTUAL BACKGROUNDS ---
        const e = localEnhancements
        const vb = e.virtualBackground
        if (vb?.enabled && !showOriginal) {
          ctx.save()
          ctx.globalCompositeOperation = 'destination-over'
          ctx.globalAlpha = (vb.opacity ?? 100) / 100

          if (vb.type === 'color' && vb.value) {
            ctx.fillStyle = vb.value
            ctx.fillRect(0, 0, canvas.width, canvas.height)
          } else if (vb.type === 'image' && vb.value) {
            let img = (window as any)._vbImageCache?.[vb.value]
            if (!img) {
              img = new Image()
              img.src = `file://${vb.value}`
              if (!(window as any)._vbImageCache) (window as any)._vbImageCache = {}
              ;(window as any)._vbImageCache[vb.value] = img
            }
            if (img.complete) {
              if (vb.blurStrength) ctx.filter = `blur(${vb.blurStrength / 4}px)`
              const mode = vb.scalingMode || 'cover'
              if (mode === 'stretch') {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
              } else {
                const imgRatio = img.width / img.height
                const containerRatio = canvas.width / canvas.height
                let sw, sh, sx, sy
                if (mode === 'cover') {
                  if (imgRatio > containerRatio) {
                    sh = img.height; sw = img.height * containerRatio
                    sx = (img.width - sw) / 2; sy = 0
                  } else {
                    sw = img.width; sh = img.width / containerRatio
                    sx = 0; sy = (img.height - sh) / 2
                  }
                } else {
                  if (imgRatio > containerRatio) {
                    sw = img.width; sh = img.width / containerRatio
                    sx = 0; sy = (img.height - sh) / 2
                  } else {
                    sh = img.height; sw = img.height * containerRatio
                    sx = (img.width - sw) / 2; sy = 0
                  }
                }
                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
              }
            }
          } else if (vb.type === 'blur') {
            ctx.filter = `blur(${vb.blurStrength || 20}px) brightness(70%)`
            ctx.drawImage(video, -20, -20, canvas.width + 40, canvas.height + 40)
          }
          ctx.restore()
        }
      } else {
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
    <Modal
      open={open}
      onClose={onClose}
      className="max-w-6xl aspect-[16/9] h-auto !rounded-[32px]"
      noScroll
      headerActions={
        <div className="flex items-center gap-4">
          <div className="p-2.5 rounded-xl bg-accent/10 text-accent">
            <IconSparkles size={20} />
          </div>
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-widest leading-none">Enhance Source</h2>
            <p className="text-[10px] text-white/30 font-bold uppercase tracking-tight mt-1">{layer.name}</p>
          </div>
        </div>
      }
    >
      <div className="flex h-full min-h-0">
        {/* Preview Area */}
        <div ref={containerRef} className="flex-1 flex flex-col min-w-0 bg-black/40">
          <div className="flex-1 flex items-center justify-center p-12 relative overflow-hidden">
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

          <div className="p-4 border-t border-white/5 flex items-center justify-center gap-4">
            <button
              onMouseDown={() => setShowOriginal(true)}
              onMouseUp={() => setShowOriginal(false)}
              onMouseLeave={() => setShowOriginal(false)}
              className="px-6 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all border border-white/5"
            >
              Hold to Compare Original
            </button>
          </div>
        </div>

        <div className="w-[340px] border-l border-white/5 flex flex-col bg-[#0c0d10]/50 backdrop-blur-xl">
          <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
            {/* Focus Engine */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 flex items-center gap-2">
                  <IconFocus2 size={12} className="text-accent" />
                  Focus Engine
                </h3>
                <button
                  onClick={() => setLocalEnhancements({ ...localEnhancements, focusCircle: { ...localEnhancements.focusCircle, enabled: !localEnhancements.focusCircle?.enabled, x: 50, y: 50, radius: 30, blur: 50 } })}
                  className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg transition-all ${localEnhancements.focusCircle?.enabled ? 'bg-brand-gradient text-white shadow-glow' : 'bg-white/5 text-white/30'}`}
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
                <EnhancementSlider
                  label="Global Blur" icon={IconSparkles}
                  value={localEnhancements.blur || 0} min={0} max={100} def={0}
                  onChange={v => setLocalEnhancements({ ...localEnhancements, blur: v })}
                />
              </div>
            </div>

            {/* Chroma Key */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 flex items-center gap-2">
                  <IconColorSwatch size={12} className="text-accent" />
                  Chroma Key
                </h3>
                <button
                  onClick={() => setLocalEnhancements({
                    ...localEnhancements,
                    chromaKey: {
                      enabled: !localEnhancements.chromaKey?.enabled,
                      color: '#00ff00',
                      similarity: 40,
                      smoothness: 10,
                      spill: 10
                    }
                  })}
                  className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg transition-all ${localEnhancements.chromaKey?.enabled ? 'bg-brand-gradient text-white shadow-glow' : 'bg-white/5 text-white/30'}`}
                >
                  {localEnhancements.chromaKey?.enabled ? 'Active' : 'Enable'}
                </button>
              </div>

              {localEnhancements.chromaKey?.enabled && (
                <div className="space-y-6 animate-in slide-in-from-top-2 duration-300">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase text-white/40 tracking-widest block">Key Color</label>
                    <div className="flex items-center gap-3 bg-white/5 p-2 rounded-xl border border-white/5">
                      <input
                        type="color"
                        value={localEnhancements.chromaKey.color}
                        onChange={e => setLocalEnhancements({ ...localEnhancements, chromaKey: { ...localEnhancements.chromaKey, color: e.target.value } })}
                        className="w-8 h-8 rounded-lg border-0 bg-transparent cursor-pointer"
                      />
                      <input
                        type="text"
                        value={localEnhancements.chromaKey.color}
                        onChange={e => setLocalEnhancements({ ...localEnhancements, chromaKey: { ...localEnhancements.chromaKey, color: e.target.value } })}
                        className="flex-1 bg-transparent border-0 text-[11px] font-mono text-white/60 focus:text-white outline-none"
                      />
                    </div>
                  </div>
                  <EnhancementSlider
                    label="Similarity" icon={IconSparkles}
                    value={localEnhancements.chromaKey.similarity} min={1} max={100} def={40}
                    onChange={v => setLocalEnhancements({ ...localEnhancements, chromaKey: { ...localEnhancements.chromaKey, similarity: v } })}
                  />
                  <EnhancementSlider
                    label="Smoothness" icon={IconSparkles}
                    value={localEnhancements.chromaKey.smoothness} min={0} max={100} def={10}
                    onChange={v => setLocalEnhancements({ ...localEnhancements, chromaKey: { ...localEnhancements.chromaKey, smoothness: v } })}
                  />
                  <EnhancementSlider
                    label="Spill Reduction" icon={IconSparkles}
                    value={localEnhancements.chromaKey.spill} min={0} max={100} def={10}
                    onChange={v => setLocalEnhancements({ ...localEnhancements, chromaKey: { ...localEnhancements.chromaKey, spill: v } })}
                  />
                </div>
              )}
            </div>

            {/* Virtual Background */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 flex items-center gap-2">
                  <IconPhoto size={12} className="text-accent" />
                  Virtual Background
                </h3>
                <button
                  onClick={() => setLocalEnhancements({
                    ...localEnhancements,
                    virtualBackground: {
                      enabled: !localEnhancements.virtualBackground?.enabled,
                      type: 'image',
                      value: '',
                      blurStrength: 20,
                      opacity: 100,
                      scalingMode: 'cover'
                    }
                  })}
                  className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg transition-all ${localEnhancements.virtualBackground?.enabled ? 'bg-brand-gradient text-white shadow-glow' : 'bg-white/5 text-white/30'}`}
                >
                  {localEnhancements.virtualBackground?.enabled ? 'Active' : 'Enable'}
                </button>
              </div>

              {localEnhancements.virtualBackground?.enabled && (
                <div className="space-y-6 animate-in slide-in-from-top-2 duration-300">
                  <div className="flex bg-white/5 p-1 rounded-xl">
                    {[
                      { id: 'image', label: 'Image', icon: IconPhoto },
                      { id: 'color', label: 'Color', icon: IconPalette },
                      { id: 'blur', label: 'Blur', icon: IconBlur },
                    ].map(t => (
                      <button
                        key={t.id}
                        onClick={() => setLocalEnhancements({ ...localEnhancements, virtualBackground: { ...localEnhancements.virtualBackground, type: t.id as any } })}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${
                          localEnhancements.virtualBackground?.type === t.id ? 'bg-white/20 text-white' : 'text-white/20 hover:text-white/40'
                        }`}
                      >
                        <t.icon size={12} />
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {localEnhancements.virtualBackground?.type === 'image' && (
                    <div className="space-y-3">
                      <button
                        onClick={async () => {
                          const path = await (window as any).api.studio.selectFile({ filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] })
                          if (path) setLocalEnhancements({ ...localEnhancements, virtualBackground: { ...localEnhancements.virtualBackground, value: path } })
                        }}
                        className="w-full h-24 rounded-2xl border-2 border-dashed border-white/10 hover:border-accent/40 bg-white/5 hover:bg-white/10 transition-all flex flex-col items-center justify-center gap-2 group"
                      >
                        {localEnhancements.virtualBackground?.value ? (
                          <div className="text-center px-4">
                            <IconCheck size={20} className="text-accent mx-auto mb-1" />
                            <p className="text-[9px] font-mono text-white/40 truncate w-full">{localEnhancements.virtualBackground?.value.split(/[\\/]/).pop()}</p>
                          </div>
                        ) : (
                          <>
                            <IconPhoto size={24} className="text-white/20 group-hover:text-accent/60 transition-colors" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Select Background</p>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {localEnhancements.virtualBackground?.type === 'color' && (
                    <div className="flex items-center gap-3 bg-white/5 p-2 rounded-xl border border-white/5">
                      <input
                        type="color"
                        value={localEnhancements.virtualBackground?.value || '#000000'}
                        onChange={e => setLocalEnhancements({ ...localEnhancements, virtualBackground: { ...localEnhancements.virtualBackground, value: e.target.value } })}
                        className="w-8 h-8 rounded-lg border-0 bg-transparent cursor-pointer"
                      />
                      <input
                        type="text"
                        value={localEnhancements.virtualBackground?.value || '#000000'}
                        onChange={e => setLocalEnhancements({ ...localEnhancements, virtualBackground: { ...localEnhancements.virtualBackground, value: e.target.value } })}
                        className="flex-1 bg-transparent border-0 text-[11px] font-mono text-white/60 focus:text-white outline-none"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <EnhancementSlider
                      label="Background Blur" icon={IconBlur}
                      value={localEnhancements.virtualBackground?.blurStrength || 0} min={0} max={100} def={0}
                      onChange={v => setLocalEnhancements({ ...localEnhancements, virtualBackground: { ...localEnhancements.virtualBackground, blurStrength: v } })}
                    />
                    <EnhancementSlider
                      label="Opacity" icon={IconSunHigh}
                      value={localEnhancements.virtualBackground?.opacity ?? 100} min={0} max={100} def={100}
                      onChange={v => setLocalEnhancements({ ...localEnhancements, virtualBackground: { ...localEnhancements.virtualBackground, opacity: v } })}
                    />
                  </div>

                  {localEnhancements.virtualBackground?.type === 'image' && (
                    <div className="space-y-4 pt-4 border-t border-white/5">
                      <label className="text-[9px] font-black uppercase text-white/40 tracking-widest block">Scaling Mode</label>
                      <div className="flex bg-white/5 p-1 rounded-xl">
                        {[
                          { id: 'cover', label: 'Cover' },
                          { id: 'contain', label: 'Contain' },
                          { id: 'stretch', label: 'Stretch' },
                        ].map(m => (
                          <button
                            key={m.id}
                            onClick={() => setLocalEnhancements({ ...localEnhancements, virtualBackground: { ...localEnhancements.virtualBackground, scalingMode: m.id as any } })}
                            className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${
                              localEnhancements.virtualBackground?.scalingMode === m.id ? 'bg-white/20 text-white' : 'text-white/20 hover:text-white/40'
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
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
                  <div className="space-y-4 pt-4 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <label className="text-[9px] font-black uppercase text-white/40 tracking-widest block">Shape Border</label>
                      <button
                        onClick={() => {
                          const curr = typeof localEnhancements.shape === 'object' ? localEnhancements.shape : { type: localEnhancements.shape || 'rect', x: 50, y: 50, scale: 100, scope: 'both', captureX: 50, captureY: 50 }
                          setLocalEnhancements({
                            ...localEnhancements,
                            shape: {
                              ...curr,
                              border: {
                                enabled: !curr.border?.enabled,
                                type: curr.border?.type || 'chroma',
                                thickness: curr.border?.thickness || 4,
                                opacity: curr.border?.opacity ?? 100,
                                color: curr.border?.color || '#ffffff'
                              }
                            }
                          })
                        }}
                        className={`text-[8px] font-black uppercase px-2 py-1 rounded-md transition-all ${
                          (typeof localEnhancements.shape === 'object' && localEnhancements.shape.border?.enabled) ? 'bg-accent/20 text-accent' : 'bg-white/5 text-white/30'
                        }`}
                      >
                        {(typeof localEnhancements.shape === 'object' && localEnhancements.shape.border?.enabled) ? 'Active' : 'Enable'}
                      </button>
                    </div>

                    {(typeof localEnhancements.shape === 'object' && localEnhancements.shape.border?.enabled) && (
                      <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                        <div className="flex bg-white/5 p-1 rounded-xl">
                          {[
                            { id: 'chroma', label: 'Chroma' },
                            { id: 'cyber', label: 'Cyber' },
                            { id: 'solid', label: 'Solid' },
                          ].map(t => (
                            <button
                              key={t.id}
                              onClick={() => {
                                const curr = localEnhancements.shape as any
                                setLocalEnhancements({ ...localEnhancements, shape: { ...curr, border: { ...curr.border, type: t.id } } })
                              }}
                              className={`flex-1 py-1.5 rounded-lg text-[8px] font-black uppercase transition-all ${
                                localEnhancements.shape?.border?.type === t.id ? 'bg-white/20 text-white' : 'text-white/20 hover:text-white/40'
                              }`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>

                        <EnhancementSlider
                          label="Thickness" icon={IconMaximize}
                          value={localEnhancements.shape?.border?.thickness || 4} min={1} max={20} def={4}
                          onChange={v => {
                            const curr = localEnhancements.shape as any
                            setLocalEnhancements({ ...localEnhancements, shape: { ...curr, border: { ...curr.border, thickness: v } } })
                          }}
                        />

                        {localEnhancements.shape?.border?.type === 'solid' && (
                          <div className="flex items-center gap-3 bg-white/5 p-2 rounded-xl border border-white/5">
                            <input
                              type="color"
                              value={localEnhancements.shape?.border?.color || '#ffffff'}
                              onChange={e => {
                                const curr = localEnhancements.shape as any
                                setLocalEnhancements({ ...localEnhancements, shape: { ...curr, border: { ...curr.border, color: e.target.value } } })
                              }}
                              className="w-6 h-6 rounded-md border-0 bg-transparent cursor-pointer"
                            />
                            <input
                              type="text"
                              value={localEnhancements.shape?.border?.color || '#ffffff'}
                              onChange={e => {
                                const curr = localEnhancements.shape as any
                                setLocalEnhancements({ ...localEnhancements, shape: { ...curr, border: { ...curr.border, color: e.target.value } } })
                              }}
                              className="flex-1 bg-transparent border-0 text-[10px] font-mono text-white/60 focus:text-white outline-none"
                            />
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2">
                          <label className="text-[10px] font-bold text-white/80">Audio Reactive</label>
                          <button
                            onClick={() => {
                              const curr = localEnhancements.shape as any
                              setLocalEnhancements({ ...localEnhancements, shape: { ...curr, border: { ...curr.border, audioReactive: !curr.border?.audioReactive, reactivity: curr.border?.reactivity ?? 100 } } })
                            }}
                            className={`text-[8px] font-black uppercase px-2 py-1 rounded-md transition-all ${
                              localEnhancements.shape?.border?.audioReactive ? 'bg-accent/20 text-accent' : 'bg-white/5 text-white/30'
                            }`}
                          >
                            {localEnhancements.shape?.border?.audioReactive ? 'Active' : 'Off'}
                          </button>
                        </div>

                        {localEnhancements.shape?.border?.audioReactive && (
                          <div className="pt-2 animate-in slide-in-from-top-1 duration-200">
                            <EnhancementSlider
                              label="Reactivity" icon={IconSparkles}
                              value={localEnhancements.shape?.border?.reactivity ?? 100} min={0} max={200} def={100}
                              onChange={v => {
                                const curr = localEnhancements.shape as any
                                setLocalEnhancements({ ...localEnhancements, shape: { ...curr, border: { ...curr.border, reactivity: v } } })
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 pt-4 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <label className="text-[9px] font-black uppercase text-white/40 tracking-widest block">Drop Shadow</label>
                      <button
                        onClick={() => {
                          const curr = typeof localEnhancements.shape === 'object' ? localEnhancements.shape : { type: localEnhancements.shape || 'rect', x: 50, y: 50, scale: 100, scope: 'both', captureX: 50, captureY: 50 }
                          setLocalEnhancements({
                            ...localEnhancements,
                            shape: {
                              ...curr,
                              shadow: {
                                enabled: !curr.shadow?.enabled,
                                color: curr.shadow?.color || '#000000',
                                blur: curr.shadow?.blur ?? 15,
                                offsetX: curr.shadow?.offsetX ?? 0,
                                offsetY: curr.shadow?.offsetY ?? 10
                              }
                            }
                          })
                        }}
                        className={`text-[8px] font-black uppercase px-2 py-1 rounded-md transition-all ${
                          (typeof localEnhancements.shape === 'object' && localEnhancements.shape.shadow?.enabled) ? 'bg-accent/20 text-accent' : 'bg-white/5 text-white/30'
                        }`}
                      >
                        {(typeof localEnhancements.shape === 'object' && localEnhancements.shape.shadow?.enabled) ? 'Active' : 'Enable'}
                      </button>
                    </div>

                    {(typeof localEnhancements.shape === 'object' && localEnhancements.shape.shadow?.enabled) && (
                      <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                        <div className="flex items-center gap-3 bg-white/5 p-2 rounded-xl border border-white/5">
                          <input
                            type="color"
                            value={localEnhancements.shape?.shadow?.color || '#000000'}
                            onChange={e => {
                              const curr = localEnhancements.shape as any
                              setLocalEnhancements({ ...localEnhancements, shape: { ...curr, shadow: { ...curr.shadow, color: e.target.value } } })
                            }}
                            className="w-6 h-6 rounded-md border-0 bg-transparent cursor-pointer"
                          />
                          <input
                            type="text"
                            value={localEnhancements.shape?.shadow?.color || '#000000'}
                            onChange={e => {
                              const curr = localEnhancements.shape as any
                              setLocalEnhancements({ ...localEnhancements, shape: { ...curr, shadow: { ...curr.shadow, color: e.target.value } } })
                            }}
                            className="flex-1 bg-transparent border-0 text-[10px] font-mono text-white/60 focus:text-white outline-none"
                          />
                        </div>

                        <EnhancementSlider
                          label="Blur Amount" icon={IconBlur}
                          value={localEnhancements.shape?.shadow?.blur ?? 15} min={0} max={100} def={15}
                          onChange={v => {
                            const curr = localEnhancements.shape as any
                            setLocalEnhancements({ ...localEnhancements, shape: { ...curr, shadow: { ...curr.shadow, blur: v } } })
                          }}
                        />

                        <div className="grid grid-cols-2 gap-4">
                          <EnhancementSlider
                            label="Offset X" icon={IconArrowsMove}
                            value={localEnhancements.shape?.shadow?.offsetX ?? 0} min={-100} max={100} def={0}
                            onChange={v => {
                              const curr = localEnhancements.shape as any
                              setLocalEnhancements({ ...localEnhancements, shape: { ...curr, shadow: { ...curr.shadow, offsetX: v } } })
                            }}
                          />
                          <EnhancementSlider
                            label="Offset Y" icon={IconArrowsMove}
                            value={localEnhancements.shape?.shadow?.offsetY ?? 10} min={-100} max={100} def={10}
                            onChange={v => {
                              const curr = localEnhancements.shape as any
                              setLocalEnhancements({ ...localEnhancements, shape: { ...curr, shadow: { ...curr.shadow, offsetY: v } } })
                            }}
                          />
                        </div>
                      </div>
                    )}
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
                        ? 'bg-accent border-accent text-black shadow-lg shadow-accent/20 font-black'
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
          <div className="p-8 border-t border-white/5 grid grid-cols-2 gap-3 bg-black/40 backdrop-blur-md">
            <button
              onClick={() => setLocalEnhancements({})}
              className="flex items-center justify-center gap-2 h-12 rounded-2xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition-all text-xs font-bold border border-white/5 cursor-pointer"
            >
              <IconHistory size={16} />
              Reset All
            </button>
            <button
              onClick={apply}
              className="flex items-center justify-center gap-2 h-12 rounded-2xl bg-accent text-black hover:scale-[1.02] active:scale-[0.98] transition-all text-xs font-black uppercase tracking-widest cursor-pointer shadow-lg shadow-accent/20"
            >
              <IconCheck size={18} />
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
