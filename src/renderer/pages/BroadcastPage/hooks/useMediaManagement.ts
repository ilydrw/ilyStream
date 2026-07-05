import { useEffect, useRef, useState, useCallback } from 'react'
import type { StudioLayer, StudioScene } from '../../../../shared/studio'
import {
  getMediaSignature,
  resolveCameraAudioDeviceId,
  disposeMediaElement,
  buildCameraConstraints,
  buildRawAudioConstraints,
  createStabilizedCameraStream,
  isTransientMediaError,
  type ManagedMediaElement
} from '../utils/media-init'

interface MediaManagementOptions {
  activeScene: StudioScene
  devices: MediaDeviceInfo[]
  canvasWidth: number
  canvasHeight: number
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>
  updateLayer: (sceneId: string, layerId: string, update: any) => void
  scenes: StudioScene[]
  addAudioSource: (id: string, config: any) => void
  removeAudioSource: (id: string) => void
  audioSources: any[]
  activeAspectRatios?: readonly ('16:9' | '9:16')[]
}

function layerShouldHaveMixerTrack(layer: StudioLayer): boolean {
  if (layer.type !== 'camera' && layer.type !== 'display' && layer.type !== 'audio') return false
  if (layer.config.audioMixerHidden) return false
  if (layer.config.audioDeviceId === 'none') return false
  if (layer.type === 'display' && layer.config.captureAudio !== true) return false
  return true
}

export function useMediaManagement(options: MediaManagementOptions) {
  const { 
    activeScene, devices, canvasWidth, canvasHeight, videoRefs, 
    updateLayer, scenes, addAudioSource, removeAudioSource, audioSources 
  } = options

  const [streamReady, setStreamReady] = useState(0)
  const pendingMedia = useRef(new Set<string>())
  const lastMediaSignatures = useRef<Record<string, string>>({})
  const sessionDisplaySourceIds = useRef(new Set<string>())
  const lastMediaInitTimes = useRef<Record<string, number>>({})
  const retryTimers = useRef<Record<string, any>>({})
  const activeSceneRef = useRef(activeScene)
  const layerAudioSignature = activeScene.layers
    .map(layer => `${layer.id}:${layer.name}:${layer.type}:${layer.config.deviceId || ''}:${layer.config.audioDeviceId || ''}:${layer.config.audioMixerHidden || ''}:${layer.config.captureAudio || ''}`)
    .join('|')

  useEffect(() => {
    activeSceneRef.current = activeScene
  }, [activeScene])

  const clearRetryTimer = useCallback((layerId: string) => {
    const timer = retryTimers.current[layerId]
    if (!timer) return
    window.clearTimeout(timer)
    delete retryTimers.current[layerId]
  }, [])

  const initMedia = useCallback(async (layer: StudioLayer, attempt = 0, passedSignature?: string) => {
    const { id: layerId, type } = layer
    if (type !== 'camera' && type !== 'display' && type !== 'audio') return

    const signature = passedSignature || getMediaSignature(layer, devices)
    const existing = videoRefs.current[layerId] as ManagedMediaElement | undefined
    
    const now = Date.now()
    const lastInit = lastMediaInitTimes.current[layerId] || 0
    if (now - lastInit < 2000 && attempt === 0) return

    if (pendingMedia.current.has(layerId) || (existing?.__ilySignature === signature && lastMediaSignatures.current[layerId] === signature)) {
      return
    }
    
    pendingMedia.current.add(layerId)
    lastMediaInitTimes.current[layerId] = now
    const cleanupFns: Array<() => void> = []
    // Declared outside the try so the catch block can also stop the stream's
    // tracks on failure.
    let stream: MediaStream | null = null

    try {

      if (type === 'display' || (type === 'audio' && layer.config.audioOnlyDisplayCapture)) {
        let effectiveSourceId = String(layer.config.desktopSourceId || '')
        const desktopSourceName = String(layer.config.desktopSourceName || '')

        if (desktopSourceName) {
          const sources = await window.api.studio.getDesktopSources()
          let match = sources.find((s: any) => s.name === desktopSourceName) ||
                      sources.find((s: any) => s.name.toLowerCase().includes(desktopSourceName.toLowerCase()))
          
          if (!match && desktopSourceName.toLowerCase().includes('spotify') && window.api?.studio?.findSpotifySource) {
            match = await window.api.studio.findSpotifySource()
          }

          if (match) {
            if (match.id !== effectiveSourceId) {
              effectiveSourceId = match.id
              sessionDisplaySourceIds.current.add(layerId)
              updateLayer(activeScene.id, layerId, { 
                config: { ...layer.config, desktopSourceId: match.id, desktopSourceName: match.name } 
              })
            } else {
              sessionDisplaySourceIds.current.add(layerId)
            }
          }
        }

        if (effectiveSourceId && window.api?.studio?.prepareDisplayCapture) {
          const prepared = await window.api.studio.prepareDisplayCapture({
            sourceId: effectiveSourceId,
            withAudio: type === 'audio' || layer.config.captureAudio === true,
            audioOnly: type === 'audio'
          })
          if (!prepared?.success) {
            throw new Error(prepared?.error || 'Could not prepare desktop capture')
          }
          await new Promise(resolve => setTimeout(resolve, 100))
        } else {
          throw new Error('Desktop source is not available')
        }

        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: { ideal: canvasWidth }, height: { ideal: canvasHeight }, frameRate: { ideal: 30 } },
          audio: (type === 'audio' || layer.config.captureAudio === true) ? {
            autoGainControl: false,
            echoCancellation: false,
            noiseSuppression: false,
            channelCount: { ideal: 2 },
            sampleRate: { ideal: 48000 },
            latency: { ideal: 0 }
          } : false
        } as any)
        
        if (type === 'audio' && layer.config.audioOnlyDisplayCapture) {
          stream!.getVideoTracks().forEach((track: MediaStreamTrack) => { track.stop(); stream!.removeTrack(track) })
        }
      } else {
        const constraints = type === 'camera'
          ? buildCameraConstraints(layer, devices)
          : { audio: buildRawAudioConstraints(layer.config.deviceId) }

        stream = await navigator.mediaDevices.getUserMedia(constraints)
        const audioTracks = stream.getAudioTracks()
        if (audioTracks.length > 0) {
          const track = audioTracks[0]
          // Diagnostic: surface the device that Chromium actually opened.
          // If this label doesn't match what the layer config asked for, the
          // deviceId resolution is wrong and the mic will be silent.
          try {
            const settings = track.getSettings()
            const matched = devices.find(d => d.deviceId === settings.deviceId)
            console.log(`[MediaManagement] ${type} layer "${layer.name}" opened track`, {
              requestedDeviceId: layer.config.deviceId,
              actualDeviceId: settings.deviceId,
              actualLabel: matched?.label || track.label,
              channelCount: settings.channelCount,
              sampleRate: settings.sampleRate
            })
          } catch {}
          track.enabled = true
          track.onended = () => {
            lastMediaSignatures.current[layerId] = ''
            setTimeout(() => {
              const currentLayer = activeSceneRef.current.layers.find(l => l.id === layerId)
              if (currentLayer) void initMedia(currentLayer, 0)
            }, 2000)
          }
          if (!(window as any).__ilyMicStreams) (window as any).__ilyMicStreams = {}
          ;(window as any).__ilyMicStreams[layerId] = stream
          cleanupFns.push(() => { if ((window as any).__ilyMicStreams?.[layerId] === stream) delete (window as any).__ilyMicStreams[layerId] })
        }
      }

      const el = document.createElement(type === 'audio' ? 'audio' : 'video')
      if (!stream) throw new Error(`No media stream returned for ${layer.name || type}`)
      const outputStream = (type === 'camera' || type === 'display') && layer.config.stabilize !== false
        ? createStabilizedCameraStream(stream, { width: canvasWidth, height: canvasHeight, fps: 30 }, layer.name)
        : { stream, cleanup: () => stream!.getTracks().forEach((t: MediaStreamTrack) => t.stop()) }

      cleanupFns.push(outputStream.cleanup)
      el.srcObject = outputStream.stream
      el.autoplay = true
      el.muted = true 

      // Critical: Chromium throttles or pauses video decoding if the element isn't in the DOM
      // or if it's deemed invisible (opacity 0 or 0.01). We must append it and make it opaque but hidden.
      Object.assign(el.style, {
        position: 'absolute',
        width: '1px',
        height: '1px',
        opacity: '1',
        zIndex: '-9999',
        pointerEvents: 'none'
      })
      document.body.appendChild(el)
      cleanupFns.push(() => { if (el.parentNode) el.parentNode.removeChild(el) })

      await el.play().catch(e => console.error(`Failed to play ${type} stream`, e))
      
      const managed = el as ManagedMediaElement
      managed.__ilySignature = signature
      managed.__ilyRawStream = stream
      lastMediaSignatures.current[layerId] = signature
      managed.__ilyCleanup = () => cleanupFns.splice(0).forEach(cleanup => cleanup())
      
      clearRetryTimer(layerId)
      if (existing) disposeMediaElement(existing)
      videoRefs.current[layerId] = managed as any
      setStreamReady(c => c + 1)
    } catch (err) {
      console.error(`[MediaManagement] Failed to init ${type} ${layer.name}: ${err}`)
      cleanupFns.splice(0).forEach(cleanup => cleanup())
      stream?.getTracks().forEach(track => track.stop())
      // Clear the signature so the useEffect can re-trigger init on the next
      // render. Some devices (e.g. cheap UVC webcams) routinely need several
      // open attempts before MediaFoundation hands back frames; the bounded
      // setTimeout retries below plus useEffect-driven retries are what made
      // these cameras work in the first place.
      if (lastMediaSignatures.current[layerId] === signature) delete lastMediaSignatures.current[layerId]
      if (attempt < 3 && isTransientMediaError(err)) {
        clearRetryTimer(layerId)
        retryTimers.current[layerId] = window.setTimeout(() => {
          delete retryTimers.current[layerId]
          const currentLayer = activeSceneRef.current.layers.find(l => l.id === layerId)
          if (!currentLayer) return
          void initMedia(currentLayer, attempt + 1, getMediaSignature(currentLayer, devices))
        }, 1000 * (attempt + 1))
      }
    } finally {
      pendingMedia.current.delete(layerId)
    }
  }, [activeScene.id, devices, canvasWidth, canvasHeight, updateLayer, scenes, videoRefs, clearRetryTimer])

  const forceRefreshMedia = useCallback(() => {
    Object.values(videoRefs.current).forEach(el => disposeMediaElement(el as ManagedMediaElement))
    videoRefs.current = {}
    pendingMedia.current.clear()
    Object.keys(retryTimers.current).forEach(clearRetryTimer)
    activeScene.layers.filter(l => l.type === 'display').forEach(l => sessionDisplaySourceIds.current.add(l.id))
    setStreamReady(c => c + 1)
    activeScene.layers.forEach(l => {
      if (l.type === 'camera' || l.type === 'audio' || (l.type === 'display' && sessionDisplaySourceIds.current.has(l.id))) void initMedia(l)
    })
  }, [activeScene.layers, initMedia, videoRefs, clearRetryTimer])

  useEffect(() => {
    if (!activeScene) return
    const activeLayerIds = new Set(activeScene.layers.map(layer => layer.id))

    for (const [layerId, el] of Object.entries(videoRefs.current)) {
      const layer = activeScene.layers.find(item => item.id === layerId)
      const nextSignature = layer ? getMediaSignature(layer, devices) : null
      const shouldDispose =
        !activeLayerIds.has(layerId) ||
        !layer ||
        (el as ManagedMediaElement).__ilySignature !== nextSignature

      if (!shouldDispose) continue

      clearRetryTimer(layerId)
      disposeMediaElement(el as ManagedMediaElement)
      delete videoRefs.current[layerId]
      delete lastMediaSignatures.current[layerId]
      pendingMedia.current.delete(layerId)
    }
  }, [activeScene, devices, videoRefs, clearRetryTimer])

  useEffect(() => {
    if (!activeScene) return
    activeScene.layers.forEach(layer => {
      const sig = getMediaSignature(layer, devices)
      const lastSig = lastMediaSignatures.current[layer.id]
      const canInitDisplay = layer.type === 'display' && (sessionDisplaySourceIds.current.has(layer.id) || !!layer.config.desktopSourceName)
      const canInitMedia = layer.type === 'camera' || layer.type === 'audio' || canInitDisplay
      if (canInitMedia && sig !== lastSig && !pendingMedia.current.has(layer.id)) {
        if ((layer.type === 'camera' || layer.type === 'audio') && devices.length === 0) return
        lastMediaSignatures.current[layer.id] = sig
        void initMedia(layer, 0, sig)
      }
    })
  }, [activeScene.id, devices, initMedia])

  useEffect(() => () => {
    Object.keys(retryTimers.current).forEach(clearRetryTimer)
    Object.values(videoRefs.current).forEach(el => disposeMediaElement(el as ManagedMediaElement))
    videoRefs.current = {}
    pendingMedia.current.clear()
    lastMediaSignatures.current = {}
  }, [videoRefs, clearRetryTimer])

  // Audio Mixer Sync
  useEffect(() => {
    if (!activeScene) return
    activeScene.layers.forEach(layer => {
      const isMediaLayer = layer.type === 'camera' || layer.type === 'display' || layer.type === 'audio'
      if (layerShouldHaveMixerTrack(layer)) {
        const existing = audioSources.find(s => s.id === layer.id)
        if (!existing) {
          addAudioSource(layer.id, {
            id: layer.id, name: layer.name || `Audio: ${layer.type}`, volume: 1.0, muted: false, monitoring: false,
            type: layer.type === 'audio' ? (layer.config.audioOnlyDisplayCapture ? 'system' : 'mic') : 'layer',
            channelMode: (layer.type === 'camera' || (layer.type === 'audio' && layer.config.audioOnlyDisplayCapture)) ? 'stereo' : 'mono',
            deviceId: layer.type === 'camera' ? resolveCameraAudioDeviceId(layer, devices) : layer.config.deviceId
          })
        } else {
          const nextDeviceId = layer.type === 'camera'
            ? resolveCameraAudioDeviceId(layer, devices)
            : layer.config.deviceId
          const nextType = layer.type === 'audio'
            ? (layer.config.audioOnlyDisplayCapture ? 'system' : 'mic')
            : 'layer'
          const nextChannelMode = (layer.type === 'camera' || (layer.type === 'audio' && layer.config.audioOnlyDisplayCapture))
            ? 'stereo'
            : 'mono'
          const updates: Record<string, unknown> = {}

          if (existing.name !== layer.name) updates.name = layer.name
          if (existing.deviceId !== nextDeviceId) updates.deviceId = nextDeviceId
          if (existing.type !== nextType) updates.type = nextType
          if (existing.channelMode !== nextChannelMode) updates.channelMode = nextChannelMode

          if (Object.keys(updates).length > 0) {
            addAudioSource(layer.id, updates)
          }
        }
      } else if (isMediaLayer) {
        if (audioSources.some(s => s.id === layer.id)) {
          removeAudioSource(layer.id)
        }
      }
    })
  }, [activeScene.id, devices, audioSources.length, layerAudioSignature])

  return { streamReady, forceRefreshMedia, initMedia }
}
