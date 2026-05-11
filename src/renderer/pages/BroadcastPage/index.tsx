import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import {IconSquare, IconArrowsMove, IconMaximize, IconCrosshair, IconPencil, IconCopy, IconTrash, IconCast, IconSparkles} from '@tabler/icons-react'
import { useStudioStore } from '../../stores/studio-store'
import { audioEngine } from '../../utils/audio-engine'
import type { LayerType, StudioLayer } from '../../../shared/studio'
import { CanvasEditor } from './components/CanvasEditor'
import type { CanvasEditorHandle } from './components/CanvasEditor.types'
import { ContextMenu } from '../../components/ui/ContextMenu'
import { AddSourceModal } from './components/AddSourceModal'
import { getOptimizedCaptureInputFormat, pickAvcCodecString, type BroadcastLayoutId, type BroadcastLayoutMode, buildStreamPlatforms } from './utils/streaming-config'
import { resolveWidgetStudioPreset } from './utils/widget-placement'

// Modular Components & Hooks
import { BroadcastHeader } from './components/BroadcastHeader'
import { DualVerticalOverlayBar } from './components/DualVerticalOverlayBar'
import { SceneSidebar } from './components/SceneSidebar'
import { SourceSidebar } from './components/SourceSidebar'
import { MixerContainer } from './components/MixerContainer'
import { useMediaManagement } from './hooks/useMediaManagement'
import { EnhancementModal } from './components/EnhancementModal'
import { usePageVisibility } from '../../hooks/usePageVisibility'

function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export default function BroadcastPage() {
  const store = useStudioStore()
  const [isStreaming, setIsStreaming] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null)
  const [status, setStatus] = useState('Offline')
  const [streamError, setStreamError] = useState<string | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [widgets, setWidgets] = useState<any[]>([])
  const [platforms, setPlatforms] = useState<any[]>([])
  const [monitors, setMonitors] = useState<any[]>([])
  const [selectedMonitorId, setSelectedMonitorId] = useState<number | null>(null)
  const [obsStatus, setObsStatus] = useState<any>(null)
  const [virtualCameraInfo, setVirtualCameraInfo] = useState<any>(null)
  const [broadcastLayoutMode, setBroadcastLayoutMode] = useState<BroadcastLayoutMode>('horizontal')
  const [layoutAssignments, setLayoutAssignments] = useState<Record<BroadcastLayoutId, string[]>>({ horizontal: [], vertical: [] })
  const [customRtmpUrl, setCustomRtmpUrl] = useState('')
  const [customStreamKey, setCustomStreamKey] = useState('')
  const [showSourceModal, setShowSourceModal] = useState(false)
  const [sourceContextMenu, setSourceContextMenu] = useState<{ x: number, y: number, layer: StudioLayer | null } | null>(null)
  const [sceneContextMenu, setSceneContextMenu] = useState<{ x: number, y: number, sceneId: string } | null>(null)
  const [captureInputFormat, setCaptureInputFormat] = useState<'h264' | 'mjpeg'>('h264')
  const [outputConfig, setOutputConfig] = useState({ fps: 30, bitrateKbps: 6000 })
  const [layoutInputFormats, setLayoutInputFormats] = useState<Record<BroadcastLayoutId, 'h264' | 'mjpeg'>>({ horizontal: 'h264', vertical: 'h264' })
  const [showLeftSidebar, setShowLeftSidebar] = useState(true)
  const [showRightSidebar, setShowRightSidebar] = useState(true)
  const [showEnhanceModal, setShowEnhanceModal] = useState(false)
  const [dualVerticalOverlayEnabled, setDualVerticalOverlayEnabled] = useState(false)
  const isDualLayoutMode = broadcastLayoutMode === 'dual' || broadcastLayoutMode === 'dual-portrait' || broadcastLayoutMode === 'dual-horizontal'
  const effectiveDualVerticalOverlay = isDualLayoutMode && dualVerticalOverlayEnabled
  useEffect(() => {
    if (!isDualLayoutMode && dualVerticalOverlayEnabled) setDualVerticalOverlayEnabled(false)
  }, [isDualLayoutMode, dualVerticalOverlayEnabled])
  const activeScene = useMemo(() => {
    const scene = store.scenes.find(s => s.id === store.activeSceneId) || store.scenes[0]
    console.log('[BroadcastPage] Resolved activeScene:', scene?.name, 'for sceneId:', store.activeSceneId)
    return scene
  }, [store.scenes, store.activeSceneId])
  const [enhancingLayerId, setEnhancingLayerId] = useState<string | null>(null)
  const enhancingLayer = useMemo(() => activeScene.layers.find(l => l.id === enhancingLayerId) || null, [activeScene.layers, enhancingLayerId])
  const [mixerHeight, setMixerHeight] = useState(280)
  const [isMixerCollapsed, setIsMixerCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(320)
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null)
  const [editingSceneName, setEditingSceneName] = useState('')
  const [isResizingMixer, setIsResizingMixer] = useState(false)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const [selectionContext, setSelectionContext] = useState<'16:9' | '9:16'>('16:9')
  const isPageVisible = usePageVisibility()
  const videoRefs = useRef<Record<string, HTMLVideoElement>>({})
  const canvasRef = useRef<CanvasEditorHandle>(null)
  const activeLayoutAssignments = useMemo(() => broadcastLayoutMode === 'horizontal' ? { horizontal: layoutAssignments.horizontal, vertical: [] } : broadcastLayoutMode === 'vertical' ? { horizontal: [], vertical: layoutAssignments.vertical } : layoutAssignments, [broadcastLayoutMode, layoutAssignments])
  const activeCanvasStreamOutputs = useMemo(() => {
    const outputs = [
      { id: 'horizontal' as const, active: isStreaming && activeLayoutAssignments.horizontal.length > 0, width: 1920, height: 1080, fps: outputConfig.fps, bitrateKbps: 6000, inputFormat: layoutInputFormats.horizontal, codec: pickAvcCodecString(1920, 1080, outputConfig.fps) },
      { id: 'vertical' as const, active: isStreaming && activeLayoutAssignments.vertical.length > 0, width: 1080, height: 1920, fps: outputConfig.fps, bitrateKbps: 6000, inputFormat: layoutInputFormats.vertical, codec: pickAvcCodecString(1080, 1920, outputConfig.fps) }
    ]

    if (virtualCameraInfo?.state === 'active') {
      const isVertical = store.aspectRatio === '9:16'
      outputs.push({
        id: 'virtual-camera-session' as any,
        active: true,
        width: isVertical ? 1080 : 1920,
        height: isVertical ? 1920 : 1080,
        fps: outputConfig.fps,
        bitrateKbps: 10000,
        inputFormat: isVertical ? layoutInputFormats.vertical : layoutInputFormats.horizontal,
        codec: pickAvcCodecString(isVertical ? 1080 : 1920, isVertical ? 1920 : 1080, outputConfig.fps)
      })
    }
    return outputs
  }, [activeLayoutAssignments, isStreaming, layoutInputFormats, outputConfig.fps, virtualCameraInfo, store.aspectRatio])

  const { streamReady, forceRefreshMedia } = useMediaManagement({
    activeScene, devices, canvasWidth: store.canvasWidth, canvasHeight: store.canvasHeight, videoRefs, 
    updateLayer: store.updateLayer, scenes: store.scenes, addAudioSource: store.updateAudioSource, 
    removeAudioSource: store.removeAudioSource, audioSources: store.audioSources
  })

  // Resize Handlers
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (isResizingSidebar) {
        const newWidth = window.innerWidth - e.clientX
        setSidebarWidth(Math.min(800, Math.max(280, newWidth)))
      }
      if (isResizingMixer) {
        const newHeight = window.innerHeight - e.clientY
        setMixerHeight(Math.min(800, Math.max(48, newHeight)))
      }
    }
    const onUp = () => {
      setIsResizingMixer(false)
      setIsResizingSidebar(false)
    }
    if (isResizingMixer || isResizingSidebar) {
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [isResizingMixer, isResizingSidebar])

  // Basic Initialization
  useEffect(() => {
    void (async () => {
      const list = await navigator.mediaDevices.enumerateDevices(); setDevices(list)
      if (window.api?.widgets) setWidgets(await window.api.widgets.getAll())
      if (window.api?.platform) {
        const configArray = await window.api.platform.getConfigs()
        const configs = configArray.reduce((acc: any, c: any) => ({ ...acc, [c.platform]: c }), {})
        setPlatforms(buildStreamPlatforms(configs))
      }
      if (window.api?.streaming) {
        const [streaming, recording] = await Promise.all([
          window.api.streaming.getStatus(),
          window.api.streaming.getRecordingStatus()
        ])
        setIsStreaming(Boolean(streaming))
        setIsRecording(Boolean(recording))
        setStatus(streaming ? 'Live' : recording ? 'Recording' : 'Offline')
        if (recording) setRecordingStartedAt(Date.now())
      }
      const loadMonitors = async (retries = 3) => {
        try {
          const m = await window.api.studio.getMonitors()
          if (m.length === 0 && retries > 0) {
            console.warn(`[BroadcastPage] No monitors detected, retrying... (${retries} left)`)
            setTimeout(() => loadMonitors(retries - 1), 1000)
            return
          }
          setMonitors(m)
          const primary = m.find((d: any) => d.isPrimary) || m[0]
          if (primary && !selectedMonitorId) setSelectedMonitorId(primary.id)
          console.log(`[BroadcastPage] Loaded ${m.length} monitors.`)
        } catch (err) {
          console.error('Failed to load monitors:', err)
        }
      }
      loadMonitors()
      if (window.api?.obs) setObsStatus(await window.api.obs.getStatus())
      if (window.api?.virtualCamera) setVirtualCameraInfo(await window.api.virtualCamera.getStatus())
    })()
  }, [])

  useEffect(() => {
    if (!window.api?.on) return
    return window.api.on('streaming:status-changed', (next: any) => {
      setIsStreaming(Boolean(next.streaming))
      setIsRecording(Boolean(next.recording))
      setRecordingStartedAt(prev => next.recording ? (prev ?? Date.now()) : null)
      setStatus(next.streaming ? 'Live' : next.recording ? 'Recording' : 'Offline')
      if (next.state === 'error') {
        setStreamError(next.error || 'Broadcast output failed')
      }
    })
  }, [])

  useEffect(() => {
    if (!window.api?.on) return
    return window.api.on('virtualcamera:status-changed', (info: any) => {
      setVirtualCameraInfo(info)
    })
  }, [])

  useEffect(() => {
    if (!window.api?.on) return
    const update = async () => {
      const configArray = await window.api.platform.getConfigs()
      const configs = configArray.reduce((acc: any, c: any) => ({ ...acc, [c.platform]: c }), {})
      setPlatforms(buildStreamPlatforms(configs))
    }
    return window.api.on('platform:status-change', update)
  }, [])

  useEffect(() => {
    if (!isRecording || !recordingStartedAt) {
      setRecordingTime(0)
      return
    }

    const update = () => setRecordingTime(Math.floor((Date.now() - recordingStartedAt) / 1000))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [isRecording, recordingStartedAt])

  // Keyboard Shortcuts (Undo/Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          store.redo()
        } else {
          store.undo()
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        store.redo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [store.undo, store.redo])

  const addSource = useCallback((type: LayerType, config: Record<string, any>, sourceName?: string) => {
    if (!activeScene) return

    const name = sourceName?.trim() || {
      camera: 'Video Capture',
      display: 'Display Capture',
      audio: 'Audio Input',
      widget: 'Widget',
      browser: 'Browser Source',
      image: 'Image',
      text: 'Text'
    }[type]

    const fit = (sourceWidth: number, sourceHeight: number, fill = 0.72) => {
      const scale = Math.min(store.canvasWidth * fill / sourceWidth, store.canvasHeight * fill / sourceHeight)
      const width = Math.max(1, Math.round(sourceWidth * scale))
      const height = Math.max(1, Math.round(sourceHeight * scale))
      return {
        x: Math.round((store.canvasWidth - width) / 2),
        y: Math.round((store.canvasHeight - height) / 2),
        width,
        height
      }
    }

    const rect = type === 'display'
      ? { x: 0, y: 0, width: store.canvasWidth, height: store.canvasHeight }
      : type === 'audio'
        ? { x: 0, y: 0, width: 1, height: 1 }
        : type === 'text'
          ? fit(960, 160, 0.58)
          : fit(1280, 720)

    store.addLayer(activeScene.id, {
      type,
      name,
      config,
      ...rect,
      opacity: 1,
      rotation: 0,
      visible: type !== 'audio',
      locked: type === 'audio'
    })
    setShowSourceModal(false)
  }, [activeScene, store])

  // Streaming Handlers
  const startBroadcast = async () => {
    setStreamError(null)
    const destinations = (['horizontal', 'vertical'] as BroadcastLayoutId[]).flatMap(l => activeLayoutAssignments[l].map(pId => ({ layout: l, platform: platforms.find(p => p.id === pId) })))
    if (destinations.length === 0 && customRtmpUrl) destinations.push({ layout: store.aspectRatio === '9:16' ? 'vertical' : 'horizontal', platform: { id: 'custom', name: 'Custom', url: customRtmpUrl, key: customStreamKey } })
    if (destinations.length === 0) return setStreamError('No platforms assigned')
    
    const fps = 30; setOutputConfig({ fps, bitrateKbps: 6000 })
    const hIn = await getOptimizedCaptureInputFormat(1920, 1080, fps, 6000000); setCaptureInputFormat(hIn)
    const vIn = await getOptimizedCaptureInputFormat(1080, 1920, fps, 6000000)
    setLayoutInputFormats({ horizontal: hIn, vertical: vIn })

    const res = await Promise.all(destinations.map(d => window.api.streaming.start({ outputId: `${d.layout}:${d.platform.id}`, outputName: d.platform.name, rtmpUrl: d.platform.url, streamKey: d.platform.key, width: d.layout === 'vertical' ? 1080 : 1920, height: d.layout === 'vertical' ? 1920 : 1080, fps, bitrateKbps: 6000, inputFormat: d.layout === 'vertical' ? vIn : hIn, audioFormat: 'f32le', audioSampleRate: audioEngine.getContext().sampleRate })))
    if (res.every(r => r.success)) { setIsStreaming(true); setStatus('Live') } else setStreamError('Failed to start one or more outputs')
  }

  const stopBroadcast = async () => {
    await window.api.streaming.stop()
    setIsStreaming(false)
    setStatus(isRecording ? 'Recording' : 'Offline')
  }

  const startRecording = async () => {
    setStreamError(null)
    const fps = Math.max(1, Math.min(60, Math.round(outputConfig.fps || 30)))
    const bitrateKbps = Math.max(500, Math.round(outputConfig.bitrateKbps || 6000))
    const inputFormat = await getOptimizedCaptureInputFormat(store.canvasWidth, store.canvasHeight, fps, bitrateKbps * 1000)
    setCaptureInputFormat(inputFormat)
    setOutputConfig({ fps, bitrateKbps })

    const context = audioEngine.getContext()
    if (context.state === 'suspended') await context.resume().catch(() => {})

    const result = await window.api.streaming.startRecording({
      width: store.canvasWidth,
      height: store.canvasHeight,
      fps,
      bitrateKbps,
      inputFormat,
      audioFormat: 'f32le',
      audioSampleRate: context.sampleRate
    })

    if (result?.success) {
      setIsRecording(true)
      setRecordingStartedAt(Date.now())
      setStatus(isStreaming ? 'Live' : 'Recording')
    } else {
      setStreamError(result?.error || 'Failed to start recording')
    }
  }

  const stopRecording = async () => {
    const result = await window.api.streaming.stopRecording()
    if (result?.success !== false) {
      setIsRecording(false)
      setRecordingStartedAt(null)
      setStatus(isStreaming ? 'Live' : 'Offline')
    } else {
      setStreamError(result?.error || 'Failed to stop recording')
    }
  }

  const toggleVirtualCamera = async () => {
    if (!virtualCameraInfo) return
    if (virtualCameraInfo.state === 'active') {
      await window.api.virtualCamera.stop()
    } else {
      const context = audioEngine.getContext()
      await window.api.virtualCamera.start({
        width: store.canvasWidth,
        height: store.canvasHeight,
        fps: outputConfig.fps,
        bitrateKbps: outputConfig.bitrateKbps,
        audioSampleRate: context.sampleRate
      })
    }
  }

  const toggleObsVirtualCamera = async () => {
    if (!obsStatus?.connected) return
    if (obsStatus.virtualCameraActive) {
      await window.api.obs.stopVirtualCamera()
    } else {
      await window.api.obs.startVirtualCamera()
    }
    setObsStatus(await window.api.obs.getStatus())
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-black relative">
      <BroadcastHeader 
        isStreaming={isStreaming} isRecording={isRecording} recordingTime={isRecording ? formatDuration(recordingTime) : '00:00'} status={status}
        showLeftSidebar={showLeftSidebar} onToggleLeftSidebar={() => setShowLeftSidebar(!showLeftSidebar)} showRightSidebar={showRightSidebar} onToggleRightSidebar={() => setShowRightSidebar(!showRightSidebar)}
        broadcastLayoutMode={broadcastLayoutMode} onLayoutModeChange={m => { 
          setBroadcastLayoutMode(m as any); 
          store.setAspectRatio(m === 'vertical' || m === 'dual-portrait' ? '9:16' : '16:9') 
        }}
        undo={store.undo} redo={store.redo} canUndo={store.past.length > 0} canRedo={store.future.length > 0}
        onTakeScreenshot={() => canvasRef.current?.takeScreenshot()} onStartRecording={startRecording} onStopRecording={stopRecording}
        onForceRefreshMedia={forceRefreshMedia} monitors={monitors} selectedMonitorId={selectedMonitorId} onSetSelectedMonitorId={setSelectedMonitorId}
        onOpenProjector={() => {
          console.log('[Projector] Opening via Toolbar. Context:', selectionContext)
          ;(window.api.studio.openProjector as any)({ 
            monitorId: selectedMonitorId!, 
            sceneId: activeScene.id,
            aspectRatio: selectionContext
          })
        }} 
        obsStatus={obsStatus} onToggleObsVirtualCamera={toggleObsVirtualCamera}
        virtualCameraInfo={virtualCameraInfo} onToggleVirtualCamera={toggleVirtualCamera}
        platforms={platforms} layoutAssignments={layoutAssignments} onToggleLayoutAssignment={(l, id) => setLayoutAssignments(curr => ({ ...curr, [l]: (curr[l as any] as any).includes(id) ? (curr[l as any] as any).filter((i: any) => i !== id) : [...(curr[l as any] as any), id] }))} onRemoveLayoutAssignment={(l, id) => setLayoutAssignments(curr => ({ ...curr, [l]: (curr[l as any] as any).filter((i: any) => i !== id) }))}
        customRtmpUrl={customRtmpUrl} onCustomRtmpUrlChange={setCustomRtmpUrl} customStreamKey={customStreamKey} onCustomStreamKeyChange={setCustomStreamKey}
        onStartBroadcast={startBroadcast} onStopBroadcast={stopBroadcast}
      />

      {isDualLayoutMode && (
        <DualVerticalOverlayBar
          enabled={dualVerticalOverlayEnabled}
          onToggle={setDualVerticalOverlayEnabled}
        />
      )}

      <div className="flex-1 flex min-h-0 bg-black">
        {showLeftSidebar && <SceneSidebar scenes={store.scenes} activeSceneId={store.activeSceneId} onSelectScene={store.setActiveScene} onAddScene={store.addScene} onRenameScene={store.renameScene} onDuplicateScene={store.duplicateScene} onRemoveScene={store.removeScene} editingSceneId={editingSceneId} setEditingSceneId={setEditingSceneId} editingSceneName={editingSceneName} setEditingSceneName={setEditingSceneName} onContextMenu={(e, id) => setSceneContextMenu({ x: e.clientX, y: e.clientY, sceneId: id })} />}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#080808] p-6 overflow-hidden">
          <CanvasEditor 
            activeScene={activeScene} isStreaming={isStreaming} isRecording={isRecording} 
            captureInputFormat={captureInputFormat} outputFps={outputConfig.fps} 
            outputBitrateKbps={outputConfig.bitrateKbps} videoRefs={videoRefs} 
            isVisible={isPageVisible}
            streamReady={streamReady} streamOutputs={activeCanvasStreamOutputs} 
            previewMode={broadcastLayoutMode} selectionContext={selectionContext}
            dualVerticalOverlayEnabled={effectiveDualVerticalOverlay}
            onSelectionContextChange={setSelectionContext}
            onContextMenu={(e, l, ctx) => {
              setSelectionContext(ctx)
              setSourceContextMenu({ x: e.clientX, y: e.clientY, layer: l })
            }}
            ref={canvasRef} 
          />
        </div>
        {showRightSidebar && (
          <SourceSidebar 
            activeScene={activeScene} 
            selectedLayerId={store.selectedLayerId} 
            onSelectLayer={store.setSelectedLayer} 
            onUpdateLayer={(id, u) => store.updateLayer(activeScene.id, id, u)} 
            onReorderLayer={(id, i) => store.reorderLayer(activeScene.id, id, i)} 
            onShowSourceModal={() => setShowSourceModal(true)} 
            onContextMenu={(e, l) => setSourceContextMenu({ x: e.clientX, y: e.clientY, layer: l })} 
            aspectRatio={store.aspectRatio} 
            broadcastLayoutMode={broadcastLayoutMode} 
            widgets={widgets} 
            devices={devices} 
            sidebarWidth={sidebarWidth} 
            onSidebarResizeStart={() => setIsResizingSidebar(true)} 
            selectionContext={selectionContext}
            onSelectionContextChange={setSelectionContext}
          />
        )}
      </div>
 
      <MixerContainer isCollapsed={isMixerCollapsed} onToggleCollapse={() => setIsMixerCollapsed(!isMixerCollapsed)} mixerHeight={mixerHeight} onResizeStart={() => setIsResizingMixer(true)} activeScene={activeScene} videoRefs={videoRefs} devices={devices} streamReady={streamReady} />
      <AddSourceModal open={showSourceModal} onClose={() => setShowSourceModal(false)} onAdd={addSource} widgets={widgets} devices={devices} />
      <EnhancementModal open={showEnhanceModal} onClose={() => setShowEnhanceModal(false)} layer={enhancingLayer} onUpdate={(id, u) => store.updateLayer(activeScene.id, id, u)} videoRefs={videoRefs} aspectContext={selectionContext} />

      {sourceContextMenu && (
        <ContextMenu 
          x={sourceContextMenu.x} y={sourceContextMenu.y} 
          onClose={() => setSourceContextMenu(null)} 
          items={sourceContextMenu.layer ? [
            { 
              id: 'fit', 
              label: `Fit to Screen (${selectionContext === '9:16' ? 'Vertical' : 'Horizontal'})`, 
              icon: <IconMaximize size={18} />, 
              onClick: () => {
                const isPortrait = selectionContext === '9:16'
                const layer = sourceContextMenu.layer!
                const targetW = isPortrait ? 1080 : 1920
                const targetH = isPortrait ? 1920 : 1080
                
                // Try to get native dimensions from videoRefs if it's a camera/media
                const video = videoRefs.current[layer.id]
                let nativeW = video?.videoWidth || (isPortrait ? (layer.portraitWidth ?? layer.width) : layer.width)
                let nativeH = video?.videoHeight || (isPortrait ? (layer.portraitHeight ?? layer.height) : layer.height)
                
                // If we have no valid dimensions, default to 16:9
                if (!nativeW || !nativeH) { nativeW = 16; nativeH = 9 }

                const scale = Math.min(targetW / nativeW, targetH / nativeH)
                const finalW = Math.round(nativeW * scale)
                const finalH = Math.round(nativeH * scale)
                const finalX = Math.round((targetW - finalW) / 2)
                const finalY = Math.round((targetH - finalH) / 2)

                if (isPortrait) {
                  store.updateLayer(activeScene.id, layer.id, { 
                    portraitX: finalX, portraitY: finalY, portraitWidth: finalW, portraitHeight: finalH, 
                    portraitCrop: { top: 0, right: 0, bottom: 0, left: 0 } 
                  })
                } else {
                  store.updateLayer(activeScene.id, layer.id, { 
                    x: finalX, y: finalY, width: finalW, height: finalH, 
                    crop: { top: 0, right: 0, bottom: 0, left: 0 } 
                  })
                }
              } 
            }, 
            {
              id: 'enhance',
              label: 'Enhance',
              icon: <IconSparkles size={18} />,
              disabled: !(sourceContextMenu.layer!.type === 'camera' || sourceContextMenu.layer!.type === 'display' || sourceContextMenu.layer!.type === 'image'),
              onClick: () => { setEnhancingLayerId(sourceContextMenu.layer?.id || null); setShowEnhanceModal(true) }
            },
            {
              id: 'project',
              label: 'Project Source',
              icon: <IconCast size={18} />,
              submenu: monitors.length > 0 ? monitors.map(m => ({
                id: `monitor-${m.id}`,
                label: m.label,
                onClick: () => (window.api.studio.openProjector as any)({ 
                  monitorId: m.id, 
                  sceneId: activeScene.id,
                  layerId: sourceContextMenu.layer!.id,
                  aspectRatio: selectionContext 
                })
              })) : [{ id: 'no-monitors', label: 'No Monitors Detected', disabled: true }]
            },
            { id: 'delete', label: 'Delete', icon: <IconTrash size={18} />, danger: true, onClick: () => store.removeLayer(activeScene.id, sourceContextMenu.layer!.id) }
          ] : [
            {
              id: 'project',
              label: 'Project',
              icon: <IconCast size={18} />,
              submenu: monitors.length > 0 ? monitors.map(m => ({
                id: `monitor-${m.id}`,
                label: m.label,
                onClick: () => (window.api.studio.openProjector as any)({ 
                  monitorId: m.id, 
                  sceneId: activeScene.id,
                  aspectRatio: selectionContext 
                })
              })) : [{ id: 'no-monitors', label: 'No Monitors Detected', disabled: true }]
            }
          ]} 
        />
      )}
      {sceneContextMenu && <ContextMenu x={sceneContextMenu.x} y={sceneContextMenu.y} onClose={() => setSceneContextMenu(null)} items={[{ id: 'rename', label: 'Rename', icon: <IconPencil size={18} />, onClick: () => { setEditingSceneId(sceneContextMenu.sceneId); setEditingSceneName(store.scenes.find(s => s.id === sceneContextMenu.sceneId)?.name || '') } }, { id: 'delete', label: 'Delete', icon: <IconTrash size={18} />, danger: true, onClick: () => store.removeScene(sceneContextMenu.sceneId) }]} />}
    </div>
  )
}
