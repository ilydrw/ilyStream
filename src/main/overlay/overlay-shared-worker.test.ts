import { Script } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { OVERLAY_SHARED_WORKER_SCRIPT } from './overlay-shared-worker'

describe('overlay shared worker', () => {
  it('is parseable and advances recovery cursors only from delivered events', () => {
    expect(() => new Script(OVERLAY_SHARED_WORKER_SCRIPT)).not.toThrow()
    expect(OVERLAY_SHARED_WORKER_SCRIPT).toContain('limit: 120')
    expect(OVERLAY_SHARED_WORKER_SCRIPT).toContain('subscription.after = Math.max')
    expect(OVERLAY_SHARED_WORKER_SCRIPT).not.toContain(
      'targeted.after = Number(message.cursor)'
    )
  })
})
