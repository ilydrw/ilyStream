import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
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

  it('rejects upload sources that are not files', () => {
    const service = new SoundboardService(makeDb())
    const directoryPath = join(userDataDir, 'not-a-file.mp3')
    mkdirSync(directoryPath)

    expect(() => service.uploadSound(directoryPath)).toThrow('Sound file was not found.')
  })

  it('includes the requested playback mode in emitted sound actions', () => {
    const service = new SoundboardService(makeDb())
    const boardPath = join(userDataDir, 'sounds', 'board', 'button.wav')
    writeFileSync(boardPath, 'button')
    const listener = vi.fn()
    service.on('action:play-sound', listener)

    expect(service.playSound('board/button.wav', 0.75, 'overlap')).toBe(true)
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      id: 'board/button.wav',
      volume: 0.75,
      playbackMode: 'overlap'
    }))
  })
})

function makeDb(): any {
  return {
    getAllSoundMetadata: vi.fn(() => ({})),
    setSoundEmoji: vi.fn(),
    getSoundEmoji: vi.fn()
  }
}
