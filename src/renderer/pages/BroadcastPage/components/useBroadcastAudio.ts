import { useEffect, useRef } from 'react'
import { useStudioStore } from '../../../stores/studio-store'
import type { AudioSource } from '../../../../shared/studio'
import { reconcileFxChain } from '../../../utils/audio-fx'
import { audioEngine, createChannelModeStage, sanitizeChannelMode, type ChannelModeStage } from '../../../utils/audio-engine'
import { buildLowLatencyAudioConstraints } from '../utils/media-init'

const MASTER_VOLUME_UPDATE_FPS = 30
const MASTER_VOLUME_UPDATE_INTERVAL_MS = 1000 / MASTER_VOLUME_UPDATE_FPS

interface TrackNodes {
  channelMode: ChannelModeStage
  gain: GainNode
  programMonitorSend: GainNode
  panner: StereoPannerNode
  fxInput: GainNode
  fxOutput: GainNode
  monitorGain: GainNode
  monitorSource: 'direct-mic' | 'post-fader' | null
  fxNodes: any[]
  _sourceNode?: { node: AudioNode; stream?: MediaStream; type: 'stream' | 'bus' }
}

function hasLiveAudioTrack(stream?: MediaStream | null): stream is MediaStream {
  return Boolean(stream?.getAudioTracks().some(track => track.readyState === 'live'))
}

function getSharedMicStream(id: string): MediaStream | undefined {
  const stream = (window as any).__ilyMicStreams?.[id] as MediaStream | undefined
  if (stream && !hasLiveAudioTrack(stream)) {
    delete (window as any).__ilyMicStreams[id]
    return undefined
  }
  return stream
}

function setSharedMicStream(id: string, stream: MediaStream): void {
  if (!(window as any).__ilyMicStreams) (window as any).__ilyMicStreams = {}
  ;(window as any).__ilyMicStreams[id] = stream
}

function clearSharedMicStream(id: string, stream?: MediaStream): void {
  if (!stream || (window as any).__ilyMicStreams?.[id] === stream) {
    const streams = (window as any).__ilyMicStreams
    if (streams) delete streams[id]
  }
}

function shouldUseDirectMicMonitor(source: AudioSource): boolean {
  return source.type === 'mic' && !(source.filters || []).some(filter => filter.enabled)
}

export function useBroadcastAudio(
  outputActive: boolean,
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>,
  streamReady: number = 0,
  enabled: boolean = true
) {
  const masterBus = useStudioStore(s => s.masterBus)
  const audioSources = useStudioStore(s => s.audioSources)
  const activeSceneId = useStudioStore(s => s.activeSceneId)
  const activeScene = useStudioStore(s => s.scenes.find(scene => scene.id === s.activeSceneId))
  const smoothingFactor = useStudioStore(s => s.audioReactivity?.smoothing ?? 0.6)
  const smoothingRef = useRef(smoothingFactor)

  useEffect(() => {
    smoothingRef.current = smoothingFactor
  }, [smoothingFactor])

  const audioCtxRef = useRef<AudioContext | null>(null)
  const masterInputRef = useRef<GainNode | null>(null)
  const broadcastLimiterRef = useRef<DynamicsCompressorNode | null>(null)
  const outputSilencerRef = useRef<GainNode | null>(null)
  const masterMonitorMixerRef = useRef<GainNode | null>(null)
  const programMonitorMixerRef = useRef<GainNode | null>(null)
  const mainMixMonitorGainRef = useRef<GainNode | null>(null)
  const processorRef = useRef<AudioWorkletNode | null>(null)
  const sampleCountRef = useRef<number>(0)
  const tracksRef = useRef<Map<string, TrackNodes>>(new Map())
  const standaloneMicStreamsRef = useRef<Record<string, MediaStream>>({})
  const pendingStandaloneMicsRef = useRef<Set<string>>(new Set())
  const masterFxRef = useRef<{ input: GainNode; output: GainNode; nodes: any[] } | null>(null)
  const masterMeterRef = useRef<{
    splitter: ChannelSplitterNode
    analyserL: AnalyserNode
    analyserR: AnalyserNode
  } | null>(null)

  // 1. Permanent Pipeline Setup
  // Keep the WebAudio mixer alive while the studio is open so monitoring and
  // virtual sources such as TTS work before the stream/record buttons are on.
  useEffect(() => {
    if (!enabled) return

    const ctx = audioEngine.getContext()
    audioCtxRef.current = ctx

    const masterInput = ctx.createGain()
    masterInputRef.current = masterInput
    audioEngine.setBroadcastBus(masterInput)
    console.log('[useBroadcastAudio] Permanent mixer graph initialized. Broadcast bus set in AudioEngine.')

    const broadcastHeadroom = ctx.createGain()
    broadcastHeadroom.gain.value = 0.82

    // Broadcast safety limiter — sits at the end of the chain to catch true
    // peaks that would clip on Twitch's transcoder. DynamicsCompressorNode is
    // not a true look-ahead limiter, so the previous (-3 dB / ratio 20 / 2 ms)
    // settings caused audible pumping any time TTS / soundboard / alerts
    // overlapped. New settings act as a soft safety net: no audible action
    // until peaks reach -1 dBFS (which the 0.82 headroom gain rarely permits),
    // then a moderate ratio to prevent over-clamping.
    const broadcastLimiter = ctx.createDynamicsCompressor()
    broadcastLimiter.threshold.value = -1.0
    broadcastLimiter.knee.value = 6
    broadcastLimiter.ratio.value = 12
    broadcastLimiter.attack.value = 0.003
    broadcastLimiter.release.value = 0.05

    const outputSilencer = ctx.createGain()
    outputSilencer.gain.value = 0
    outputSilencer.connect(ctx.destination)

    const masterMonitorMixer = ctx.createGain()
    masterMonitorMixer.gain.value = 1.0 // Always open, controlled by individual track monitorGains

    const programMonitorMixer = ctx.createGain()
    programMonitorMixer.gain.value = 1.0

    const mainMixMonitorGain = ctx.createGain()
    mainMixMonitorGain.gain.value = 0 // Controls whether the ENTIRE MIX is in the headphones

    const mFxInput = ctx.createGain()
    const mFxOutput = ctx.createGain()
    masterInput.connect(mFxInput)
    mFxOutput.connect(broadcastHeadroom)
    broadcastHeadroom.connect(broadcastLimiter)

    const masterMeterSplitter = ctx.createChannelSplitter(2)
    const masterMeterAnalyserL = ctx.createAnalyser()
    const masterMeterAnalyserR = ctx.createAnalyser()
    masterMeterAnalyserL.fftSize = 512
    masterMeterAnalyserL.smoothingTimeConstant = 0.4
    masterMeterAnalyserR.fftSize = 512
    masterMeterAnalyserR.smoothingTimeConstant = 0.4
    mFxOutput.connect(masterMeterSplitter)
    masterMeterSplitter.connect(masterMeterAnalyserL, 0)
    masterMeterSplitter.connect(masterMeterAnalyserR, 1)
    masterMeterAnalyserL.connect(outputSilencer)
    masterMeterAnalyserR.connect(outputSilencer)
    masterMeterRef.current = {
      splitter: masterMeterSplitter,
      analyserL: masterMeterAnalyserL,
      analyserR: masterMeterAnalyserR
    }
    audioEngine.setMasterMeterNodes({ left: masterMeterAnalyserL, right: masterMeterAnalyserR })

    // Setup Audio Analyzer for Reactivity
    const masterAnalyzer = ctx.createAnalyser()
    masterAnalyzer.fftSize = 256
    mFxOutput.connect(masterAnalyzer)
    const freqData = new Uint8Array(masterAnalyzer.frequencyBinCount)
    let smoothedVolume = 0
    let analyzeFrameId: number
    let lastVolumeUpdateAt = 0
    const updateVolume = (timestamp = performance.now()) => {
      if (!audioCtxRef.current) return
      if (timestamp - lastVolumeUpdateAt < MASTER_VOLUME_UPDATE_INTERVAL_MS) {
        analyzeFrameId = requestAnimationFrame(updateVolume)
        return
      }
      lastVolumeUpdateAt = timestamp

      const currentSmoothing = smoothingRef.current
      masterAnalyzer.getByteFrequencyData(freqData)
      let sum = 0
      for (let i = 0; i < freqData.length; i++) sum += freqData[i]

      const rawVolume = (sum / freqData.length) / 255.0
      smoothedVolume = (smoothedVolume * currentSmoothing) + (rawVolume * (1 - currentSmoothing))

      ;(window as any).__masterVolume = smoothedVolume
      analyzeFrameId = requestAnimationFrame(updateVolume)
    }
    updateVolume()

    // Routing to Headphones. The program monitor mix is separate from the
    // broadcast limiter path so local monitoring does not inherit limiter
    // latency or pumping from the stream encoder chain.
    programMonitorMixer.connect(mainMixMonitorGain)
    mainMixMonitorGain.connect(masterMonitorMixer)
    masterMonitorMixer.connect(ctx.destination)

    masterFxRef.current = { input: mFxInput, output: mFxOutput, nodes: [] }
    broadcastLimiterRef.current = broadcastLimiter
    outputSilencerRef.current = outputSilencer
    masterMonitorMixerRef.current = masterMonitorMixer
    programMonitorMixerRef.current = programMonitorMixer
    mainMixMonitorGainRef.current = mainMixMonitorGain

    console.log('[useBroadcastAudio] Mixer graph ready.')

    return () => {
      cancelAnimationFrame(analyzeFrameId)
      if (processorRef.current) {
        try { broadcastLimiterRef.current?.disconnect(processorRef.current) } catch {}
        try { processorRef.current.disconnect() } catch {}
        processorRef.current = null
      }
      for (const nodes of tracksRef.current.values()) {
        try { nodes._sourceNode?.node?.disconnect() } catch {}
        nodes.channelMode.disconnect()
        try { nodes.gain.disconnect() } catch {}
        try { nodes.programMonitorSend.disconnect() } catch {}
        try { nodes.panner.disconnect() } catch {}
        try { nodes.fxInput.disconnect() } catch {}
        try { nodes.fxOutput.disconnect() } catch {}
        try { nodes.monitorGain.disconnect() } catch {}
      }
      tracksRef.current.clear()
      for (const [id, stream] of Object.entries(standaloneMicStreamsRef.current)) {
        clearSharedMicStream(id, stream)
        stream.getTracks().forEach(track => track.stop())
      }
      standaloneMicStreamsRef.current = {}
      pendingStandaloneMicsRef.current.clear()
      masterFxRef.current = null
      broadcastLimiterRef.current = null
      outputSilencerRef.current = null
      masterMonitorMixerRef.current = null
      if (programMonitorMixerRef.current) {
        try { programMonitorMixerRef.current.disconnect() } catch {}
      }
      programMonitorMixerRef.current = null
      mainMixMonitorGainRef.current = null
      if (masterMeterRef.current) {
        try { masterMeterRef.current.splitter.disconnect() } catch {}
        try { masterMeterRef.current.analyserL.disconnect() } catch {}
        try { masterMeterRef.current.analyserR.disconnect() } catch {}
        masterMeterRef.current = null
      }
      audioCtxRef.current = null
      audioEngine.setBroadcastBus(null)
      audioEngine.setMasterMeterNodes(null)
    }
  }, [enabled])

  // 2. Broadcast/recording tap. This connects the permanent mixer graph to
  // ffmpeg only while output is active; monitoring remains live either way.
  useEffect(() => {
    if (!enabled) return

    const ctx = audioCtxRef.current
    const broadcastLimiter = broadcastLimiterRef.current
    const outputSilencer = outputSilencerRef.current
    if (!ctx || !broadcastLimiter || !outputSilencer) return

    let disposed = false

    const disconnectProcessor = () => {
      if (!processorRef.current) return
      console.log('[useBroadcastAudio] Disconnecting broadcast processor')
      try { broadcastLimiter.disconnect(processorRef.current) } catch {}
      try { processorRef.current.disconnect() } catch {}
      processorRef.current = null
    }

    if (!outputActive) {
      disconnectProcessor()
      return
    }

    const setupProcessor = async () => {
      try {
        console.log('[useBroadcastAudio] Initializing AudioWorklet...')
        await ctx.audioWorklet.addModule(new URL('../../../workers/broadcast-processor.ts', import.meta.url))
        if (disposed || processorRef.current) return

        const processor = new AudioWorkletNode(ctx, 'broadcast-processor')
        processorRef.current = processor
        sampleCountRef.current = 0

        processor.port.onmessage = (event) => {
          const buffer = event.data
          if (buffer instanceof ArrayBuffer && window.api?.streaming?.feedAudio) {
            const timestamp = (sampleCountRef.current / 2 / ctx.sampleRate) * 1000000

            window.api.streaming.feedAudio({
              data: new Uint8Array(buffer),
              timestamp: Math.round(timestamp)
            })

            sampleCountRef.current += (buffer.byteLength / 4)
          }
        }

        broadcastLimiter.connect(processor)
        processor.connect(outputSilencer)
        console.log('[useBroadcastAudio] Broadcast pipeline ready.')
      } catch (err) {
        console.error('[useBroadcastAudio] Failed to initialize AudioWorklet:', err)
      }
    }

    void setupProcessor()

    return () => {
      disposed = true
      disconnectProcessor()
    }
  }, [outputActive, enabled])

  // 2. Reconciliation & Parameter Updates
  useEffect(() => {
    if (!enabled) return

    const ctx = audioCtxRef.current
    const masterInput = masterInputRef.current
    if (!ctx || !masterInput || ctx.state === 'closed') return
    console.log(`[useBroadcastAudio] Reconciling ${audioSources.length} sources. Output active: ${outputActive}`)
    const activeLayerIds = new Set((activeScene?.layers || []).map(layer => layer.id))

    // Update Master Bus
    const mVol = masterBus.muted ? 0 : masterBus.volume
    masterInput.gain.setTargetAtTime(mVol, ctx.currentTime, 0.01)

    // Main Mix monitoring toggle (do we want to hear the whole mix in our headphones?)
    const mainMonitorTarget = masterBus.monitoring && !masterBus.muted ? masterBus.volume : 0
    mainMixMonitorGainRef.current?.gain.setTargetAtTime(mainMonitorTarget, ctx.currentTime, 0.005)

    if (masterFxRef.current) {
      reconcileFxChain(ctx, masterFxRef.current, masterBus.filters || [])
    }

    // Reconcile Tracks
    const currentIds = new Set(audioSources.map(s => s.id))

    // Cleanup removed tracks
    for (const [id, nodes] of tracksRef.current.entries()) {
      if (!currentIds.has(id)) {
        if (nodes._sourceNode?.node) {
          try {
            // For internal buses, only disconnect from THIS mixer stage to
            // avoid killing connections to meters or other destinations.
            nodes._sourceNode.node.disconnect(nodes.channelMode.input)
          } catch (e) {
            // Fallback for nodes that don't support targeted disconnect or were never connected
            try { nodes._sourceNode.node.disconnect() } catch {}
          }
        }
        nodes.channelMode.disconnect()
        try { nodes.gain.disconnect() } catch {}
        try { nodes.programMonitorSend.disconnect() } catch {}
        try { nodes.panner.disconnect() } catch {}
        try { nodes.fxInput.disconnect() } catch {}
        try { nodes.fxOutput.disconnect() } catch {}
        try { nodes.monitorGain.disconnect() } catch {}
        const standaloneStream = standaloneMicStreamsRef.current[id]
        if (standaloneStream) {
          clearSharedMicStream(id, standaloneStream)
          standaloneStream.getTracks().forEach(track => track.stop())
          delete standaloneMicStreamsRef.current[id]
        }
        tracksRef.current.delete(id)
      }
    }

    // Update existing or add new tracks
    for (const s of audioSources) {
      let nodes = tracksRef.current.get(s.id)
      if (!nodes) {
        const channelMode = createChannelModeStage(ctx, sanitizeChannelMode(s.channelMode, s.type === 'mic' ? 'mono' : 'stereo'))
        const gain = ctx.createGain() // Main Fader
        const programMonitorSend = ctx.createGain()
        const monitorGain = ctx.createGain() // Monitor Send
        const panner = ctx.createStereoPanner()
        const fxInput = ctx.createGain()
        const fxOutput = ctx.createGain()

        channelMode.output.connect(panner)
        panner.connect(fxInput)
        fxInput.connect(fxOutput)

        // Post-FX broadcast branch. Monitoring is connected below so the
        // route can switch between a dry low-latency mic tap and post-fader
        // audio when inserts are active.
        fxOutput.connect(gain)

        gain.connect(masterInput)
        gain.connect(programMonitorSend)
        if (programMonitorMixerRef.current) {
          programMonitorSend.connect(programMonitorMixerRef.current)
        } else {
          console.warn(`[useBroadcastAudio] programMonitorMixer missing for track ${s.id}`)
        }
        if (masterMonitorMixerRef.current) {
          monitorGain.connect(masterMonitorMixerRef.current)
        } else {
          console.warn(`[useBroadcastAudio] masterMonitorMixer missing for track ${s.id}`)
        }

        nodes = { channelMode, gain, programMonitorSend, panner, fxInput, fxOutput, monitorGain, monitorSource: null, fxNodes: [] }
        tracksRef.current.set(s.id, nodes)
        console.log(`[useBroadcastAudio] Initialized mixer track for ${s.id}`)
      }

      // Re-attach stream or connect internal bus
      const existingSource = (nodes as any)._sourceNode

      if (s.id === 'soundboard' || s.id === 'tts-audio') {
        const bus = s.id === 'soundboard' ? audioEngine.getSoundboardBus() : audioEngine.getTtsBus()
        if (existingSource?.node !== bus) {
          if (existingSource) existingSource.node.disconnect()
          console.log(`[useBroadcastAudio] Wiring internal ${s.id} bus to mixer stage`)
          bus.connect(nodes.channelMode.input)
          ;(nodes as any)._sourceNode = { node: bus, type: 'bus' }
        }
      } else {
        const globalMic = getSharedMicStream(s.id)
        const video = videoRefs.current[s.id] as any
        const standaloneMic = standaloneMicStreamsRef.current[s.id]
        if (standaloneMic && !hasLiveAudioTrack(standaloneMic)) {
          clearSharedMicStream(s.id, standaloneMic)
          standaloneMic.getTracks().forEach(track => track.stop())
          delete standaloneMicStreamsRef.current[s.id]
        }

        const stream = (globalMic || video?.__ilyRawStream || video?.srcObject || standaloneMicStreamsRef.current[s.id]) as MediaStream | null

        if (hasLiveAudioTrack(stream)) {
          if (existingSource?.stream !== stream) {
            if (existingSource) existingSource.node.disconnect()
            try {
              const sourceNode = ctx.createMediaStreamSource(stream)
              sourceNode.connect(nodes.channelMode.input)
              ;(nodes as any)._sourceNode = { node: sourceNode, stream, type: 'stream' }
              console.log(`[useBroadcastAudio] Attached stream for ${s.id} (${s.type}). Tracks: ${stream.getAudioTracks().length}`)
            } catch (err) {
              console.error(`[useBroadcastAudio] Failed to connect stream for ${s.id}:`, err)
            }
          }
        } else if (stream) {
          console.warn(`[useBroadcastAudio] Stream found for ${s.id} but has no live audio tracks.`)
        } else if (s.type === 'mic' && !activeLayerIds.has(s.id) && s.deviceId && s.deviceId !== 'match' && !pendingStandaloneMicsRef.current.has(s.id)) {
          pendingStandaloneMicsRef.current.add(s.id)
          navigator.mediaDevices.getUserMedia({
            audio: buildLowLatencyAudioConstraints(s.deviceId)
          }).then(micStream => {
            if (!hasLiveAudioTrack(micStream)) {
              micStream.getTracks().forEach(track => track.stop())
              return
            }
            standaloneMicStreamsRef.current[s.id] = micStream
            setSharedMicStream(s.id, micStream)
            try {
              const settings = micStream.getAudioTracks()[0]?.getSettings()
              console.log(`[useBroadcastAudio] Opened standalone mic stream for ${s.id}`, {
                sampleRate: settings?.sampleRate,
                channelCount: settings?.channelCount,
                latency: settings?.latency
              })
            } catch {
              console.log(`[useBroadcastAudio] Opened standalone mic stream for ${s.id}`)
            }
            const currentNodes = tracksRef.current.get(s.id)
            if (audioCtxRef.current === ctx && currentNodes && hasLiveAudioTrack(micStream)) {
              try {
                currentNodes._sourceNode?.node?.disconnect()
                const sourceNode = ctx.createMediaStreamSource(micStream)
                sourceNode.connect(currentNodes.channelMode.input)
                ;(currentNodes as any)._sourceNode = { node: sourceNode, stream: micStream, type: 'stream' }
                console.log(`[useBroadcastAudio] Attached standalone mic stream for ${s.id}`)
              } catch (err) {
                console.error(`[useBroadcastAudio] Failed to attach standalone mic stream for ${s.id}:`, err)
              }
            } else {
              clearSharedMicStream(s.id, micStream)
              micStream.getTracks().forEach(track => track.stop())
              delete standaloneMicStreamsRef.current[s.id]
            }
          }).catch(err => {
            console.error(`[useBroadcastAudio] Failed to open standalone mic stream for ${s.id}:`, err)
          }).finally(() => {
            pendingStandaloneMicsRef.current.delete(s.id)
          })
        }
      }

      nodes.channelMode.setMode(sanitizeChannelMode(s.channelMode, s.type === 'mic' ? 'mono' : 'stereo'))

      const monitorSource = shouldUseDirectMicMonitor(s) ? 'direct-mic' : 'post-fader'
      if (nodes.monitorSource !== monitorSource) {
        try { nodes.panner.disconnect(nodes.monitorGain) } catch {}
        try { nodes.fxOutput.disconnect(nodes.monitorGain) } catch {}
        try { nodes.gain.disconnect(nodes.monitorGain) } catch {}

        if (monitorSource === 'direct-mic') {
          nodes.panner.connect(nodes.monitorGain)
        } else {
          nodes.gain.connect(nodes.monitorGain)
        }

        nodes.monitorSource = monitorSource
        console.log(`[useBroadcastAudio] ${s.id} monitor route: ${monitorSource}`)
      }

      const targetGain = s.muted ? 0 : s.volume
      if (Math.abs(nodes.gain.gain.value - targetGain) > 0.001) {
        nodes.gain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.01)
      }

      const targetProgramMonitorGain = s.monitoring ? 0 : 1
      if (Math.abs(nodes.programMonitorSend.gain.value - targetProgramMonitorGain) > 0.001) {
        nodes.programMonitorSend.gain.setTargetAtTime(targetProgramMonitorGain, ctx.currentTime, 0.005)
      }

      // Direct mic monitoring applies the fader here because it intentionally
      // bypasses the post-FX fader path for the lowest possible confidence
      // monitor latency. Post-fader monitoring is already volume controlled.
      const targetMonitorGain = !s.monitoring ? 0 : monitorSource === 'direct-mic' ? targetGain : 1
      if (Math.abs(nodes.monitorGain.gain.value - targetMonitorGain) > 0.001) {
        console.log(`[useBroadcastAudio] ${s.id} monitor gain: ${targetMonitorGain}`)
        nodes.monitorGain.gain.setTargetAtTime(targetMonitorGain, ctx.currentTime, 0.005)
      }

      nodes.panner.pan.setTargetAtTime(s.pan || 0, ctx.currentTime, 0.01)

      const fxState = { input: nodes.fxInput, output: nodes.fxOutput, nodes: nodes.fxNodes }
      reconcileFxChain(ctx, fxState, s.filters || [])
      nodes.fxNodes = fxState.nodes

    }
  }, [audioSources, masterBus, streamReady, enabled, outputActive, activeSceneId, activeScene])
}
