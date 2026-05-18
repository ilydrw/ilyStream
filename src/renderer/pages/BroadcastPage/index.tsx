import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {IconSquare, IconArrowsMove, IconMaximize, IconCrosshair, IconPencil, IconCopy, IconTrash, IconCast, IconSparkles, IconVideo, IconKeyboard, IconX} from '@tabler/icons-react'

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
import { MultiViewModal } from './components/MultiViewModal'
import { DualVerticalOverlayBar } from './components/DualVerticalOverlayBar'
import { SceneSidebar } from './components/SceneSidebar'
import { SourceSidebar } from './components/SourceSidebar'
import { MixerContainer } from './components/MixerContainer'
import { RecordingSettingsModal } from './components/RecordingSettingsModal'

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

type ProjectorAspectRatio = '16:9' | '9:16'
const LANDSCAPE_STAGE = { width: 1920, height: 1080 }
const PORTRAIT_STAGE = { width: 1080, height: 1920 }

function getLayoutModeForAspectRatio(aspectRatio: ProjectorAspectRatio): BroadcastLayoutMode {
  return aspectRatio === '9:16' ? 'vertical' : 'horizontal'
}

function fitRect(
  stage: { width: number; height: number },
  sourceWidth: number,
  sourceHeight: number,
  fill = 0.72
) {
  const scale = Math.min(stage.width * fill / sourceWidth, stage.height * fill / sourceHeight)
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))
  return {
    x: Math.round((stage.width - width) / 2),
    y: Math.round((stage.height - height) / 2),
    width,
    height
  }
}

function fullStageRect(stage: { width: number; height: number }) {
  return { x: 0, y: 0, width: stage.width, height: stage.height }
}

interface SourceContextMenuState {
  x: number
  y: number
  layer: StudioLayer | null
  sceneId: string
  aspectRatio: ProjectorAspectRatio
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
  const [broadcastLayoutMode, setBroadcastLayoutMode] = useState<BroadcastLayoutMode>(() => getLayoutModeForAspectRatio(store.aspectRatio))
  const [layoutAssignments, setLayoutAssignments] = useState<Record<BroadcastLayoutId, string[]>>({ horizontal: [], vertical: [] })
  const [customRtmpUrl, setCustomRtmpUrl] = useState('')
  const [customStreamKey, setCustomStreamKey] = useState('')
  const [showSourceModal, setShowSourceModal] = useState(false)
  const [sourceContextMenu, setSourceContextMenu] = useState<SourceContextMenuState | null>(null)
  const [sceneContextMenu, setSceneContextMenu] = useState<{ x: number, y: number, sceneId: string } | null>(null)
  const [captureInputFormat, setCaptureInputFormat] = useState<'h264' | 'mjpeg'>('h264')
  const [outputConfig, setOutputConfig] = useState({ fps: 30, bitrateKbps: 6000 })
  const [layoutInputFormats, setLayoutInputFormats] = useState<Record<BroadcastLayoutId, 'h264' | 'mjpeg'>>({ horizontal: 'h264', vertical: 'h264' })
  const [showLeftSidebar, setShowLeftSidebar] = useState(true)
  const [showRightSidebar, setShowRightSidebar] = useState(true)
  const [showMultiView, setShowMultiView] = useState(false)
  const [dualVerticalOverlayEnabled, setDualVerticalOverlayEnabled] = useState(false)
  const isDualLayoutMode = broadcastLayoutMode === 'dual' || broadcastLayoutMode === 'dual-portrait' || broadcastLayoutMode === 'dual-horizontal'
  const effectiveDualVerticalOverlay = isDualLayoutMode && dualVerticalOverlayEnabled

  useEffect(() => {
    if (isDualLayoutMode) return
    const nextMode = getLayoutModeForAspectRatio(store.aspectRatio)
    setBroadcastLayoutMode(current => current === nextMode ? current : nextMode)
  }, [isDualLayoutMode, store.aspectRatio])

  useEffect(() => {
    if (!isDualLayoutMode && dualVerticalOverlayEnabled) setDualVerticalOverlayEnabled(false)
  }, [isDualLayoutMode, dualVerticalOverlayEnabled])

  const activeScene = useMemo(() => {
    const scene = store.scenes.find(s => s.id === store.activeSceneId) || store.scenes[0]
    return scene
  }, [store.scenes, store.activeSceneId])

  const previewScene = useMemo(() => {
    const scene = store.scenes.find(s => s.id === store.previewSceneId) || store.scenes[0]
    return scene
  }, [store.scenes, store.previewSceneId])
  const enhancingLayer = useMemo(() => {
    // Try to find in active scene, then in preview scene if studio mode is on
    const layerId = store.enhancingLayerId
    if (!layerId) return null
    return activeScene.layers.find(l => l.id === layerId) || previewScene.layers.find(l => l.id === layerId) || null
  }, [activeScene.layers, previewScene.layers, store.enhancingLayerId])
  const [mixerHeight, setMixerHeight] = useState(280)
  const [isMixerCollapsed, setIsMixerCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(320)
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null)
  const [editingSceneName, setEditingSceneName] = useState('')
  const [isResizingMixer, setIsResizingMixer] = useState(false)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const [selectionContext, setSelectionContext] = useState<ProjectorAspectRatio>(() => store.aspectRatio)
  const isPageVisible = usePageVisibility()
  const videoRefs = useRef<Record<string, HTMLVideoElement>>({})
  const canvasRef = useRef<CanvasEditorHandle>(null)
  const activeLayoutAssignments = useMemo(() => broadcastLayoutMode === 'horizontal' ? { horizontal: layoutAssignments.horizontal, vertical: [] } : broadcastLayoutMode === 'vertical' ? { horizontal: [], vertical: layoutAssignments.vertical } : layoutAssignments, [broadcastLayoutMode, layoutAssignments])
  const [showStingerConfig, setShowStingerConfig] = useState(false)
  const [showHotkeys, setShowHotkeys] = useState(false)
  const [showRecordingSettings, setShowRecordingSettings] = useState(false)

  useEffect(() => {
    if (!isDualLayoutMode) {
      setSelectionContext(store.aspectRatio)
    }
  }, [isDualLayoutMode, store.aspectRatio])

  useEffect(() => {
    if (store.aspectRatio !== '16:9') return
    const scene = store.studioMode ? previewScene : activeScene
    scene.layers.forEach(layer => {
      const hasPortraitStageSavedAsLandscape =
        layer.type === 'display' &&
        layer.x === 0 &&
        layer.y === 0 &&
        layer.width === PORTRAIT_STAGE.width &&
        layer.height === PORTRAIT_STAGE.height

      if (hasPortraitStageSavedAsLandscape) {
        store.updateLayer(scene.id, layer.id, fullStageRect(LANDSCAPE_STAGE))
      }
    })
  }, [activeScene, previewScene, store])


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
      // Don't trigger shortcuts if user is typing in an input, textarea, or contentEditable
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('.no-hotkeys')
      ) return

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) store.redo()
        else store.undo()
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        store.redo()
      }

      // Production Hotkeys
      if (e.key === ' ' || e.key === 'Enter') {
        if (store.studioMode) store.transition('fade')
      } else if (e.key.toLowerCase() === 'f') {
        if (store.studioMode) store.transition('fade')
      } else if (e.key.toLowerCase() === 'c') {
        if (store.studioMode) store.transition('cut')
      } else if (e.key.toLowerCase() === 't') {
        if (store.studioMode && store.stingerSettings.path) store.transition('stinger')
      } else if (e.key.toLowerCase() === 's') {
        store.toggleStudioMode()
      } else if (e.key.toLowerCase() === 'r') {
        if (isRecording) stopRecording()
        else startRecording()
      } else if (e.key.toLowerCase() === 'b') {
        if (isStreaming) stopBroadcast()
        else startBroadcast()
      } else if (e.key.toLowerCase() === 'm') {
        setShowMultiView(!showMultiView)
      } else if (/^[1-9]$/.test(e.key)) {
        const index = parseInt(e.key) - 1
        if (store.scenes[index]) {
          if (store.studioMode) store.setPreviewScene(store.scenes[index].id)
          else store.setActiveScene(store.scenes[index].id)
        }
      } else if (e.key === 'Escape') {
        setShowMultiView(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [store, isRecording, isStreaming, showMultiView])

  const addSource = useCallback((type: LayerType, config: Record<string, any>, sourceName?: string) => {
    const targetScene = store.studioMode ? previewScene : activeScene
    if (!targetScene) return

    const name = sourceName?.trim() || {
      camera: 'Video Capture',
      display: 'Display Capture',
      audio: 'Audio Input',
      widget: 'Widget',
      browser: 'Browser Source',
      image: 'Image',
      text: 'Text'
    }[type]

    const widget = type === 'widget'
      ? widgets.find(w => w.id === config.widgetId)
      : undefined
    const widgetPreset = type === 'widget'
      ? resolveWidgetStudioPreset(widget, config, LANDSCAPE_STAGE.width, LANDSCAPE_STAGE.height)
      : null

    const landscapeRect = widgetPreset
      ? { x: widgetPreset.x, y: widgetPreset.y, width: widgetPreset.width, height: widgetPreset.height }
      : type === 'display'
        ? fullStageRect(LANDSCAPE_STAGE)
        : type === 'audio'
          ? { x: 0, y: 0, width: 1, height: 1 }
          : type === 'text'
            ? fitRect(LANDSCAPE_STAGE, 960, 160, 0.58)
            : fitRect(LANDSCAPE_STAGE, 1280, 720)

    const portraitRect = widgetPreset
      ? {
          x: widgetPreset.portraitX,
          y: widgetPreset.portraitY,
          width: widgetPreset.portraitWidth,
          height: widgetPreset.portraitHeight
        }
      : type === 'display' || type === 'camera' || type === 'browser' || type === 'image'
        ? fitRect(PORTRAIT_STAGE, 1920, 1080, 1)
        : type === 'audio'
          ? { x: 0, y: 0, width: 1, height: 1 }
          : type === 'text'
            ? fitRect(PORTRAIT_STAGE, 720, 160, 0.72)
            : fitRect(PORTRAIT_STAGE, 1280, 720)

    const layerConfig = widgetPreset?.config
      ? { ...config, ...widgetPreset.config }
      : config
    const locked = widgetPreset?.locked ?? (type === 'audio')

    store.addLayer(targetScene.id, {
      type,
      name,
      config: layerConfig,
      ...landscapeRect,
      portraitX: portraitRect.x,
      portraitY: portraitRect.y,
      portraitWidth: portraitRect.width,
      portraitHeight: portraitRect.height,
      opacity: 1,
      rotation: 0,
      visible: type !== 'audio',
      locked,
      portraitVisible: type !== 'audio',
      portraitLocked: widgetPreset?.portraitLocked ?? locked
    })
    setShowSourceModal(false)
  }, [activeScene, previewScene, store, widgets])

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
    const bitrateKbps = store.recordingSettings.bitrateKbps || 12000
    const inputFormat = await getOptimizedCaptureInputFormat(store.canvasWidth, store.canvasHeight, fps, bitrateKbps * 1000)
    setCaptureInputFormat(inputFormat)
    setOutputConfig({ fps, bitrateKbps })

    const context = audioEngine.getContext()
    if (context.state === 'suspended') await context.resume().catch(() => {})

    const result = await window.api.streaming.startRecording({
      ...store.recordingSettings,
      width: store.canvasWidth,
      height: store.canvasHeight,
      fps,
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

  const getSceneIdForLayer = (layer: StudioLayer | null): string => {
    if (!layer) return activeScene.id
    if (store.studioMode && previewScene.layers.some(l => l.id === layer.id)) return previewScene.id
    if (activeScene.layers.some(l => l.id === layer.id)) return activeScene.id
    return activeScene.id
  }

  const buildProjectorStateSnapshot = () => ({
    scenes: store.scenes,
    activeSceneId: store.activeSceneId,
    canvasWidth: store.canvasWidth,
    canvasHeight: store.canvasHeight,
    aspectRatio: store.aspectRatio,
    snapToGrid: store.snapToGrid,
    gridSize: store.gridSize,
    audioSources: store.audioSources,
    masterBus: store.masterBus,
    routing: store.routing,
    mixerSidebarWidth: store.mixerSidebarWidth,
    studioMode: store.studioMode,
    previewSceneId: store.previewSceneId
  })

  const openProjector = async (payload: { monitorId: number; sceneId: string; aspectRatio: ProjectorAspectRatio; layerId?: string }) => {
    if (payload.monitorId === undefined || payload.monitorId === null || !payload.sceneId) return false

    try {
      await window.api.studio.saveState(buildProjectorStateSnapshot())
    } catch (err) {
      console.warn('[Projector] Failed to persist latest studio state before opening:', err)
    }

    return window.api.studio.openProjector(payload)
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
        studioMode={store.studioMode} onToggleStudioMode={store.toggleStudioMode}
        onToggleHotkeys={() => setShowHotkeys(!showHotkeys)} showHotkeys={showHotkeys}
        onOpenRecordingSettings={() => setShowRecordingSettings(true)}
        onOpenProjector={() => {


          console.log('[Projector] Opening via Toolbar. Context:', selectionContext)
          if (selectedMonitorId !== null) {
            void openProjector({
              monitorId: selectedMonitorId,
              sceneId: activeScene.id,
              aspectRatio: selectionContext
            })
          }
        }}
        obsStatus={obsStatus} onToggleObsVirtualCamera={toggleObsVirtualCamera}
        virtualCameraInfo={virtualCameraInfo} onToggleVirtualCamera={toggleVirtualCamera}
        platforms={platforms} layoutAssignments={layoutAssignments}
        onToggleLayoutAssignment={(l, id) => {
          const layoutKey = l as any;
          const currAssignments = (layoutAssignments as any)[layoutKey] || [];
          setLayoutAssignments(curr => ({
            ...curr,
            [layoutKey]: currAssignments.includes(id)
              ? currAssignments.filter((i: string) => i !== id)
              : [...currAssignments, id]
          }))
        }}
        onRemoveLayoutAssignment={(l, id) => {
          const layoutKey = l as any;
          const currAssignments = (layoutAssignments as any)[layoutKey] || [];
          setLayoutAssignments(curr => ({
            ...curr,
            [layoutKey]: currAssignments.filter((i: string) => i !== id)
          }))
        }}
        customRtmpUrl={customRtmpUrl} onCustomRtmpUrlChange={setCustomRtmpUrl} customStreamKey={customStreamKey} onCustomStreamKeyChange={setCustomStreamKey}
        onStartBroadcast={startBroadcast} onStopBroadcast={stopBroadcast}
        onShowMultiView={() => setShowMultiView(true)}
      />

      {isDualLayoutMode && (
        <DualVerticalOverlayBar
          enabled={dualVerticalOverlayEnabled}
          onToggle={setDualVerticalOverlayEnabled}
        />
      )}

      <div className="flex-1 flex min-h-0 bg-black">
        {showLeftSidebar && (
          <SceneSidebar
            scenes={store.scenes}
            activeSceneId={store.studioMode ? store.previewSceneId : store.activeSceneId}
            onSelectScene={store.setActiveScene}
            onAddScene={store.addScene}
            onRenameScene={store.renameScene}
            onDuplicateScene={store.duplicateScene}
            onRemoveScene={store.removeScene}
            editingSceneId={editingSceneId}
            setEditingSceneId={setEditingSceneId}
            editingSceneName={editingSceneName}
            setEditingSceneName={setEditingSceneName}
            onContextMenu={(e, id) => setSceneContextMenu({ x: e.clientX, y: e.clientY, sceneId: id })}
          />
        )}
        <div className="flex-1 flex min-w-0 min-h-0 bg-[#080808] overflow-hidden relative">
          {store.studioMode ? (
            <div className="flex-1 flex min-w-0 h-full gap-4 p-4">
              {/* Preview Canvas (Left) */}
              <div className="flex-1 flex flex-col min-w-0 border border-white/5 bg-black/20 rounded-2xl overflow-hidden relative group">
                <div className="absolute top-4 left-4 z-10 px-3 py-1 bg-accent/80 text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg">Preview</div>
                <CanvasEditor
                  activeScene={previewScene} isStreaming={isStreaming} isRecording={isRecording}
                  captureInputFormat={captureInputFormat} outputFps={outputConfig.fps}
                  outputBitrateKbps={outputConfig.bitrateKbps} videoRefs={videoRefs}
                  isVisible={isPageVisible} isPreview={true}
                  streamReady={streamReady} streamOutputs={[]}
                  previewMode="single" selectionContext={selectionContext}
                  onSelectionContextChange={setSelectionContext}
                  onContextMenu={(e, l, ctx) => {
                    setSelectionContext(ctx)
                    setSourceContextMenu({ x: e.clientX, y: e.clientY, layer: l, sceneId: previewScene.id, aspectRatio: ctx })
                  }}
                />
              </div>

              {/* Transition Controls */}
              <div className="flex flex-col justify-center items-center gap-4 px-3">
                <div className="flex flex-col items-center gap-1">
                  <button
                    onClick={() => store.transition('fade')}
                    className="w-16 h-16 rounded-2xl bg-brand-gradient text-white flex flex-col items-center justify-center gap-1 hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-accent/20 border border-white/10 group shadow-glow"
                  >
                    <IconArrowsMove size={24} className="group-hover:rotate-180 transition-transform duration-500" />
                    <span className="text-[10px] font-black uppercase tracking-tighter">Fade</span>
                  </button>
                  <div className="flex flex-col items-center gap-0.5 mt-1">
                    <input
                      type="number"
                      value={store.transitionDuration}
                      onChange={(e) => store.setTransitionDuration(Number(e.target.value))}
                      className="w-12 bg-white/5 border border-white/10 rounded text-[9px] font-bold text-center text-white/50 focus:text-accent focus:border-accent/50 outline-none transition-all"
                      title="Transition Duration (ms)"
                    />
                    <span className="text-[7px] font-black uppercase tracking-widest text-white/20">ms</span>
                  </div>
                </div>

                <div className="h-px w-10 bg-white/10" />

                <button
                  onClick={() => store.transition('cut')}
                  className="w-16 py-3 rounded-xl bg-white/5 text-white/40 hover:text-white hover:bg-white/10 text-[9px] font-black uppercase tracking-widest transition-all border border-white/5"
                >
                  Cut
                </button>

                <div className="h-px w-10 bg-white/10" />

                <div className="flex flex-col items-center gap-1">
                  <button
                    onClick={() => {
                      if (!store.stingerSettings.path) setShowStingerConfig(true)
                      else store.transition('stinger')
                    }}
                    className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all border border-white/10 group ${
                      store.stingerSettings.path
                        ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20 hover:brightness-110'
                        : 'bg-white/5 text-white/20 hover:bg-white/10 hover:text-white/40'
                    }`}
                  >
                    <IconVideo size={24} />
                    <span className="text-[10px] font-black uppercase tracking-tighter">Stinger</span>
                  </button>
                  <button
                    onClick={() => setShowStingerConfig(true)}
                    className="text-[8px] font-black uppercase tracking-widest text-white/20 hover:text-white/60 transition-colors"
                  >
                    Setup
                  </button>
                </div>
              </div>


              {/* Program Canvas (Right) */}
              <div className="flex-1 flex flex-col min-w-0 border border-red-500/20 bg-black/20 rounded-2xl overflow-hidden relative group">
                <div className="absolute top-4 right-4 z-10 px-3 py-1 bg-red-500/80 text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg animate-pulse">Live</div>
                <CanvasEditor
                  activeScene={activeScene} isStreaming={isStreaming} isRecording={isRecording}
                  captureInputFormat={captureInputFormat} outputFps={outputConfig.fps}
                  outputBitrateKbps={outputConfig.bitrateKbps} videoRefs={videoRefs}
                  isVisible={isPageVisible}
                  streamReady={streamReady} streamOutputs={activeCanvasStreamOutputs}
                  previewMode="single" selectionContext={selectionContext}
                  dualVerticalOverlayEnabled={effectiveDualVerticalOverlay}
                  onSelectionContextChange={setSelectionContext}
                  onContextMenu={(e, l, ctx) => {
                    setSelectionContext(ctx)
                    setSourceContextMenu({ x: e.clientX, y: e.clientY, layer: l, sceneId: activeScene.id, aspectRatio: ctx })
                  }}
                  ref={canvasRef}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-w-0 min-h-0 p-6">
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
                  setSourceContextMenu({ x: e.clientX, y: e.clientY, layer: l, sceneId: activeScene.id, aspectRatio: ctx })
                }}
                ref={canvasRef}
              />
            </div>
          )}
        </div>
        {showRightSidebar && (
          <SourceSidebar
            activeScene={store.studioMode ? previewScene : activeScene}
            selectedLayerId={store.selectedLayerId}
            onSelectLayer={store.setSelectedLayer}
            onUpdateLayer={(id, u) => store.updateLayer(store.studioMode ? previewScene.id : activeScene.id, id, u)}
            onReorderLayer={(id, i) => store.reorderLayer(store.studioMode ? previewScene.id : activeScene.id, id, i)}
            onShowSourceModal={() => setShowSourceModal(true)}
            onContextMenu={(e, l, ctx) => {
              setSelectionContext(ctx)
              setSourceContextMenu({ x: e.clientX, y: e.clientY, layer: l, sceneId: getSceneIdForLayer(l), aspectRatio: ctx })
            }}
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
      <EnhancementModal
        open={store.showEnhancementModal}
        onClose={() => store.setShowEnhancementModal(false)}
        layer={enhancingLayer}
        onUpdate={(id, u) => store.updateLayer(store.studioMode && previewScene.layers.find(l => l.id === id) ? previewScene.id : activeScene.id, id, u)}
        videoRefs={videoRefs}
        aspectContext={selectionContext}
      />
      <MultiViewModal
        open={showMultiView}
        onClose={() => setShowMultiView(false)}
        videoRefs={videoRefs}
      />

      {/* Stinger Config Modal */}
      {showStingerConfig && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
          <div className="w-[400px] bg-[#0c0c0e] rounded-3xl border border-white/10 shadow-2xl p-8 flex flex-col gap-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-black uppercase tracking-tighter text-white">Stinger Setup</h2>
              <button onClick={() => setShowStingerConfig(false)} className="text-white/20 hover:text-white">Close</button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Video File (.webm / .mp4)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={store.stingerSettings.path}
                    readOnly
                    placeholder="No file selected..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white/80 outline-none"
                  />
                  <button
                    onClick={async () => {
                      const res = await (window as any).api.assets.pickFile({ filters: [{ name: 'Videos', extensions: ['webm', 'mp4', 'mov'] }] })
                      if (res) store.setStingerPath(res)
                    }}
                    className="px-4 bg-brand-gradient text-white rounded-xl font-bold text-xs shadow-glow"
                  >
                    Pick
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Total Duration (ms)</label>
                  <input
                    type="number"
                    value={store.stingerSettings.duration}
                    onChange={(e) => store.setStingerDuration(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white/80 outline-none focus:border-accent"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Cut Point (ms)</label>
                  <input
                    type="number"
                    value={store.stingerSettings.cutPoint}
                    onChange={(e) => store.setStingerCutPoint(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white/80 outline-none focus:border-accent"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-2xl flex gap-3 items-center">
              <IconSparkles className="text-purple-400" size={20} />
              <p className="text-[10px] leading-relaxed text-purple-200/60 font-medium">
                The <span className="text-purple-300 font-bold">Cut Point</span> is when the actual scene switch happens. Set it to when the stinger video completely covers the screen.
              </p>
            </div>

            <button
              onClick={() => setShowStingerConfig(false)}
              className="w-full py-4 bg-brand-gradient text-white font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-accent/20 hover:brightness-110 active:scale-95 transition-all shadow-glow"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Hotkey Legend Overlay */}
      <AnimatePresence>
        {showHotkeys && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[1000] bg-[#0c0c0e]/90 backdrop-blur-xl border border-white/10 rounded-[32px] p-10 shadow-2xl shadow-black/50 w-[800px]"
          >
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl bg-purple-500/20 text-purple-400">
                  <IconKeyboard size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tighter text-white">Production Shortcuts</h2>
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/20 mt-1">Master your broadcast with global keys</p>
                </div>
              </div>
              <button onClick={() => setShowHotkeys(false)} className="p-3 rounded-xl bg-white/5 text-white/20 hover:text-white transition-all">
                <IconX size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-x-12 gap-y-4">
              {[
                { key: 'S', label: 'Toggle Studio Mode', desc: 'Preview vs Program' },
                { key: 'F / Space', label: 'Fade Transition', desc: 'Smooth cross-fade' },
                { key: 'C', label: 'Cut Transition', desc: 'Hard cut switch' },
                { key: 'T', label: 'Stinger Transition', desc: 'Professional video overlay' },
                { key: 'M', label: 'Toggle Multi-View', desc: 'Browse all scenes' },
                { key: 'R', label: 'Start/Stop Recording', desc: 'Local capture' },
                { key: 'B', label: 'Start/Stop Broadcast', desc: 'Live output' },
                { key: '1-9', label: 'Select Scene', desc: 'Direct scene jumping' },
                { key: 'Ctrl+Z', label: 'Undo Action', desc: 'Revert last change' },
                { key: 'Ctrl+Y', label: 'Redo Action', desc: 'Apply reverted change' },
                { key: 'ESC', label: 'Close Overlays', desc: 'Clear active modals' },
              ].map(hk => (
                <div key={hk.key} className="flex items-center justify-between py-3 border-b border-white/5 group hover:border-white/10 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="min-w-[60px] h-8 flex items-center justify-center bg-white/10 rounded-lg border border-white/10 text-[11px] font-black font-mono text-accent">
                      {hk.key}
                    </div>
                    <div>
                      <p className="text-[12px] font-black uppercase tracking-tight text-white/80">{hk.label}</p>
                      <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mt-0.5">{hk.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-10 p-5 rounded-2xl bg-purple-500/5 border border-purple-500/10 flex items-center gap-4">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                <IconSparkles size={18} />
              </div>
              <p className="text-[11px] text-purple-200/40 font-medium leading-relaxed italic">
                Pro Tip: Use <span className="text-purple-400 font-bold">Studio Mode</span> to prepare your next shot in Preview before transitioning it to the Live Program.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <RecordingSettingsModal
        isOpen={showRecordingSettings}
        onClose={() => setShowRecordingSettings(false)}
      />




      {sourceContextMenu && (
        <ContextMenu
          x={sourceContextMenu.x} y={sourceContextMenu.y}
          onClose={() => setSourceContextMenu(null)}
          items={sourceContextMenu.layer ? [
            {
              id: 'fit',
              label: `Fit to Screen (${sourceContextMenu.aspectRatio === '9:16' ? 'Vertical' : 'Horizontal'})`,
              icon: <IconMaximize size={18} />,
              onClick: () => {
                const isPortrait = sourceContextMenu.aspectRatio === '9:16'
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
                  store.updateLayer(sourceContextMenu.sceneId, layer.id, {
                    portraitX: finalX, portraitY: finalY, portraitWidth: finalW, portraitHeight: finalH,
                    portraitCrop: { top: 0, right: 0, bottom: 0, left: 0 }
                  })
                } else {
                  store.updateLayer(sourceContextMenu.sceneId, layer.id, {
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
              onClick: () => {
                store.setShowEnhancementModal(true, sourceContextMenu.layer?.id || null)
              }
            },
            {
              id: 'project-layout',
              label: 'Project Layout',
              icon: <IconCast size={18} />,
              submenu: monitors.length > 0 ? monitors.map(m => ({
                id: `layout-monitor-${m.id}`,
                label: m.label,
                onClick: () => void openProjector({
                  monitorId: m.id,
                  sceneId: sourceContextMenu.sceneId,
                  aspectRatio: sourceContextMenu.aspectRatio
                })
              })) : [{ id: 'no-layout-monitors', label: 'No Monitors Detected', disabled: true }]
            },
            {
              id: 'project',
              label: 'Project Source',
              icon: <IconCast size={18} />,
              submenu: monitors.length > 0 ? monitors.map(m => ({
                id: `monitor-${m.id}`,
                label: m.label,
                onClick: () => void openProjector({
                  monitorId: m.id,
                  sceneId: sourceContextMenu.sceneId,
                  layerId: sourceContextMenu.layer!.id,
                  aspectRatio: sourceContextMenu.aspectRatio
                })
              })) : [{ id: 'no-monitors', label: 'No Monitors Detected', disabled: true }]
            },
            { id: 'delete', label: 'Delete', icon: <IconTrash size={18} />, danger: true, onClick: () => store.removeLayer(sourceContextMenu.sceneId, sourceContextMenu.layer!.id) }
          ] : [
            {
              id: 'project',
              label: 'Project Layout',
              icon: <IconCast size={18} />,
              submenu: monitors.length > 0 ? monitors.map(m => ({
                id: `monitor-${m.id}`,
                label: m.label,
                onClick: () => void openProjector({
                  monitorId: m.id,
                  sceneId: sourceContextMenu.sceneId,
                  aspectRatio: sourceContextMenu.aspectRatio
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
