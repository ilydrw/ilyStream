import type {
  AnyPlatformConfig,
  ConnectionStatus,
  Platform,
  PlatformChatCapability
} from '../../main/platforms/types'
import type { PlatformEventDiagnostic, ReconnectInfo } from '../stores/connection-store'

export const HEALTH_PLATFORMS = ['tiktok', 'twitch', 'youtube', 'kick'] as const

export type HealthPlatform = (typeof HEALTH_PLATFORMS)[number]
export type PlatformHealthTone = 'ready' | 'warning' | 'blocked' | 'idle'
export type PlatformConfigState = 'ready' | 'partial' | 'missing'
export type PlatformTrafficState = 'receiving' | 'stale' | 'quiet'

export interface PlatformIssueExplanation {
  title: string
  detail: string
  nextAction: string
}

export interface PlatformHealthRow {
  platform: HealthPlatform
  label: string
  status: ConnectionStatus
  tone: PlatformHealthTone
  configState: PlatformConfigState
  trafficState: PlatformTrafficState
  summary: string
  detail: string
  nextAction: string
  actionPath: string
  viewerCount: number
  lastEventAt: Date | null
  lastEventLabel: string
  canSendChat: boolean
  chatCapabilityReason: string | null
  trustLabel: string
  trustDetail: string
  issue: PlatformIssueExplanation | null
}

export interface BuildPlatformHealthInput {
  statuses?: Partial<Record<Platform, ConnectionStatus>>
  errors?: Partial<Record<Platform, string | null>>
  reconnectInfo?: Partial<Record<Platform, ReconnectInfo | null>>
  viewerCounts?: Partial<Record<Platform, number>>
  recentEvents?: PlatformEventDiagnostic[]
  configs?: Partial<Record<Platform, AnyPlatformConfig>>
  capabilities?: Partial<Record<Platform, PlatformChatCapability>>
  now?: number
}

const PLATFORM_LABELS: Record<HealthPlatform, string> = {
  tiktok: 'TikTok',
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick'
}

export function explainPlatformIssue(
  platform: Platform,
  rawError: string | null | undefined
): PlatformIssueExplanation | null {
  const error = String(rawError ?? '').trim()
  if (!error) return null

  const normalized = error.toLowerCase()

  if (platform === 'youtube' && /(quota|exceeded|daily limit|rate.?limit)/i.test(error)) {
    return {
      title: 'YouTube API quota is exhausted',
      detail:
        'The current Google Cloud project is out of YouTube Data API quota. Replacing only the text fields with another key from the same exhausted project will still fail.',
      nextAction:
        'Use a fresh Google Cloud project with YouTube Data API enabled, or wait for the daily quota reset. Paste the actual liveChatId when possible to avoid expensive search calls.'
    }
  }

  if (platform === 'youtube' && /(access_denied|verification|test users|403)/i.test(error)) {
    return {
      title: 'Google OAuth is blocking access',
      detail:
        'The OAuth client is still in testing or the signed-in account is not listed as a test user, so Google refuses the login before ilyStream can poll chat.',
      nextAction:
        'Open Google Auth Platform, add your Google account as a test user, then reconnect YouTube with the same redirect URL.'
    }
  }

  if (platform === 'youtube' && /(livechat|live chat|chat not found|no active broadcast|finding chat)/i.test(error)) {
    return {
      title: 'YouTube chat discovery needs a precise stream',
      detail:
        'The connector could not resolve an active liveChatId from the channel or video info.',
      nextAction:
        'Paste the exact live video URL or liveChatId, save setup, then reconnect once the stream is live or scheduled with chat enabled.'
    }
  }

  if (platform === 'kick' && /(cloudflare|403|blocked)/i.test(error)) {
    return {
      title: 'Kick blocked the legacy connection',
      detail:
        'Kick/Cloudflare is rejecting the old socket path. The reliable path is Kick app webhooks delivered to your local receiver through your tunnel.',
      nextAction:
        'Keep cloudflared running, paste the public webhook URL ending in /kick/webhook, add the broadcaster user ID, then subscribe events.'
    }
  }

  if (platform === 'kick' && /(webhook|tunnel|subscribe|broadcaster|client)/i.test(error)) {
    return {
      title: 'Kick webhook setup is incomplete',
      detail:
        'Kick needs a valid app client, broadcaster user ID, and public webhook URL that forwards to the local receiver.',
      nextAction:
        'Confirm cloudflared is pointing at http://127.0.0.1:8792, save the trycloudflare URL, then click Subscribe Events.'
    }
  }

  if (platform === 'twitch' && /(scope|auth|token|chat:read|chat:edit|login)/i.test(error)) {
    return {
      title: 'Twitch auth needs refreshed scopes',
      detail:
        'Twitch chat and relay features require a current access token with chat read/write permissions.',
      nextAction:
        'Reconnect Twitch and approve chat scopes for the broadcaster account that should read and send chat.'
    }
  }

  if (platform === 'tiktok' && /(session|cookie|signature|captcha|room|live|offline|not live)/i.test(error)) {
    return {
      title: 'TikTok live session is not ready',
      detail:
        'TikTok chat usually fails when the username is offline, the session cookie is stale, or signing/cookie data needs refreshing.',
      nextAction:
        'Verify the account is live, refresh TikTok session credentials, and reconnect after the stream room is visible.'
    }
  }

  if (normalized.includes('network') || normalized.includes('timeout') || normalized.includes('econn')) {
    return {
      title: 'Network connection failed',
      detail:
        'The platform did not respond cleanly. This can be temporary, but it can also mean the local tunnel, auth token, or platform endpoint is unavailable.',
      nextAction:
        'Check your internet connection, reconnect the platform, and copy the diagnostic report if it repeats.'
    }
  }

  return {
    title: 'Platform reported an error',
    detail: error,
    nextAction: 'Open the platform setup page, verify saved credentials, then reconnect.'
  }
}

export function buildPlatformHealthRows(input: BuildPlatformHealthInput): PlatformHealthRow[] {
  const now = input.now ?? Date.now()

  return HEALTH_PLATFORMS.map((platform) => {
    const status = input.statuses?.[platform] ?? 'disconnected'
    const error = input.errors?.[platform] ?? null
    const config = input.configs?.[platform]
    const configState = getPlatformConfigState(platform, config)
    const lastEvent = getMostRecentEvent(input.recentEvents, platform)
    const trafficState = getTrafficState(lastEvent, now)
    const capability = input.capabilities?.[platform]
    const issue = explainPlatformIssue(platform, error)
    const viewerCount = sanitizeCount(input.viewerCounts?.[platform])
    const reconnect = input.reconnectInfo?.[platform] ?? null
    const tone = getHealthTone(status, configState, trafficState, issue)
    const actionPath = `/connections/${platform}`
    const label = PLATFORM_LABELS[platform]
    const chatCapabilityReason = capability?.reason?.trim() || null
    const canSendChat = capability?.canSend === true

    return {
      platform,
      label,
      status,
      tone,
      configState,
      trafficState,
      summary: getSummary({
        status,
        issue,
        configState,
        trafficState,
        reconnect
      }),
      detail: getDetail({
        platform,
        label,
        status,
        issue,
        configState,
        trafficState,
        chatCapabilityReason,
        lastEvent,
        now
      }),
      nextAction: getNextAction(status, configState, issue),
      actionPath,
      viewerCount,
      lastEventAt: lastEvent?.timestamp ?? null,
      lastEventLabel: lastEvent ? `${lastEvent.type} ${formatRelativeAge(lastEvent.timestamp.getTime(), now)}` : 'No events this session',
      canSendChat,
      chatCapabilityReason,
      trustLabel: getTrustLabel(status, trafficState, configState),
      trustDetail: getTrustDetail(status, trafficState, configState, lastEvent, now),
      issue
    }
  })
}

export function createHealthDiagnosticReport(input: BuildPlatformHealthInput): string {
  const now = input.now ?? Date.now()
  const rows = buildPlatformHealthRows({ ...input, now })
  const report = {
    generatedAt: new Date(now).toISOString(),
    app: 'ilyStream',
    platforms: rows.map((row) => ({
      platform: row.platform,
      status: row.status,
      health: row.tone,
      config: row.configState,
      traffic: row.trafficState,
      summary: row.summary,
      nextAction: row.nextAction,
      canSendChat: row.canSendChat,
      chatCapabilityReason: row.chatCapabilityReason,
      viewerCount: row.viewerCount,
      lastEventAt: row.lastEventAt?.toISOString() ?? null,
      error: input.errors?.[row.platform] ?? null,
      configPreview: redactConfig(input.configs?.[row.platform])
    })),
    recentEvents: (input.recentEvents ?? []).slice(0, 20).map((event) => ({
      platform: event.platform,
      type: event.type,
      summary: event.summary,
      timestamp: event.timestamp.toISOString()
    }))
  }

  return JSON.stringify(report, null, 2)
}

function getPlatformConfigState(
  platform: HealthPlatform,
  config: AnyPlatformConfig | undefined
): PlatformConfigState {
  if (!config) return 'missing'

  switch (platform) {
    case 'tiktok':
      return hasText((config as any).username) ? 'ready' : 'partial'
    case 'twitch':
      return hasText((config as any).channel) && hasText((config as any).clientId) ? 'ready' : 'partial'
    case 'youtube':
      return hasText((config as any).apiKey) || hasText((config as any).accessToken) || hasText((config as any).refreshToken)
        ? 'ready'
        : 'partial'
    case 'kick':
      return hasText((config as any).channelName) ? 'ready' : 'partial'
    default:
      return 'partial'
  }
}

function getMostRecentEvent(
  events: PlatformEventDiagnostic[] | undefined,
  platform: HealthPlatform
): PlatformEventDiagnostic | null {
  const event = (events ?? []).find((entry) => entry.platform === platform)
  return event ?? null
}

function getTrafficState(
  event: PlatformEventDiagnostic | null,
  now: number
): PlatformTrafficState {
  if (!event) return 'quiet'
  const age = now - event.timestamp.getTime()
  return age <= 10 * 60 * 1000 ? 'receiving' : 'stale'
}

function getHealthTone(
  status: ConnectionStatus,
  configState: PlatformConfigState,
  trafficState: PlatformTrafficState,
  issue: PlatformIssueExplanation | null
): PlatformHealthTone {
  if (status === 'error' || issue) return 'blocked'
  if (status === 'connected') return trafficState === 'stale' ? 'warning' : 'ready'
  if (status === 'connecting') return 'warning'
  if (configState === 'partial') return 'warning'
  return 'idle'
}

function getSummary(input: {
  status: ConnectionStatus
  issue: PlatformIssueExplanation | null
  configState: PlatformConfigState
  trafficState: PlatformTrafficState
  reconnect: ReconnectInfo | null
}): string {
  if (input.issue) return input.issue.title
  if (input.status === 'connected') {
    if (input.trafficState === 'receiving') return 'Connected and receiving events'
    if (input.trafficState === 'stale') return 'Connected, but traffic is stale'
    return 'Connected and waiting for chat'
  }
  if (input.status === 'connecting') {
    if (input.reconnect) {
      return `Reconnecting, attempt ${input.reconnect.attempt}/${input.reconnect.maxAttempts}`
    }
    return 'Connecting'
  }
  if (input.configState === 'missing') return 'Setup needed'
  if (input.configState === 'partial') return 'Saved setup is incomplete'
  return 'Configured, currently offline'
}

function getDetail(input: {
  platform: HealthPlatform
  label: string
  status: ConnectionStatus
  issue: PlatformIssueExplanation | null
  configState: PlatformConfigState
  trafficState: PlatformTrafficState
  chatCapabilityReason: string | null
  lastEvent: PlatformEventDiagnostic | null
  now: number
}): string {
  if (input.issue) return input.issue.detail
  if (input.status === 'connected' && input.lastEvent) {
    return `${input.label} last produced a ${input.lastEvent.type} event ${formatRelativeAge(input.lastEvent.timestamp.getTime(), input.now)}.`
  }
  if (input.status === 'connected') {
    return `${input.label} is connected, but no live events have been observed in this app session yet.`
  }
  if (input.chatCapabilityReason) return input.chatCapabilityReason
  if (input.configState === 'missing') return `${input.label} has no saved connection setup yet.`
  if (input.configState === 'partial') return `${input.label} has saved data, but key setup fields are still missing.`
  return `${input.label} has saved setup and can be reconnected when you need it.`
}

function getNextAction(
  status: ConnectionStatus,
  configState: PlatformConfigState,
  issue: PlatformIssueExplanation | null
): string {
  if (issue) return issue.nextAction
  if (configState === 'missing') return 'Open setup and add credentials.'
  if (configState === 'partial') return 'Finish the missing setup fields, then reconnect.'
  if (status === 'connected') return 'Send a test event from Event Testing if you want to verify overlays and stats.'
  return 'Reconnect this platform before going live.'
}

function getTrustLabel(
  status: ConnectionStatus,
  trafficState: PlatformTrafficState,
  configState: PlatformConfigState
): string {
  if (status === 'connected' && trafficState === 'receiving') return 'Verified live'
  if (status === 'connected') return 'Connection verified'
  if (configState === 'ready') return 'Setup saved'
  if (configState === 'partial') return 'Needs setup'
  return 'Not configured'
}

function getTrustDetail(
  status: ConnectionStatus,
  trafficState: PlatformTrafficState,
  configState: PlatformConfigState,
  event: PlatformEventDiagnostic | null,
  now: number
): string {
  if (status === 'connected' && trafficState === 'receiving' && event) {
    return `Last real event: ${event.type} ${formatRelativeAge(event.timestamp.getTime(), now)}.`
  }
  if (status === 'connected') return 'Connection is active; stats will become more trustworthy once live events arrive.'
  if (configState === 'ready') return 'Credentials are saved, but no live connection is active right now.'
  if (configState === 'partial') return 'Some credentials exist; setup still needs a final pass.'
  return 'No saved config means ilyStream cannot collect this platform yet.'
}

function formatRelativeAge(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function sanitizeCount(value: unknown): number {
  const count = Number(value ?? 0)
  return Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function redactConfig(config: AnyPlatformConfig | undefined): Record<string, unknown> | null {
  if (!config) return null
  const redacted: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(config)) {
    if (/token|secret|key|session|cookie|authorization/i.test(key)) {
      redacted[key] = hasText(value) ? '[redacted]' : value
      continue
    }
    redacted[key] = value
  }
  return redacted
}
