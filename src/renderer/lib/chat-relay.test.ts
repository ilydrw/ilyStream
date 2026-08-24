import { describe, expect, it } from 'vitest'
import type { PlatformChatCapability } from '../../main/platforms/types'
import type { ChatMessage } from '../stores/chat-store'
import { buildRelayText, getRelayTargets, summarizeSendResults } from './chat-relay'

const capabilities: Record<'tiktok' | 'twitch' | 'youtube' | 'kick', PlatformChatCapability> = {
  tiktok: { platform: 'tiktok', canSend: false, reason: 'Missing session' },
  twitch: { platform: 'twitch', canSend: true },
  youtube: { platform: 'youtube', canSend: true },
  kick: { platform: 'kick', canSend: false, reason: 'Unsupported' }
}

const message: ChatMessage = {
  id: 'chat-1',
  platform: 'twitch',
  username: 'stream_friend',
  displayName: 'Stream Friend',
  message: 'hello there',
  isModerator: false,
  isSubscriber: true,
  timestamp: new Date('2026-04-10T12:00:00.000Z')
}

describe('chat relay helpers', () => {
  it('filters relay targets to send-capable opposite platforms', () => {
    expect(getRelayTargets(capabilities, 'twitch')).toEqual(['youtube'])
  })

  it('formats relay text with source platform context', () => {
    expect(buildRelayText(message)).toBe('[Twitch] Stream Friend: hello there')
  })

  it('supports alternate relay tag modes for cleaner reposts', () => {
    expect(buildRelayText(message, 'user-only')).toBe('Stream Friend: hello there')
    expect(buildRelayText(message, 'message-only')).toBe('hello there')
  })

  it('strips legacy html before building relay text', () => {
    expect(
      buildRelayText({
        ...message,
        message: '<div>SUPER FAN DETECTED</div><div>Welcome back, <strong>@ilydrw</strong>!</div>'
      })
    ).toBe('[Twitch] Stream Friend: SUPER FAN DETECTED Welcome back, @ilydrw!')
  })

  it('replaces TikTok numeric Fan Club emote ids with readable relay text', () => {
    const emoteId = '7630614458817743630'
    expect(
      buildRelayText({
        ...message,
        platform: 'tiktok',
        message: `:${emoteId}:`,
        emotes: [{
          id: emoteId,
          name: `:${emoteId}:`,
          imageUrl: 'https://example.test/fan-emote.webp',
          startIndex: 0,
          endIndex: emoteId.length + 1
        }]
      })
    ).toBe('[TikTok] Stream Friend: [TikTok Fan Club emote]')
  })

  it('keeps TikTok comment text when an emote is reported as an insertion', () => {
    expect(
      buildRelayText({
        ...message,
        platform: 'tiktok',
        message: 'hello queena and restless',
        emotes: [{
          id: '7630614499699231501',
          name: '7630614499699231501',
          imageUrl: 'https://example.test/fan-emote.webp',
          startIndex: 25,
          endIndex: 43
        }]
      })
    ).toBe('[TikTok] Stream Friend: hello queena and restless [TikTok Fan Club emote]')
  })

  it('uses Twitch emote names as readable cross-platform fallbacks', () => {
    expect(
      buildRelayText({
        ...message,
        message: 'PogChamp hello',
        emotes: [{
          id: '305954156',
          name: 'PogChamp',
          imageUrl: 'https://example.test/pogchamp.png',
          startIndex: 0,
          endIndex: 7
        }]
      })
    ).toBe('[Twitch] Stream Friend: [PogChamp] hello')
  })

  it('summarizes mixed send results', () => {
    expect(
      summarizeSendResults([
        { platform: 'twitch', ok: true },
        { platform: 'youtube', ok: false, error: 'Missing access token' }
      ])
    ).toEqual({
      tone: 'warning',
      text: 'Sent to Twitch. Failed: YouTube: Missing access token'
    })
  })
})
