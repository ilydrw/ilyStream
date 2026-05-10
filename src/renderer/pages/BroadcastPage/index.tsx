import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import {
  Radio, Plus, Layers, Monitor, Smartphone, RotateCcw, RotateCw, 
  Trash2, Play, Square, Circle, Camera, Wifi, Settings, Menu,
  ChevronLeft, ChevronRight, Lock, EyeOff, Maximize, Crosshair, Move, RefreshCw,
  Copy, Copy as Duplicate, Volume2, Video, Globe, Type, Image as ImageIcon,
  MoreVertical, Pencil, Grid, Scissors, Clipboard, Download, Eye, Unlock
} from 'lucide-react'
import { useStudioStore } from '../../stores/studio-store'
import { audioEngine } from '../../utils/audio-engine'
import type { LayerType, StudioLayer } from '../../../shared/studio'
import { CanvasEditor } from './components/CanvasEditor'
import type { CanvasEditorHandle } from './components/CanvasEditor.types'
import { StudioControlPanel } from './components/StudioControlPanel'
import {
  getMediaSignature,
  buildCameraConstraints,
  resolveCameraAudioDeviceId,
  buildRawAudioConstraints,
  disposeMediaElement,
  isTransientMediaError,
  drawVideoCover,
  clampNumber
} from './utils/media-init'
import { AddSourceModal } from './components/AddSourceModal'
import { LayerProperties } from './components/LayerProperties'
import { ContextMenu, type ContextMenuItem } from '../../components/ui/ContextMenu'
import { AudioMixer } from './components/AudioMixer'
import { Select, type SelectOption } from '../../components/ui/Select'
import { TwitchIcon } from '../../components/ui/TwitchIcon'
import { LayoutPlatformPicker } from './components/LayoutPlatformPicker'
import { resolveWidgetStudioPreset } from './utils/widget-placement'
import {
  buildStreamPlatforms,
  CAMERA_PRESETS,
  getOptimizedCaptureInputFormat,
  pickAvcCodecString,
  type BroadcastLayoutId,
  type BroadcastLayoutMode
} from './utils/streaming-config'

const LAYER_TYPE_ICONS: Record<string, typeof Video> = {
  camera: Video, display: Monitor, widget: Layers, browser: Globe, text: Type, image: ImageIcon
}

type ManagedMediaElement = (HTMLVideoElement | HTMLAudioElement) & {
  __ilyCleanup?: () => void
  __ilySignature?: string
  __ilyRawStream?: MediaStream
}

const RAW_BROADCAST_AUDIO: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: { ideal: 2 },
  sampleRate: { ideal: audioEngine.getContext().sampleRate },
  sampleSize: { ideal: 16 },
  latency: { ideal: 0.01 }
} as any

export default function BroadcastPage() {
  const store = useStudioStore()
  const [isStreaming, setIsStreaming] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [status, setStatus] = useState('Offline')
  const [streamError, setStreamError] = useState<string | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [widgets, setWidgets] = useState<any[]>([])
  const [platforms, setPlatforms] = useState<any[]>([])
  const [monitors, setMonitors] = useState<any[]>([])
  const [selectedMonitorId, setSelectedMonitorId] = useState<number | null>(null)
  const [obsStatus, setObsStatus] = useState<any>(null)
  const [broadcastLayoutMode, setBroadcastLayoutMode] = useState<BroadcastLayoutMode>('horizontal')
  const [layoutAssignments, setLayoutAssignments] = useState<Record<BroadcastLayoutId, string[]>>({
    horizontal: [],
    vertical: []
  })
  const [customRtmpUrl, setCustomRtmpUrl] = useState('')
  const [customStreamKey, setCustomStreamKey] = useState('')
  const [showSourceModal, setShowSourceModal] = useState(false)
  const [sourceContextMenu, setSourceContextMenu] = useState<{ x: number, y: number, layer: StudioLayer } | null>(null)
  const [captureInputFormat, setCaptureInputFormat] = useState<'h264' | 'mjpeg'>('h264')
  const [outputConfig, setOutputConfig] = useState({ fps: 30, bitrateKbps: 6000 })
  const [layoutInputFormats, setLayoutInputFormats] = useState<Record<BroadcastLayoutId, 'h264' | 'mjpeg'>>({
    horizontal: 'h264',
    vertical: 'h264'
  })
  
  const [showLeftSidebar, setShowLeftSidebar] = useState(true)
  const [showRightSidebar, setShowRightSidebar] = useState(true)
  const [mixerHeight, setMixerHeight] = useState(280)
  const [isMixerCollapsed, setIsMixerCollapsed] = useState(false)
  const [isResizingMixer, setIsResizingMixer] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(320)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const [sceneContextMenu, setSceneContextMenu] = useState<{ x: number, y: number, sceneId: string } | null>(null)
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null)
  const [editingSceneName, setEditingSceneName] = useState('')
  const [dragSourceIdx, setDragSourceIdx] = useState<number | null>(null)
  const [streamReady, setStreamReady] = useState(0)

  const videoRefs = useRef<Record<string, HTMLVideoElement>>({})
  const canvasRef = useRef<CanvasEditorHandle>(null)

  const activeScene = useMemo(() =>
    store.scenes.find(s => s.id === store.activeSceneId) || store.scenes[0]
  , [store.scenes, store.activeSceneId])

  const selectedLayer = useMemo(() =>
    activeScene?.layers.find(l => l.id === store.selectedLayerId) || null
  , [activeScene, store.selectedLayerId])

  const widgetsById = useMemo(() =>
    new Map(widgets.map(widget => [widget.id, widget]))
  , [widgets])

  useEffect(() => {
    if (!activeScene) return
    activeScene.layers.forEach(layer => {
      if (layer.type !== 'widget') return
      const widgetType = layer.config?.widgetType || widgetsById.get(layer.config?.widgetId)?.type
      if (widgetType !== 'screen-border') return
      const hasGenericWidgetSize = Math.abs(layer.width - 600) <= 1 && Math.abs(layer.height - 400) <= 1
      if (!hasGenericWidgetSize) return
      const preset = resolveWidgetStudioPreset({ type: 'screen-border' }, layer.config, store.canvasWidth, store.canvasHeight)
      store.updateLayer(activeScene.id, layer.id, {
        __allLayouts: true,
        ...preset,
        portraitVisible: layer.portraitVisible,
        config: {
          ...layer.config,
          ...(preset.config || {}),
          widgetType: 'screen-border',
          premiumAutoWrapped: true,
          audioMixerHidden: layer.config?.audioMixerHidden ?? false
        }
      } as any)
    })
  }, [activeScene, store, widgetsById])

  const activeLayoutAssignments = useMemo(() => {
    if (broadcastLayoutMode === 'horizontal') return { horizontal: layoutAssignments.horizontal, vertical: [] }
    if (broadcastLayoutMode === 'vertical') return { horizontal: [], vertical: layoutAssignments.vertical }
    return layoutAssignments
  }, [broadcastLayoutMode, layoutAssignments])

  const assignedStreamCount = activeLayoutAssignments.horizontal.length + activeLayoutAssignments.vertical.length

  const activeCanvasStreamOutputs = useMemo(() => {
    const streamFps = outputConfig.fps
    const horizontalBitrateKbps = Math.max(3500, ...activeLayoutAssignments.horizontal.map(id => id === 'twitch' ? 3500 : 6000))
    const verticalBitrateKbps = Math.max(3500, ...activeLayoutAssignments.vertical.map(id => id === 'twitch' ? 3500 : 6000))
    return [
      {
        id: 'horizontal' as const,
        active: isStreaming && activeLayoutAssignments.horizontal.length > 0,
        width: 1920,
        height: 1080,
        fps: streamFps,
        bitrateKbps: horizontalBitrateKbps,
        inputFormat: layoutInputFormats.horizontal,
        codec: pickAvcCodecString(1920, 1080, streamFps)
      },
      {
        id: 'vertical' as const,
        active: isStreaming && activeLayoutAssignments.vertical.length > 0,
        width: 1080,
        height: 1920,
        fps: streamFps,
        bitrateKbps: verticalBitrateKbps,
        inputFormat: layoutInputFormats.vertical,
        codec: pickAvcCodecString(1080, 1920, streamFps)
      }
    ]
  }, [activeLayoutAssignments, isStreaming, layoutInputFormats, outputConfig.fps])

  const toggleLayoutAssignment = useCallback((layout: BroadcastLayoutId, platformId: string) => {
    setLayoutAssignments(current => {
      const otherLayout: BroadcastLayoutId = layout === 'horizontal' ? 'vertical' : 'horizontal'
      const isSelected = current[layout].includes(platformId)
      return {
        horizontal: layout === 'horizontal'
          ? (isSelected ? current.horizontal.filter(id => id !== platformId) : [...current.horizontal, platformId])
          : current.horizontal.filter(id => id !== platformId),
        vertical: layout === 'vertical'
          ? (isSelected ? current.vertical.filter(id => id !== platformId) : [...current.vertical, platformId])
          : current.vertical.filter(id => id !== platformId),
        [otherLayout]: current[otherLayout].filter(id => id !== platformId)
      } as Record<BroadcastLayoutId, string[]>
    })
  }, [])

  const removeLayoutAssignment = useCallback((layout: BroadcastLayoutId, platformId: string) => {
    setLayoutAssignments(current => ({
      ...current,
      [layout]: current[layout].filter(id => id !== platformId)
    }))
  }, [])

  const handleLayoutModeChange = useCallback((mode: string) => {
    const nextMode = mode as BroadcastLayoutMode
    setBroadcastLayoutMode(nextMode)
    store.setAspectRatio(nextMode === 'vertical' ? '9:16' : '16:9')
  }, [store])

  useEffect(() => {
    void loadDevices(); void loadWidgets(); void loadPlatforms(); void loadMonitors(); void loadObsStatus(); void checkStatus()

    let timer: NodeJS.Timeout
    const handleDeviceChange = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        void loadDevices()
      }, 1500)
    }
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)
    return () => navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange)
  }, [])

  useEffect(() => {
    if (!window.api?.on) return
    return window.api.on('obs:status-changed', (status: any) => {
      setObsStatus(status)
    })
  }, [])

  useEffect(() => {
    if (!window.api?.on) return
    return window.api.on('streaming:status-changed', (streamingStatus: any) => {
      if (typeof streamingStatus?.streaming === 'boolean') {
        setIsStreaming(streamingStatus.streaming)
        setStatus(streamingStatus.streaming ? 'Live' : 'Offline')
      }
      if (typeof streamingStatus?.recording === 'boolean') {
        setIsRecording(streamingStatus.recording)
      }
      if (streamingStatus?.error) {
        setStreamError(streamingStatus.error)
      }
    })
  }, [])

  // Recording Timer
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isRecording) {
      interval = setInterval(() => setRecordingTime(t => t + 1), 1000)
    } else {
      setRecordingTime(0)
    }
    return () => clearInterval(interval)
  }, [isRecording])

  const pageRef = useRef<HTMLDivElement>(null)

  const handleMixerResize = useCallback((e: PointerEvent) => {
    if (isMixerCollapsed) return
    const newHeight = window.innerHeight - e.clientY
    const clampedHeight = Math.max(150, Math.min(newHeight, window.innerHeight * 0.6))
    
    // Direct DOM update for zero-latency dragging
    if (pageRef.current) {
      pageRef.current.style.setProperty('--mixer-height', `${clampedHeight}px`)
    }
  }, [isMixerCollapsed])

  const handleMixerResizeEnd = useCallback((e: PointerEvent) => {
    setIsResizingMixer(false)
    const newHeight = window.innerHeight - e.clientY
    const clampedHeight = Math.max(150, Math.min(newHeight, window.innerHeight * 0.6))
    setMixerHeight(clampedHeight)
  }, [])

  useEffect(() => {
    if (!isResizingMixer) return
    window.addEventListener('pointermove', handleMixerResize)
    window.addEventListener('pointerup', handleMixerResizeEnd)
    return () => {
      window.removeEventListener('pointermove', handleMixerResize)
      window.removeEventListener('pointerup', handleMixerResizeEnd)
    }
  }, [isResizingMixer, handleMixerResize, handleMixerResizeEnd])

  const handleSidebarResize = useCallback((e: PointerEvent) => {
    const newWidth = window.innerWidth - e.clientX
    const clampedWidth = Math.max(280, Math.min(newWidth, window.innerWidth * 0.4))
    
    if (pageRef.current) {
      pageRef.current.style.setProperty('--sidebar-width', `${clampedWidth}px`)
    }
  }, [])

  const handleSidebarResizeEnd = useCallback((e: PointerEvent) => {
    setIsResizingSidebar(false)
    const newWidth = window.innerWidth - e.clientX
    const clampedWidth = Math.max(280, Math.min(newWidth, window.innerWidth * 0.4))
    setSidebarWidth(clampedWidth)
  }, [])

  useEffect(() => {
    if (!isResizingSidebar) return
    window.addEventListener('pointermove', handleSidebarResize)
    window.addEventListener('pointerup', handleSidebarResizeEnd)
    return () => {
      window.removeEventListener('pointermove', handleSidebarResize)
      window.removeEventListener('pointerup', handleSidebarResizeEnd)
    }
  }, [isResizingSidebar, handleSidebarResize, handleSidebarResizeEnd])

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          store.redo()
        } else {
          store.undo()
        }
        e.preventDefault()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        store.redo()
        e.preventDefault()
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const loadDevices = async () => {
    try {
      let list = await navigator.mediaDevices.enumerateDevices()
      
      // Only trigger permission prompt if we have no labels (implies no permission)
      const needsPermission = list.some(d => !d.label)
      if (needsPermission) {
        console.log('[BroadcastPage] Requesting media permissions to resolve labels...')
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
          stream.getTracks().forEach(t => t.stop())
          // Refresh list after permission
          list = await navigator.mediaDevices.enumerateDevices()
        } catch (e) {
          console.warn('[BroadcastPage] Permission request for labels failed or denied:', e)
        }
      }

      setDevices(list)
    } catch (err) {
      console.error('[BroadcastPage] loadDevices failed:', err)
    }
  }

  const loadWidgets = async () => {
    if (!window.api?.widgets) return
    const data = await window.api.widgets.getAll()
    setWidgets(data)
  }

  const loadPlatforms = async () => {
    if (!window.api?.platform) return
    const configs = await window.api.platform.getConfigs()
    const available = buildStreamPlatforms(configs)
    setPlatforms(available)
  }

  useEffect(() => {
    const availableIds = new Set(platforms.map(platform => platform.id))
    setLayoutAssignments(current => {
      const horizontal = current.horizontal.filter(id => availableIds.has(id))
      const vertical = current.vertical.filter(id => availableIds.has(id))
      if (horizontal.length === current.horizontal.length && vertical.length === current.vertical.length) {
        return current
      }
      return { horizontal, vertical }
    })
  }, [platforms])

  const loadMonitors = async () => {
    if (!window.api?.studio) return
    const displays = await window.api.studio.getMonitors()
    setMonitors(displays)
    const primary = displays.find((display: any) => display.isPrimary) || displays[0]
    if (primary) setSelectedMonitorId(primary.id)
  }

  const loadObsStatus = async () => {
    if (!window.api?.obs) return
    const status = await window.api.obs.getStatus()
    setObsStatus(status)
  }

  const checkStatus = async () => {
    if (!window.api?.streaming) return
    const streaming = await window.api.streaming.getStatus()
    const recording = await window.api.streaming.getRecordingStatus()
    setIsStreaming(streaming)
    setIsRecording(recording)
    setStatus(streaming ? 'Live' : 'Offline')
  }

  const pendingMedia = useRef(new Set<string>())
  const lastMediaSignatures = useRef<Record<string, string>>({})
  const sessionDisplaySourceIds = useRef(new Set<string>())
  const lastMediaInitTimes = useRef<Record<string, number>>({})
  const initMedia = async (layer: StudioLayer, attempt = 0, passedSignature?: string) => {
    const { id: layerId, type } = layer
    if (type !== 'camera' && type !== 'display' && type !== 'audio') return

    const signature = passedSignature || getMediaSignature(layer, devices)
    const existing = videoRefs.current[layerId] as ManagedMediaElement | undefined
    
    // Cool-down check: don't re-init more than once every 2 seconds
    const now = Date.now()
    const lastInit = lastMediaInitTimes.current[layerId] || 0
    if (now - lastInit < 2000 && attempt === 0) {
      console.log(`[BroadcastPage] initMedia throttled for ${layerId.slice(0, 8)} (cool-down)`)
      return
    }

    if (pendingMedia.current.has(layerId) || (existing?.__ilySignature === signature && lastMediaSignatures.current[layerId] === signature)) {
      return
    }
    
    console.log('[BroadcastPage] initMedia:', type, layerId.slice(0, 8), signature)
    pendingMedia.current.add(layerId)
    lastMediaInitTimes.current[layerId] = now
    const cleanupFns: Array<() => void> = []
    try {
      let stream: MediaStream

      if (type === 'display' || (type === 'audio' && layer.config.audioOnlyDisplayCapture)) {
        let effectiveSourceId = String(layer.config.desktopSourceId || '')
        const desktopSourceName = String(layer.config.desktopSourceName || '')

        const isSpotify = desktopSourceName.toLowerCase().includes('spotify')
        if (desktopSourceName) {
          console.log(`[BroadcastPage] Attempting to relink display source: ${desktopSourceName}`)
          const sources = await window.api.studio.getDesktopSources()
          
          let match = sources.find(s => s.name === desktopSourceName)
          
          if (!match) {
            match = sources.find(s => s.name.toLowerCase().includes(desktopSourceName.toLowerCase()))
          }
          
          if (!match && isSpotify && window.api?.studio?.findSpotifySource) {
            match = await window.api.studio.findSpotifySource()
          }

          if (!match && isSpotify) {
            // Last ditch: look for anything containing 'spotify' or 'music'
            match = sources.find(s => 
              s.name.toLowerCase().includes('spotify') || 
              s.name.toLowerCase().includes('spotify free') ||
              s.name.toLowerCase().includes('spotify premium')
            )
          }

          if (match) {
            if (match.id !== effectiveSourceId) {
              console.log(`[BroadcastPage] Relinked ${desktopSourceName} -> ${match.name} (${match.id})`)
              effectiveSourceId = match.id
              sessionDisplaySourceIds.current.add(layerId)
              store.updateLayer(activeScene.id, layerId, { 
                config: { ...layer.config, desktopSourceId: match.id, desktopSourceName: match.name } 
              })
            } else {
              // ID is already correct, just ensure we mark it as session-active
              sessionDisplaySourceIds.current.add(layerId)
            }
          } else {
            console.warn(`[BroadcastPage] Could not find desktop source: ${desktopSourceName}`)
            const err = new Error(`Source not found: ${desktopSourceName}`)
            ;(err as any).name = 'TransientNotFoundError'
            throw err
          }
        }

        if (effectiveSourceId && window.api?.studio?.prepareDisplayCapture) {
          console.log(`[BroadcastPage] Preparing display capture for ${effectiveSourceId} (${type})`)
          const prepared = await window.api.studio.prepareDisplayCapture({
            sourceId: effectiveSourceId,
            withAudio: type === 'audio' || layer.config.captureAudio === true,
            audioOnly: type === 'audio'
          })
          if (!prepared?.success) {
            throw new Error(prepared?.error || 'Could not prepare desktop capture')
          }
          // Small delay to ensure main process handler state is updated
          await new Promise(resolve => setTimeout(resolve, 100))
        }

        try {
          const constraints: any = {
            video: type === 'audio' ? false : {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: effectiveSourceId
              },
              width: { ideal: store.canvasWidth },
              height: { ideal: store.canvasHeight },
              frameRate: { ideal: 30 }
            },
            audio: (type === 'audio' || layer.config.captureAudio === true) ? {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: effectiveSourceId
              }
            } : false
          }

          // In modern Electron, we still call getDisplayMedia but the handler uses the sourceId
          // However, passing the sourceId in mandatory constraints can help some versions/platforms.
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              width: { ideal: store.canvasWidth },
              height: { ideal: store.canvasHeight },
              frameRate: { ideal: 30 }
            },
            audio: (type === 'audio' || layer.config.captureAudio === true) ? {
              autoGainControl: false,
              echoCancellation: false,
              noiseSuppression: false,
              channelCount: { ideal: 2 }
            } : false
          } as MediaStreamConstraints)
          
          // Verify we actually got audio tracks if requested
          if ((type === 'audio' || layer.config.captureAudio === true) && stream.getAudioTracks().length === 0) {
            console.warn(`[BroadcastPage] getDisplayMedia returned no audio tracks for ${layer.name}. Isolation might be preventing capture of this specific window type.`)
            throw new Error('No audio tracks in stream')
          }
        } catch (err) {
          const isNoAudio = err instanceof Error && (err.message.includes('No audio tracks') || err.name === 'NotReadableError')
          const needsAudio = type === 'audio' || layer.config.captureAudio === true
          const isWindowSource = effectiveSourceId.startsWith('window:')
          const errorMessage = err instanceof Error ? err.message : String(err)
          
          if (isNoAudio && needsAudio) {
            if (isWindowSource) {
              console.warn(`[BroadcastPage] Window audio isolation is unavailable for ${layer.name}; refusing to fall back to whole-computer audio.`)

              if (type === 'display') {
                await window.api.studio.prepareDisplayCapture({
                  sourceId: effectiveSourceId,
                  withAudio: false,
                  audioOnly: false
                })
                stream = await navigator.mediaDevices.getDisplayMedia({
                  video: {
                    width: { ideal: store.canvasWidth },
                    height: { ideal: store.canvasHeight },
                    frameRate: { ideal: 30 }
                  },
                  audio: false
                } as MediaStreamConstraints)
                store.updateLayer(activeScene.id, layerId, {
                  config: { ...layer.config, captureAudio: false }
                })
              } else {
                throw new Error('Window-specific audio capture is not available in this Electron path. Use a virtual cable/app audio capture source for that app, or capture system audio intentionally.')
              }
            } else {
              console.warn(`[BroadcastPage] Audio capture failed for ${layer.name} (${errorMessage}). Retrying with System Audio fallback...`)
              await window.api.studio.prepareDisplayCapture({
                sourceId: effectiveSourceId,
                withAudio: true,
                audioOnly: type === 'audio',
                forceLoopback: true
              })
              stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                  width: { ideal: store.canvasWidth },
                  height: { ideal: store.canvasHeight },
                  frameRate: { ideal: 30 }
                },
                audio: true
              } as MediaStreamConstraints)
            }
          } else {
            throw err
          }
        }
        
        if (type === 'audio' && layer.config.audioOnlyDisplayCapture) {
          stream.getVideoTracks().forEach(track => {
            track.stop()
            stream.removeTrack(track)
          })
        }
      } else {
        const constraints = type === 'camera'
          ? buildCameraConstraints(layer, devices)
          : { audio: buildRawAudioConstraints(layer.config.deviceId) }

        console.log(`[BroadcastPage] Initializing mic capture for ${layer.name}. DeviceId: ${layer.config.deviceId || 'default'}`)
        stream = await navigator.mediaDevices.getUserMedia(constraints)
        
        const audioTracks = stream.getAudioTracks()
        if (audioTracks.length === 0) {
          console.error(`[BroadcastPage] Mic getUserMedia returned NO audio tracks for ${layer.name}`)
        } else {
          const track = audioTracks[0]
          console.log(`[BroadcastPage] Mic track active: ${track.label}, Enabled: ${track.enabled}, State: ${track.readyState}`)
          
          // Ensure track is enabled and monitor it
          track.enabled = true
          track.onended = () => {
            console.warn(`[BroadcastPage] Mic track ENDED for ${layer.name}: ${track.label}. Retrying in 2s...`)
            // Clear signature so it can be re-initialized
            lastMediaSignatures.current[layerId] = ''
            setTimeout(() => {
              // Only retry if still in scene
              const stillExists = store.scenes.some(s => s.layers.some(l => l.id === layerId))
              if (stillExists) void initMedia(layer, 0, signature)
            }, 2000)
          }
          
          // Store in global registry for AudioMixer and useBroadcastAudio
          if (!(window as any).__ilyMicStreams) (window as any).__ilyMicStreams = {}
          ;(window as any).__ilyMicStreams[layerId] = stream
          
          cleanupFns.push(() => {
            if ((window as any).__ilyMicStreams?.[layerId] === stream) {
              delete (window as any).__ilyMicStreams[layerId]
            }
          })
        }
      }

      const resolvedAudio = resolveCameraAudioDeviceId(layer, devices)
      const el = document.createElement(type === 'audio' ? 'audio' : 'video')
      const outputStream =
        (type === 'camera' || type === 'display') && layer.config.stabilize !== false
          ? createStabilizedCameraStream(
              stream,
              type === 'camera'
                ? getCameraTarget(layer)
                : { width: store.canvasWidth, height: store.canvasHeight, fps: 30 },
              layer.name
            )
          : {
              stream,
              cleanup: () => stream.getTracks().forEach(t => t.stop())
            }

      cleanupFns.push(outputStream.cleanup)
      el.srcObject = outputStream.stream
      el.autoplay = true
      if (el instanceof HTMLVideoElement) {
        el.playsInline = true
        el.setAttribute('playsinline', '')
      }
      el.muted = true 
      await el.play().catch(e => console.error(`Failed to play ${type} stream`, e))
      
      const managed = el as ManagedMediaElement
      managed.__ilySignature = signature
      managed.__ilyRawStream = stream
      lastMediaSignatures.current[layerId] = signature
      managed.__ilyCleanup = () => cleanupFns.splice(0).forEach(cleanup => cleanup())
      
      if (existing) {
        disposeMediaElement(existing)
      }
      
      videoRefs.current[layerId] = managed as any
      setStreamReady(c => c + 1)
    } catch (err) {
      console.error(`[BroadcastPage] Failed to init ${type} ${layer.name}: ${err}`)
      if (lastMediaSignatures.current[layerId] === signature) {
        delete lastMediaSignatures.current[layerId]
      }
      if (attempt < 3 && (type === 'camera' || type === 'display') && isTransientMediaError(err)) {
        const delay = 1000 * (attempt + 1)
        window.setTimeout(() => void initMedia(layer, attempt + 1), delay)
      }
    } finally {
      pendingMedia.current.delete(layerId)
    }
  }
  const forceRefreshMedia = () => {
    Object.values(videoRefs.current).forEach(el => disposeMediaElement(el as ManagedMediaElement))
    videoRefs.current = {}
    pendingMedia.current.clear()
    activeScene.layers
      .filter(layer => layer.type === 'display')
      .forEach(layer => sessionDisplaySourceIds.current.add(layer.id))
    setStreamReady(c => c + 1)
    activeScene.layers.forEach(layer => {
      const canInitDisplay = layer.type === 'display' && sessionDisplaySourceIds.current.has(layer.id)
      if (layer.type === 'camera' || layer.type === 'audio' || canInitDisplay) {
        void initMedia(layer)
      }
    })
  }

  const mediaConfigs = useMemo(() => {
    return activeScene.layers
      .filter(l => l.type === 'camera' || l.type === 'display' || l.type === 'audio')
      .map(l => `${l.id}:${getMediaSignature(l, devices)}`)
      .join('|')
  }, [activeScene.layers, devices, store.aspectRatio])

  useEffect(() => {
    if (!activeScene) return
    // 1. Cleanup stale audio sources
    store.audioSources.forEach(source => {
      if (source.type === 'layer') {
        const layer = activeScene.layers.find(l => l.id === source.id)
        if (!layer || layer.config.audioMixerHidden) {
          store.removeAudioSource(source.id)
        }
      }
    })

    // 2. Sync active layers to mixer
    activeScene.layers.forEach(layer => {
      if (
        (layer.type === 'camera' || layer.type === 'display' || layer.type === 'audio') &&
        !layer.config.audioMixerHidden
      ) {
        const existing = store.audioSources.find(s => s.id === layer.id)
        const resolvedId = layer.type === 'camera' 
          ? resolveCameraAudioDeviceId(layer, devices) 
          : layer.config.deviceId

        if (!existing) {
          store.updateAudioSource(layer.id, {
            id: layer.id,
            name: layer.name || `Audio: ${layer.type}`,
            volume: 0.8,
            muted: false,
            monitoring: false,
            type: layer.type === 'audio' 
              ? (layer.config.audioOnlyDisplayCapture ? 'system' : 'mic') 
              : 'layer',
            channelMode: (layer.type === 'camera' || (layer.type === 'audio' && layer.config.audioOnlyDisplayCapture)) ? 'stereo' : 'mono',
            deviceId: resolvedId
          })
        } else if (resolvedId && (!existing.deviceId || existing.deviceId === 'match')) {
          // If we found a device ID later (e.g. after labels loaded), update it
          store.updateAudioSource(layer.id, { deviceId: resolvedId })
        }
      }
    })
  }, [activeScene.id, devices, store.audioSources.length])

  useEffect(() => {
    if (!activeScene) return
    
    activeScene.layers.forEach(layer => {
      const sig = getMediaSignature(layer, devices)
      const lastSig = lastMediaSignatures.current[layer.id]
      const hasChanged = sig !== lastSig
      
      const canInitDisplay = layer.type === 'display' && (sessionDisplaySourceIds.current.has(layer.id) || !!layer.config.desktopSourceName)
      const canInitMedia = layer.type === 'camera' || layer.type === 'audio' || canInitDisplay

      const isHardware = layer.type === 'camera' || layer.type === 'audio'
      if (canInitMedia && hasChanged && !pendingMedia.current.has(layer.id)) {
        if (isHardware && devices.length === 0) return
        
        console.log(`[BroadcastPage] Signature change for ${layer.name}: "${lastSig}" -> "${sig}"`)
        // Immediate lock to prevent double-init during render cycles
        lastMediaSignatures.current[layer.id] = sig
        void initMedia(layer, 0, sig)
      }
    })
  }, [mediaConfigs, activeScene.id, devices])

  useEffect(() => {
    if (!activeScene) return
    const activeIds = new Set(activeScene.layers.map(layer => layer.id))
    for (const [id, el] of Object.entries(videoRefs.current)) {
      if (activeIds.has(id)) continue
      disposeMediaElement(el as ManagedMediaElement)
      delete videoRefs.current[id]
      pendingMedia.current.delete(id)
    }
  }, [activeScene])

  const startBroadcast = async () => {
    setStreamError(null)
    let livePlatforms = platforms
    if (window.api?.platform) {
      const configs = await window.api.platform.getConfigs()
      livePlatforms = buildStreamPlatforms(configs)
      setPlatforms(livePlatforms)
    }
    if (!window.api?.streaming) {
      setStreamError('Streaming bridge is not available. Restart ilyStream.')
      return
    }

    const assignments = activeLayoutAssignments
    const destinations = (['horizontal', 'vertical'] as BroadcastLayoutId[]).flatMap(layout =>
      assignments[layout].map(platformId => ({
        layout,
        platform: livePlatforms.find(p => p.id === platformId)
      }))
    )

    if (destinations.length === 0) {
      const customReady = customRtmpUrl.trim() && customStreamKey.trim()
      if (customReady) {
        destinations.push({
          layout: store.aspectRatio === '9:16' ? 'vertical' : 'horizontal',
          platform: { id: 'custom', name: 'Custom RTMP', url: customRtmpUrl.trim(), key: customStreamKey.trim() }
        })
      } else {
        setStreamError('Assign at least one platform to Horizontal or Vertical before going live.')
        return
      }
    }

    const missing = destinations.find(destination => !destination.platform?.url || !destination.platform?.key)
    if (missing) {
      setStreamError(`${missing.platform?.name || 'Destination'} is missing an RTMP URL or stream key.`)
      return
    }
    const streamFps = 30
    const maxBitrateKbps = destinations.reduce((max, destination) => Math.max(max, destination.platform?.id === 'twitch' ? 3500 : 6000), 3500)
    setOutputConfig({ fps: streamFps, bitrateKbps: maxBitrateKbps })
    const horizontalInputFormat = await getOptimizedCaptureInputFormat(1920, 1080, streamFps, maxBitrateKbps * 1000)
    const verticalInputFormat = await getOptimizedCaptureInputFormat(1080, 1920, streamFps, maxBitrateKbps * 1000)
    setCaptureInputFormat(horizontalInputFormat)
    setLayoutInputFormats({ horizontal: horizontalInputFormat, vertical: verticalInputFormat })

    const results = await Promise.all(destinations.map(destination => {
      const platform = destination.platform!
      const bitrateKbps = platform.id === 'twitch' ? 3500 : 6000
      const isVertical = destination.layout === 'vertical'
      return window.api.streaming.start({
        outputId: `${destination.layout}:${platform.id}`,
        outputName: `${isVertical ? 'Vertical' : 'Horizontal'} ${platform.name}`,
        rtmpUrl: platform.url,
        streamKey: platform.key,
        width: isVertical ? 1080 : 1920,
        height: isVertical ? 1920 : 1080,
        fps: streamFps,
        bitrateKbps,
        inputFormat: isVertical ? verticalInputFormat : horizontalInputFormat,
        audioFormat: 'f32le',
        audioSampleRate: audioEngine.getContext().sampleRate
      })
    }))

    const failed = results.find((res: any) => !res.success)
    if (!failed) { setIsStreaming(true); setStatus('Live') }
    else {
      await window.api.streaming.stop()
      const message = failed.error || 'Could not start RTMP output'
      setStreamError(message)
      setStatus('Offline')
    }
  }

  const stopBroadcast = async () => {
    if (!window.api?.streaming) return
    await window.api.streaming.stop()
    setIsStreaming(false); setStatus('Offline'); setStreamError(null)
  }

  const startRecording = async () => {
    if (!window.api?.streaming) return
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const recordingFps = 30
    const recordingBitrateKbps = 12000
    setOutputConfig({ fps: recordingFps, bitrateKbps: recordingBitrateKbps })
    const inputFormat = await getOptimizedCaptureInputFormat(store.canvasWidth, store.canvasHeight, recordingFps, recordingBitrateKbps * 1000)
    setCaptureInputFormat(inputFormat)
    const res = await window.api.streaming.startRecording({
      width: store.canvasWidth, height: store.canvasHeight,
      fps: recordingFps, bitrateKbps: recordingBitrateKbps,
      outputPath: `${(process.env.USERPROFILE || process.env.HOME || '').replace(/\\/g, '/')}/Videos/ilyStream/Recordings/ilyStream_${timestamp}.mp4`,
      inputFormat,
      audioFormat: 'f32le',
      audioSampleRate: audioEngine.getContext().sampleRate
    })
    if (res.success) setIsRecording(true)
  }

  const stopRecording = async () => {
    if (!window.api?.streaming) return
    await window.api.streaming.stopRecording()
    setIsRecording(false)
  }

  const openProgramProjector = async () => {
    if (!window.api?.studio || !activeScene) return
    const monitorId = selectedMonitorId ?? monitors[0]?.id
    if (monitorId == null) return
    await window.api.studio.openProjector(monitorId, activeScene.id)
  }

  const toggleObsVirtualCamera = async () => {
    if (!window.api?.obs || !obsStatus?.connected) return
    const status = await window.api.obs.toggleVirtualCamera()
    setObsStatus(status)
  }

  const takeScreenshot = async () => {
    if (!canvasRef.current) return
    await canvasRef.current.takeScreenshot()
  }

  const handleAddSource = (type: LayerType, config: Record<string, any>, name?: string) => {
    if (!activeScene) return
    const defaultSize: Record<LayerType, { w: number; h: number }> = {
      camera: { w: 1920, h: 1080 }, widget: { w: 600, h: 400 },
      display: { w: 1920, h: 1080 },
      browser: { w: 800, h: 600 }, text: { w: 400, h: 80 }, image: { w: 400, h: 400 },
      audio: { w: 200, h: 60 }
    }
    const size = defaultSize[type]
    const layerId = crypto.randomUUID()
    if (type === 'display') {
      sessionDisplaySourceIds.current.add(layerId)
    }
    const selectedWidget = type === 'widget' ? widgetsById.get(config.widgetId) : undefined
    const widgetPreset = type === 'widget'
      ? resolveWidgetStudioPreset(selectedWidget, config, store.canvasWidth, store.canvasHeight)
      : null
    const layout = widgetPreset || {
      x: Math.round((store.canvasWidth - size.w) / 2),
      y: Math.round((store.canvasHeight - size.h) / 2),
      width: size.w,
      height: size.h,
      locked: false
    }
    const finalConfig = {
      ...config,
      ...(type === 'widget' ? { fps: config.fps ?? 8, widgetType: selectedWidget?.type } : {}),
      ...(widgetPreset?.config || {}),
      audioMixerHidden: false
    }
    
    store.addLayer(activeScene.id, {
      id: layerId,
      type, name: name || type, visible: true, locked: layout.locked,
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height,
      portraitX: (layout as any).portraitX,
      portraitY: (layout as any).portraitY,
      portraitWidth: (layout as any).portraitWidth,
      portraitHeight: (layout as any).portraitHeight,
      portraitLocked: (layout as any).portraitLocked,
      portraitVisible: true,
      opacity: 1,
      config: finalConfig
    } as any)

    if (type === 'camera' || type === 'display' || type === 'audio') {
      store.updateAudioSource(layerId, {
        id: layerId,
        name: name || `Audio: ${type}`,
        volume: 0.8,
        muted: false,
        monitoring: type === 'audio',
        type: type === 'audio' ? (config.audioOnlyDisplayCapture ? 'system' : 'mic') : 'layer',
        channelMode: type === 'audio' ? (config.audioOnlyDisplayCapture ? 'stereo' : 'mono') : 'stereo',
        deviceId: type === 'camera' ? config.audioDeviceId : config.deviceId
      })
    }
    
    setShowSourceModal(false)
  }

  const applyTransform = (layer: StudioLayer, type: 'fit' | 'fill' | 'stretch' | 'center') => {
    const isPortrait = store.aspectRatio === '9:16'
    const l = isPortrait ? { ...layer, width: layer.portraitWidth, height: layer.portraitHeight } : layer
    const cw = store.canvasWidth, ch = store.canvasHeight, lw = Number(l.width) || 1, lh = Number(l.height) || 1
    const lr = lw / lh, cr = cw / ch
    let u: any = {}
    if (type === 'stretch' || (type === 'fit' && isLikelyScreenBorderLayer(layer))) {
      u = { x: 0, y: 0, width: cw, height: ch, [isPortrait ? 'portraitCrop' : 'crop']: { top: 0, right: 0, bottom: 0, left: 0 } }
    }
    else if (type === 'center') u = { x: Math.round((cw - lw) / 2), y: Math.round((ch - lh) / 2) }
    else if (type === 'fit') {
      let nw, nh; if (lr > cr) { nw = cw; nh = cw / lr } else { nh = ch; nw = ch * lr }
      u = { x: Math.round((cw - nw) / 2), y: Math.round((ch - nh) / 2), width: Math.round(nw), height: Math.round(nh) }
    } else if (type === 'fill') {
      let nw, nh; if (lr < cr) { nw = cw; nh = cw / lr } else { nh = ch; nw = ch * lr }
      u = { x: Math.round((cw - nw) / 2), y: Math.round((ch - nh) / 2), width: Math.round(nw), height: Math.round(nh) }
    }
    store.saveHistory(); store.updateLayer(activeScene.id, layer.id, u)
  }

  if (!activeScene) return null

  return (
    <div 
      ref={pageRef}
      className="flex flex-col h-full overflow-hidden bg-black relative" 
      style={{ 
        '--mixer-height': isMixerCollapsed ? '48px' : `${mixerHeight}px`,
        '--sidebar-width': `${sidebarWidth}px`
      } as any}
    >
      <header className="shrink-0 px-6 py-4 flex items-center justify-between border-b border-white/[0.04] bg-[#080808]" style={{ WebkitAppRegion: 'drag' } as any}>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <Radio size={20} className={isStreaming ? 'text-success animate-pulse' : 'text-white/20'} />
            <span className="text-[12px] font-black uppercase tracking-[0.3em] text-white/60">Production Studio</span>
          </div>

          <div style={{ WebkitAppRegion: 'no-drag' } as any} className="flex bg-white/5 rounded-xl p-0.5 border border-white/10">
            <button onClick={() => setShowLeftSidebar(!showLeftSidebar)} className={`p-2.5 rounded-xl transition-all ${showLeftSidebar ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-white/30 hover:text-white'}`} title="Toggle Scenes">
              <Menu size={20} />
            </button>
            <div className="w-px h-6 bg-white/10 mx-2" />
            <Select
              value={broadcastLayoutMode}
              onChange={handleLayoutModeChange}
              options={[
                { value: 'horizontal', label: 'Landscape', icon: <Monitor size={15} /> },
                { value: 'vertical', label: 'Portrait', icon: <Smartphone size={15} /> },
                { value: 'dual', label: 'Dual', icon: <Layers size={15} /> }
              ]}
              className="w-40"
              buttonClassName="h-9 bg-black/30 border-white/5 rounded-xl px-3 hover:bg-black/50 transition-all ring-1 ring-white/5 text-[10px] font-black uppercase tracking-widest"
            />
          </div>
        </div>

        <div style={{ WebkitAppRegion: 'no-drag' } as any} className="flex items-center gap-3">
          <div className="flex bg-white/5 rounded-xl p-1 border border-white/10">
            <button onClick={() => store.undo()} disabled={store.past.length === 0} className="p-2 rounded-lg text-white/30 hover:text-white disabled:opacity-20 transition-all"><RotateCcw size={18} /></button>
            <button onClick={() => store.redo()} disabled={store.future.length === 0} className="p-2 rounded-lg text-white/30 hover:text-white disabled:opacity-20 transition-all"><RotateCw size={18} /></button>
          </div>

          <div className="flex bg-white/5 rounded-xl p-1 border border-white/10">
            <button onClick={takeScreenshot} className="p-2.5 rounded-lg text-white/30 hover:text-white hover:bg-white/5 transition-all" title="Take Screenshot">
              <Camera size={20} />
            </button>
            <div className="w-px h-6 bg-white/10 mx-2 self-center" />
            <button onClick={isRecording ? stopRecording : startRecording} className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all ${isRecording ? 'bg-red-500/20 text-red-400' : 'text-white/30 hover:text-white hover:bg-white/5'}`} title={isRecording ? 'Stop Recording' : 'Start Recording'}>
              <Circle size={16} className={isRecording ? 'fill-red-400 animate-pulse' : ''} />
              {isRecording && <span className="text-[13px] font-black tabular-nums">{formatTime(recordingTime)}</span>}
            </button>
          </div>

          <button 
            onClick={forceRefreshMedia}
            className="h-9 px-4 rounded-xl bg-white/5 border border-white/10 text-white/30 hover:text-white hover:bg-white/10 transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
            title="Force Hardware Refresh"
          >
            <RefreshCw size={14} /> Reset Cam
          </button>

          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-2 h-9">
            <Select
              value={selectedMonitorId?.toString() ?? ''}
              onChange={val => setSelectedMonitorId(Number(val))}
              options={monitors.map(monitor => ({ value: monitor.id.toString(), label: monitor.label }))}
              className="w-32"
              buttonClassName="h-7 bg-transparent border-0 px-2 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white"
            />
            <button
              onClick={openProgramProjector}
              disabled={!monitors.length}
              className="h-7 px-3 rounded-lg bg-white/5 text-white/40 hover:text-white hover:bg-white/10 disabled:opacity-20 transition-all flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest"
              title="Open clean program projector for OBS or TikTok Studio capture"
            >
              <Monitor size={13} /> Project
            </button>
          </div>

          <button
            onClick={toggleObsVirtualCamera}
            disabled={!obsStatus?.connected}
            className={`h-9 px-4 rounded-xl border transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest disabled:opacity-25 disabled:cursor-not-allowed ${obsStatus?.virtualCameraActive ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' : 'bg-white/5 border-white/10 text-white/35 hover:text-white hover:bg-white/10'}`}
            title={obsStatus?.connected ? 'Toggle OBS Virtual Camera' : 'Connect OBS in Settings to control its virtual camera'}
          >
            <Video size={14} /> OBS Cam
          </button>

          <LayoutPlatformPicker
            layout="horizontal"
            label="Horizontal"
            icon={<Monitor size={14} />}
            platforms={platforms}
            selectedIds={layoutAssignments.horizontal}
            blockedIds={layoutAssignments.vertical}
            disabled={broadcastLayoutMode !== 'dual' && broadcastLayoutMode !== 'horizontal'}
            isStreaming={isStreaming}
            onToggle={toggleLayoutAssignment}
            onRemove={removeLayoutAssignment}
          />
          <LayoutPlatformPicker
            layout="vertical"
            label="Vertical"
            icon={<Smartphone size={14} />}
            platforms={platforms}
            selectedIds={layoutAssignments.vertical}
            blockedIds={layoutAssignments.horizontal}
            disabled={broadcastLayoutMode !== 'dual' && broadcastLayoutMode !== 'vertical'}
            isStreaming={isStreaming}
            onToggle={toggleLayoutAssignment}
            onRemove={removeLayoutAssignment}
          />

          {assignedStreamCount === 0 && (
            <div className="flex items-center gap-2">
              <input
                value={customRtmpUrl}
                onChange={e => setCustomRtmpUrl(e.target.value)}
                placeholder="rtmp://server/app"
                className="h-9 w-44 rounded-xl bg-white/5 border border-white/10 px-3 text-[11px] font-bold text-white/70 placeholder:text-white/20 outline-none focus:border-accent/40"
              />
              <input
                value={customStreamKey}
                onChange={e => setCustomStreamKey(e.target.value)}
                placeholder="Stream key"
                type="password"
                className="h-9 w-36 rounded-xl bg-white/5 border border-white/10 px-3 text-[11px] font-bold text-white/70 placeholder:text-white/20 outline-none focus:border-accent/40"
              />
            </div>
          )}

          {isStreaming ? (
            <button onClick={stopBroadcast} className="h-9 px-5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/30 transition-all flex items-center gap-2">
              <Square size={12} /> End
            </button>
          ) : (
            <button onClick={startBroadcast} disabled={assignedStreamCount === 0 && (!customRtmpUrl.trim() || !customStreamKey.trim())} className="h-9 px-6 rounded-xl bg-accent text-white text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all flex items-center gap-2 shadow-lg shadow-accent/20 disabled:opacity-30 disabled:cursor-not-allowed">
              <Play size={12} /> Go Live
            </button>
          )}

          <button onClick={() => setShowRightSidebar(!showRightSidebar)} className={`ml-3 p-3 rounded-xl border transition-all ${showRightSidebar ? 'bg-accent/10 border-accent/30 text-accent shadow-lg shadow-accent/20' : 'bg-white/5 border-white/10 text-white/30'}`}>
            {showRightSidebar ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>
      </header>

      {streamError && (
        <div className="shrink-0 border-b border-red-500/20 bg-red-500/10 px-6 py-3 text-[12px] font-bold text-red-200">
          {streamError}
        </div>
      )}

      <div className="flex-1 flex min-h-0 bg-black">
        {showLeftSidebar && (
          <div className="w-64 shrink-0 border-r border-white/[0.04] flex flex-col bg-[#050505] animate-in slide-in-from-left duration-300">
            <div className="px-5 py-5 flex items-center justify-between border-b border-white/[0.02] bg-white/[0.01]">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-white/30">Scenes</h3>
              <button onClick={() => store.addScene(`Scene ${store.scenes.length + 1}`)} className="text-accent hover:text-white transition-colors">
                <Plus size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
              {store.scenes.map(scene => (
                <button
                  key={scene.id}
                  onClick={() => store.setActiveScene(scene.id)}
                  onDoubleClick={() => { setEditingSceneId(scene.id); setEditingSceneName(scene.name) }}
                  onContextMenu={(e) => { e.preventDefault(); setSceneContextMenu({ x: e.clientX, y: e.clientY, sceneId: scene.id }) }}
                  className={`w-full text-left px-4 py-4 rounded-xl text-[13px] font-black transition-all ${store.activeSceneId === scene.id ? 'bg-accent text-white shadow-xl shadow-accent/20 translate-x-1' : 'text-white/20 hover:text-white/40 hover:bg-white/5'}`}
                >
                  {editingSceneId === scene.id ? (
                    <input
                      value={editingSceneName}
                      onChange={e => setEditingSceneName(e.target.value)}
                      onBlur={() => { store.renameScene(scene.id, editingSceneName); setEditingSceneId(null) }}
                      onKeyDown={e => { if (e.key === 'Enter') { store.renameScene(scene.id, editingSceneName); setEditingSceneId(null) }; if (e.key === 'Escape') setEditingSceneId(null) }}
                      onClick={e => e.stopPropagation()}
                      onMouseDown={e => e.stopPropagation()}
                      className="w-full bg-transparent text-[13px] font-black text-white outline-none border-b border-accent/50"
                      autoFocus
                    />
                  ) : scene.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#080808] p-6 overflow-hidden">
          <CanvasEditor 
            activeScene={activeScene} 
            isStreaming={isStreaming} 
            isRecording={isRecording} 
            captureInputFormat={captureInputFormat} 
            outputFps={outputConfig.fps} 
            outputBitrateKbps={outputConfig.bitrateKbps} 
            outputCodec={pickAvcCodecString(store.canvasWidth, store.canvasHeight, outputConfig.fps)}
            videoRefs={videoRefs} 
            streamReady={streamReady} 
            streamOutputs={activeCanvasStreamOutputs}
            previewMode={broadcastLayoutMode === 'dual' ? 'dual' : 'single'}
            ref={canvasRef} 
          />
        </div>

        {showRightSidebar && (
          <div className="flex shrink-0 min-h-0 bg-[#050505] relative animate-in slide-in-from-right duration-300" style={{ width: 'var(--sidebar-width)' }}>
            <div 
              onPointerDown={() => setIsResizingSidebar(true)}
              className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/40 transition-all z-50 group"
            >
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-12 bg-white/5 group-hover:bg-accent/40 rounded-r-lg flex items-center justify-center transition-all">
                <div className="w-0.5 h-4 bg-white/20" />
              </div>
            </div>
            
            <div className="flex-1 flex flex-col min-h-0 min-w-0 border-l border-white/[0.04]">
            <div className="flex flex-col min-h-0 h-1/2">
            <div className="px-5 py-5 flex items-center justify-between border-b border-white/[0.02] bg-white/[0.01]">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-white/30">Sources</h3>
                <button onClick={() => setShowSourceModal(true)} className="text-accent hover:text-white transition-colors"><Plus size={20} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                {(() => { const reversed = [...activeScene.layers].reverse(); return reversed.map((layer, visIdx) => {
                  const Icon = LAYER_TYPE_ICONS[layer.type] || Layers
                  const isSelected = store.selectedLayerId === layer.id
                  const isPortrait = store.aspectRatio === '9:16'
                  const isVisible = isPortrait ? (layer.portraitVisible ?? layer.visible) : layer.visible
                  const isLocked = isPortrait ? (layer.portraitLocked ?? layer.locked) : layer.locked

                  return (
                    <div
                      key={layer.id}
                      draggable
                      onDragStart={() => setDragSourceIdx(visIdx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragSourceIdx === null || dragSourceIdx === visIdx) return
                        const total = reversed.length
                        const draggedLayer = reversed[dragSourceIdx]
                        if (!draggedLayer) return
                        store.reorderLayer(activeScene.id, draggedLayer.id, total - 1 - visIdx)
                        setDragSourceIdx(null)
                      }}
                      onDragEnd={() => setDragSourceIdx(null)}
                      className={dragSourceIdx === visIdx ? 'opacity-40' : ''}
                    >
                      <div
                        onClick={() => store.setSelectedLayer(isSelected ? null : layer.id)}
                        onContextMenu={(e) => { e.preventDefault(); setSourceContextMenu({ x: e.clientX, y: e.clientY, layer }) }}
                        className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all border cursor-pointer ${isSelected ? 'bg-accent/10 border-accent/20 text-white shadow-xl shadow-accent/10' : 'bg-transparent border-transparent text-white/30 hover:bg-white/5'}`}
                      >
                        <Move size={14} className="text-white/10 cursor-grab shrink-0" />
                        <Icon size={18} className={isSelected ? 'text-accent' : ''} />
                        <span className="flex-1 text-[13px] font-black truncate text-left">{layer.name}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (isPortrait) {
                                store.updateLayer(activeScene.id, layer.id, { portraitLocked: !isLocked })
                              } else {
                                store.updateLayer(activeScene.id, layer.id, { locked: !isLocked })
                              }
                            }}
                            className="p-1.5 hover:bg-white/10 rounded-md transition-colors group"
                            title={isLocked ? "Unlock Layer" : "Lock Layer"}
                          >
                            {isLocked ? (
                              <Lock size={14} className="text-amber-500/80 group-hover:text-amber-400" />
                            ) : (
                              <Unlock size={14} className="text-white/40 group-hover:text-white/80" />
                            )}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (isPortrait) {
                                store.updateLayer(activeScene.id, layer.id, { portraitVisible: !isVisible })
                              } else {
                                store.updateLayer(activeScene.id, layer.id, { visible: !isVisible })
                              }
                            }}
                            className="p-1.5 hover:bg-white/10 rounded-md transition-colors group"
                            title={isVisible ? "Hide Layer" : "Show Layer"}
                          >
                            {isVisible ? (
                              <Eye size={14} className="text-white/40 group-hover:text-white/80" />
                            ) : (
                              <EyeOff size={14} className="text-red-500/80 group-hover:text-red-400" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                }) })()}
              </div>
            </div>

            {selectedLayer && (
              <div className="flex-1 min-h-0 border-t border-white/[0.04] overflow-y-auto custom-scrollbar">
                <LayerProperties layer={selectedLayer} sceneId={activeScene.id} widgets={widgets} devices={devices} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>

      <div 
        className="absolute bottom-0 left-0 right-0 overflow-hidden border-t border-white/[0.08] bg-[#030303] shadow-[0_-25px_60px_rgba(0,0,0,0.9)] flex flex-col z-[100]"
        style={{ height: 'var(--mixer-height)' }}
      >
        <div 
          onPointerDown={() => setIsResizingMixer(true)}
          className={`absolute top-0 inset-x-0 h-4 cursor-ns-resize hover:bg-accent/35 transition-all flex items-start justify-center group z-[110] ${isMixerCollapsed ? 'pointer-events-none opacity-0' : ''}`}
        >
          <div className="mt-1 w-32 h-1.5 bg-white/10 group-hover:bg-white/60 rounded-full transition-all" />
        </div>

        <div className="absolute top-0 right-6 h-12 flex items-center z-[120]">
          <button 
            onClick={() => setIsMixerCollapsed(!isMixerCollapsed)}
            className="p-2 rounded-lg bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all"
            title={isMixerCollapsed ? "Expand Mixer" : "Collapse Mixer"}
          >
            {isMixerCollapsed ? <ChevronRight className="-rotate-90" size={16} /> : <ChevronRight className="rotate-90" size={16} />}
          </button>
        </div>
        
        <AudioMixer activeScene={activeScene} videoRefs={videoRefs} devices={devices} streamReady={streamReady} />
      </div>

      <AddSourceModal open={showSourceModal} onClose={() => setShowSourceModal(false)} onAdd={handleAddSource} widgets={widgets} devices={devices} />

      {sourceContextMenu && (
        <ContextMenu x={sourceContextMenu.x} y={sourceContextMenu.y} onClose={() => setSourceContextMenu(null)} items={[
          { id: 'fit', label: 'Fit to Screen', icon: <Maximize size={18} />, onClick: () => applyTransform(sourceContextMenu.layer, 'fit') },
          { id: 'fill', label: 'Fill Screen', icon: <Square size={18} />, onClick: () => applyTransform(sourceContextMenu.layer, 'fill') },
          { id: 'stretch', label: 'Stretch to Screen', icon: <Move size={18} />, onClick: () => applyTransform(sourceContextMenu.layer, 'stretch') },
          { id: 'center', label: 'Center Layer', icon: <Crosshair size={18} />, onClick: () => applyTransform(sourceContextMenu.layer, 'center') },
          { id: 'div1', label: '', divider: true },
          { id: 'duplicate', label: 'Duplicate', icon: <Plus size={18} />, onClick: () => store.duplicateLayer(activeScene.id, sourceContextMenu.layer.id) },
          { id: 'copy', label: 'Copy', icon: <Copy size={18} />, onClick: () => store.copyLayer(activeScene.id, sourceContextMenu.layer.id) },
          { id: 'delete', label: 'Delete', icon: <Trash2 size={18} />, danger: true, onClick: () => store.removeLayer(activeScene.id, sourceContextMenu.layer.id) }
        ]} />
      )}

      {sceneContextMenu && (
        <ContextMenu x={sceneContextMenu.x} y={sceneContextMenu.y} onClose={() => setSceneContextMenu(null)} items={[
          { id: 'rename', label: 'Rename', icon: <Pencil size={18} />, onClick: () => { const scene = store.scenes.find(s => s.id === sceneContextMenu.sceneId); if (scene) { setEditingSceneId(scene.id); setEditingSceneName(scene.name) } } },
          { id: 'duplicate', label: 'Duplicate', icon: <Copy size={18} />, onClick: () => store.duplicateScene(sceneContextMenu.sceneId) },
          { id: 'div1', label: '', divider: true },
          { id: 'delete', label: 'Delete', icon: <Trash2 size={18} />, danger: true, disabled: store.scenes.length <= 1, onClick: () => store.removeScene(sceneContextMenu.sceneId) }
        ]} />
      )}
    </div>
  )
}

function isLikelyScreenBorderLayer(layer: StudioLayer): boolean {
  const haystack = `${layer.name || ''} ${layer.config?.widgetType || ''} ${layer.config?.type || ''}`.toLowerCase()
  return haystack.includes('screen border') || haystack.includes('screen-border')
}
