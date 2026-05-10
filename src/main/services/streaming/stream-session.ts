import { ChildProcess, spawn } from 'child_process'
import { EventEmitter } from 'events'
import type { VideoFramePayload } from '../streaming-types'

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
  public frameQueue: VideoFramePayload[] = []
  private isProcessingQueue = false
  private videoPumpTimer: ReturnType<typeof setInterval> | null = null
  private videoPumpBusy = false
  private videoPumpIntervalMs: number
  public framesSinceLastReport = 0
  public lastFrameReceivedAt: number = 0

  constructor(private config: StreamSessionConfig) {
    super()
    this.videoPumpIntervalMs = 1000 / Math.max(1, Math.min(60, Math.round(config.fps || 30)))
    
    this.process = spawn(config.ffmpegPath, config.args, {
      stdio: ['pipe', 'ignore', 'pipe', config.audioEnabled ? 'pipe' : 'ignore']
    })

    this.process.stdin?.setMaxListeners(100)
    if (config.audioEnabled) {
      (this.process.stdio[3] as any)?.setMaxListeners(100)
    }

    this.setupListeners()
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
      this.emit('error', err)
    })

    this.process.on('close', (code, signal) => {
      this.stopPump()
      this.emit('close', code, signal)
    })

    if (this.config.inputFormat === 'mjpeg') {
      this.startPump()
    }
  }

  private appendStderr(current: string, next: string): string {
    const combined = current + next
    return combined.length > 6000 ? combined.slice(-6000) : combined
  }

  private startPump() {
    this.videoPumpTimer = setInterval(() => this.pumpVideo(), this.videoPumpIntervalMs)
  }

  private stopPump() {
    if (this.videoPumpTimer) {
      clearInterval(this.videoPumpTimer)
      this.videoPumpTimer = null
    }
  }

  private async pumpVideo() {
    if (this.videoPumpBusy || !this.process.stdin || this.process.stdin.destroyed) return
    this.videoPumpBusy = true
    try {
      const frame = this.frameQueue.shift()
      if (frame) {
        const canWrite = this.process.stdin.write(frame.data)
        if (!canWrite) {
          await new Promise(resolve => this.process.stdin.once('drain', resolve))
        }
      }
    } finally {
      this.videoPumpBusy = false
    }
  }

  public pushVideoFrame(payload: VideoFramePayload) {
    this.framesSinceLastReport++
    this.lastFrameReceivedAt = Date.now()
    
    if (this.config.inputFormat === 'h264') {
       this.process.stdin?.write(payload.data)
    } else {
       this.frameQueue.push(payload)
       if (this.frameQueue.length > 10) this.frameQueue.shift()
    }
  }

  public stop() {
    this.failureEmitted = true
    this.stopPump()
    try {
      this.process.kill('SIGINT')
    } catch (e) {}
  }
}
