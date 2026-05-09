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
