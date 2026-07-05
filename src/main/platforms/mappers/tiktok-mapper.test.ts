import { describe, expect, it } from 'vitest'
import { TikTokMapper } from './tiktok-mapper'

describe('TikTokMapper', () => {
  it('marks repeatable repeatEnd=false gift updates as in-progress combo events', () => {
    const mapper = new TikTokMapper()

    expect(mapper.mapGift(makeGiftPayload(false, 1)).isCombo).toBe(true)
    expect(mapper.mapGift(makeGiftPayload('false', 1)).isCombo).toBe(true)
    expect(mapper.mapGift(makeGiftPayload(true, 1)).isCombo).toBe(false)
    expect(mapper.mapGift(makeGiftPayload(undefined, 1)).isCombo).toBe(true)
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

    expect(mapper.mapGift({
      ...makeGiftPayload(true, 1),
      giftName: "You&#39're Awesome"
    }).giftName).toBe("You're Awesome")
  })

  it('maps alternate TikTok like counter fields into real like totals', () => {
    const mapper = new TikTokMapper()

    const event = mapper.mapLike({
      eventId: 'like-event-1',
      userId: 'user-1',
      uniqueId: 'like_friend',
      nickname: 'Like Friend',
      count: '12',
      totalLikes: '3456'
    })

    expect(event).toEqual(expect.objectContaining({
      id: 'like-event-1',
      type: 'like',
      likeCount: 12,
      totalLikes: 3456
    }))
  })

  it('maps standard chat messages and handles empty/blank comments with emotes', () => {
    const mapper = new TikTokMapper()

    // Standard chat without emotes
    const chat1 = mapper.mapChat({
      msgId: 'chat-1',
      userId: 'user-1',
      uniqueId: 'user_1',
      comment: 'Hello world'
    })
    expect(chat1.message).toBe('Hello world')
    expect(chat1.emotes).toEqual([])

    // Chat with inline sub emotes
    const chat2 = mapper.mapChat({
      msgId: 'chat-2',
      userId: 'user-1',
      uniqueId: 'user_1',
      comment: 'Hello emote world',
      emotes: [
        {
          placeInComment: 6,
          emote: {
            emoteId: 'my_emote',
            image: { imageUrl: 'https://example.com/emote.png' }
          }
        }
      ]
    })
    expect(chat2.message).toBe('Hello emote world')
    expect(chat2.emotes).toEqual([
      {
        id: 'my_emote',
        name: 'my_emote',
        imageUrl: 'https://example.com/emote.png',
        startIndex: 6,
        endIndex: 13
      }
    ])

    // Standalone/empty comment with emotes (synthesized comment)
    const chat3 = mapper.mapChat({
      msgId: 'chat-3',
      userId: 'user-1',
      uniqueId: 'user_1',
      comment: '',
      emotes: [
        {
          placeInComment: 0,
          emote: {
            emoteId: 'sticker_1',
            image: { imageUrl: 'https://example.com/sticker.png' }
          }
        }
      ]
    })
    expect(chat3.message).toBe(':sticker_1:')
    expect(chat3.emotes).toEqual([
      {
        id: 'sticker_1',
        name: ':sticker_1:',
        imageUrl: 'https://example.com/sticker.png',
        startIndex: 0,
        endIndex: 10
      }
    ])

    // Standalone/empty comment with legacy simplified emotes
    const chat4 = mapper.mapChat({
      msgId: 'chat-4',
      userId: 'user-1',
      uniqueId: 'user_1',
      comment: ' ',
      emotes: [
        {
          placeInComment: 0,
          emoteId: 'sticker_2',
          emoteImageUrl: 'https://example.com/sticker2.png'
        }
      ]
    })
    expect(chat4.message).toBe(':sticker_2:')
    expect(chat4.emotes).toEqual([
      {
        id: 'sticker_2',
        name: ':sticker_2:',
        imageUrl: 'https://example.com/sticker2.png',
        startIndex: 0,
        endIndex: 10
      }
    ])
  })

  it('uses alternate TikTok message id fields before falling back to generated ids', () => {
    const mapper = new TikTokMapper()

    expect(mapper.mapChat({
      messageId: 'message-id-1',
      userId: 'user-1',
      uniqueId: 'user_1',
      comment: 'Hello'
    }).id).toBe('message-id-1')

    expect(mapper.mapChat({
      common: { messageId: 'common-message-id-1' },
      userId: 'user-1',
      uniqueId: 'user_1',
      comment: 'Hello again'
    }).id).toBe('common-message-id-1')
  })

  it('maps webcast emote events to chat events', () => {
    const mapper = new TikTokMapper()

    const emoteEvent = mapper.mapEmote({
      msgId: 'emote-1',
      userId: 'user-1',
      uniqueId: 'user_1',
      emoteList: [
        {
          emoteId: 'tiktok_sticker',
          image: { urlList: ['https://example.com/sticker2.png'] }
        }
      ]
    })

    expect(emoteEvent.message).toBe(':tiktok_sticker:')
    expect(emoteEvent.emotes).toEqual([
      {
        id: 'tiktok_sticker',
        name: ':tiktok_sticker:',
        imageUrl: 'https://example.com/sticker2.png',
        startIndex: 0,
        endIndex: 15
      }
    ])

    const emoteEvent2 = mapper.mapEmote({
      msgId: 'emote-2',
      userId: 'user-1',
      uniqueId: 'user_1',
      emotes: [
        {
          emoteId: 'tiktok_sticker_2',
          emoteImageUrl: 'https://example.com/sticker3.png'
        }
      ]
    })

    expect(emoteEvent2.message).toBe(':tiktok_sticker_2:')
    expect(emoteEvent2.emotes).toEqual([
      {
        id: 'tiktok_sticker_2',
        name: ':tiktok_sticker_2:',
        imageUrl: 'https://example.com/sticker3.png',
        startIndex: 0,
        endIndex: 17
      }
    ])
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
