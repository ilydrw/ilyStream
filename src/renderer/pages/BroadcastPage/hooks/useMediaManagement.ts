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

    try {
      let stream: MediaStream

      if (type === 'display' || (type === 'audio' && layer.config.audioOnlyDisplayCapture)) {
        let effectiveSourceId = String(layer.config.desktopSourceId || '')
        const desktopSourceName = String(layer.config.desktopSourceName || '')

        if (desktopSourceName) {
          const sources = await window.api.studio.getDesktopSources()
          let match = sources.find(s => s.name === desktopSourceName) || 
                      sources.find(s => s.name.toLowerCase().includes(desktopSourceName.toLowerCase()))
          
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
            autoGainControl: false, echoCancellation: false, noiseSuppression: false, channelCount: { ideal: 2 }
          } : false
        } as any)
        
        if (type === 'audio' && layer.config.audioOnlyDisplayCapture) {
          stream.getVideoTracks().forEach(track => { track.stop(); stream.removeTrack(track) })
        }
      } else {
        const constraints = type === 'camera'
          ? buildCameraConstraints(layer, devices)
          : { audio: buildRawAudioConstraints(layer.config.deviceId) }

        stream = await navigator.mediaDevices.getUserMedia(constraints)
        const audioTracks = stream.getAudioTracks()
        if (audioTracks.length > 0) {
          const track = audioTracks[0]
          track.enabled = true
          track.onended = () => {
            lastMediaSignatures.current[layerId] = ''
            setTimeout(() => {
              if (scenes.some(s => s.layers.some(l => l.id === layerId))) void initMedia(layer, 0)
            }, 2000)
          }
          if (!(window as any).__ilyMicStreams) (window as any).__ilyMicStreams = {}
          ;(window as any).__ilyMicStreams[layerId] = stream
          cleanupFns.push(() => { if ((window as any).__ilyMicStreams?.[layerId] === stream) delete (window as any).__ilyMicStreams[layerId] })
        }
      }

      const el = document.createElement(type === 'audio' ? 'audio' : 'video')
      const outputStream = (type === 'camera' || type === 'display') && layer.config.stabilize !== false
        ? createStabilizedCameraStream(stream, { width: canvasWidth, height: canvasHeight, fps: 30 }, layer.name)
        : { stream, cleanup: () => stream.getTracks().forEach(t => t.stop()) }

      cleanupFns.push(outputStream.cleanup)
      el.srcObject = outputStream.stream
      el.autoplay = true
      el.muted = true 
      await el.play().catch(e => console.error(`Failed to play ${type} stream`, e))
      
      const managed = el as ManagedMediaElement
      managed.__ilySignature = signature
      managed.__ilyRawStream = stream
      lastMediaSignatures.current[layerId] = signature
      managed.__ilyCleanup = () => cleanupFns.splice(0).forEach(cleanup => cleanup())
      
      if (existing) disposeMediaElement(existing)
      videoRefs.current[layerId] = managed as any
      setStreamReady(c => c + 1)
    } catch (err) {
      console.error(`[MediaManagement] Failed to init ${type} ${layer.name}: ${err}`)
      if (lastMediaSignatures.current[layerId] === signature) delete lastMediaSignatures.current[layerId]
      if (attempt < 3 && isTransientMediaError(err)) {
        setTimeout(() => void initMedia(layer, attempt + 1), 1000 * (attempt + 1))
      }
    } finally {
      pendingMedia.current.delete(layerId)
    }
  }, [activeScene.id, devices, canvasWidth, canvasHeight, updateLayer, scenes, videoRefs])

  const forceRefreshMedia = useCallback(() => {
    Object.values(videoRefs.current).forEach(el => disposeMediaElement(el as ManagedMediaElement))
    videoRefs.current = {}
    pendingMedia.current.clear()
    activeScene.layers.filter(l => l.type === 'display').forEach(l => sessionDisplaySourceIds.current.add(l.id))
    setStreamReady(c => c + 1)
    activeScene.layers.forEach(l => {
      if (l.type === 'camera' || l.type === 'audio' || (l.type === 'display' && sessionDisplaySourceIds.current.has(l.id))) void initMedia(l)
    })
  }, [activeScene.layers, initMedia, videoRefs])

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

  // Audio Mixer Sync
  useEffect(() => {
    if (!activeScene) return
    activeScene.layers.forEach(layer => {
      if ((layer.type === 'camera' || layer.type === 'display' || layer.type === 'audio') && !layer.config.audioMixerHidden) {
        const existing = audioSources.find(s => s.id === layer.id)
        if (!existing) {
          addAudioSource(layer.id, {
            id: layer.id, name: layer.name || `Audio: ${layer.type}`, volume: 0.8, muted: false, monitoring: false,
            type: layer.type === 'audio' ? (layer.config.audioOnlyDisplayCapture ? 'system' : 'mic') : 'layer',
            channelMode: (layer.type === 'camera' || (layer.type === 'audio' && layer.config.audioOnlyDisplayCapture)) ? 'stereo' : 'mono',
            deviceId: layer.type === 'camera' ? resolveCameraAudioDeviceId(layer, devices) : layer.config.deviceId
          })
        }
      }
    })
  }, [activeScene.id, devices, audioSources.length])

  return { streamReady, forceRefreshMedia, initMedia }
}
