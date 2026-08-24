import { useEffect, useMemo, useState } from 'react'
import {
  IconActivity,
  IconAlertTriangle,
  IconChartLine,
  IconCurrencyDollar,
  IconDatabase,
  IconGift,
  IconHeart,
  IconMessage,
  IconMessage2,
  IconServer,
  IconShare,
  IconUserPlus,
  IconUsers,
  IconVolume
} from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import { IconBolt, IconBroadcast, IconChat, IconTTS } from '../../components/ui/icons/nav'
import { PlatformLogo } from '../../components/platforms/PlatformLogo'
import { Avatar } from '../../components/ui/Avatar'
import { SpotifyIcon } from '../../components/ui/SpotifyIcon'
import { PageHeader } from '../../components/layout/PageHeader'
import { isChatKind, useChatStore } from '../../stores/chat-store'
import { useConnectionStore } from '../../stores/connection-store'
import { useTTSStore } from '../../stores/tts-store'
import type { Platform } from '../../../main/platforms/types'
import type { GlobalStats, UserIdentity } from '../../../shared/stats'
import { EMPTY_GLOBAL_STATS } from '../../../shared/stats'
import { sortPlatformsByDisplayOrder } from '../../lib/platform-order'

import { HealthRow, QuickLink, SpotifyMetricCard } from './components/DashboardShared'
import './dashboard.css'

const primaryPlatforms = ['tiktok', 'twitch', 'youtube', 'kick'] as const
type PrimaryPlatform = (typeof primaryPlatforms)[number]

const platformLabels: Record<PrimaryPlatform, string> = {
  tiktok: 'TikTok',
  twitch: 'Twitch',
  youtube: 'YouTube',
  kick: 'Kick'
}

const platformColors: Record<PrimaryPlatform, string> = {
  tiktok: '#ff3b5f',
  twitch: '#9146ff',
  youtube: '#ff3b30',
  kick: '#53fc18'
}

const statusStyles: Record<string, string> = {
  connected: 'text-success',
  connecting: 'text-warning',
  disconnected: 'text-white/32',
  error: 'text-danger'
}

type AudienceByPlatform = Record<PrimaryPlatform, number>

interface AudienceSample {
  timestamp: number
  total: number
  platforms: AudienceByPlatform
}

interface PlatformDashboardRow {
  platform: PrimaryPlatform
  label: string
  status: string
  viewers: number
  share: number
  color: string
  error?: string | null
  sessionChats: number
  sessionEvents: number
  lifetimeChats: number
  lifetimeLikes: number
  lifetimeGifts: number
  lifetimeFollows: number
  lifetimeSubs: number
  followerCount: number | null
  uniqueUsers: number
}

function statusDot(status: string): string {
  switch (status) {
    case 'connected':
      return 'bg-success'
    case 'connecting':
      return 'bg-warning'
    case 'error':
      return 'bg-danger'
    default:
      return 'bg-white/10'
  }
}

function emptyAudience(): AudienceByPlatform {
  return { tiktok: 0, twitch: 0, youtube: 0, kick: 0 }
}

function sanitizeCount(value: unknown): number {
  const count = Number(value ?? 0)
  return Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0
}

function shouldCountLiveViewer(status: string | undefined, count: number): boolean {
  if (status === 'disconnected' || status === 'error') return false
  return status === 'connected' || status === 'connecting' || count > 0
}

function sameAudience(a: AudienceSample, b: AudienceSample): boolean {
  return a.total === b.total && primaryPlatforms.every((platform) => a.platforms[platform] === b.platforms[platform])
}

function appendAudienceSample(samples: AudienceSample[], sample: AudienceSample): AudienceSample[] {
  const last = samples[samples.length - 1]
  if (last && sameAudience(last, sample) && sample.timestamp - last.timestamp < 1000) {
    return samples
  }

  const cutoff = sample.timestamp - 90 * 60 * 1000
  return [...samples, sample].filter((entry) => entry.timestamp >= cutoff).slice(-240)
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: value >= 1000 ? 1 : 0
  }).format(value)
}

function formatCurrency(cents: number): string {
  if (!cents) return '$0.00'
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0m'
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${Math.max(1, minutes)}m`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`
}

function formatDelta(delta: number): string {
  if (delta === 0) return 'No change'
  return `${delta > 0 ? '+' : ''}${delta.toLocaleString()} since last sample`
}

function relativeTime(timestamp: number | null): string {
  if (!timestamp) return 'never'
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function AudienceChart({ samples, rows }: { samples: AudienceSample[]; rows: PlatformDashboardRow[] }) {
  const width = 560
  const height = 260
  const padX = 24
  const padY = 28
  const now = Date.now()
  const sourceSamples = samples.length > 0
    ? samples
    : [{ timestamp: now, total: 0, platforms: emptyAudience() }]
  const chartSamples = sourceSamples.length > 1
    ? sourceSamples
    : [{ ...sourceSamples[0], timestamp: sourceSamples[0].timestamp - 15_000 }, sourceSamples[0]]
  const max = Math.max(...chartSamples.map((sample) => sample.total), 1)
  const baseline = height - padY
  const coordinates = chartSamples.map((sample, index) => {
    const x = padX + (index * (width - padX * 2)) / Math.max(chartSamples.length - 1, 1)
    const y = baseline - (sample.total / max) * (height - padY * 2)
    return { x, y }
  })
  const points = coordinates.map(({ x, y }) => `${x},${y}`).join(' ')
  const areaPath =
    coordinates.length > 0
      ? `M ${coordinates[0].x} ${baseline} L ${coordinates.map(({ x, y }) => `${x} ${y}`).join(' L ')} L ${coordinates[coordinates.length - 1].x} ${baseline} Z`
      : ''
  const lastPoint = coordinates[coordinates.length - 1]
  const firstSample = sourceSamples[0]
  const lastSample = sourceSamples[sourceSamples.length - 1]

  return (
    <div className="dashboard-chart-panel">
      <div className="dashboard-chart-head">
        <div>
          <span>Combined audience</span>
          <strong>{lastSample.total.toLocaleString()}</strong>
        </div>
        <div className="dashboard-chart-max">
          <span>Scale</span>
          <strong>{max.toLocaleString()}</strong>
        </div>
      </div>
      <div className="dashboard-chart-grid" aria-hidden="true" />
      <svg className="dashboard-chart-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={areaPath} fill="rgba(25, 200, 255, 0.12)" />
        <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {lastPoint && <circle cx={lastPoint.x} cy={lastPoint.y} r="5" fill="var(--accent)" />}
      </svg>
      <div className="dashboard-chart-footer">
        <span>{formatTime(firstSample.timestamp)}</span>
        <span>{sourceSamples.length} samples</span>
        <span>{formatTime(lastSample.timestamp)}</span>
      </div>
      <div className="dashboard-audience-composition" aria-label="Current audience by platform">
        {rows.map((row) => (
          <span
            key={row.platform}
            className="dashboard-audience-composition-segment"
            style={{
              width: `${row.share > 0 ? Math.max(3, row.share * 100) : 0}%`,
              background: row.color
            }}
            title={`${row.label}: ${row.viewers.toLocaleString()} viewers`}
          />
        ))}
      </div>
    </div>
  )
}

function StatPill({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="dashboard-stat-pill">
      {icon && <span>{icon}</span>}
      <div>
        <strong>{value}</strong>
        <em>{label}</em>
      </div>
    </div>
  )
}

function OperationSignal({
  icon,
  label,
  value,
  detail,
  tone = 'neutral'
}: {
  icon: React.ReactNode
  label: string
  value: string
  detail: string
  tone?: 'good' | 'warning' | 'danger' | 'neutral'
}) {
  return (
    <div className={`dashboard-operation-signal is-${tone}`}>
      <span className="dashboard-operation-signal-icon">{icon}</span>
      <span className="dashboard-operation-signal-copy">
        <em>{label}</em>
        <strong>{value}</strong>
        <small>{detail}</small>
      </span>
    </div>
  )
}

function PlatformBreakdown({ rows }: { rows: PlatformDashboardRow[] }) {
  return (
    <section className="app-section-card glass">
      <div className="app-section-head">
        <div>
          <h2>Platform breakdown</h2>
          <p>Current audience, session chat, and lifetime engagement by service.</p>
        </div>
        <Link to="/stats" className="app-button">
          Stats
        </Link>
      </div>
      <div className="app-section-content dashboard-platform-list">
        {rows.map((row) => (
          <Link
            key={row.platform}
            to={`/connections/${row.platform}`}
            className="dashboard-platform-row dashboard-platform-breakdown-row"
          >
            <div className="dashboard-platform-primary">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/[0.05] bg-white/[0.035]">
                <PlatformLogo platform={row.platform} size={18} />
              </div>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[13px] font-semibold text-white">{row.label}</span>
                  <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(row.status)}`} />
                </div>
                <p className={`mt-0.5 truncate text-[11px] ${statusStyles[row.status]}`} title={row.error ?? row.status}>
                  {row.error ?? row.status}
                </p>
              </div>
            </div>

            <div className="dashboard-platform-live">
              <strong>{row.viewers.toLocaleString()}</strong>
              <span>{Math.round(row.share * 100)}% share</span>
              <div className="dashboard-platform-share-bar">
                <i style={{ width: `${Math.max(0, Math.min(100, row.share * 100))}%`, background: row.color }} />
              </div>
            </div>

            <div className="dashboard-platform-stat-grid">
              <span><strong>{row.sessionChats.toLocaleString()}</strong><em>session</em></span>
              <span><strong>{formatCompact(row.lifetimeChats)}</strong><em>lifetime</em></span>
              <span><strong>{formatCompact(row.uniqueUsers)}</strong><em>users</em></span>
              <span><strong>{row.followerCount === null ? '--' : formatCompact(row.followerCount)}</strong><em>followers</em></span>
              <span><strong>{formatCompact(row.lifetimeLikes)}</strong><em>likes</em></span>
              <span><strong>{formatCompact(row.lifetimeGifts + row.lifetimeSubs + row.lifetimeFollows)}</strong><em>events</em></span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

function LifetimeSummary({ global }: { global: GlobalStats }) {
  return (
    <section className="app-section-card glass">
      <div className="app-section-head">
        <div>
          <h2>Lifetime totals</h2>
          <p>{global.lastUpdatedAt ? `Updated ${relativeTime(new Date(global.lastUpdatedAt).getTime())}` : 'No persisted activity yet'}</p>
        </div>
        <IconDatabase size={16} className="text-white/38" />
      </div>
      <div className="app-section-content dashboard-stat-strip">
        <StatPill icon={<IconHeart size={14} />} label="Likes" value={global.totalLikes.toLocaleString()} />
        <StatPill icon={<IconGift size={14} />} label="Gifts" value={global.totalGifts.toLocaleString()} />
        <StatPill icon={<IconCurrencyDollar size={14} />} label="Revenue" value={formatCurrency(global.totalGiftValueCents)} />
        <StatPill icon={<IconUserPlus size={14} />} label="Follows" value={global.totalFollows.toLocaleString()} />
        <StatPill icon={<IconShare size={14} />} label="Shares" value={global.totalShares.toLocaleString()} />
        <StatPill icon={<IconMessage size={14} />} label="Chats" value={global.totalChats.toLocaleString()} />
      </div>
    </section>
  )
}

function TopAudience({ identities, loading }: { identities: UserIdentity[]; loading: boolean }) {
  return (
    <section className="app-section-card glass">
      <div className="app-section-head">
        <h2>Top audience</h2>
        <Link to="/stats" className="app-button">
          View all
        </Link>
      </div>
      <div className="app-section-content dashboard-leader-list">
        {identities.length === 0 ? (
          <div className="dashboard-empty is-compact">
            <div>
              <IconUsers size={26} />
              <p className="text-[12px]">{loading ? 'Loading stats' : 'No audience stats yet'}</p>
            </div>
          </div>
        ) : (
          identities.slice(0, 5).map((identity, index) => (
            <div key={identity.id} className="dashboard-leader-row">
              <div className="dashboard-leader-rank">{index + 1}</div>
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative shrink-0" style={{ lineHeight: 0 }}>
                  <Avatar url={identity.profilePictureUrl} name={identity.displayName} size="sm" />
                  <span
                    className="absolute -bottom-1 -right-1 flex items-center justify-center rounded-full"
                    style={{ background: '#0c0d12', padding: 2 }}
                  >
                    <PlatformLogo platform={identity.primaryPlatform} size={10} />
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="dashboard-leader-name">{identity.displayName}</span>
                  <p className="dashboard-leader-platforms">
                    {sortPlatformsByDisplayOrder(identity.allPlatforms).map((platform) => platformLabels[platform as PrimaryPlatform] ?? platform).join(', ')}
                  </p>
                </div>
              </div>
              <div className="dashboard-leader-score">
                <strong>{identity.totalChats.toLocaleString()}</strong>
                <span>chats</span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function EventMix({ rows }: { rows: Array<{ type: string; count: number; share: number }> }) {
  return (
    <div className="dashboard-event-mix">
      {rows.length === 0 ? (
        <div className="dashboard-empty is-compact">
          <div>
            <IconActivity size={26} />
            <p className="text-[12px]">Waiting for events</p>
          </div>
        </div>
      ) : (
        rows.map((row) => (
          <div key={row.type} className="dashboard-event-type-row">
            <div className="flex items-center justify-between gap-3">
              <span>{row.type}</span>
              <strong>{row.count.toLocaleString()}</strong>
            </div>
            <div className="dashboard-platform-share-bar">
              <i style={{ width: `${Math.max(4, row.share * 100)}%` }} />
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function SetupMove({
  to,
  icon,
  title,
  detail,
  status
}: {
  to: string
  icon: React.ReactNode
  title: string
  detail: string
  status: 'next' | 'ready' | 'attention'
}) {
  return (
    <Link to={to} className={`dashboard-setup-card is-${status}`}>
      <span className="dashboard-setup-icon">{icon}</span>
      <span className="dashboard-setup-copy">
        <strong>{title}</strong>
        <em>{detail}</em>
      </span>
      <span className="dashboard-setup-state">
        {status === 'ready' ? 'Ready' : status === 'attention' ? 'Fix' : 'Next'}
      </span>
    </Link>
  )
}

export default function DashboardPage() {
  const statuses = useConnectionStore((s) => s.statuses)
  const viewerCounts = useConnectionStore((s) => s.viewerCounts)
  const errors = useConnectionStore((s) => s.errors)
  const recentEvents = useConnectionStore((s) => s.recentEvents)
  // The unified feed also buffers gift/follow/sub events; dashboard stats track chat only.
  const allFeedItems = useChatStore((s) => s.messages)
  const messages = useMemo(() => allFeedItems.filter(isChatKind), [allFeedItems])
  const ttsQueue = useTTSStore((s) => s.queue)
  const ttsEnabled = useTTSStore((s) => s.enabled)
  const [globalStats, setGlobalStats] = useState<GlobalStats>(EMPTY_GLOBAL_STATS)
  const [topIdentities, setTopIdentities] = useState<UserIdentity[]>([])
  const [statsLoading, setStatsLoading] = useState(true)
  const [audienceSamples, setAudienceSamples] = useState<AudienceSample[]>([])

  const platformViewers = useMemo(() => {
    return primaryPlatforms.reduce((acc, platform) => {
      const raw = sanitizeCount(viewerCounts[platform])
      acc[platform] = shouldCountLiveViewer(statuses[platform], raw) ? raw : 0
      return acc
    }, emptyAudience())
  }, [statuses, viewerCounts])

  const totalViewers = primaryPlatforms.reduce((sum, platform) => sum + platformViewers[platform], 0)
  const connectedCount = primaryPlatforms.filter((platform) => statuses[platform] === 'connected').length
  const connectingCount = primaryPlatforms.filter((platform) => statuses[platform] === 'connecting').length
  const issueCount = primaryPlatforms.filter((platform) => statuses[platform] === 'error').length
  const audienceKey = primaryPlatforms.map((platform) => `${platform}:${platformViewers[platform]}`).join('|')

  useEffect(() => {
    const makeSample = (): AudienceSample => {
      const platforms = primaryPlatforms.reduce((acc, platform) => {
        acc[platform] = platformViewers[platform]
        return acc
      }, emptyAudience())
      return {
        timestamp: Date.now(),
        platforms,
        total: primaryPlatforms.reduce((sum, platform) => sum + platforms[platform], 0)
      }
    }

    setAudienceSamples((samples) => appendAudienceSample(samples, makeSample()))
    const interval = window.setInterval(() => {
      setAudienceSamples((samples) => appendAudienceSample(samples, makeSample()))
    }, 15_000)

    return () => window.clearInterval(interval)
  }, [audienceKey])

  useEffect(() => {
    let active = true
    const loadStats = async () => {
      if (!window.api?.stats) {
        setStatsLoading(false)
        return
      }

      try {
        const [global, leaders] = await Promise.all([
          window.api.stats.getGlobal(),
          window.api.stats.getTopIdentities({ sortBy: 'totalChats', platform: 'all', limit: 5 })
        ])
        if (!active) return
        setGlobalStats(global as GlobalStats)
        setTopIdentities(leaders as UserIdentity[])
      } catch (error) {
        console.error('[Dashboard] Failed to load stats', error)
      } finally {
        if (active) setStatsLoading(false)
      }
    }

    loadStats()
    const interval = window.setInterval(loadStats, 15_000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])

  const liveMessages = useMemo(() => [...messages].slice(-8).reverse(), [messages])
  const queuePreview = ttsQueue.slice(0, 5)
  const latestMessageTime = liveMessages[0]?.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) ?? 'No traffic'
  const now = Date.now()
  const messagesLastFiveMinutes = messages.filter((message) => now - message.timestamp.getTime() <= 5 * 60_000)
  const chatRate = messagesLastFiveMinutes.length / 5
  const sessionUniqueChatters = new Set(messages.map((message) => `${message.platform}:${message.username.toLowerCase()}`)).size
  const sessionMessageCounts = primaryPlatforms.reduce<Record<PrimaryPlatform, number>>((acc, platform) => {
    acc[platform] = messages.filter((message) => message.platform === platform).length
    return acc
  }, { tiktok: 0, twitch: 0, youtube: 0, kick: 0 })
  const sessionEventCounts = primaryPlatforms.reduce<Record<PrimaryPlatform, number>>((acc, platform) => {
    acc[platform] = recentEvents.filter((event) => event.platform === platform).length
    return acc
  }, { tiktok: 0, twitch: 0, youtube: 0, kick: 0 })
  const recentEventTotal = recentEvents.length

  const platformRows: PlatformDashboardRow[] = primaryPlatforms.map((platform) => {
    const stats = globalStats.byPlatform[platform] ?? EMPTY_GLOBAL_STATS.byPlatform[platform]
    const status = statuses[platform] ?? 'disconnected'
    return {
      platform,
      label: platformLabels[platform],
      status,
      viewers: platformViewers[platform],
      share: totalViewers > 0 ? platformViewers[platform] / totalViewers : 0,
      color: platformColors[platform],
      error: errors[platform],
      sessionChats: sessionMessageCounts[platform],
      sessionEvents: sessionEventCounts[platform],
      lifetimeChats: stats.totalChats,
      lifetimeLikes: stats.totalLikes,
      lifetimeGifts: stats.totalGifts,
      lifetimeFollows: stats.totalFollows,
      lifetimeSubs: stats.totalSubscriptions,
      followerCount: stats.followerCount,
      uniqueUsers: stats.uniqueUserCount
    }
  })

  const sessionPeak = Math.max(totalViewers, ...audienceSamples.map((sample) => sample.total))
  const previousSample = audienceSamples.length > 1 ? audienceSamples[audienceSamples.length - 2] : null
  const audienceDelta = previousSample ? totalViewers - previousSample.total : 0
  const firstSample = audienceSamples[0]
  const lastSample = audienceSamples[audienceSamples.length - 1]
  const statusTone = issueCount > 0 ? 'is-danger' : connectedCount > 0 ? 'is-good' : connectingCount > 0 ? 'is-warning' : 'is-warning'
  const statusText = issueCount > 0 ? 'Attention' : connectedCount > 0 ? 'Online' : connectingCount > 0 ? 'Connecting' : 'Standby'
  const issuePlatform = platformRows.find((row) => row.status === 'error')
  const operationTitle = issueCount > 0
    ? `${issueCount} connection${issueCount === 1 ? '' : 's'} need attention`
    : connectedCount > 0
      ? `${connectedCount} live service${connectedCount === 1 ? '' : 's'} online`
      : connectingCount > 0
        ? 'Bringing live services online'
        : 'Your workspace is in standby'
  const operationDetail = issueCount > 0
    ? `${issuePlatform?.label ?? 'A platform'} is reporting a problem. Review Health Center before relying on its audience or chat data.`
    : connectedCount > 0
      ? `Audience, chat, and events are being monitored across ${connectedCount} connected platform${connectedCount === 1 ? '' : 's'}.`
      : connectingCount > 0
        ? `${connectingCount} platform${connectingCount === 1 ? ' is' : 's are'} negotiating a connection. Live signals will appear here as they arrive.`
        : 'Connect a platform to start monitoring audience, chat, and routed events from one place.'
  const primaryAction = issueCount > 0 || connectingCount > 0
    ? { to: '/health', label: 'Review health' }
    : connectedCount > 0
      ? { to: '/broadcast', label: 'Open Broadcast Studio' }
      : { to: '/health', label: 'Connect platforms' }
  const secondaryAction = primaryAction.to === '/health'
    ? { to: '/broadcast', label: 'Broadcast Studio' }
    : { to: '/health', label: 'Health Center' }
  const eventMixRows = Array.from(
    recentEvents.reduce((map, event) => {
      map.set(event.type, (map.get(event.type) ?? 0) + 1)
      return map
    }, new Map<string, number>())
  )
    .map(([type, count]) => ({ type, count, share: recentEventTotal > 0 ? count / recentEventTotal : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  return (
    <div className="app-page dashboard-pro">
      <PageHeader
        kicker="Live Operations"
        title="Dashboard"
        description="See what is live, what needs attention, and where to act next."
        icon={IconBroadcast}
        actions={
          <>
            <span className={`app-status-chip ${statusTone}`}>{statusText}</span>
            <Link to="/broadcast" className="app-button-primary">
              <IconBroadcast size={14} />
              Broadcast
            </Link>
          </>
        }
      />

      <section className={`dashboard-command-panel app-section-card glass ${statusTone}`}>
        <div className="dashboard-command-main">
          <div className="dashboard-command-copy">
            <div>
              <div className="dashboard-command-eyebrow">
                <span aria-hidden="true" />
                Current operating state
              </div>
              <div className="dashboard-command-icon" aria-hidden="true">
                {issueCount > 0 ? <IconAlertTriangle size={22} /> : connectedCount > 0 ? <IconActivity size={22} /> : <IconServer size={22} />}
              </div>
              <h2>{operationTitle}</h2>
              <p>{operationDetail}</p>
            </div>

            <div className="dashboard-command-actions">
              <Link to={primaryAction.to} className="app-button-primary">
                {issueCount > 0 ? <IconAlertTriangle size={14} /> : <IconBroadcast size={14} />}
                {primaryAction.label}
              </Link>
              <Link to={secondaryAction.to} className="app-button">
                {secondaryAction.label}
              </Link>
            </div>

            <div className="dashboard-command-facts">
              <div>
                <span>Connected</span>
                <strong>{connectedCount}/4 services</strong>
              </div>
              <div>
                <span>Session</span>
                <strong>{formatDuration(firstSample ? Date.now() - firstSample.timestamp : 0)}</strong>
              </div>
              <div>
                <span>Latest chat</span>
                <strong>{latestMessageTime}</strong>
              </div>
            </div>
          </div>

          <AudienceChart samples={audienceSamples} rows={platformRows} />
        </div>

        <div className="dashboard-operation-strip" aria-label="Current live signals">
          <OperationSignal
            icon={<IconServer size={16} />}
            label="Service nodes"
            value={`${connectedCount}/4`}
            detail={issueCount > 0 ? `${issueCount} need attention` : connectingCount > 0 ? `${connectingCount} connecting` : 'Connection matrix clean'}
            tone={issueCount > 0 ? 'danger' : connectedCount > 0 ? 'good' : connectingCount > 0 ? 'warning' : 'neutral'}
          />
          <OperationSignal
            icon={<IconActivity size={16} />}
            label="Chat velocity"
            value={`${chatRate >= 10 ? chatRate.toFixed(0) : chatRate.toFixed(1)}/m`}
            detail={`${sessionUniqueChatters.toLocaleString()} unique chatters`}
            tone={chatRate > 0 ? 'good' : 'neutral'}
          />
          <OperationSignal
            icon={<IconBolt size={16} />}
            label="Routed events"
            value={recentEventTotal.toLocaleString()}
            detail={recentEventTotal > 0 ? 'Event chain is active' : 'Waiting for live events'}
            tone={recentEventTotal > 0 ? 'good' : 'neutral'}
          />
          <OperationSignal
            icon={<IconChartLine size={16} />}
            label="Session peak"
            value={sessionPeak.toLocaleString()}
            detail={formatDelta(audienceDelta)}
            tone={audienceDelta > 0 ? 'good' : audienceDelta < 0 ? 'warning' : 'neutral'}
          />
        </div>
      </section>

      <div className="dashboard-bento">
        <main className="dashboard-main-stack">
          <section className="app-section-card glass min-h-[380px]">
            <div className="app-section-head">
              <div>
                <h2>Live event pulse</h2>
                <p>{recentEventTotal.toLocaleString()} recent routed events · latest chat {latestMessageTime}</p>
              </div>
              <div className="flex items-center gap-2">
                <Link to="/stats" className="app-button">
                  Stats
                </Link>
                <Link to="/chat" className="app-button-primary">
                  Chat
                </Link>
              </div>
            </div>
            <div className="app-section-content dashboard-live-grid">
              <div className="dashboard-event-list max-h-[430px] overflow-y-auto custom-scrollbar">
                {liveMessages.length === 0 ? (
                  <div className="dashboard-empty">
                    <div>
                      <IconMessage2 size={38} />
                      <p className="text-[12px]">Waiting for interaction</p>
                    </div>
                  </div>
                ) : (
                  liveMessages.map((msg) => (
                    <div key={msg.id} className="dashboard-event-row p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white/[0.04]">
                            <PlatformLogo platform={msg.platform} size={13} />
                          </div>
                          <div className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold text-white">{msg.displayName}</span>
                            <p className="mt-0.5 text-[11px] capitalize leading-none text-white/32">{msg.platform}</p>
                          </div>
                        </div>
                        <span className="shrink-0 font-mono text-[11px] text-white/32 tabular-nums">
                          {msg.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      <p className="pl-10 text-[13px] leading-relaxed text-white/60">{msg.message}</p>
                    </div>
                  ))
                )}
              </div>

              <div className="dashboard-event-mix-panel">
                <div className="dashboard-kicker">Event Mix</div>
                <EventMix rows={eventMixRows} />
              </div>
            </div>
          </section>

          <PlatformBreakdown rows={platformRows} />

          <LifetimeSummary global={globalStats} />
        </main>

        <aside className="dashboard-side-stack">
          <section className="app-section-card glass dashboard-next-moves">
            <div className="app-section-head">
              <div>
                <h2>Next moves</h2>
                <p>Finish the highest-value setup work first.</p>
              </div>
              <IconBolt size={16} className="text-white/38" />
            </div>
            <div className="app-section-content dashboard-setup-grid is-stack">
              <SetupMove
                to="/health"
                icon={<IconServer size={15} />}
                title="Connect live platforms"
                detail={connectedCount > 0 ? `${connectedCount} platform${connectedCount === 1 ? '' : 's'} connected` : 'Start here if chat or viewers are missing'}
                status={issueCount > 0 ? 'attention' : connectedCount > 0 ? 'ready' : 'next'}
              />
              <SetupMove
                to="/broadcast"
                icon={<IconBroadcast size={15} />}
                title="Build the broadcast"
                detail={totalViewers > 0 ? `${totalViewers.toLocaleString()} live viewers currently tracked` : 'Create scenes, sources, and audio before going live'}
                status={connectedCount > 0 ? 'next' : 'ready'}
              />
              <SetupMove
                to="/tts"
                icon={<IconTTS size={15} />}
                title="Tune chat voice"
                detail={ttsEnabled ? `${ttsQueue.length} item${ttsQueue.length === 1 ? '' : 's'} in queue` : 'TTS is currently disabled'}
                status={ttsEnabled ? 'ready' : 'attention'}
              />
              <SetupMove
                to="/event-lab"
                icon={<IconActivity size={15} />}
                title="Test the event chain"
                detail={recentEventTotal > 0 ? `${recentEventTotal} recent events routed` : 'Send sample gifts, follows, chats, and alerts'}
                status={recentEventTotal > 0 ? 'ready' : 'next'}
              />
            </div>
          </section>

          <section className="app-section-card glass">
            <div className="app-section-head">
              <h2>Operational health</h2>
              <IconChartLine size={16} className="text-white/38" />
            </div>
            <div className="app-section-content dashboard-health-list">
              <HealthRow label="Inbound nodes" value={`${connectedCount}/4`} tone={issueCount > 0 ? 'bad' : connectedCount > 0 ? 'good' : 'muted'} />
              <HealthRow label="Audience samples" value={audienceSamples.length.toString()} tone={audienceSamples.length > 0 ? 'good' : 'muted'} />
              <HealthRow label="Recent events" value={recentEventTotal.toLocaleString()} tone={recentEventTotal > 0 ? 'good' : 'muted'} />
              <HealthRow label="Speech queue" value={ttsQueue.length.toString()} tone={ttsQueue.length > 0 ? 'good' : 'muted'} />
              <div className="dashboard-health-divider" />
              <HealthRow label="Session duration" value={formatDuration(firstSample ? Date.now() - firstSample.timestamp : 0)} tone={firstSample ? 'good' : 'muted'} />
              <HealthRow label="Last sample" value={lastSample ? formatTime(lastSample.timestamp) : '--'} tone={lastSample ? 'good' : 'muted'} />
              <HealthRow label="Lifetime peak" value={globalStats.peakViewerCount.toLocaleString()} tone={globalStats.peakViewerCount > 0 ? 'good' : 'muted'} />
            </div>
            {issueCount > 0 && (
              <div className="px-4 pb-4">
                <Link to="/health" className="dashboard-warning-line">
                  <IconAlertTriangle size={14} />
                  <span>{issueCount} platform connection needs attention</span>
                </Link>
              </div>
            )}
          </section>

          <section className="app-section-card glass">
            <div className="app-section-head">
              <h2>Speech engine</h2>
              <span className={`app-status-chip ${ttsEnabled ? 'is-good' : ''}`}>{ttsEnabled ? 'Active' : 'Standby'}</span>
            </div>
            <div className="app-section-content dashboard-voice-list">
              {queuePreview.length === 0 ? (
                <div className="py-8 text-center text-white/32">
                  <IconVolume size={28} className="mx-auto mb-2 opacity-50" />
                  <p className="text-[12px]">Queue empty</p>
                </div>
              ) : (
                queuePreview.map((item, index) => (
                  <div key={item.id} className="dashboard-voice-row flex items-center gap-3 p-2.5">
                    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white/[0.04] text-[11px] font-semibold text-white/55 tabular-nums">
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold leading-tight text-white">{item.username}</p>
                      <p className="mt-0.5 truncate text-[11px] leading-tight text-white/38">{item.text}</p>
                    </div>
                    <PlatformLogo platform={item.platform as Platform} size={12} />
                  </div>
                ))
              )}
              <Link to="/tts" className="app-button mt-1 w-full">
                Manage voice
              </Link>
            </div>
          </section>

          <SpotifyMetricCard />

          <TopAudience identities={topIdentities} loading={statsLoading} />

          <section className="app-section-card glass">
            <div className="app-section-head">
              <h2>Quick routes</h2>
            </div>
            <div className="app-section-content dashboard-quick-grid">
              <QuickLink to="/chat" icon={<IconChat size={16} />} label="Chat Hub" />
              <QuickLink to="/tts" icon={<IconTTS size={16} />} label="Voice" />
              <QuickLink to="/spotify" icon={<SpotifyIcon size={16} />} label="Spotify" />
              <QuickLink to="/triggers" icon={<IconBolt size={16} />} label="Rules" />
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
