import { describe, expect, it } from 'vitest'
import { EMOJI_CATEGORIES, searchEmojis } from './emojis'

const emoji = (...codepoints: string[]) =>
  String.fromCodePoint(...codepoints.map((codepoint) => Number.parseInt(codepoint, 16)))

describe('emoji search', () => {
  it('matches common aliases and plurals', () => {
    expect(searchEmojis('followers')).toContain(emoji('1f464'))
    expect(searchEmojis('subs')).toContain(emoji('1f451'))
    expect(searchEmojis('lol')).toContain(emoji('1f923'))
  })

  it('matches multi-word intent searches', () => {
    expect(searchEmojis('gift alert')).toContain(emoji('1f381'))
    expect(searchEmojis('sound notification')).toContain(emoji('1f514'))
  })

  it('supports direct pasted emoji searches', () => {
    const fire = emoji('1f525')
    expect(searchEmojis(fire)).toEqual([fire])
  })

  it('keeps each picker category broad enough for browsing', () => {
    for (const category of EMOJI_CATEGORIES) {
      expect(category.emojis.length).toBeGreaterThan(30)
    }
  })
})
