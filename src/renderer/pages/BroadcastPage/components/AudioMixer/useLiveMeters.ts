import React, { useEffect, useRef, useState } from 'react'
import {
  audioEngine,
  createChannelModeStage,
  sanitizeChannelMode
} from '../../../../utils/audio-engine'
import { reconcileFxChain } from '../../../../utils/audio-fx'
import { resolveCameraAudioDeviceId } from '../../utils/media-init'
import type { AudioSource, StudioScene } from '../../../../../shared/studio'
import { type MeterFrame, type LiveMeterNode, cleanupLiveMeterNode } from './utils'

export function useLiveMeters(
  activeScene: StudioScene,
  videoRefs: React.MutableRefObject<Record<string, HTMLVideoElement>>,
  audioSources: AudioSource[],
  devices: MediaDeviceInfo[],
  streamReady: number
): Record<string, MeterFrame> {
  const [meters, setMeters] = useState<Record<string, MeterFrame>>({})
  const lastUpdateRef = useRef(0)
  const nodesRef = useRef(new Map<string, LiveMeterNode>())
  const peaksRef = useRef<Record<string, { value: number; lastAt: number }>>({})
  const micStreams = useRef<Record<string, MediaStream>>({})
  const pendingMics = useRef<Set<string>>(new Set())

  useEffect(() => {
    let disposed = false
    let frameId = 0

    const ensureNode = async (source: AudioSource) => {
      let stream: MediaStream | null = null

      if (source.id === 'soundboard') {
        stream = (window as any).__soundboardStream || null
      } else if (source.id === 'tts-audio') {
        stream = audioEngine.getTtsStream()
      } else if (source.type === 'mic' && source.deviceId) {
        const globalMic = (window as any).__ilyMicStreams?.[source.id]
        if (globalMic) {
          stream = globalMic
        } else if (micStreams.current[source.id]) {
          stream = micStreams.current[source.id]
        } else {
          const isLayer = activeScene.layers.some(l => l.id === source.id)
          if (isLayer) {
            const el = videoRefs.current[source.id] as any
            stream = (el?.__ilyRawStream || el?.srcObject) as MediaStream | null
            if (!stream) return
          } else {
            if (pendingMics.current.has(source.id)) return
            pendingMics.current.add(source.id)

            try {
              let deviceId = source.deviceId
              if (deviceId === 'match') {
                const layer = activeScene.layers.find(l => l.id === source.id)
                const matchId = layer ? resolveCameraAudioDeviceId(layer, devices) : undefined

                if (matchId) {
                  deviceId = matchId
                } else {
                  pendingMics.current.delete(source.id)
                  return
                }
              }

              console.log(`[AudioMixer] Initializing standalone mic: ${source.name} (${deviceId})`)
              stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                  deviceId: { exact: deviceId },
                  echoCancellation: false,
                  noiseSuppression: false,
                  autoGainControl: false
                }
              })
              micStreams.current[source.id] = stream
            } catch (err) {
              console.error('[AudioMixer] Failed to get standalone mic stream:', err)
            } finally {
              pendingMics.current.delete(source.id)
            }
          }
        }
      } else {
        const video = videoRefs.current[source.id] as any
        stream = (video?.__ilyRawStream || video?.srcObject) as MediaStream | null
      }

      if (stream) {
        const audioTracks = stream.getAudioTracks()
        if (audioTracks.length === 0 || audioTracks.every(t => t.readyState === 'ended')) {
          stream = null
        }
      }

      if (!stream) return
      const existing = nodesRef.current.get(source.id)
      if (existing?.stream === stream) return

      if (existing) {
        cleanupLiveMeterNode(existing)
        nodesRef.current.delete(source.id)
      }

      try {
        const context = audioEngine.getContext()
        const mediaSource = context.createMediaStreamSource(stream)
        const splitter = context.createChannelSplitter(2)
        const analyserL = context.createAnalyser()
        const analyserR = context.createAnalyser()
        const channelMode = createChannelModeStage(
          context,
          sanitizeChannelMode(source.channelMode, source.type === 'mic' ? 'mono' : 'stereo')
        )
        const fxInput = context.createGain()
        const fxOutput = context.createGain()

        analyserL.fftSize = 512
        analyserL.smoothingTimeConstant = 0.4
        analyserR.fftSize = 512
        analyserR.smoothingTimeConstant = 0.4

        mediaSource.connect(channelMode.input)
        channelMode.output.connect(fxInput)
        fxInput.connect(fxOutput)

        const meterPan = context.createStereoPanner()
        fxOutput.connect(meterPan)
        meterPan.connect(splitter)

        splitter.connect(analyserL, 0)
        splitter.connect(analyserR, 1)

        const silentSink = context.createGain()
        silentSink.gain.value = 0
        fxOutput.connect(silentSink)
        analyserL.connect(silentSink)
        analyserR.connect(silentSink)
        silentSink.connect(context.destination)

        void context.resume()
        nodesRef.current.set(source.id, {
          stream,
          context,
          source: mediaSource,
          splitter,
          analyserL,
          analyserR,
          channelMode,
          fxInput,
          fxOutput,
          fxNodes: [],
          meterPan,
          silentSink,
          dataL: new Float32Array(analyserL.fftSize),
          dataR: new Float32Array(analyserR.fftSize),
          freqData: new Uint8Array(analyserL.frequencyBinCount)
        })
      } catch {
      }
    }

    const activeAudioIds = new Set(
      activeScene.layers
        .filter(layer => layer.type === 'camera' || layer.type === 'display' || layer.type === 'audio')
        .map(layer => layer.id)
    )

    if (audioSources.some(s => s.id === 'soundboard')) {
      activeAudioIds.add('soundboard')
    }
    if (audioSources.some(s => s.id === 'tts-audio')) {
      activeAudioIds.add('tts-audio')
    }

    audioSources.forEach(source => {
      if (activeAudioIds.has(source.id)) {
        void ensureNode(source)
      }
    })

    const initPollTimer = window.setInterval(() => {
      audioSources.forEach(source => {
        if (activeAudioIds.has(source.id)) ensureNode(source)
      })
      if (audioEngine.getContext().state === 'suspended') {
        void audioEngine.getContext().resume()
      }
    }, 1000)

    for (const [id, node] of nodesRef.current) {
      if (activeAudioIds.has(id)) continue
      cleanupLiveMeterNode(node)
      nodesRef.current.delete(id)
    }

    const lastTickRef = { current: 0 }
    const tick = (timestamp: number) => {
      if (disposed) return

      const elapsed = timestamp - lastTickRef.current
      if (elapsed < 32) {
        frameId = requestAnimationFrame(tick)
        return
      }
      lastTickRef.current = timestamp

      const next: Record<string, MeterFrame> = {}
      let masterL = 0, masterR = 0, masterPeak = 0
      let activeCount = 0

      for (const source of audioSources) {
        const node = nodesRef.current.get(source.id)
        if (!node) {
          next[source.id] = { left: 0, right: 0, peak: 0 }
          continue
        }

        const currentMode = sanitizeChannelMode(source.channelMode, source.type === 'mic' ? 'mono' : 'stereo')
        if (node.lastMode !== currentMode) {
          node.channelMode.setMode(currentMode)
          node.lastMode = currentMode
        }

        const filterRef = source.filters || []
        if (node.lastFxHash !== filterRef) {
          const fxState = { input: node.fxInput, output: node.fxOutput, nodes: node.fxNodes }
          reconcileFxChain(node.context, fxState, filterRef)
          node.fxNodes = fxState.nodes
          node.lastFxHash = filterRef
        }



        node.fxOutput.gain.setTargetAtTime(source.volume, node.context.currentTime, 0.01)

        if (node.meterPan) {
          node.meterPan.pan.setTargetAtTime(source.pan || 0, node.context.currentTime, 0.01)
        }

        node.analyserL.getFloatTimeDomainData(node.dataL as any)
        node.analyserR.getFloatTimeDomainData(node.dataR as any)

        let sumL = 0, sumR = 0
        let peakL = 0, peakR = 0
        const len = node.dataL.length

        for (let i = 0; i < len; i++) {
          const sL = node.dataL[i], sR = node.dataR[i]
          sumL += sL * sL
          sumR += sR * sR
          if (Math.abs(sL) > peakL) peakL = Math.abs(sL)
          if (Math.abs(sR) > peakR) peakR = Math.abs(sR)
        }

        const rmsL = Math.sqrt(sumL / len) * 2.2
        const rmsR = Math.sqrt(sumR / len) * 2.2
        const peakTotal = Math.max(peakL, peakR) * 1.1

        const meter = {
          left: Math.min(1, rmsL),
          right: Math.min(1, rmsR),
          peak: Math.min(1, peakTotal)
        }

        // Peak Hold Logic
        const nowMs = performance.now()
        const currentPeak = peaksRef.current[source.id] || { value: 0, lastAt: 0 }
        if (meter.peak >= currentPeak.value) {
          peaksRef.current[source.id] = { value: meter.peak, lastAt: nowMs }
        } else if (nowMs - currentPeak.lastAt > 1500) {
          // Decay peak
          peaksRef.current[source.id] = { value: meter.peak, lastAt: nowMs }
        }

        next[source.id] = { ...meter, holdPeak: peaksRef.current[source.id].value }

        masterL += meter.left
        masterR += meter.right
        masterPeak = Math.max(masterPeak, meter.peak)
        activeCount++
      }

      const masterMeter = {
        left: activeCount > 0 ? Math.min(1, masterL / Math.sqrt(activeCount)) : 0,
        right: activeCount > 0 ? Math.min(1, masterR / Math.sqrt(activeCount)) : 0,
        peak: masterPeak
      }

      const nowMs = performance.now()
      const masterHold = peaksRef.current.master || { value: 0, lastAt: 0 }
      if (masterMeter.peak >= masterHold.value) {
        peaksRef.current.master = { value: masterMeter.peak, lastAt: nowMs }
      } else if (nowMs - masterHold.lastAt > 1500) {
        peaksRef.current.master = { value: masterMeter.peak, lastAt: nowMs }
      }

      next.master = { ...masterMeter, holdPeak: peaksRef.current.master.value }

      Object.entries(next).forEach(([id, data]) => {
        let elements: any = null

        if (id === 'master') {
          if (!(window as any).__ilyMasterElements) {
            (window as any).__ilyMasterElements = {
              peakL: Array.from(document.querySelectorAll(`.meter-peak-l-master`)),
              peakR: Array.from(document.querySelectorAll(`.meter-peak-r-master`)),
              clipL: Array.from(document.querySelectorAll(`.meter-clip-l-master`)),
              clipR: Array.from(document.querySelectorAll(`.meter-clip-r-master`))
            }
          }
          elements = (window as any).__ilyMasterElements
        } else {
          const node = nodesRef.current.get(id)
          if (!node) return

          if (!node.elements) {
            node.elements = {
              peakL: Array.from(document.querySelectorAll(`.meter-peak-l-${id}`)) as HTMLElement[],
              peakR: Array.from(document.querySelectorAll(`.meter-peak-r-${id}`)) as HTMLElement[],
              clipL: Array.from(document.querySelectorAll(`.meter-clip-l-${id}`)) as HTMLElement[],
              clipR: Array.from(document.querySelectorAll(`.meter-clip-r-${id}`)) as HTMLElement[],
              spectrum: document.getElementById(`spectrum-canvas-${id}`) as HTMLCanvasElement | null
            }
          }
          elements = node.elements
        }

        if (!elements) return

        const peakPercentL = `${Math.max(4, data.left * 100)}%`
        const peakPercentR = `${Math.max(4, data.right * 100)}%`

        elements.peakL.forEach((el: HTMLElement) => { el.style.height = peakPercentL })
        elements.peakR.forEach((el: HTMLElement) => { el.style.height = peakPercentR })

        const dbL = data.left <= 0.001 ? -60 : 20 * Math.log10(data.left)
        const dbR = data.right <= 0.001 ? -60 : 20 * Math.log10(data.right)
        const clipL = `${100 - Math.max(0, (dbL + 60) / 60) * 100}%`
        const clipR = `${100 - Math.max(0, (dbR + 60) / 60) * 100}%`

        elements.clipL.forEach((el: HTMLElement) => { el.style.clipPath = `inset(${clipL} 0 0 0)` })
        elements.clipR.forEach((el: HTMLElement) => { el.style.clipPath = `inset(${clipR} 0 0 0)` })

        // Peak Hold DOM update
        const peakHoldPos = `${100 - ((data.holdPeak || 0) * 100)}%`
        const holdL = Array.from(document.querySelectorAll(`.meter-hold-l-${id}`)) as HTMLElement[]
        const holdR = Array.from(document.querySelectorAll(`.meter-hold-r-${id}`)) as HTMLElement[]
        holdL.forEach(el => { el.style.top = peakHoldPos })
        holdR.forEach(el => { el.style.top = peakHoldPos })

        // Clip indicator with sticky hold (1 second)
        const clipLIndicator = Array.from(document.querySelectorAll(`.meter-clip-indicator-l-${id}`)) as HTMLElement[]
        const clipRIndicator = Array.from(document.querySelectorAll(`.meter-clip-indicator-r-${id}`)) as HTMLElement[]

        if (!(window as any).__ilyClipHistory) (window as any).__ilyClipHistory = {}
        const history = (window as any).__ilyClipHistory

        const now = Date.now()
        if (data.left > 0.98) history[`${id}-l`] = now
        if (data.right > 0.98) history[`${id}-r`] = now

        const isClippingL = now - (history[`${id}-l`] || 0) < 1000
        const isClippingR = now - (history[`${id}-r`] || 0) < 1000

        clipLIndicator.forEach(el => { el.style.opacity = isClippingL ? '1' : '0' })
        clipRIndicator.forEach(el => { el.style.opacity = isClippingR ? '1' : '0' })


        const canvas = elements.spectrum
        if (canvas && data.spectrum) {
          const ctx = canvas.getContext('2d', { alpha: false })
          if (ctx) {
            const w = canvas.width
            const h = canvas.height
            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, w, h)

            const bars = data.spectrum
            const barW = (w / bars.length) - 1

            ctx.fillStyle = '#6366f1'
            bars.forEach((level, i) => {
              const barH = level * h
              const x = i * (barW + 1)
              const y = h - barH
              ctx.globalAlpha = 0.3 + (level * 0.7)
              ctx.fillRect(x, y, barW, barH)
            })
            ctx.globalAlpha = 1.0
          }
        }
      })

      const now = Date.now()
      if (now - lastUpdateRef.current >= 100) {
        if (!disposed) setMeters(next)
        lastUpdateRef.current = now
      }

      frameId = requestAnimationFrame(tick)
    }

    frameId = requestAnimationFrame(tick)
    return () => {
      disposed = true
      cancelAnimationFrame(frameId)
      window.clearInterval(initPollTimer)
    }
  }, [activeScene, audioSources, videoRefs, streamReady, devices])

  useEffect(() => () => {
    for (const node of nodesRef.current.values()) {
      cleanupLiveMeterNode(node)
    }
    nodesRef.current.clear()
    for (const stream of Object.values(micStreams.current)) {
      stream.getTracks().forEach(t => t.stop())
    }
    micStreams.current = {}
  }, [])

  return meters
}
