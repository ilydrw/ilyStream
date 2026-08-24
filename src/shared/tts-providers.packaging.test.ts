import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_KOKORO_VOICE, KOKORO_VOICES } from './tts-providers'

/**
 * kokoro-js ships 54 voice files (~28MB) but the app only offers 20 of them.
 * electron-builder prunes the rest via an extglob allowlist in build.files, so
 * that glob has to stay in sync with KOKORO_VOICES — otherwise a newly exposed
 * voice ships as a UI option whose .bin was excluded from the installer.
 */
const VOICE_GLOB_PREFIX = '!node_modules/kokoro-js/voices/!('

function readPackagedVoiceAllowlist(): string[] {
  const pkg = JSON.parse(
    readFileSync(resolve(__dirname, '../../package.json'), 'utf8')
  ) as { build: { files: string[] } }

  const pattern = pkg.build.files.find((entry) => entry.startsWith(VOICE_GLOB_PREFIX))
  if (!pattern) throw new Error('kokoro voice allowlist glob missing from build.files')

  return pattern.slice(VOICE_GLOB_PREFIX.length, pattern.indexOf(')')).split('|')
}

describe('kokoro voice packaging allowlist', () => {
  it('ships exactly the voices the app exposes', () => {
    expect(readPackagedVoiceAllowlist().sort()).toEqual(
      KOKORO_VOICES.map((voice) => voice.id).sort()
    )
  })

  it('ships the default voice', () => {
    expect(readPackagedVoiceAllowlist()).toContain(DEFAULT_KOKORO_VOICE)
  })
})
