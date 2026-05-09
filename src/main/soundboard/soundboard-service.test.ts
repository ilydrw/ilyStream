import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let userDataDir = ''

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => userDataDir)
  }
}))

import { SoundboardService } from './soundboard-service'

describe('SoundboardService', () => {
  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'ilystream-sounds-'))
  })

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true })
    userDataDir = ''
  })

  it('resolves only managed sound IDs inside the app sounds directory', () => {
    const service = new SoundboardService(makeDb())
    const alertPath = join(userDataDir, 'sounds', 'alerts', 'alert.mp3')
    const boardPath = join(userDataDir, 'sounds', 'board', 'button.wav')
    writeFileSync(alertPath, 'alert')
    writeFileSync(boardPath, 'button')

    expect(service.getSoundPath('alerts/alert.mp3')).toBe(alertPath)
    expect(service.getSoundPath('button.wav')).toBe(boardPath)
  })

  it('rejects absolute paths, traversal, and unsupported extensions', () => {
    const service = new SoundboardService(makeDb())

    expect(service.getSoundPath('C:\\Windows\\win.ini')).toBeNull()
    expect(service.getSoundPath('../secret.mp3')).toBeNull()
    expect(service.getSoundPath('alerts/../secret.mp3')).toBeNull()
    expect(service.getSoundPath('alerts/sound.ogg')).toBeNull()
  })
})

function makeDb(): any {
  return {
    getAllSoundMetadata: vi.fn(() => ({})),
    setSoundEmoji: vi.fn(),
    getSoundEmoji: vi.fn()
  }
}
