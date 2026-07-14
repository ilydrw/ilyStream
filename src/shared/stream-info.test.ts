import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BROADCAST_STREAM_INFO,
  MAX_STREAM_INFO_PRESETS,
  normalizeBroadcastStreamInfo,
  normalizeStreamInfoPresets
} from './stream-info'

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

describe('normalizeStreamInfoPresets', () => {
  it('returns an empty list for malformed values', () => {
    expect(normalizeStreamInfoPresets(undefined)).toEqual([])
    expect(normalizeStreamInfoPresets('nope')).toEqual([])
    expect(normalizeStreamInfoPresets([null, 'junk'])).toEqual([])
  })

  it('normalizes entries and fills fallback ids/names', () => {
    const presets = normalizeStreamInfoPresets([
      { id: 'a', name: ' Variety night ', info: { title: 'Chaos hours', twitchCategoryId: '509658' } },
      { info: { title: 'Untitled combo' } }
    ])
    expect(presets).toHaveLength(2)
    expect(presets[0]).toMatchObject({ id: 'a', name: 'Variety night' })
    expect(presets[0].info.twitchCategoryId).toBe('509658')
    expect(presets[1].id).toBe('preset-2')
    expect(presets[1].name).toBe('Preset 2')
  })

  it('caps the list length', () => {
    const oversized = Array.from({ length: 30 }, (_, i) => ({ name: `p${i}`, info: {} }))
    expect(normalizeStreamInfoPresets(oversized)).toHaveLength(MAX_STREAM_INFO_PRESETS)
  })
})
