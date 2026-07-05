import { describe, expect, it } from 'vitest'
import {
  isRelayFormattedEchoText,
  isTikTokLikeSystemPayload,
  isTikTokLikeSystemText,
  shouldSuppressStreamEventFromChat
} from './chat-event-filter'

describe('chat event suppression', () => {
  it('suppresses direct like events from chat-style feeds', () => {
    expect(shouldSuppressStreamEventFromChat({ platform: 'tiktok', type: 'like' })).toBe(true)
  })

  it('suppresses our own relayed chat echoes from the unified chat feed', () => {
    expect(
      shouldSuppressStreamEventFromChat({
        platform: 'youtube',
        type: 'chat',
        message: '[Twitch] queena.chaos: Wild',
        chatRelayEcho: true
      })
    ).toBe(true)
  })

  it('suppresses relay-formatted messages when they appear on another platform', () => {
    expect(isRelayFormattedEchoText('[TikTok] queena.chaos: Wild', 'youtube')).toBe(true)
    expect(isRelayFormattedEchoText('[Twitch] AnubisOfGiza: damn I was just about to say w app', 'tiktok')).toBe(true)
    expect(isRelayFormattedEchoText('[TikTok] queena.chaos: Wild', 'tiktok')).toBe(false)
    expect(isRelayFormattedEchoText('normal viewer chat', 'youtube')).toBe(false)

    expect(
      shouldSuppressStreamEventFromChat({
        platform: 'youtube',
        type: 'chat',
        message: '[TikTok] queena.chaos: Wild'
      })
    ).toBe(true)
  })

  it('recognizes TikTok like payloads by metadata and counters', () => {
    expect(
      isTikTokLikeSystemPayload({
        likeCount: 15,
        totalLikeCount: 18610,
        displayType: 'pm_mt_msg_viewer',
        defaultPattern: '{0:user} liked the LIVE'
      })
    ).toBe(true)

    expect(
      isTikTokLikeSystemPayload({
        likeCount: 5,
        totalLikeCount: 12470,
        specifiedDisplayText: [
          {
            displayText: {
              displayType: 'pm_mt_msg_viewer',
              defaultPattern: '{0:user} liked the LIVE'
            }
          }
        ]
      })
    ).toBe(true)
  })

  it('recognizes strict TikTok like system text without catching ordinary like chatter', () => {
    expect(isTikTokLikeSystemText('Alex liked the LIVE')).toBe(true)
    expect(isTikTokLikeSystemText('Alex sent 15 likes')).toBe(true)
    expect(isTikTokLikeSystemText('why did it reset my likes')).toBe(false)
    expect(isTikTokLikeSystemText('I like drake before the allegations')).toBe(false)
    expect(isTikTokLikeSystemText('He sent like 1.5k total')).toBe(false)
  })

  it('suppresses TikTok chat events that are really like system messages', () => {
    expect(
      shouldSuppressStreamEventFromChat({
        platform: 'tiktok',
        type: 'chat',
        message: 'Alex liked the LIVE',
        raw: {}
      })
    ).toBe(true)

    expect(
      shouldSuppressStreamEventFromChat({
        platform: 'tiktok',
        type: 'chat',
        message: 'I like drake before the allegations',
        raw: {}
      })
    ).toBe(false)
  })
})
