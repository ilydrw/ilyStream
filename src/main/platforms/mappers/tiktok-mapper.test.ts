import { describe, expect, it } from 'vitest'
import { TikTokMapper } from './tiktok-mapper'

describe('TikTokMapper', () => {
  it('marks repeatEnd=false gift updates as in-progress combo events', () => {
    const mapper = new TikTokMapper()

    expect(mapper.mapGift(makeGiftPayload(false)).isCombo).toBe(true)
    expect(mapper.mapGift(makeGiftPayload('false')).isCombo).toBe(true)
    expect(mapper.mapGift(makeGiftPayload(true)).isCombo).toBe(false)
    expect(mapper.mapGift(makeGiftPayload(undefined)).isCombo).toBe(false)
  })
})

function makeGiftPayload(repeatEnd: unknown): Record<string, unknown> {
  return {
    msgId: `gg-${String(repeatEnd)}`,
    userId: 'user-1',
    uniqueId: 'gg_friend',
    nickname: 'GG Friend',
    giftId: 'gg',
    giftName: 'GG',
    repeatCount: 1,
    repeatEnd
  }
}
