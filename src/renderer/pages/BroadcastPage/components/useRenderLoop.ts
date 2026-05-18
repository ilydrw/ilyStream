import { useEffect, useRef, useState } from 'react'
import type { StudioScene } from '../../../../shared/studio'
import { resolveLayerLayout } from '../../../../shared/studio'
import {
  croppedSourceRect,
  drawFittedSource,
  drawMediaFallback,
  resolveSourceFitMode,
  traceShapePath,
  wrapCanvasText
} from './CanvasEditor.utils'
import type { CachedMediaFrame, CanvasPreviewMode, CanvasStreamOutput, BrowserFrameSurface } from './CanvasEditor.types'
import { useStudioStore } from '../../../stores/studio-store'
import { segmentationService } from '../../../services/SegmentationService'

interface RenderLoopOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  secondaryPreviewCanvasRef: React.RefObject<HTMLCanvasElement | null>
  activeScene: StudioScene
  aspectRatio: '16:9' | '9:16'
  outputFps: number
  outputActive: boolean
  previewMode: CanvasPreviewMode
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>
  mediaFrameCache: React.MutableRefObject<Record<string, CachedMediaFrame>>
  browserFrameCache: React.MutableRefObject<Record<string, BrowserFrameSurface>>
  imageCache: React.MutableRefObject<Record<string, HTMLImageElement>>
  audioClockRef: React.MutableRefObject<{ totalSamples: number; receivedAt: number }>
  encoderWorkerRef: React.RefObject<Worker | null>
  horizontalEncoderWorkerRef: React.RefObject<Worker | null>
  verticalEncoderWorkerRef: React.RefObject<Worker | null>
  streamOutputs: CanvasStreamOutput[]
  canvasWidth: number
  canvasHeight: number
  captureInputFormat: string
  outputCodec?: string
  outputBitrateKbps: number
  dualVerticalOverlayEnabled?: boolean
  isVisible?: boolean
}

const DUAL_VERTICAL_OVERLAY_FPS = 20
const DUAL_VERTICAL_OVERLAY_JPEG_QUALITY = 0.7

export function useRenderLoop(options: RenderLoopOptions) {
  const {
    canvasRef, secondaryPreviewCanvasRef, activeScene, aspectRatio,
    outputFps, outputActive, previewMode, videoRefs,
    mediaFrameCache, browserFrameCache, imageCache,
    audioClockRef, encoderWorkerRef, horizontalEncoderWorkerRef, verticalEncoderWorkerRef,
    streamOutputs, canvasWidth, canvasHeight, captureInputFormat,
    dualVerticalOverlayEnabled = false,
    isVisible = true
  } = options

  const [fps, setFps] = useState(0)
  const fpsRef = useRef({ count: 0, globalCount: 0, lastTime: performance.now() })
  const horizontalCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const verticalCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const compositedCaptureRef = useRef({ lastAt: 0, frameCount: 0 })
  const horizontalCaptureRef = useRef({ lastAt: 0, frameCount: 0 })
  const verticalCaptureRef = useRef({ lastAt: 0, frameCount: 0 })
  const dualVerticalOverlayRef = useRef({ lastAt: 0, busy: false })
  const transitionCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const chromaCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const dualVerticalOverlayEnabledRef = useRef(dualVerticalOverlayEnabled)
  dualVerticalOverlayEnabledRef.current = dualVerticalOverlayEnabled

  const secondaryAspectRatio = aspectRatio === '16:9' ? '9:16' : '16:9'
  const shouldDrawSecondary = previewMode === 'dual' || previewMode === 'dual-portrait' || previewMode === 'dual-horizontal'
  const secondaryRenderRatio: '16:9' | '9:16' =
    previewMode === 'dual-horizontal' ? '16:9' :
    previewMode === 'dual-portrait' ? '9:16' :
    secondaryAspectRatio

  const transitionState = useStudioStore(s => s.transitionState)
  const stingerSettings = useStudioStore(s => s.stingerSettings)
  const scenes = useStudioStore(s => s.scenes)

  const stingerVideoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (stingerSettings.path) {
      const v = document.createElement('video')
      v.src = `file://${stingerSettings.path}`
      v.preload = 'auto'
      v.muted = true
      stingerVideoRef.current = v
    }
  }, [stingerSettings.path])

  // Play/Stop stinger
  useEffect(() => {
    if (transitionState.isActive && transitionState.type === 'stinger' && stingerVideoRef.current) {
      stingerVideoRef.current.currentTime = 0
      stingerVideoRef.current.play().catch(console.error)
    }
  }, [transitionState.isActive, transitionState.type])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    let frameId: number
    const configuredOutputFps = Math.max(1, Math.min(60, Math.round(outputFps || 30)))
    const minRenderFps = outputActive ? Math.min(60, Math.max(30, configuredOutputFps)) : 30
    const maxRenderFps = 60
    let targetRenderFps = maxRenderFps
    let targetFrameMs = 1000 / targetRenderFps
    let lastRenderAt = 0
    let isHibernated = false

    const checkHibernation = () => {
      // Hibernate if page is hidden AND we aren't doing any work that requires frames (streaming, recording, etc)
      const workActive = outputActive || streamOutputs.some(o => o.active) || dualVerticalOverlayEnabledRef.current
      const shouldHibernate = !isVisible && !workActive

      if (shouldHibernate !== isHibernated) {
        isHibernated = shouldHibernate
        if (isHibernated) {
          console.log('[useRenderLoop] Hibernating canvas loop...')
          setFps(0)
        } else {
          console.log('[useRenderLoop] Resuming canvas loop...')
          lastRenderAt = performance.now()
          frameId = requestAnimationFrame(render)
        }
      }
      return isHibernated
    }

    const drawScene = (targetCtx: CanvasRenderingContext2D, targetCanvas: HTMLCanvasElement, targetRatio: '16:9' | '9:16', sceneOverride?: StudioScene) => {
      const scene = sceneOverride || activeScene
      targetCtx.fillStyle = '#000'
      targetCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height)

      const sorted = [...scene.layers].sort((a, b) => a.zIndex - b.zIndex)
      for (const l of sorted) {
        const layout = resolveLayerLayout(l, targetRatio)
        if (!layout.visible) continue

        targetCtx.save()
        targetCtx.globalAlpha = l.opacity ?? 1

        const rotation = Number(layout.rotation || 0)
        const dl = rotation ? { ...layout, x: -layout.width / 2, y: -layout.height / 2 } : layout
        if (rotation) {
          targetCtx.translate(layout.x + layout.width / 2, layout.y + layout.height / 2)
          targetCtx.rotate(rotation * Math.PI / 180)
        }

        const e = l.enhancements || {}
        const shapeObj = (typeof e.shape === 'object' ? e.shape : { type: e.shape || 'rect', x: 50, y: 50, scale: 100, scope: 'both', captureX: 50, captureY: 50 }) as any
        const { type: shape, x: sxp, y: syp, scale: ssc, scope: sscope, captureX = 50, captureY = 50 } = shapeObj

        // Scope Check: 'both', '16:9', or '9:16'
        const shouldApplyShape = sscope === 'both' || sscope === targetRatio

        // Capture Offset (Pan/Zoom)
        const cx = ((captureX - 50) / 100) * dl.width
        const cy = ((captureY - 50) / 100) * dl.height

        const drawLayerSource = () => {
          const hasChromaKey = e.chromaKey?.enabled && e.chromaKey.color
          const vb = e.virtualBackground
          const isVbEnabled = vb?.enabled

          let drawTarget: CanvasRenderingContext2D = targetCtx
          let drawX = dl.x - cx
          let drawY = dl.y - cy

          const video = (l.type === 'camera' || l.type === 'display') ? videoRefs.current[l.id] : null
          const isCamera = l.type === 'camera'
          const fitMode = resolveSourceFitMode(l)

          if (isVbEnabled && isCamera && video && video.readyState >= 2) {
            segmentationService.processVideo(l.id, video)
          }

          // --- DRAW BACKGROUND ---
          if (isVbEnabled) {
            targetCtx.save()
            targetCtx.globalAlpha = (vb.opacity ?? 100) / 100

            if (vb.type === 'color' && vb.value) {
              targetCtx.fillStyle = vb.value
              targetCtx.fillRect(dl.x, dl.y, dl.width, dl.height)
            } else if (vb.type === 'image' && vb.value) {
              let img = imageCache.current[`vb-${vb.value}`]
              if (!img) {
                img = new Image()
                img.src = `file://${vb.value}`
                imageCache.current[`vb-${vb.value}`] = img
              }
              if (img.complete) {
                if (vb.blurStrength) targetCtx.filter = `blur(${vb.blurStrength / 4}px)`

                const mode = vb.scalingMode || 'cover'
                if (mode === 'stretch') {
                  targetCtx.drawImage(img, dl.x, dl.y, dl.width, dl.height)
                } else {
                  const imgRatio = img.width / img.height
                  const containerRatio = dl.width / dl.height
                  let sw, sh, sx, sy

                  if (mode === 'cover') {
                    if (imgRatio > containerRatio) {
                      sh = img.height; sw = img.height * containerRatio
                      sx = (img.width - sw) / 2; sy = 0
                    } else {
                      sw = img.width; sh = img.width / containerRatio
                      sx = 0; sy = (img.height - sh) / 2
                    }
                  } else { // contain
                    if (imgRatio > containerRatio) {
                      sw = img.width; sh = img.width / containerRatio
                      sx = 0; sy = (img.height - sh) / 2
                    } else {
                      sh = img.height; sw = img.height * containerRatio
                      sx = (img.width - sw) / 2; sy = 0
                    }
                  }
                  targetCtx.drawImage(img, sx, sy, sw, sh, dl.x, dl.y, dl.width, dl.height)
                }
                targetCtx.filter = 'none'
              }
            } else if (vb.type === 'blur') {
              const video = videoRefs.current[l.id]
              if (video && video.readyState >= 2) {
                targetCtx.save()
                targetCtx.filter = `blur(${vb.blurStrength || 20}px) brightness(70%)`
                targetCtx.drawImage(video, dl.x - 20, dl.y - 20, dl.width + 40, dl.height + 40)
                targetCtx.restore()
              }
            }
            targetCtx.restore()
          }

          if (hasChromaKey) {
            if (!chromaCanvasRef.current) chromaCanvasRef.current = document.createElement('canvas')
            const cc = chromaCanvasRef.current
            cc.width = dl.width
            cc.height = dl.height
            const cCtx = cc.getContext('2d', { alpha: true, willReadFrequently: true })
            if (cCtx) {
              drawTarget = cCtx
              drawX = 0
              drawY = 0
            }
          }

          if (l.type === 'camera' || l.type === 'display') {
            if (video && video.readyState >= 2 && video.videoWidth > 0) {
              const maskResult = isVbEnabled && isCamera ? segmentationService.getMask(l.id) : null

              if (maskResult && maskResult.mask) {
                // DRAW WITH MASK
                if (!chromaCanvasRef.current) chromaCanvasRef.current = document.createElement('canvas')
                const cc = chromaCanvasRef.current
                cc.width = dl.width
                cc.height = dl.height
                const cCtx = cc.getContext('2d', { alpha: true })
                if (cCtx) {
                  cCtx.clearRect(0, 0, dl.width, dl.height)
                  drawFittedSource(
                    cCtx,
                    video,
                    croppedSourceRect(video.videoWidth, video.videoHeight, layout.crop),
                    { x: 0, y: 0, width: dl.width, height: dl.height },
                    fitMode
                  )
                  cCtx.globalCompositeOperation = 'destination-in'
                  drawFittedSource(
                    cCtx,
                    maskResult.mask,
                    croppedSourceRect(maskResult.width, maskResult.height, layout.crop),
                    { x: 0, y: 0, width: dl.width, height: dl.height },
                    fitMode
                  )
                  cCtx.globalCompositeOperation = 'source-over'

                  targetCtx.drawImage(cc, dl.x - cx, dl.y - cy)
                }
              } else {
                drawFittedSource(
                  drawTarget,
                  video,
                  croppedSourceRect(video.videoWidth, video.videoHeight, layout.crop),
                  { x: drawX, y: drawY, width: dl.width, height: dl.height },
                  fitMode
                )
              }
            } else {
              const cached = mediaFrameCache.current[l.id]
              if (cached) {
                drawFittedSource(
                  drawTarget,
                  cached.canvas,
                  croppedSourceRect(cached.width, cached.height),
                  { x: drawX, y: drawY, width: dl.width, height: dl.height },
                  fitMode
                )
              } else {
                drawMediaFallback(drawTarget, mediaFrameCache.current, l.id, { ...dl, x: drawX, y: drawY }, 'WAITING', l.name)
              }
            }
          } else if (l.type === 'image' && imageCache.current[l.id]) {
            const image = imageCache.current[l.id]
            drawFittedSource(
              drawTarget,
              image,
              croppedSourceRect(image.naturalWidth || image.width, image.naturalHeight || image.height, layout.crop),
              { x: drawX, y: drawY, width: dl.width, height: dl.height },
              fitMode
            )
          } else if (l.type === 'widget' || l.type === 'browser') {
            const frame = browserFrameCache.current[l.id]
            if (frame && frame.bitmap) {
              drawFittedSource(
                drawTarget,
                frame.bitmap,
                croppedSourceRect(frame.width, frame.height, layout.crop),
                { x: drawX, y: drawY, width: dl.width, height: dl.height },
                l.type === 'widget' ? 'stretch' : fitMode
              )
            }
          } else if (l.type === 'text') {
            const fontSize = Number(l.config?.fontSize) || 48
            drawTarget.fillStyle = l.config?.color || '#fff'
            drawTarget.font = `700 ${fontSize}px Inter, sans-serif`
            drawTarget.textBaseline = 'top'
            wrapCanvasText(drawTarget, l.config?.text || '', drawX, drawY, dl.width, fontSize * 1.2, dl.height)
          }

          if (hasChromaKey && drawTarget !== targetCtx) {
            const cCtx = drawTarget as CanvasRenderingContext2D
            const imgData = cCtx.getImageData(0, 0, dl.width, dl.height)
            const data = imgData.data

            const hex = e.chromaKey!.color.replace('#', '')
            const kr = parseInt(hex.substring(0, 2), 16)
            const kg = parseInt(hex.substring(2, 4), 16)
            const kb = parseInt(hex.substring(4, 6), 16)

            const similarity = (e.chromaKey!.similarity || 40) / 100
            const smoothness = (e.chromaKey!.smoothness || 10) / 100
            const spill = (e.chromaKey!.spill || 10) / 100

            for (let i = 0; i < data.length; i += 4) {
              const r = data[i], g = data[i+1], b = data[i+2]
              const rDiff = r - kr, gDiff = g - kg, bDiff = b - kb
              const dist = Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff) / 441.6

              if (dist < similarity) {
                data[i+3] = 0
              } else if (dist < similarity + smoothness) {
                const alpha = (dist - similarity) / smoothness
                data[i+3] = Math.min(data[i+3], alpha * 255)
              }

              if (spill > 0 && dist < similarity + spill) {
                const avg = (r + b) / 2
                if (g > avg) data[i+1] = avg + (g - avg) * (dist / (similarity + spill))
              }
            }
            cCtx.putImageData(imgData, 0, 0)
            targetCtx.drawImage(chromaCanvasRef.current!, dl.x - cx, dl.y - cy)
          }
        }


        const getFilters = (withBlur = false) => {
          const f = []
          if (e.filterPreset && e.filterPreset !== 'none') {
            switch (e.filterPreset) {
              case 'bw': f.push('grayscale(100%)'); break
              case 'sepia': f.push('sepia(100%)'); break
              case 'vintage': f.push('sepia(50%) hue-rotate(-30deg) saturate(120%) contrast(110%)'); break
              case 'vivid': f.push('saturate(180%) contrast(110%)'); break
              case 'kodachrome': f.push('saturate(150%) contrast(110%) brightness(105%)'); break
              case 'polaroid': f.push('sepia(20%) saturate(140%) contrast(120%) brightness(110%)'); break
              case 'cold': f.push('hue-rotate(180deg) saturate(80%)'); break
              case 'warm': f.push('sepia(30%) saturate(120%)'); break
              case 'faded': f.push('opacity(80%) saturate(60%) brightness(110%)'); break
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

        // Apply Shaping Mask & Draw
        if (shouldApplyShape && (shape as string) !== 'none') {
          const sx = dl.x + (sxp / 100) * dl.width
          const sy = dl.y + (syp / 100) * dl.height
          const sw = (ssc / 100) * dl.width
          const sh = (ssc / 100) * dl.height
          const r = Math.min(sw, sh) / 2
          const radius = (e.cornerRadius || 0) * (Math.min(sw, sh) / 200)

          const shapePath = () => traceShapePath(targetCtx, shape, sx, sy, r, sw, sh, radius)

          // Pass 1: Content (Clipped)
          targetCtx.save()
          shapePath()
          targetCtx.clip()
          targetCtx.filter = getFilters(e.focusCircle?.enabled)
          drawLayerSource()
          targetCtx.restore()

          // Pass 2: Border (Unclipped)
          if (shapeObj.border?.enabled) {
            const b = shapeObj.border
            const vol = (window as any).__masterVolume || 0
            const sensitivity = (b.reactivity ?? 100) / 100
            const reactiveBoost = b.audioReactive ? (vol * 1.5 * sensitivity) : 0
            const thickness = b.thickness * (1 + reactiveBoost)

            targetCtx.save()
            targetCtx.lineWidth = thickness
            targetCtx.lineJoin = 'round'
            targetCtx.lineCap = 'round'
            shapePath()

            if (b.type === 'chroma') {
              const grad = targetCtx.createLinearGradient(sx - r, sy - r, sx + r, sy + r)
              const hue = (performance.now() / 20) % 360
              grad.addColorStop(0, `hsl(${hue}, 100%, 50%)`)
              grad.addColorStop(0.5, `hsl(${(hue + 120) % 360}, 100%, 50%)`)
              grad.addColorStop(1, `hsl(${(hue + 240) % 360}, 100%, 50%)`)
              targetCtx.strokeStyle = grad
              targetCtx.shadowBlur = b.audioReactive ? (10 + vol * 30) : 10
              targetCtx.shadowColor = `hsl(${hue}, 100%, 50%)`
            } else if (b.type === 'cyber') {
              const hue = (performance.now() / 50) % 60
              const color = `hsl(${180 + hue}, 100%, 50%)`
              targetCtx.strokeStyle = color
              targetCtx.shadowBlur = 15 + (vol * 40)
              targetCtx.shadowColor = color
              targetCtx.stroke()
              // Inner Glow
              targetCtx.lineWidth = thickness / 2
              targetCtx.strokeStyle = '#fff'
              targetCtx.shadowBlur = 0
            } else {
              targetCtx.strokeStyle = b.color || '#fff'
              targetCtx.globalAlpha = (b.opacity ?? 100) / 100
            }
            targetCtx.stroke()
            targetCtx.restore()
          }

          // Pass 3: Focus Circle & Vignette (Clipped)
          targetCtx.save()
          shapePath()
          targetCtx.clip()

          if (e.focusCircle?.enabled) {
            targetCtx.save()
            const fx = dl.x + (e.focusCircle.x / 100) * dl.width
            const fy = dl.y + (e.focusCircle.y / 100) * dl.height
            const fr = (e.focusCircle.radius / 100) * (Math.max(dl.width, dl.height) / 2)
            targetCtx.beginPath()
            targetCtx.arc(fx, fy, fr, 0, Math.PI * 2)
            targetCtx.clip()
            targetCtx.filter = getFilters(false)
            drawLayerSource()
            targetCtx.restore()
          }

          if (e.vignette && e.vignette > 0) {
            targetCtx.filter = 'none'
            const grad = targetCtx.createRadialGradient(
              dl.x + dl.width/2, dl.y + dl.height/2, 0,
              dl.x + dl.width/2, dl.y + dl.height/2, Math.max(dl.width, dl.height) / 1.5
            )
            const alpha = (e.vignette / 100) * 0.8
            grad.addColorStop(0, 'rgba(0,0,0,0)')
            grad.addColorStop(1, `rgba(0,0,0,${alpha})`)
            targetCtx.fillStyle = grad
            targetCtx.fillRect(dl.x, dl.y, dl.width, dl.height)
          }
          targetCtx.restore()
        } else {
          // No Shape
          targetCtx.filter = getFilters(e.focusCircle?.enabled)
          drawLayerSource()

          if (e.focusCircle?.enabled) {
            targetCtx.save()
            const fx = dl.x + (e.focusCircle.x / 100) * dl.width
            const fy = dl.y + (e.focusCircle.y / 100) * dl.height
            const fr = (e.focusCircle.radius / 100) * (Math.max(dl.width, dl.height) / 2)
            targetCtx.beginPath()
            targetCtx.arc(fx, fy, fr, 0, Math.PI * 2)
            targetCtx.clip()
            targetCtx.filter = getFilters(false)
            drawLayerSource()
            targetCtx.restore()
          }

          if (e.vignette && e.vignette > 0) {
            targetCtx.filter = 'none'
            const grad = targetCtx.createRadialGradient(
              dl.x + dl.width/2, dl.y + dl.height/2, 0,
              dl.x + dl.width/2, dl.y + dl.height/2, Math.max(dl.width, dl.height) / 1.5
            )
            const alpha = (e.vignette / 100) * 0.8
            grad.addColorStop(0, 'rgba(0,0,0,0)')
            grad.addColorStop(1, `rgba(0,0,0,${alpha})`)
            targetCtx.fillStyle = grad
            targetCtx.fillRect(dl.x, dl.y, dl.width, dl.height)
          }
        }

        targetCtx.restore()
      }
    }

    const maybeCaptureDualVerticalOverlay = (source: HTMLCanvasElement, now: number) => {
      const state = dualVerticalOverlayRef.current
      if (state.busy) return
      const interval = 1000 / DUAL_VERTICAL_OVERLAY_FPS
      if (now - state.lastAt < interval - 2) return
      state.lastAt = now
      state.busy = true
      source.toBlob(async (blob) => {
        try {
          if (!blob || !dualVerticalOverlayEnabledRef.current) return
          const buf = new Uint8Array(await blob.arrayBuffer())
          window.api?.overlay?.pushDualVerticalFrame?.(buf)
        } catch (err) {
          console.error('[useRenderLoop] dual-vertical overlay push failed', err)
        } finally {
          dualVerticalOverlayRef.current.busy = false
        }
      }, 'image/jpeg', DUAL_VERTICAL_OVERLAY_JPEG_QUALITY)
    }

    // Returns true if the capture happened (also implies the canvas was drawn).
    // We keep draw and capture coupled so the offscreen 16:9 / 9:16 canvases
    // are only re-drawn on ticks where their encoder actually wants a frame.
    const shouldCapture = (capture: any, fps: number, now: number): boolean => {
      const interval = 1000 / Math.max(1, fps)
      if (now - capture.lastAt < interval - 2) return false
      capture.lastAt = now
      capture.frameCount++
      return true
    }

    const postFrameToWorker = (worker: Worker | null, source: HTMLCanvasElement) => {
      if (!worker) return
      try {
        const audioSamples = audioClockRef.current.totalSamples
        const timestamp = Math.round((audioSamples / 48000) * 1_000_000 + (performance.now() - audioClockRef.current.receivedAt) * 1000)
        const frame = new VideoFrame(source, { timestamp })
        worker.postMessage({ type: 'composited_frame', payload: { frame } }, [frame])
      } catch (err) { console.error('Capture failed', err) }
    }

    // Secondary preview is purely visual — cap it at 30 fps regardless of monitor
    // refresh, since drawing the same scene a second time at 60+ Hz is the most
    // wasteful work in the loop when the user has dual-portrait/landscape on.
    const secondaryCaptureRef = { lastAt: 0 }
    const SECONDARY_PREVIEW_FPS = 30

    const render = () => {
      if (checkHibernation()) return

      const now = performance.now()
      // Smooth Preview Optimization:
      // We skip the global 60fps throttle to allow the preview to run at the monitor's native refresh rate (e.g. 144Hz).
      // Capture work is gated per-output below.
      const shouldThrottle = outputActive || streamOutputs.some(o => o.active) || dualVerticalOverlayEnabledRef.current
      if (shouldThrottle && lastRenderAt > 0 && now - lastRenderAt < targetFrameMs - 1.5) {
        frameId = requestAnimationFrame(render); return
      }
      lastRenderAt = now

      fpsRef.current.count++
      fpsRef.current.globalCount++
      if (now - fpsRef.current.lastTime >= 1000) {
        setFps(fpsRef.current.count); fpsRef.current.count = 0; fpsRef.current.lastTime = now
      }

      if (transitionState.isActive) {
        const fromScene = scenes.find(s => s.id === transitionState.fromSceneId)
        const toScene = scenes.find(s => s.id === transitionState.toSceneId)

        if (transitionState.type === 'stinger') {
          // In stinger mode, we draw the currently active scene (which swaps at cut point)
          // and then draw the stinger video on top
          drawScene(ctx, canvas, aspectRatio)

          if (stingerVideoRef.current && stingerVideoRef.current.readyState >= 2) {
            ctx.drawImage(stingerVideoRef.current, 0, 0, canvas.width, canvas.height)
          }
        } else if (fromScene && toScene) {
          // Fade Transition
          // Draw FROM scene fully
          drawScene(ctx, canvas, aspectRatio, fromScene)

          // Draw TO scene with transition alpha
          if (!transitionCanvasRef.current) transitionCanvasRef.current = document.createElement('canvas')
          const tCanvas = transitionCanvasRef.current
          tCanvas.width = canvas.width
          tCanvas.height = canvas.height
          const tempCtx = tCanvas.getContext('2d', { alpha: true })
          if (tempCtx) {
            drawScene(tempCtx, tCanvas, aspectRatio, toScene)
            ctx.save()
            ctx.globalAlpha = transitionState.progress
            ctx.drawImage(tCanvas, 0, 0)
            ctx.restore()
          }
        } else {
          drawScene(ctx, canvas, aspectRatio)
        }
      } else {
        drawScene(ctx, canvas, aspectRatio)
      }


      const secondary = secondaryPreviewCanvasRef.current
      if (shouldDrawSecondary && secondary && shouldCapture(secondaryCaptureRef, SECONDARY_PREVIEW_FPS, now)) {
        const sCtx = secondary.getContext('2d', { alpha: false })
        if (sCtx) drawScene(sCtx, secondary, secondaryRenderRatio)
      }

      if (outputActive && shouldCapture(compositedCaptureRef.current, outputFps, now)) {
        postFrameToWorker(encoderWorkerRef.current, canvas)
      }

      const horiz = streamOutputs.find(o => o.id === 'horizontal' && o.active)
      if (horiz && shouldCapture(horizontalCaptureRef.current, horiz.fps, now)) {
        if (!horizontalCanvasRef.current) horizontalCanvasRef.current = document.createElement('canvas')
        horizontalCanvasRef.current.width = horiz.width; horizontalCanvasRef.current.height = horiz.height
        const hCtx = horizontalCanvasRef.current.getContext('2d', { alpha: false })
        if (hCtx) {
          drawScene(hCtx, horizontalCanvasRef.current, '16:9')
          postFrameToWorker(horizontalEncoderWorkerRef.current, horizontalCanvasRef.current)
        }
      }

      const vert = streamOutputs.find(o => o.id === 'vertical' && o.active)
      const overlayEnabled = dualVerticalOverlayEnabledRef.current
      if (vert || overlayEnabled) {
        // Vertical canvas can be needed by either the encoder or the dual-vertical
        // overlay capture; pick the more demanding fps so neither is starved.
        const targetFps = Math.max(vert?.fps ?? 0, overlayEnabled ? DUAL_VERTICAL_OVERLAY_FPS : 0)
        if (targetFps > 0 && shouldCapture(verticalCaptureRef.current, targetFps, now)) {
          if (!verticalCanvasRef.current) verticalCanvasRef.current = document.createElement('canvas')
          const w = vert?.width ?? 1080
          const h = vert?.height ?? 1920
          verticalCanvasRef.current.width = w; verticalCanvasRef.current.height = h
          const vCtx = verticalCanvasRef.current.getContext('2d', { alpha: false })
          if (vCtx) {
            drawScene(vCtx, verticalCanvasRef.current, '9:16')
            if (vert) postFrameToWorker(verticalEncoderWorkerRef.current, verticalCanvasRef.current)
            if (overlayEnabled) maybeCaptureDualVerticalOverlay(verticalCanvasRef.current, now)
          }
        }
      }

      frameId = requestAnimationFrame(render)
    }

    // Initial check and start
    if (!checkHibernation()) {
      render()
    }

    return () => cancelAnimationFrame(frameId)
  }, [activeScene, aspectRatio, outputFps, outputActive, previewMode, streamOutputs, isVisible])

  return { fps }
}
