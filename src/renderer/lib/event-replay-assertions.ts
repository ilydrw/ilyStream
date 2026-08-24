import type { EventLabEntry } from '../stores/event-lab-store'
import type { EventReplaySession } from './event-replay'

export type ReplayAssertionStatus = 'passed' | 'failed' | 'warning'

export interface ReplayAssertionResult {
  id: string
  label: string
  status: ReplayAssertionStatus
  detail: string
  expected: string
  observed: string
  evidenceCount: number
}

export interface ReplayAssertionReport {
  id: string
  sessionId: string
  sessionName: string
  startedAt: string
  finishedAt: string
  durationMs: number
  entriesAnalyzed: number
  passed: number
  failed: number
  warnings: number
  results: ReplayAssertionResult[]
}

export function evaluateReplayAssertions(
  session: EventReplaySession,
  entries: EventLabEntry[],
  options: { startedAt?: string; finishedAt?: string } = {}
): ReplayAssertionReport {
  const startedAt = options.startedAt ?? entries.at(-1)?.timestamp ?? new Date().toISOString()
  const finishedAt = options.finishedAt ?? new Date().toISOString()
  const runEntries = filterReplayRunEntries(entries, startedAt, finishedAt)
  const results = [
    assertReplayEventsFired(session, runEntries),
    assertAutomationActionsDoNotFail(runEntries),
    assertLikesDoNotLeakIntoChat(session, runEntries),
    assertGgGiftsDoNotDoubleAlert(session, runEntries),
    assertSpotifyCommandsUpdateQueue(session, runEntries),
    assertDeskThingReceivesPackets(runEntries),
    assertOverlayReceivesPackets(runEntries),
    assertOverlayPaintLatency(runEntries)
  ].filter((result): result is ReplayAssertionResult => Boolean(result))

  return {
    id: createReportId(),
    sessionId: session.id,
    sessionName: session.name,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
    entriesAnalyzed: runEntries.length,
    passed: results.filter((result) => result.status === 'passed').length,
    failed: results.filter((result) => result.status === 'failed').length,
    warnings: results.filter((result) => result.status === 'warning').length,
    results
  }
}

export function filterReplayRunEntries(
  entries: EventLabEntry[],
  startedAt: string,
  finishedAt = new Date().toISOString()
): EventLabEntry[] {
  const started = Date.parse(startedAt)
  const finished = Date.parse(finishedAt)
  if (!Number.isFinite(started) || !Number.isFinite(finished)) return entries

  return entries.filter((entry) => {
    const timestamp = Date.parse(entry.timestamp)
    return Number.isFinite(timestamp) && timestamp >= started && timestamp <= finished
  })
}

function assertReplayEventsFired(session: EventReplaySession, entries: EventLabEntry[]): ReplayAssertionResult {
  const firedEntries = entries.filter((entry) => {
    const payload = entry.payload as any
    return entry.kind === 'system' && payload?.sessionId === session.id && payload?.event?.id
  })
  const firedIds = new Set(firedEntries.map((entry) => (entry.payload as any).event.id))
  const missing = session.events.filter((event) => !firedIds.has(event.id))

  return {
    id: 'replay-events-fired',
    label: 'Replay events fired',
    status: missing.length === 0 ? 'passed' : 'failed',
    detail: missing.length === 0
      ? 'Every recorded event was queued through the local event pipeline.'
      : `${missing.length} recorded event(s) did not produce a replay fire marker.`,
    expected: `${session.events.length} replay fire marker(s)`,
    observed: `${firedIds.size} replay fire marker(s)`,
    evidenceCount: firedEntries.length
  }
}

function assertAutomationActionsDoNotFail(entries: EventLabEntry[]): ReplayAssertionResult {
  const receipts = entries.filter((entry) => entry.kind === 'automation')
  const failedReceipts = receipts.filter((entry) => {
    const payload = entry.payload as any
    return Number(payload?.actionsFailed ?? 0) > 0 || payload?.rules?.some((rule: any) =>
      rule?.actions?.some((action: any) => action?.status === 'failed')
    )
  })

  return {
    id: 'automation-actions-clean',
    label: 'Automation actions clean',
    status: failedReceipts.length === 0 ? 'passed' : 'failed',
    detail: failedReceipts.length === 0
      ? 'No automation action failures were reported during the replay.'
      : `${failedReceipts.length} automation receipt(s) reported failed actions.`,
    expected: '0 failed automation actions',
    observed: `${failedReceipts.length} failing receipt(s) across ${receipts.length} receipt(s)`,
    evidenceCount: failedReceipts.length
  }
}

function assertLikesDoNotLeakIntoChat(
  session: EventReplaySession,
  entries: EventLabEntry[]
): ReplayAssertionResult | null {
  const likeEvents = session.events.filter((event) => event.payload.type === 'like')
  if (likeEvents.length === 0) return null

  const likeUsers = new Set(likeEvents.flatMap((event) => [
    normalizeText(event.payload.username),
    normalizeText(event.payload.displayName)
  ].filter(Boolean)))

  const streamChatLeaks = entries.filter((entry) => {
    if (entry.kind !== 'stream' || entry.eventType !== 'chat') return false
    const payload = entry.payload as any
    const username = normalizeText(payload?.user?.username)
    const displayName = normalizeText(payload?.user?.displayName)
    const message = normalizeText(payload?.message)
    const matchesLikeUser = likeUsers.has(username) || likeUsers.has(displayName)
    return matchesLikeUser && (message.includes('like') || message.includes('liked') || message.includes('sent likes'))
  })

  const overlayChatLeaks = entries.filter((entry) => {
    if (entry.kind !== 'overlay' || entry.channel !== 'chat') return false
    const text = normalizeText(JSON.stringify(entry.payload ?? ''))
    return text.includes('"type":"like"') || text.includes('sent likes') || text.includes('liked the live')
  })

  const leaks = [...streamChatLeaks, ...overlayChatLeaks]

  return {
    id: 'likes-not-chat',
    label: 'Likes stay out of chat',
    status: leaks.length === 0 ? 'passed' : 'failed',
    detail: leaks.length === 0
      ? 'Like events did not appear as chat timeline or overlay-chat payloads.'
      : `${leaks.length} possible like-to-chat leak(s) were detected.`,
    expected: '0 like-generated chat messages',
    observed: `${leaks.length} possible leak(s)`,
    evidenceCount: leaks.length
  }
}

function assertGgGiftsDoNotDoubleAlert(
  session: EventReplaySession,
  entries: EventLabEntry[]
): ReplayAssertionResult | null {
  const ggEvents = session.events.filter((event) =>
    event.payload.type === 'gift' && normalizeText(event.payload.giftName).includes('gg')
  )
  if (ggEvents.length === 0) return null

  const alertEntries = entries.filter((entry) => entry.kind === 'alert')
  const ggAlertEntries = alertEntries.filter((entry) => {
    const text = normalizeText(`${entry.detail} ${JSON.stringify(entry.payload ?? '')}`)
    return text.includes('gg')
  })
  const relevantAlertCount = ggAlertEntries.length > 0 || ggEvents.length > 1
    ? ggAlertEntries.length
    : alertEntries.length

  const status: ReplayAssertionStatus =
    relevantAlertCount > ggEvents.length ? 'failed' : relevantAlertCount === 0 ? 'warning' : 'passed'

  return {
    id: 'gg-alert-no-duplicates',
    label: 'GG alert does not duplicate',
    status,
    detail: status === 'failed'
      ? `GG produced ${relevantAlertCount} alert(s) for ${ggEvents.length} gift event(s).`
      : status === 'warning'
        ? 'No alert was observed for GG; alert rules may be disabled or not configured.'
        : 'GG alert count stayed within the expected one-alert-per-gift limit.',
    expected: `0-${ggEvents.length} GG alert(s)`,
    observed: `${relevantAlertCount} alert(s)`,
    evidenceCount: relevantAlertCount
  }
}

function assertSpotifyCommandsUpdateQueue(
  session: EventReplaySession,
  entries: EventLabEntry[]
): ReplayAssertionResult | null {
  const spotifyRequests = session.events.filter((event) =>
    event.payload.type === 'chat' && isSpotifyRequest(event.payload.message)
  )
  if (spotifyRequests.length === 0) return null

  const queueUpdates = entries.filter((entry) =>
    entry.kind === 'spotify' && normalizeText(entry.title).includes('queue updated')
  )

  return {
    id: 'spotify-command-queued',
    label: 'Spotify command queues',
    status: queueUpdates.length > 0 ? 'passed' : 'failed',
    detail: queueUpdates.length > 0
      ? 'At least one Spotify queue update was observed after a song request command.'
      : 'Song request commands did not produce a Spotify queue update.',
    expected: '>= 1 Spotify queue update',
    observed: `${queueUpdates.length} queue update(s)`,
    evidenceCount: queueUpdates.length
  }
}

function assertDeskThingReceivesPackets(entries: EventLabEntry[]): ReplayAssertionResult {
  const devicePackets = entries.filter((entry) => entry.kind === 'device')
  const deliveredPackets = devicePackets.filter((entry) => Number((entry.payload as any)?.clientCount ?? 0) > 0)
  const status: ReplayAssertionStatus =
    deliveredPackets.length > 0 ? 'passed' : devicePackets.length > 0 ? 'warning' : 'warning'

  return {
    id: 'deskthing-packets',
    label: 'DeskThing packets',
    status,
    detail: deliveredPackets.length > 0
      ? 'Replay generated packets for connected DeskThing clients.'
      : devicePackets.length > 0
        ? 'DeskThing packets were generated, but no connected clients were reported.'
        : 'No DeskThing packets were observed; this is expected when no companion device is paired or connected.',
    expected: 'Packets generated when DeskThing is connected',
    observed: `${deliveredPackets.length}/${devicePackets.length} packet(s) delivered to connected clients`,
    evidenceCount: devicePackets.length
  }
}

function assertOverlayReceivesPackets(entries: EventLabEntry[]): ReplayAssertionResult {
  const overlayPackets = entries.filter((entry) => entry.kind === 'overlay')

  return {
    id: 'overlay-packets',
    label: 'Overlay packets',
    status: overlayPackets.length > 0 ? 'passed' : 'warning',
    detail: overlayPackets.length > 0
      ? 'Overlay broadcasts were observed during the replay.'
      : 'No overlay broadcasts were observed; overlay clients or related widgets may be inactive.',
    expected: '>= 1 overlay broadcast when overlay features are active',
    observed: `${overlayPackets.length} overlay packet(s)`,
    evidenceCount: overlayPackets.length
  }
}

function assertOverlayPaintLatency(entries: EventLabEntry[]): ReplayAssertionResult {
  const receipts = entries
    .filter((entry) => entry.kind === 'performance')
    .map((entry) => Number((entry.payload as any)?.paintMs))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b)

  if (receipts.length === 0) {
    return {
      id: 'overlay-paint-latency',
      label: 'Overlay first-paint latency',
      status: 'warning',
      detail: 'No sampled browser-source paint receipts were observed. Open at least one affected overlay while running the replay.',
      expected: 'p95 <= 100ms',
      observed: 'No paint samples',
      evidenceCount: 0
    }
  }

  const p95Index = Math.max(0, Math.ceil(receipts.length * 0.95) - 1)
  const p95 = receipts[p95Index]
  return {
    id: 'overlay-paint-latency',
    label: 'Overlay first-paint latency',
    status: p95 <= 100 ? 'passed' : 'failed',
    detail: p95 <= 100
      ? 'Sampled overlays stayed within the initial local first-paint budget.'
      : 'Sampled overlay first paint exceeded the 100ms p95 budget.',
    expected: 'p95 <= 100ms',
    observed: `p95 ${Math.round(p95)}ms across ${receipts.length} sample(s)`,
    evidenceCount: receipts.length
  }
}

function isSpotifyRequest(message: unknown): boolean {
  const text = normalizeText(message)
  return /^!(play|songrequest|sr)\b/.test(text)
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function createReportId(): string {
  if (globalThis.crypto?.randomUUID) return `assertions-${globalThis.crypto.randomUUID()}`
  return `assertions-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
