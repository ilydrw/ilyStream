import { spawn, type ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import type { Writable } from 'stream'
import { PipeBuffer } from './pipe-buffer'

const AUDIO_PIPE_QUEUE_BYTES = 1024 * 1024 // ~2.7s at 48 kHz stereo f32; protects audio through short encoder/network stalls
const VIDEO_PIPE_QUEUE_BYTES = 2 * 1024 * 1024

export class FFmpegProcessManager extends EventEmitter {
  private process: ChildProcess | null = null
  private videoBuffer: PipeBuffer | null = null
  private audioBuffer: PipeBuffer | null = null
  private lastStderr = ''
  private failureEmitted = false
  private stoppingProcess: ChildProcess | null = null

  constructor(private name: string) {
    super()
  }

  start(ffmpegPath: string, args: string[], audioEnabled: boolean, redact?: (val: string) => string): void {
    this.stop()
    this.lastStderr = ''
    this.failureEmitted = false
    this.stoppingProcess = null

    const child = spawn(ffmpegPath, args, {
      stdio: ['pipe', 'ignore', 'pipe', audioEnabled ? 'pipe' : 'ignore']
    })
    this.process = child

    child.stdin?.setMaxListeners(100)
    const audioPipe = this.getAudioPipe()
    audioPipe?.setMaxListeners(100)

    child.stdin?.on('error', (err) => this.handleError(err, child))
    audioPipe?.on('error', (err) => this.handleError(err, child))
    child.on('error', (err) => this.handleError(err, child))

    const videoBuffer = child.stdin ? new PipeBuffer(child.stdin, VIDEO_PIPE_QUEUE_BYTES) : null
    const audioBuffer = audioEnabled && audioPipe ? new PipeBuffer(audioPipe, AUDIO_PIPE_QUEUE_BYTES) : null

    if (videoBuffer) {
      this.videoBuffer = videoBuffer
    }
    if (audioBuffer) {
      this.audioBuffer = audioBuffer
    }

    child.stderr?.on('data', (data) => {
      let msg = data.toString()
      if (redact) msg = redact(msg)
      this.lastStderr = (this.lastStderr + msg).slice(-6000)
      if (/error|failed|invalid|denied/i.test(msg)) {
        console.error(`[FFmpeg ${this.name}]`, msg.trim())
      }
    })

    child.on('close', (code, signal) => {
      videoBuffer?.detach()
      audioBuffer?.detach()
      if (this.videoBuffer === videoBuffer) this.videoBuffer = null
      if (this.audioBuffer === audioBuffer) this.audioBuffer = null
      if (this.process === child) this.process = null

      const wasIntentionalStop = this.stoppingProcess === child
      if (wasIntentionalStop) this.stoppingProcess = null
      if (this.failureEmitted || wasIntentionalStop) return
      this.emit('close', code, signal, this.getFailureSummary(code, signal))
    })
  }

  stop(): void {
    const child = this.process
    if (child) {
      this.stoppingProcess = child
      try {
        child.kill('SIGINT')
      } catch (err) {
        try { child.kill() } catch {}
      }
      this.scheduleForceKill(child)
      this.process = null
    }
    this.videoBuffer?.detach()
    this.audioBuffer?.detach()
    this.videoBuffer = null
    this.audioBuffer = null
  }

  /**
   * Stop and resolve once the child has actually exited (so a recording's
   * container trailer / moov atom is flushed) — bounded by a hard timeout so
   * app shutdown can never hang on a wedged ffmpeg. stop() already escalates to
   * SIGKILL at 5s if SIGINT is ignored (common on Windows).
   */
  async stopAndWait(timeoutMs = 8000): Promise<void> {
    const child = this.process
    if (!child || child.exitCode !== null) {
      this.stop()
      return
    }
    await new Promise<void>((resolve) => {
      let settled = false
      const finish = (): void => {
        if (settled) return
        settled = true
        clearTimeout(hardTimer)
        resolve()
      }
      const hardTimer = setTimeout(finish, timeoutMs)
      ;(hardTimer as any)?.unref?.()
      child.once('close', finish)
      this.stop()
    })
  }

  /**
   * SIGINT alone is unreliable for ffmpeg on Windows (Node emulates it and a
   * wedged process — stuck RTMP write, GPU hang — never exits). Escalate to
   * SIGKILL so the child can't linger holding the encoder, socket, or file.
   */
  private scheduleForceKill(child: ChildProcess): void {
    if (child.exitCode !== null) return
    const timer = setTimeout(() => {
      if (child.exitCode === null) {
        try { child.kill('SIGKILL') } catch {}
      }
    }, 5000)
    ;(timer as any)?.unref?.()
    child.once('close', () => clearTimeout(timer))
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

  isRunning(): boolean {
    return Boolean(this.process && this.process.exitCode === null && !this.process.killed)
  }

  private getAudioPipe(): Writable | null {
    return (this.process?.stdio[3] as Writable) || null
  }

  private handleError(error: Error, child?: ChildProcess): void {
    if (child && this.process !== child && this.stoppingProcess !== child) return
    const message = error.message || String(error)
    if (!/EOF|EPIPE|closed|write after end/i.test(message)) {
      console.error(`[FFmpeg ${this.name}] Pipe error:`, error)
    }
    if (this.failureEmitted) return
    this.failureEmitted = true
    this.stop()
    this.emit('error', error)
  }

  private getFailureSummary(code: number | null, signal: NodeJS.Signals | null): string {
    const tail = this.lastStderr.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(-3).join(' | ')
    return tail || `FFmpeg ${this.name} exited${code === null ? '' : ` with code ${code}`}${signal ? ` (${signal})` : ''}`
  }
}
