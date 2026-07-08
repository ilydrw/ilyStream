import ffmpegPath from 'ffmpeg-static'
import { EventEmitter } from 'events'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { app, powerSaveBlocker } from 'electron'

// Fix for packaged apps: ffmpeg-static path might point into app.asar
// We must use the asar-unpacked version for the binary to be executable.
const resolvedFfmpegPath = (ffmpegPath || 'ffmpeg').replace('app.asar', 'app.asar.unpacked')
const RECORDING_CONTAINERS = new Set(['mkv', 'mp4', 'mov', 'flv'])

import { resolveRecordingCodec, StreamingEncoderResolver } from './streaming/encoder-resolver'
import type { AudioFramePayload, RecordingConfig, StreamConfig, StreamOutputStatus, VideoFramePayload } from './streaming-types'
export type { AudioFramePayload, RecordingConfig, StreamConfig, StreamOutputStatus, VideoFramePayload } from './streaming-types'
import { FFmpegArgsBuilder } from './streaming/ffmpeg-args'
import { StreamSession, type StreamSessionConfig } from './streaming/stream-session'
import { MediaPumper } from './streaming/media-pumper'
import { FFmpegProcessManager } from './streaming/ffmpeg-process-manager'

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
  state: StreamOutputStatus['state']
  startedAt: number
  retries: number
  lastError?: string
  retryTimer: ReturnType<typeof setTimeout> | null
  // Fires after the session has been live long enough to be considered healthy;
  // resets `retries` so past blips don't count against future reconnects.
  stableTimer: ReturnType<typeof setTimeout> | null
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
  private encoderResolver = new StreamingEncoderResolver(resolvedFfmpegPath)
  private argsBuilder = new FFmpegArgsBuilder(this.encoderResolver)

  private streamAudioEnabled = false
  private recordingAudioEnabled = false

  // Recording auto-restart bookkeeping (see maybeRestartRecording).
  private recordingConfig: RecordingConfig | null = null
  private recordingStopping = false
  private recordingRetries = 0
  private recordingRestartTimer: ReturnType<typeof setTimeout> | null = null

  // Snapshot of per-output drop counts from the previous status emission, used to
  // detect whether an output is *actively* dropping (not just historically).
  private lastDropSnapshot = new Map<string, { video: number; audio: number }>()
  private outputsHeartbeat: ReturnType<typeof setInterval> | null = null

  constructor() {
    super()
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
      this.recordingManager.start(resolvedFfmpegPath, args, this.recordingAudioEnabled)
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
    this.checkPowerSave()
    this.stopSilentClockIfIdle()
    this.releaseInputFormatIfIdle()
    if (!this.isStreaming) this.pumper.stopWatchdog()
    this.emit('recording-stopped')
    this.emitStatusChanged(isError ? 'error' : 'recording-stopped', isError ? summary : undefined)
  }

  private emitStatusChanged(state: string, error?: string): void {
    this.emit('status', {
      state,
      error,
      streaming: this.isStreaming,
      recording: this.isRecording,
      streamAudioEnabled: this.streamAudioEnabled,
      recordingAudioEnabled: this.recordingAudioEnabled,
      outputs: this.getOutputsStatus(),
      at: Date.now()
    })
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
        lastError: runtime.lastError
      }
    })
  }

  public async startStream(config: StreamConfig): Promise<void> {
    // Every destination is its own StreamSession. Callers all pass an
    // explicit outputId today; the fallback keeps the API total.
    return this.startStreamOutput(config.outputId || 'primary', config)
  }

  public stopStream(): void {
    if (this.streamOutputs.size > 0) {
      for (const id of [...this.streamOutputs.keys()]) this.stopStreamOutput(id)
    }
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

    this.recordingManager.start(resolvedFfmpegPath, args, this.recordingAudioEnabled)

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
    this.emit('recording-started')
    this.emitStatusChanged('recording-started')
  }

  public stopRecording(): void {
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
    this.recordingManager.stop()
    this.isRecording = false
    this.recordingAudioEnabled = false
    this.activeRecordingPath = null
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
      this.recordingManager.writeVideo(frame.data)
    }
  }

  public feedAudioFrame(audioData: Uint8Array | AudioFramePayload): void {
    if (!this.isStreaming && !this.isRecording) return
    const frame = normalizeAudioFramePayload(audioData)
    const framesInChunk = frame.data.byteLength / 4 / 2

    let acceptedByRecording = false
    if (this.isRecording) acceptedByRecording = this.recordingManager.writeAudio(frame.data)

    for (const runtime of this.streamOutputs.values()) {
      if (runtime.sessionConfig.audioEnabled) runtime.session?.pushAudioFrame(frame.data)
    }

    if (acceptedByRecording || this.streamOutputs.size > 0) {
      this.pumper.incrementSamples(framesInChunk)
    }
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
    if (this.streamOutputs.has(id)) this.stopStreamOutput(id)
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
      state: 'live',
      startedAt: Date.now(),
      retries: 0,
      retryTimer: null,
      stableTimer: null
    }

    this.streamOutputs.set(id, runtime)
    this.spawnOutputSession(runtime)
    this.updateStreamingState()
    this.syncOutputsHeartbeat()
    this.emit('started')
    this.emitStatusChanged('started')
  }

  /** Keep a low-rate status heartbeat running exactly while outputs exist. */
  private syncOutputsHeartbeat(): void {
    const shouldRun = this.streamOutputs.size > 0
    if (shouldRun && !this.outputsHeartbeat) {
      this.outputsHeartbeat = setInterval(
        () => this.emitStatusChanged('outputs-health'),
        OUTPUT_HEALTH_INTERVAL_MS
      )
      ;(this.outputsHeartbeat as any)?.unref?.()
    } else if (!shouldRun && this.outputsHeartbeat) {
      clearInterval(this.outputsHeartbeat)
      this.outputsHeartbeat = null
    }
  }

  private spawnOutputSession(runtime: OutputRuntime): void {
    const id = runtime.sessionConfig.id
    const session = new StreamSession(runtime.sessionConfig)
    runtime.session = session
    runtime.state = 'live'

    // Once this (re)connected session has stayed live long enough, consider the
    // link healthy again and forget prior failures — so a handful of blips over
    // a multi-hour stream never exhaust the give-up cap.
    if (runtime.stableTimer) clearTimeout(runtime.stableTimer)
    runtime.stableTimer = setTimeout(() => {
      runtime.stableTimer = null
      if (runtime.retries > 0) {
        console.log(`[Streaming:${id}] Stable for ${OUTPUT_STABILITY_RESET_MS / 1000}s — resetting reconnect counter`)
        runtime.retries = 0
      }
    }, OUTPUT_STABILITY_RESET_MS)
    ;(runtime.stableTimer as any)?.unref?.()

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

    runtime.session = null
    runtime.lastError = message
    // Failure before the stability window elapsed — this reconnect counts.
    if (runtime.stableTimer) {
      clearTimeout(runtime.stableTimer)
      runtime.stableTimer = null
    }

    if (runtime.retries >= OUTPUT_MAX_RESTARTS) {
      const name = runtime.sessionConfig.name
      console.error(`[Streaming:${id}] Giving up after ${runtime.retries} consecutive restarts: ${message}`)
      this.removeStreamOutput(id)
      this.emitStatusChanged('output-error', `${name}: ${message} (gave up after ${OUTPUT_MAX_RESTARTS} restarts)`)
      if (this.streamOutputs.size === 0 && !this.isStreaming) {
        this.emitStatusChanged('error', `${name}: ${message}`)
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
    console.warn(`[Streaming:${id}] ${message} — restarting in ${delay}ms (attempt ${runtime.retries}/${OUTPUT_MAX_RESTARTS})`)
    this.emitStatusChanged('output-reconnecting', `${runtime.sessionConfig.name}: reconnecting…`)

    runtime.retryTimer = setTimeout(() => {
      runtime.retryTimer = null
      // The user may have stopped the stream while we were waiting.
      if (!this.streamOutputs.has(id)) return
      this.spawnOutputSession(runtime)
      this.emitStatusChanged('output-recovered')
    }, delay)
    ;(runtime.retryTimer as any)?.unref?.()
  }

  public stopStreamOutput(id: string) {
    const runtime = this.streamOutputs.get(id)
    if (runtime) {
      if (runtime.retryTimer) clearTimeout(runtime.retryTimer)
      runtime.retryTimer = null
      runtime.session?.stop()
      this.removeStreamOutput(id)
      this.emitStatusChanged(this.isStreaming ? 'output-stopped' : 'stopped')
    }
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

function normalizeVideoFramePayload(frameData: Uint8Array | VideoFramePayload): VideoFramePayload {
  return 'data' in frameData ? frameData : { data: frameData }
}

function normalizeAudioFramePayload(audioData: Uint8Array | AudioFramePayload): AudioFramePayload {
  return 'data' in audioData ? audioData : { data: audioData }
}
