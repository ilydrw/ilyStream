import { useRef, useState, useEffect, useMemo, useCallback, useImperativeHandle, forwardRef } from 'react'
import { useStudioStore } from '../../../stores/studio-store'
import { resolveLayerLayout, type StudioLayer } from '../../../../shared/studio'
import { ContextMenu, type ContextMenuItem } from '../../../components/ui/ContextMenu'
import {IconRotate2} from '@tabler/icons-react'

import { 
  type CanvasEditorProps, 
  type CanvasEditorHandle, 
  type DragState, 
  type ResizeState, 
  type BrowserFrameSurface, 
  type CachedMediaFrame,
  type RotateState,
  type HandleDir
} from './CanvasEditor.types'

import { resolveImageSource } from './CanvasEditor.utils'
import { useBroadcastAudio } from './useBroadcastAudio'
import { useVideoEncoder } from './useVideoEncoder'

// Modular Components & Hooks
import { InteractionLayer } from './InteractionLayer'
import { PerformanceHUD } from './PerformanceHUD'
import { CanvasToolbar } from './CanvasToolbar'
import { CanvasStatusBar } from './CanvasStatusBar'
import { useRenderLoop } from './useRenderLoop'
import { useBrowserSources } from './useBrowserSources'

export const CanvasEditor = forwardRef<CanvasEditorHandle, CanvasEditorProps>((props, ref) => {
  const { 
    activeScene, isStreaming, isRecording, captureInputFormat, 
    outputFps, outputBitrateKbps, videoRefs, streamReady, outputCodec,
    streamOutputs = [], previewMode = 'single'
  } = props
  
  const canvasWidth = useStudioStore(s => s.canvasWidth)
  const canvasHeight = useStudioStore(s => s.canvasHeight)
  const aspectRatio = useStudioStore(s => s.aspectRatio)
  const setSelectedLayer = useStudioStore(s => s.setSelectedLayer)
  const setAspectRatio = useStudioStore(s => s.setAspectRatio)
  const updateLayer = useStudioStore(s => s.updateLayer)
  const saveHistory = useStudioStore(s => s.saveHistory)
  const selectedLayerId = useStudioStore(s => s.selectedLayerId)
  const undo = useStudioStore(s => s.undo)
  const redo = useStudioStore(s => s.redo)
  
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const secondaryPreviewCanvasRef = useRef<HTMLCanvasElement>(null)
  const imageCache = useRef<Record<string, HTMLImageElement>>({})
  const mediaFrameCache = useRef<Record<string, CachedMediaFrame>>({})
  const browserFrameCache = useRef<Record<string, BrowserFrameSurface>>({})
  const audioClockRef = useRef({ totalSamples: 0, receivedAt: 0 })
  const hasRoutedStreamOutputs = streamOutputs.some(output => output.active)
  const outputActive = isRecording || (isStreaming && !hasRoutedStreamOutputs)
  const secondaryAspectRatio: '16:9' | '9:16' = aspectRatio === '16:9' ? '9:16' : '16:9'

  // IconVideo Encoders
  const { workerRef: encoderWorkerRef } = useVideoEncoder(outputActive, {
    outputId: 'program', format: captureInputFormat, fps: outputFps, bitrate: outputBitrateKbps, width: canvasWidth, height: canvasHeight, codec: outputCodec
  }, () => { if (isStreaming) void window.api?.streaming?.stop?.() })

  const horizontalOutput = streamOutputs.find(output => output.id === 'horizontal')
  const { workerRef: horizontalEncoderWorkerRef } = useVideoEncoder(Boolean(horizontalOutput?.active), {
    outputId: 'horizontal', format: horizontalOutput?.inputFormat ?? captureInputFormat, fps: horizontalOutput?.fps ?? outputFps, 
    bitrate: horizontalOutput?.bitrateKbps ?? outputBitrateKbps, width: horizontalOutput?.width ?? 1920, height: horizontalOutput?.height ?? 1080, codec: horizontalOutput?.codec
  }, () => { if (isStreaming) void window.api?.streaming?.stop?.() })

  const verticalOutput = streamOutputs.find(output => output.id === 'vertical')
  const { workerRef: verticalEncoderWorkerRef } = useVideoEncoder(Boolean(verticalOutput?.active), {
    outputId: 'vertical', format: verticalOutput?.inputFormat ?? captureInputFormat, fps: verticalOutput?.fps ?? outputFps,
    bitrate: verticalOutput?.bitrateKbps ?? outputBitrateKbps, width: verticalOutput?.width ?? 1080, height: verticalOutput?.height ?? 1920, codec: verticalOutput?.codec
  }, () => { if (isStreaming) void window.api?.streaming?.stop?.() })

  // Audio IconClock Sync
  useEffect(() => {
    if (!outputActive) { audioClockRef.current = { totalSamples: 0, receivedAt: 0 }; return }
    return window.api?.on?.('streaming:native-audio-clock', (data: any) => {
      audioClockRef.current = { totalSamples: data.totalSamples, receivedAt: performance.now() }
    })
  }, [outputActive])

  // Audio Engine
  useBroadcastAudio(isStreaming || isRecording, videoRefs, streamReady)

  // Browser Sources
  useBrowserSources({ layers: activeScene.layers, aspectRatio, overlayPort: 8899, browserFrameCache })

  // Render Loop
  const { fps } = useRenderLoop({
    canvasRef, secondaryPreviewCanvasRef, activeScene, aspectRatio, outputFps, outputActive, previewMode,
    videoRefs, mediaFrameCache, browserFrameCache, imageCache, audioClockRef, encoderWorkerRef,
    horizontalEncoderWorkerRef, verticalEncoderWorkerRef, streamOutputs, canvasWidth, canvasHeight,
    captureInputFormat, outputCodec, outputBitrateKbps
  })

  // Viewport & Pan/Zoom State
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [fitScale, setFitScale] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const viewportRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const scaleRef = useRef(1)

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect
      if (!r) return
      const sW = secondaryAspectRatio === '16:9' ? 1920 : 1080
      const sH = secondaryAspectRatio === '16:9' ? 1080 : 1920
      const isDual = previewMode === 'dual' || previewMode === 'dual-portrait' || previewMode === 'dual-horizontal'
      const pW = isDual ? canvasWidth + sW + 48 : canvasWidth
      const pH = isDual ? Math.max(canvasHeight, sH) : canvasHeight
      setFitScale(Math.min((r.width - 64) / pW, (r.height - 64) / pH))
    })
    obs.observe(el); return () => obs.disconnect()
  }, [canvasWidth, canvasHeight, previewMode, secondaryAspectRatio])

  useEffect(() => {
    scaleRef.current = fitScale * zoom
    if (containerRef.current) {
      containerRef.current.style.transform = `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scaleRef.current})`
    }
  }, [fitScale, zoom, pan, canvasWidth, canvasHeight])

  // Input Handlers
  const dragRef = useRef<DragState | null>(null)
  const resizeRef = useRef<ResizeState | null>(null)
  const rotateRef = useRef<RotateState | null>(null)

  const handleMouseDown = (e: React.MouseEvent, layer: StudioLayer) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault()
      setIsPanning(true)
      return
    }
    if (e.button !== 0) return
    const layout = resolveLayerLayout(layer, aspectRatio)
    if (layout.locked) return
    e.stopPropagation(); setSelectedLayer(layer.id); saveHistory()
    dragRef.current = { id: layer.id, startX: e.clientX, startY: e.clientY, origX: layout.x, origY: layout.y, width: layout.width, height: layout.height }
  }

  const handleResizeStart = (e: React.MouseEvent, layer: StudioLayer, handle: HandleDir) => {
    e.stopPropagation()
    const layout = resolveLayerLayout(layer, aspectRatio)
    if (layout.locked) return
    saveHistory()
    resizeRef.current = { id: layer.id, handle, startX: e.clientX, startY: e.clientY, origX: layout.x, origY: layout.y, origW: layout.width, origH: layout.height, ratio: layout.width / layout.height, isCropping: e.altKey }
  }

  const handleRotateStart = (e: React.MouseEvent, layer: StudioLayer) => {
    e.stopPropagation(); setSelectedLayer(layer.id); saveHistory()
    const layout = resolveLayerLayout(layer, aspectRatio)
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const centerX = rect.left + (layout.x + layout.width / 2) * scaleRef.current
    const centerY = rect.top + (layout.y + layout.height / 2) * scaleRef.current
    rotateRef.current = { id: layer.id, startAngle: Math.atan2(e.clientY - centerY, e.clientX - centerX), origRotation: Number(layout.rotation || 0), centerX, centerY }
  }

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) {
        const delta = -e.deltaY
        const factor = delta > 0 ? 1.1 : 0.9
        setZoom(z => Math.min(10, Math.max(0.1, z * factor)))
      } else {
        setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }))
      }
    }

    viewport.addEventListener('wheel', handleNativeWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleNativeWheel)
  }, [])

  const handleContainerMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault()
      setIsPanning(true)
    }
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (isPanning) {
        setPan(p => ({ x: p.x + e.movementX, y: p.y + e.movementY }))
        return
      }
      
      if (dragRef.current) {
        const d = dragRef.current
        updateLayer(activeScene.id, d.id, { 
          x: d.origX + (e.clientX - d.startX) / scaleRef.current, 
          y: d.origY + (e.clientY - d.startY) / scaleRef.current 
        })
      } else if (resizeRef.current) {
        const r = resizeRef.current
        const dx = (e.clientX - r.startX) / scaleRef.current
        const dy = (e.clientY - r.startY) / scaleRef.current
        
        // Basic resize logic (can be expanded for specific handles)
        const update: any = {}
        if (r.handle.includes('e')) update.width = Math.max(10, r.origW + dx)
        if (r.handle.includes('s')) update.height = Math.max(10, r.origH + dy)
        if (r.handle.includes('w')) {
          update.width = Math.max(10, r.origW - dx)
          update.x = r.origX + dx
        }
        if (r.handle.includes('n')) {
          update.height = Math.max(10, r.origH - dy)
          update.y = r.origY + dy
        }
        updateLayer(activeScene.id, r.id, update)
      } else if (rotateRef.current) {
        const r = rotateRef.current
        const angle = Math.atan2(e.clientY - r.centerY, e.clientX - r.centerX)
        updateLayer(activeScene.id, r.id, { 
          rotation: r.origRotation + (angle - r.startAngle) * 180 / Math.PI 
        })
      }
    }
    
    const onUp = () => { 
      setIsPanning(false)
      dragRef.current = null
      resizeRef.current = null
      rotateRef.current = null 
    }
    
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { 
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [activeScene.id, updateLayer, isPanning])

  return (
    <div className="relative flex-1 flex flex-col bg-black/40 overflow-hidden" ref={wrapperRef}>
      <CanvasToolbar canvasWidth={canvasWidth} canvasHeight={canvasHeight} isFullscreen={false} onToggleFullscreen={() => {}} onResetView={() => { setPan({ x: 0, y: 0 }); setZoom(1) }} />
      <div 
        ref={viewportRef} 
        onMouseDown={handleContainerMouseDown} 
        className={`flex-1 relative overflow-hidden bg-[#0a0a0a] ${isPanning ? 'cursor-grabbing' : ''}`}
      >
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden p-12">
          <div 
            ref={containerRef} 
            className="flex items-center gap-12 transition-transform duration-75 will-change-transform origin-center"
          >
            {/* Primary Canvas */}
            <div 
              className="relative shadow-2xl border border-white/10 bg-[#050505]"
              style={{ width: canvasWidth, height: canvasHeight }}
            >
              <canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} className="block w-full h-full" />
              <PerformanceHUD fps={fps} targetFps={outputFps} format={captureInputFormat} />
              <InteractionLayer 
                layers={activeScene.layers} selectedLayerId={selectedLayerId} aspectRatio={aspectRatio} canvasWidth={canvasWidth}
                resolve={(l) => resolveLayerLayout(l, aspectRatio)} onMouseDown={handleMouseDown} onRotateStart={handleRotateStart}
                onResizeStart={handleResizeStart} onAutoCrop={() => {}} isCropping={(id) => resizeRef.current?.id === id && !!resizeRef.current?.isCropping}
              />
              
              <div className="absolute -top-6 left-0 text-[10px] font-black uppercase tracking-[0.2em] text-white/20">
                Primary: {aspectRatio}
              </div>
            </div>

            {/* Secondary Canvas (Dual Mode) */}
            {(previewMode === 'dual' || previewMode === 'dual-portrait') && (
              <div 
                className="relative shadow-2xl border border-white/10 bg-[#050505] opacity-60"
                style={{ 
                  width: previewMode === 'dual-portrait' ? 1080 : (previewMode === 'dual-horizontal' ? 1920 : (secondaryAspectRatio === '16:9' ? 1920 : 1080)), 
                  height: previewMode === 'dual-portrait' ? 1920 : (previewMode === 'dual-horizontal' ? 1080 : (secondaryAspectRatio === '16:9' ? 1080 : 1920)) 
                }}
              >
                <canvas 
                  ref={secondaryPreviewCanvasRef} 
                  height={secondaryAspectRatio === '16:9' ? 1080 : 1920} 
                  className="block w-full h-full" 
                />
                <div className="absolute -top-6 left-0 text-[10px] font-black uppercase tracking-[0.2em] text-white/20">
                  Secondary: {secondaryAspectRatio}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <CanvasStatusBar fps={fps} outputFps={outputFps} format={captureInputFormat} zoom={zoom} canvasWidth={canvasWidth} canvasHeight={canvasHeight} aspectRatio={aspectRatio} onZoomIn={() => setZoom(z => z * 1.2)} onZoomOut={() => setZoom(z => z * 0.8)} onResetZoom={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} />
    </div>
  )
})
