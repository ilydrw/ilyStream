import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  IconAlertTriangle,
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
import type { AnyPlatformConfig, Platform, PlatformChatCapability } from '../../../main/platforms/types'
import { getPlatformCapability, toPlatformConfigMap } from '../../lib/platform-configs'
import {
  buildPlatformHealthRows,
  createHealthDiagnosticReport,
  HEALTH_PLATFORMS,
  type HealthPlatform,
  type PlatformHealthRow,
  type PlatformHealthTone
} from '../../lib/health-center'

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

function SummaryTile({
  label,
  value,
  detail,
  tone
}: {
  label: string
  value: string
  detail: string
  tone: PlatformHealthTone
}) {
  return (
    <div className="app-section-card glass p-4">
      <div className="flex items-center justify-between gap-3">
        <span className={`app-status-chip ${toneChipClass[tone]}`}>{label}</span>
        <strong className="font-mono text-2xl tabular-nums text-white">{value}</strong>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-white/45">{detail}</p>
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
    <div className="min-w-0 rounded-md border border-white/[0.06] bg-black/15 p-3">
      <span className="block text-[10px] font-semibold text-white/30">{label}</span>
      <strong className="mt-1 block truncate text-[13px] leading-5 text-white">{value}</strong>
      <p className="mt-1 line-clamp-3 text-[11px] leading-5 text-white/42">{detail}</p>
    </div>
  )
}

function PlatformHealthCard({
  row,
  onRunChatTest,
  isTesting
}: {
  row: PlatformHealthRow
  onRunChatTest: (platform: HealthPlatform) => void
  isTesting: boolean
}) {
  return (
    <article
      className="overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.028] shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
    >
      <div className="h-1" style={{ background: platformColors[row.platform] }} />
      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0 space-y-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-white/[0.08] bg-black/20">
              <PlatformLogo platform={row.platform} size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className="min-w-0 truncate text-[16px] font-bold leading-5 text-white">{row.label}</h2>
                <span className={`app-status-chip ${toneChipClass[row.tone]}`}>{toneLabels[row.tone]}</span>
                <span className="app-status-chip">{row.status}</span>
              </div>
              <p className="mt-1 text-[12px] leading-5 text-white/50">{row.summary}</p>
            </div>
          </div>

          <div className="rounded-md border border-white/[0.06] bg-black/10 px-3 py-2.5">
            <p className="text-[13px] leading-5 text-white/65">{row.detail}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <HealthInfoTile label="Input" value={row.trustLabel} detail={row.trustDetail} />
            <HealthInfoTile
              label="Chat relay"
              value={row.canSendChat ? 'Can send' : 'Read only'}
              detail={row.canSendChat ? 'Outbound messages are available.' : row.chatCapabilityReason ?? 'Outbound chat is not available yet.'}
            />
            <HealthInfoTile label="Last event" value={formatTime(row.lastEventAt)} detail={row.lastEventLabel} />
          </div>

          <div className="rounded-md border border-white/[0.06] bg-black/15 p-3">
            <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold text-white/32">
              <IconChecklist size={13} />
              Next action
            </div>
            <p className="text-[12px] leading-5 text-white/62">{row.nextAction}</p>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3 rounded-md border border-white/[0.06] bg-black/15 p-3">
          <Link to={row.actionPath} className="app-button-primary w-full justify-center">
            <IconShieldCheck size={14} />
            Open setup
          </Link>
          <button
            type="button"
            className="app-button w-full justify-center"
            onClick={() => onRunChatTest(row.platform)}
            disabled={isTesting}
          >
            <IconSend size={14} />
            {isTesting ? 'Sending' : 'Chat test'}
          </button>
          <div className="mt-1 rounded-md border border-white/[0.06] bg-white/[0.025] p-3">
            <span className="block text-[10px] font-semibold text-white/30">Audience</span>
            <strong className="mt-1 block font-mono text-2xl leading-none text-white tabular-nums">{row.viewerCount.toLocaleString()}</strong>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <i
                className="block h-full rounded-full"
                style={{ width: `${Math.min(100, Math.max(4, row.viewerCount))}%`, background: platformColors[row.platform] }}
              />
            </div>
          </div>
        </div>
      </div>
    </article>
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
  const [testingPlatform, setTestingPlatform] = useState<HealthPlatform | null>(null)

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
  const liveEventCount = recentEvents.length
  const sendableCount = rows.filter((row) => row.canSendChat).length

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

  const runChatTest = async (platform: HealthPlatform) => {
    setTestingPlatform(platform)
    try {
      await window.api.events.simulate({
        platform,
        type: 'chat',
        username: 'health_check',
        displayName: 'Health Check'
      })
      setNotice(`${platform} chat test sent through Event Lab.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not send the chat test.')
    } finally {
      setTestingPlatform(null)
    }
  }

  const runAllChatTests = async () => {
    for (const platform of HEALTH_PLATFORMS) {
      await runChatTest(platform)
    }
    setNotice('All chat tests sent.')
  }

  return (
    <div className="app-page">
      <PageHeader
        kicker="System"
        title="Health Center"
        description="Connection readiness, chat capability, event traffic, and platform-specific fixes in one place."
        icon={IconStethoscope}
        actions={
          <>
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

      <div className="grid gap-[var(--gap-grid)] md:grid-cols-4">
        <SummaryTile label="Ready" value={`${readyCount}/4`} detail="Platforms with active, healthy collection." tone="ready" />
        <SummaryTile label="Attention" value={`${warningCount}`} detail="Connected or configured services that deserve a quick check." tone="warning" />
        <SummaryTile label="Blocked" value={`${blockedCount}`} detail="Services reporting actionable errors." tone={blockedCount > 0 ? 'blocked' : 'idle'} />
        <SummaryTile label="Relay" value={`${sendableCount}/4`} detail="Platforms currently able to send outbound chat." tone={sendableCount > 0 ? 'ready' : 'idle'} />
      </div>

      {notice && (
        <div className="app-callout is-accent">
          {notice}
        </div>
      )}

      <div className="grid gap-[var(--gap-grid)] xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="app-section-card glass overflow-hidden">
          <div className="app-section-head">
            <div>
              <h2>Platform checkup</h2>
              <p>{liveEventCount.toLocaleString()} recent events are available for diagnostics.</p>
            </div>
            <button type="button" className="app-button" onClick={runAllChatTests} disabled={testingPlatform !== null}>
              <IconBolt size={14} />
              Test all chats
            </button>
          </div>
          <div className="app-section-content flex flex-col gap-4 bg-black/[0.08]">
            {rows.map((row) => (
              <PlatformHealthCard
                key={row.platform}
                row={row}
                onRunChatTest={runChatTest}
                isTesting={testingPlatform === row.platform}
              />
            ))}
          </div>
        </section>

        <aside className="flex min-w-0 flex-col gap-[var(--gap-grid)]">
          <section className="app-section-card glass">
            <div className="app-section-head">
              <h2>Live checklist</h2>
              <IconChecklist size={16} className="text-white/38" />
            </div>
            <div className="app-section-content flex flex-col gap-2">
              <Link to="/event-lab" className="border-t border-white/[0.06] py-3 transition-colors first:border-t-0 hover:text-cyan-100">
                <strong className="block text-[13px] text-white">Event testing</strong>
                <span className="mt-1 block text-[11px] leading-relaxed text-white/45">Run gifts, follows, chats, emotes, alerts, TTS, and overlay routes locally.</span>
              </Link>
              <Link to="/stats" className="border-t border-white/[0.06] py-3 transition-colors first:border-t-0 hover:text-cyan-100">
                <strong className="block text-[13px] text-white">Identity manager</strong>
                <span className="mt-1 block text-[11px] leading-relaxed text-white/45">Merge accounts, set primary profiles, and verify badges before reading stats.</span>
              </Link>
              <Link to="/chat" className="border-t border-white/[0.06] py-3 transition-colors first:border-t-0 hover:text-cyan-100">
                <strong className="block text-[13px] text-white">Relay controls</strong>
                <span className="mt-1 block text-[11px] leading-relaxed text-white/45">Review auto-relay, outbound targets, and disabled send paths.</span>
              </Link>
              <Link to="/tts" className="border-t border-white/[0.06] py-3 transition-colors first:border-t-0 hover:text-cyan-100">
                <strong className="block text-[13px] text-white">Command filters</strong>
                <span className="mt-1 block text-[11px] leading-relaxed text-white/45">Confirm AI, song request, and TTS routing before chat gets busy.</span>
              </Link>
            </div>
          </section>

          <section className="app-section-card glass">
            <div className="app-section-head">
              <h2>Current risks</h2>
              <IconAlertTriangle size={16} className="text-white/38" />
            </div>
            <div className="app-section-content flex flex-col gap-3">
              {rows.filter((row) => row.tone === 'blocked' || row.tone === 'warning').length === 0 ? (
                <div className="border-t border-emerald-400/15 pt-3 first:border-t-0">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-emerald-100">
                    <IconClipboardCheck size={15} />
                    No active blockers
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-emerald-100/65">Everything visible from the app is either ready or intentionally offline.</p>
                </div>
              ) : (
                rows
                  .filter((row) => row.tone === 'blocked' || row.tone === 'warning')
                  .map((row) => (
                    <Link
                      key={row.platform}
                      to={row.actionPath}
                      className="border-t border-white/[0.06] py-3 transition-colors first:border-t-0 hover:text-danger"
                    >
                      <div className="flex items-center gap-2">
                        <PlatformLogo platform={row.platform} size={14} />
                        <strong className="text-[13px] text-white">{row.label}</strong>
                        <span className={`app-status-chip ${toneChipClass[row.tone]}`}>{toneLabels[row.tone]}</span>
                      </div>
                      <p className="mt-2 text-[11px] leading-relaxed text-white/50">{row.summary}</p>
                    </Link>
                  ))
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
