import { EventEmitter } from 'events'
import { describe, expect, it } from 'vitest'
import { PipeBuffer } from './pipe-buffer'

/**
 * Minimal fake Writable. `write()` returns whatever `nextWriteResult` is set
 * to, records every chunk it accepted, and exposes a toggleable `writable`
 * flag. `drain` is emitted manually via `emit('drain')` to exercise flush.
 */
class FakeWritable extends EventEmitter {
  writable = true
  nextWriteResult = true
  written: Buffer[] = []

  write(chunk: Buffer): boolean {
    this.written.push(chunk)
    return this.nextWriteResult
  }
}

function buf(str: string): Buffer {
  return Buffer.from(str)
}

describe('PipeBuffer – immediate write', () => {
  it('writes straight through and returns true when pipe.write() returns true', () => {
    const pipe = new FakeWritable()
    const pb = new PipeBuffer(pipe as any, 1024)

    expect(pb.write(buf('hello'))).toBe(true)
    expect(pipe.written.map((b) => b.toString())).toEqual(['hello'])

    const stats = pb.getStats()
    expect(stats.queuedChunks).toBe(0)
    expect(stats.queuedBytes).toBe(0)
    expect(stats.droppedChunks).toBe(0)
    expect(stats.droppedBytes).toBe(0)
  })

  it('accepts a Uint8Array and forwards it as a Buffer', () => {
    const pipe = new FakeWritable()
    const pb = new PipeBuffer(pipe as any, 1024)

    expect(pb.write(new Uint8Array([1, 2, 3]))).toBe(true)
    expect(pipe.written).toHaveLength(1)
    expect(Buffer.isBuffer(pipe.written[0])).toBe(true)
    expect([...pipe.written[0]]).toEqual([1, 2, 3])
  })
})

describe('PipeBuffer – backpressure queueing', () => {
  it('queues subsequent chunks after write() returns false and does not lose them', () => {
    const pipe = new FakeWritable()
    const pb = new PipeBuffer(pipe as any, 1024)

    // First write hits the pipe but signals backpressure.
    pipe.nextWriteResult = false
    expect(pb.write(buf('a'))).toBe(true)
    expect(pipe.written.map((b) => b.toString())).toEqual(['a'])

    // Now waiting for drain: further chunks queue rather than write.
    expect(pb.write(buf('b'))).toBe(true)
    expect(pb.write(buf('c'))).toBe(true)
    // No additional writes have reached the pipe yet.
    expect(pipe.written.map((b) => b.toString())).toEqual(['a'])

    const stats = pb.getStats()
    expect(stats.queuedChunks).toBe(2)
    expect(stats.queuedBytes).toBe(2)
    expect(stats.droppedChunks).toBe(0)
  })

  it('flushes queued chunks in order on the drain event', () => {
    const pipe = new FakeWritable()
    const pb = new PipeBuffer(pipe as any, 1024)

    pipe.nextWriteResult = false
    pb.write(buf('a')) // written, triggers waitingForDrain
    pb.write(buf('b')) // queued
    pb.write(buf('c')) // queued

    // Pipe can accept again; emitting drain should flush b, c in order.
    pipe.nextWriteResult = true
    pipe.emit('drain')

    expect(pipe.written.map((b) => b.toString())).toEqual(['a', 'b', 'c'])

    const stats = pb.getStats()
    expect(stats.queuedChunks).toBe(0)
    expect(stats.queuedBytes).toBe(0)
  })

  it('stops flushing when the pipe backs up again mid-drain, keeping the rest queued', () => {
    const pipe = new FakeWritable()
    const pb = new PipeBuffer(pipe as any, 1024)

    pipe.nextWriteResult = false
    pb.write(buf('a')) // written
    pb.write(buf('bb')) // queued
    pb.write(buf('cc')) // queued

    // On drain, the first queued write goes through but returns false again,
    // so flush stops and the remaining chunk stays queued.
    pipe.nextWriteResult = false
    pipe.emit('drain')

    // 'a' (initial) + 'bb' (first flushed) reached the pipe.
    expect(pipe.written.map((b) => b.toString())).toEqual(['a', 'bb'])

    const stats = pb.getStats()
    expect(stats.queuedChunks).toBe(1)
    expect(stats.queuedBytes).toBe(2) // 'cc'
  })
})

describe('PipeBuffer – overflow policy drop-oldest (default)', () => {
  it('drops the oldest queued chunk once queuedBytes exceeds maxQueueBytes', () => {
    const pipe = new FakeWritable()
    // maxQueueBytes = 4 bytes.
    const pb = new PipeBuffer(pipe as any, 4)

    pipe.nextWriteResult = false
    pb.write(buf('aa')) // written, waitingForDrain
    pb.write(buf('bb')) // queued -> 2 bytes
    pb.write(buf('cc')) // queued -> 4 bytes (== max, no drop yet)

    let stats = pb.getStats()
    expect(stats.queuedBytes).toBe(4)
    expect(stats.queuedChunks).toBe(2)
    expect(stats.droppedChunks).toBe(0)

    // This pushes queuedBytes to 6 (> 4): oldest ('bb') is dropped down to 4.
    expect(pb.write(buf('dd'))).toBe(true)

    stats = pb.getStats()
    expect(stats.queuedBytes).toBe(4)
    expect(stats.queuedChunks).toBe(2)
    expect(stats.droppedChunks).toBe(1)
    expect(stats.droppedBytes).toBe(2)

    // The remaining queue is the newest two chunks, in order.
    pipe.nextWriteResult = true
    pipe.emit('drain')
    expect(pipe.written.map((b) => b.toString())).toEqual(['aa', 'cc', 'dd'])
  })

  it('keeps at least one chunk even when a single chunk exceeds maxQueueBytes', () => {
    const pipe = new FakeWritable()
    const pb = new PipeBuffer(pipe as any, 4)

    pipe.nextWriteResult = false
    pb.write(buf('aa')) // written, waitingForDrain

    // A lone oversized chunk cannot be dropped below max because the loop keeps
    // queue.length > 1; it stays queued and nothing is dropped.
    expect(pb.write(buf('hugehuge'))).toBe(true) // 8 bytes > 4

    const stats = pb.getStats()
    expect(stats.queuedChunks).toBe(1)
    expect(stats.queuedBytes).toBe(8)
    expect(stats.droppedChunks).toBe(0)
    expect(stats.droppedBytes).toBe(0)
  })
})

describe('PipeBuffer – overflow policy drop-newest', () => {
  it('rejects the newest chunk (returns false) and counts it when the queue would overflow', () => {
    const pipe = new FakeWritable()
    const pb = new PipeBuffer(pipe as any, { maxQueueBytes: 4, overflow: 'drop-newest' })

    pipe.nextWriteResult = false
    pb.write(buf('aa')) // written, waitingForDrain
    pb.write(buf('bb')) // queued -> 2 bytes
    pb.write(buf('cc')) // queued -> 4 bytes (== max)

    // Newest chunk would push past max -> rejected, not queued.
    expect(pb.write(buf('dd'))).toBe(false)

    const stats = pb.getStats()
    expect(stats.queuedBytes).toBe(4)
    expect(stats.queuedChunks).toBe(2)
    expect(stats.droppedChunks).toBe(1)
    expect(stats.droppedBytes).toBe(2)

    // The rejected chunk never reaches the pipe on drain.
    pipe.nextWriteResult = true
    pipe.emit('drain')
    expect(pipe.written.map((b) => b.toString())).toEqual(['aa', 'bb', 'cc'])
  })

  it('still enqueues the first queued chunk even if it alone exceeds max (queue was empty)', () => {
    const pipe = new FakeWritable()
    const pb = new PipeBuffer(pipe as any, { maxQueueBytes: 4, overflow: 'drop-newest' })

    pipe.nextWriteResult = false
    pb.write(buf('aa')) // written, waitingForDrain

    // Queue is empty, so the drop-newest guard (which requires queue.length > 0)
    // does not apply: the oversized chunk is accepted.
    expect(pb.write(buf('bigbig'))).toBe(true) // 6 bytes > 4

    const stats = pb.getStats()
    expect(stats.queuedChunks).toBe(1)
    expect(stats.queuedBytes).toBe(6)
    expect(stats.droppedChunks).toBe(0)
  })
})

describe('PipeBuffer – detach', () => {
  it('removes the drain listener, clears the queue, and rejects further writes', () => {
    const pipe = new FakeWritable()
    const pb = new PipeBuffer(pipe as any, 1024)

    expect(pipe.listenerCount('drain')).toBe(1)

    pipe.nextWriteResult = false
    pb.write(buf('a')) // written, waitingForDrain
    pb.write(buf('b')) // queued
    expect(pb.getStats().queuedChunks).toBe(1)

    pb.detach()

    // Drain listener gone, queue cleared.
    expect(pipe.listenerCount('drain')).toBe(0)
    const stats = pb.getStats()
    expect(stats.queuedChunks).toBe(0)
    expect(stats.queuedBytes).toBe(0)

    // Further writes are rejected.
    pipe.nextWriteResult = true
    expect(pb.write(buf('c'))).toBe(false)
    // Nothing new reached the pipe from the rejected write.
    expect(pipe.written.map((b) => b.toString())).toEqual(['a'])
  })

  it('is idempotent – a second detach() is a no-op', () => {
    const pipe = new FakeWritable()
    const pb = new PipeBuffer(pipe as any, 1024)

    pb.detach()
    expect(() => pb.detach()).not.toThrow()
    expect(pipe.listenerCount('drain')).toBe(0)
  })
})

describe('PipeBuffer – non-writable pipe', () => {
  it('returns false without writing when pipe.writable is false', () => {
    const pipe = new FakeWritable()
    pipe.writable = false
    const pb = new PipeBuffer(pipe as any, 1024)

    expect(pb.write(buf('a'))).toBe(false)
    expect(pipe.written).toHaveLength(0)
    expect(pb.getStats().queuedChunks).toBe(0)
  })
})

describe('PipeBuffer – getStats accuracy', () => {
  it('reports queued and dropped counters accurately across a mixed sequence', () => {
    const pipe = new FakeWritable()
    const pb = new PipeBuffer(pipe as any, 4)

    pipe.nextWriteResult = false
    pb.write(buf('aa')) // written, waitingForDrain
    pb.write(buf('bb')) // queued -> 2
    pb.write(buf('cc')) // queued -> 4
    pb.write(buf('dd')) // queued -> 6, drops oldest 'bb' -> 4

    const stats = pb.getStats()
    expect(stats).toEqual({
      queuedBytes: 4,
      queuedChunks: 2,
      droppedChunks: 1,
      droppedBytes: 2
    })
  })
})
