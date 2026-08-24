import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UtilityProcess } from 'electron'
import type { KokoroWorkerRequest } from '../../shared/kokoro-worker'

vi.mock('electron', () => ({
  utilityProcess: { fork: vi.fn() }
}))

import { KokoroWorkerService } from './kokoro-worker-service'

class FakeUtilityProcess extends EventEmitter {
  pid: number | undefined = 1234
  stdout = null
  stderr = null
  readonly postMessage = vi.fn()
  readonly kill = vi.fn(() => {
    this.pid = undefined
    return true
  })
}

describe('KokoroWorkerService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts lazily, resolves audio, then releases the idle process', async () => {
    const child = new FakeUtilityProcess()
    const forkProcess = vi.fn(() => child as unknown as UtilityProcess)
    const service = new KokoroWorkerService({
      workerPath: 'kokoro-worker.js',
      idleTimeoutMs: 50,
      forkProcess
    })

    const generation = service.generate({
      text: 'hello',
      voice: 'af_heart',
      speed: 1
    }, 'q8')

    expect(forkProcess).toHaveBeenCalledOnce()
    expect(child.postMessage).not.toHaveBeenCalled()

    child.emit('spawn')
    await vi.waitFor(() => expect(child.postMessage).toHaveBeenCalledOnce())
    const request = child.postMessage.mock.calls[0][0] as KokoroWorkerRequest
    child.emit('message', {
      id: request.id,
      ok: true,
      result: {
        samples: new Float32Array([0.1, -0.1]),
        sampleRate: 24_000
      }
    })

    await expect(generation).resolves.toMatchObject({ sampleRate: 24_000 })
    expect(service.getStatus()).toMatchObject({
      running: true,
      quality: 'q8',
      pendingRequests: 0
    })

    await vi.advanceTimersByTimeAsync(50)
    expect(child.kill).toHaveBeenCalledOnce()
    expect(service.getStatus().running).toBe(false)
  })

  it('restarts the worker when the requested quality changes', async () => {
    const first = new FakeUtilityProcess()
    const second = new FakeUtilityProcess()
    const forkProcess = vi.fn()
      .mockReturnValueOnce(first as unknown as UtilityProcess)
      .mockReturnValueOnce(second as unknown as UtilityProcess)
    const service = new KokoroWorkerService({ forkProcess })

    const preloadQ8 = service.preload('q8')
    first.emit('spawn')
    await vi.waitFor(() => expect(first.postMessage).toHaveBeenCalledOnce())
    const firstRequest = first.postMessage.mock.calls[0][0] as KokoroWorkerRequest
    first.emit('message', { id: firstRequest.id, ok: true })
    await preloadQ8

    const preloadFp32 = service.preload('fp32')
    expect(first.kill).toHaveBeenCalledOnce()
    second.emit('spawn')
    await vi.waitFor(() => expect(second.postMessage).toHaveBeenCalledOnce())
    const secondRequest = second.postMessage.mock.calls[0][0] as KokoroWorkerRequest
    second.emit('message', { id: secondRequest.id, ok: true })

    await expect(preloadFp32).resolves.toBeUndefined()
    expect(service.getStatus().quality).toBe('fp32')
    service.dispose()
  })

  it('rejects pending work if the utility process exits', async () => {
    const child = new FakeUtilityProcess()
    const service = new KokoroWorkerService({
      forkProcess: () => child as unknown as UtilityProcess
    })

    const generation = service.generate({
      text: 'hello',
      voice: 'af_heart',
      speed: 1
    }, 'q8')
    child.emit('spawn')
    await vi.waitFor(() => expect(child.postMessage).toHaveBeenCalledOnce())
    child.emit('exit', 9)

    await expect(generation).rejects.toThrow('exited with code 9')
    expect(service.getStatus().running).toBe(false)
  })

  it('rejects malformed synthesis requests before starting a process', async () => {
    const forkProcess = vi.fn()
    const service = new KokoroWorkerService({ forkProcess })

    expect(() => service.generate({
      text: '',
      voice: 'af_heart',
      speed: 1
    }, 'q8')).toThrow('text is required')
    expect(forkProcess).not.toHaveBeenCalled()
  })
})
