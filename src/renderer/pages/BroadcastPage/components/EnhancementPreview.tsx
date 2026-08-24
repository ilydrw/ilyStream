import { useEffect, useRef, useState } from 'react'
import { IconArrowsMove } from '@tabler/icons-react'
import { segmentationService } from '../../../services/SegmentationService'
import { applyShapeBorderStroke, clampShapeMaskTransform, resolveImageSource, traceShapePath } from './CanvasEditor.utils'
import type { DragTarget, EnhancementPreviewProps } from './EnhancementModal.types'
import { defaultShape } from './EnhancementModal.utils'

export function EnhancementPreview({
  open,
  layer,
  videoRefs,
  canvasRef,
  clampShape,
  enhancements,
  setEnhancements
}: EnhancementPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [showOriginal, setShowOriginal] = useState(false)
  const [isDragging, setIsDragging] = useState<DragTarget | null>(null)

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
          const e = enhancements
          const vb = e.virtualBackground
          const isVbEnabled = vb?.enabled
          const isCamera = layer.type === 'camera'

          if (isVbEnabled && isCamera) {
            segmentationService.processVideo(layer.id, video)
          }

          const getFilters = (withBlur = false) => {
            const filters = []
            if (e.filterPreset && e.filterPreset !== 'none') {
              switch (e.filterPreset) {
                case 'bw': filters.push('grayscale(100%)'); break
                case 'sepia': filters.push('sepia(100%)'); break
                case 'vintage': filters.push('sepia(50%) hue-rotate(-30deg) saturate(120%) contrast(110%)'); break
                case 'kodachrome': filters.push('saturate(150%) contrast(110%) brightness(105%)'); break
                case 'polaroid': filters.push('sepia(20%) saturate(140%) contrast(120%) brightness(110%)'); break
                case 'cold': filters.push('hue-rotate(180deg) saturate(80%)'); break
                case 'warm': filters.push('sepia(30%) saturate(120%)'); break
              }
            }
            if (e.brightness !== undefined) filters.push(`brightness(${e.brightness}%)`)
            if (e.contrast !== undefined) filters.push(`contrast(${e.contrast}%)`)
            if (e.saturation !== undefined) filters.push(`saturate(${e.saturation}%)`)
            if (e.beauty && e.beauty > 0) {
              filters.push(`blur(${(e.beauty / 100) * 2}px)`)
              filters.push(`contrast(${100 + (e.beauty / 2)}%)`)
            }
            if (e.temperature !== undefined && e.temperature !== 0) {
              filters.push(`hue-rotate(${e.temperature * 0.2}deg)`)
            }
            if (withBlur && e.focusCircle?.enabled) {
              filters.push(`blur(${(e.focusCircle.blur / 100) * 40}px)`)
            }
            if (e.blur > 0) {
              filters.push(`blur(${(e.blur / 100) * 20}px)`)
            }
            return filters.length ? filters.join(' ') : 'none'
          }

          ctx.save()
          const rawShapeObj = typeof e.shape === 'object'
            ? e.shape
            : { type: e.shape || 'none', x: 50, y: 50, scale: 100, scope: 'both', captureX: 50, captureY: 50 }
          const shapeObj = clampShapeMaskTransform(rawShapeObj, canvas.width, canvas.height)
          const { type: shape, x: sxp, y: syp, scale: ssc, captureX = 50, captureY = 50 } = shapeObj

          const sx = (sxp / 100) * canvas.width
          const sy = (syp / 100) * canvas.height
          const sw = (ssc / 100) * canvas.width
          const sh = (ssc / 100) * canvas.height

          const radius = (e.cornerRadius || 0) * (Math.min(sw, sh) / 200)
          const r = Math.min(sw, sh) / 2

          const cx = ((captureX - 50) / 100) * canvas.width
          const cy = ((captureY - 50) / 100) * canvas.height
          const hasShapeMask = shape !== 'none'

          if (hasShapeMask) {
            traceShapePath(ctx, shape, sx, sy, r, sw, sh, radius, shapeObj.cutDepth)
          }

          if (hasShapeMask && shapeObj.shadow?.enabled) {
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

          if (hasShapeMask) {
            ctx.clip()
          }

          const maskResult = isVbEnabled && isCamera ? segmentationService.getMask(layer.id) : null
          const drawX = hasShapeMask ? -cx : 0
          const drawY = hasShapeMask ? -cy : 0

          if (maskResult && maskResult.mask) {
            const tempCanvas = document.createElement('canvas')
            tempCanvas.width = canvas.width
            tempCanvas.height = canvas.height
            const tempCtx = tempCanvas.getContext('2d')
            if (tempCtx) {
              tempCtx.filter = getFilters(e.focusCircle?.enabled)
              tempCtx.drawImage(video, drawX, drawY, canvas.width, canvas.height)
              tempCtx.globalCompositeOperation = 'destination-in'
              tempCtx.drawImage(maskResult.mask, drawX, drawY, canvas.width, canvas.height)
              ctx.drawImage(tempCanvas, 0, 0)
            }
          } else {
            ctx.filter = getFilters(e.focusCircle?.enabled)
            ctx.drawImage(video, drawX, drawY, canvas.width, canvas.height)
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
            ctx.drawImage(video, drawX, drawY, canvas.width, canvas.height)
            ctx.restore()
          }

          if (e.vignette > 0) {
            ctx.filter = 'none'
            const grad = ctx.createRadialGradient(
              canvas.width / 2, canvas.height / 2, 0,
              canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) / 1.5
            )
            const alpha = (e.vignette / 100) * 0.8
            grad.addColorStop(0, 'rgba(0,0,0,0)')
            grad.addColorStop(1, `rgba(0,0,0,${alpha})`)
            ctx.fillStyle = grad
            ctx.fillRect(0, 0, canvas.width, canvas.height)
          }
          ctx.restore()

          if (shape !== 'none' && shapeObj.border?.enabled) {
            const border = shapeObj.border
            ctx.save()
            traceShapePath(ctx, shape, sx, sy, r, sw, sh, radius, shapeObj.cutDepth)
            applyShapeBorderStroke(ctx, border, { x: sx, y: sy, r }, { thicknessScale: canvas.width / 1920 })
            ctx.stroke()
            ctx.restore()
          }
        } else {
          ctx.filter = 'none'
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        }

        const e = enhancements
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
              img.src = resolveImageSource(vb.value)
              if (!(window as any)._vbImageCache) (window as any)._vbImageCache = {}
              ;(window as any)._vbImageCache[vb.value] = img
            }
            if (img.complete && img.naturalWidth > 0) {
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
        ctx.fillText('Loading Preview...', canvas.width / 2, canvas.height / 2)
      }
      frameId = requestAnimationFrame(render)
    }

    frameId = requestAnimationFrame(render)
    return () => cancelAnimationFrame(frameId)
  }, [open, layer, videoRefs, canvasRef, enhancements, showOriginal])

  const updateDrag = (x: number, y: number, target: DragTarget) => {
    const curr = defaultShape(enhancements.shape)
    if (target === 'mask') {
      setEnhancements({ ...enhancements, shape: clampShape({ ...curr, x, y }) })
    } else {
      setEnhancements({ ...enhancements, shape: { ...curr, captureX: x, captureY: y } })
    }
  }

  const handleCanvasMouseDown = (event: React.MouseEvent) => {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * 100
    const y = ((event.clientY - rect.top) / rect.height) * 100
    const target = event.altKey ? 'capture' : 'mask'

    setIsDragging(target)
    updateDrag(x, y, target)
  }

  const handleCanvasMouseMove = (event: React.MouseEvent) => {
    if (!isDragging || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100))
    updateDrag(x, y, isDragging)
  }

  return (
    <div ref={containerRef} className="flex-1 flex flex-col min-w-0 bg-black/40">
      <div className="flex-1 flex items-center justify-center p-12 relative overflow-hidden">
        <div className="relative group cursor-crosshair">
          <canvas
            ref={canvasRef}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={() => setIsDragging(null)}
            onMouseLeave={() => setIsDragging(null)}
            className="rounded-md shadow-2xl transition-shadow group-hover:"
          />
          <div className="absolute top-4 left-4 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 px-3 py-1.5 rounded-full border border-white/10">
            <p className="text-[9px] font-semibold text-white/50 tracking-tight flex items-center gap-2">
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
          className="px-6 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white text-[10px] font-semibold tracking-tight transition-all border border-white/5"
        >
          Hold to Compare Original
        </button>
      </div>
    </div>
  )
}
