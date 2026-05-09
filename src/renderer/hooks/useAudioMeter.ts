import { useEffect, useRef, useCallback } from 'react'

interface MeterData {
  rms: number
  peak: number
}

const audioCtx = typeof AudioContext !== 'undefined' ? new AudioContext() : null
const analysers = new Map<string, { analyser: AnalyserNode; source: MediaStreamAudioSourceNode }>()

export function useAudioMeter(
  sourceId: string,
  stream: MediaStream | null,
  muted: boolean
): { getMeter: () => MeterData } {
  const dataRef = useRef(new Float32Array(256))

  useEffect(() => {
    if (!audioCtx || !stream) return
    if (analysers.has(sourceId)) return

    const tracks = stream.getAudioTracks()
    if (tracks.length === 0) return

    try {
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.6
      source.connect(analyser)
      analysers.set(sourceId, { analyser, source })
    } catch {
      // Audio context or stream not ready
    }

    return () => {
      const entry = analysers.get(sourceId)
      if (entry) {
        entry.source.disconnect()
        analysers.delete(sourceId)
      }
    }
  }, [sourceId, stream])

  const getMeter = useCallback((): MeterData => {
    if (muted) return { rms: 0, peak: 0 }
    const entry = analysers.get(sourceId)
    if (!entry) return { rms: 0, peak: 0 }

    entry.analyser.getFloatTimeDomainData(dataRef.current)
    let sum = 0
    let peak = 0
    for (let i = 0; i < dataRef.current.length; i++) {
      const v = Math.abs(dataRef.current[i])
      sum += v * v
      if (v > peak) peak = v
    }
    const rms = Math.sqrt(sum / dataRef.current.length)
    return { rms: Math.min(rms * 3, 1), peak: Math.min(peak * 2, 1) }
  }, [sourceId, muted])

  return { getMeter }
}

export function getAnalyserForSource(sourceId: string): AnalyserNode | null {
  return analysers.get(sourceId)?.analyser ?? null
}
