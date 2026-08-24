import { useEffect, useRef } from 'react'
import { SoundPlaybackQueue } from '../lib/sound-playback-queue'
import { audioEngine } from '../utils/audio-engine'

interface SoundPlayAction {
  id?: string
  dataUrl?: string
  filePath?: string
  fileUrl?: string
  mimeType?: string
  volume?: number
  playbackMode?: 'queued' | 'overlap'
}

const activeSounds = new Set<HTMLAudioElement>()
const activeSoundCleanups = new Map<HTMLAudioElement, () => void>()

function getSoundboardBus(): AudioNode | null {
  return audioEngine.getSoundboardBus()
}

function stopActiveSounds(): void {
  for (const audio of [...activeSounds]) {
    try {
      audio.pause()
      audio.currentTime = 0
      const cleanup = activeSoundCleanups.get(audio)
      if (cleanup) {
        cleanup()
      } else {
        audio.removeAttribute('src')
        audio.load()
      }
    } catch (err) {
      console.warn('[sound] Failed to stop audio element:', err)
    }
  }
  activeSounds.clear()
}

export function useSoundPlayback() {
  const settingsRef = useRef<any>(null)

  useEffect(() => {
    if (!window.api?.settings?.getAll || !window.api?.on) return

    // Cache settings to avoid async races during sound playback
    const refreshSettings = async () => {
      try {
        const s = await window.api.settings.getAll()
        settingsRef.current = s
      } catch (error) {
        console.warn('[sound] Failed to load audio output settings:', error)
      }
    }
    refreshSettings()

    const unsubscribeSettings = window.api.on('settings:changed', (newSettings: any) => {
      settingsRef.current = newSettings
    })

    const playbackQueue = new SoundPlaybackQueue<SoundPlayAction>(
      (action, signal) => playSoundAction(action, settingsRef.current, signal),
      (error, action) => console.error('[sound] Queued playback failed:', action, error)
    )

    const removeListener = window.api.on('action:play-sound', (action: SoundPlayAction) => {
      if (action.playbackMode === 'overlap') {
        playbackQueue.playImmediately(action)
      } else {
        playbackQueue.enqueue(action)
      }
    })

    // Panic stop — fired by the Car Thing footer's Stop button (and anywhere
    // else that calls soundboardService.stopAll()). Halts every <audio> we
    // currently have spinning and clears the active set.
    const removeStopListener = window.api.on('action:stop-all-sounds', () => {
      playbackQueue.clear()
      stopActiveSounds()
      console.log('[sound] Stopped active sounds and cleared queued sounds')
    })

    return () => {
      removeListener()
      removeStopListener()
      unsubscribeSettings()
      playbackQueue.dispose()
      stopActiveSounds()
    }
  }, [])
}

async function playSoundAction(action: SoundPlayAction, settings: any, signal: AbortSignal): Promise<void> {
  const sources = resolveAudioSources(action)
  if (sources.length === 0) {
    console.error('[sound] Failed to play: no source', action)
    return
  }

  let lastError: unknown = null
  for (const source of sources) {
    if (signal.aborted) return

    try {
      await playAudioSource(source, action.volume, settings, signal)
      return
    } catch (error) {
      lastError = error
      console.warn('[sound] Source failed, trying fallback:', summarizeSource(source), error)
    }
  }

  if (!signal.aborted) {
    console.error('[sound] Playback failed for every source:', action, lastError)
  }
}

async function playAudioSource(
  source: string,
  volume: unknown,
  settings: any,
  signal: AbortSignal
): Promise<void> {
  if (signal.aborted) return

  const audio = new Audio(source)
  let sourceNode: MediaElementAudioSourceNode | null = null
  audio.crossOrigin = 'anonymous' // Prevent CORS issues when capturing stream
  audio.preload = 'auto'
  audio.volume = clampVolume(volume)

  // Ensure soundboard stream is initialized
  const context = audioEngine.getContext()
  const soundboardBus = getSoundboardBus()
  const broadcastBus = audioEngine.getBroadcastBus()

  if (context && soundboardBus) {
    try {
      sourceNode = context.createMediaElementSource(audio)
      sourceNode.connect(soundboardBus)
      
      // If the studio broadcast mixer is NOT active, we must connect directly to 
      // destination so that previews/tests are audible. If the mixer IS active,
      // it handles monitoring via the soundboard channel.
      if (!broadcastBus) {
        sourceNode.connect(context.destination)
      }
    } catch (err) {
      console.warn('[sound] Failed to route to soundboard bus (likely already connected):', err)
      // Fallback: If routing fails, we should still allow the audio to play
      // so the user hears something, though it might not reach the stream.
      audio.onplay = () => {
        if (!broadcastBus) {
          // If we can't hijack it, it plays to default destination anyway in most browsers
          // unless it's already connected to another node.
        }
      }
    }
  }

  if (settings?.audioOutputDeviceId && settings.audioOutputDeviceId !== 'default' && (audio as any).setSinkId) {
    try {
      await (audio as any).setSinkId(settings.audioOutputDeviceId)
    } catch (error) {
      console.warn('[sound] Failed to set sinkId, using default output:', error)
    }
  }

  if (signal.aborted) {
    audio.removeAttribute('src')
    audio.load()
    return
  }

  activeSounds.add(audio)

  return new Promise((resolve, reject) => {
    let started = false
    let settled = false

    const releaseAudio = () => {
      activeSounds.delete(audio)
      activeSoundCleanups.delete(audio)
      signal.removeEventListener('abort', cancelPlayback)
      audio.removeEventListener('ended', resolveOnce)
      audio.removeEventListener('error', handleError)
      try { sourceNode?.disconnect() } catch {}
      sourceNode = null
      audio.onplay = null
      try {
        audio.removeAttribute('src')
        audio.load()
      } catch {}
    }

    const resolveOnce = () => {
      if (settled) return
      settled = true
      releaseAudio()
      resolve()
    }

    const rejectOnce = (error: unknown) => {
      if (settled) return
      settled = true
      releaseAudio()
      reject(error)
    }

    function cancelPlayback() {
      try {
        audio.pause()
        audio.currentTime = 0
      } catch {}
      resolveOnce()
    }

    function handleError() {
      const error = audio.error
        ? new Error(`Audio error ${audio.error.code}: ${audio.error.message || 'unknown media failure'}`)
        : new Error('Unknown audio media failure')
      const playbackStarted = started || !audio.paused || audio.currentTime > 0

      if (!playbackStarted) {
        rejectOnce(error)
        return
      }

      console.error('[sound] Audio failed after playback started:', error)
      resolveOnce()
    }

    activeSoundCleanups.set(audio, cancelPlayback)
    signal.addEventListener('abort', cancelPlayback, { once: true })
    audio.addEventListener('ended', resolveOnce, { once: true })
    audio.addEventListener('error', handleError, { once: true })

    audio.play()
      .then(() => {
        if (settled) return
        const activeContext = audioEngine.getContext()
        if (activeContext?.state === 'suspended') {
          void activeContext.resume()
        }
        started = true
        console.log('[sound] Playing (stream-routed):', summarizeSource(source))
      })
      .catch((err) => {
        console.error('[sound] Play promise rejected:', err)
        rejectOnce(err)
      })
  })
}

function resolveAudioSources(action: SoundPlayAction): string[] {
  const sources = [
    action.dataUrl,
    action.id ? toAssetAudioUrl(action.id) : '',
    action.fileUrl,
    action.filePath
  ].filter((source): source is string => Boolean(source && source.trim()))

  return Array.from(new Set(sources))
}

function toAssetAudioUrl(id: string): string {
  const encodedPath = id
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/')

  return `asset:///${encodedPath}`
}

function summarizeSource(source: string): string {
  if (source.startsWith('data:')) return source.slice(0, 48) + '...'
  return source
}

function clampVolume(value: unknown): number {
  const numericValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numericValue)) return 1
  return Math.min(Math.max(numericValue, 0), 1)
}
