import { describe, expect, it } from 'vitest'
import { resolveDisplayCaptureAudioSource } from './display-capture'

describe('display capture audio routing', () => {
  it('captures system audio without muting local playback', () => {
    expect(resolveDisplayCaptureAudioSource(true)).toBe('loopback')
  })

  it('does not request loopback audio for video-only capture', () => {
    expect(resolveDisplayCaptureAudioSource(false)).toBeUndefined()
  })
})
