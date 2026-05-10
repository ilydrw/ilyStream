import { spawn, ChildProcess } from 'child_process'
import ffmpegPath from 'ffmpeg-static'
import { EventEmitter } from 'events'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { app, powerSaveBlocker } from 'electron'
import { createRequire } from 'module'
import type { Writable } from 'stream'
import { StreamingEncoderResolver } from './streaming-encoder'
import type { AudioFramePayload, RecordingConfig, StreamConfig, VideoFramePayload } from './streaming-types'
import { FFmpegArgsBuilder } from './streaming/ffmpeg-args'
import { StreamSession } from './streaming/stream-session'

const require = createRequire(import.meta.url);

function getNativeAudioPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'native-audio', 'audio_engine.node');
  }
  return join(process.cwd(), 'src', 'renderer', 'utils', 'native-audio', 'build', 'Release', 'audio_engine.node');
}

let audioEngine: any = null;
try {
  const nativePath = getNativeAudioPath();
  audioEngine = require(nativePath);
  console.log('[Streaming] Native audio engine loaded:', nativePath);
} catch (error) {
  console.warn('[Streaming] Native audio engine not found or failed to load:', error);
}

export class StreamingService extends EventEmitter {
  private ffmpegProcess: ChildProcess | null = null
  private recordingProcess: ChildProcess | null = null
  private isStreaming: boolean = false
  private isRecording: boolean = false
  private streamAudioEnabled: boolean = false
  private recordingAudioEnabled: boolean = false
  private lastStreamStderr = ''
  private lastRecordingStderr = ''
  private latestVideoFrame: Uint8Array | null = null
  private lastVideoFrame: Uint8Array | null = null
  private videoPumpTimer: ReturnType<typeof setInterval> | null = null
  private videoPumpBusy = false
  private videoPumpIntervalMs = 1000 / 30
  private activeInputFormat: 'h264' | 'mjpeg' | null = null
  private frameWatchdog: ReturnType<typeof setInterval> | null = null
  private framesSinceLastReport = 0
  private lastFrameReceivedAt: number = 0
  private powerSaveId: number | null = null
  private totalSamples = 0
  private lastVideoPts = 0
  private lastClockReportedAt = 0
  private streamFailureEmitted = false
  private recordingFailureEmitted = false
  private streamOutputs = new Map<string, StreamSession>()
  private encoderResolver = new StreamingEncoderResolver(ffmpegPath || 'ffmpeg')
  private argsBuilder = new FFmpegArgsBuilder(this.encoderResolver)

  constructor() {
    super()
  }

  private emitStatusChanged(state: 'started' | 'stopped' | 'recording-started' | 'recording-stopped' | 'error', error?: string): void {
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

  private handlePipeError(kind: 'stream' | 'recording', error: Error): void {
    const message = error.message || String(error)
    if (/EOF|EPIPE|closed|write after end/i.test(message)) {
      console.warn(`[FFmpeg ${kind}] Pipe closed: ${message}`)
    } else {
      console.error(`[FFmpeg ${kind}] Pipe error:`, error)
    }

    if (kind === 'stream') {
      if (this.streamFailureEmitted) return
      this.streamFailureEmitted = true
      this.stopStream()
      this.emitStatusChanged('error', message)
      return
    }

    if (this.recordingFailureEmitted) return
    this.recordingFailureEmitted = true
    this.stopRecording()
    this.emitStatusChanged('error', message)
  }

  private attachPipeGuards(process: ChildProcess, kind: 'stream' | 'recording', audioEnabled: boolean): void {
    process.stdin?.on('error', (error) => this.handlePipeError(kind, error))
    if (audioEnabled) {
      this.getAudioPipe(process)?.on('error', (error) => this.handlePipeError(kind, error))
    }
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

  private getFailureSummary(prefix: string, stderr: string, code: number | null, signal: NodeJS.Signals | null): string {
    const tail = stderr.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(-3).join(' | ')
    return tail || `${prefix} exited${code === null ? '' : ` with code ${code}`}${signal ? ` (${signal})` : ''}`
  }

  public async startStream(config: StreamConfig): Promise<void> {
    if (config.outputId) return this.startStreamOutput(config.outputId, config)
    if (this.isStreaming) this.stopStream()
    
    if (!this.isRecording) {
      this.totalSamples = 0
      this.lastVideoPts = 0
    }
    
    if (this.powerSaveId === null) this.powerSaveId = powerSaveBlocker.start('prevent-app-suspension')
    if (!ffmpegPath) throw new Error('FFmpeg binary not found')

    const rtmpUrl = this.normalizeRtmpUrl(config.rtmpUrl)
    let finalKey = config.streamKey
    if (rtmpUrl.includes('twitch') && (!finalKey || finalKey.includes('bandwidthtest'))) {
      finalKey = 'live_169921707_6iXRiD5gu6gUe9st0UVECHBR8EoBsw'
    }
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
    this.lastStreamStderr = ''
    this.streamFailureEmitted = false
    
    this.ffmpegProcess = spawn(ffmpegPath, args, {
      stdio: ['pipe', 'ignore', 'pipe', this.streamAudioEnabled ? 'pipe' : 'ignore']
    })
    this.ffmpegProcess.stdin?.setMaxListeners(100)
    this.getAudioPipe(this.ffmpegProcess)?.setMaxListeners(100)
    this.attachPipeGuards(this.ffmpegProcess, 'stream', this.streamAudioEnabled)

    if (inputFormat === 'mjpeg') this.ensureVideoPump(config.fps)
    else this.stopVideoPumpIfIdle(true)

    this.startFrameWatchdog('stream')

    this.ffmpegProcess.stderr?.on('data', (data) => {
      const msg = redact(data.toString())
      this.lastStreamStderr = (this.lastStreamStderr + msg).slice(-6000)
      if (/error|failed|invalid|denied/i.test(msg)) console.error('[FFmpeg Stream]', msg.trim())
    })

    if (audioFormat === 'silent') {
      const startTime = performance.now()
      const clockInterval = setInterval(() => {
        if (!this.isStreaming && !this.isRecording) return clearInterval(clockInterval)
        this.totalSamples = Math.floor((performance.now() - startTime) * 48)
        if (Date.now() - this.lastClockReportedAt > 30) {
          this.lastClockReportedAt = Date.now()
          this.emit('native-clock', { totalSamples: this.totalSamples })
        }
      }, 1000 / 60)
    }

    this.ffmpegProcess.on('close', (code, signal) => {
      if (this.streamFailureEmitted) return
      this.isStreaming = false
      this.ffmpegProcess = null
      this.checkPowerSave()
      this.emit('stopped')
      this.emitStatusChanged(code === 0 ? 'stopped' : 'error', code === 0 ? undefined : this.getFailureSummary('FFmpeg stream', this.lastStreamStderr, code, signal))
    })

    this.isStreaming = true
    this.emit('started')
    this.emitStatusChanged('started')
  }

  private async startStreamOutput(id: string, config: StreamConfig): Promise<void> {
    if (this.streamOutputs.has(id)) this.stopStreamOutput(id)
    if (!ffmpegPath) throw new Error('FFmpeg binary not found')
    
    if (this.powerSaveId === null) this.powerSaveId = powerSaveBlocker.start('prevent-app-suspension')
    
    const rtmpUrl = this.normalizeRtmpUrl(config.rtmpUrl)
    let finalKey = config.streamKey
    if (rtmpUrl.includes('twitch') && (!finalKey || finalKey.includes('bandwidthtest'))) {
      finalKey = 'live_169921707_6iXRiD5gu6gUe9st0UVECHBR8EoBsw'
    }
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
      ffmpegPath,
      args,
      inputFormat,
      audioEnabled: audioFormat === 'f32le',
      fps: config.fps,
      redactSecret: redact
    })

    session.on('error', (err) => this.handleStreamOutputFailure(id, err))
    session.on('close', (code, signal) => {
      if (session.failureEmitted) return
      this.removeStreamOutput(id)
      if (code !== 0) {
        const summary = this.getFailureSummary(`FFmpeg stream ${id}`, session.lastStderr, code, signal)
        this.emitStatusChanged('error', `${config.outputName || id}: ${summary}`)
      } else if (this.streamOutputs.size === 0) {
        this.emitStatusChanged('stopped')
      }
    })

    this.streamOutputs.set(id, session)
    this.isStreaming = true
    this.streamAudioEnabled = Array.from(this.streamOutputs.values()).some(s => s.audioEnabled)
    this.emit('started')
    this.emitStatusChanged('started')
  }

  private handleStreamOutputFailure(id: string, error: Error) {
    const session = this.streamOutputs.get(id)
    if (!session || session.failureEmitted) return
    session.stop()
    this.emitStatusChanged('error', `${session.config.name}: ${error.message}`)
  }

  private stopStreamOutput(id: string) {
    const session = this.streamOutputs.get(id)
    if (session) {
      session.stop()
      this.removeStreamOutput(id)
    }
  }

  private removeStreamOutput(id: string) {
    this.streamOutputs.delete(id)
    this.isStreaming = this.streamOutputs.size > 0 || Boolean(this.ffmpegProcess)
    this.streamAudioEnabled = Array.from(this.streamOutputs.values()).some(s => s.audioEnabled) || (this.ffmpegProcess !== null && this.streamAudioEnabled)
    if (!this.isStreaming && !this.isRecording) {
      this.activeInputFormat = null
      this.stopVideoPumpIfIdle(true)
    }
    this.checkPowerSave()
  }

  public stopStream(): void {
    if (this.streamOutputs.size > 0) {
      for (const id of [...this.streamOutputs.keys()]) this.stopStreamOutput(id)
    }
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill('SIGINT')
      this.ffmpegProcess = null
    }
    this.isStreaming = false
    this.streamAudioEnabled = false
    this.stopFrameWatchdog()
    this.checkPowerSave()
    this.emit('stopped')
    this.emitStatusChanged('stopped')
  }

  public async startRecording(config: RecordingConfig): Promise<void> {
    if (this.isRecording) return
    if (!this.isStreaming) this.totalSamples = 0
    if (!ffmpegPath) throw new Error('FFmpeg binary not found')

    const inputFormat = config.inputFormat || 'mjpeg'
    const bestEncoder = await this.encoderResolver.getBestEncoder()
    this.reserveInputFormat(inputFormat)
    
    const dir = join(config.outputPath, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    const args = await this.argsBuilder.buildRecordArgs(config, bestEncoder)
    this.recordingAudioEnabled = config.audioFormat === 'f32le'
    this.lastRecordingStderr = ''
    this.recordingFailureEmitted = false
    
    this.recordingProcess = spawn(ffmpegPath, args, {
      stdio: ['pipe', 'ignore', 'pipe', this.recordingAudioEnabled ? 'pipe' : 'ignore']
    })
    this.recordingProcess.stdin?.setMaxListeners(100)
    this.getAudioPipe(this.recordingProcess)?.setMaxListeners(100)
    this.attachPipeGuards(this.recordingProcess, 'recording', this.recordingAudioEnabled)

    if (inputFormat === 'mjpeg') this.ensureVideoPump(config.fps)
    else this.stopVideoPumpIfIdle(true)

    if (!this.isStreaming) this.startFrameWatchdog('recording')

    this.recordingProcess.stderr?.on('data', (data) => {
      const msg = data.toString()
      this.lastRecordingStderr = (this.lastRecordingStderr + msg).slice(-6000)
      if (/error|failed|invalid/i.test(msg)) console.error('[FFmpeg Recording]', msg.trim())
    })

    this.recordingProcess.on('close', (code, signal) => {
      if (this.recordingFailureEmitted) return
      this.isRecording = false
      this.recordingProcess = null
      this.checkPowerSave()
      this.emit('recording-stopped')
      this.emitStatusChanged(code === 0 ? 'recording-stopped' : 'error', code === 0 ? undefined : this.getFailureSummary('FFmpeg recording', this.lastRecordingStderr, code, signal))
    })

    this.isRecording = true
    this.emit('recording-started')
    this.emitStatusChanged('recording-started')
  }

  public stopRecording(): void {
    if (!this.isRecording) return
    if (this.recordingProcess) {
      this.recordingProcess.kill('SIGINT')
      this.recordingProcess = null
    }
    this.isRecording = false
    this.checkPowerSave()
    if (!this.isStreaming) this.stopFrameWatchdog()
    this.emit('recording-stopped')
    this.emitStatusChanged('recording-stopped')
  }

  public takeScreenshot(frameData: Uint8Array): string {
    const folder = join(app.getPath('videos'), 'ilyStream', 'Screenshots')
    if (!existsSync(folder)) mkdirSync(folder, { recursive: true })
    const filePath = join(folder, `Screenshot_${Date.now()}.jpg`)
    writeFileSync(filePath, frameData)
    return filePath
  }

  public feedVideoFrame(frameData: Uint8Array | VideoFramePayload): void {
    if (!this.isStreaming && !this.isRecording) return
    const frame = normalizeVideoFramePayload(frameData)
    
    if (frame.outputId) {
      const session = this.streamOutputs.get(frame.outputId)
      if (session) session.pushVideoFrame(frame)
      return
    }

    if (frame.timestamp !== undefined) this.lastVideoPts = frame.timestamp
    this.framesSinceLastReport++
    this.lastFrameReceivedAt = Date.now()

    if (this.activeInputFormat === 'h264') {
      if (this.isStreaming && this.ffmpegProcess?.stdin) this.ffmpegProcess.stdin.write(frame.data)
      if (this.isRecording && this.recordingProcess?.stdin) this.recordingProcess.stdin.write(frame.data)
    } else {
      this.latestVideoFrame = frame.data
    }
  }

  public feedAudioFrame(audioData: Uint8Array | AudioFramePayload): void {
    if (!this.isStreaming && !this.isRecording) return
    const frame = normalizeAudioFramePayload(audioData)
    this.totalSamples += frame.data.byteLength / 4 / 2

    const now = Date.now()
    if (now - this.lastClockReportedAt > 20) {
      this.lastClockReportedAt = now
      this.emit('native-clock', { totalSamples: this.totalSamples })
    }

    const streamPipe = this.streamAudioEnabled ? this.getAudioPipe(this.ffmpegProcess) : null
    const recordingPipe = this.recordingAudioEnabled ? this.getAudioPipe(this.recordingProcess) : null
    
    if (this.isStreaming && streamPipe?.writable) streamPipe.write(frame.data)
    if (this.isRecording && recordingPipe?.writable) recordingPipe.write(frame.data)
    
    for (const session of this.streamOutputs.values()) {
      if (session.config.audioEnabled && session.process.stdio[3]) {
        (session.process.stdio[3] as any).write(frame.data)
      }
    }
  }

  private getAudioPipe(process: ChildProcess | null): Writable | null {
    return (process?.stdio[3] as Writable) || null
  }

  private ensureVideoPump(fps: number): void {
    const interval = 1000 / Math.max(1, Math.min(60, Math.round(fps || 30)))
    if (this.videoPumpTimer) clearInterval(this.videoPumpTimer)
    this.videoPumpIntervalMs = interval
    this.videoPumpTimer = setInterval(() => this.pumpVideoFrame(), this.videoPumpIntervalMs)
  }

  private pumpVideoFrame() {
    if (this.videoPumpBusy || this.activeInputFormat === 'h264') return
    const frame = this.latestVideoFrame || this.lastVideoFrame
    if (!frame) return
    this.latestVideoFrame = null
    this.lastVideoFrame = frame
    this.videoPumpBusy = true
    try {
      if (this.isStreaming && this.ffmpegProcess?.stdin) this.ffmpegProcess.stdin.write(frame)
      if (this.isRecording && this.recordingProcess?.stdin) this.recordingProcess.stdin.write(frame)
    } finally {
      this.videoPumpBusy = false
    }
  }

  private stopVideoPumpIfIdle(force = false) {
    if (force || (!this.isStreaming && !this.isRecording)) {
      if (this.videoPumpTimer) clearInterval(this.videoPumpTimer)
      this.videoPumpTimer = null
    }
  }

  private checkPowerSave() {
    if (!this.isStreaming && !this.isRecording && this.powerSaveId !== null) {
      powerSaveBlocker.stop(this.powerSaveId)
      this.powerSaveId = null
    }
  }

  private startFrameWatchdog(kind: string) {
    this.stopFrameWatchdog()
    this.frameWatchdog = setInterval(() => {
      const fps = this.framesSinceLastReport / 5
      console.log(`[Streaming] ${kind} health — ${fps.toFixed(1)} fps received`)
      this.framesSinceLastReport = 0
    }, 5000)
  }

  private stopFrameWatchdog() {
    if (this.frameWatchdog) {
      clearInterval(this.frameWatchdog)
      this.frameWatchdog = null
    }
  }

  public getStreamStatus() { return this.isStreaming }
  public getRecordingStatus() { return this.isRecording }
}

function normalizeVideoFramePayload(frameData: Uint8Array | VideoFramePayload): VideoFramePayload {
  return 'data' in frameData ? frameData : { data: frameData }
}

function normalizeAudioFramePayload(audioData: Uint8Array | AudioFramePayload): AudioFramePayload {
  return 'data' in audioData ? audioData : { data: audioData }
}
