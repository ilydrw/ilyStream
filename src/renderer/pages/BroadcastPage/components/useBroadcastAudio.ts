import { useEffect, useRef } from 'react'
import { useStudioStore } from '../../../stores/studio-store'
import type { AudioSource } from '../../../../shared/studio'
import { reconcileFxChain } from '../../../utils/audio-fx'
import { audioEngine, createChannelModeStage, sanitizeChannelMode, type ChannelModeStage } from '../../../utils/audio-engine'

interface TrackNodes {
  channelMode: ChannelModeStage
  gain: GainNode
  panner: StereoPannerNode
  fxInput: GainNode
  fxOutput: GainNode
  fxNodes: any[]
}

export function useBroadcastAudio(
  outputActive: boolean,
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>,
  streamReady: number = 0
) {
  const masterBus = useStudioStore(s => s.masterBus)
  const audioSources = useStudioStore(s => s.audioSources)
  
  const audioCtxRef = useRef<AudioContext | null>(null)
  const masterInputRef = useRef<GainNode | null>(null)
  const broadcastLimiterRef = useRef<DynamicsCompressorNode | null>(null)
  const outputSilencerRef = useRef<GainNode | null>(null)
  const masterMonitorGainRef = useRef<GainNode | null>(null)
  const processorRef = useRef<AudioWorkletNode | null>(null)
  const sampleCountRef = useRef<number>(0)
  const tracksRef = useRef<Map<string, TrackNodes>>(new Map())
  const masterFxRef = useRef<{ input: GainNode; output: GainNode; nodes: any[] } | null>(null)

  // 1. Permanent Pipeline Setup
  // Keep the WebAudio mixer alive while the studio is open so monitoring and
  // virtual sources such as TTS work before the stream/record buttons are on.
  useEffect(() => {
    const ctx = audioEngine.getContext()
    audioCtxRef.current = ctx

    const masterInput = ctx.createGain()
    masterInputRef.current = masterInput
    audioEngine.setBroadcastBus(masterInput)

    const broadcastHeadroom = ctx.createGain()
    broadcastHeadroom.gain.value = 0.82
    
    const broadcastLimiter = ctx.createDynamicsCompressor()
    broadcastLimiter.threshold.value = -3.0
    broadcastLimiter.knee.value = 12
    broadcastLimiter.ratio.value = 20
    broadcastLimiter.attack.value = 0.002
    broadcastLimiter.release.value = 0.1

    const outputSilencer = ctx.createGain()
    outputSilencer.gain.value = 0
    outputSilencer.connect(ctx.destination)

    const masterMonitorGain = ctx.createGain()
    masterMonitorGain.gain.value = 0

    // Setup Master FX Chain
    const mFxInput = ctx.createGain()
    const mFxOutput = ctx.createGain()
    masterInput.connect(mFxInput)
    mFxOutput.connect(broadcastHeadroom)
    broadcastHeadroom.connect(broadcastLimiter)
    broadcastLimiter.connect(masterMonitorGain)
    masterMonitorGain.connect(ctx.destination)
    
    masterFxRef.current = { input: mFxInput, output: mFxOutput, nodes: [] }
    broadcastLimiterRef.current = broadcastLimiter
    outputSilencerRef.current = outputSilencer
    masterMonitorGainRef.current = masterMonitorGain

    console.log('[useBroadcastAudio] Mixer graph ready.')

    return () => {
      if (processorRef.current) {
        try { broadcastLimiterRef.current?.disconnect(processorRef.current) } catch {}
        try { processorRef.current.disconnect() } catch {}
        processorRef.current = null
      }
      for (const nodes of tracksRef.current.values()) {
        try { (nodes as any)._sourceNode?.node?.disconnect() } catch {}
        nodes.channelMode.disconnect()
        try { nodes.gain.disconnect() } catch {}
        try { nodes.panner.disconnect() } catch {}
        try { nodes.fxInput.disconnect() } catch {}
        try { nodes.fxOutput.disconnect() } catch {}
      }
      tracksRef.current.clear()
      masterFxRef.current = null
      broadcastLimiterRef.current = null
      outputSilencerRef.current = null
      masterMonitorGainRef.current = null
      audioCtxRef.current = null
      audioEngine.setBroadcastBus(null)
      audioEngine.setTtsBus(null)
    }
  }, [])

  // 2. Broadcast/recording tap. This connects the permanent mixer graph to
  // ffmpeg only while output is active; monitoring remains live either way.
  useEffect(() => {
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
  }, [outputActive])

  // 2. Reconciliation & Parameter Updates
  useEffect(() => {
    const ctx = audioCtxRef.current
    const masterInput = masterInputRef.current
    if (!ctx || !masterInput || ctx.state === 'closed') return

    // Update Master Bus
    const mVol = masterBus.muted ? 0 : masterBus.volume
    masterInput.gain.setTargetAtTime(mVol, ctx.currentTime, 0.01)
    masterMonitorGainRef.current?.gain.setTargetAtTime(masterBus.monitoring ? 1 : 0, ctx.currentTime, 0.01)
    
    if (masterFxRef.current) {
      reconcileFxChain(ctx, masterFxRef.current, masterBus.fxChain || [])
    }

    // Reconcile Tracks
    const currentIds = new Set(audioSources.map(s => s.id))
    
    // Cleanup removed tracks
    for (const [id, nodes] of tracksRef.current.entries()) {
      if (!currentIds.has(id)) {
        ;(nodes as any)._sourceNode?.node?.disconnect()
        if (audioEngine.getTtsBus() === nodes.channelMode.input) {
          audioEngine.setTtsBus(null)
        }
        nodes.channelMode.disconnect()
        try { nodes.gain.disconnect() } catch {}
        try { nodes.panner.disconnect() } catch {}
        try { nodes.fxInput.disconnect() } catch {}
        try { nodes.fxOutput.disconnect() } catch {}
        tracksRef.current.delete(id)
      }
    }

    // Update existing or add new tracks
    for (const s of audioSources) {
      let nodes = tracksRef.current.get(s.id)
      if (!nodes) {
        const channelMode = createChannelModeStage(ctx, sanitizeChannelMode(s.channelMode, s.type === 'mic' ? 'mono' : 'stereo'))
        const gain = ctx.createGain()
        const panner = ctx.createStereoPanner()
        const fxInput = ctx.createGain()
        const fxOutput = ctx.createGain()

        channelMode.output.connect(gain)
        gain.connect(panner)
        panner.connect(fxInput)
        fxInput.connect(fxOutput)
        fxOutput.connect(masterInput)

        nodes = { channelMode, gain, panner, fxInput, fxOutput, fxNodes: [] }
        tracksRef.current.set(s.id, nodes)
      }

      // Re-attach stream if it changed or wasn't attached
      let stream: MediaStream | null = null
      if (s.id === 'soundboard') {
        stream = (window as any).__soundboardStream || null
      } else if (s.id === 'tts-audio') {
        // Map the virtual TTS mixer channel to the global engine bus
        if (audioEngine.getTtsBus() !== nodes.channelMode.input) {
          audioEngine.setTtsBus(nodes.channelMode.input)
          console.log('[useBroadcastAudio] Linked TTS (Neural) mixer channel to AudioEngine bus.')
        }
      } else {
        const globalMic = (window as any).__ilyMicStreams?.[s.id]
        const video = videoRefs.current[s.id] as any
        stream = (globalMic || video?.__ilyRawStream || video?.srcObject) as MediaStream | null
      }

      if (stream && stream.getAudioTracks().length > 0) {
        const existingSource = (nodes as any)._sourceNode
        if (existingSource?.stream !== stream) {
          if (existingSource) existingSource.node.disconnect()
          try {
            const sourceNode = ctx.createMediaStreamSource(stream)
            sourceNode.connect(nodes.channelMode.input)
            ;(nodes as any)._sourceNode = { node: sourceNode, stream }
            console.log(`[useBroadcastAudio] Attached audio for ${s.id} (${s.type}). Tracks: ${stream.getAudioTracks().length}, SampleRate: ${ctx.sampleRate}Hz`)
          } catch (err) {
            console.error(`[useBroadcastAudio] Failed to connect stream for ${s.id}:`, err)
          }
        }
      } else if (stream) {
        console.warn(`[useBroadcastAudio] Stream found for ${s.id} but has no audio tracks.`)
      }

      nodes.channelMode.setMode(sanitizeChannelMode(s.channelMode, s.type === 'mic' ? 'mono' : 'stereo'))
      const targetGain = s.muted ? 0 : s.volume
      if (Math.abs(nodes.gain.gain.value - targetGain) > 0.001) {
        nodes.gain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.01)
      }
      nodes.panner.pan.setTargetAtTime(s.pan || 0, ctx.currentTime, 0.01)
      
      const fxState = { input: nodes.fxInput, output: nodes.fxOutput, nodes: nodes.fxNodes }
      reconcileFxChain(ctx, fxState, s.fxChain || [])
      nodes.fxNodes = fxState.nodes
    }
  }, [audioSources, masterBus, streamReady])
}
