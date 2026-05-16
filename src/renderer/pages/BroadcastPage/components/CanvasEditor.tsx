import { useRef, useState, useEffect, useLayoutEffect, useMemo, useCallback, useImperativeHandle, forwardRef } from 'react'
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
    streamOutputs = [], previewMode = 'single', selectionContext = '16:9',
    dualVerticalOverlayEnabled = false, isVisible = true, isPreview = false,
    onContextMenu, onSelectionContextChange
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
  const [activeGuides, setActiveGuides] = useState<{ type: 'v' | 'h', pos: number, targetId?: string }[]>([])
  const gridSize = useStudioStore(s => s.gridSize)
  const previewSceneId = useStudioStore(s => s.previewSceneId)
  const activeSceneId = useStudioStore(s => s.activeSceneId)
  const isSelectedScene = isPreview ? (activeScene.id === previewSceneId) : (activeScene.id === activeSceneId)

  // IconVideo Encoders
  const { workerRef: encoderWorkerRef } = useVideoEncoder(!isPreview && outputActive, {
    format: captureInputFormat, fps: outputFps, bitrate: outputBitrateKbps, width: canvasWidth, height: canvasHeight, codec: outputCodec
  }, () => { if (isStreaming) void window.api?.streaming?.stop?.() })
  const horizontalOutput = streamOutputs.find(output => output.id === 'horizontal')
  const { workerRef: horizontalEncoderWorkerRef } = useVideoEncoder(!isPreview && Boolean(horizontalOutput?.active), {
    outputId: 'horizontal', format: horizontalOutput?.inputFormat ?? captureInputFormat, fps: horizontalOutput?.fps ?? outputFps,
    bitrate: horizontalOutput?.bitrateKbps ?? outputBitrateKbps, width: horizontalOutput?.width ?? 1920, height: horizontalOutput?.height ?? 1080, codec: horizontalOutput?.codec
  }, () => { if (isStreaming) void window.api?.streaming?.stop?.() })
  const verticalOutput = streamOutputs.find(output => output.id === 'vertical')
  const { workerRef: verticalEncoderWorkerRef } = useVideoEncoder(!isPreview && Boolean(verticalOutput?.active), {
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
  useBroadcastAudio(!isPreview && (isStreaming || isRecording), videoRefs, streamReady)

  // Browser Sources
  useBrowserSources({ layers: activeScene.layers, aspectRatio, overlayPort: 8899, browserFrameCache })

  // Render Loop
  const { fps } = useRenderLoop({
    canvasRef, secondaryPreviewCanvasRef, activeScene, aspectRatio, outputFps, outputActive, previewMode,
    videoRefs, mediaFrameCache, browserFrameCache, imageCache, audioClockRef, encoderWorkerRef,
    horizontalEncoderWorkerRef, verticalEncoderWorkerRef, streamOutputs, canvasWidth, canvasHeight,
    captureInputFormat, outputCodec, outputBitrateKbps, dualVerticalOverlayEnabled, isVisible
  })

  useImperativeHandle(ref, () => ({
    takeScreenshot: async () => {
      const canvas = canvasRef.current
      if (!canvas || !window.api?.streaming?.takeScreenshot) return

      const blob = await new Promise<Blob | null>(resolve => {
        canvas.toBlob(resolve, 'image/jpeg', 0.92)
      })
      if (!blob) return

      const result = await window.api.streaming.takeScreenshot(new Uint8Array(await blob.arrayBuffer()))
      if (!result?.success) {
        console.error('[CanvasEditor] Screenshot failed:', result?.error)
      }
    }
  }), [])

  // Viewport & Zoom State
  const [zoom, setZoom] = useState(1)
  const [fitScale, setFitScale] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const scaleRef = useRef(1)
  const pendingScrollAdjust = useRef<{
    contentX: number
    contentY: number
    cursorClientX: number
    cursorClientY: number
  } | null>(null)

  // Content dimensions in native (unscaled) coordinates
  const sW = secondaryAspectRatio === '16:9' ? 1920 : 1080
  const sH = secondaryAspectRatio === '16:9' ? 1080 : 1920
  const isDual = previewMode === 'dual' || previewMode === 'dual-portrait' || previewMode === 'dual-horizontal'
  const secondaryPreviewAspectRatio: '16:9' | '9:16' =
    previewMode === 'dual-horizontal' ? '16:9' :
    previewMode === 'dual-portrait' ? '9:16' :
    secondaryAspectRatio
  const secondaryNativeW = previewMode === 'dual-portrait' ? 1080 : (previewMode === 'dual-horizontal' ? 1920 : sW)
  const secondaryNativeH = previewMode === 'dual-portrait' ? 1920 : (previewMode === 'dual-horizontal' ? 1080 : sH)
  const contentNativeW = isDual ? canvasWidth + secondaryNativeW + 48 : canvasWidth
  const contentNativeH = isDual ? Math.max(canvasHeight, secondaryNativeH) : canvasHeight
  const scale = fitScale * zoom
  const scaledContentW = Math.max(1, contentNativeW * scale)
  const scaledContentH = Math.max(1, contentNativeH * scale)

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect
      if (!r) return
      setFitScale(Math.min((r.width - 96) / contentNativeW, (r.height - 96) / contentNativeH))
    })
    obs.observe(el); return () => obs.disconnect()
  }, [contentNativeW, contentNativeH])

  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  const clampZoomValue = (value: number) => Math.min(10, Math.max(0.1, value))

  const queueZoomAtClientPoint = useCallback((
    clientX: number,
    clientY: number,
    getNextZoom: (currentZoom: number) => number
  ) => {
    const content = containerRef.current
    const currentScale = scaleRef.current
    if (!content || currentScale <= 0) return

    const rect = content.getBoundingClientRect()
    const contentX = (clientX - rect.left) / currentScale
    const contentY = (clientY - rect.top) / currentScale

    setZoom(prev => {
      const next = clampZoomValue(getNextZoom(prev))
      if (next === prev) return prev

      pendingScrollAdjust.current = {
        contentX,
        contentY,
        cursorClientX: clientX,
        cursorClientY: clientY
      }
      return next
    })
  }, [])

  const zoomAtViewportCenter = useCallback((factor: number) => {
    const viewport = viewportRef.current
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    queueZoomAtClientPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      currentZoom => currentZoom * factor
    )
  }, [queueZoomAtClientPoint])

  // After zoom changes, pan so the cursor's content point stays under the cursor.
  useLayoutEffect(() => {
    const content = containerRef.current
    const pending = pendingScrollAdjust.current
    if (!content || !pending) return
    const rect = content.getBoundingClientRect()
    const targetContentPxX = pending.contentX * scale
    const targetContentPxY = pending.contentY * scale
    const adjustX = pending.cursorClientX - (rect.left + targetContentPxX)
    const adjustY = pending.cursorClientY - (rect.top + targetContentPxY)
    pendingScrollAdjust.current = null
    if (Math.abs(adjustX) > 0.01 || Math.abs(adjustY) > 0.01) {
      setPanOffset(prev => ({ x: prev.x + adjustX, y: prev.y + adjustY }))
    }
  }, [zoom, fitScale, scale])

  // Input Handlers
  const dragRef = useRef<DragState | null>(null)
  const resizeRef = useRef<ResizeState | null>(null)
  const rotateRef = useRef<RotateState | null>(null)

  const handleMouseDown = (e: React.MouseEvent, layer: StudioLayer, interactionAspectRatio: '16:9' | '9:16') => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault()
      setIsPanning(true)
      return
    }
    if (e.button !== 0) return
    onSelectionContextChange(interactionAspectRatio)
    const layout = resolveLayerLayout(layer, interactionAspectRatio)
    if (layout.locked) return
    e.stopPropagation(); setSelectedLayer(layer.id); saveHistory()
    dragRef.current = { id: layer.id, startX: e.clientX, startY: e.clientY, origX: layout.x, origY: layout.y, width: layout.width, height: layout.height }
  }

  const handleResizeStart = (e: React.MouseEvent, layer: StudioLayer, handle: HandleDir, interactionAspectRatio: '16:9' | '9:16') => {
    e.stopPropagation()
    onSelectionContextChange(interactionAspectRatio)
    const layout = resolveLayerLayout(layer, interactionAspectRatio)
    if (layout.locked) return
    saveHistory()
    resizeRef.current = { id: layer.id, handle, startX: e.clientX, startY: e.clientY, origX: layout.x, origY: layout.y, origW: layout.width, origH: layout.height, ratio: layout.width / layout.height, isCropping: e.altKey }
  }

  const handleRotateStart = (e: React.MouseEvent, layer: StudioLayer, interactionAspectRatio: '16:9' | '9:16') => {
    e.stopPropagation()
    onSelectionContextChange(interactionAspectRatio)
    setSelectedLayer(layer.id); saveHistory()
    const layout = resolveLayerLayout(layer, interactionAspectRatio)
    const rect = e.currentTarget.closest('.relative')?.getBoundingClientRect()
    if (!rect) return
    const centerX = rect.left + (layout.x + layout.width / 2) * scaleRef.current
    const centerY = rect.top + (layout.y + layout.height / 2) * scaleRef.current
    rotateRef.current = { id: layer.id, startAngle: Math.atan2(e.clientY - centerY, e.clientX - centerX), origRotation: Number(layout.rotation || 0), centerX, centerY }
  }

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const handleNativeWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement

      // Don't intercept if scrolling on a toolbar or UI element outside the canvas area
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey && target.closest('.canvas-toolbar')) {
        return
      }

      e.preventDefault()
      e.stopPropagation()

      if (!e.ctrlKey && !e.metaKey) {
        // Simple panning for standard wheel usage
        const deltaX = e.shiftKey ? e.deltaY : e.deltaX
        const deltaY = e.shiftKey ? 0 : e.deltaY

        setPanOffset(prev => ({
          x: prev.x - deltaX,
          y: prev.y - deltaY
        }))
        return
      }

      const factor = Math.exp(-e.deltaY * 0.0015)
      queueZoomAtClientPoint(e.clientX, e.clientY, currentZoom => currentZoom * factor)
    }

    viewport.addEventListener('wheel', handleNativeWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleNativeWheel)
  }, [queueZoomAtClientPoint])

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && !e.altKey) {
      setSelectedLayer(null)
    }
    if (e.button === 1 || e.altKey) {
      setIsPanning(true)
    }
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (isPanning) {
        setPanOffset(prev => ({ x: prev.x + e.movementX, y: prev.y + e.movementY }))
        return
      }

      const isPortrait = selectionContext === '9:16'
      const curCanvasW = isPortrait ? 1080 : 1920
      const curCanvasH = isPortrait ? 1920 : 1080

      const getSnappingResult = (x: number, y: number, w: number, h: number, excludeId: string) => {
        const threshold = 48 / scaleRef.current
        const guides: { type: 'v' | 'h', pos: number, targetId?: string }[] = []
        let snappedX = x
        let snappedY = y

        const targetsX: { pos: number, targetId?: string }[] = [
          { pos: 0 }, { pos: curCanvasW / 2 }, { pos: curCanvasW }
        ]
        const targetsY: { pos: number, targetId?: string }[] = [
          { pos: 0 }, { pos: curCanvasH / 2 }, { pos: curCanvasH }
        ]

        activeScene.layers.forEach(l => {
          if (l.id === excludeId) return
          const layout = resolveLayerLayout(l, isPortrait ? '9:16' : '16:9')
          if (!layout.visible) return
          targetsX.push({ pos: layout.x, targetId: l.id }, { pos: layout.x + layout.width / 2, targetId: l.id }, { pos: layout.x + layout.width, targetId: l.id })
          targetsY.push({ pos: layout.y, targetId: l.id }, { pos: layout.y + layout.height / 2, targetId: l.id }, { pos: layout.y + layout.height, targetId: l.id })
        })

        const myX = [snappedX, snappedX + w / 2, snappedX + w]
        const myY = [snappedY, snappedY + h / 2, snappedY + h]

        // Find best X snap
        let bestDiffX = threshold
        let bestTargetX = null
        let bestSourceX = null
        for (const t of targetsX) {
          for (const m of myX) {
            const diff = Math.abs(m - t.pos)
            if (diff < bestDiffX) {
              bestDiffX = diff
              bestTargetX = t
              bestSourceX = m
            }
          }
        }
        if (bestTargetX !== null) {
          snappedX += (bestTargetX.pos - (bestSourceX!))
          guides.push({ type: 'v', pos: bestTargetX.pos, targetId: bestTargetX.targetId })
        }

        // Find best Y snap
        let bestDiffY = threshold
        let bestTargetY = null
        let bestSourceY = null
        for (const t of targetsY) {
          for (const m of myY) {
            const diff = Math.abs(m - t.pos)
            if (diff < bestDiffY) {
              bestDiffY = diff
              bestTargetY = t
              bestSourceY = m
            }
          }
        }
        if (bestTargetY !== null) {
          snappedY += (bestTargetY.pos - (bestSourceY!))
          guides.push({ type: 'h', pos: bestTargetY.pos, targetId: bestTargetY.targetId })
        }

        return { x: snappedX, y: snappedY, guides }
      }

      if (dragRef.current) {
        const d = dragRef.current
        let newX = d.origX + (e.clientX - d.startX) / scaleRef.current
        let newY = d.origY + (e.clientY - d.startY) / scaleRef.current

        if (snapToGrid) {
          const snap = getSnappingResult(newX, newY, d.width, d.height, d.id)
          newX = snap.x
          newY = snap.y
          setActiveGuides(snap.guides)
        } else {
          setActiveGuides([])
        }

        const updates: any = {}
        if (isPortrait) {
          updates.portraitX = newX
          updates.portraitY = newY
        } else {
          updates.x = newX
          updates.y = newY
        }
        updateLayer(activeScene.id, d.id, updates)
      } else if (resizeRef.current) {
        const r = resizeRef.current
        const dx = (e.clientX - r.startX) / scaleRef.current
        const dy = (e.clientY - r.startY) / scaleRef.current

        let finalX = r.handle.includes('w') ? r.origX + dx : r.origX
        let finalY = r.handle.includes('n') ? r.origY + dy : r.origY
        let finalW = r.handle.includes('e') ? Math.max(10, r.origW + dx) : (r.handle.includes('w') ? Math.max(10, r.origW - dx) : r.origW)
        let finalH = r.handle.includes('s') ? Math.max(10, r.origH + dy) : (r.handle.includes('n') ? Math.max(10, r.origH - dy) : r.origH)

        // 1. Snapping (Apply to the raw dragged edge)
        if (snapToGrid) {
          const threshold = 48 / scaleRef.current
          const guides: { type: 'v' | 'h', pos: number, targetId?: string }[] = []
          const targetsX = [{ pos: 0 }, { pos: curCanvasW / 2 }, { pos: curCanvasW }]
          const targetsY = [{ pos: 0 }, { pos: curCanvasH / 2 }, { pos: curCanvasH }]
          activeScene.layers.forEach(l => {
            if (l.id === r.id) return
            const layout = resolveLayerLayout(l, isPortrait ? '9:16' : '16:9')
            if (!layout.visible) return
            targetsX.push({ pos: layout.x, targetId: l.id }, { pos: layout.x + layout.width / 2, targetId: l.id }, { pos: layout.x + layout.width, targetId: l.id })
            targetsY.push({ pos: layout.y, targetId: l.id }, { pos: layout.y + layout.height / 2, targetId: l.id }, { pos: layout.y + layout.height, targetId: l.id })
          })

          if (r.handle.includes('e')) {
            const edge = r.origX + r.origW + dx
            for (const t of targetsX) if (Math.abs(edge - t.pos) < threshold) { finalW = t.pos - r.origX; guides.push({ type: 'v', pos: t.pos, targetId: t.targetId }); break }
          } else if (r.handle.includes('w')) {
            const edge = r.origX + dx
            for (const t of targetsX) if (Math.abs(edge - t.pos) < threshold) { finalX = t.pos; finalW = r.origX + r.origW - t.pos; guides.push({ type: 'v', pos: t.pos, targetId: t.targetId }); break }
          }
          if (r.handle.includes('s')) {
            const edge = r.origY + r.origH + dy
            for (const t of targetsY) if (Math.abs(edge - t.pos) < threshold) { finalH = t.pos - r.origY; guides.push({ type: 'h', pos: t.pos, targetId: t.targetId }); break }
          } else if (r.handle.includes('n')) {
            const edge = r.origY + dy
            for (const t of targetsY) if (Math.abs(edge - t.pos) < threshold) { finalY = t.pos; finalH = r.origY + r.origH - t.pos; guides.push({ type: 'h', pos: t.pos, targetId: t.targetId }); break }
          }
          setActiveGuides(guides)
        } else {
          setActiveGuides([])
        }

        // 2. Maintain aspect ratio (Force other dimension to match)
        const layer = activeScene.layers.find(l => l.id === r.id)
        const isMedia = layer?.type === 'camera' || layer?.type === 'image' || layer?.type === 'browser' || layer?.type === 'widget'
        const shouldLockAspect = isMedia || e.shiftKey

        if (shouldLockAspect && r.origW > 0 && r.origH > 0) {
          const ratio = r.origW / r.origH
          if (r.handle.length === 1) { // n, s, e, w
            if (r.handle === 'n' || r.handle === 's') {
              finalW = finalH * ratio
              finalX = r.origX + (r.origW - finalW) / 2
            } else {
              finalH = finalW / ratio
              finalY = r.origY + (r.origH - finalH) / 2
            }
          } else { // ne, nw, se, sw
            const scaleX = finalW / r.origW
            const scaleY = finalH / r.origH
            const scale = Math.max(scaleX, scaleY)
            finalW = r.origW * scale
            finalH = r.origH * scale
            if (r.handle.includes('w')) finalX = r.origX + r.origW - finalW
            if (r.handle.includes('n')) finalY = r.origY + r.origH - finalH
          }
        }

        // 3. Update all properties
        const updates: any = {}
        if (isPortrait) {
          updates.portraitX = finalX; updates.portraitY = finalY; updates.portraitWidth = finalW; updates.portraitHeight = finalH
        } else {
          updates.x = finalX; updates.y = finalY; updates.width = finalW; updates.height = finalH
        }
        updateLayer(activeScene.id, r.id, updates)
      } else if (rotateRef.current) {
        const r = rotateRef.current
        const isPortrait = selectionContext === '9:16'
        const angle = Math.atan2(e.clientY - r.centerY, e.clientX - r.centerX)
        const newRotation = r.origRotation + (angle - r.startAngle) * 180 / Math.PI

        updateLayer(activeScene.id, r.id, isPortrait ? { portraitRotation: newRotation } : { rotation: newRotation })
      }
    }

    const onUp = () => {
      setIsPanning(false)
      dragRef.current = null
      resizeRef.current = null
      rotateRef.current = null
      setActiveGuides([])
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [activeScene.id, updateLayer, isPanning, selectionContext, aspectRatio])

  const resetView = () => {
    setZoom(1)
    setPanOffset({ x: 0, y: 0 })
    requestAnimationFrame(() => {
      const v = viewportRef.current
      if (!v) return
      v.scrollLeft = (v.scrollWidth - v.clientWidth) / 2
      v.scrollTop = (v.scrollHeight - v.clientHeight) / 2
    })
  }

  return (
    <div className="relative flex-1 flex flex-col bg-black/40 overflow-hidden" ref={wrapperRef}>
      <CanvasToolbar canvasWidth={canvasWidth} canvasHeight={canvasHeight} isFullscreen={false} onToggleFullscreen={() => {}} onResetView={resetView} />
      <div
        ref={viewportRef}
        onMouseDown={handleCanvasMouseDown}
        className={`canvas-viewport flex-1 relative overflow-scroll bg-[#0a0a0a] ${isPanning ? 'cursor-grabbing' : ''}`}
      >
        <div
          className="min-w-full min-h-full flex items-center justify-center"
          style={{ padding: 48, boxSizing: 'border-box' }}
          onMouseDown={handleCanvasMouseDown}
        >
          <div ref={contentRef} style={{ width: scaledContentW, height: scaledContentH, flexShrink: 0, position: 'relative' }} onMouseDown={(e) => e.stopPropagation()}>
            <div
              ref={containerRef}
              className="flex items-center gap-12 will-change-transform"
              style={{
                width: contentNativeW,
                height: contentNativeH,
                transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(${scale})`,
                transformOrigin: 'top left'
              }}
            >
              {/* Primary Canvas */}
                <div
                  className="relative shadow-2xl border border-white/10 bg-[#050505]"
                  style={{ width: canvasWidth, height: canvasHeight }}
                  onMouseDown={handleCanvasMouseDown}
                  onContextMenu={(e) => onContextMenu?.(e, null, aspectRatio)}
                >
                <canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} className="block w-full h-full" />
                <PerformanceHUD fps={fps} targetFps={outputFps} format={captureInputFormat} />
                <InteractionLayer
                  layers={activeScene.layers} selectedLayerId={selectionContext === aspectRatio ? selectedLayerId : null}
                  aspectRatio={aspectRatio} canvasWidth={canvasWidth}
                  highlightedLayerId={activeGuides.find(g => g.targetId)?.targetId}
                  resolve={(l) => resolveLayerLayout(l, aspectRatio)} onMouseDown={handleMouseDown} onRotateStart={handleRotateStart}
                  onResizeStart={handleResizeStart} onAutoCrop={() => {}} isCropping={(id) => resizeRef.current?.id === id && !!resizeRef.current?.isCropping}
                  onContextMenu={onContextMenu}
                />

                {/* Static Center Guides while interacting */}
                {(dragRef.current || resizeRef.current) && selectionContext === aspectRatio && (
                  <div className="absolute inset-0 pointer-events-none opacity-20">
                    <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white" />
                    <div className="absolute left-1/2 top-0 h-full w-[1px] bg-white" />
                  </div>
                )}

                {selectionContext === aspectRatio && activeGuides.length > 0 && (
                  <div className="absolute inset-0 pointer-events-none">
                    {activeGuides.map((g, i) => (
                      <div
                        key={i}
                        className="absolute bg-white ring-2 ring-accent shadow-glow z-context"
                        style={{
                          left: g.type === 'v' ? `${g.pos}px` : 0,
                          top: g.type === 'h' ? `${g.pos}px` : 0,
                          width: g.type === 'v' ? '6px' : '100%',
                          height: g.type === 'h' ? '6px' : '100%',
                          transform: g.type === 'v' ? 'translateX(-50%)' : 'translateY(-50%)'
                        }}
                      />
                    ))}
                  </div>
                )}


                <div className="absolute -top-6 left-0 text-xs font-black uppercase tracking-[0.2em] text-white/20">
                  {isPreview ? 'Preview' : 'Program'}: {aspectRatio}
                </div>
              </div>

              {isDual && (
                <div
                  className="relative group h-full flex items-center justify-center p-2"
                  onContextMenu={(e) => onContextMenu?.(e, null, secondaryPreviewAspectRatio)}
                  onClick={() => onContextMenu?.({ clientX: 0, clientY: 0 } as any, null, secondaryPreviewAspectRatio)}
                >
                  <canvas
                    ref={secondaryPreviewCanvasRef}
                    width={secondaryNativeW}
                    height={secondaryNativeH}
                    className="h-full w-auto object-contain bg-[#0a0a0c] rounded-lg shadow-2xl transition-all group-hover:shadow-accent/10 border border-white/5"
                  />
                  <InteractionLayer
                    layers={activeScene.layers} selectedLayerId={selectionContext === secondaryAspectRatio ? selectedLayerId : null}
                    aspectRatio={secondaryAspectRatio} canvasWidth={secondaryNativeW}
                    highlightedLayerId={activeGuides.find(g => g.targetId)?.targetId}
                    resolve={(l) => resolveLayerLayout(l, secondaryAspectRatio)} onMouseDown={handleMouseDown} onRotateStart={handleRotateStart}
                    onResizeStart={handleResizeStart} onAutoCrop={() => {}} isCropping={(id) => resizeRef.current?.id === id && !!resizeRef.current?.isCropping}
                    onContextMenu={onContextMenu}
                  />

                  {/* Static Center Guides while interacting */}
                  {(dragRef.current || resizeRef.current) && selectionContext === secondaryAspectRatio && (
                    <div className="absolute inset-0 pointer-events-none opacity-20">
                      <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white" />
                      <div className="absolute left-1/2 top-0 h-full w-[1px] bg-white" />
                    </div>
                  )}

                  {selectionContext === secondaryAspectRatio && activeGuides.length > 0 && (
                    <div className="absolute inset-0 pointer-events-none">
                      {activeGuides.map((g, i) => (
                        <div
                          key={i}
                          className="absolute bg-accent shadow-glow z-context"
                          style={{
                            left: g.type === 'v' ? `${g.pos}px` : 0,
                            top: g.type === 'h' ? `${g.pos}px` : 0,
                            width: g.type === 'v' ? '6px' : '100%',
                            height: g.type === 'h' ? '6px' : '100%',
                            transform: g.type === 'v' ? 'translateX(-50%)' : 'translateY(-50%)'
                          }}
                        />
                      ))}
                    </div>
                  )}

                  <div className="absolute -top-6 left-0 text-xs font-black uppercase tracking-[0.2em] text-white/20">
                    Secondary: {secondaryAspectRatio}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <CanvasStatusBar fps={fps} outputFps={outputFps} format={captureInputFormat} zoom={zoom} canvasWidth={canvasWidth} canvasHeight={canvasHeight} aspectRatio={aspectRatio} onZoomIn={() => zoomAtViewportCenter(1.2)} onZoomOut={() => zoomAtViewportCenter(0.8)} onResetZoom={resetView} />
    </div>
  )
})
