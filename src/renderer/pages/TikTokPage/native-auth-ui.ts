import type { TikTokNativeAuthPhase, TikTokNativeAuthStatus } from '../../../shared/tiktok-native'

export const TIKTOK_NATIVE_AUTH_STAGES: ReadonlyArray<{
  phase: TikTokNativeAuthPhase
  label: string
}> = [
  { phase: 'opening-browser', label: 'Open browser' },
  { phase: 'awaiting-consent', label: 'Approve access' },
  { phase: 'exchanging-code', label: 'Secure exchange' },
  { phase: 'connected', label: 'Connected' }
]

export function getTikTokNativeAuthStageIndex(phase?: TikTokNativeAuthPhase | null): number {
  return TIKTOK_NATIVE_AUTH_STAGES.findIndex((stage) => stage.phase === phase)
}

export function formatTikTokNativeAuthCountdown(seconds: number): string {
  const remaining = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(remaining / 60)
  return `${minutes}:${String(remaining % 60).padStart(2, '0')}`
}

export function getTikTokNativeAccessLabel(status: TikTokNativeAuthStatus): string {
  if (status.liveAccess === 'approved') return 'Native LIVE approved'
  if (status.liveAccess === 'pending') return 'TikTok review pending'
  if (status.liveAccess === 'rtmp-only') return 'Manual RTMP access'
  if (status.liveAccess === 'denied') return 'Native LIVE not approved'
  if (status.state === 'connected') return 'Account connected'
  return 'Partner setup required'
}

export function formatTikTokNativeAuthError(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error)
  message = message
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim()

  if (/cancelled|restarted by a new connect attempt/i.test(message)) {
    return 'TikTok connection was cancelled.'
  }
  if (/timed out/i.test(message)) {
    return 'TikTok did not finish authorization within 5 minutes. New sandbox test users can take up to one hour to activate; wait for activation, then try again.'
  }
  if (/client[_ ]?key|unauthorized_client/i.test(message)) {
    return 'TikTok has not activated this client key for the account yet. Confirm the sandbox target user, allow up to one hour for activation, then retry.'
  }
  if (/state mismatch/i.test(message)) {
    return 'TikTok returned an invalid security state. Close old authorization tabs and try again from ilyStream.'
  }
  if (/authorization denied/i.test(message)) {
    return 'TikTok authorization was declined. Try again and approve the requested profile access.'
  }
  return message || 'TikTok authorization failed. Try again.'
}
