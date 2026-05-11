import { useCallback, useEffect, useRef, useState } from 'react'
import { createDistortionCurve } from '../lib/audio-effects'

type MeterState = {
  inputLevel: number
  outputLevel: number
  peakLevel: number
  isClipping: boolean
}

const SILENT_METER: MeterState = {
  inputLevel: 0,
  outputLevel: 0,
  peakLevel: 0,
  isClipping: false
}

const MIC_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: { ideal: 1 },
  sampleRate: { ideal: 48000 }
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

const createFilter = (
  context: AudioContext,
  type: BiquadFilterType,
  frequency: number,
  q = 0.707,
  gain = 0
) => {
  const filter = context.createBiquadFilter()
  filter.type = type
  filter.frequency.value = frequency
  filter.Q.value = q
  filter.gain.value = gain
  return filter
}

const connectChain = (source: AudioNode, nodes: AudioNode[]) => {
  let lastNode = source
  nodes.forEach((node) => {
    lastNode.connect(node)
    lastNode = node
  })
  return lastNode
}

const createLfo = (
  context: AudioContext,
  destination: AudioParam,
  frequency: number,
  depth: number,
  type: OscillatorType = 'sine'
) => {
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = type
  oscillator.frequency.value = frequency
  gain.gain.value = depth
  oscillator.connect(gain)
  gain.connect(destination)
  oscillator.start()
  return oscillator
}

const createCompressor = (context: AudioContext, threshold: number, ratio: number, attack: number, release: number) => {
  const compressor = context.createDynamicsCompressor()
  compressor.threshold.value = threshold
  compressor.knee.value = 12
  compressor.ratio.value = ratio
  compressor.attack.value = attack
  compressor.release.value = release
  return compressor
}

const createMicConditioner = (context: AudioContext, source: AudioNode) => {
  const highPass = createFilter(context, 'highpass', 75, 0.8)
  const bodyTamer = createFilter(context, 'lowshelf', 180, 0.707, -2)
  const clarity = createFilter(context, 'peaking', 3200, 1.1, 2.5)
  const compressor = createCompressor(context, -24, 3, 0.004, 0.16)
  return connectChain(source, [highPass, bodyTamer, clarity, compressor])
}

const createLimiter = (context: AudioContext) => {
  const limiter = context.createDynamicsCompressor()
  limiter.threshold.value = -4
  limiter.knee.value = 0
  limiter.ratio.value = 18
  limiter.attack.value = 0.002
  limiter.release.value = 0.08
  return limiter
}

const createDryWetMix = (
  context: AudioContext,
  drySource: AudioNode,
  wetSource: AudioNode,
  dryLevel: number,
  wetLevel: number
) => {
  const output = context.createGain()
  const dryGain = context.createGain()
  const wetGain = context.createGain()
  dryGain.gain.value = dryLevel
  wetGain.gain.value = wetLevel
  drySource.connect(dryGain)
  wetSource.connect(wetGain)
  dryGain.connect(output)
  wetGain.connect(output)
  return output
}

const createDelayEffect = (
  context: AudioContext,
  input: AudioNode,
  delayTime: number,
  feedbackAmount: number,
  filterFrequency: number,
  wetLevel: number
) => {
  const delay = context.createDelay(2)
  const feedback = context.createGain()
  const feedbackFilter = createFilter(context, 'lowpass', filterFrequency, 0.8)
  delay.delayTime.value = delayTime
  feedback.gain.value = feedbackAmount

  input.connect(delay)
  delay.connect(feedbackFilter)
  feedbackFilter.connect(feedback)
  feedback.connect(delay)

  return createDryWetMix(context, input, delay, 0.92, wetLevel)
}

const createLiveVoiceEffect = (context: AudioContext, input: AudioNode, effectId: string | null) => {
  switch (effectId) {
    case 'alien': {
      const wobble = context.createDelay(0.04)
      wobble.delayTime.value = 0.012
      createLfo(context, wobble.delayTime, 6.5, 0.004)
      const nasal = createFilter(context, 'peaking', 1900, 8, 12)
      const glass = createFilter(context, 'peaking', 3600, 10, 9)
      const wet = connectChain(input, [wobble, nasal, glass])
      return createDryWetMix(context, input, wet, 0.42, 0.82)
    }

    case 'robot': {
      const modulatedGain = context.createGain()
      modulatedGain.gain.value = 0.68
      createLfo(context, modulatedGain.gain, 42, 0.28, 'square')
      const distortion = context.createWaveShaper()
      distortion.curve = createDistortionCurve(85)
      distortion.oversample = '4x'
      const bandPass = createFilter(context, 'bandpass', 1050, 1.4)
      return connectChain(input, [modulatedGain, distortion, bandPass])
    }

    case 'monster': {
      const lowShelf = createFilter(context, 'lowshelf', 220, 0.707, 9)
      const lowPass = createFilter(context, 'lowpass', 850, 0.9)
      const growl = context.createWaveShaper()
      growl.curve = createDistortionCurve(38)
      growl.oversample = '2x'
      const makeup = context.createGain()
      makeup.gain.value = 0.86
      return connectChain(input, [lowShelf, lowPass, growl, makeup])
    }

    case 'chipmunk': {
      const highPass = createFilter(context, 'highpass', 560, 0.8)
      const sparkle = createFilter(context, 'peaking', 3900, 1.2, 8)
      const tightener = context.createDelay(0.02)
      tightener.delayTime.value = 0.005
      createLfo(context, tightener.delayTime, 8, 0.0012)
      return connectChain(input, [highPass, sparkle, tightener])
    }

    case 'radio': {
      const highPass = createFilter(context, 'highpass', 360, 0.8)
      const lowPass = createFilter(context, 'lowpass', 3200, 0.9)
      const mid = createFilter(context, 'peaking', 1450, 1.4, 7)
      const grit = context.createWaveShaper()
      grit.curve = createDistortionCurve(18)
      grit.oversample = '2x'
      const trim = context.createGain()
      trim.gain.value = 0.82
      return connectChain(input, [highPass, lowPass, mid, grit, trim])
    }

    case 'echo':
      return createDelayEffect(context, input, 0.42, 0.42, 2600, 0.46)

    case 'telephone': {
      const highPass = createFilter(context, 'highpass', 480, 0.9)
      const lowPass = createFilter(context, 'lowpass', 3350, 0.9)
      const bite = createFilter(context, 'peaking', 1350, 1.8, 6)
      const grit = context.createWaveShaper()
      grit.curve = createDistortionCurve(12)
      return connectChain(input, [highPass, lowPass, bite, grit])
    }

    case 'cave':
      return createDelayEffect(context, input, 0.16, 0.32, 1200, 0.38)

    case 'vibrato': {
      const delay = context.createDelay(0.04)
      delay.delayTime.value = 0.01
      createLfo(context, delay.delayTime, 5.4, 0.0045)
      return createDryWetMix(context, input, delay, 0.3, 0.92)
    }

    case 'megaphone': {
      const highPass = createFilter(context, 'highpass', 430, 0.9)
      const lowPass = createFilter(context, 'lowpass', 5400, 0.8)
      const horn = createFilter(context, 'peaking', 1900, 1.3, 10)
      const edge = context.createWaveShaper()
      edge.curve = createDistortionCurve(34)
      edge.oversample = '4x'
      const trim = context.createGain()
      trim.gain.value = 0.76
      return connectChain(input, [highPass, lowPass, horn, edge, trim])
    }

    case 'underwater': {
      const lowPass = createFilter(context, 'lowpass', 620, 2.4)
      createLfo(context, lowPass.frequency, 0.55, 170)
      const muffler = createFilter(context, 'lowshelf', 180, 0.707, 5)
      return connectChain(input, [lowPass, muffler])
    }

    default:
      return input
  }
}

const readAnalyserLevel = (analyser: AnalyserNode, buffer: Float32Array) => {
  analyser.getFloatTimeDomainData(buffer)

  let sumSquares = 0
  let peak = 0
  for (const sample of buffer) {
    const absSample = Math.abs(sample)
    sumSquares += sample * sample
    peak = Math.max(peak, absSample)
  }

  const rms = Math.sqrt(sumSquares / buffer.length)
  const db = rms > 0 ? 20 * Math.log10(rms) : -100
  return {
    level: clamp01((db + 58) / 48),
    peak
  }
}

const formatMicError = (error: unknown) => {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return 'Microphone permission was denied.'
    if (error.name === 'NotFoundError') return 'No microphone was found.'
    if (error.name === 'NotReadableError') return 'The microphone is already in use by another app.'
    return error.message || 'Could not open the microphone.'
  }
  return 'Could not open the microphone.'
}

export function useVoiceFX() {
  const [isEnabled, setIsEnabled] = useState(false)
  const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null)
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [volume, setVolume] = useState(0.8)
  const [isAudioActive, setIsAudioActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [meter, setMeter] = useState<MeterState>(SILENT_METER)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const monitorGainRef = useRef<GainNode | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const inputAnalyserRef = useRef<AnalyserNode | null>(null)
  const outputAnalyserRef = useRef<AnalyserNode | null>(null)
  const inputBufferRef = useRef<Float32Array | null>(null)
  const outputBufferRef = useRef<Float32Array | null>(null)
  const meterFrameRef = useRef<number | null>(null)
  const lastMeterUpdateRef = useRef(0)
  const streamRef = useRef<MediaStream | null>(null)
  const isMonitoringRef = useRef(isMonitoring)
  const volumeRef = useRef(volume)
  const runIdRef = useRef(0)
  const activeEffectId = isEnabled ? selectedEffectId : null

  const stopMetering = useCallback(() => {
    if (meterFrameRef.current !== null) {
      cancelAnimationFrame(meterFrameRef.current)
      meterFrameRef.current = null
    }
    lastMeterUpdateRef.current = 0
    setMeter(SILENT_METER)
  }, [])

  const startMetering = useCallback(() => {
    stopMetering()

    const tick = () => {
      const inputAnalyser = inputAnalyserRef.current
      const outputAnalyser = outputAnalyserRef.current
      if (!inputAnalyser || !outputAnalyser) return

      if (!inputBufferRef.current || inputBufferRef.current.length !== inputAnalyser.fftSize) {
        inputBufferRef.current = new Float32Array(inputAnalyser.fftSize)
      }
      if (!outputBufferRef.current || outputBufferRef.current.length !== outputAnalyser.fftSize) {
        outputBufferRef.current = new Float32Array(outputAnalyser.fftSize)
      }

      const now = performance.now()
      if (now - lastMeterUpdateRef.current > 33) {
        const input = readAnalyserLevel(inputAnalyser, inputBufferRef.current)
        const output = readAnalyserLevel(outputAnalyser, outputBufferRef.current)
        const peakLevel = Math.max(input.peak, output.peak)
        setMeter({
          inputLevel: input.level,
          outputLevel: output.level,
          peakLevel,
          isClipping: peakLevel > 0.97
        })
        lastMeterUpdateRef.current = now
      }

      meterFrameRef.current = requestAnimationFrame(tick)
    }

    tick()
  }, [stopMetering])

  const stopAudio = useCallback(() => {
    runIdRef.current += 1
    stopMetering()

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (micSourceRef.current) {
      micSourceRef.current.disconnect()
      micSourceRef.current = null
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      void audioCtxRef.current.close()
    }

    audioCtxRef.current = null
    monitorGainRef.current = null
    masterGainRef.current = null
    inputAnalyserRef.current = null
    outputAnalyserRef.current = null
    inputBufferRef.current = null
    outputBufferRef.current = null
    setIsAudioActive(false)
  }, [stopMetering])

  const startAudio = useCallback(async () => {
    stopAudio()
    const runId = runIdRef.current

    try {
      setError(null)

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: MIC_AUDIO_CONSTRAINTS,
        video: false
      })

      if (runIdRef.current !== runId) {
        stream.getTracks().forEach(track => track.stop())
        return
      }

      const context = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 })
      audioCtxRef.current = context
      streamRef.current = stream

      const source = context.createMediaStreamSource(stream)
      micSourceRef.current = source

      const inputAnalyser = context.createAnalyser()
      inputAnalyser.fftSize = 1024
      inputAnalyser.smoothingTimeConstant = 0.72
      source.connect(inputAnalyser)
      inputAnalyserRef.current = inputAnalyser

      const conditionedMic = createMicConditioner(context, source)
      const effectedMic = activeEffectId ? createLiveVoiceEffect(context, conditionedMic, activeEffectId) : conditionedMic
      const limiter = createLimiter(context)
      const outputAnalyser = context.createAnalyser()
      outputAnalyser.fftSize = 1024
      outputAnalyser.smoothingTimeConstant = 0.64

      const masterGain = context.createGain()
      masterGain.gain.value = volumeRef.current
      masterGainRef.current = masterGain

      const monitorGain = context.createGain()
      monitorGain.gain.value = isMonitoringRef.current ? 1 : 0
      monitorGainRef.current = monitorGain

      effectedMic.connect(limiter)
      limiter.connect(masterGain)
      masterGain.connect(outputAnalyser)
      outputAnalyser.connect(monitorGain)
      monitorGain.connect(context.destination)
      outputAnalyserRef.current = outputAnalyser

      if (context.state === 'suspended') {
        await context.resume()
      }

      if (runIdRef.current !== runId) {
        stream.getTracks().forEach(track => track.stop())
        if (audioCtxRef.current === context) {
          audioCtxRef.current = null
        }
        if (streamRef.current === stream) {
          streamRef.current = null
        }
        if (context.state !== 'closed') {
          void context.close()
        }
        return
      }

      startMetering()
      setIsAudioActive(true)
    } catch (err) {
      console.error('[VoiceFX] Failed to start audio:', err)
      if (runIdRef.current === runId) {
        setError(formatMicError(err))
        stopAudio()
      }
    }
  }, [activeEffectId, startMetering, stopAudio])

  const shouldRunAudio = isEnabled || isMonitoring

  useEffect(() => {
    if (shouldRunAudio) {
      void startAudio()
    } else {
      stopAudio()
    }

    return () => stopAudio()
  }, [shouldRunAudio, startAudio, stopAudio])

  useEffect(() => {
    volumeRef.current = volume
    const context = audioCtxRef.current
    const masterGain = masterGainRef.current
    if (context && masterGain) {
      masterGain.gain.setTargetAtTime(volume, context.currentTime, 0.03)
    }
  }, [volume])

  useEffect(() => {
    isMonitoringRef.current = isMonitoring
    const context = audioCtxRef.current
    const monitorGain = monitorGainRef.current
    if (context && monitorGain) {
      monitorGain.gain.setTargetAtTime(isMonitoring ? 1 : 0, context.currentTime, 0.025)
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
    setVolume,
    isAudioActive,
    inputLevel: meter.inputLevel,
    outputLevel: meter.outputLevel,
    peakLevel: meter.peakLevel,
    isClipping: meter.isClipping,
    error
  }
}
