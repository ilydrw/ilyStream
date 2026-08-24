import { describe, expect, it, vi } from 'vitest'
import { SSE_MAX_BUFFERED_BYTES, writeToSseClient } from './sse-backpressure'

interface FakeClientOptions {
  writableLength?: number
  socketWritableLength?: number
  destroyed?: boolean
  writableEnded?: boolean
  writeThrows?: boolean
}

function createFakeClient(options: FakeClientOptions = {}) {
  const client = {
    destroyed: options.destroyed ?? false,
    writableEnded: options.writableEnded ?? false,
    writableLength: options.writableLength ?? 0,
    socket: { writableLength: options.socketWritableLength ?? 0 },
    write: vi.fn(() => {
      if (options.writeThrows) throw new Error('EPIPE')
      return true
    }),
    destroy: vi.fn(function (this: { destroyed: boolean }) {
      this.destroyed = true
    })
  }
  return client
}

describe('writeToSseClient', () => {
  it('writes and keeps a healthy client', () => {
    const client = createFakeClient()

    expect(writeToSseClient(client as any, 'data: hi\n\n', 'test')).toBe(true)
    expect(client.write).toHaveBeenCalledWith('data: hi\n\n')
    expect(client.destroy).not.toHaveBeenCalled()
  })

  it('drops a client whose response buffer exceeds the ceiling', () => {
    const client = createFakeClient({ writableLength: SSE_MAX_BUFFERED_BYTES + 1 })

    expect(writeToSseClient(client as any, 'data: hi\n\n', 'test')).toBe(false)
    expect(client.destroy).toHaveBeenCalled()
  })

  it('counts socket-level buffering toward the ceiling', () => {
    const client = createFakeClient({
      writableLength: SSE_MAX_BUFFERED_BYTES / 2,
      socketWritableLength: SSE_MAX_BUFFERED_BYTES / 2 + 1
    })

    expect(writeToSseClient(client as any, 'data: hi\n\n', 'test')).toBe(false)
    expect(client.destroy).toHaveBeenCalled()
  })

  it('stays under the ceiling without dropping', () => {
    const client = createFakeClient({ writableLength: SSE_MAX_BUFFERED_BYTES - 1024 })

    expect(writeToSseClient(client as any, 'data: hi\n\n', 'test')).toBe(true)
    expect(client.destroy).not.toHaveBeenCalled()
  })

  it('destroys a client whose write throws', () => {
    const client = createFakeClient({ writeThrows: true })

    expect(writeToSseClient(client as any, 'data: hi\n\n', 'test')).toBe(false)
    expect(client.destroy).toHaveBeenCalled()
  })

  it('skips clients that are already destroyed or ended without writing', () => {
    const destroyed = createFakeClient({ destroyed: true })
    const ended = createFakeClient({ writableEnded: true })

    expect(writeToSseClient(destroyed as any, 'data: hi\n\n', 'test')).toBe(false)
    expect(writeToSseClient(ended as any, 'data: hi\n\n', 'test')).toBe(false)
    expect(destroyed.write).not.toHaveBeenCalled()
    expect(ended.write).not.toHaveBeenCalled()
  })

  it('tolerates a client with no socket reference', () => {
    const client = createFakeClient()
    ;(client as any).socket = null

    expect(writeToSseClient(client as any, 'data: hi\n\n', 'test')).toBe(true)
  })
})
