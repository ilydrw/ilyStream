import { describe, expect, it } from 'vitest'
import { readInnertubeRuns } from './youtube-innertube'

describe('readInnertubeRuns', () => {
  it('surfaces thumbnail-backed YouTube emoji runs as chat emotes', () => {
    const result = readInnertubeRuns({
      runs: [
        { text: 'hey ' },
        {
          emoji: {
            emojiId: 'waving_hand',
            shortcuts: [':waving_hand:'],
            image: {
              thumbnails: [
                { url: 'https://yt3.ggpht.com/emote-small' },
                { url: '//yt3.ggpht.com/emote-large' }
              ]
            }
          }
        },
        { text: ' there' }
      ]
    })

    expect(result.message).toBe('hey :waving_hand: there')
    expect(result.emotes).toEqual([
      {
        id: 'waving_hand',
        name: 'waving_hand',
        imageUrl: 'https://yt3.ggpht.com/emote-large',
        startIndex: 4,
        endIndex: 16
      }
    ])
  })
})
