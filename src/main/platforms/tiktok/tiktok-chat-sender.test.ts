import { describe, expect, it } from 'vitest'
import {
  describeTikTokSenderStatus,
  getTikTokSenderCooldownMs,
  validateTikTokSenderMessage
} from './tiktok-chat-sender'

describe('TikTokChatSender safety helpers', () => {
  it('normalizes outbound messages before sending', () => {
    expect(validateTikTokSenderMessage('  hello\n\nTikTok   chat  ')).toEqual({
      ok: true,
      text: 'hello TikTok chat'
    })
  })

  it('rejects empty and oversized outbound messages', () => {
    expect(validateTikTokSenderMessage('   ')).toEqual({
      ok: false,
      text: '',
      error: 'Cannot send an empty TikTok chat message'
    })

    expect(validateTikTokSenderMessage('a'.repeat(6), 5)).toEqual({
      ok: false,
      text: 'aaaaaa',
      error: 'TikTok chat messages are limited to 5 characters'
    })
  })

  it('computes the remaining send cooldown', () => {
    expect(getTikTokSenderCooldownMs(0, 10_000, 1500)).toBe(0)
    expect(getTikTokSenderCooldownMs(10_000, 10_500, 1500)).toBe(1000)
    expect(getTikTokSenderCooldownMs(10_000, 12_000, 1500)).toBe(0)
  })

  it('describes the next setup step from sender state', () => {
    expect(describeTikTokSenderStatus({
      isWindowOpen: false,
      isOnTikTok: false,
      isLoggedIn: false,
      isChatReady: false
    })).toBe('Open the TikTok host chat sender')

    expect(describeTikTokSenderStatus({
      isWindowOpen: true,
      isOnTikTok: true,
      isLoggedIn: true,
      isChatReady: false
    })).toBe('Open your LIVE dashboard or chat pop-out')

    expect(describeTikTokSenderStatus({
      isWindowOpen: true,
      isOnTikTok: true,
      isLoggedIn: true,
      isChatReady: true
    })).toBe('Ready to send as host')
  })
})
