import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UtilityProcess } from 'electron'
import {
  SEGMENTATION_INPUT_HEIGHT,
  SEGMENTATION_INPUT_WIDTH,
  type SegmentationWorkerRequest
} from '../../shared/segmentation-worker'

vi.mock('electron', () => ({
  utilityProcess: { fork: vi.fn() },
  app: { getPath: vi.fn(() => '/tmp/userData') }
}))

import { SegmentationWorkerService } from './segmentation-worker-service'

class FakeUtilityProcess extends EventEmitter {
  pid: number | undefined = 4321
  stdout = null
  stderr = null
  readonly postMessage = vi.fn()
  readonly kill = vi.fn(() => {
    this.pid = undefined
    return true
  })
}

function makeFrame() {
  return {
    width: SEGMENTATION_INPUT_WIDTH,
    height: SEGMENTATION_INPUT_HEIGHT,
    data: new Uint8Array(SEGMENTATION_INPUT_WIDTH * SEGMENTATION_INPUT_HEIGHT * 4)
  }
}

describe('SegmentationWorkerService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts lazily, resolves a mask, then releases the idle process', async () => {
    const child = new FakeUtilityProcess()
    const forkProcess = vi.fn(() => child as unknown as UtilityProcess)
    const service = new SegmentationWorkerService({
      workerPath: 'segmentation-worker.js',
      idleTimeoutMs: 50,
      forkProcess
    })

    const segmentation = service.segment(makeFrame())

    expect(forkProcess).toHaveBeenCalledOnce()
    expect(child.postMessage).not.toHaveBeenCalled()

    child.emit('spawn')
    await vi.waitFor(() => expect(child.postMessage).toHaveBeenCalledOnce())
    const request = child.postMessage.mock.calls[0][0] as SegmentationWorkerRequest
    expect(request.type).toBe('segment')

    const alpha = new Uint8Array(SEGMENTATION_INPUT_WIDTH * SEGMENTATION_INPUT_HEIGHT)
    child.emit('message', {
      id: request.id,
      ok: true,
      result: { width: SEGMENTATION_INPUT_WIDTH, height: SEGMENTATION_INPUT_HEIGHT, alpha }
    })

    await expect(segmentation).resolves.toMatchObject({
      width: SEGMENTATION_INPUT_WIDTH,
      height: SEGMENTATION_INPUT_HEIGHT
    })
    expect(service.getStatus()).toMatchObject({ running: true, pendingRequests: 0 })

    await vi.advanceTimersByTimeAsync(50)
    expect(child.kill).toHaveBeenCalledOnce()
    expect(service.getStatus().running).toBe(false)
  })

  it('passes the model cache dir to the worker via the fork env', async () => {
    const child = new FakeUtilityProcess()
    const forkProcess = vi.fn(() => child as unknown as UtilityProcess)
    const service = new SegmentationWorkerService({
      modelCacheDir: '/models/seg',
      forkProcess
    })

    // dispose() rejects the still-pending spawn, so swallow that expected rejection.
    service.preload().catch(() => {})
    expect(forkProcess).toHaveBeenCalledOnce()
    const callArgs = forkProcess.mock.calls[0] as unknown as [string, string[], Electron.ForkOptions]
    const forkEnv = callArgs[2]?.env as Record<string, string | undefined> | undefined
    expect(forkEnv?.['ILY_SEGMENTATION_MODEL_DIR']).toBe('/models/seg')
    service.dispose()
  })

  it('rejects pending work if the utility process exits (renderer can fall back)', async () => {
    const child = new FakeUtilityProcess()
    const service = new SegmentationWorkerService({
      forkProcess: () => child as unknown as UtilityProcess
    })

    const segmentation = service.segment(makeFrame())
    child.emit('spawn')
    await vi.waitFor(() => expect(child.postMessage).toHaveBeenCalledOnce())
    child.emit('exit', 3)

    await expect(segmentation).rejects.toThrow('exited with code 3')
    expect(service.getStatus().running).toBe(false)
  })

  it('propagates a worker error (e.g. no model available)', async () => {
    const child = new FakeUtilityProcess()
    const service = new SegmentationWorkerService({
      forkProcess: () => child as unknown as UtilityProcess
    })

    const segmentation = service.segment(makeFrame())
    child.emit('spawn')
    await vi.waitFor(() => expect(child.postMessage).toHaveBeenCalledOnce())
    const request = child.postMessage.mock.calls[0][0] as SegmentationWorkerRequest
    child.emit('message', { id: request.id, ok: false, error: 'No segmentation model available' })

    await expect(segmentation).rejects.toThrow('No segmentation model available')
    service.dispose()
  })

  it('rejects malformed frames before starting a process', () => {
    const forkProcess = vi.fn()
    const service = new SegmentationWorkerService({ forkProcess })

    expect(() =>
      service.segment({ width: 4, height: 4, data: new Uint8Array(3) })
    ).toThrow('does not match')
    expect(forkProcess).not.toHaveBeenCalled()
  })
})
