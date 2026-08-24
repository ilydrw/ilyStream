import { describe, expect, it, vi } from 'vitest'
import {
  createBroadcastOperationLock,
  resolveBroadcastHotkey,
  resolveBroadcastSessionStatus
} from './broadcast-controls'

function keyEvent(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key: '',
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target: null,
    ...overrides
  } as KeyboardEvent
}

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void } {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('resolveBroadcastHotkey', () => {
  it('does not claim shortcuts while the Broadcast route is inactive or a key is repeating', () => {
    expect(resolveBroadcastHotkey(keyEvent({ key: 'm' }), false)).toBeNull()
    expect(resolveBroadcastHotkey(keyEvent({ key: 'm', repeat: true }), true)).toBeNull()
  })

  it('does not claim shortcuts from editable or interactive controls', () => {
    expect(resolveBroadcastHotkey(keyEvent({ key: 's', target: { tagName: 'INPUT' } as never }), true)).toBeNull()
    expect(resolveBroadcastHotkey(keyEvent({ key: ' ', target: { tagName: 'BUTTON' } as never }), true)).toBeNull()
    expect(resolveBroadcastHotkey(keyEvent({
      key: 'c',
      target: { tagName: 'DIV', isContentEditable: true } as never
    }), true)).toBeNull()
    expect(resolveBroadcastHotkey(keyEvent({
      key: 't',
      target: { tagName: 'SPAN', closest: () => ({}) } as never
    }), true)).toBeNull()
  })

  it('leaves modifier conflicts to the browser, app, or operating system', () => {
    expect(resolveBroadcastHotkey(keyEvent({ key: 'm', ctrlKey: true }), true)).toBeNull()
    expect(resolveBroadcastHotkey(keyEvent({ key: 'f', altKey: true }), true)).toBeNull()
    expect(resolveBroadcastHotkey(keyEvent({ key: 'c', shiftKey: true }), true)).toBeNull()
    expect(resolveBroadcastHotkey(keyEvent({ key: 'z', ctrlKey: true, altKey: true }), true)).toBeNull()
  })

  it('keeps editor and production shortcuts without destructive output toggles', () => {
    expect(resolveBroadcastHotkey(keyEvent({ key: 'z', ctrlKey: true }), true)).toEqual({ type: 'undo' })
    expect(resolveBroadcastHotkey(keyEvent({ key: 'Z', ctrlKey: true, shiftKey: true }), true)).toEqual({ type: 'redo' })
    expect(resolveBroadcastHotkey(keyEvent({ key: 'y', metaKey: true }), true)).toEqual({ type: 'redo' })
    expect(resolveBroadcastHotkey(keyEvent({ key: ' ' }), true)).toEqual({ type: 'fade' })
    expect(resolveBroadcastHotkey(keyEvent({ key: 'c' }), true)).toEqual({ type: 'cut' })
    expect(resolveBroadcastHotkey(keyEvent({ key: '3' }), true)).toEqual({ type: 'select-scene', index: 2 })
    expect(resolveBroadcastHotkey(keyEvent({ key: 'Escape' }), true)).toEqual({ type: 'close-overlays' })
    expect(resolveBroadcastHotkey(keyEvent({ key: 'b' }), true)).toBeNull()
    expect(resolveBroadcastHotkey(keyEvent({ key: 'r' }), true)).toBeNull()
  })
})

describe('resolveBroadcastSessionStatus', () => {
  it('does not report Live until every output confirms packets', () => {
    expect(resolveBroadcastSessionStatus(true, false, [])).toBe('Starting')
    expect(resolveBroadcastSessionStatus(true, false, [{ state: 'starting' }])).toBe('Starting')
    expect(resolveBroadcastSessionStatus(true, false, [{ state: 'live' }, { state: 'starting' }])).toBe('Starting')
    expect(resolveBroadcastSessionStatus(true, false, [{ state: 'live' }, { state: 'live' }])).toBe('Live')
  })

  it('prioritizes reconnecting and preserves recording-only state', () => {
    expect(resolveBroadcastSessionStatus(true, true, [{ state: 'reconnecting' }])).toBe('Reconnecting')
    expect(resolveBroadcastSessionStatus(false, true)).toBe('Recording')
    expect(resolveBroadcastSessionStatus(false, false)).toBe('Offline')
  })
})

describe('createBroadcastOperationLock', () => {
  it('deduplicates repeated lifecycle requests while one is active', async () => {
    const lock = createBroadcastOperationLock()
    const pending = deferred()
    const start = vi.fn(() => pending.promise)

    const first = lock.run('broadcast', 'start', start)
    const second = lock.run('broadcast', 'start', start)

    expect(second).toBe(first)
    expect(lock.isBusy('broadcast')).toBe(true)
    await Promise.resolve()
    expect(start).toHaveBeenCalledTimes(1)

    pending.resolve()
    await first
    expect(lock.isBusy('broadcast')).toBe(false)
  })

  it('queues an opposing stop requested while an output is still starting', async () => {
    const lock = createBroadcastOperationLock()
    const pending = deferred()
    const start = vi.fn(() => pending.promise)
    const stop = vi.fn()

    const starting = lock.run('broadcast', 'start', start)
    const conflictingStop = lock.run('broadcast', 'stop', stop)

    expect(conflictingStop).not.toBe(starting)
    expect(stop).not.toHaveBeenCalled()
    pending.resolve()
    await starting
    await conflictingStop
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('serializes alternating intents and ends at the latest requested state', async () => {
    const lock = createBroadcastOperationLock()
    const pending = deferred()
    const calls: string[] = []

    const starting = lock.run('broadcast', 'start', async () => {
      calls.push('start-1')
      await pending.promise
    })
    const stopping = lock.run('broadcast', 'stop', () => { calls.push('stop') })
    const restarting = lock.run('broadcast', 'start', () => { calls.push('start-2') })

    pending.resolve()
    await Promise.all([starting, stopping, restarting])

    expect(calls).toEqual(['start-1', 'stop', 'start-2'])
    expect(lock.isBusy('broadcast')).toBe(false)
  })

  it('keeps broadcast and recording lifecycles independent', async () => {
    const lock = createBroadcastOperationLock()
    const broadcastPending = deferred()
    const recording = vi.fn()

    const broadcast = lock.run('broadcast', 'start', () => broadcastPending.promise)
    await lock.run('recording', 'start', recording)

    expect(lock.isBusy('broadcast')).toBe(true)
    expect(recording).toHaveBeenCalledTimes(1)
    broadcastPending.resolve()
    await broadcast
  })

  it('releases a failed operation so it can be retried', async () => {
    const lock = createBroadcastOperationLock()
    const error = new Error('startup failed')

    await expect(lock.run('recording', 'start', () => Promise.reject(error))).rejects.toThrow('startup failed')
    expect(lock.isBusy('recording')).toBe(false)

    const retry = vi.fn()
    await lock.run('recording', 'start', retry)
    expect(retry).toHaveBeenCalledTimes(1)
  })
})
