import { describe, expect, it } from 'vitest'
import { TikTokMapper } from './tiktok-mapper'

describe('TikTokMapper', () => {
  it('marks repeatable repeatEnd=false gift updates as in-progress combo events', () => {
    const mapper = new TikTokMapper()

    expect(mapper.mapGift(makeGiftPayload(false, 1)).isCombo).toBe(true)
    expect(mapper.mapGift(makeGiftPayload('false', 1)).isCombo).toBe(true)
    expect(mapper.mapGift(makeGiftPayload(true, 1)).isCombo).toBe(false)
    expect(mapper.mapGift(makeGiftPayload(undefined, 1)).isCombo).toBe(false)
  })

  it('treats non-repeatable Heart Me gifts as final even when repeatEnd is false', () => {
    const mapper = new TikTokMapper()

    const gift = mapper.mapGift({
      ...makeGiftPayload(false, 4),
      giftId: '7934',
      giftName: 'Heart Me'
    })

    expect(gift).toEqual(expect.objectContaining({
      giftId: '7934',
      giftName: 'Heart Me',
      isCombo: false
    }))
  })

  it('decodes TikTok gift names before they reach alerts and automations', () => {
    const mapper = new TikTokMapper()

    expect(mapper.mapGift({
      ...makeGiftPayload(true, 1),
      giftName: 'It&#39;s Corn'
    }).giftName).toBe("It's Corn")

    expect(mapper.mapGift({
      ...makeGiftPayload(true, 1),
      extendedGiftInfo: {
        id: 'corn',
        name: 'It&amp;#39;s Corn'
      }
    }).giftName).toBe("It's Corn")
  })
})

function makeGiftPayload(repeatEnd: unknown, giftType?: number): Record<string, unknown> {
  return {
    msgId: `gg-${String(repeatEnd)}`,
    userId: 'user-1',
    uniqueId: 'gg_friend',
    nickname: 'GG Friend',
    giftId: 'gg',
    giftName: 'GG',
    giftType,
    repeatCount: 1,
    repeatEnd
  }
}
