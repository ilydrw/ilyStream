import { useEffect, useRef, useState } from 'react'
import type { StudioScene, StudioLayer } from '../../../../shared/studio'
import { resolveLayerLayout } from '../../../../shared/studio'
import { drawMediaFallback, drawAndCacheMediaFrame, wrapCanvasText } from './CanvasEditor.utils'
import type { CachedMediaFrame, CanvasStreamOutput, BrowserFrameSurface } from './CanvasEditor.types'

interface RenderLoopOptions {
  canvasRef: React.RefObject<HTMLCanvasElement>
  secondaryPreviewCanvasRef: React.RefObject<HTMLCanvasElement>
  activeScene: StudioScene
  aspectRatio: '16:9' | '9:16'
  outputFps: number
  outputActive: boolean
  previewMode: 'single' | 'dual'
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
}

export function useRenderLoop(options: RenderLoopOptions) {
  const { 
    canvasRef, secondaryPreviewCanvasRef, activeScene, aspectRatio, 
    outputFps, outputActive, previewMode, videoRefs, 
    mediaFrameCache, browserFrameCache, imageCache,
    audioClockRef, encoderWorkerRef, horizontalEncoderWorkerRef, verticalEncoderWorkerRef,
    streamOutputs, canvasWidth, canvasHeight, captureInputFormat
  } = options

  const [fps, setFps] = useState(0)
  const fpsRef = useRef({ count: 0, globalCount: 0, lastTime: performance.now() })
  const horizontalCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const verticalCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const compositedCaptureRef = useRef({ lastAt: 0, frameCount: 0 })
  const horizontalCaptureRef = useRef({ lastAt: 0, frameCount: 0 })
  const verticalCaptureRef = useRef({ lastAt: 0, frameCount: 0 })

  const secondaryAspectRatio = aspectRatio === '16:9' ? '9:16' : '16:9'

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

        if (l.type === 'camera' || l.type === 'display') {
          const video = videoRefs.current[l.id]
          const track = (video?.srcObject as MediaStream | null)?.getVideoTracks()[0]
          if (!video || video.readyState < 2 || video.videoWidth === 0 || track?.readyState === 'ended') {
            const cached = mediaFrameCache.current[l.id]
            if (cached) targetCtx.drawImage(cached.canvas, dl.x, dl.y, dl.width, dl.height)
            else drawMediaFallback(targetCtx, mediaFrameCache.current, l.id, dl, 'WAITING', l.name)
          } else {
            drawAndCacheMediaFrame(targetCtx, mediaFrameCache.current, l.id, video, dl, fpsRef.current.globalCount, layout.crop, 1)
          }
        } else if (l.type === 'image' && imageCache.current[l.id]) {
          targetCtx.drawImage(imageCache.current[l.id], dl.x, dl.y, dl.width, dl.height)
        } else if (l.type === 'widget' || l.type === 'browser') {
          const frame = browserFrameCache.current[l.id]
          if (frame) {
            const c = layout.crop
            if (c) targetCtx.drawImage(frame.canvas, c.left, c.top, frame.width - c.left - c.right, frame.height - c.top - c.bottom, dl.x, dl.y, dl.width, dl.height)
            else targetCtx.drawImage(frame.canvas, dl.x, dl.y, dl.width, dl.height)
          }
        } else if (l.type === 'text') {
          const fontSize = Number(l.config?.fontSize) || 48
          targetCtx.fillStyle = l.config?.color || '#fff'
          targetCtx.font = `700 ${fontSize}px Inter, sans-serif`
          targetCtx.textBaseline = 'top'
          wrapCanvasText(targetCtx, l.config?.text || '', dl.x, dl.y, dl.width, fontSize * 1.2, dl.height)
        }
        targetCtx.restore()
      }
    }

    const captureFrame = (worker: Worker | null, source: HTMLCanvasElement, capture: any, fps: number) => {
      if (!worker) return
      const now = performance.now()
      const interval = 1000 / Math.max(1, fps)
      if (now - capture.lastAt < interval - 2) return
      capture.lastAt = now
      capture.frameCount++
      try {
        const audioSamples = audioClockRef.current.totalSamples
        const timestamp = Math.round((audioSamples / 48000) * 1_000_000 + (performance.now() - audioClockRef.current.receivedAt) * 1000)
        const frame = new VideoFrame(source, { timestamp })
        worker.postMessage({ type: 'composited_frame', payload: { frame } }, [frame])
      } catch (err) { console.error('Capture failed', err) }
    }

    const render = () => {
      const now = performance.now()
      if (lastRenderAt > 0 && now - lastRenderAt < targetFrameMs - 1) {
        frameId = requestAnimationFrame(render); return
      }
      lastRenderAt = now - ((now - lastRenderAt) % targetFrameMs)

      fpsRef.current.count++
      fpsRef.current.globalCount++
      if (now - fpsRef.current.lastTime >= 1000) {
        setFps(fpsRef.current.count); fpsRef.current.count = 0; fpsRef.current.lastTime = now
      }

      drawScene(ctx, canvas, aspectRatio)
      
      const secondary = secondaryPreviewCanvasRef.current
      if (previewMode === 'dual' && secondary) {
        const sCtx = secondary.getContext('2d', { alpha: false })
        if (sCtx) drawScene(sCtx, secondary, secondaryAspectRatio)
      }

      if (outputActive) captureFrame(encoderWorkerRef.current, canvas, compositedCaptureRef.current, outputFps)
      
      const horiz = streamOutputs.find(o => o.id === 'horizontal' && o.active)
      if (horiz) {
        if (!horizontalCanvasRef.current) horizontalCanvasRef.current = document.createElement('canvas')
        horizontalCanvasRef.current.width = horiz.width; horizontalCanvasRef.current.height = horiz.height
        const hCtx = horizontalCanvasRef.current.getContext('2d', { alpha: false })
        if (hCtx) { drawScene(hCtx, horizontalCanvasRef.current, '16:9'); captureFrame(horizontalEncoderWorkerRef.current, horizontalCanvasRef.current, horizontalCaptureRef.current, horiz.fps) }
      }

      const vert = streamOutputs.find(o => o.id === 'vertical' && o.active)
      if (vert) {
        if (!verticalCanvasRef.current) verticalCanvasRef.current = document.createElement('canvas')
        verticalCanvasRef.current.width = vert.width; verticalCanvasRef.current.height = vert.height
        const vCtx = verticalCanvasRef.current.getContext('2d', { alpha: false })
        if (vCtx) { drawScene(vCtx, verticalCanvasRef.current, '9:16'); captureFrame(verticalEncoderWorkerRef.current, verticalCanvasRef.current, verticalCaptureRef.current, vert.fps) }
      }

      frameId = requestAnimationFrame(render)
    }

    render()
    return () => cancelAnimationFrame(frameId)
  }, [activeScene, aspectRatio, outputFps, outputActive, previewMode, streamOutputs])

  return { fps }
}
