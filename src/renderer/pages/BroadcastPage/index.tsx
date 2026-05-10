import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import {IconSquare, IconArrowsMove, IconMaximize, IconCrosshair, IconPencil, IconCopy, IconTrash} from '@tabler/icons-react'
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
import { SceneSidebar } from './components/SceneSidebar'
import { SourceSidebar } from './components/SourceSidebar'
import { MixerContainer } from './components/MixerContainer'
import { useMediaManagement } from './hooks/useMediaManagement'

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
  const [layoutAssignments, setLayoutAssignments] = useState<Record<BroadcastLayoutId, string[]>>({ horizontal: [], vertical: [] })
  const [customRtmpUrl, setCustomRtmpUrl] = useState('')
  const [customStreamKey, setCustomStreamKey] = useState('')
  const [showSourceModal, setShowSourceModal] = useState(false)
  const [sourceContextMenu, setSourceContextMenu] = useState<{ x: number, y: number, layer: StudioLayer } | null>(null)
  const [sceneContextMenu, setSceneContextMenu] = useState<{ x: number, y: number, sceneId: string } | null>(null)
  const [captureInputFormat, setCaptureInputFormat] = useState<'h264' | 'mjpeg'>('h264')
  const [outputConfig, setOutputConfig] = useState({ fps: 30, bitrateKbps: 6000 })
  const [layoutInputFormats, setLayoutInputFormats] = useState<Record<BroadcastLayoutId, 'h264' | 'mjpeg'>>({ horizontal: 'h264', vertical: 'h264' })
  const [showLeftSidebar, setShowLeftSidebar] = useState(true)
  const [showRightSidebar, setShowRightSidebar] = useState(true)
  const [mixerHeight, setMixerHeight] = useState(280)
  const [isMixerCollapsed, setIsMixerCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(320)
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null)
  const [editingSceneName, setEditingSceneName] = useState('')
  const [isResizingMixer, setIsResizingMixer] = useState(false)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const videoRefs = useRef<Record<string, HTMLVideoElement>>({})
  const canvasRef = useRef<CanvasEditorHandle>(null)

  const activeScene = useMemo(() => store.scenes.find(s => s.id === store.activeSceneId) || store.scenes[0], [store.scenes, store.activeSceneId])
  const activeLayoutAssignments = useMemo(() => broadcastLayoutMode === 'horizontal' ? { horizontal: layoutAssignments.horizontal, vertical: [] } : broadcastLayoutMode === 'vertical' ? { horizontal: [], vertical: layoutAssignments.vertical } : layoutAssignments, [broadcastLayoutMode, layoutAssignments])
  const activeCanvasStreamOutputs = useMemo(() => [
    { id: 'horizontal' as const, active: isStreaming && activeLayoutAssignments.horizontal.length > 0, width: 1920, height: 1080, fps: outputConfig.fps, bitrateKbps: 6000, inputFormat: layoutInputFormats.horizontal, codec: pickAvcCodecString(1920, 1080, outputConfig.fps) },
    { id: 'vertical' as const, active: isStreaming && activeLayoutAssignments.vertical.length > 0, width: 1080, height: 1920, fps: outputConfig.fps, bitrateKbps: 6000, inputFormat: layoutInputFormats.vertical, codec: pickAvcCodecString(1080, 1920, outputConfig.fps) }
  ], [activeLayoutAssignments, isStreaming, layoutInputFormats, outputConfig.fps])

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
      if (window.api?.platform) setPlatforms(buildStreamPlatforms(await window.api.platform.getConfigs()))
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
    })()
  }, [])

  // Streaming Handlers
  const startBroadcast = async () => {
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

  const stopBroadcast = async () => { await window.api.streaming.stop(); setIsStreaming(false); setStatus('Offline') }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-black relative">
      <BroadcastHeader 
        isStreaming={isStreaming} isRecording={isRecording} recordingTime={isRecording ? `${Math.floor(recordingTime/60)}:${(recordingTime%60).toString().padStart(2,'0')}` : '00:00'} status={status}
        showLeftSidebar={showLeftSidebar} onToggleLeftSidebar={() => setShowLeftSidebar(!showLeftSidebar)} showRightSidebar={showRightSidebar} onToggleRightSidebar={() => setShowRightSidebar(!showRightSidebar)}
        broadcastLayoutMode={broadcastLayoutMode} onLayoutModeChange={m => { 
          setBroadcastLayoutMode(m as any); 
          store.setAspectRatio(m === 'vertical' || m === 'dual-portrait' ? '9:16' : '16:9') 
        }}
        undo={store.undo} redo={store.redo} canUndo={store.past.length > 0} canRedo={store.future.length > 0}
        onTakeScreenshot={() => canvasRef.current?.takeScreenshot()} onStartRecording={() => setIsRecording(true)} onStopRecording={() => setIsRecording(false)}
        onForceRefreshMedia={forceRefreshMedia} monitors={monitors} selectedMonitorId={selectedMonitorId} onSetSelectedMonitorId={setSelectedMonitorId}
        onOpenProjector={() => window.api.studio.openProjector(selectedMonitorId!, activeScene.id)} obsStatus={obsStatus} onToggleObsVirtualCamera={() => window.api.obs.toggleVirtualCamera()}
        platforms={platforms} layoutAssignments={layoutAssignments} onToggleLayoutAssignment={(l, id) => setLayoutAssignments(curr => ({ ...curr, [l]: curr[l].includes(id) ? curr[l].filter(i => i !== id) : [...curr[l], id] }))} onRemoveLayoutAssignment={(l, id) => setLayoutAssignments(curr => ({ ...curr, [l]: curr[l].filter(i => i !== id) }))}
        customRtmpUrl={customRtmpUrl} onCustomRtmpUrlChange={setCustomRtmpUrl} customStreamKey={customStreamKey} onCustomStreamKeyChange={setCustomStreamKey}
        onStartBroadcast={startBroadcast} onStopBroadcast={stopBroadcast}
      />

      <div className="flex-1 flex min-h-0 bg-black">
        {showLeftSidebar && <SceneSidebar scenes={store.scenes} activeSceneId={store.activeSceneId} onSelectScene={store.setActiveScene} onAddScene={store.addScene} onRenameScene={store.renameScene} onDuplicateScene={store.duplicateScene} onRemoveScene={store.removeScene} editingSceneId={editingSceneId} setEditingSceneId={setEditingSceneId} editingSceneName={editingSceneName} setEditingSceneName={setEditingSceneName} onContextMenu={(e, id) => setSceneContextMenu({ x: e.clientX, y: e.clientY, sceneId: id })} />}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#080808] p-6 overflow-hidden">
          <CanvasEditor activeScene={activeScene} isStreaming={isStreaming} isRecording={isRecording} captureInputFormat={captureInputFormat} outputFps={outputConfig.fps} outputBitrateKbps={outputConfig.bitrateKbps} videoRefs={videoRefs} streamReady={streamReady} streamOutputs={activeCanvasStreamOutputs} previewMode={broadcastLayoutMode} ref={canvasRef} />
        </div>
        {showRightSidebar && <SourceSidebar activeScene={activeScene} selectedLayerId={store.selectedLayerId} onSelectLayer={store.setSelectedLayer} onUpdateLayer={(id, u) => store.updateLayer(activeScene.id, id, u)} onReorderLayer={(id, i) => store.reorderLayer(activeScene.id, id, i)} onShowSourceModal={() => setShowSourceModal(true)} onContextMenu={(e, l) => setSourceContextMenu({ x: e.clientX, y: e.clientY, layer: l })} aspectRatio={store.aspectRatio} widgets={widgets} devices={devices} sidebarWidth={sidebarWidth} onSidebarResizeStart={() => setIsResizingSidebar(true)} />}
      </div>
 
      <MixerContainer isCollapsed={isMixerCollapsed} onToggleCollapse={() => setIsMixerCollapsed(!isMixerCollapsed)} mixerHeight={mixerHeight} onResizeStart={() => setIsResizingMixer(true)} activeScene={activeScene} videoRefs={videoRefs} devices={devices} streamReady={streamReady} />
      <AddSourceModal open={showSourceModal} onClose={() => setShowSourceModal(false)} onAdd={() => {}} widgets={widgets} devices={devices} />

      {sourceContextMenu && <ContextMenu x={sourceContextMenu.x} y={sourceContextMenu.y} onClose={() => setSourceContextMenu(null)} items={[{ id: 'fit', label: 'Fit to Screen', icon: <IconMaximize size={18} />, onClick: () => {} }, { id: 'delete', label: 'Delete', icon: <IconTrash size={18} />, danger: true, onClick: () => store.removeLayer(activeScene.id, sourceContextMenu.layer.id) }]} />}
      {sceneContextMenu && <ContextMenu x={sceneContextMenu.x} y={sceneContextMenu.y} onClose={() => setSceneContextMenu(null)} items={[{ id: 'rename', label: 'Rename', icon: <IconPencil size={18} />, onClick: () => { setEditingSceneId(sceneContextMenu.sceneId); setEditingSceneName(store.scenes.find(s => s.id === sceneContextMenu.sceneId)?.name || '') } }, { id: 'delete', label: 'Delete', icon: <IconTrash size={18} />, danger: true, onClick: () => store.removeScene(sceneContextMenu.sceneId) }]} />}
    </div>
  )
}
