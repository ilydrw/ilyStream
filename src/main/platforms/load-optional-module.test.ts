import { describe, expect, it } from 'vitest'
import { loadOptionalModule } from './load-optional-module'

describe('loadOptionalModule', () => {
  it('returns null when a module is unavailable', async () => {
    await expect(loadOptionalModule('codex-missing-module-for-test')).resolves.toBeNull()
  })

  it('loads installed modules at runtime', async () => {
    const eventsModule = await loadOptionalModule<typeof import('node:events')>('node:events')

    expect(eventsModule).not.toBeNull()
    expect(typeof eventsModule?.EventEmitter).toBe('function')
  })
})
