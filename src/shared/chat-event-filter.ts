export function shouldSuppressStreamEventFromChat(event: any): boolean {
  if (!event) return false
  if (event.chatRelayEcho === true) return true
  if (event.type === 'like') return true

  if (event.type === 'chat' && isRelayFormattedEchoText(event.message, event.platform)) {
    return true
  }

  if (event.platform !== 'tiktok' || event.type !== 'chat') return false
  if (isTikTokLikeSystemPayload(event.raw)) return true

  return isTikTokLikeSystemText(
    firstText(event.message, event.comment, event.text, event.raw?.comment, event.raw?.text, event.raw?.message)
  )
}

export function isTikTokLikeSystemPayload(payload: any): boolean {
  if (!payload) return false
  if (String(payload?.method || '').toLowerCase().includes('like')) return true

  const displayTexts = getTikTokDisplayTexts(payload)
  if (displayTexts.some(isTikTokLikeDisplayText)) return true

  const hasLikeCounters = hasTikTokLikeCounters(payload)
  if (!hasLikeCounters) return false

  const chatText = firstText(payload.comment, payload.text, payload.message)
  if (!chatText) return true

  return isTikTokLikeSystemText(chatText)
}

export function isTikTokLikeSystemText(text: unknown): boolean {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return false

  return (
    /^(?:.{1,80}\s+)?liked the live[.!?]?$/i.test(normalized) ||
    /^(?:.{1,80}\s+)?sent (?:\d+\s+)?likes?[.!?]?$/i.test(normalized)
  )
}

const RELAY_PLATFORM_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick'
}

export function isRelayFormattedEchoText(text: unknown, platform: unknown): boolean {
  const normalized = firstText(text)
  if (!normalized) return false

  const match = normalized.match(/^\[([^\]]+)\]\s+\S/)
  if (!match) return false

  const sourcePlatform = Object.entries(RELAY_PLATFORM_LABELS).find(
    ([, label]) => label.toLowerCase() === match[1].trim().toLowerCase()
  )?.[0]

  if (!sourcePlatform) return false

  const targetPlatform = String(platform || '').trim().toLowerCase()
  return targetPlatform.length > 0 && sourcePlatform !== targetPlatform
}

function getTikTokDisplayTexts(payload: any): any[] {
  const displayTexts = [
    payload,
    payload?.displayText,
    payload?.common?.displayText
  ]

  if (Array.isArray(payload?.specifiedDisplayText)) {
    for (const entry of payload.specifiedDisplayText) {
      displayTexts.push(entry?.displayText ?? entry)
    }
  }

  return displayTexts.filter(Boolean)
}

function isTikTokLikeDisplayText(displayText: any): boolean {
  const displayType = String(displayText?.displayType || '').toLowerCase()
  const pattern = String(displayText?.defaultPattern || displayText?.pattern || displayText?.text || '').toLowerCase()

  return displayType === 'pm_mt_msg_viewer' && pattern.includes('liked') && pattern.includes('live')
}

function hasTikTokLikeCounters(payload: any): boolean {
  return Number.isFinite(Number(payload?.likeCount)) || Number.isFinite(Number(payload?.totalLikeCount))
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (value === null || value === undefined) continue
    const text = String(value).trim()
    if (text) return text
  }
  return ''
}
