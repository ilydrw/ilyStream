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
  monitorGain: GainNode
  fxNodes: any[]
  _sourceNode?: { node: AudioNode; stream?: MediaStream; type: 'stream' | 'bus' }
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
  const masterMonitorMixerRef = useRef<GainNode | null>(null)
  const mainMixMonitorGainRef = useRef<GainNode | null>(null)
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

    const mainMixMonitorGain = ctx.createGain()
    mainMixMonitorGain.gain.value = 0 // Controls whether the ENTIRE MIX is in the headphones

    // Setup Master FX Chain
    const mFxInput = ctx.createGain()
    const mFxOutput = ctx.createGain()
    masterInput.connect(mFxInput)
    mFxOutput.connect(broadcastHeadroom)
    broadcastHeadroom.connect(broadcastLimiter)
    
    // Routing to Headphones
    broadcastLimiter.connect(mainMixMonitorGain)
    mainMixMonitorGain.connect(masterMonitorMixer)
    masterMonitorMixer.connect(ctx.destination)
    
    masterFxRef.current = { input: mFxInput, output: mFxOutput, nodes: [] }
    broadcastLimiterRef.current = broadcastLimiter
    outputSilencerRef.current = outputSilencer
    masterMonitorMixerRef.current = masterMonitorMixer
    mainMixMonitorGainRef.current = mainMixMonitorGain

    console.log('[useBroadcastAudio] Mixer graph ready.')

    return () => {
      if (processorRef.current) {
        try { broadcastLimiterRef.current?.disconnect(processorRef.current) } catch {}
        try { processorRef.current.disconnect() } catch {}
        processorRef.current = null
      }
      for (const nodes of tracksRef.current.values()) {
        try { nodes._sourceNode?.node?.disconnect() } catch {}
        nodes.channelMode.disconnect()
        try { nodes.gain.disconnect() } catch {}
        try { nodes.panner.disconnect() } catch {}
        try { nodes.fxInput.disconnect() } catch {}
        try { nodes.fxOutput.disconnect() } catch {}
        try { nodes.monitorGain.disconnect() } catch {}
      }
      tracksRef.current.clear()
      masterFxRef.current = null
      broadcastLimiterRef.current = null
      outputSilencerRef.current = null
      masterMonitorMixerRef.current = null
      mainMixMonitorGainRef.current = null
      audioCtxRef.current = null
      audioEngine.setBroadcastBus(null)
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
    console.log(`[useBroadcastAudio] Reconciling ${audioSources.length} sources. Output active: ${outputActive}`)

    // Update Master Bus
    const mVol = masterBus.muted ? 0 : masterBus.volume
    masterInput.gain.setTargetAtTime(mVol, ctx.currentTime, 0.01)
    
    // Main Mix monitoring toggle (do we want to hear the whole mix in our headphones?)
    mainMixMonitorGainRef.current?.gain.setTargetAtTime(masterBus.monitoring ? 1 : 0, ctx.currentTime, 0.01)
    
    if (masterFxRef.current) {
      reconcileFxChain(ctx, masterFxRef.current, masterBus.fxChain || [])
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
        try { nodes.panner.disconnect() } catch {}
        try { nodes.fxInput.disconnect() } catch {}
        try { nodes.fxOutput.disconnect() } catch {}
        try { nodes.monitorGain.disconnect() } catch {}
        tracksRef.current.delete(id)
      }
    }

    // Update existing or add new tracks
    for (const s of audioSources) {
      let nodes = tracksRef.current.get(s.id)
      if (!nodes) {
        const channelMode = createChannelModeStage(ctx, sanitizeChannelMode(s.channelMode, s.type === 'mic' ? 'mono' : 'stereo'))
        const gain = ctx.createGain() // Main Fader
        const monitorGain = ctx.createGain() // Monitor Send
        const panner = ctx.createStereoPanner()
        const fxInput = ctx.createGain()
        const fxOutput = ctx.createGain()

        channelMode.output.connect(panner)
        panner.connect(fxInput)
        fxInput.connect(fxOutput)
        
        // Post-FX Branching
        fxOutput.connect(gain)
        fxOutput.connect(monitorGain)
        
        gain.connect(masterInput)
        if (masterMonitorMixerRef.current) {
          monitorGain.connect(masterMonitorMixerRef.current)
        } else {
          console.warn(`[useBroadcastAudio] masterMonitorMixer missing for track ${s.id}`)
        }

        nodes = { channelMode, gain, panner, fxInput, fxOutput, monitorGain, fxNodes: [] }
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
        const globalMic = (window as any).__ilyMicStreams?.[s.id]
        const video = videoRefs.current[s.id] as any
        const stream = (globalMic || video?.__ilyRawStream || video?.srcObject) as MediaStream | null

        if (stream && stream.getAudioTracks().length > 0) {
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
          console.warn(`[useBroadcastAudio] Stream found for ${s.id} but has no audio tracks.`)
        }
      }

      nodes.channelMode.setMode(sanitizeChannelMode(s.channelMode, s.type === 'mic' ? 'mono' : 'stereo'))
      
      const targetGain = s.muted ? 0 : s.volume
      if (Math.abs(nodes.gain.gain.value - targetGain) > 0.001) {
        nodes.gain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.01)
      }

      // Monitoring Gain: If monitoring is ON, it follows the main volume (unless muted)
      // This ensures you hear exactly what the stream hears, but only if you choose to monitor.
      const targetMonitorGain = !s.monitoring ? 0 : 1
      if (Math.abs(nodes.monitorGain.gain.value - targetMonitorGain) > 0.001) {
        console.log(`[useBroadcastAudio] ${s.id} monitor gain: ${targetMonitorGain}`)
        nodes.monitorGain.gain.setTargetAtTime(targetMonitorGain, ctx.currentTime, 0.01)
      }

      nodes.panner.pan.setTargetAtTime(s.pan || 0, ctx.currentTime, 0.01)
      
      const fxState = { input: nodes.fxInput, output: nodes.fxOutput, nodes: nodes.fxNodes }
      reconcileFxChain(ctx, fxState, s.fxChain || [])
      nodes.fxNodes = fxState.nodes
    }
  }, [audioSources, masterBus, streamReady])
}
