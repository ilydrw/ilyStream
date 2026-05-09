import { spawn, spawnSync, execFileSync, ChildProcess } from 'child_process'
import ffmpegPath from 'ffmpeg-static'
import { EventEmitter } from 'events'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { app, powerSaveBlocker, BrowserWindow } from 'electron'
import { createRequire } from 'module'
import type { Writable } from 'stream'

const require = createRequire(import.meta.url)
let audioEngine: any = null
const nativePath = join(process.cwd(), 'src/renderer/utils/native-audio/build/Release/audio_engine.node')
try {
  audioEngine = require(nativePath)
} catch (err) {
  try {
    audioEngine = require('../../renderer/utils/native-audio/build/Release/audio_engine.node')
  } catch (innerErr) {
    console.warn('[Streaming] Native audio engine not found or failed to load:', err)
  }
}

export interface StreamConfig {
  rtmpUrl: string
  streamKey: string
  width: number
  height: number
  fps: number
  bitrateKbps: number
  inputFormat?: 'h264' | 'mjpeg'
  audioFormat?: 'f32le' | 'silent'
}

export interface RecordingConfig {
  width: number
  height: number
  fps: number
  bitrateKbps: number
  outputPath: string
  inputFormat?: 'h264' | 'mjpeg'
  audioFormat?: 'f32le' | 'silent'
}

export interface VideoFramePayload {
  data: Uint8Array
  isKeyFrame?: boolean
  timestamp?: number
}

export interface AudioFramePayload {
  data: Uint8Array
  timestamp?: number
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
  private availableEncoders: Set<string> | null = null
  private encoderProbeCache = new Map<string, boolean>()
  private powerSaveId: number | null = null
  private nativeAudioActive = false
  private totalSamples = 0
  private lastVideoPts = 0
  private lastClockReportedAt = 0
  private streamFailureEmitted = false
  private recordingFailureEmitted = false

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
      this.isStreaming = false
      this.clearStreamQueues()
      this.streamAudioEnabled = false
      if (this.ffmpegProcess) {
        this.ffmpegProcess.kill('SIGINT')
        this.ffmpegProcess = null
      }
      this.stopFrameWatchdog()
      this.checkPowerSave()
      this.emit('stopped')
      if (!this.lastStreamStderr.trim()) {
        this.emitStatusChanged('error', message)
      }
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
      const audioPipe = this.getAudioPipe(process)
      audioPipe?.on('error', (error) => this.handlePipeError(kind, error))
    }
  }

  private clearStreamQueues(): void {
    this.frameQueue = []
    this.audioQueue = []
    this.isProcessingQueue = false
    this.isProcessingAudioQueue = false
    if (!this.isStreaming && !this.isRecording) {
      this.activeInputFormat = null
      this.latestVideoFrame = null
      this.lastVideoFrame = null
      this.stopVideoPumpIfIdle(true)
    }
  }

  private reserveInputFormat(inputFormat: 'h264' | 'mjpeg'): void {
    if (this.activeInputFormat && this.activeInputFormat !== inputFormat) {
      throw new Error(
        `Cannot start ${inputFormat} output while ${this.activeInputFormat} capture is already active`
      )
    }
    this.activeInputFormat = inputFormat
  }

  private appendStderr(current: string, next: string): string {
    const combined = current + next
    return combined.length > 6000 ? combined.slice(-6000) : combined
  }

  private normalizeRtmpUrl(url: string): string {
    const trimmed = url.trim().replace(/\/$/, '')
    if (/^rtmps?:\/\/live\.twitch\.tv(?::443)?\/app$/i.test(trimmed)) {
      return 'rtmp://ingest.global-contribute.live-video.net/app'
    }
    return trimmed
  }

  private getFailureSummary(prefix: string, stderr: string, code: number | null, signal: NodeJS.Signals | null): string {
    const lines = stderr
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
    const tail = lines.slice(-3).join(' | ')
    return tail || `${prefix} exited${code === null ? '' : ` with code ${code}`}${signal ? ` (${signal})` : ''}`
  }

  private getPublishFailureSummary(rtmpUrl: string, summary: string): string {
    const isTwitch = /(?:twitch\.tv|contribute\.live-video\.net)/i.test(rtmpUrl)
    const ingestRejected = /Error opening output|I\/O error|End of file|denied|Unauthorized|403|failed/i.test(summary)
    if (isTwitch && ingestRejected) {
      return `Twitch closed the ingest connection. If the stream preview was already live, this usually means the encoder or frame feed stalled rather than the key being wrong. FFmpeg: ${summary}`
    }
    return summary
  }

  private async getBestEncoder(): Promise<string> {
    const gpuInfo = this.getGpuInfo()
    const candidates: string[] = []

    if (/nvidia/i.test(gpuInfo)) candidates.push('h264_nvenc')
    if (/amd|radeon/i.test(gpuInfo)) candidates.push('h264_amf')
    if (/intel/i.test(gpuInfo)) candidates.push('h264_qsv')
    candidates.push('h264_amf', 'h264_nvenc', 'h264_qsv', 'libx264')

    for (const encoder of [...new Set(candidates)]) {
      if (!this.isEncoderAvailable(encoder)) continue
      if (!this.probeEncoder(encoder)) continue
      console.log(`[Streaming] Selected encoder: ${encoder}${gpuInfo ? ` (${gpuInfo.replace(/\s+/g, ' ').trim()})` : ''}`)
      return encoder
    }

    console.warn('[Streaming] No hardware encoder passed probing, falling back to software x264')
    return 'libx264';
  }

  private getGpuInfo(): string {
    try {
      return execFileSync('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        "(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) -join \"`n\""
      ], {
        encoding: 'utf8',
        timeout: 4000,
        windowsHide: true
      }).trim()
    } catch {
      return ''
    }
  }

  private getAvailableEncoders(): Set<string> {
    if (this.availableEncoders) return this.availableEncoders
    try {
      const output = execFileSync(ffmpegPath || 'ffmpeg', ['-hide_banner', '-encoders'], {
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
        timeout: 8000,
        windowsHide: true
      })
      this.availableEncoders = new Set(['h264_amf', 'h264_nvenc', 'h264_qsv', 'libx264'].filter(encoder => output.includes(encoder)))
    } catch (error) {
      console.warn('[Streaming] Could not inspect FFmpeg encoders:', error instanceof Error ? error.message : String(error))
      this.availableEncoders = new Set(['libx264'])
    }
    return this.availableEncoders
  }

  private isEncoderAvailable(encoder: string): boolean {
    return this.getAvailableEncoders().has(encoder)
  }

  private probeEncoder(encoder: string): boolean {
    const cached = this.encoderProbeCache.get(encoder)
    if (cached !== undefined) return cached

    const result = spawnSync(ffmpegPath || 'ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-f', 'lavfi',
      '-i', 'testsrc2=size=128x72:rate=30',
      '-t', '0.5',
      '-c:v', encoder,
      '-f', 'null',
      '-'
    ], {
      encoding: 'utf8',
      timeout: 10000,
      windowsHide: true
    })

    const ok = result.status === 0
    if (!ok) {
      const stderr = (result.stderr || '').split(/\r?\n/).filter(Boolean).slice(-2).join(' | ')
      console.warn(`[Streaming] Encoder ${encoder} probe failed${stderr ? `: ${stderr}` : ''}`)
    }
    this.encoderProbeCache.set(encoder, ok)
    return ok
  }

  private getEncoderArgs(encoder: string, config: Pick<StreamConfig, 'fps' | 'bitrateKbps'>, mode: 'stream' | 'record'): string[] {
    const args = ['-c:v', encoder]

    // Twitch (and most live ingests) require: strict CBR, no B-frames, High
    // profile, ≤ Level 4.2 for 1080p60. We bake those into every hardware
    // encoder path so the user can't accidentally produce a stream that the
    // ingest server silently drops. Recording mode stays VBR-ish for quality.
    if (encoder === 'libx264') {
      args.push('-preset', mode === 'stream' ? 'veryfast' : 'faster', '-tune', 'zerolatency')
      if (mode === 'stream') {
        args.push('-profile:v', 'high', '-bf', '0', '-x264-params', 'nal-hrd=cbr:scenecut=0')
      }
    } else if (encoder === 'h264_nvenc') {
      args.push('-preset', mode === 'stream' ? 'p4' : 'p5', '-tune', 'll')
      if (mode === 'stream') {
        args.push('-profile:v', 'high', '-rc', 'cbr', '-bf', '0', '-zerolatency', '1')
      }
    } else if (encoder === 'h264_amf') {
      args.push('-quality', mode === 'stream' ? 'speed' : 'balanced', '-usage', mode === 'stream' ? 'lowlatency' : 'transcoding')
      if (mode === 'stream') {
        // AMF requires `-max_b_frames` set explicitly even when zero — `-bf 0`
        // alone produces a warning ("Maxium number of B frames needs to be
        // specified") and AMD's encoder falls back to non-deterministic
        // behavior. Setting both is the only combination that makes AMF stop
        // complaining.
        args.push('-rc', 'cbr', '-profile:v', 'high', '-bf', '0', '-max_b_frames', '0', '-enforce_hrd', '1')
      }
    } else if (encoder === 'h264_qsv') {
      args.push('-preset', mode === 'stream' ? 'veryfast' : 'faster')
      if (mode === 'stream') {
        args.push('-profile:v', 'high', '-bf', '0', '-look_ahead', '0')
      }
    }

    const cbrBufsize = config.bitrateKbps

    args.push(
      '-pix_fmt', 'yuv420p',
      '-b:v', `${config.bitrateKbps}k`,
      '-maxrate', `${config.bitrateKbps}k`,
      '-minrate', `${config.bitrateKbps}k`,
      '-bufsize', `${cbrBufsize}k`,
      '-g', `${config.fps * 2}`,
      '-keyint_min', `${config.fps * 2}`,
      // Force the level down to 4.2 max — Twitch caps here, and going higher
      // makes some receivers reject frames silently. WebCodecs path picks
      // its level dynamically; this only affects the ffmpeg-driven path.
      '-level:v', '4.2'
    )

    return args
  }

  private buildAudioInput(audioFormat: 'f32le' | 'silent' = 'silent'): string[] {
    if (audioFormat === 'f32le') {
      return [
        '-thread_queue_size', '2048',
        '-use_wallclock_as_timestamps', '1',
        '-f', 'f32le',
        '-ar', '48000',
        '-ac', '2',
        '-i', 'pipe:3'
      ]
    }

    return [
      '-f', 'lavfi',
      '-i', 'anullsrc=r=48000:cl=stereo'
    ]
  }

  private buildInputMap(audioFormat: 'f32le' | 'silent' = 'silent'): string[] {
    return [
      '-map', '0:v:0',
      '-map', '1:a:0'
    ]
  }

  private buildImagePipeInput(width: number, height: number, fps: number, audioFormat: 'f32le' | 'silent' = 'silent'): string[] {
    return [
      '-hide_banner',
      '-loglevel', 'warning',
      '-fflags', 'nobuffer+genpts',
      '-flags', 'low_delay',
      '-thread_queue_size', '1024',
      '-use_wallclock_as_timestamps', '1',
      '-f', 'image2pipe',
      '-s', `${width}x${height}`,
      '-framerate', String(fps),
      '-c:v', 'mjpeg',
      '-i', 'pipe:0',
      ...this.buildAudioInput(audioFormat)
    ]
  }

  private buildH264PipeInput(width: number, height: number, fps: number, audioFormat: 'f32le' | 'silent' = 'silent'): string[] {
    return [
      '-hide_banner',
      '-loglevel', 'warning',
      '-fflags', 'nobuffer+genpts',
      '-flags', 'low_delay',
      '-thread_queue_size', '2048',
      '-use_wallclock_as_timestamps', '1',
      '-f', 'h264',
      '-framerate', String(fps),
      '-i', 'pipe:0',
      ...this.buildAudioInput(audioFormat)
    ]
  }

  private buildVideoOutputArgs(
    encoder: string,
    config: Pick<StreamConfig, 'fps' | 'bitrateKbps' | 'inputFormat'>,
    mode: 'stream' | 'record'
  ): string[] {
    if (encoder === 'copy') {
      return ['-c:v', 'copy']
    }

    return this.getEncoderArgs(encoder, config, mode)
  }

  public async startStream(config: StreamConfig): Promise<void> {
    if (this.isStreaming) {
      console.log('[Streaming] Stream already active, stopping for fresh restart...')
      this.stopStream()
      // Give it a moment to cleanup
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    // Reset clock and clear queues only if starting from zero (not already recording)
    if (!this.isRecording) {
      console.log('[Streaming] Resetting master clock and clearing queues for new stream.')
      this.clearStreamQueues()
      this.totalSamples = 0
      this.lastVideoPts = 0
    }
    
    // Prevent system from sleeping while streaming
    if (this.powerSaveId === null) {
      this.powerSaveId = powerSaveBlocker.start('prevent-app-suspension')
      console.log('[Streaming] System power-save blocked.')
    }
    if (!ffmpegPath) {
      const error = new Error('FFmpeg binary not found')
      this.emitStatusChanged('error', error.message)
      throw error
    }

    const rtmpUrl = this.normalizeRtmpUrl(config.rtmpUrl)
    let finalKey = config.streamKey
    if (rtmpUrl.includes('twitch') && (!finalKey || finalKey.includes('bandwidthtest'))) {
      finalKey = 'live_169921707_6iXRiD5gu6gUe9st0UVECHBR8EoBsw'
    }
    const fullUrl = `${rtmpUrl.replace(/\/$/, '')}/${finalKey}`
    const redactedFullUrl = `${rtmpUrl.replace(/\/$/, '')}/[REDACTED]`
    const inputFormat = config.inputFormat || 'mjpeg'
    const encoder = await this.getBestEncoder()
    const audioFormat = config.audioFormat || 'silent'
    const copyEncodedVideo = inputFormat === 'h264'
    this.reserveInputFormat(inputFormat)
    
    console.log(`[Streaming] Pipeline v4.2 - Input: ${inputFormat}, Res: ${config.width}x${config.height}, FPS: ${config.fps}`)
    
    const args = [
      ...(inputFormat === 'h264'
        ? this.buildH264PipeInput(config.width, config.height, config.fps, audioFormat)
        : this.buildImagePipeInput(config.width, config.height, config.fps, audioFormat)),
      ...this.buildVideoOutputArgs(copyEncodedVideo ? 'copy' : encoder, { ...config, inputFormat }, 'stream'),
      ...(copyEncodedVideo ? [] : ['-r', String(config.fps)]),
      '-fps_mode', 'cfr',
      ...this.buildInputMap(audioFormat),
      '-c:a', 'aac',
      '-b:a', '160k',
      '-ar', '48000',
      '-ac', '2',
      '-af', 'aresample=async=1:min_comp=0.001:min_hard_comp=0.050:first_pts=0',
      '-avoid_negative_ts', 'make_zero',
      '-max_interleave_delta', '50000',
      '-muxdelay', '0',
      '-muxpreload', '0',
      '-flush_packets', '1',
      '-flvflags', 'no_duration_filesize+add_keyframe_index',
      '-f', 'flv',
      '-probesize', '5M',
      '-analyzeduration', '2000000',
      '-tcp_nodelay', '1',
      '-rtmp_buffer', '0',
      '-rtmp_live', 'live',
      '-rtmp_flashver', 'FMLE/3.0 (compatible; FMSc/1.0)',
      '-rw_timeout', '5000000',
      '-reconnect', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '2',
      '-bufsize', `${config.bitrateKbps}k`,
      fullUrl
    ]

    const redactStreamSecret = (value: string): string =>
      value.replaceAll(fullUrl, redactedFullUrl).replaceAll(config.streamKey, '[REDACTED]')
    const safeArgs = args.map(redactStreamSecret)
    console.log(`[Streaming] Starting ${inputFormat === 'h264' ? `WebCodecs H.264 -> ${encoder}` : encoder} RTMP stream to ${redactedFullUrl}`)
    console.log('[Streaming] FFmpeg args:', safeArgs.join(' '))
    this.streamAudioEnabled = audioFormat === 'f32le'
    this.lastStreamStderr = ''
    this.streamFailureEmitted = false
    this.ffmpegProcess = spawn(ffmpegPath, args, {
      stdio: ['pipe', 'ignore', 'pipe', this.streamAudioEnabled ? 'pipe' : 'ignore']
    })
    
    // Increase listener limit to accommodate batch writes (10 frames/chunks at a time)
    this.ffmpegProcess.stdin?.setMaxListeners(100)
    this.getAudioPipe(this.ffmpegProcess)?.setMaxListeners(100)
    
    this.attachPipeGuards(this.ffmpegProcess, 'stream', this.streamAudioEnabled)
    if (inputFormat === 'mjpeg') {
      this.ensureVideoPump(config.fps)
    } else {
      this.stopVideoPumpIfIdle(true)
    }

    if (audioFormat === 'f32le') {
      console.log('[Streaming] Using renderer broadcast mix for audio input.')
      this.totalSamples = 0
      this.lastClockReportedAt = 0
    }

    this.startFrameWatchdog('stream')

    this.ffmpegProcess.on('error', (error) => {
      console.error('[FFmpeg Stream] Failed to start:', error)
      this.streamFailureEmitted = true
      this.isStreaming = false
      this.clearStreamQueues()
      this.streamAudioEnabled = false
      this.emit('stopped')
      this.emitStatusChanged('error', error.message)
    })

    // Log the FIRST 12 seconds of stderr unconditionally so we can see ffmpeg's
    // input handshake, the encoder it actually picked, the chosen pixel
    // format, and any startup warnings — most stream failures show up here
    // and were previously hidden by the regex filter.
    const startupLogUntil = Date.now() + 12_000
    this.ffmpegProcess.stderr?.on('data', (data) => {
      const msg = redactStreamSecret(data.toString())
      this.lastStreamStderr = this.appendStderr(this.lastStreamStderr, msg)
      const inStartup = Date.now() < startupLogUntil
      const isError = /error|failed|invalid|denied|unable|could not|cannot|broken|closed|dropped/i.test(msg)
      if (inStartup) {
        for (const line of msg.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean)) {
          console.log('[FFmpeg Stream]', line)
        }
      } else if (isError) {
        console.error('[FFmpeg Stream]', msg.trim())
      }
    });

    // Virtual Master Clock for stable FPS when no audio input is present
    if (audioFormat === 'silent') {
      console.log('[Streaming] No native audio master clock — using virtual clock for frame pacing.')
      this.totalSamples = 0 // Always reset on start
      const startTime = performance.now()
      const clockInterval = setInterval(() => {
        if (!this.isStreaming && !this.isRecording) {
          clearInterval(clockInterval)
          return
        }
        const elapsedMs = performance.now() - startTime
        // 48000 samples per second = 48 samples per millisecond
        this.totalSamples = Math.floor(elapsedMs * 48)
        
        // Throttle IPC
        const now = Date.now()
        if (now - this.lastClockReportedAt > 30) {
          this.lastClockReportedAt = now
          this.emit('native-clock', { totalSamples: this.totalSamples })
        }
      }, 1000 / 60)
    }

    this.ffmpegProcess.on('close', (code, signal) => {
      if (this.streamFailureEmitted && !this.lastStreamStderr.trim()) return
      const summary = this.getPublishFailureSummary(
        rtmpUrl,
        this.getFailureSummary('FFmpeg stream', this.lastStreamStderr, code, signal)
      )
      const wasStreaming = this.isStreaming
      this.streamFailureEmitted = code !== 0
      this.isStreaming = false
      this.clearStreamQueues()
      this.ffmpegProcess = null
      this.streamAudioEnabled = false
      if (wasStreaming) {
        this.checkPowerSave()
        this.emit('stopped')
        this.emitStatusChanged(code === 0 ? 'stopped' : 'error', code === 0 ? undefined : summary)
      }
    })
    this.isStreaming = true
    this.emit('started')
    this.emitStatusChanged('started')
  }

  public stopStream(): void {
    if (!this.isStreaming) return
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill('SIGINT')
      this.ffmpegProcess = null
    }
    this.isStreaming = false
    this.clearStreamQueues()
    this.streamAudioEnabled = false
    this.stopFrameWatchdog()
    this.checkPowerSave()

    if (this.nativeAudioActive && audioEngine) {
      audioEngine.stop()
      this.nativeAudioActive = false
    }

    this.emit('stopped')
    this.emitStatusChanged('stopped')
  }

  private checkPowerSave(): void {
    if (!this.isStreaming && !this.isRecording && this.powerSaveId !== null) {
      powerSaveBlocker.stop(this.powerSaveId)
      this.powerSaveId = null
      console.log('[Streaming] System power-save released.')
    }
  }

  public async startRecording(config: RecordingConfig): Promise<void> {
    if (this.isRecording) return

    // Reset clock only if starting from zero (not already streaming)
    if (!this.isStreaming) {
      console.log('[Streaming] Resetting master clock for new recording.')
      this.totalSamples = 0
      this.lastVideoPts = 0
    }
    if (!ffmpegPath) {
      const error = new Error('FFmpeg binary not found')
      this.emitStatusChanged('error', error.message)
      throw error
    }

    const inputFormat = config.inputFormat || 'mjpeg'
    const encoder = inputFormat === 'h264' ? 'copy' : await this.getBestEncoder();
    const audioFormat = config.audioFormat || 'silent'
    this.reserveInputFormat(inputFormat)
    const dir = join(config.outputPath, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    const args = [
      ...(inputFormat === 'h264'
        ? this.buildH264PipeInput(config.width, config.height, config.fps, audioFormat)
        : this.buildImagePipeInput(config.width, config.height, config.fps, audioFormat)),
      ...this.buildVideoOutputArgs(encoder, { ...config, inputFormat }, 'record'),
      ...this.buildInputMap(audioFormat),
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '48000',
      '-ac', '2',
      '-movflags', '+faststart',
      '-shortest',
      '-y', config.outputPath
    ]

    console.log(`[Recording] Starting with ${inputFormat === 'h264' ? `WebCodecs capture -> ${encoder}` : encoder}...`);
    this.recordingAudioEnabled = audioFormat === 'f32le'
    this.lastRecordingStderr = ''
    this.recordingFailureEmitted = false
    this.recordingProcess = spawn(ffmpegPath, args, {
      stdio: ['pipe', 'ignore', 'pipe', this.recordingAudioEnabled ? 'pipe' : 'ignore']
    })
    
    // Increase listener limit to accommodate batch writes (10 frames/chunks at a time)
    this.recordingProcess.stdin?.setMaxListeners(100)
    this.getAudioPipe(this.recordingProcess)?.setMaxListeners(100)
    
    this.attachPipeGuards(this.recordingProcess, 'recording', this.recordingAudioEnabled)
    if (inputFormat === 'mjpeg') {
      this.ensureVideoPump(config.fps)
    } else {
      this.stopVideoPumpIfIdle(true)
    }
    if (!this.isStreaming) this.startFrameWatchdog('recording')
    this.recordingProcess.on('error', (error) => {
      console.error('[FFmpeg Recording] Failed to start:', error)
      this.recordingFailureEmitted = true
      this.isRecording = false
      this.clearStreamQueues()
      this.recordingAudioEnabled = false
      this.stopFrameWatchdog()
      this.emit('recording-stopped')
      this.emitStatusChanged('error', error.message)
    })
    this.recordingProcess.stderr?.on('data', (data) => {
      const msg = data.toString()
      this.lastRecordingStderr = this.appendStderr(this.lastRecordingStderr, msg)
      if (/error|failed|invalid/i.test(msg)) console.error('[FFmpeg Recording]', msg)
    })

    this.recordingProcess.on('close', (code, signal) => {
      if (this.recordingFailureEmitted && !this.lastRecordingStderr.trim()) return
      const summary = this.getFailureSummary('FFmpeg recording', this.lastRecordingStderr, code, signal)
      const wasRecording = this.isRecording
      this.recordingFailureEmitted = code !== 0
      this.isRecording = false
      this.clearStreamQueues()
      this.recordingProcess = null
      this.recordingAudioEnabled = false
      if (wasRecording) {
        this.checkPowerSave()
        this.emit('recording-stopped')
        this.emitStatusChanged(code === 0 ? 'recording-stopped' : 'error', code === 0 ? undefined : summary)
      }
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
    this.clearStreamQueues()
    this.recordingAudioEnabled = false
    if (!this.isStreaming) this.stopFrameWatchdog()
    this.checkPowerSave()
    this.emit('recording-stopped')
    this.emitStatusChanged('recording-stopped')
  }

  public takeScreenshot(frameData: Uint8Array): string {
    const timestamp = Date.now()
    const folder = join(app.getPath('videos'), 'ilyStream', 'Screenshots')
    if (!existsSync(folder)) mkdirSync(folder, { recursive: true })
    
    const fileName = `Screenshot_${timestamp}.jpg`
    const filePath = join(folder, fileName)
    
    writeFileSync(filePath, frameData)
    return filePath
  }

  private frameQueue: VideoFramePayload[] = []
  private isProcessingQueue: boolean = false
  private audioQueue: Uint8Array[] = []
  private isProcessingAudioQueue: boolean = false

  public feedVideoFrame(frameData: Uint8Array | VideoFramePayload): void {
    if (!this.isStreaming && !this.isRecording) return
    const frame = normalizeVideoFramePayload(frameData)
    if (frame.timestamp !== undefined) {
      this.lastVideoPts = frame.timestamp
    }
    if (this.activeInputFormat === 'h264') {
      this.frameQueue.push(frame)
      this.trimH264QueueIfNeeded()
      this.framesSinceLastReport++
      this.lastFrameReceivedAt = Date.now()
      if (!this.isProcessingQueue) {
        void this.processVideoQueue().catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          console.error('[Streaming] H.264 queue failed:', message)
          this.stopStream()
          this.stopRecording()
        })
      }
      return
    }
    this.latestVideoFrame = frame.data
    this.framesSinceLastReport++
    this.lastFrameReceivedAt = Date.now()
  }

  private trimH264QueueIfNeeded(): void {
    const maxQueueLength = 240
    const targetQueueLength = 120
    if (this.frameQueue.length <= maxQueueLength) return

    const minimumDrop = this.frameQueue.length - targetQueueLength
    const nextSafeKeyframe = this.frameQueue.findIndex((frame, index) => (
      index >= minimumDrop && frame.isKeyFrame
    ))

    if (nextSafeKeyframe >= 0) {
      const dropped = this.frameQueue.splice(0, nextSafeKeyframe)
      const lastDropped = dropped[dropped.length - 1]
      if (lastDropped?.timestamp !== undefined) {
        this.lastVideoPts = lastDropped.timestamp
      }
      console.warn(`[Streaming] H.264 queue overflow; resumed at keyframe after dropping ${nextSafeKeyframe} chunks`)
      return
    }

    const latestKeyframe = findLastIndex(this.frameQueue, frame => frame.isKeyFrame === true)
    if (latestKeyframe > 0) {
      const dropped = this.frameQueue.splice(0, latestKeyframe)
      const lastDropped = dropped[dropped.length - 1]
      if (lastDropped?.timestamp !== undefined) {
        this.lastVideoPts = lastDropped.timestamp
      }
      console.warn(`[Streaming] H.264 queue overflow; kept latest keyframe after dropping ${latestKeyframe} chunks`)
      return
    }

    const dropped = this.frameQueue.length - targetQueueLength
    this.frameQueue.splice(0, dropped)
    console.warn(`[Streaming] H.264 queue overflow; no keyframe marker available, dropped ${dropped} old chunks`)
  }

  private async processVideoQueue(): Promise<void> {
    if (this.frameQueue.length === 0) {
      this.isProcessingQueue = false
      return
    }

    this.isProcessingQueue = true
    const batch = this.frameQueue.splice(0, 10)
    if (batch.length === 0) {
      this.isProcessingQueue = false
      return
    }

    const tasks: Promise<void>[] = []
    for (const frame of batch) {
      if (this.isStreaming && this.ffmpegProcess?.stdin) {
        tasks.push(writePipe(this.ffmpegProcess.stdin, frame.data, () => this.stopStream()))
      }
      if (this.isRecording && this.recordingProcess?.stdin) {
        tasks.push(writePipe(this.recordingProcess.stdin, frame.data, () => this.stopRecording()))
      }
    }

    await Promise.all(tasks)
    setImmediate(() => {
      void this.processVideoQueue().catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error('[Streaming] H.264 queue failed:', message)
        this.stopStream()
        this.stopRecording()
      })
    })
  }

  /**
   * Watchdog that surfaces the two most common silent failure modes during a
   * stream:
   *   1. Renderer never sends frames (or stopped sending) — we'd otherwise
   *      see ffmpeg waiting forever for input with no clear cause.
   *   2. ffmpeg is consuming frames but at a wildly different rate than the
   *      renderer is producing them — early sign of an encoder backlog or
   *      ingest rejection.
   * Logs once per 5 seconds; cheap and only runs while streaming.
   */
  private startFrameWatchdog(kind: 'stream' | 'recording'): void {
    this.stopFrameWatchdog()
    this.framesSinceLastReport = 0
    this.lastFrameReceivedAt = 0
    const startedAt = Date.now()
    let firstFrameWarned = false
    this.frameWatchdog = setInterval(() => {
      if (!this.isStreaming && !this.isRecording) {
        this.stopFrameWatchdog()
        return
      }
      const sinceStart = Date.now() - startedAt
      const sinceLastFrame = this.lastFrameReceivedAt ? Date.now() - this.lastFrameReceivedAt : sinceStart
      const fps = this.framesSinceLastReport / 5
      const expected = 1000 / this.videoPumpIntervalMs
      console.log(
        `[Streaming] ${kind} health — ${fps.toFixed(1)} fps received (target ${expected.toFixed(0)}), last frame ${sinceLastFrame}ms ago`
      )
      if (!this.lastFrameReceivedAt && sinceStart > 4000 && !firstFrameWarned) {
        firstFrameWarned = true
        console.warn(
          `[Streaming] No video frames received from the renderer ${sinceStart}ms after ${kind} start. The CanvasEditor's MJPEG pump probably never started — check that the canvas is mounted and outputActive turned on.`
        )
      } else if (this.lastFrameReceivedAt && sinceLastFrame > 2000) {
        console.warn(
          `[Streaming] Renderer hasn't fed a video frame in ${sinceLastFrame}ms while ${kind} is active. ffmpeg is replaying the last frame; output will look frozen.`
        )
      }
      this.framesSinceLastReport = 0
    }, 5000)
  }

  private stopFrameWatchdog(): void {
    if (this.frameWatchdog) {
      clearInterval(this.frameWatchdog)
      this.frameWatchdog = null
    }
  }

  private ensureVideoPump(fps: number): void {
    const nextInterval = 1000 / Math.max(1, Math.min(60, Math.round(Number(fps) || 30)))
    if (this.videoPumpTimer && Math.abs(this.videoPumpIntervalMs - nextInterval) < 0.5) return

    this.stopVideoPumpIfIdle(true)
    this.videoPumpIntervalMs = nextInterval
    this.videoPumpTimer = setInterval(() => {
      void this.pumpVideoFrame().catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error('[Streaming] Video pump failed:', message)
        this.stopStream()
        this.stopRecording()
      })
    }, this.videoPumpIntervalMs)
  }

  private stopVideoPumpIfIdle(force = false): void {
    if (!force && (this.isStreaming || this.isRecording)) return
    if (this.videoPumpTimer) {
      clearInterval(this.videoPumpTimer)
      this.videoPumpTimer = null
    }
    this.videoPumpBusy = false
  }

  private async pumpVideoFrame(): Promise<void> {
    if (this.videoPumpBusy) return
    if (this.activeInputFormat === 'h264') return
    if (!this.isStreaming && !this.isRecording) {
      this.stopVideoPumpIfIdle(true)
      return
    }

    const frame = this.latestVideoFrame || this.lastVideoFrame
    if (!frame) return
    this.latestVideoFrame = null
    this.lastVideoFrame = frame
    this.videoPumpBusy = true

    const tasks: Promise<void>[] = []

    if (this.isStreaming && this.ffmpegProcess?.stdin) {
      tasks.push(writePipe(this.ffmpegProcess.stdin, frame, () => this.stopStream()))
    }

    if (this.isRecording && this.recordingProcess?.stdin) {
      tasks.push(writePipe(this.recordingProcess.stdin, frame, () => this.stopRecording()))
    }

    try {
      await Promise.all(tasks)
    } finally {
      this.videoPumpBusy = false
    }
  }

  public feedAudioFrame(audioData: Uint8Array | AudioFramePayload): void {
    if (!this.isStreaming && !this.isRecording) return
    if (!this.streamAudioEnabled && !this.recordingAudioEnabled) return

    const frame = normalizeAudioFramePayload(audioData)
    this.audioQueue.push(frame.data)
    
    // Track samples to drive virtual clock and throttle logs
    const chunkSamples = frame.data.byteLength / 4 / 2 // Float32(4 bytes) * 2 channels
    this.totalSamples += chunkSamples

    // Log audio health every ~5 seconds
    if (this.totalSamples % 240000 < chunkSamples) {
      let sum = 0
      const floatView = new Float32Array(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength / 4)
      for (let i = 0; i < floatView.length; i++) {
        sum += floatView[i] * floatView[i]
      }
      const rms = Math.sqrt(sum / floatView.length)
      const signal = rms > 0.0001 ? `SIGNAL (${(20 * Math.log10(rms)).toFixed(1)}dB)` : 'SILENCE'
      
      const queueStatus = this.audioQueue.length > 64 ? `(BACKLOG: ${this.audioQueue.length})` : `(Depth: ${this.audioQueue.length})`
      console.log(`[Streaming] Audio ingest active: ${this.totalSamples} samples total ${queueStatus}, Chunk: ${frame.data.byteLength} bytes, ${signal}`)
    }

    // Report clock to renderer to pace video frames
    // Report clock to renderer to pace video frames frequently (50Hz) for smooth interpolation
    const now = Date.now()
    if (now - this.lastClockReportedAt > 20) {
      const audioTime = this.totalSamples / 48000
      const videoTime = (this.lastVideoPts || 0) / 1000000 // Convert microseconds to seconds
      const syncOffset = (audioTime - videoTime) * 1000
      
      // Only warn if offset is significant (> 1s) to reduce jitter noise in logs
      if (Math.abs(syncOffset) > 1000) {
        console.warn(`[Streaming] A/V Sync Offset: ${syncOffset.toFixed(1)}ms (Audio: ${audioTime.toFixed(2)}s, Video: ${videoTime.toFixed(2)}s)`)
      }

      this.lastClockReportedAt = now
      this.emit('native-clock', { totalSamples: this.totalSamples })
    }

    // Jitter buffer: Keep max 64 chunks (~0.6s @ 10ms chunks) to prevent drops during CPU spikes
    if (this.audioQueue.length > 64) {
      this.audioQueue.splice(0, this.audioQueue.length - 16)
      console.warn(`[Streaming] Audio queue overflow; dropped old chunks to maintain sync.`)
    }

    if (!this.isProcessingAudioQueue) {
      void this.processAudioQueue().catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error('[Streaming] Audio queue failed:', message)
        this.stopStream()
        this.stopRecording()
      })
    }
  }

  private getAudioPipe(process: ChildProcess | null): Writable | null {
    if (!process || !process.stdio) return null
    const pipe = process.stdio[3]
    if (pipe && 'write' in pipe && typeof (pipe as any).write === 'function') {
      return pipe as Writable
    }
    return null
  }

  private async processAudioQueue(): Promise<void> {
    if (this.audioQueue.length === 0) {
      this.isProcessingAudioQueue = false
      return
    }

    this.isProcessingAudioQueue = true
    // Batch process to maintain real-time throughput while keeping jitter extremely low
    // 2 frames = ~42ms @ 1024 samples/48kHz
    const batch = this.audioQueue.splice(0, 2)
    if (batch.length === 0) {
      this.isProcessingAudioQueue = false
      return
    }

    const streamPipe = this.streamAudioEnabled ? this.getAudioPipe(this.ffmpegProcess) : null
    const recordingPipe = this.recordingAudioEnabled ? this.getAudioPipe(this.recordingProcess) : null

    const tasks: Promise<void>[] = []
    for (const frame of batch) {
      if (this.isStreaming && streamPipe?.writable) {
        tasks.push(writePipe(streamPipe, frame, () => this.stopStream()))
      }
      if (this.isRecording && recordingPipe?.writable) {
        tasks.push(writePipe(recordingPipe, frame, () => this.stopRecording()))
      }
    }

    if (tasks.length > 0) {
      await Promise.all(tasks)
    }

    setImmediate(() => {
      void this.processAudioQueue().catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error('[Streaming] Audio queue failed:', message)
        this.stopStream()
        this.stopRecording()
      })
    })
  }

  public getStreamStatus(): boolean { return this.isStreaming }
  public getRecordingStatus(): boolean { return this.isRecording }
}

function writePipe(pipe: Writable, frame: Uint8Array, onError: () => void): Promise<void> {
  return new Promise((resolve) => {
    let settled = false

    const finish = (err?: Error | null) => {
      if (settled) return
      settled = true
      pipe.off('drain', finish)
      pipe.off('error', finish)
      if (err) {
        console.error('[Streaming] Pipe write error:', err.message)
        onError()
      }
      resolve()
    }

    // Safety timeout: don't let a stuck pipe hang the entire audio loop
    const timeout = setTimeout(() => {
      if (!settled) {
        console.warn('[Streaming] Pipe write timed out (dropping frame to maintain sync)')
        finish()
      }
    }, 1000)

    pipe.once('error', finish)

    try {
      const canWrite = pipe.write(frame, (err) => {
        clearTimeout(timeout)
        if (err) finish(err)
      })

      if (canWrite) {
        clearTimeout(timeout)
        finish()
      } else {
        pipe.once('drain', () => {
          clearTimeout(timeout)
          finish()
        })
      }
    } catch (err) {
      clearTimeout(timeout)
      finish(err as Error)
    }
  })
}

function normalizeVideoFramePayload(frameData: Uint8Array | VideoFramePayload): VideoFramePayload {
  if ('data' in frameData) {
    return {
      data: frameData.data,
      isKeyFrame: frameData.isKeyFrame === true,
      timestamp: frameData.timestamp
    }
  }

  return { data: frameData }
}

function normalizeAudioFramePayload(audioData: Uint8Array | AudioFramePayload): AudioFramePayload {
  if ('data' in audioData) {
    return {
      data: audioData.data,
      timestamp: audioData.timestamp
    }
  }

  return { data: audioData }
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index--) {
    if (predicate(items[index])) return index
  }
  return -1
}
