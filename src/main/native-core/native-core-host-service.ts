import { NativeCoreHostClient, type NativeCoreHostHealth } from './native-core-host-client'
import type { NativeCoreDiagnostics, NativeMixerTransportDiagnostics } from '../../shared/native-core-diagnostics'
import {
  closeSharedMixerSourceWriter,
  createSharedMixerSourceWriter,
  getSharedCaptureReaderStatus,
  pushSharedMixerSource,
  startSharedCaptureReader,
  stopSharedCaptureReader,
  type CaptureFrame,
  type CaptureOptions,
  type CaptureSession,
  type CaptureStatus
} from '../audio/native-audio-capture'
import { randomBytes } from 'crypto'
import {
  compareNativeMixerShadow,
  parseNativeMixerShadowSnapshot,
  toNativeMixerHostRequest,
  type NativeMixerShadowSnapshot
} from '../../shared/native-mixer-shadow'
import {
  parseNativeMixerAudioReferenceFrame,
  parseNativeMixerAudioShadowConfig,
  parseNativeMixerAudioShadowFrame
} from '../../shared/native-mixer-audio-shadow'

export interface NativeMixerShadowTelemetry {
  evaluated: number
  mismatches: number
  rejected: number
  coalesced: number
  lastSequence: number | null
  lastMismatch: string | null
}

export interface NativeCoreHostStatus {
  enabled: boolean
  running: boolean
  executablePath: string | null
  health: NativeCoreHostHealth | null
  lastError: string | null
  mixerShadow: NativeMixerShadowTelemetry
  mixerAudioShadow: NativeMixerAudioShadowTelemetry
}

export interface NativeMixerAudioShadowTelemetry {
  enabled: boolean
  active: boolean
  sourceCount: number
  sourceFrames: number
  nativeFrames: number
  comparedBlocks: number
  mismatches: number
  rejected: number
  droppedComparisons: number
  maxError: number
  lastError: string | null
  startedAt: number | null
  lastComparedAt: number | null
}

/** Opt-in lifecycle wrapper; the established N-API path remains authoritative. */
export class NativeCoreHostService {
  private client: NativeCoreHostClient | null = null
  private status: NativeCoreHostStatus = {
    enabled: process.env.ILYSTREAM_NATIVE_CORE_HOST === '1',
    running: false,
    executablePath: null,
    health: null,
    lastError: null,
    mixerShadow: {
      evaluated: 0,
      mismatches: 0,
      rejected: 0,
      coalesced: 0,
      lastSequence: null,
      lastMismatch: null
    },
    mixerAudioShadow: {
      enabled: process.env.ILYSTREAM_NATIVE_MIXER_AUDIO_SHADOW === '1' && process.env.ILY_NATIVE_AUDIO !== '1',
      active: false,
      sourceCount: 0,
      sourceFrames: 0,
      nativeFrames: 0,
      comparedBlocks: 0,
      mismatches: 0,
      rejected: 0,
      droppedComparisons: 0,
      maxError: 0,
      lastError: null,
      startedAt: null,
      lastComparedAt: null
    }
  }
  private mixerShadowInFlight = false
  private pendingMixerShadow: NativeMixerShadowSnapshot | null = null
  private mixerSourceRings = new Map<string, string>()
  private mixerAudioConfigKey = ''
  private expectedMixerBlocks: Float32Array[] = []
  private actualMixerBlocks: Float32Array[] = []
  private mixerAudioOperation: Promise<void> = Promise.resolve()
  private mixerAudioEpoch = 0
  private diagnosticsInFlight: Promise<NativeCoreDiagnostics> | null = null
  private diagnosticsCache: NativeCoreDiagnostics | null = null

  async initialize(): Promise<NativeCoreHostStatus> {
    if (!this.status.enabled || this.client) return this.getStatus()
    try {
      this.client = await NativeCoreHostClient.start()
      const health = await this.client.health()
      this.status = {
        ...this.status,
        running: true,
        executablePath: this.client.executablePath,
        health,
        lastError: null
      }
      console.log(`[native-core] Host ready (pid ${health.pid}).`)
    } catch (error) {
      this.status = {
        ...this.status,
        running: false,
        health: null,
        lastError: error instanceof Error ? error.message : String(error)
      }
      console.warn('[native-core] Host unavailable; retaining N-API runtime:', this.status.lastError)
    }
    return this.getStatus()
  }

  getStatus(): NativeCoreHostStatus {
    return structuredClone(this.status)
  }

  async getDiagnostics(): Promise<NativeCoreDiagnostics> {
    // All windows share one bounded read; repeated IPC calls cannot flood the host.
    if (this.diagnosticsInFlight) return structuredClone(await this.diagnosticsInFlight)
    if (this.diagnosticsCache && Date.now() - this.diagnosticsCache.sampledAt < 1_000) {
      return structuredClone(this.diagnosticsCache)
    }
    const operation = this.collectDiagnostics()
    this.diagnosticsInFlight = operation
    try {
      this.diagnosticsCache = await operation
      return structuredClone(this.diagnosticsCache)
    } finally {
      this.diagnosticsInFlight = null
    }
  }

  private async collectDiagnostics(): Promise<NativeCoreDiagnostics> {
    const client = this.client
    const epoch = this.mixerAudioEpoch
    let running = false
    let transport: NativeMixerTransportDiagnostics | null = null
    let collectionError: NativeCoreDiagnostics['collectionError'] = null
    if (client && this.status.running) {
      try {
        await client.health()
        running = true
      } catch {
        collectionError = 'host-unavailable'
      }
      if (running && this.status.mixerAudioShadow.active) {
        try {
          transport = await client.mixerTransportStatus()
        } catch {
          collectionError = 'transport-unavailable'
        }
      }
    }
    if (epoch !== this.mixerAudioEpoch || client !== this.client) {
      collectionError = 'session-changed'
      transport = null
      running = client === this.client && running
    }
    const { mixerShadow: policy, mixerAudioShadow: audio } = this.status
    return {
      sampledAt: Date.now(),
      mixerOutput: 'shadow-only',
      host: { enabled: this.status.enabled, running, failed: !!this.status.lastError },
      collectionError,
      disabledReason: !this.status.enabled ? 'host-disabled'
        : process.env.ILY_NATIVE_AUDIO === '1' ? 'capture-conflict'
          : !audio.enabled ? 'audio-disabled' : null,
      policy: {
        evaluated: policy.evaluated, mismatches: policy.mismatches,
        rejected: policy.rejected, coalesced: policy.coalesced
      },
      audio: {
        enabled: audio.enabled, active: audio.active, failed: !!audio.lastError,
        startedAt: audio.startedAt, lastComparedAt: audio.lastComparedAt,
        sourceCount: audio.sourceCount, sourceFrames: audio.sourceFrames,
        nativeFrames: audio.nativeFrames, comparedBlocks: audio.comparedBlocks,
        mismatches: audio.mismatches, rejected: audio.rejected,
        droppedComparisons: audio.droppedComparisons, maxError: audio.maxError
      },
      transport
    }
  }

  get audioCaptureAvailable(): boolean {
    return this.client !== null && this.status.running
  }

  async startAudioCapture(
    options: CaptureOptions,
    onFrame: (frame: CaptureFrame) => void
  ): Promise<CaptureSession> {
    const client = this.client
    if (!client || !this.status.running) throw new Error('Native core host is not running')
    const transport = await client.startAudioCapture(options)
    try {
      return startSharedCaptureReader(transport, onFrame)
    } catch (error) {
      await client.stopAudioCapture().catch(() => undefined)
      throw error
    }
  }

  getAudioCaptureStatus(): CaptureStatus {
    return getSharedCaptureReaderStatus()
  }

  async stopAudioCapture(): Promise<{ framesCaptured: number; framesDropped: number }> {
    const local = stopSharedCaptureReader()
    const remote = await this.client?.stopAudioCapture().catch(() => null)
    return remote ?? { framesCaptured: local.framesCaptured, framesDropped: local.framesDropped }
  }

  evaluateMixerShadow(value: unknown): void {
    if (!this.client || !this.status.running) return
    const snapshot = parseNativeMixerShadowSnapshot(value)
    if (!snapshot) {
      this.status.mixerShadow.rejected++
      return
    }
    if (this.mixerShadowInFlight) {
      this.pendingMixerShadow = snapshot
      this.status.mixerShadow.coalesced++
      return
    }
    void this.drainMixerShadow(snapshot)
  }

  configureMixerAudioShadow(value: unknown): Promise<{ active: boolean; error?: string }> {
    const operation = this.mixerAudioOperation.then(() => this.configureMixerAudioShadowImpl(value))
    this.mixerAudioOperation = operation.then(() => undefined, () => undefined)
    return operation
  }

  private async configureMixerAudioShadowImpl(value: unknown): Promise<{ active: boolean; error?: string }> {
    if (!this.status.mixerAudioShadow.enabled) return { active: false }
    const config = parseNativeMixerAudioShadowConfig(value)
    if (!config) {
      this.status.mixerAudioShadow.rejected++
      return { active: false, error: 'Invalid native mixer audio-shadow configuration' }
    }
    const client = this.client
    if (!client || !this.status.running) return { active: false, error: 'Native core host is not running' }
    const key = [...config.sourceIds].sort().join('\n')
    if (this.status.mixerAudioShadow.active && key === this.mixerAudioConfigKey) return { active: true }
    await this.stopMixerAudioShadowImpl()
    try {
      const sources = config.sourceIds.map((id) => {
        let generation = randomBytes(8).readBigUInt64LE()
        if (generation === 0n) generation = 1n
        const ringName = `Local\\ilyStream.Mixer.Source.${randomBytes(16).toString('hex')}`
        createSharedMixerSourceWriter({
          ringName,
          generation,
          sampleRate: 48_000,
          channels: 2,
          capacityFrames: 96_256,
          blockFrames: 1_024
        })
        this.mixerSourceRings.set(id, ringName)
        return { id, ringName, generation: generation.toString(), gain: 1, pan: 0, mono: false }
      })
      const output = await client.startMixerTransport(sources)
      startSharedCaptureReader({
        ...output,
        exclusive: false,
        chunkFrames: output.blockFrames
      }, frame => this.onNativeMixerAudio(frame.pcm))
      this.mixerAudioConfigKey = key
      this.status.mixerAudioShadow = {
        enabled: true, active: true, sourceCount: sources.length,
        sourceFrames: 0, nativeFrames: 0, comparedBlocks: 0, mismatches: 0,
        rejected: 0, droppedComparisons: 0, maxError: 0, lastError: null,
        startedAt: Date.now(), lastComparedAt: null
      }
      this.diagnosticsCache = null
      return { active: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.status.mixerAudioShadow.lastError = message
      await this.stopMixerAudioShadowImpl()
      return { active: false, error: message }
    }
  }

  pushMixerAudioShadowSource(value: unknown): void {
    if (!this.status.mixerAudioShadow.active) return
    const frame = parseNativeMixerAudioShadowFrame(value)
    const ringName = frame ? this.mixerSourceRings.get(frame.sourceId) : undefined
    if (!frame || !ringName || !pushSharedMixerSource(ringName, frame.data, process.hrtime.bigint())) {
      this.status.mixerAudioShadow.rejected++
      return
    }
    this.status.mixerAudioShadow.sourceFrames += 1_024
  }

  pushMixerAudioShadowReference(value: unknown): void {
    if (!this.status.mixerAudioShadow.active) return
    const frame = parseNativeMixerAudioReferenceFrame(value)
    if (!frame) {
      this.status.mixerAudioShadow.rejected++
      return
    }
    this.expectedMixerBlocks.push(new Float32Array(
      frame.data.buffer.slice(frame.data.byteOffset, frame.data.byteOffset + frame.data.byteLength)
    ))
    this.trimMixerComparisonQueues()
    this.compareMixerAudioBlocks()
  }

  stopMixerAudioShadow(): Promise<void> {
    const operation = this.mixerAudioOperation.then(() => this.stopMixerAudioShadowImpl())
    this.mixerAudioOperation = operation.then(() => undefined, () => undefined)
    return operation
  }

  private async stopMixerAudioShadowImpl(): Promise<void> {
    this.mixerAudioEpoch++
    this.diagnosticsCache = null
    if (this.status.mixerAudioShadow.active) stopSharedCaptureReader()
    await this.client?.stopMixerTransport().catch(() => undefined)
    for (const ringName of this.mixerSourceRings.values()) closeSharedMixerSourceWriter(ringName)
    this.mixerSourceRings.clear()
    this.mixerAudioConfigKey = ''
    this.expectedMixerBlocks = []
    this.actualMixerBlocks = []
    this.status.mixerAudioShadow.active = false
    this.status.mixerAudioShadow.sourceCount = 0
  }

  private onNativeMixerAudio(pcm: Float32Array): void {
    if (!this.status.mixerAudioShadow.active || pcm.length !== 2_048) return
    this.status.mixerAudioShadow.nativeFrames += 1_024
    this.actualMixerBlocks.push(new Float32Array(pcm))
    this.trimMixerComparisonQueues()
    this.compareMixerAudioBlocks()
  }

  private trimMixerComparisonQueues(): void {
    const maxQueuedBlocks = 8
    while (this.expectedMixerBlocks.length > maxQueuedBlocks) {
      this.expectedMixerBlocks.shift()
      this.status.mixerAudioShadow.droppedComparisons++
    }
    while (this.actualMixerBlocks.length > maxQueuedBlocks) {
      this.actualMixerBlocks.shift()
      this.status.mixerAudioShadow.droppedComparisons++
    }
  }

  private compareMixerAudioBlocks(): void {
    while (this.expectedMixerBlocks.length && this.actualMixerBlocks.length) {
      const expected = this.expectedMixerBlocks.shift()!
      const actual = this.actualMixerBlocks.shift()!
      let maxError = 0
      for (let index = 0; index < expected.length; index++) {
        maxError = Math.max(maxError, Math.abs(expected[index] - actual[index]))
      }
      this.status.mixerAudioShadow.comparedBlocks++
      this.status.mixerAudioShadow.lastComparedAt = Date.now()
      this.status.mixerAudioShadow.maxError = Math.max(this.status.mixerAudioShadow.maxError, maxError)
      if (maxError > 1e-4) {
        this.status.mixerAudioShadow.mismatches++
        const count = this.status.mixerAudioShadow.mismatches
        if (count === 1 || count % 100 === 0) {
          console.warn(`[native-core] Mixer audio shadow mismatch (${count}), max error ${maxError}`)
        }
      }
    }
  }

  private async drainMixerShadow(initial: NativeMixerShadowSnapshot): Promise<void> {
    this.mixerShadowInFlight = true
    let snapshot: NativeMixerShadowSnapshot | null = initial
    try {
      while (snapshot && this.client && this.status.running) {
        this.pendingMixerShadow = null
        try {
          const result = await this.client.evaluateMixer(toNativeMixerHostRequest(snapshot))
          const mismatch = compareNativeMixerShadow(snapshot, result)
          this.status.mixerShadow.evaluated++
          this.status.mixerShadow.lastSequence = snapshot.sequence
          if (mismatch) {
            this.status.mixerShadow.mismatches++
            this.status.mixerShadow.lastMismatch = mismatch
            const count = this.status.mixerShadow.mismatches
            if (count === 1 || count % 100 === 0) {
              console.warn(`[native-core] Mixer shadow mismatch (${count}): ${mismatch}`)
            }
          }
        } catch (error) {
          this.status.mixerShadow.mismatches++
          this.status.mixerShadow.lastMismatch = error instanceof Error ? error.message : String(error)
          const count = this.status.mixerShadow.mismatches
          if (count === 1 || count % 100 === 0) {
            console.warn(`[native-core] Mixer shadow evaluation failed (${count}):`, this.status.mixerShadow.lastMismatch)
          }
        }
        snapshot = this.pendingMixerShadow
      }
    } finally {
      this.mixerShadowInFlight = false
    }
  }

  async dispose(): Promise<void> {
    await this.stopMixerAudioShadow()
    const client = this.client
    this.client = null
    this.pendingMixerShadow = null
    stopSharedCaptureReader()
    if (client) await client.stop()
    this.status.running = false
    this.status.health = null
  }
}
