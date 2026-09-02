import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NativeCoreDiagnostics } from '../../shared/native-core-diagnostics'
import { describeNativeCoreHealth, pollNativeCoreDiagnostics } from './native-core-health'
import { createHealthDiagnosticReport } from './health-center'

const NOW = 20_000
function matching(): NativeCoreDiagnostics {
  return {
    sampledAt: NOW, mixerOutput: 'shadow-only',
    host: { enabled: true, running: true, failed: false },
    collectionError: null, disabledReason: null,
    policy: { evaluated: 1, mismatches: 0, rejected: 0, coalesced: 0 },
    audio: {
      enabled: true, active: true, failed: false, startedAt: NOW - 1_000, lastComparedAt: NOW,
      sourceCount: 2, sourceFrames: 2048, nativeFrames: 1024, comparedBlocks: 1,
      mismatches: 0, rejected: 0, droppedComparisons: 0, maxError: 0
    },
    transport: { running: true, blocksMixed: 1, framesMixed: 1024, sourceUnderruns: 0, sourceFramesSkipped: 0 }
  }
}

afterEach(() => vi.useRealTimers())

describe('native mixer health', () => {
  it('labels clean comparisons as provisional shadow evidence', () => {
    const result = describeNativeCoreHealth(matching(), NOW)
    expect(result.label).toBe('Matching so far')
    expect(result.detail).toContain('not encoder-cutover approval')
  })

  it.each(['mismatches', 'rejected', 'droppedComparisons'] as const)('flags audio %s', field => {
    const snapshot = matching()
    snapshot.audio[field] = 1
    expect(describeNativeCoreHealth(snapshot, NOW).label).toBe('Audio needs review')
  })

  it.each(['sourceUnderruns', 'sourceFramesSkipped'] as const)('flags transport %s', field => {
    const snapshot = matching()
    snapshot.transport![field] = 1
    expect(describeNativeCoreHealth(snapshot, NOW).tone).toBe('warning')
  })

  it('distinguishes no evidence, stalled evidence, unknown transport, and stale diagnostics', () => {
    const snapshot = matching()
    snapshot.audio.comparedBlocks = 0
    snapshot.audio.lastComparedAt = null
    expect(describeNativeCoreHealth(snapshot, NOW).label).toBe('Collecting')
    snapshot.audio.startedAt = 0
    expect(describeNativeCoreHealth(snapshot, NOW).label).toBe('No comparison progress')
    snapshot.transport = null
    expect(describeNativeCoreHealth(snapshot, NOW).label).toBe('Transport unavailable')
    expect(describeNativeCoreHealth(snapshot, NOW + 11_000).label).toBe('Stale snapshot')
    expect(describeNativeCoreHealth(null, NOW).label).toBe('Unavailable')
  })

  it('distinguishes disabled, conflict, policy failures, and stopped sessions', () => {
    const snapshot = matching()
    snapshot.host.enabled = false
    expect(describeNativeCoreHealth(snapshot, NOW).label).toBe('Disabled')
    snapshot.host.enabled = true
    snapshot.disabledReason = 'capture-conflict'
    expect(describeNativeCoreHealth(snapshot, NOW).label).toBe('Capture conflict')
    snapshot.disabledReason = null
    snapshot.policy.mismatches = 1
    expect(describeNativeCoreHealth(snapshot, NOW).label).toBe('Policy needs review')
    snapshot.policy.mismatches = 0
    snapshot.audio.active = false
    expect(describeNativeCoreHealth(snapshot, NOW).label).toBe('Session stopped')
  })

  it('includes the native snapshot in the copyable report without changing platform data', () => {
    const snapshot = matching()
    const report = JSON.parse(createHealthDiagnosticReport({ now: NOW, nativeCore: snapshot }))
    expect(report.nativeCore).toEqual(snapshot)
    expect(report.platforms).toHaveLength(4)
  })
})

describe('native diagnostics polling', () => {
  it('never overlaps requests and suppresses delivery after disposal', async () => {
    vi.useFakeTimers()
    let resolve!: (value: NativeCoreDiagnostics | null) => void
    const read = vi.fn(() => new Promise<NativeCoreDiagnostics | null>(done => { resolve = done }))
    const deliver = vi.fn()
    const stop = pollNativeCoreDiagnostics(read, deliver)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(read).toHaveBeenCalledOnce()
    resolve(matching())
    await vi.advanceTimersByTimeAsync(2_000)
    expect(deliver).toHaveBeenCalledOnce()
    expect(read).toHaveBeenCalledTimes(2)
    stop()
    resolve(matching())
    await vi.advanceTimersByTimeAsync(10_000)
    expect(deliver).toHaveBeenCalledOnce()
    expect(read).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clears failed snapshots and retries without unhandled rejections', async () => {
    vi.useFakeTimers()
    const read = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(matching())
    const deliver = vi.fn()
    const stop = pollNativeCoreDiagnostics(read, deliver)
    await vi.advanceTimersByTimeAsync(0)
    expect(deliver).toHaveBeenLastCalledWith(null)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(deliver).toHaveBeenLastCalledWith(matching())
    stop()
    expect(vi.getTimerCount()).toBe(0)
  })
})
