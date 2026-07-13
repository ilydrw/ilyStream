import { describe, expect, it } from 'vitest'
import {
  formatTikTokNativeAuthCountdown,
  formatTikTokNativeAuthError,
  getTikTokNativeAccessLabel,
  getTikTokNativeAuthStageIndex
} from './native-auth-ui'

describe('TikTok native auth UI helpers', () => {
  it('formats the authorization countdown', () => {
    expect(formatTikTokNativeAuthCountdown(300)).toBe('5:00')
    expect(formatTikTokNativeAuthCountdown(61.9)).toBe('1:01')
    expect(formatTikTokNativeAuthCountdown(-1)).toBe('0:00')
  })

  it('orders the visible authorization stages', () => {
    expect(getTikTokNativeAuthStageIndex('opening-browser')).toBe(0)
    expect(getTikTokNativeAuthStageIndex('connected')).toBe(3)
    expect(getTikTokNativeAuthStageIndex(null)).toBe(-1)
  })

  it('turns Electron IPC failures into actionable TikTok guidance', () => {
    expect(formatTikTokNativeAuthError(
      "Error invoking remote method 'tiktok:begin-native-auth': Error: TikTok authorization timed out after 5 minutes."
    )).toMatch(/sandbox test users can take up to one hour/i)
    expect(formatTikTokNativeAuthError('unauthorized_client: client_key'))
      .toMatch(/has not activated this client key/i)
    expect(formatTikTokNativeAuthError(new Error('TikTok auth state mismatch.')))
      .toMatch(/Close old authorization tabs/i)
    expect(formatTikTokNativeAuthError(new Error('TikTok authorization cancelled.')))
      .toBe('TikTok connection was cancelled.')
  })

  it('summarizes native access without duplicating UI conditionals', () => {
    const base = {
      state: 'ready' as const,
      configured: true,
      redirectUri: 'http://127.0.0.1/callback',
      message: 'Ready'
    }
    expect(getTikTokNativeAccessLabel({ ...base, liveAccess: 'approved' })).toBe('Native LIVE approved')
    expect(getTikTokNativeAccessLabel({ ...base, liveAccess: 'pending' })).toBe('TikTok review pending')
    expect(getTikTokNativeAccessLabel({ ...base, state: 'connected', liveAccess: 'unknown' })).toBe('Account connected')
    expect(getTikTokNativeAccessLabel({ ...base, liveAccess: 'unknown' })).toBe('Partner setup required')
  })
})
