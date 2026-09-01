import ffmpegPath from 'ffmpeg-static'
import { EventEmitter } from 'events'
import { accessSync, constants, existsSync, mkdirSync, statfsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app, powerSaveBlocker } from 'electron'

// Fix for packaged apps: ffmpeg-static path might point into app.asar
// We must use the asar-unpacked version for the binary to be executable.
const resolvedFfmpegPath = (ffmpegPath || 'ffmpeg').replace('app.asar', 'app.asar.unpacked')
const RECORDING_CONTAINERS = new Set(['mkv', 'mp4', 'mov', 'flv'])

import { resolveRecordingCodec, StreamingEncoderResolver } from './streaming/encoder-resolver'
import type { AudioFramePayload, RecordingConfig, StreamConfig, StreamIncidentKind, StreamingPreflightStatus, StreamOutputStatus, VideoFramePayload } from './streaming-types'
export type { AudioFramePayload, RecordingConfig, StreamConfig, StreamIncident, StreamingPreflightStatus, StreamOutputStatus, VideoFramePayload } from './streaming-types'
import { FFmpegArgsBuilder } from './streaming/ffmpeg-args'
import { StreamSession, type StreamSessionConfig } from './streaming/stream-session'
import { MediaPumper } from './streaming/media-pumper'
import { NativeAudioSource, type NativeAudioHost } from '../audio/native-audio-source'
import { FFmpegProcessManager } from './streaming/ffmpeg-process-manager'
import { AdaptiveBitrateController, type EncoderHealthSample } from './streaming/adaptive-bitrate'
import { StreamIncidentLog } from './streaming/stream-incident-log'

// Consecutive failures (within a stability window) before we give up on a
// destination. Because `retries` resets after a session stays live for
// OUTPUT_STABILITY_RESET_MS, transient blips spread across a long broadcast
// never accumulate to this cap — only a genuinely broken destination does.
const OUTPUT_MAX_RESTARTS = 10
const OUTPUT_RESTART_BASE_DELAY_MS = 1000
const OUTPUT_RESTART_MAX_DELAY_MS = 30_000
const OUTPUT_STABILITY_RESET_MS = 60_000
// Recording restarts into a new numbered file on an unexpected ffmpeg death so a
// long session isn't lost to one transient hiccup.
const RECORDING_MAX_RESTARTS = 3
const RECORDING_RESTART_DELAY_MS = 1500
// While any output is live, push a status snapshot on this cadence so the UI
// can show live health (the `degraded` flag compares drop counts between
// consecutive snapshots — without a heartbeat it would only update on
// start/stop/reconnect transitions).
const OUTPUT_HEALTH_INTERVAL_MS = 2000

/**
 * One multistream destination: the live ffmpeg session plus everything needed
 * to respawn it if the process dies mid-stream (args are already built and
 * secrets already baked in, so a restart is a cheap re-spawn).
 */
interface OutputRuntime {
  sessionConfig: StreamSessionConfig
  session: StreamSession | null
  /** User-configured bitrate — the baseline adaptive bitrate scales from. */
  bitrateKbps: number
  state: StreamOutputStatus['state']
  startedAt: number
  retries: number
  lastError?: string
  retryTimer: ReturnType<typeof setTimeout> | null
  // Fires after the session has been live long enough to be considered healthy;
  // resets `retries` so past blips don't count against future reconnects.
  stableTimer: ReturnType<typeof setTimeout> | null
  /** Distinguishes initial connection from a confirmed reconnect. */
  everConnected: boolean
}

interface NativeMixerShadowHost {
  evaluateMixerShadow(value: unknown): void
  configureMixerAudioShadow(value: unknown): Promise<{ active: boolean; error?: string }>
  pushMixerAudioShadowSource(value: unknown): void
  pushMixerAudioShadowReference(value: unknown): void
  stopMixerAudioShadow(): Promise<void>
}

export class StreamingService extends EventEmitter {
  private isStreaming: boolean = false
  private isRecording: boolean = false
  private powerSaveId: number | null = null
  private activeInputFormat: 'h264' | 'mjpeg' | null = null
  private activeRecordingPath: string | null = null

  // Live streaming runs exclusively through per-destination StreamSessions in
  // `streamOutputs` (reconnect + CFR pacing per output). FFmpegProcessManager
  // remains for the single recording pipeline only.
  private recordingManager = new FFmpegProcessManager('recording')
  private pumper = new MediaPumper()
  private streamOutputs = new Map<string, OutputRuntime>()
  private streamStopPromise: Promise<void> | null = null
  private outputStopPromises = new Map<string, Promise<void>>()
  private encoderResolver = new StreamingEncoderResolver(resolvedFfmpegPath)
  private argsBuilder = new FFmpegArgsBuilder(this.encoderResolver)

  private streamAudioEnabled = false
  private recordingAudioEnabled = false
  // Opt-in native device capture. When it runs it REPLACES the renderer's
  // AudioWorklet feed rather than adding to it — both feeding would double the
  // audio and desync the sample clock.
  private nativeAudio: NativeAudioSource
  private nativeMixerShadowHost?: NativeMixerShadowHost

  // Recording auto-restart bookkeeping (see maybeRestartRecording).
  private recordingConfig: RecordingConfig | null = null
  private recordingStopping = false
  private recordingRetries = 0
  private recordingRestartTimer: ReturnType<typeof setTimeout> | null = null

  // Snapshot of per-output drop counts from the previous status emission, used to
  // detect whether an output is *actively* dropping (not just historically).
  private lastDropSnapshot = new Map<string, { video: number; audio: number }>()
  private outputsHeartbeat: ReturnType<typeof setInterval> | null = null
  private adaptiveBitrate = new AdaptiveBitrateController()
  private streamIncidents = new StreamIncidentLog()

  constructor(nativeAudioHost?: NativeAudioHost & NativeMixerShadowHost) {
    super()
    this.nativeAudio = new NativeAudioSource(nativeAudioHost)
    this.nativeMixerShadowHost = nativeAudioHost
    this.setupManagers()
    // Resolve the hardware encoder in the background now so the first go-live
    // doesn't pay for the GPU/ffmpeg probes (which used to block the main thread).
    this.encoderResolver.warmUp('h264')
  }

  private setupManagers() {
    // Route through the restart path (which handles teardown + status itself).
    this.recordingManager.on('error', (err) => this.handleRecordingExit(true, err.message))
    // FFmpegProcessManager suppresses 'close' on an intentional stop, so any
    // close that reaches here is an UNEXPECTED exit (crash or self-EOF).
    this.recordingManager.on('close', (code, signal, summary) => {
      this.handleRecordingExit(code !== 0, summary)
    })

    this.pumper.on('clock', (totalSamples) => this.emit('native-clock', { totalSamples }))
  }

  /**
   * An ffmpeg recording process exited unexpectedly. If it was a genuine crash
   * (not a user stop) and we're under the restart cap, respawn into a NEW
   * numbered file so a multi-hour session isn't lost to one transient hiccup.
   */
  private handleRecordingExit(unexpected: boolean, summary?: string): void {
    if (!unexpected || this.recordingStopping || !this.recordingConfig) {
      this.finishRecording(unexpected ? summary : undefined, unexpected)
      return
    }

    if (this.recordingRetries >= RECORDING_MAX_RESTARTS) {
      console.error(`[Recording] Giving up after ${this.recordingRetries} restarts: ${summary}`)
      this.finishRecording(`${summary || 'recording failed'} (gave up after ${RECORDING_MAX_RESTARTS} restarts)`, true)
      return
    }

    this.recordingRetries += 1
    console.warn(`[Recording] ${summary} — restarting into a new file (attempt ${this.recordingRetries}/${RECORDING_MAX_RESTARTS})`)
    this.emitStatusChanged('recording-reconnecting', 'Recording stopped unexpectedly — restarting…')

    const config = this.recordingConfig
    this.recordingRestartTimer = setTimeout(() => {
      this.recordingRestartTimer = null
      if (!config || this.recordingStopping) return
      void this.restartRecording(config)
    }, RECORDING_RESTART_DELAY_MS)
    ;(this.recordingRestartTimer as any)?.unref?.()
  }

  private async restartRecording(config: RecordingConfig): Promise<void> {
    try {
      if (!resolvedFfmpegPath) throw new Error('FFmpeg binary not found')
      const recordingCodec = resolveRecordingCodec(config)
      const bestEncoder = await this.encoderResolver.getBestEncoder(recordingCodec)
      const outputPath = this.createRecordingPath(config)
      this.ensureRecordingDirectory()
      const args = await this.argsBuilder.buildRecordArgs({ ...config, outputPath }, bestEncoder)
      this.activeRecordingPath = outputPath
      this.recordingManager.start(
        resolvedFfmpegPath,
        args,
        this.recordingAudioEnabled,
        config.inputFormat || 'mjpeg'
      )
      if (!this.isStreaming) {
        this.pumper.startWatchdog('recording', () => this.recordingManager.getStats())
      }
      console.log(`[Recording] Restarted → ${outputPath}`)
      this.emitStatusChanged('recording-recovered')
    } catch (err) {
      this.finishRecording(err instanceof Error ? err.message : String(err), true)
    }
  }

  /** Terminal recording teardown (clean stop or gave-up failure). */
  private finishRecording(summary: string | undefined, isError: boolean): void {
    if (this.recordingRestartTimer) {
      clearTimeout(this.recordingRestartTimer)
      this.recordingRestartTimer = null
    }
    this.isRecording = false
    this.activeRecordingPath = null
    this.recordingAudioEnabled = false
    this.recordingConfig = null
    this.recordingRetries = 0
    this.syncNativeAudio()
    this.checkPowerSave()
    this.stopSilentClockIfIdle()
    this.releaseInputFormatIfIdle()
    if (!this.isStreaming) this.pumper.stopWatchdog()
    this.emit('recording-stopped')
    this.emitStatusChanged(isError ? 'error' : 'recording-stopped', isError ? summary : undefined)
  }

  private emitStatusChanged(state: string, error?: string): StreamOutputStatus[] {
    const outputs = this.getOutputsStatus()
    this.emit('status', {
      state,
      error,
      streaming: this.isStreaming,
      recording: this.isRecording,
      streamAudioEnabled: this.streamAudioEnabled,
      recordingAudioEnabled: this.recordingAudioEnabled,
      outputs,
      incidents: this.getRecentIncidents(),
      at: Date.now()
    })
    return outputs
  }

  /** Live status for every multistream destination. */
  public getOutputsStatus(): StreamOutputStatus[] {
    return Array.from(this.streamOutputs.entries()).map(([id, runtime]) => {
      const drops = runtime.session?.getDropStats()
      const videoDrops = drops?.video?.droppedChunks ?? 0
      const audioDrops = drops?.audio?.droppedChunks ?? 0

      // "degraded" = drops increased since the previous status snapshot, i.e. the
      // encoder/network can't keep up *right now* (vs. a stale historical count).
      const prev = this.lastDropSnapshot.get(id)
      const degraded = prev ? videoDrops > prev.video || audioDrops > prev.audio : false
      this.lastDropSnapshot.set(id, { video: videoDrops, audio: audioDrops })

      return {
        id,
        name: runtime.sessionConfig.name,
        state: runtime.state,
        startedAt: runtime.startedAt,
        retries: runtime.retries,
        droppedVideoChunks: videoDrops,
        droppedAudioChunks: audioDrops,
        degraded,
        bitrateScale: this.adaptiveBitrate.getScale(encoderIdForOutput(id)),
        lastError: runtime.lastError
      }
    })
  }

  public async startStream(config: StreamConfig): Promise<void> {
    // Every destination is its own StreamSession. Callers all pass an
    // explicit outputId today; the fallback keeps the API total.
    const outputId = config.outputId || 'primary'
    if (this.streamStopPromise) await this.streamStopPromise
    const pendingOutputStop = this.outputStopPromises.get(outputId)
    if (pendingOutputStop) await pendingOutputStop
    try {
      return await this.startStreamOutput(outputId, config)
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error)
      const message = this.redactConfigSecrets(rawMessage, config)
      this.streamIncidents.add({
        outputId,
        outputName: config.outputName || outputId,
        kind: 'failed',
        message: `Could not start: ${message}`
      })
      this.emitStatusChanged('output-error', `${config.outputName || outputId}: ${message}`)
      throw error
    }
  }

  public stopStream(): Promise<void> {
    if (this.streamStopPromise) return this.streamStopPromise

    let tracked: Promise<void>
    tracked = this.stopAllStreamOutputs().finally(() => {
      if (this.streamStopPromise === tracked) this.streamStopPromise = null
    })
    this.streamStopPromise = tracked
    return tracked
  }

  private async stopAllStreamOutputs(): Promise<void> {
    const waiters = [...this.outputStopPromises.values()]

    for (const [id, runtime] of [...this.streamOutputs.entries()]) {
      if (runtime.retryTimer) clearTimeout(runtime.retryTimer)
      runtime.retryTimer = null
      const session = runtime.session
      runtime.session = null
      this.recordOutputIncident(runtime, 'stopped', 'Output stopped')
      this.removeStreamOutput(id)
      if (session) waiters.push(session.stopAndWait())
    }

    await Promise.allSettled(waiters)
    this.updateStreamingState()
    this.stopSilentClockIfIdle()
    this.checkPowerSave()
    this.releaseInputFormatIfIdle()
    this.emit('stopped')
    this.emitStatusChanged('stopped')
  }

  public async startRecording(config: RecordingConfig): Promise<void> {
    if (this.isRecording) return
    if (!this.isStreaming) this.pumper.resetSamples()
    this.ensurePowerSave()

    if (!resolvedFfmpegPath) throw new Error('FFmpeg binary not found')

    const inputFormat = config.inputFormat || 'mjpeg'
    const recordingCodec = resolveRecordingCodec(config)
    const bestEncoder = await this.encoderResolver.getBestEncoder(recordingCodec)
    this.reserveInputFormat(inputFormat)

    const outputPath = this.createRecordingPath(config)
    this.ensureRecordingDirectory()

    const args = await this.argsBuilder.buildRecordArgs({ ...config, outputPath }, bestEncoder)
    this.recordingAudioEnabled = config.audioFormat === 'f32le'
    this.activeRecordingPath = outputPath

    this.recordingManager.start(resolvedFfmpegPath, args, this.recordingAudioEnabled, inputFormat)

    if (inputFormat === 'mjpeg') {
      this.pumper.startVideoPump(config.fps, (frame) => {
        if (this.isRecording) this.recordingManager.writeVideo(frame)
      })
    }

    if (!this.isStreaming) {
      this.pumper.startWatchdog('recording', () => this.recordingManager.getStats())
    }

    // Remember the config so an unexpected ffmpeg death can respawn into a new
    // numbered file instead of silently ending the session's recording.
    this.recordingConfig = config
    this.recordingStopping = false
    this.recordingRetries = 0
    this.isRecording = true
    this.syncNativeAudio()
    this.emit('recording-started')
    this.emitStatusChanged('recording-started')
  }

  public async stopRecording(): Promise<void> {
    if (!this.isRecording) return
    // Mark as intentional so an in-flight restart timer / close event doesn't
    // respawn a new recording after the user asked to stop.
    this.recordingStopping = true
    if (this.recordingRestartTimer) {
      clearTimeout(this.recordingRestartTimer)
      this.recordingRestartTimer = null
    }
    this.recordingConfig = null
    this.recordingRetries = 0
    this.emitStatusChanged('recording-stopping')
    await this.recordingManager.stopAndWait()
    this.isRecording = false
    this.recordingAudioEnabled = false
    this.activeRecordingPath = null
    this.syncNativeAudio()
    this.stopSilentClockIfIdle()
    this.checkPowerSave()
    this.releaseInputFormatIfIdle()
    if (!this.isStreaming) this.pumper.stopWatchdog()
    this.emit('recording-stopped')
    this.emitStatusChanged('recording-stopped')
  }

  public feedVideoFrame(frameData: Uint8Array | VideoFramePayload): void {
    if (!this.isStreaming && !this.isRecording) return
    const frame = normalizeVideoFramePayload(frameData)

    if (frame.outputId) {
      const routedSessions = this.getStreamSessionsForFrame(frame.outputId)
      routedSessions.forEach(session => session.pushVideoFrame(frame))
      if (routedSessions.length > 0) return
    }

    this.pumper.setLatestFrame(frame.data)
    if (this.activeInputFormat === 'h264' && this.isRecording) {
      this.recordingManager.writeVideo(frame)
    }
  }

  public feedAudioFrame(audioData: Uint8Array | AudioFramePayload): void {
    const frame = normalizeAudioFramePayload(audioData)
    // The renderer feed is the policy-controlled Program mix. OBS consumes the
    // same blocks independently of FFmpeg state, including when native device
    // capture owns the encoder input.
    this.emit('program-audio', frame)
    // Native capture owns the encoder's audio input while it runs. The renderer
    // keeps its worklet alive regardless (it still drives meters), so dropping
    // its frames here is what prevents a doubled feed.
    if (this.nativeAudio.active) return
    this.writeAudioFrame(frame.data)
  }

  public feedNativeMixerShadow(value: unknown): void {
    this.nativeMixerShadowHost?.evaluateMixerShadow(value)
  }

  public configureNativeMixerAudioShadow(value: unknown): Promise<{ active: boolean; error?: string }> {
    return this.nativeMixerShadowHost?.configureMixerAudioShadow(value) ?? Promise.resolve({ active: false })
  }

  public feedNativeMixerAudioShadowSource(value: unknown): void {
    this.nativeMixerShadowHost?.pushMixerAudioShadowSource(value)
  }

  public feedNativeMixerAudioShadowReference(value: unknown): void {
    this.nativeMixerShadowHost?.pushMixerAudioShadowReference(value)
  }

  public stopNativeMixerAudioShadow(): Promise<void> {
    return this.nativeMixerShadowHost?.stopMixerAudioShadow() ?? Promise.resolve()
  }

  /**
   * Renderer-generated audio (TTS + soundboard) for the native mix.
   *
   * These are synthesised in the WebAudio graph, so device capture cannot pick
   * them up. While native capture runs they arrive here on their own bus and
   * get summed into capture blocks; while it does not, they are already part of
   * the renderer's combined broadcast bus and this is a no-op.
   */
  public feedGeneratedAudioFrame(audioData: Uint8Array | AudioFramePayload): void {
    if (!this.nativeAudio.active) return
    const frame = normalizeAudioFramePayload(audioData)
    this.nativeAudio.pushGeneratedAudio(
      new Float32Array(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength / 4)
    )
  }

  private writeAudioFrame(data: Uint8Array): void {
    if (!this.isStreaming && !this.isRecording) return
    const framesInChunk = data.byteLength / 4 / 2

    let acceptedByRecording = false
    if (this.isRecording) acceptedByRecording = this.recordingManager.writeAudio(data)

    for (const runtime of this.streamOutputs.values()) {
      if (runtime.sessionConfig.audioEnabled) runtime.session?.pushAudioFrame(data)
    }

    if (acceptedByRecording || this.streamOutputs.size > 0) {
      this.pumper.incrementSamples(framesInChunk)
    }
  }

  /**
   * Bring native capture up once something needs audio, and take it down when
   * nothing does. Called after every streaming/recording state transition.
   */
  private syncNativeAudio(): void {
    const wanted = (this.isStreaming && this.streamAudioEnabled)
      || (this.isRecording && this.recordingAudioEnabled)

    if (!wanted) {
      void this.nativeAudio.stop()
      return
    }
    if (this.nativeAudio.active) return

    void this.nativeAudio.start((pcm) => this.writeAudioFrame(pcm))
  }

  public getNativeAudioStatus(): { active: boolean; framesCaptured: number; framesDropped: number } {
    return this.nativeAudio.status()
  }

  public takeScreenshot(frameData: Uint8Array): string {
    const folder = join(app.getPath('videos'), 'ilyStream', 'Screenshots')
    if (!existsSync(folder)) mkdirSync(folder, { recursive: true })
    const filePath = join(folder, `Screenshot_${Date.now()}.jpg`)
    writeFileSync(filePath, frameData)
    return filePath
  }

  public getStreamStatus() { return this.isStreaming }
  public getRecordingStatus() { return this.isRecording }
  public getRecordingOutputPath() { return this.activeRecordingPath }
  public getRecentIncidents(limit = 12) { return this.streamIncidents.list(limit) }

  public async getPreflightStatus(): Promise<StreamingPreflightStatus> {
    const checkedAt = Date.now()
    const ffmpegAvailable = Boolean(resolvedFfmpegPath && existsSync(resolvedFfmpegPath))
    let encoder: StreamingPreflightStatus['encoder'] = null
    let encoderKind: StreamingPreflightStatus['encoderKind'] = null
    let recordingWritable = false
    let recordingFreeBytes: number | null = null
    let error: string | undefined

    if (ffmpegAvailable) {
      try {
        encoder = await this.encoderResolver.getBestEncoder('h264')
        encoderKind = encoder === 'libx264' ? 'software' : 'hardware'
      } catch (err) {
        error = err instanceof Error ? err.message : String(err)
      }
    } else {
      error = 'Bundled FFmpeg binary is unavailable'
    }

    try {
      this.ensureRecordingDirectory()
      const recordingFolder = this.getRecordingFolder()
      accessSync(recordingFolder, constants.W_OK)
      recordingWritable = true
      const stats = statfsSync(recordingFolder)
      const freeBytes = Number(stats.bavail) * Number(stats.bsize)
      recordingFreeBytes = Number.isFinite(freeBytes) ? Math.max(0, freeBytes) : null
    } catch (err) {
      if (!error) {
        error = `Recording folder is unavailable: ${err instanceof Error ? err.message : String(err)}`
      }
    }

    return {
      checkedAt,
      ffmpegAvailable,
      encoder,
      encoderKind,
      recordingWritable,
      recordingFreeBytes,
      ...(error ? { error } : {})
    }
  }

  /**
   * Graceful teardown on app quit. Without this, ServiceRegistry.dispose() never
   * told the streaming service to stop, so any live ffmpeg child was orphaned and
   * an in-progress recording was left unfinalized (no moov atom / container
   * trailer) — a corrupt file on the most common shutdown path. We stop every
   * output/recording and wait (bounded) for the children to actually exit so the
   * recording flushes before app.exit().
   */
  public async dispose(): Promise<void> {
    // Prevent any in-flight restart from respawning during teardown.
    this.recordingStopping = true
    if (this.recordingRestartTimer) {
      clearTimeout(this.recordingRestartTimer)
      this.recordingRestartTimer = null
    }
    this.recordingConfig = null

    const waiters: Promise<void>[] = []

    if (this.streamStopPromise) waiters.push(this.streamStopPromise)
    waiters.push(...this.outputStopPromises.values())

    for (const runtime of this.streamOutputs.values()) {
      if (runtime.retryTimer) {
        clearTimeout(runtime.retryTimer)
        runtime.retryTimer = null
      }
      if (runtime.session) waiters.push(runtime.session.stopAndWait())
    }
    this.streamOutputs.clear()
    this.syncOutputsHeartbeat()

    waiters.push(this.recordingManager.stopAndWait())

    await Promise.allSettled(waiters)

    this.pumper.stopVideoPump()
    this.pumper.stopSilentClock()
    this.pumper.stopWatchdog()

    this.isStreaming = false
    this.isRecording = false
    this.activeRecordingPath = null
    this.activeInputFormat = null
    this.streamAudioEnabled = false
    this.recordingAudioEnabled = false
    // Unconditional, not syncNativeAudio(): dispose must release the device
    // even if state bookkeeping is inconsistent.
    await this.nativeAudio.stop()

    if (this.powerSaveId !== null) {
      try { powerSaveBlocker.stop(this.powerSaveId) } catch {}
      this.powerSaveId = null
    }
  }

  private customRecordingsFolder: string | null = null

  /** User-configured recordings folder from Settings; empty string resets to the default. */
  public setRecordingsFolder(folder: string | null | undefined): void {
    const trimmed = String(folder || '').trim()
    this.customRecordingsFolder = trimmed.length > 0 ? trimmed : null
  }

  public getRecordingsFolder(): string {
    return this.getRecordingFolder()
  }

  // --- PRIVATE HELPERS ---

  private async startStreamOutput(id: string, config: StreamConfig): Promise<void> {
    if (this.streamOutputs.has(id)) await this.stopStreamOutput(id)
    if (!resolvedFfmpegPath) throw new Error('FFmpeg binary not found')

    this.ensurePowerSave()
    const rtmpUrl = this.normalizeRtmpUrl(config.rtmpUrl)
    let finalKey = config.streamKey
    const fullUrl = `${rtmpUrl.replace(/\/$/, '')}/${finalKey}`
    const redactedFullUrl = `${rtmpUrl.replace(/\/$/, '')}/[REDACTED]`
    const inputFormat = config.inputFormat || 'mjpeg'
    const bestEncoder = await this.encoderResolver.getBestEncoder('h264')
    const audioFormat = config.audioFormat || 'silent'

    this.reserveInputFormat(inputFormat)
    const args = await this.argsBuilder.buildStreamArgs(config, fullUrl, bestEncoder)
    const redact = (val: string) => val.replaceAll(fullUrl, redactedFullUrl).replaceAll(config.streamKey, '[REDACTED]')

    const runtime: OutputRuntime = {
      sessionConfig: {
        id,
        name: config.outputName || id,
        ffmpegPath: resolvedFfmpegPath,
        args,
        inputFormat,
        audioEnabled: audioFormat === 'f32le',
        fps: config.fps,
        redactSecret: redact
      },
      session: null,
      bitrateKbps: config.bitrateKbps,
      state: 'starting',
      startedAt: Date.now(),
      retries: 0,
      retryTimer: null,
      stableTimer: null,
      everConnected: false
    }

    this.streamOutputs.set(id, runtime)
    this.spawnOutputSession(runtime)
    this.updateStreamingState()
    this.syncOutputsHeartbeat()
    this.emit('started')
    this.emitStatusChanged('output-starting')
  }

  /** Keep a low-rate status heartbeat running exactly while outputs exist. */
  private syncOutputsHeartbeat(): void {
    const shouldRun = this.streamOutputs.size > 0
    if (shouldRun && !this.outputsHeartbeat) {
      this.outputsHeartbeat = setInterval(() => {
        const outputs = this.emitStatusChanged('outputs-health')
        this.runAdaptiveBitrate(outputs)
      }, OUTPUT_HEALTH_INTERVAL_MS)
      ;(this.outputsHeartbeat as any)?.unref?.()
    } else if (!shouldRun && this.outputsHeartbeat) {
      clearInterval(this.outputsHeartbeat)
      this.outputsHeartbeat = null
    }
  }

  /**
   * Feed this heartbeat's output health into the adaptive bitrate policy and
   * broadcast any adjustments. One renderer-side WebCodecs encoder feeds
   * every destination of a layout, so health is aggregated per encoder and
   * the adjustment applies to the whole layout — same trade-off as OBS's
   * single-encoder dynamic bitrate. Only h264 outputs participate: on the
   * mjpeg path ffmpeg owns the encode and its bitrate is fixed at spawn.
   */
  private runAdaptiveBitrate(outputs: StreamOutputStatus[]): void {
    const groups = new Map<string, EncoderHealthSample>()

    for (const output of outputs) {
      const runtime = this.streamOutputs.get(output.id)
      if (!runtime || runtime.sessionConfig.inputFormat !== 'h264') continue

      const encoderId = encoderIdForOutput(output.id)
      const degraded = output.state === 'reconnecting' || output.degraded
      const existing = groups.get(encoderId)
      if (existing) {
        existing.degraded = existing.degraded || degraded
        existing.baseBitrateKbps = Math.max(existing.baseBitrateKbps, runtime.bitrateKbps)
      } else {
        groups.set(encoderId, { encoderId, baseBitrateKbps: runtime.bitrateKbps, degraded })
      }
    }

    const adjustments = this.adaptiveBitrate.observe(Array.from(groups.values()), Date.now())
    for (const adjustment of adjustments) {
      console.log(
        `[AdaptiveBitrate] ${adjustment.encoderId}: ${adjustment.direction === 'down' ? 'stepping down' : 'recovering'} ` +
        `to ${adjustment.bitrateKbps} kbps (${Math.round(adjustment.scale * 100)}% of configured)`
      )
      this.emit('adaptive-bitrate', adjustment)
    }
  }

  private spawnOutputSession(runtime: OutputRuntime): void {
    const id = runtime.sessionConfig.id
    const session = new StreamSession(runtime.sessionConfig)
    runtime.session = session
    runtime.state = runtime.everConnected ? 'reconnecting' : 'starting'

    session.once('connected', () => {
      if (runtime.session !== session || !this.streamOutputs.has(id)) return
      const recovered = runtime.everConnected
      runtime.everConnected = true
      runtime.state = 'live'
      runtime.lastError = undefined

      if (runtime.stableTimer) clearTimeout(runtime.stableTimer)
      runtime.stableTimer = setTimeout(() => {
        runtime.stableTimer = null
        if (runtime.retries > 0) {
          console.log(`[Streaming:${id}] Stable for ${OUTPUT_STABILITY_RESET_MS / 1000}s — resetting reconnect counter`)
          runtime.retries = 0
        }
      }, OUTPUT_STABILITY_RESET_MS)
      ;(runtime.stableTimer as any)?.unref?.()

      if (recovered) {
        this.recordOutputIncident(runtime, 'recovered', 'Output packets resumed', runtime.retries)
        this.emitStatusChanged('output-recovered')
      } else {
        this.recordOutputIncident(runtime, 'started', 'Output packets confirmed')
        this.emitStatusChanged('output-live')
      }
    })

    session.on('error', (err) => {
      session.stop()
      this.handleOutputFailure(id, err.message)
    })

    session.on('close', (code, signal) => {
      if (code === 0 || signal === 'SIGINT') {
        // Clean exit — treat as an intentional stop of this destination.
        this.removeStreamOutput(id)
        if (this.streamOutputs.size === 0 && !this.isStreaming) {
          this.emitStatusChanged('stopped')
        }
        return
      }
      this.handleOutputFailure(id, `exited with code ${code}`)
    })
  }

  /**
   * One destination died while others may still be live. Respawn it with a
   * short backoff instead of taking the whole broadcast down — the frames
   * keep flowing to the surviving sessions the entire time.
   */
  private handleOutputFailure(id: string, message: string): void {
    const runtime = this.streamOutputs.get(id)
    if (!runtime) return

    const safeMessage = runtime.sessionConfig.redactSecret(message)
    runtime.session = null
    runtime.lastError = safeMessage
    // Failure before the stability window elapsed — this reconnect counts.
    if (runtime.stableTimer) {
      clearTimeout(runtime.stableTimer)
      runtime.stableTimer = null
    }

    if (runtime.retries >= OUTPUT_MAX_RESTARTS) {
      const name = runtime.sessionConfig.name
      console.error(`[Streaming:${id}] Giving up after ${runtime.retries} consecutive restarts: ${safeMessage}`)
      this.recordOutputIncident(
        runtime,
        'failed',
        `${safeMessage} (gave up after ${OUTPUT_MAX_RESTARTS} restarts)`,
        runtime.retries
      )
      this.removeStreamOutput(id)
      this.emitStatusChanged('output-error', `${name}: ${safeMessage} (gave up after ${OUTPUT_MAX_RESTARTS} restarts)`)
      if (this.streamOutputs.size === 0 && !this.isStreaming) {
        this.emitStatusChanged('error', `${name}: ${safeMessage}`)
      }
      return
    }

    runtime.retries += 1
    runtime.state = 'reconnecting'
    // Capped exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (cap).
    const delay = Math.min(
      OUTPUT_RESTART_MAX_DELAY_MS,
      OUTPUT_RESTART_BASE_DELAY_MS * 2 ** (runtime.retries - 1)
    )
    console.warn(`[Streaming:${id}] ${safeMessage} — restarting in ${delay}ms (attempt ${runtime.retries}/${OUTPUT_MAX_RESTARTS})`)
    this.recordOutputIncident(
      runtime,
      'reconnecting',
      `${safeMessage}; retrying in ${Math.round(delay / 1000)}s`,
      runtime.retries
    )
    this.emitStatusChanged('output-reconnecting', `${runtime.sessionConfig.name}: reconnecting…`)

    runtime.retryTimer = setTimeout(() => {
      runtime.retryTimer = null
      // The user may have stopped the stream while we were waiting.
      if (!this.streamOutputs.has(id)) return
      this.spawnOutputSession(runtime)
      this.emitStatusChanged('output-restarting')
    }, delay)
    ;(runtime.retryTimer as any)?.unref?.()
  }

  public stopStreamOutput(id: string): Promise<void> {
    const pending = this.outputStopPromises.get(id)
    if (pending) return pending

    const runtime = this.streamOutputs.get(id)
    if (!runtime) return Promise.resolve()

    if (runtime.retryTimer) clearTimeout(runtime.retryTimer)
    runtime.retryTimer = null
    const session = runtime.session
    runtime.session = null
    this.recordOutputIncident(runtime, 'stopped', 'Output stopped')
    this.removeStreamOutput(id)

    let tracked: Promise<void>
    tracked = (session ? session.stopAndWait() : Promise.resolve())
      .then(() => {
        this.emitStatusChanged(this.isStreaming ? 'output-stopped' : 'stopped')
      })
      .finally(() => {
        if (this.outputStopPromises.get(id) === tracked) this.outputStopPromises.delete(id)
      })
    this.outputStopPromises.set(id, tracked)
    return tracked
  }

  private removeStreamOutput(id: string) {
    const runtime = this.streamOutputs.get(id)
    if (runtime?.retryTimer) clearTimeout(runtime.retryTimer)
    if (runtime?.stableTimer) clearTimeout(runtime.stableTimer)
    this.streamOutputs.delete(id)
    this.lastDropSnapshot.delete(id)
    this.updateStreamingState()
    this.syncOutputsHeartbeat()
    this.releaseInputFormatIfIdle()
    this.checkPowerSave()
  }

  private recordOutputIncident(
    runtime: OutputRuntime,
    kind: StreamIncidentKind,
    message: string,
    retry?: number
  ): void {
    this.streamIncidents.add({
      outputId: runtime.sessionConfig.id,
      outputName: runtime.sessionConfig.name,
      kind,
      message: runtime.sessionConfig.redactSecret(message),
      ...(retry === undefined ? {} : { retry })
    })
  }

  private redactConfigSecrets(message: string, config: StreamConfig): string {
    let redacted = message
    if (config.streamKey) redacted = redacted.replaceAll(config.streamKey, '[REDACTED]')
    if (config.rtmpUrl) redacted = redacted.replaceAll(config.rtmpUrl, '[RTMP SERVER]')
    return redacted
  }

  private reserveInputFormat(inputFormat: 'h264' | 'mjpeg'): void {
    if (this.activeInputFormat && this.activeInputFormat !== inputFormat) {
      throw new Error(`Cannot start ${inputFormat} output while ${this.activeInputFormat} capture is already active`)
    }
    this.activeInputFormat = inputFormat
  }

  private normalizeRtmpUrl(url: string): string {
    const trimmed = url.trim().replace(/\/$/, '')
    if (/^rtmps?:\/\/live\.twitch\.tv(?::443)?\/app$/i.test(trimmed)) {
      return 'rtmp://ingest.global-contribute.live-video.net/app'
    }
    return trimmed
  }

  private ensurePowerSave() {
    if (this.powerSaveId === null) {
      this.powerSaveId = powerSaveBlocker.start('prevent-app-suspension')
    }
  }

  private checkPowerSave() {
    if (!this.isStreaming && !this.isRecording && this.powerSaveId !== null) {
      powerSaveBlocker.stop(this.powerSaveId)
      this.powerSaveId = null
    }
  }

  private stopSilentClockIfIdle() {
    if (!this.isStreaming && !this.isRecording) {
      this.pumper.stopSilentClock()
    }
  }

  private getStreamSessionsForFrame(outputId: string): StreamSession[] {
    const exact = this.streamOutputs.get(outputId)
    if (exact) return exact.session ? [exact.session] : []
    const layoutPrefix = `${outputId}:`
    return Array.from(this.streamOutputs.entries())
      .filter(([id]) => id.startsWith(layoutPrefix))
      .map(([, runtime]) => runtime.session)
      .filter((session): session is StreamSession => session !== null)
  }

  private createRecordingPath(config: RecordingConfig): string {
    const folder = this.getRecordingFolder()
    const container = this.normalizeRecordingContainer(config.container, resolveRecordingCodec(config))
    const now = new Date()
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-') + '_' + [
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0')
    ].join('-')
    let candidate = join(folder, `ilyStream_${stamp}.${container}`)
    let suffix = 1
    while (existsSync(candidate)) {
      candidate = join(folder, `ilyStream_${stamp}_${suffix}.${container}`)
      suffix += 1
    }
    return candidate
  }

  private updateStreamingState(): void {
    this.isStreaming = this.streamOutputs.size > 0
    this.streamAudioEnabled = this.computeStreamAudioEnabled()
    this.syncNativeAudio()
  }

  private computeStreamAudioEnabled(): boolean {
    return Array.from(this.streamOutputs.values()).some(runtime => runtime.sessionConfig.audioEnabled)
  }

  private releaseInputFormatIfIdle(): void {
    if (!this.isStreaming && !this.isRecording) {
      this.activeInputFormat = null
    }
  }

  private getRecordingFolder(): string {
    return this.customRecordingsFolder || join(app.getPath('videos'), 'ilyStream', 'Recordings')
  }

  private ensureRecordingDirectory(): void {
    const folder = this.getRecordingFolder()
    if (!existsSync(folder)) mkdirSync(folder, { recursive: true })
  }

  private normalizeRecordingContainer(container?: string, codec: 'h264' | 'h265' = 'h264'): 'mkv' | 'mp4' | 'mov' | 'flv' {
    if (codec === 'h265' && container === 'flv') return 'mkv'
    return RECORDING_CONTAINERS.has(container || '') ? container as 'mkv' | 'mp4' | 'mov' | 'flv' : 'mkv'
  }
}

/**
 * The renderer runs ONE encoder per layout whose chunks fan out to every
 * `${layout}:` destination — so bitrate decisions are keyed by the layout
 * prefix ('horizontal:twitch' → 'horizontal'), matching the outputId the
 * encoder worker stamps on its frames.
 */
function encoderIdForOutput(outputId: string): string {
  const separator = outputId.indexOf(':')
  return separator > 0 ? outputId.slice(0, separator) : outputId
}

function normalizeVideoFramePayload(frameData: Uint8Array | VideoFramePayload): VideoFramePayload {
  return 'data' in frameData ? frameData : { data: frameData }
}

function normalizeAudioFramePayload(audioData: Uint8Array | AudioFramePayload): AudioFramePayload {
  return 'data' in audioData ? audioData : { data: audioData }
}
