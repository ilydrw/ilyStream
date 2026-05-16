import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let userDataDir = ''

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => userDataDir)
  }
}))

import { AssetService } from './asset-service'

describe('AssetService', () => {
  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'ilystream-assets-'))
  })

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true })
    userDataDir = ''
  })

  it('rejects upload sources that are not files', () => {
    const service = new AssetService()
    const directoryPath = join(userDataDir, 'not-a-file.png')
    mkdirSync(directoryPath)

    expect(() => service.uploadImage(directoryPath)).toThrow('Image file was not found.')
  })
})
