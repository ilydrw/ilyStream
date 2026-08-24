import { describe, expect, it, vi } from 'vitest'
import { SoundPlaybackQueue } from './sound-playback-queue'

describe('SoundPlaybackQueue', () => {
  it('waits for the active sound to finish before starting the next one', async () => {
    const finishers: Array<() => void> = []
    const runner = vi.fn((_item: string) => new Promise<void>((resolve) => finishers.push(resolve)))
    const queue = new SoundPlaybackQueue(runner)

    queue.enqueue('join')
    queue.enqueue('alert')

    expect(runner).toHaveBeenCalledTimes(1)
    expect(runner).toHaveBeenNthCalledWith(1, 'join', expect.any(AbortSignal))

    finishers.shift()?.()
    await Promise.resolve()
    await Promise.resolve()

    expect(runner).toHaveBeenCalledTimes(2)
    expect(runner).toHaveBeenNthCalledWith(2, 'alert', expect.any(AbortSignal))
  })

  it('starts immediate sounds without waiting for queued or immediate playback', () => {
    const runner = vi.fn(() => new Promise<void>(() => {}))
    const queue = new SoundPlaybackQueue(runner)

    queue.enqueue('alert')
    queue.playImmediately('soundboard-1')
    queue.playImmediately('soundboard-2')

    expect(runner).toHaveBeenCalledTimes(3)
    expect(runner).toHaveBeenNthCalledWith(1, 'alert', expect.any(AbortSignal))
    expect(runner).toHaveBeenNthCalledWith(2, 'soundboard-1', expect.any(AbortSignal))
    expect(runner).toHaveBeenNthCalledWith(3, 'soundboard-2', expect.any(AbortSignal))
  })

  it('stops the active sound and discards queued sounds when cleared', async () => {
    const aborted: string[] = []
    const runner = vi.fn((item: string, signal: AbortSignal) => new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => {
        aborted.push(item)
        resolve()
      }, { once: true })
    }))
    const queue = new SoundPlaybackQueue(runner)

    queue.enqueue('active')
    queue.enqueue('waiting-1')
    queue.enqueue('waiting-2')
    queue.clear()
    await Promise.resolve()
    await Promise.resolve()

    expect(aborted).toEqual(['active'])
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it('stops every immediate sound when cleared', async () => {
    const aborted: string[] = []
    const runner = vi.fn((item: string, signal: AbortSignal) => new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => {
        aborted.push(item)
        resolve()
      }, { once: true })
    }))
    const queue = new SoundPlaybackQueue(runner)

    queue.playImmediately('soundboard-1')
    queue.playImmediately('soundboard-2')
    queue.clear()
    await Promise.resolve()

    expect(aborted).toEqual(['soundboard-1', 'soundboard-2'])
  })

  it('continues with the next sound after a playback failure', async () => {
    const onError = vi.fn()
    const runner = vi.fn(async (item: string) => {
      if (item === 'broken') throw new Error('decode failed')
    })
    const queue = new SoundPlaybackQueue(runner, onError)

    queue.enqueue('broken')
    queue.enqueue('working')
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(runner).toHaveBeenCalledTimes(2)
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'broken')
  })
})
