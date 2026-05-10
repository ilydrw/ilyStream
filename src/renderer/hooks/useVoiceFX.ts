import { useState, useEffect, useRef, useCallback } from 'react'
import { applyVoiceEffects } from '../lib/audio-effects'

export function useVoiceFX() {
  const [isEnabled, setIsEnabled] = useState(false)
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null)
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [volume, setVolume] = useState(0.8)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const effectNodeRef = useRef<AudioNode | null>(null)
  const monitorGainRef = useRef<GainNode | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stopAudio = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (micSourceRef.current) {
      micSourceRef.current.disconnect()
      micSourceRef.current = null
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close()
      audioCtxRef.current = null
    }
  }, [])

  const startAudio = useCallback(async () => {
    try {
      stopAudio()
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      
      const context = new AudioContext()
      audioCtxRef.current = context
      
      const source = context.createMediaStreamSource(stream)
      micSourceRef.current = source
      
      const masterGain = context.createGain()
      masterGain.gain.value = volume
      masterGainRef.current = masterGain
      
      const monitorGain = context.createGain()
      monitorGain.gain.value = isMonitoring ? 1.0 : 0
      monitorGainRef.current = monitorGain
      
      let processedNode: AudioNode = source
      if (isEnabled && selectedEffectId) {
        processedNode = applyVoiceEffects(context, source, { id: selectedEffectId, enabled: true })
      }
      
      processedNode.connect(masterGain)
      masterGain.connect(monitorGain)
      monitorGain.connect(context.destination)
      
      effectNodeRef.current = processedNode
    } catch (err) {
      console.error('[VoiceFX] Failed to start audio:', err)
    }
  }, [isEnabled, selectedEffectId, isMonitoring, volume, stopAudio])

  useEffect(() => {
    if (isEnabled) {
      startAudio()
    } else {
      stopAudio()
    }
    return () => stopAudio()
  }, [isEnabled, startAudio, stopAudio])

  // Update volume without restarting if possible
  useEffect(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.setTargetAtTime(volume, audioCtxRef.current?.currentTime ?? 0, 0.1)
    }
  }, [volume])

  // Update monitoring without restarting
  useEffect(() => {
    if (monitorGainRef.current) {
      monitorGainRef.current.gain.setTargetAtTime(isMonitoring ? 1.0 : 0, audioCtxRef.current?.currentTime ?? 0, 0.1)
    }
  }, [isMonitoring])

  return {
    isEnabled,
    setIsEnabled,
    selectedEffectId,
    setSelectedEffectId,
    isMonitoring,
    setIsMonitoring,
    volume,
    setVolume
  }
}
