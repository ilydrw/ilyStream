import { spawn, type ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import type { Writable } from 'stream'
import { PipeBuffer } from './pipe-buffer'

const AUDIO_PIPE_QUEUE_BYTES = 32 * 1024
const VIDEO_PIPE_QUEUE_BYTES = 2 * 1024 * 1024

export class FFmpegProcessManager extends EventEmitter {
  private process: ChildProcess | null = null
  private videoBuffer: PipeBuffer | null = null
  private audioBuffer: PipeBuffer | null = null
  private lastStderr = ''
  private failureEmitted = false

  constructor(private name: string) {
    super()
  }

  start(ffmpegPath: string, args: string[], audioEnabled: boolean, redact?: (val: string) => string): void {
    this.stop()
    this.lastStderr = ''
    this.failureEmitted = false

    this.process = spawn(ffmpegPath, args, {
      stdio: ['pipe', 'ignore', 'pipe', audioEnabled ? 'pipe' : 'ignore']
    })

    this.process.stdin?.setMaxListeners(100)
    const audioPipe = this.getAudioPipe()
    audioPipe?.setMaxListeners(100)

    this.process.stdin?.on('error', (err) => this.handleError(err))
    audioPipe?.on('error', (err) => this.handleError(err))

    if (this.process.stdin) {
      this.videoBuffer = new PipeBuffer(this.process.stdin, VIDEO_PIPE_QUEUE_BYTES)
    }
    if (audioEnabled && audioPipe) {
      this.audioBuffer = new PipeBuffer(audioPipe, AUDIO_PIPE_QUEUE_BYTES)
    }

    this.process.stderr?.on('data', (data) => {
      let msg = data.toString()
      if (redact) msg = redact(msg)
      this.lastStderr = (this.lastStderr + msg).slice(-6000)
      if (/error|failed|invalid|denied/i.test(msg)) {
        console.error(`[FFmpeg ${this.name}]`, msg.trim())
      }
    })

    this.process.on('close', (code, signal) => {
      this.videoBuffer?.detach()
      this.audioBuffer?.detach()
      this.videoBuffer = null
      this.audioBuffer = null
      
      if (this.failureEmitted) return
      this.emit('close', code, signal, this.getFailureSummary(code, signal))
      this.process = null
    })
  }

  stop(): void {
    if (this.process) {
      // Send 'q' to FFmpeg for a clean shutdown (important for MP4 finalization)
      try {
        if (this.process.stdin && this.process.stdin.writable) {
          this.process.stdin.write('q\n')
        } else {
          this.process.kill('SIGINT')
        }
      } catch (err) {
        this.process.kill('SIGINT')
      }
      this.process = null
    }
    this.videoBuffer?.detach()
    this.audioBuffer?.detach()
    this.videoBuffer = null
    this.audioBuffer = null
  }

  writeVideo(data: Uint8Array): boolean {
    return this.videoBuffer?.write(data) ?? false
  }

  writeAudio(data: Uint8Array): boolean {
    return this.audioBuffer?.write(data) ?? false
  }

  getStats() {
    const v = this.videoBuffer?.getStats()
    const a = this.audioBuffer?.getStats()
    const parts: string[] = []
    if (v?.droppedChunks) parts.push(`video drops=${v.droppedChunks}`)
    if (a?.droppedChunks) parts.push(`audio drops=${a.droppedChunks}`)
    return parts.join(', ')
  }

  private getAudioPipe(): Writable | null {
    return (this.process?.stdio[3] as Writable) || null
  }

  private handleError(error: Error): void {
    const message = error.message || String(error)
    if (!/EOF|EPIPE|closed|write after end/i.test(message)) {
      console.error(`[FFmpeg ${this.name}] Pipe error:`, error)
    }
    if (this.failureEmitted) return
    this.failureEmitted = true
    this.emit('error', error)
    this.stop()
  }

  private getFailureSummary(code: number | null, signal: NodeJS.Signals | null): string {
    const tail = this.lastStderr.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(-3).join(' | ')
    return tail || `FFmpeg ${this.name} exited${code === null ? '' : ` with code ${code}`}${signal ? ` (${signal})` : ''}`
  }
}
