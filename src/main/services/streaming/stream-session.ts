import { ChildProcess, spawn } from 'child_process'
import { EventEmitter } from 'events'
import type { Writable } from 'stream'
import type { VideoFramePayload } from '../streaming-types'
import { PipeBuffer } from './pipe-buffer'

const AUDIO_PIPE_QUEUE_BYTES = 1024 * 1024 // ~2.7s at 48 kHz stereo f32; protects audio through short encoder/network stalls
const VIDEO_PIPE_QUEUE_BYTES = 2 * 1024 * 1024

export interface StreamSessionConfig {
  id: string
  name: string
  ffmpegPath: string
  args: string[]
  inputFormat: 'h264' | 'mjpeg'
  audioEnabled: boolean
  fps: number
  redactSecret: (val: string) => string
}

export class StreamSession extends EventEmitter {
  public process: ChildProcess
  public lastStderr = ''
  public failureEmitted = false
  private videoBuffer: PipeBuffer | null = null
  private audioBuffer: PipeBuffer | null = null
  private healthTimer: ReturnType<typeof setInterval> | null = null
  private cfrTimer: ReturnType<typeof setInterval> | null = null
  private latestVideoFrame: Uint8Array | null = null
  private lastSentVideoFrame: Uint8Array | null = null
  private framesRepeated = 0
  private cfrMaxRepeats: number = 30
  private lastHealthReportAt = Date.now()
  private lastVideoDroppedChunks = 0
  private lastAudioDroppedChunks = 0
  public framesSinceLastReport = 0
  public lastFrameReceivedAt: number = 0

  constructor(public readonly config: StreamSessionConfig) {
    super()

    this.process = spawn(config.ffmpegPath, config.args, {
      stdio: ['pipe', 'ignore', 'pipe', config.audioEnabled ? 'pipe' : 'ignore']
    })

    this.process.stdin?.setMaxListeners(100)
    if (config.audioEnabled) {
      (this.process.stdio[3] as any)?.setMaxListeners(100)
    }

    if (this.process.stdin) {
      this.videoBuffer = new PipeBuffer(this.process.stdin, VIDEO_PIPE_QUEUE_BYTES)
    }
    if (config.audioEnabled) {
      const audioPipe = this.process.stdio[3] as Writable | undefined
      if (audioPipe) this.audioBuffer = new PipeBuffer(audioPipe, AUDIO_PIPE_QUEUE_BYTES)
    }

    this.setupListeners()
    this.startHealthWatchdog()
    // MJPEG goes through a fixed-cadence pacer so FFmpeg always sees exactly
    // `fps` frames/sec, even if the renderer's rAF loop hitches. The H.264
    // pipe relies on the renderer's catch-up loop (see video-encoder.worker)
    // because re-feeding an encoded P-frame would corrupt the bitstream.
    if (config.inputFormat === 'mjpeg') this.startCfrPacer()
  }

  private setupListeners() {
    const startupLogUntil = Date.now() + 12_000
    
    this.process.stderr?.on('data', (data) => {
      const msg = this.config.redactSecret(data.toString())
      this.lastStderr = this.appendStderr(this.lastStderr, msg)
      
      const inStartup = Date.now() < startupLogUntil
      const isError = /error|failed|invalid|denied|unable|could not|cannot|broken|closed|dropped/i.test(msg)
      
      if (inStartup) {
        msg.split(/\r?\n/).filter(Boolean).forEach(line => {
          console.log(`[FFmpeg Stream:${this.config.id}]`, line.trim())
        })
      } else if (isError) {
        console.error(`[FFmpeg Stream:${this.config.id}]`, msg.trim())
      }
    })

    this.process.on('error', (err) => {
      if (!this.failureEmitted) this.emit('error', err)
    })

    this.process.stdin?.on('error', (err) => {
      if (!this.failureEmitted) this.emit('error', err)
    })
    if (this.config.audioEnabled) {
      (this.process.stdio[3] as any)?.on('error', (err: Error) => {
        if (!this.failureEmitted) this.emit('error', err)
      })
    }

    this.process.on('close', (code, signal) => {
      this.stopHealthWatchdog()
      this.stopCfrPacer()
      this.videoBuffer?.detach()
      this.videoBuffer = null
      this.audioBuffer?.detach()
      this.audioBuffer = null
      if (this.failureEmitted) return
      this.emit('close', code, signal)
    })
  }

  private appendStderr(current: string, next: string): string {
    const combined = current + next
    return combined.length > 6000 ? combined.slice(-6000) : combined
  }

  private startHealthWatchdog() {
    this.stopHealthWatchdog()
    this.lastHealthReportAt = Date.now()
    this.healthTimer = setInterval(() => this.reportHealth(), 5000)
    ;(this.healthTimer as any)?.unref?.()
  }

  private stopHealthWatchdog() {
    if (this.healthTimer) {
      clearInterval(this.healthTimer)
      this.healthTimer = null
    }
  }

  private reportHealth() {
    const now = Date.now()
    const elapsedSeconds = Math.max(1, (now - this.lastHealthReportAt) / 1000)
    const receivedFps = this.framesSinceLastReport / elapsedSeconds
    const expectedFps = Math.max(1, Math.min(60, Math.round(this.config.fps || 30)))
    const stats = this.getDropStats()
    const parts = [`${receivedFps.toFixed(1)}/${expectedFps} fps received`]

    if (stats.video) {
      const videoDrops = stats.video.droppedChunks - this.lastVideoDroppedChunks
      const queuedMb = stats.video.queuedBytes / 1024 / 1024
      parts.push(`video queue=${queuedMb.toFixed(2)} MB/${stats.video.queuedChunks} chunks`)
      if (videoDrops > 0) parts.push(`video drops +${videoDrops}`)
      this.lastVideoDroppedChunks = stats.video.droppedChunks
    }

    if (stats.audio) {
      const audioDrops = stats.audio.droppedChunks - this.lastAudioDroppedChunks
      const queuedKb = stats.audio.queuedBytes / 1024
      parts.push(`audio queue=${queuedKb.toFixed(1)} KB/${stats.audio.queuedChunks} chunks`)
      if (audioDrops > 0) parts.push(`audio drops +${audioDrops}`)
      this.lastAudioDroppedChunks = stats.audio.droppedChunks
    }

    const staleMs = this.lastFrameReceivedAt > 0 ? now - this.lastFrameReceivedAt : 0
    if (staleMs > 2000) parts.push(`last frame ${Math.round(staleMs)} ms ago`)

    console.log(`[Streaming:${this.config.id}] health — ${parts.join(' — ')}`)
    this.framesSinceLastReport = 0
    this.lastHealthReportAt = now
  }

  public pushVideoFrame(payload: VideoFramePayload) {
    this.framesSinceLastReport++
    this.lastFrameReceivedAt = Date.now()

    if (this.cfrTimer) {
      // MJPEG path: stash for the pacer instead of writing now. The pacer
      // emits exactly one frame per tick (1/fps seconds), so anything we
      // produce faster than that just overwrites the previous "latest" and
      // gets coalesced — same behavior as `requestAnimationFrame` clipping
      // to monitor refresh.
      this.latestVideoFrame = payload.data
      return
    }

    this.videoBuffer?.write(payload.data)
  }

  private startCfrPacer() {
    const fps = Math.max(1, Math.min(60, Math.round(this.config.fps || 30)))
    const interval = 1000 / fps
    this.cfrMaxRepeats = fps  // ~1s of frozen frames before we stop padding
    this.cfrTimer = setInterval(() => {
      const fresh = this.latestVideoFrame
      let frame: Uint8Array | null = null
      if (fresh) {
        this.latestVideoFrame = null
        this.lastSentVideoFrame = fresh
        this.framesRepeated = 0
        frame = fresh
      } else if (this.lastSentVideoFrame && this.framesRepeated < this.cfrMaxRepeats) {
        frame = this.lastSentVideoFrame
        this.framesRepeated++
      }
      if (frame) this.videoBuffer?.write(frame)
    }, interval)
    ;(this.cfrTimer as any)?.unref?.()
  }

  private stopCfrPacer() {
    if (this.cfrTimer) {
      clearInterval(this.cfrTimer)
      this.cfrTimer = null
    }
    this.latestVideoFrame = null
    this.lastSentVideoFrame = null
    this.framesRepeated = 0
  }

  public pushAudioFrame(data: Uint8Array) {
    this.audioBuffer?.write(data)
  }

  public getDropStats() {
    return {
      video: this.videoBuffer?.getStats(),
      audio: this.audioBuffer?.getStats()
    }
  }

  public stop() {
    this.failureEmitted = true
    this.stopHealthWatchdog()
    this.stopCfrPacer()
    this.videoBuffer?.detach()
    this.videoBuffer = null
    this.audioBuffer?.detach()
    this.audioBuffer = null
    try {
      this.process.kill('SIGINT')
    } catch (e) {}
  }
}
