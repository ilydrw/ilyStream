import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBolt,
  IconChecklist,
  IconClipboardCheck,
  IconCopy,
  IconRefresh,
  IconSend,
  IconShieldCheck,
  IconStethoscope
} from '@tabler/icons-react'
import { PageHeader } from '../../components/layout/PageHeader'
import { PlatformLogo } from '../../components/platforms/PlatformLogo'
import { useConnectionStore } from '../../stores/connection-store'
import type {
  AnyPlatformConfig,
  Platform,
  PlatformChatCapability,
  PlatformChatSendResult
} from '../../../main/platforms/types'
import { getPlatformCapability, toPlatformConfigMap } from '../../lib/platform-configs'
import {
  buildPlatformHealthRows,
  createHealthDiagnosticReport,
  HEALTH_PLATFORMS,
  isRealPlatformEventDiagnostic,
  type HealthPlatform,
  type PlatformHealthRow,
  type PlatformHealthTone
} from '../../lib/health-center'
import './health-center.css'

const toneChipClass: Record<PlatformHealthTone, string> = {
  ready: 'is-good',
  warning: 'is-warning',
  blocked: 'is-danger',
  idle: ''
}

const toneLabels: Record<PlatformHealthTone, string> = {
  ready: 'Ready',
  warning: 'Check',
  blocked: 'Blocked',
  idle: 'Idle'
}

const platformColors: Record<HealthPlatform, string> = {
  tiktok: '#ff3b5f',
  twitch: '#9146ff',
  youtube: '#ff3b30',
  kick: '#53fc18'
}

const LIVE_CHAT_PROBE_PREFIX = 'ilyStream live chat check'

interface ActiveHealthCheck {
  platform: HealthPlatform
  kind: 'local' | 'live'
}

function normalizeCapabilities(
  capabilities: unknown
): Partial<Record<Platform, PlatformChatCapability>> {
  return HEALTH_PLATFORMS.reduce<Partial<Record<Platform, PlatformChatCapability>>>((acc, platform) => {
    const capability = getPlatformCapability(capabilities as any, platform)
    if (capability) acc[platform] = capability
    return acc
  }, {})
}

function formatTime(value: Date | null): string {
  if (!value) return '--'
  return value.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}

function HealthSignal({
  icon,
  label,
  value,
  detail,
  tone
}: {
  icon: React.ReactNode
  label: string
  value: string
  detail: string
  tone: PlatformHealthTone
}) {
  return (
    <div className={`health-signal is-${tone}`}>
      <span className="health-signal-icon">{icon}</span>
      <span className="health-signal-copy">
        <em>{label}</em>
        <strong>{value}</strong>
        <small>{detail}</small>
      </span>
    </div>
  )
}

function HealthInfoTile({
  label,
  value,
  detail
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="health-info-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  )
}

function PlatformHealthCard({
  row,
  onRunLocalTest,
  onSendLiveProbe,
  activeCheck
}: {
  row: PlatformHealthRow
  onRunLocalTest: (platform: HealthPlatform) => void
  onSendLiveProbe: (platform: HealthPlatform) => void
  activeCheck: ActiveHealthCheck | null
}) {
  const isBusy = activeCheck !== null
  const isRunningLocalTest = activeCheck?.platform === row.platform && activeCheck.kind === 'local'
  const isSendingLiveProbe = activeCheck?.platform === row.platform && activeCheck.kind === 'live'

  return (
    <article className={`health-platform-card is-${row.tone}`}>
      <header className="health-platform-head">
        <div className="health-platform-identity">
          <span className="health-platform-logo" style={{ '--health-platform-color': platformColors[row.platform] } as React.CSSProperties}>
            <PlatformLogo platform={row.platform} size={20} />
          </span>
          <div>
            <div className="health-platform-title-row">
              <h3>{row.label}</h3>
              <span className={`app-status-chip ${toneChipClass[row.tone]}`}>{toneLabels[row.tone]}</span>
              <span className="app-status-chip">{row.status}</span>
            </div>
            <p>{row.summary}</p>
          </div>
        </div>
        <div className="health-platform-audience">
          <span>Audience</span>
          <strong>{row.viewerCount.toLocaleString()}</strong>
          <i style={{ background: platformColors[row.platform] }} />
        </div>
      </header>

      <div className="health-platform-body">
        <div className="health-platform-diagnosis">
          <span>Diagnosis</span>
          <p>{row.detail}</p>
        </div>

        <div className="health-platform-signal-grid">
          <HealthInfoTile label="Input trust" value={row.trustLabel} detail={row.trustDetail} />
          <HealthInfoTile
            label="Chat relay"
            value={row.canSendChat ? 'Can send' : 'Read only'}
            detail={row.canSendChat ? 'Outbound messages are available.' : row.chatCapabilityReason ?? 'Outbound chat is not available yet.'}
          />
          <HealthInfoTile label="Last event" value={formatTime(row.lastEventAt)} detail={row.lastEventLabel} />
        </div>

        <div className="health-platform-next">
          <div>
            <span className="health-platform-next-label">
              <IconChecklist size={13} />
              Next best action
            </span>
            <p>{row.nextAction}</p>
          </div>
          <div className="health-platform-actions">
            <Link to={row.actionPath} className="app-button-primary">
              <IconShieldCheck size={14} />
              Open setup
            </Link>
            <button
              type="button"
              className="app-button"
              onClick={() => onRunLocalTest(row.platform)}
              disabled={isBusy}
              title="Runs inside ilyStream only; it does not contact the platform."
            >
              <IconBolt size={14} />
              {isRunningLocalTest ? 'Testing local event path' : 'Test local event path'}
            </button>
            {row.canSendChat && (
              <button
                type="button"
                className="app-button"
                onClick={() => onSendLiveProbe(row.platform)}
                disabled={isBusy || row.status !== 'connected'}
                title={row.status === 'connected'
                  ? 'Posts a visible health-check message to the live channel.'
                  : `Connect ${row.label} before sending a live chat probe.`}
              >
                <IconSend size={14} />
                {isSendingLiveProbe ? 'Sending live probe' : 'Send live probe'}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

function ChecklistLink({ to, title, detail }: { to: string; title: string; detail: string }) {
  return (
    <Link to={to} className="health-checklist-link">
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <IconArrowRight size={14} />
    </Link>
  )
}

export default function HealthPage() {
  const statuses = useConnectionStore((state) => state.statuses)
  const errors = useConnectionStore((state) => state.errors)
  const reconnectInfo = useConnectionStore((state) => state.reconnectInfo)
  const viewerCounts = useConnectionStore((state) => state.viewerCounts)
  const recentEvents = useConnectionStore((state) => state.recentEvents)
  const [configs, setConfigs] = useState<Partial<Record<Platform, AnyPlatformConfig>>>({})
  const [capabilities, setCapabilities] = useState<Partial<Record<Platform, PlatformChatCapability>>>({})
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [activeCheck, setActiveCheck] = useState<ActiveHealthCheck | null>(null)

  const refresh = async () => {
    setLoading(true)
    try {
      const [configResult, capabilityResult] = await Promise.all([
        window.api.platform.getConfigs(),
        window.api.platform.getChatCapabilities()
      ])
      setConfigs(toPlatformConfigMap(configResult))
      setCapabilities(normalizeCapabilities(capabilityResult))
      setNotice('Health data refreshed.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not refresh health data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const rows = useMemo(() => {
    return buildPlatformHealthRows({
      statuses,
      errors,
      reconnectInfo,
      viewerCounts,
      recentEvents,
      configs,
      capabilities
    })
  }, [statuses, errors, reconnectInfo, viewerCounts, recentEvents, configs, capabilities])

  const readyCount = rows.filter((row) => row.tone === 'ready').length
  const blockedCount = rows.filter((row) => row.tone === 'blocked').length
  const warningCount = rows.filter((row) => row.tone === 'warning').length
  const liveEventCount = recentEvents.filter(isRealPlatformEventDiagnostic).length
  const sendableCount = rows.filter((row) => row.canSendChat).length
  const connectedCount = rows.filter((row) => row.status === 'connected').length
  const verifiedInputCount = rows.filter((row) => row.trustLabel === 'Verified live').length
  const priorityRows = [...rows].sort((left, right) => {
    const priority: Record<PlatformHealthTone, number> = { blocked: 0, warning: 1, ready: 2, idle: 3 }
    return priority[left.tone] - priority[right.tone]
  })
  const concernRows = priorityRows.filter((row) => row.tone === 'blocked' || row.tone === 'warning')
  const primaryConcern = concernRows[0] ?? null
  const overallTone: PlatformHealthTone = blockedCount > 0
    ? 'blocked'
    : warningCount > 0
      ? 'warning'
      : readyCount > 0
        ? 'ready'
        : 'idle'
  const overallLabel = loading
    ? 'Refreshing'
    : blockedCount > 0
      ? 'Action required'
      : warningCount > 0
        ? 'Review advised'
        : readyCount === rows.length
          ? 'Healthy'
          : 'Standby'
  const overallTitle = loading
    ? 'Refreshing system health'
    : blockedCount > 0
      ? `${blockedCount} platform${blockedCount === 1 ? ' is' : 's are'} blocked`
      : warningCount > 0
        ? `${warningCount} platform${warningCount === 1 ? ' needs' : 's need'} a closer look`
        : readyCount === rows.length
          ? 'Every visible service is healthy'
          : 'No active blockers are visible'
  const overallDetail = primaryConcern
    ? `${primaryConcern.label}: ${primaryConcern.summary}. ${primaryConcern.nextAction}`
    : readyCount === rows.length
      ? `All four connections are healthy; ${verifiedInputCount}/4 have recent real platform-event evidence. Local tests do not count as live input.`
      : 'Configured services are quiet or intentionally offline. Run a local path test without mistaking it for platform evidence.'

  const copyReport = async () => {
    const report = createHealthDiagnosticReport({
      statuses,
      errors,
      reconnectInfo,
      viewerCounts,
      recentEvents,
      configs,
      capabilities
    })
    await window.api.system.copyToClipboard(report)
    setNotice('Diagnostic report copied.')
  }

  const runLocalEventTest = async (platform: HealthPlatform) => {
    const label = rows.find((row) => row.platform === platform)?.label ?? platform
    setActiveCheck({ platform, kind: 'local' })
    try {
      await window.api.events.simulate({
        platform,
        type: 'chat',
        username: 'health_check',
        displayName: 'Health Check'
      })
      setNotice(`${label} local event path passed through Event Lab. This does not verify platform traffic.`)
      return true
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not run the local event path test.')
      return false
    } finally {
      setActiveCheck(null)
    }
  }

  const runAllLocalTests = async () => {
    const failures: string[] = []
    for (const platform of HEALTH_PLATFORMS) {
      if (!await runLocalEventTest(platform)) {
        failures.push(rows.find((row) => row.platform === platform)?.label ?? platform)
      }
    }
    if (failures.length > 0) {
      setNotice(`Local event path tests failed for ${failures.join(', ')}.`)
      return
    }
    setNotice('All local event paths were exercised. No platform traffic was sent or verified.')
  }

  const sendLiveChatProbe = async (platform: HealthPlatform) => {
    const row = rows.find((candidate) => candidate.platform === platform)
    if (!row) {
      setNotice(`Could not find health data for ${platform}.`)
      return
    }
    if (row.status !== 'connected') {
      setNotice(`Connect ${row.label} before sending a live chat probe.`)
      return
    }

    setActiveCheck({ platform, kind: 'live' })
    try {
      const capabilityResult = await window.api.platform.getChatCapabilities()
      const freshCapabilities = normalizeCapabilities(capabilityResult)
      const capability = freshCapabilities[platform]
      setCapabilities(freshCapabilities)
      if (capability?.canSend !== true) {
        throw new Error(capability?.reason || `${row.label} cannot send chat messages right now.`)
      }

      const results = await window.api.platform.sendChatMessage({
        platforms: [platform],
        text: `${LIVE_CHAT_PROBE_PREFIX} - ${new Date().toISOString()}`
      }) as PlatformChatSendResult[]
      const result = results.find((candidate) => candidate.platform === platform)
      if (!result?.ok) {
        throw new Error(result?.error || `${row.label} did not confirm the chat message.`)
      }
      setNotice(
        `${row.label} live chat probe posted. Outbound chat is working; ` +
        'a genuine incoming platform event is still required to verify live input.'
      )
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not send the live chat probe.')
    } finally {
      setActiveCheck(null)
    }
  }

  return (
    <div className="app-page health-center-page">
      <PageHeader
        kicker="System"
        title="Health Center"
        description="See what is healthy, what is blocked, and the next best action for every live service."
        icon={IconStethoscope}
        actions={
          <>
            <span className={`app-status-chip ${toneChipClass[overallTone]}`}>{overallLabel}</span>
            <button type="button" className="app-button" onClick={refresh} disabled={loading}>
              <IconRefresh size={14} />
              Refresh
            </button>
            <button type="button" className="app-button-primary" onClick={copyReport}>
              <IconCopy size={14} />
              Copy report
            </button>
          </>
        }
      />

      <section className={`health-command-panel app-section-card glass is-${overallTone}`}>
        <div className="health-command-main">
          <div className="health-command-copy">
            <div>
              <div className="health-command-eyebrow">
                <span aria-hidden="true" />
                Current health verdict
              </div>
              <div className="health-command-icon" aria-hidden="true">
                {blockedCount > 0 || warningCount > 0 ? <IconAlertTriangle size={23} /> : <IconShieldCheck size={23} />}
              </div>
              <h2>{overallTitle}</h2>
              <p>{overallDetail}</p>
            </div>

            <div className="health-command-actions">
              {primaryConcern ? (
                <Link to={primaryConcern.actionPath} className="app-button-primary">
                  <IconShieldCheck size={14} />
                  Open {primaryConcern.label} setup
                </Link>
              ) : (
                <button type="button" className="app-button-primary" onClick={runAllLocalTests} disabled={activeCheck !== null}>
                  <IconBolt size={14} />
                  Test local paths
                </button>
              )}
              <Link to="/event-lab" className="app-button">
                Event Lab
              </Link>
            </div>

            <div className="health-command-facts">
              <div>
                <span>Connected</span>
                <strong>{connectedCount}/4 services</strong>
              </div>
              <div>
                <span>Evidence</span>
                <strong>{liveEventCount.toLocaleString()} real recent events</strong>
              </div>
              <div>
                <span>Relay paths</span>
                <strong>{sendableCount}/4 outbound</strong>
              </div>
            </div>
          </div>

          <div className="health-matrix" aria-label="Platform health matrix">
            <div className="health-matrix-head">
              <div>
                <span>Connection matrix</span>
                <strong>Four-platform readiness</strong>
              </div>
              <span className={`app-status-chip ${toneChipClass[overallTone]}`}>{overallLabel}</span>
            </div>
            <div className="health-matrix-list">
              {rows.map((row) => (
                <Link key={row.platform} to={row.actionPath} className={`health-matrix-row is-${row.tone}`}>
                  <span className="health-matrix-platform">
                    <span className="health-matrix-logo"><PlatformLogo platform={row.platform} size={17} /></span>
                    <span>
                      <strong>{row.label}</strong>
                      <small>{row.summary}</small>
                    </span>
                  </span>
                  <span className="health-matrix-meta">
                    <strong>{row.viewerCount.toLocaleString()}</strong>
                    <small>{toneLabels[row.tone]}</small>
                  </span>
                  <IconArrowRight size={14} />
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="health-signal-strip" aria-label="Health summary">
          <HealthSignal icon={<IconShieldCheck size={16} />} label="Ready" value={`${readyCount}/4`} detail="Healthy collection" tone={readyCount > 0 ? 'ready' : 'idle'} />
          <HealthSignal icon={<IconAlertTriangle size={16} />} label="Needs review" value={`${warningCount + blockedCount}`} detail={blockedCount > 0 ? `${blockedCount} blocked` : 'No hard blockers'} tone={blockedCount > 0 ? 'blocked' : warningCount > 0 ? 'warning' : 'idle'} />
          <HealthSignal icon={<IconSend size={16} />} label="Chat relay" value={`${sendableCount}/4`} detail="Outbound capable" tone={sendableCount > 0 ? 'ready' : 'idle'} />
          <HealthSignal icon={<IconBolt size={16} />} label="Real traffic" value={liveEventCount.toLocaleString()} detail="Platform events" tone={liveEventCount > 0 ? 'ready' : 'idle'} />
        </div>
      </section>

      {notice && (
        <div className="app-callout is-accent health-notice" role="status">
          {notice}
        </div>
      )}

      <div className="health-workspace">
        <section className="app-section-card glass health-platform-section">
          <div className="app-section-head">
            <div>
              <h2>Platform diagnostics</h2>
              <p>Ordered by urgency so the most important recovery work stays on top.</p>
            </div>
            <button type="button" className="app-button" onClick={runAllLocalTests} disabled={activeCheck !== null}>
              <IconBolt size={14} />
              Test all local paths
            </button>
          </div>
          <div className="app-section-content health-platform-list">
            {priorityRows.map((row) => (
              <PlatformHealthCard
                key={row.platform}
                row={row}
                onRunLocalTest={runLocalEventTest}
                onSendLiveProbe={sendLiveChatProbe}
                activeCheck={activeCheck}
              />
            ))}
          </div>
        </section>

        <aside className="health-side-stack">
          <section className="app-section-card glass health-priority-card">
            <div className="app-section-head">
              <div>
                <h2>Priority queue</h2>
                <p>{concernRows.length > 0 ? `${concernRows.length} item${concernRows.length === 1 ? '' : 's'} need review.` : 'No recovery work is queued.'}</p>
              </div>
              <IconAlertTriangle size={16} className="text-white/38" />
            </div>
            <div className="app-section-content health-priority-list">
              {concernRows.length === 0 ? (
                <div className="health-all-clear">
                  <span><IconClipboardCheck size={18} /></span>
                  <div>
                    <strong>No active blockers</strong>
                    <p>Everything visible is healthy or intentionally offline.</p>
                  </div>
                </div>
              ) : (
                concernRows.map((row, index) => (
                  <Link key={row.platform} to={row.actionPath} className={`health-priority-item is-${row.tone}`}>
                    <span className="health-priority-rank">{index + 1}</span>
                    <span className="health-priority-copy">
                      <span>
                        <PlatformLogo platform={row.platform} size={14} />
                        <strong>{row.label}</strong>
                        <small>{toneLabels[row.tone]}</small>
                      </span>
                      <p>{row.summary}</p>
                    </span>
                    <IconArrowRight size={14} />
                  </Link>
                ))
              )}
            </div>
          </section>

          <section className="app-section-card glass">
            <div className="app-section-head">
              <div>
                <h2>Verification tools</h2>
                <p>Confirm the rest of the live path.</p>
              </div>
              <IconChecklist size={16} className="text-white/38" />
            </div>
            <div className="app-section-content health-checklist-list">
              <ChecklistLink to="/event-lab" title="Event testing" detail="Exercise alerts, TTS, overlays, and automation routes locally." />
              <ChecklistLink to="/stats" title="Identity manager" detail="Verify merged accounts, profiles, and badges before trusting stats." />
              <ChecklistLink to="/chat" title="Relay controls" detail="Review outbound targets and any disabled send paths." />
              <ChecklistLink to="/tts" title="Command filters" detail="Confirm voice and command routing before chat gets busy." />
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
