import { describe, expect, it } from 'vitest'
import { DEFAULT_BROADCAST_STREAM_INFO, normalizeBroadcastStreamInfo } from './stream-info'

describe('normalizeBroadcastStreamInfo', () => {
  it('returns defaults for missing or malformed values', () => {
    expect(normalizeBroadcastStreamInfo(undefined)).toEqual(DEFAULT_BROADCAST_STREAM_INFO)
    expect(normalizeBroadcastStreamInfo(null)).toEqual(DEFAULT_BROADCAST_STREAM_INFO)
    expect(normalizeBroadcastStreamInfo('nonsense')).toEqual(DEFAULT_BROADCAST_STREAM_INFO)
  })

  it('keeps valid fields and coerces the rest', () => {
    expect(
      normalizeBroadcastStreamInfo({
        title: 'Late night lime zone',
        twitchCategoryId: ' 509658 ',
        twitchCategoryName: ' Just Chatting ',
        youtubeCategoryId: '20',
        kickCategoryId: ' 15 ',
        kickCategoryName: 'Just Chatting',
        extra: 'dropped'
      })
    ).toEqual({
      title: 'Late night lime zone',
      twitchCategoryId: '509658',
      twitchCategoryName: 'Just Chatting',
      youtubeCategoryId: '20',
      kickCategoryId: '15',
      kickCategoryName: 'Just Chatting'
    })
  })

  it('caps the title at 140 characters', () => {
    const normalized = normalizeBroadcastStreamInfo({ title: 'x'.repeat(200) })
    expect(normalized.title).toHaveLength(140)
  })
})
