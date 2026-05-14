import ffmpegPath from 'ffmpeg-static'
import { EventEmitter } from 'events'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { app, powerSaveBlocker } from 'electron'

// Fix for packaged apps: ffmpeg-static path might point into app.asar
// We must use the asar-unpacked version for the binary to be executable.
const resolvedFfmpegPath = (ffmpegPath || 'ffmpeg').replace('app.asar', 'app.asar.unpacked')

import { StreamingEncoderResolver } from './streaming/encoder-resolver'
import type { AudioFramePayload, RecordingConfig, StreamConfig, VideoFramePayload } from './streaming-types'
export type { AudioFramePayload, RecordingConfig, StreamConfig, VideoFramePayload } from './streaming-types'
import { FFmpegArgsBuilder } from './streaming/ffmpeg-args'
import { StreamSession } from './streaming/stream-session'
import { MediaPumper } from './streaming/media-pumper'
import { FFmpegProcessManager } from './streaming/ffmpeg-process-manager'

export class StreamingService extends EventEmitter {
  private isStreaming: boolean = false
  private isRecording: boolean = false
  private powerSaveId: number | null = null
  private activeInputFormat: 'h264' | 'mjpeg' | null = null
  private activeRecordingPath: string | null = null

  private streamManager = new FFmpegProcessManager('stream')
  private recordingManager = new FFmpegProcessManager('recording')
  private pumper = new MediaPumper()
  private streamOutputs = new Map<string, StreamSession>()
  private encoderResolver = new StreamingEncoderResolver(resolvedFfmpegPath)
  private argsBuilder = new FFmpegArgsBuilder(this.encoderResolver)

  private streamAudioEnabled = false
  private recordingAudioEnabled = false

  constructor() {
    super()
    this.setupManagers()
  }

  private setupManagers() {
    this.streamManager.on('error', (err) => this.handleManagerError('stream', err))
    this.streamManager.on('close', (code, signal, summary) => {
      this.isStreaming = false
      this.checkPowerSave()
      this.stopSilentClockIfIdle()
      this.pumper.stopWatchdog()
      this.emit('stopped')
      this.emitStatusChanged(code === 0 ? 'stopped' : 'error', code === 0 ? undefined : summary)
    })

    this.recordingManager.on('error', (err) => this.handleManagerError('recording', err))
    this.recordingManager.on('close', (code, signal, summary) => {
      this.isRecording = false
      this.checkPowerSave()
      this.stopSilentClockIfIdle()
      if (!this.isStreaming) this.pumper.stopWatchdog()
      this.emit('recording-stopped')
      this.emitStatusChanged(code === 0 ? 'recording-stopped' : 'error', code === 0 ? undefined : summary)
    })

    this.pumper.on('clock', (totalSamples) => this.emit('native-clock', { totalSamples }))
  }

  private handleManagerError(kind: 'stream' | 'recording', error: Error) {
    this.emitStatusChanged('error', error.message)
  }

  private emitStatusChanged(state: string, error?: string): void {
    this.emit('status', {
      state,
      error,
      streaming: this.isStreaming,
      recording: this.isRecording,
      streamAudioEnabled: this.streamAudioEnabled,
      recordingAudioEnabled: this.recordingAudioEnabled,
      at: Date.now()
    })
  }

  public async startStream(config: StreamConfig): Promise<void> {
    if (config.outputId) return this.startStreamOutput(config.outputId, config)
    if (this.isStreaming) this.stopStream()

    if (!this.isRecording) this.pumper.resetSamples()
    this.ensurePowerSave()

    if (!resolvedFfmpegPath) throw new Error('FFmpeg binary not found')

    const rtmpUrl = this.normalizeRtmpUrl(config.rtmpUrl)
    let finalKey = config.streamKey
    const fullUrl = `${rtmpUrl.replace(/\/$/, '')}/${finalKey}`
    const redactedFullUrl = `${rtmpUrl.replace(/\/$/, '')}/[REDACTED]`
    const inputFormat = config.inputFormat || 'mjpeg'
    const bestEncoder = await this.encoderResolver.getBestEncoder()
    const audioFormat = config.audioFormat || 'silent'

    this.reserveInputFormat(inputFormat)
    const args = await this.argsBuilder.buildStreamArgs(config, fullUrl, bestEncoder)

    const redact = (val: string) => val.replaceAll(fullUrl, redactedFullUrl).replaceAll(config.streamKey, '[REDACTED]')
    console.log(`[Streaming] Starting ${inputFormat} stream to ${redactedFullUrl}`)

    this.streamAudioEnabled = audioFormat === 'f32le'
    this.streamManager.start(resolvedFfmpegPath, args, this.streamAudioEnabled, redact)

    if (inputFormat === 'mjpeg') {
      this.pumper.startVideoPump(config.fps, (frame) => {
        if (this.isStreaming) this.streamManager.writeVideo(frame)
        if (this.isRecording) this.recordingManager.writeVideo(frame)
      })
    } else {
      this.pumper.stopVideoPump()
    }

    this.pumper.startWatchdog('stream', () => this.streamManager.getStats())

    if (audioFormat === 'silent') {
      this.pumper.startSilentClock((totalSamples) => this.emit('native-clock', { totalSamples }))
    }

    this.isStreaming = true
    this.emit('started')
    this.emitStatusChanged('started')
  }

  public stopStream(): void {
    if (this.streamOutputs.size > 0) {
      for (const id of [...this.streamOutputs.keys()]) this.stopStreamOutput(id)
    }
    this.streamManager.stop()
    this.isStreaming = false
    this.streamAudioEnabled = false
    this.stopSilentClockIfIdle()
    this.checkPowerSave()
    this.emit('stopped')
    this.emitStatusChanged('stopped')
  }

  public async startRecording(config: RecordingConfig): Promise<void> {
    if (this.isRecording) return
    if (!this.isStreaming) this.pumper.resetSamples()
    this.ensurePowerSave()

    if (!resolvedFfmpegPath) throw new Error('FFmpeg binary not found')

    const inputFormat = config.inputFormat || 'mjpeg'
    const bestEncoder = await this.encoderResolver.getBestEncoder()
    this.reserveInputFormat(inputFormat)

    const outputPath = config.outputPath || this.createDefaultRecordingPath()
    const dir = dirname(outputPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    const args = await this.argsBuilder.buildRecordArgs({ ...config, outputPath }, bestEncoder)
    this.recordingAudioEnabled = config.audioFormat === 'f32le'
    this.activeRecordingPath = outputPath

    this.recordingManager.start(resolvedFfmpegPath, args, this.recordingAudioEnabled)

    if (inputFormat === 'mjpeg') {
      this.pumper.startVideoPump(config.fps, (frame) => {
        if (this.isStreaming) this.streamManager.writeVideo(frame)
        if (this.isRecording) this.recordingManager.writeVideo(frame)
      })
    }

    if (!this.isStreaming) {
      this.pumper.startWatchdog('recording', () => this.recordingManager.getStats())
    }

    this.isRecording = true
    this.emit('recording-started')
    this.emitStatusChanged('recording-started')
  }

  public stopRecording(): void {
    if (!this.isRecording) return
    this.recordingManager.stop()
    this.isRecording = false
    this.recordingAudioEnabled = false
    this.stopSilentClockIfIdle()
    this.checkPowerSave()
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
    if (this.activeInputFormat === 'h264') {
      if (this.isStreaming) this.streamManager.writeVideo(frame.data)
      if (this.isRecording) this.recordingManager.writeVideo(frame.data)
    }
  }

  public feedAudioFrame(audioData: Uint8Array | AudioFramePayload): void {
    if (!this.isStreaming && !this.isRecording) return
    const frame = normalizeAudioFramePayload(audioData)
    const framesInChunk = frame.data.byteLength / 4 / 2

    let acceptedByStream = false
    let acceptedByRecording = false

    if (this.isStreaming) acceptedByStream = this.streamManager.writeAudio(frame.data)
    if (this.isRecording) acceptedByRecording = this.recordingManager.writeAudio(frame.data)

    for (const session of this.streamOutputs.values()) {
      if (session.config.audioEnabled) session.pushAudioFrame(frame.data)
    }

    if (acceptedByStream || acceptedByRecording || this.streamOutputs.size > 0) {
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
    const bestEncoder = await this.encoderResolver.getBestEncoder()
    const audioFormat = config.audioFormat || 'silent'

    this.reserveInputFormat(inputFormat)
    const args = await this.argsBuilder.buildStreamArgs(config, fullUrl, bestEncoder)
    const redact = (val: string) => val.replaceAll(fullUrl, redactedFullUrl).replaceAll(config.streamKey, '[REDACTED]')

    const session = new StreamSession({
      id,
      name: config.outputName || id,
      ffmpegPath: resolvedFfmpegPath,
      args,
      inputFormat,
      audioEnabled: audioFormat === 'f32le',
      fps: config.fps,
      redactSecret: redact
    })

    session.on('error', (err) => {
      session.stop()
      this.emitStatusChanged('error', `${session.config.name}: ${err.message}`)
    })

    session.on('close', (code, signal) => {
      this.removeStreamOutput(id)
      if (code !== 0) {
        this.emitStatusChanged('error', `${config.outputName || id} exited with code ${code}`)
      } else if (this.streamOutputs.size === 0 && !this.isStreaming) {
        this.emitStatusChanged('stopped')
      }
    })

    this.streamOutputs.set(id, session)
    this.isStreaming = true
    this.streamAudioEnabled = Array.from(this.streamOutputs.values()).some(s => s.config.audioEnabled) || this.streamAudioEnabled
    this.emit('started')
    this.emitStatusChanged('started')
  }

  public stopStreamOutput(id: string) {
    const session = this.streamOutputs.get(id)
    if (session) {
      session.stop()
      this.removeStreamOutput(id)
    }
  }

  private removeStreamOutput(id: string) {
    this.streamOutputs.delete(id)
    this.isStreaming = this.streamOutputs.size > 0 || this.streamManager.getStats() !== '' // Rough check
    // Logic for updating isStreaming is simplified here for brevity
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
    if (exact) return [exact]
    const layoutPrefix = `${outputId}:`
    return Array.from(this.streamOutputs.entries())
      .filter(([id]) => id.startsWith(layoutPrefix))
      .map(([, session]) => session)
  }

  private createDefaultRecordingPath(): string {
    const folder = join(app.getPath('videos'), 'ilyStream', 'Recordings')
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
    return join(folder, `ilyStream_${stamp}.mp4`)
  }
}

function normalizeVideoFramePayload(frameData: Uint8Array | VideoFramePayload): VideoFramePayload {
  return 'data' in frameData ? frameData : { data: frameData }
}

function normalizeAudioFramePayload(audioData: Uint8Array | AudioFramePayload): AudioFramePayload {
  return 'data' in audioData ? audioData : { data: audioData }
}
