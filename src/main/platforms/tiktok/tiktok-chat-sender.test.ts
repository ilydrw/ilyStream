import { describe, expect, it } from 'vitest'
import {
  describeTikTokSenderStatus,
  getTikTokSenderCooldownMs,
  isSafeNavigationUrl,
  isTikTokBlockedAppProtocol,
  isTikTokOwnedWebUrl,
  pickTikTokCredentialsFromCookies,
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

  it('allows only HTTPS navigation in the sender window', () => {
    expect(isSafeNavigationUrl('https://livecenter.tiktok.com/producer')).toBe(true)
    expect(isSafeNavigationUrl('http://livecenter.tiktok.com/producer')).toBe(false)
    expect(isSafeNavigationUrl('bytedance://open_live_center')).toBe(false)
    expect(isSafeNavigationUrl('not a url')).toBe(false)
  })

  it('keeps TikTok-owned web URLs in the isolated sender session', () => {
    expect(isTikTokOwnedWebUrl('https://livecenter.tiktok.com/producer')).toBe(true)
    expect(isTikTokOwnedWebUrl('https://accounts.tiktok.com/login')).toBe(true)
    expect(isTikTokOwnedWebUrl('https://www.tiktok.com/@ilydrw/live')).toBe(true)
    expect(isTikTokOwnedWebUrl('https://example.com/tiktok')).toBe(false)
  })

  it('captures sending credentials from TikTok session cookies', () => {
    expect(
      pickTikTokCredentialsFromCookies([
        { name: 'sessionid', value: '  abc123  ' },
        { name: 'tt-target-idc', value: 'useast2a' },
        { name: 'unrelated', value: 'x' }
      ])
    ).toEqual({ sessionId: 'abc123', ttTargetIdc: 'useast2a', loggedIn: true })
  })

  it('reports not-logged-in when the session cookie is absent', () => {
    expect(
      pickTikTokCredentialsFromCookies([{ name: 'tt-target-idc', value: 'useast2a' }])
    ).toEqual({ sessionId: null, ttTargetIdc: 'useast2a', loggedIn: false })
  })

  it('recognizes TikTok native app protocols before Windows opens a handler prompt', () => {
    expect(isTikTokBlockedAppProtocol('bytedance://live/creator')).toBe(true)
    expect(isTikTokBlockedAppProtocol('snssdk1128://live/creator')).toBe(true)
    expect(isTikTokBlockedAppProtocol('tiktok://live/creator')).toBe(true)
    expect(isTikTokBlockedAppProtocol('https://livecenter.tiktok.com/producer')).toBe(false)
  })
})
