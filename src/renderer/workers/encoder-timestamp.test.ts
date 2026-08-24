import { describe, expect, it } from 'vitest'
import { nextEncoderTimestamp } from './encoder-timestamp'

describe('nextEncoderTimestamp', () => {
  it('keeps one monotonic encoder clock across compositor producer changes', () => {
    const producerTimestamps = [5_000_000, 5_033_333, 0, 33_333, 12_000_000]
    let encoderTimestamp: number | null = null
    const encoded = producerTimestamps.map(() => {
      encoderTimestamp = nextEncoderTimestamp(encoderTimestamp, 30)
      return encoderTimestamp
    })

    expect(encoded).toEqual([0, 33_333, 66_666, 99_999, 133_332])
    expect(encoded.every((timestamp, index) => index === 0 || timestamp > encoded[index - 1])).toBe(true)
  })

  it('sanitizes invalid frame rates', () => {
    expect(nextEncoderTimestamp(null, Number.NaN)).toBe(0)
    expect(nextEncoderTimestamp(0, Number.NaN)).toBe(33_333)
    expect(nextEncoderTimestamp(0, 120)).toBe(16_667)
  })
})
