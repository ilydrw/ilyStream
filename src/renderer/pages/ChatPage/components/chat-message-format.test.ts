import { describe, expect, it } from 'vitest'
import { formatEmoteFallback } from './chat-message-format'

describe('formatEmoteFallback', () => {
  it('does not expose TikTok fan-club emote IDs as chat text', () => {
    expect(formatEmoteFallback('7630870635178678839', 'tiktok')).toBe('[TikTok Fan Club emote]')
  })

  it('keeps a readable named emote shortcode', () => {
    expect(formatEmoteFallback(':Kappa:', 'twitch')).toBe(':Kappa:')
  })

  it('uses a platform label when an unnamed image fails', () => {
    expect(formatEmoteFallback('', 'youtube')).toBe('[YouTube emote]')
  })
})
