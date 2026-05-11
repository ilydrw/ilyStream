import type { Writable } from 'stream'

export interface PipeBufferStats {
  queuedBytes: number
  queuedChunks: number
  droppedChunks: number
  droppedBytes: number
}

/**
 * Wraps a Writable (typically an ffmpeg stdin/stdio[3] pipe) with a small
 * bounded queue and drain handling. Backpressure is the most common cause of
 * silent audio dropouts in this app: when ffmpeg's stdin buffer fills (CPU
 * spike, encoder hiccup, network blip) the underlying `write()` returns false.
 * Without queuing, the next chunk is lost and the broadcast hears a gap.
 *
 * Behavior:
 * - Try the write immediately. On success, return true.
 * - On `false` return, set a drain listener; subsequent chunks queue.
 * - On drain, flush the queue in order until the next `false`.
 * - If the queued bytes exceed `maxQueueBytes`, drop the OLDEST chunk first
 *   (preserves the most recent audio) and bump the drop counters.
 */
export class PipeBuffer {
  private queue: Buffer[] = []
  private queuedBytes = 0
  private waitingForDrain = false
  private droppedChunks = 0
  private droppedBytes = 0
  private drainHandler = () => this.flush()
  private detached = false

  constructor(private readonly pipe: Writable, private readonly maxQueueBytes: number) {
    this.pipe.on('drain', this.drainHandler)
  }

  detach(): void {
    if (this.detached) return
    this.detached = true
    try { this.pipe.off('drain', this.drainHandler) } catch {}
    this.queue.length = 0
    this.queuedBytes = 0
  }

  /** Returns true if the chunk was accepted (written or queued), false if it was dropped. */
  write(data: Uint8Array | Buffer): boolean {
    if (this.detached || !this.pipe.writable) return false
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength)

    if (this.waitingForDrain || this.queue.length > 0) {
      this.enqueue(buf)
      return true
    }

    const ok = this.pipe.write(buf)
    if (!ok) this.waitingForDrain = true
    return true
  }

  getStats(): PipeBufferStats {
    return {
      queuedBytes: this.queuedBytes,
      queuedChunks: this.queue.length,
      droppedChunks: this.droppedChunks,
      droppedBytes: this.droppedBytes
    }
  }

  private enqueue(buf: Buffer): void {
    this.queue.push(buf)
    this.queuedBytes += buf.byteLength
    while (this.queuedBytes > this.maxQueueBytes && this.queue.length > 1) {
      const dropped = this.queue.shift()!
      this.queuedBytes -= dropped.byteLength
      this.droppedChunks++
      this.droppedBytes += dropped.byteLength
    }
  }

  private flush(): void {
    if (this.detached) return
    while (this.queue.length > 0) {
      const next = this.queue[0]
      const ok = this.pipe.write(next)
      this.queue.shift()
      this.queuedBytes -= next.byteLength
      if (!ok) return
    }
    this.waitingForDrain = false
  }
}
