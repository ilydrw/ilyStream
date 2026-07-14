import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { IconSquare, IconArrowsMove, IconMaximize, IconCrosshair, IconCast, IconSparkles, IconVideo, IconCrop } from '@tabler/icons-react'
import { IconPencil, IconCopy, IconTrash } from '../../components/ui/icons'

import { useStudioStore } from '../../stores/studio-store'
import { audioEngine } from '../../utils/audio-engine'
import type { LayerType, StudioLayer } from '../../../shared/studio'
import { CanvasEditor } from './components/CanvasEditor'
import type { CanvasEditorHandle, CanvasStreamOutput, VirtualCameraFeedConfig, VirtualCameraSourceOption } from './components/CanvasEditor.types'
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
import { HotkeyLegend } from './components/HotkeyLegend'
import { StingerConfigModal } from './components/StingerConfigModal'

import { useMediaManagement } from './hooks/useMediaManagement'
import { EnhancementModal } from './components/EnhancementModal'
import { CropModal } from './components/CropModal'
import { StreamInfoModal } from './components/StreamInfoModal'
import { usePageVisibility } from '../../hooks/usePageVisibility'
import { toPlatformConfigMap } from '../../lib/platform-configs'
import { toast } from '../../components/ui/Toast'
import { DEFAULT_BROADCAST_STREAM_INFO, type BroadcastStreamInfo } from '../../../shared/stream-info'
import {
  LANDSCAPE_STAGE,
  PORTRAIT_STAGE,
  applyDestinationOutputCaps,
  fitRect,
  formatDuration,
  fullStageRect,
  getAspectRatioForLayoutMode,
  formatIpcError,
  getLayoutModeForAspectRatio,
  loadBroadcastOutputConfig,
  loadVirtualCameraFeed,
  saveVirtualCameraFeed,
  usesTwitchIngest,
  type ProjectorAspectRatio
} from './utils/broadcast-page-utils'

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
  // Per-destination health from the streaming service's status heartbeat —
  // drives the "reconnecting / dropping frames" chip in the header.
  const [outputHealth, setOutputHealth] = useState<Array<{ id: string; name: string; state: string; degraded: boolean }>>([])
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [widgets, setWidgets] = useState<any[]>([])
  const [platforms, setPlatforms] = useState<any[]>([])
  const [monitors, setMonitors] = useState<any[]>([])
  const [selectedMonitorId, setSelectedMonitorId] = useState<number | null>(null)
  const [obsStatus, setObsStatus] = useState<any>(null)
  const [virtualCameraInfo, setVirtualCameraInfo] = useState<any>(null)
  const [virtualCameraFeed, setVirtualCameraFeed] = useState<VirtualCameraFeedConfig>(loadVirtualCameraFeed)
  const [broadcastLayoutMode, setBroadcastLayoutMode] = useState<BroadcastLayoutMode>(() => getLayoutModeForAspectRatio(store.aspectRatio))
  const [layoutAssignments, setLayoutAssignments] = useState<Record<BroadcastLayoutId, string[]>>({ horizontal: [], vertical: [] })
  const [customRtmpUrl, setCustomRtmpUrl] = useState('')
  const [customStreamKey, setCustomStreamKey] = useState('')
  const [streamInfo, setStreamInfo] = useState<BroadcastStreamInfo>(DEFAULT_BROADCAST_STREAM_INFO)
  const [showStreamInfoModal, setShowStreamInfoModal] = useState(false)
  const [showSourceModal, setShowSourceModal] = useState(false)
  const [sourceContextMenu, setSourceContextMenu] = useState<SourceContextMenuState | null>(null)
  const [sceneContextMenu, setSceneContextMenu] = useState<{ x: number, y: number, sceneId: string } | null>(null)
  const [cropTarget, setCropTarget] = useState<{ layer: StudioLayer; sceneId: string; aspectContext: '16:9' | '9:16' } | null>(null)
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

  const virtualCameraSourceOptions = useMemo<VirtualCameraSourceOption[]>(() => {
    return activeScene.layers
      .filter(layer => layer.type !== 'audio')
      .map(layer => ({
        id: layer.id,
        name: layer.name || layer.type,
        type: layer.type
      }))
  }, [activeScene.layers])

  useEffect(() => {
    setVirtualCameraFeed(current => {
      if (current.mode !== 'source') return current
      if (current.sourceLayerId && virtualCameraSourceOptions.some(option => option.id === current.sourceLayerId)) return current

      const fallbackSource = virtualCameraSourceOptions[0]
      return fallbackSource
        ? { ...current, sourceLayerId: fallbackSource.id }
        : { mode: 'layout', layout: current.layout, sourceFitMode: current.sourceFitMode }
    })
  }, [virtualCameraSourceOptions])

  useEffect(() => {
    saveVirtualCameraFeed(virtualCameraFeed)
  }, [virtualCameraFeed])

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
  const nativeTikTokLiveActiveRef = useRef(false)
  const activeLayoutAssignments = useMemo(() => broadcastLayoutMode === 'horizontal' ? { horizontal: layoutAssignments.horizontal, vertical: [] } : broadcastLayoutMode === 'vertical' ? { horizontal: [], vertical: layoutAssignments.vertical } : layoutAssignments, [broadcastLayoutMode, layoutAssignments])
  const [showStingerConfig, setShowStingerConfig] = useState(false)
  const [showHotkeys, setShowHotkeys] = useState(false)
  const [showRecordingSettings, setShowRecordingSettings] = useState(false)
  const visibleScenes = useMemo(() => {
    return store.scenes.filter(s => {
      if (!s.layoutMode) return true
      if (broadcastLayoutMode === 'horizontal') return s.layoutMode === 'horizontal' || s.layoutMode === 'dual-horizontal' || s.layoutMode === 'dual'
      if (broadcastLayoutMode === 'vertical') return s.layoutMode === 'vertical' || s.layoutMode === 'dual-portrait' || s.layoutMode === 'dual'
      return true
    })
  }, [store.scenes, broadcastLayoutMode])

  const changeBroadcastLayoutMode = useCallback((mode: string) => {
    const nextMode = mode as BroadcastLayoutMode
    const nextAspectRatio = getAspectRatioForLayoutMode(nextMode)
    setBroadcastLayoutMode(nextMode)
    setSelectionContext(nextAspectRatio)
    store.setAspectRatio(nextAspectRatio)

    const isVisible = (s: typeof store.scenes[0]) => {
      if (!s.layoutMode) return true
      if (nextMode === 'horizontal') return s.layoutMode === 'horizontal' || s.layoutMode === 'dual-horizontal' || s.layoutMode === 'dual'
      if (nextMode === 'vertical') return s.layoutMode === 'vertical' || s.layoutMode === 'dual-portrait' || s.layoutMode === 'dual'
      return true
    }
    const currentVisible = isVisible(store.scenes.find(s => s.id === store.activeSceneId) || store.scenes[0])
    if (!currentVisible) {
      const nextVisible = store.scenes.find(isVisible)
      if (nextVisible) store.setActiveScene(nextVisible.id)
    }
  }, [store])

  const changeSelectionContext = useCallback((nextContext: ProjectorAspectRatio) => {
    setSelectionContext(nextContext)

    if (!isDualLayoutMode && store.aspectRatio !== nextContext) {
      setBroadcastLayoutMode(getLayoutModeForAspectRatio(nextContext))
      store.setAspectRatio(nextContext)
    }
  }, [isDualLayoutMode, store])

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


    const outputs: CanvasStreamOutput[] = [
      { id: 'horizontal' as const, active: isStreaming && activeLayoutAssignments.horizontal.length > 0, width: 1920, height: 1080, fps: outputConfig.fps, bitrateKbps: outputConfig.bitrateKbps, inputFormat: layoutInputFormats.horizontal, codec: pickAvcCodecString(1920, 1080, outputConfig.fps) },
      { id: 'vertical' as const, active: isStreaming && activeLayoutAssignments.vertical.length > 0, width: 1080, height: 1920, fps: outputConfig.fps, bitrateKbps: outputConfig.bitrateKbps, inputFormat: layoutInputFormats.vertical, codec: pickAvcCodecString(1080, 1920, outputConfig.fps) }
    ]

    if (virtualCameraInfo?.state === 'active') {
      outputs.push({
        id: 'virtual-camera-session' as const,
        active: true,
        width: 1280,
        height: 720,
        fps: Math.min(30, outputConfig.fps),
        bitrateKbps: 0,
        inputFormat: 'bgra',
        feed: virtualCameraFeed
      })
    }
    return outputs
  }, [activeLayoutAssignments, isStreaming, layoutInputFormats, outputConfig.fps, outputConfig.bitrateKbps, virtualCameraFeed, virtualCameraInfo, store.aspectRatio])

  // Tracks aspect ratios currently being mirrored to projector windows so we
  // can force the matching output canvas to render on demand. Without this,
  // a 9:16 projector opened in horizontal-only mode would have no vertical
  // canvas to capture from.
  const [activeMirrorAspects, setActiveMirrorAspects] = useState({ horizontal: 0, vertical: 0 })

  const activeMediaAspectRatios = useMemo<ProjectorAspectRatio[]>(() => {
    const ratios = new Set<ProjectorAspectRatio>()
    if (broadcastLayoutMode === 'vertical' || broadcastLayoutMode === 'dual-portrait') ratios.add('9:16')
    else if (broadcastLayoutMode === 'horizontal' || broadcastLayoutMode === 'dual-horizontal') ratios.add('16:9')
    else {
      ratios.add('16:9')
      ratios.add('9:16')
    }
    if (activeMirrorAspects.horizontal > 0) ratios.add('16:9')
    if (activeMirrorAspects.vertical > 0) ratios.add('9:16')
    return Array.from(ratios)
  }, [broadcastLayoutMode, activeMirrorAspects])

  const { streamReady, mediaStatuses, forceRefreshMedia } = useMediaManagement({
    activeScene, devices, canvasWidth: store.canvasWidth, canvasHeight: store.canvasHeight, videoRefs,
    updateLayer: store.updateLayer, scenes: store.scenes, addAudioSource: store.updateAudioSource,
    removeAudioSource: store.removeAudioSource, audioSources: store.audioSources,
    activeAspectRatios: activeMediaAspectRatios
  })

  // Projector windows can't hold the cameras this window owns, so we mirror
  // our already-composed scene canvas to them as ImageBitmap frames. Unlike
  // VideoFrame, ImageBitmap is cross-process structured-cloneable in
  // Chromium, so this transfer actually works between BrowserWindows.
  useEffect(() => {
    const activePorts = new Set<MessagePort>()
    const portCaptureTimers = new Map<MessagePort, number>()
    const portAspects = new Map<MessagePort, '16:9' | '9:16' | undefined>()

    const refCount = (delta: 1 | -1, aspect: '16:9' | '9:16' | undefined) => {
      if (aspect === '9:16') setActiveMirrorAspects(prev => ({ ...prev, vertical: Math.max(0, prev.vertical + delta) }))
      else if (aspect === '16:9') setActiveMirrorAspects(prev => ({ ...prev, horizontal: Math.max(0, prev.horizontal + delta) }))
    }

    const startCaptureLoop = (port: MessagePort, aspectRatio?: '16:9' | '9:16') => {
      let stopped = false
      const cleanup = () => {
        if (stopped) return
        stopped = true
        const timer = portCaptureTimers.get(port)
        if (timer) window.clearTimeout(timer)
        portCaptureTimers.delete(port)
        activePorts.delete(port)
        refCount(-1, portAspects.get(port))
        portAspects.delete(port)
      }
      port.addEventListener('messageerror', cleanup)
      port.addEventListener('message', (msg) => {
        if (msg.data === '__close') cleanup()
      })

      const tick = async () => {
        if (stopped) return
        // Prefer the per-aspect output canvas (so a projector asking for the
        // vertical view gets the 9:16 render, not the dual editor canvas).
        // Fall back to the main editor canvas if the requested aspect canvas
        // isn't being rendered right now.
        const canvas =
          (aspectRatio && canvasRef.current?.getOutputCanvas(aspectRatio)) ||
          canvasRef.current?.getCanvas() ||
          null
        if (canvas && canvas.width > 0 && canvas.height > 0) {
          try {
            const bitmap = await createImageBitmap(canvas)
            port.postMessage({ bitmap }, [bitmap])
          } catch {
            // Canvas may have been resized or detached between frames; skip.
          }
        }
        portCaptureTimers.set(port, window.setTimeout(tick, 33))
      }
      void tick()
    }

    const handler = (event: MessageEvent) => {
      if (event.source !== window) return
      if ((event.data as any)?.__ilyProjectorChannel !== 'mirror-source') return
      const port = event.ports[0]
      if (!port) return
      const aspectRatio = (event.data as any)?.payload?.aspectRatio as '16:9' | '9:16' | undefined
      activePorts.add(port)
      portAspects.set(port, aspectRatio)
      refCount(1, aspectRatio)
      port.start()
      startCaptureLoop(port, aspectRatio)
    }
    window.addEventListener('message', handler)

    return () => {
      window.removeEventListener('message', handler)
      for (const timer of portCaptureTimers.values()) window.clearTimeout(timer)
      portCaptureTimers.clear()
      for (const port of activePorts) {
        try { port.close() } catch {}
      }
      activePorts.clear()
      // Wipe per-aspect ref counts; no projector ports are alive anymore.
      portAspects.clear()
      setActiveMirrorAspects({ horizontal: 0, vertical: 0 })
    }
  }, [])

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
        const configs = toPlatformConfigMap(await window.api.platform.getConfigs())
        setPlatforms(buildStreamPlatforms(configs))
      }
      if (window.api?.streamInfo) setStreamInfo(await window.api.streamInfo.get())
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
      if (Array.isArray(next.outputs)) setOutputHealth(next.outputs)
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
      const configs = toPlatformConfigMap(await window.api.platform.getConfigs())
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
        setShowSourceModal(false)
        setShowMultiView(false)
        setShowStingerConfig(false)
        setShowHotkeys(false)
        setShowRecordingSettings(false)
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
    const locked = widgetPreset?.locked ?? false

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

  const applyTikTokStarterLayout = useCallback(() => {
    changeBroadcastLayoutMode('vertical')

    const targetScene = store.studioMode ? previewScene : activeScene
    if (!targetScene) return

    const existingWidgetIds = new Set(
      targetScene.layers
        .filter((layer) => layer.type === 'widget')
        .map((layer) => layer.config?.widgetId)
        .filter(Boolean)
    )
    const starterWidgetTypes = ['chat-unified', 'alerts', 'now-playing', 'likes-tracker', 'physics']

    for (const widgetType of starterWidgetTypes) {
      const widget = widgets.find((candidate) => candidate.type === widgetType)
      if (!widget || existingWidgetIds.has(widget.id)) continue
      addSource('widget', { widgetId: widget.id, widgetType: widget.type }, widget.name)
      existingWidgetIds.add(widget.id)
    }
  }, [activeScene, addSource, changeBroadcastLayoutMode, previewScene, store.studioMode, widgets])

  const saveStreamInfo = (next: BroadcastStreamInfo) => {
    setStreamInfo(next)
    void window.api.streamInfo?.set(next).catch((err: unknown) => {
      console.warn('[BroadcastPage] Failed to persist stream info:', err)
    })
  }

  // Mid-stream "Save & apply": pushes title/category to every configured
  // platform that supports live edits. Each platform fails independently.
  const applyStreamInfoLive = async (info: BroadcastStreamInfo) => {
    const title = info.title.trim()
    const applied: string[] = []
    const attempt = async (name: string, run: () => Promise<unknown>) => {
      try {
        await run()
        applied.push(name)
      } catch (err) {
        toast.error(`${name} stream info not applied: ${formatIpcError(err)}`)
      }
    }

    if (platforms.some(p => p.id === 'twitch') && (title || info.twitchCategoryId)) {
      await attempt('Twitch', () => window.api.platform.twitch.updateStreamInfo({
        title: title || undefined,
        categoryId: info.twitchCategoryId || undefined
      }))
    }
    if (platforms.some(p => p.id === 'youtube') && (title || info.youtubeCategoryId)) {
      await attempt('YouTube', () => window.api.platform.youtube.updateStreamInfo({
        title: title || undefined,
        categoryId: info.youtubeCategoryId || undefined
      }))
    }
    if (platforms.some(p => p.id === 'kick') && (title || info.kickCategoryId)) {
      const kickAuth = await window.api.platform.kick.getUserAuthStatus()
        .catch(() => ({ connected: false, redirectUri: '' }))
      if (kickAuth.connected) {
        await attempt('Kick', () => window.api.platform.kick.updateStreamInfo({
          title: title || undefined,
          categoryId: info.kickCategoryId || undefined
        }))
      } else {
        toast.warning('Kick skipped — connect your Kick account on the Kick page')
      }
    }
    if (applied.length > 0) toast.success(`Stream info updated on ${applied.join(', ')}`)
  }

  // Streaming Handlers
  const completeNativeTikTokLive = async () => {
    if (!nativeTikTokLiveActiveRef.current) return
    nativeTikTokLiveActiveRef.current = false
    try {
      await window.api.platform.tiktok.completeLive()
    } catch (err) {
      console.warn('[BroadcastPage] TikTok LIVE completion failed:', err)
    }
  }

  const startBroadcast = async () => {
    setStreamError(null)
    const destinations = (['horizontal', 'vertical'] as BroadcastLayoutId[]).flatMap(l => activeLayoutAssignments[l].map(pId => ({ layout: l, platform: platforms.find(p => p.id === pId) })))
    if (destinations.length === 0 && customRtmpUrl) destinations.push({ layout: store.aspectRatio === '9:16' ? 'vertical' : 'horizontal', platform: { id: 'custom', name: 'Custom', url: customRtmpUrl, key: customStreamKey } })
    if (destinations.length === 0) return setStreamError('No platforms assigned')

    // Apply the pre-live stream info. Twitch and Kick take direct channel
    // updates; YouTube and TikTok receive theirs through the prepare-live
    // calls below. Failures here shouldn't stop the broadcast, so they
    // downgrade to toasts instead of blocking.
    const streamTitle = streamInfo.title.trim()
    if (destinations.some(d => d.platform?.id === 'twitch') && (streamTitle || streamInfo.twitchCategoryId)) {
      try {
        await window.api.platform.twitch.updateStreamInfo({
          title: streamTitle || undefined,
          categoryId: streamInfo.twitchCategoryId || undefined
        })
        console.log(`[BroadcastPage] Twitch stream info applied${streamInfo.twitchCategoryName ? ` (${streamInfo.twitchCategoryName})` : ''}`)
      } catch (err) {
        toast.error(`Twitch stream info not applied: ${formatIpcError(err)}`)
      }
    }

    if (destinations.some(d => d.platform?.id === 'kick') && (streamTitle || streamInfo.kickCategoryId)) {
      try {
        const kickAuth = await window.api.platform.kick.getUserAuthStatus()
        if (kickAuth.connected) {
          await window.api.platform.kick.updateStreamInfo({
            title: streamTitle || undefined,
            categoryId: streamInfo.kickCategoryId || undefined
          })
          console.log(`[BroadcastPage] Kick stream info applied${streamInfo.kickCategoryName ? ` (${streamInfo.kickCategoryName})` : ''}`)
        } else {
          console.log('[BroadcastPage] Kick stream info skipped — Kick account not connected')
        }
      } catch (err) {
        toast.error(`Kick stream info not applied: ${formatIpcError(err)}`)
      }
    }

    // Resolve platform-managed, short-lived ingest credentials immediately
    // before the encoders start. Manual RTMP destinations already carry keys.
    if (destinations.some(d => d.platform?.keyProvider === 'youtube' && !d.platform.key)) {
      try {
        const live = await window.api.platform.youtube.prepareLive({
          title: streamTitle || undefined,
          categoryId: streamInfo.youtubeCategoryId || undefined
        })
        console.log(`[BroadcastPage] YouTube broadcast ready: "${live.title}" ${live.watchUrl}${live.autoStart ? '' : ' — auto-start is off for this broadcast; press "Go live" in YouTube Studio if it does not start on its own'}`)
        for (const d of destinations) {
          if (d.platform?.keyProvider === 'youtube' && !d.platform.key) {
            d.platform = { ...d.platform, url: live.rtmpUrl, key: live.streamKey }
          }
        }
      } catch (err) {
        return setStreamError(err instanceof Error ? err.message : 'YouTube go-live setup failed')
      }
    }

    if (destinations.some(d => d.platform?.keyProvider === 'tiktok-native' && !d.platform.key)) {
      try {
        const live = await window.api.platform.tiktok.prepareLive({
          title: streamTitle || undefined,
          orientation: destinations.some(d => d.platform?.keyProvider === 'tiktok-native' && d.layout === 'vertical')
            ? 'portrait'
            : 'landscape'
        })
        nativeTikTokLiveActiveRef.current = true
        for (const d of destinations) {
          if (d.platform?.keyProvider === 'tiktok-native' && !d.platform.key) {
            d.platform = { ...d.platform, url: live.rtmpUrl, key: live.streamKey }
          }
        }
      } catch (err) {
        return setStreamError(err instanceof Error ? err.message : 'TikTok native go-live setup failed')
      }
    }

    const configuredOutput = await loadBroadcastOutputConfig()
    const { fps, bitrateKbps } = applyDestinationOutputCaps(configuredOutput, destinations)
    console.log(`[BroadcastPage] Starting broadcast at ${fps} FPS / ${bitrateKbps} Kbps`)
    setOutputConfig({ fps, bitrateKbps })
    const useReliablePipe = destinations.some(usesTwitchIngest)
    const hIn = useReliablePipe
      ? 'mjpeg'
      : await getOptimizedCaptureInputFormat(1920, 1080, fps, bitrateKbps * 1000)
    setCaptureInputFormat(hIn)
    const vIn = useReliablePipe
      ? 'mjpeg'
      : await getOptimizedCaptureInputFormat(1080, 1920, fps, bitrateKbps * 1000)
    setLayoutInputFormats({ horizontal: hIn, vertical: vIn })

    try {
      const res = await Promise.all(destinations.map(d => window.api.streaming.start({ outputId: `${d.layout}:${d.platform.id}`, outputName: d.platform.name, rtmpUrl: d.platform.url, streamKey: d.platform.key, width: d.layout === 'vertical' ? 1080 : 1920, height: d.layout === 'vertical' ? 1920 : 1080, fps, bitrateKbps, inputFormat: d.layout === 'vertical' ? vIn : hIn, audioFormat: 'f32le', audioSampleRate: audioEngine.getContext().sampleRate })))
      if (res.every(r => r.success)) {
        setIsStreaming(true)
        setStatus('Live')
      } else {
        await completeNativeTikTokLive()
        setStreamError('Failed to start one or more outputs')
      }
    } catch (err) {
      await completeNativeTikTokLive()
      setStreamError(err instanceof Error ? err.message : 'Failed to start one or more outputs')
    }
  }

  const stopBroadcast = async () => {
    await window.api.streaming.stop()
    await completeNativeTikTokLive()
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
    const refreshVirtualCameraInfo = async () => {
      if (window.api?.virtualCamera) setVirtualCameraInfo(await window.api.virtualCamera.getStatus())
    }

    if (virtualCameraInfo.state === 'unsupported' || virtualCameraInfo.canStart === false) {
      if (virtualCameraInfo.canInstallDriver && window.api?.virtualCamera?.installDriver) {
        try {
          setStreamError(virtualCameraInfo.installDriverHint || 'Windows will ask for administrator permission to install ilyStream Virtual Camera.')
          await window.api.virtualCamera.installDriver()
        } catch (err) {
          setStreamError(err instanceof Error ? err.message : String(err))
        } finally {
          await refreshVirtualCameraInfo()
        }
        return
      }

      setStreamError(virtualCameraInfo.driverHint || virtualCameraInfo.lastError || 'Virtual camera driver is not available')
      return
    }

    if (virtualCameraInfo.state === 'active') {
      try {
        await window.api.virtualCamera.stop()
      } finally {
        await refreshVirtualCameraInfo()
      }
      return
    }

    try {
      const context = audioEngine.getContext()
      await window.api.virtualCamera.start({
        width: store.canvasWidth,
        height: store.canvasHeight,
        fps: outputConfig.fps,
        bitrateKbps: outputConfig.bitrateKbps,
        audioSampleRate: context.sampleRate
      })
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : String(err))
    } finally {
      await refreshVirtualCameraInfo()
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
        outputHealth={outputHealth}
        showLeftSidebar={showLeftSidebar} onToggleLeftSidebar={() => setShowLeftSidebar(!showLeftSidebar)} showRightSidebar={showRightSidebar} onToggleRightSidebar={() => setShowRightSidebar(!showRightSidebar)}
        broadcastLayoutMode={broadcastLayoutMode} onLayoutModeChange={changeBroadcastLayoutMode}
        onApplyTikTokPreset={applyTikTokStarterLayout}
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
        virtualCameraFeed={virtualCameraFeed} onVirtualCameraFeedChange={setVirtualCameraFeed}
        virtualCameraSourceOptions={virtualCameraSourceOptions}
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
        streamInfoTitle={streamInfo.title} onOpenStreamInfo={() => setShowStreamInfoModal(true)}
        onStartBroadcast={startBroadcast} onStopBroadcast={stopBroadcast}
        onShowMultiView={() => setShowMultiView(true)}
      />

      <StreamInfoModal
        open={showStreamInfoModal}
        onClose={() => setShowStreamInfoModal(false)}
        value={streamInfo}
        onSave={saveStreamInfo}
        platformIds={platforms.map(p => p.id)}
        isStreaming={isStreaming}
        onApplyLive={applyStreamInfoLive}
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
            scenes={visibleScenes}
            activeSceneId={store.studioMode ? store.previewSceneId : store.activeSceneId}
            onSelectScene={store.setActiveScene}
            onAddScene={(name) => store.addScene(name, broadcastLayoutMode)}
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
              <div className="flex-1 flex flex-col min-w-0 border border-white/5 bg-black/20 rounded-md overflow-hidden relative group">
                <div className="absolute top-4 left-4 z-10 px-3 py-1 bg-accent/80 text-white text-[10px] font-semibold tracking-tight rounded-full shadow-lg">Preview</div>
                <CanvasEditor
                  activeScene={previewScene} isStreaming={isStreaming} isRecording={isRecording}
                  captureInputFormat={captureInputFormat} outputFps={outputConfig.fps}
                  outputBitrateKbps={outputConfig.bitrateKbps} videoRefs={videoRefs}
                  isVisible={isPageVisible} isPreview={true}
                  streamReady={streamReady} streamOutputs={[]}
                  previewMode="single" selectionContext={selectionContext}
                  onSelectionContextChange={changeSelectionContext}
                  onContextMenu={(e, l, ctx) => {
                    changeSelectionContext(ctx)
                    setSourceContextMenu({ x: e.clientX, y: e.clientY, layer: l, sceneId: previewScene.id, aspectRatio: ctx })
                  }}
                />
              </div>

              {/* Transition Controls */}
              <div className="flex flex-col justify-center items-center gap-4 px-3">
                <div className="flex flex-col items-center gap-1">
                  <button
                    onClick={() => store.transition('fade')}
                    className="w-16 h-16 rounded-md bg-accent text-white flex flex-col items-center justify-center gap-1 hover:brightness-110 active:scale-95 transition-all border border-white/10 group"
                  >
                    <IconArrowsMove size={24} className="group-hover:rotate-180 transition-transform duration-500" />
                    <span className="text-[10px] font-semibold tracking-tighter">Fade</span>
                  </button>
                  <div className="flex flex-col items-center gap-0.5 mt-1">
                    <input
                      type="number"
                      value={store.transitionDuration}
                      onChange={(e) => store.setTransitionDuration(Number(e.target.value))}
                      className="w-12 bg-white/5 border border-white/10 rounded text-[9px] font-semibold text-center text-white/50 focus:text-accent focus:border-accent/50 outline-none transition-all"
                      title="Transition Duration (ms)"
                    />
                    <span className="text-[7px] font-semibold tracking-tight text-white/20">ms</span>
                  </div>
                </div>

                <div className="h-px w-10 bg-white/10" />

                <button
                  onClick={() => store.transition('cut')}
                  className="w-16 py-3 rounded-xl bg-white/5 text-white/40 hover:text-white hover:bg-white/10 text-[9px] font-semibold tracking-tight transition-all border border-white/5"
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
                    className={`w-16 h-16 rounded-md flex flex-col items-center justify-center gap-1 transition-all border border-white/10 group ${ store.stingerSettings.path ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20 hover:brightness-110' : 'bg-white/5 text-white/20 hover:bg-white/10 hover:text-white/40' }`}
                  >
                    <IconVideo size={24} />
                    <span className="text-[10px] font-semibold tracking-tighter">Stinger</span>
                  </button>
                  <button
                    onClick={() => setShowStingerConfig(true)}
                    className="text-[8px] font-semibold tracking-tight text-white/20 hover:text-white/60 transition-colors"
                  >
                    Setup
                  </button>
                </div>
              </div>


              {/* Program Canvas (Right) */}
              <div className="flex-1 flex flex-col min-w-0 border border-red-500/20 bg-black/20 rounded-md overflow-hidden relative group">
                <div className="absolute top-4 right-4 z-10 px-3 py-1 bg-red-500/80 text-white text-[10px] font-semibold tracking-tight rounded-full shadow-lg animate-pulse">Live</div>
                <CanvasEditor
                  activeScene={activeScene} isStreaming={isStreaming} isRecording={isRecording}
                  captureInputFormat={captureInputFormat} outputFps={outputConfig.fps}
                  outputBitrateKbps={outputConfig.bitrateKbps} videoRefs={videoRefs}
                  isVisible={isPageVisible}
                  streamReady={streamReady} streamOutputs={activeCanvasStreamOutputs}
                  previewMode="single" selectionContext={selectionContext}
                  dualVerticalOverlayEnabled={effectiveDualVerticalOverlay}
                  forceVerticalCanvas={activeMirrorAspects.vertical > 0}
                  forceHorizontalCanvas={activeMirrorAspects.horizontal > 0}
                  onSelectionContextChange={changeSelectionContext}
                  onContextMenu={(e, l, ctx) => {
                    changeSelectionContext(ctx)
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
                forceVerticalCanvas={activeMirrorAspects.vertical > 0}
                forceHorizontalCanvas={activeMirrorAspects.horizontal > 0}
                onSelectionContextChange={changeSelectionContext}
                onContextMenu={(e, l, ctx) => {
                  changeSelectionContext(ctx)
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
              changeSelectionContext(ctx)
              setSourceContextMenu({ x: e.clientX, y: e.clientY, layer: l, sceneId: getSceneIdForLayer(l), aspectRatio: ctx })
            }}
            aspectRatio={store.aspectRatio}
            broadcastLayoutMode={broadcastLayoutMode}
            widgets={widgets}
            devices={devices}
            mediaStatuses={mediaStatuses}
            sidebarWidth={sidebarWidth}
            onSidebarResizeStart={() => setIsResizingSidebar(true)}
            selectionContext={selectionContext}
            onSelectionContextChange={changeSelectionContext}
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
      <CropModal
        open={!!cropTarget}
        onClose={() => setCropTarget(null)}
        layer={cropTarget?.layer ?? null}
        sceneId={cropTarget?.sceneId ?? ''}
        aspectContext={cropTarget?.aspectContext ?? '16:9'}
        videoRefs={videoRefs}
        onUpdate={(sceneId, layerId, updates) => store.updateLayer(sceneId, layerId, updates)}
      />
      <MultiViewModal
        open={showMultiView}
        onClose={() => setShowMultiView(false)}
        videoRefs={videoRefs}
      />

      <StingerConfigModal open={showStingerConfig} onClose={() => setShowStingerConfig(false)} />

      <HotkeyLegend open={showHotkeys} onClose={() => setShowHotkeys(false)} />

      <RecordingSettingsModal
        isOpen={showRecordingSettings}
        onClose={() => setShowRecordingSettings(false)}
      />




      {sourceContextMenu && (
        <ContextMenu
          x={sourceContextMenu.x} y={sourceContextMenu.y}
          onClose={() => setSourceContextMenu(null)}
          items={sourceContextMenu.layer ? [
            ...(sourceContextMenu.layer.type !== 'audio' ? [{
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
            }] : []),
            ...(sourceContextMenu.layer.type !== 'audio' ? [{
              id: 'enhance',
              label: 'Enhance',
              icon: <IconSparkles size={18} />,
              disabled: !(sourceContextMenu.layer.type === 'camera' || sourceContextMenu.layer.type === 'display' || sourceContextMenu.layer.type === 'image'),
              onClick: () => {
                store.setShowEnhancementModal(true, sourceContextMenu.layer?.id || null)
              }
            }] : []),
            ...(sourceContextMenu.layer.type !== 'audio' ? [{
              id: 'crop',
              label: 'Crop',
              icon: <IconCrop size={18} />,
              disabled: !(sourceContextMenu.layer.type === 'camera' || sourceContextMenu.layer.type === 'display' || sourceContextMenu.layer.type === 'image'),
              onClick: () => {
                const layer = sourceContextMenu.layer!
                setCropTarget({ layer, sceneId: sourceContextMenu.sceneId, aspectContext: sourceContextMenu.aspectRatio })
              }
            }] : []),
            ...(sourceContextMenu.layer.type !== 'audio' ? [{
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
            }] : []),
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
