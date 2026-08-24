import { beforeEach, describe, expect, it, vi } from 'vitest'

const fsMocks = vi.hoisted(() => ({
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
  statSync: vi.fn(),
  renameSync: vi.fn(),
  rmSync: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: vi.fn().mockReturnValue('C:\\ilyStream-test') },
  dialog: { showErrorBox: vi.fn() }
}))

vi.mock('fs', () => fsMocks)
vi.mock('./logger', () => ({ redactString: (value: string) => value }))

describe('crash log bounds', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-25T12:00:00.000Z'))
    Object.values(fsMocks).forEach(mock => mock.mockReset())
    fsMocks.statSync.mockImplementation(() => {
      throw new Error('missing')
    })
  })

  it('coalesces repeated errors and flushes a summary after the dedupe window', async () => {
    const { writeCrashLog } = await import('./crash-reporter')
    const repeatedError = new Error('offline')

    writeCrashLog('connector failure', repeatedError)
    writeCrashLog('connector failure', repeatedError)
    writeCrashLog('connector failure', repeatedError)
    expect(fsMocks.appendFileSync).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(60_001)
    writeCrashLog('connector failure', repeatedError)

    expect(fsMocks.appendFileSync).toHaveBeenCalledTimes(2)
    expect(String(fsMocks.appendFileSync.mock.calls[1][1])).toContain(
      'previous message repeated 2 more times'
    )
  })

  it('rotates an oversized log before appending the next error', async () => {
    fsMocks.statSync.mockReturnValue({ size: 10 * 1024 * 1024 } as never)
    const { writeCrashLog } = await import('./crash-reporter')

    writeCrashLog('fatal', new Error('boom'))

    expect(fsMocks.rmSync).toHaveBeenCalledWith(
      'C:\\ilyStream-test\\logs\\main-crash.log.old',
      { force: true }
    )
    expect(fsMocks.renameSync).toHaveBeenCalledWith(
      'C:\\ilyStream-test\\logs\\main-crash.log',
      'C:\\ilyStream-test\\logs\\main-crash.log.old'
    )
    expect(fsMocks.appendFileSync).toHaveBeenCalledTimes(1)
  })
})
