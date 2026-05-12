import { useEffect, useRef, useState } from 'react'
import type { StudioScene, StudioLayer } from '../../../../shared/studio'
import { resolveLayerLayout } from '../../../../shared/studio'
import { drawMediaFallback, drawAndCacheMediaFrame, wrapCanvasText } from './CanvasEditor.utils'
import type { CachedMediaFrame, CanvasPreviewMode, CanvasStreamOutput, BrowserFrameSurface } from './CanvasEditor.types'

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
  const dualVerticalOverlayEnabledRef = useRef(dualVerticalOverlayEnabled)
  dualVerticalOverlayEnabledRef.current = dualVerticalOverlayEnabled

  const secondaryAspectRatio = aspectRatio === '16:9' ? '9:16' : '16:9'
  const shouldDrawSecondary = previewMode === 'dual' || previewMode === 'dual-portrait' || previewMode === 'dual-horizontal'
  const secondaryRenderRatio: '16:9' | '9:16' =
    previewMode === 'dual-horizontal' ? '16:9' :
    previewMode === 'dual-portrait' ? '9:16' :
    secondaryAspectRatio

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

    const drawScene = (targetCtx: CanvasRenderingContext2D, targetCanvas: HTMLCanvasElement, targetRatio: '16:9' | '9:16') => {
      targetCtx.fillStyle = '#000'
      targetCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height)

      const sorted = [...activeScene.layers].sort((a, b) => a.zIndex - b.zIndex)
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
        const shapeObj = typeof e.shape === 'object' ? e.shape : { type: e.shape || 'rect', x: 50, y: 50, scale: 100, scope: 'both', captureX: 50, captureY: 50 }
        const { type: shape, x: sxp, y: syp, scale: ssc, scope: sscope, captureX = 50, captureY = 50 } = shapeObj
        
        // Scope Check: 'both', '16:9', or '9:16'
        const shouldApplyShape = sscope === 'both' || sscope === targetRatio

        // Capture Offset (Pan/Zoom)
        const cx = ((captureX - 50) / 100) * dl.width
        const cy = ((captureY - 50) / 100) * dl.height

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

        // Apply Shaping Mask
        if (shouldApplyShape && shape !== 'none') {
          const sx = dl.x + (sxp / 100) * dl.width
          const sy = dl.y + (syp / 100) * dl.height
          const sw = (ssc / 100) * dl.width
          const sh = (ssc / 100) * dl.height
          const r = Math.min(sw, sh) / 2
          const radius = (e.cornerRadius || 0) * (Math.min(sw, sh) / 200)

          targetCtx.beginPath()
          if (shape === 'circle') {
            targetCtx.arc(sx, sy, r, 0, Math.PI * 2)
          } else if (shape === 'star') {
            const spikes = 5; const outerRadius = r; const innerRadius = r / 2.5
            let rot = Math.PI / 2 * 3; let x = sx; let y = sy; const step = Math.PI / spikes
            targetCtx.moveTo(sx, sy - outerRadius)
            for (let i = 0; i < spikes; i++) {
              x = sx + Math.cos(rot) * outerRadius; y = sy + Math.sin(rot) * outerRadius
              targetCtx.lineTo(x, y); rot += step
              x = sx + Math.cos(rot) * innerRadius; y = sy + Math.sin(rot) * innerRadius
              targetCtx.lineTo(x, y); rot += step
            }
            targetCtx.lineTo(sx, sy - outerRadius); targetCtx.closePath()
          } else if (shape === 'heart') {
            const d = r * 2.2; const hx = sx; const hy = sy - d / 4
            targetCtx.moveTo(hx, hy + d / 4)
            targetCtx.bezierCurveTo(hx, hy + d / 4, hx - d / 2, hy, hx - d / 2, hy - d / 4)
            targetCtx.bezierCurveTo(hx - d / 2, hy - d / 2, hx, hy - d / 2, hx, hy - d / 4)
            targetCtx.bezierCurveTo(hx, hy - d / 2, hx + d / 2, hy - d / 2, hx + d / 2, hy - d / 4)
            targetCtx.bezierCurveTo(hx + d / 2, hy, hx, hy + d / 4, hx, hy + d / 4); targetCtx.closePath()
          } else if (shape === 'diamond') {
            targetCtx.moveTo(sx, sy - r); targetCtx.lineTo(sx + r, sy); targetCtx.lineTo(sx, sy + r); targetCtx.lineTo(sx - r, sy); targetCtx.closePath()
          } else if (shape === 'hexagon') {
            for (let i = 0; i < 6; i++) { targetCtx.lineTo(sx + r * Math.cos(i * Math.PI / 3), sy + r * Math.sin(i * Math.PI / 3)) }; targetCtx.closePath()
          } else {
            const rx = sx - sw / 2; const ry = sy - sh / 2
            if ((targetCtx as any).roundRect) (targetCtx as any).roundRect(rx, ry, sw, sh, radius)
            else targetCtx.rect(rx, ry, sw, sh)
          }
          targetCtx.clip()
        }

        // DRAW
        targetCtx.filter = getFilters(e.focusCircle?.enabled)
        
        const drawLayerSource = () => {
          if (l.type === 'camera' || l.type === 'display') {
            const video = videoRefs.current[l.id]
            if (video && video.readyState >= 2 && video.videoWidth > 0) {
              targetCtx.drawImage(
                video, 
                (layout.crop?.left || 0), (layout.crop?.top || 0), 
                video.videoWidth - (layout.crop?.left || 0) - (layout.crop?.right || 0), 
                video.videoHeight - (layout.crop?.top || 0) - (layout.crop?.bottom || 0), 
                dl.x - cx, dl.y - cy, dl.width, dl.height
              )
            } else {
              const cached = mediaFrameCache.current[l.id]
              if (cached) targetCtx.drawImage(cached.canvas, dl.x - cx, dl.y - cy, dl.width, dl.height)
              else drawMediaFallback(targetCtx, mediaFrameCache.current, l.id, { ...dl, x: dl.x - cx, y: dl.y - cy }, 'WAITING', l.name)
            }
          } else if (l.type === 'image' && imageCache.current[l.id]) {
            targetCtx.drawImage(imageCache.current[l.id], dl.x - cx, dl.y - cy, dl.width, dl.height)
          } else if (l.type === 'widget' || l.type === 'browser') {
            const frame = browserFrameCache.current[l.id]
            if (frame && frame.bitmap) {
              const c = layout.crop
              if (c) {
                targetCtx.drawImage(
                  frame.bitmap,
                  c.left, c.top, frame.width - c.left - c.right, frame.height - c.top - c.bottom,
                  dl.x - cx, dl.y - cy, dl.width, dl.height
                )
              } else {
                targetCtx.drawImage(frame.bitmap, dl.x - cx, dl.y - cy, dl.width, dl.height)
              }
            }
          } else if (l.type === 'text') {
            const fontSize = Number(l.config?.fontSize) || 48
            targetCtx.fillStyle = l.config?.color || '#fff'
            targetCtx.font = `700 ${fontSize}px Inter, sans-serif`
            targetCtx.textBaseline = 'top'
            wrapCanvasText(targetCtx, l.config?.text || '', dl.x, dl.y, dl.width, fontSize * 1.2, dl.height)
          }
        }

        drawLayerSource()

        // Focus Circle Secondary Pass
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

        // Vignette
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

      drawScene(ctx, canvas, aspectRatio)

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
