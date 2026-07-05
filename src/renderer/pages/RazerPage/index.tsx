import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  IconActivity,
  IconAlertTriangle,
  IconBolt,
  IconCircleCheck,
  IconKeyboard,
  IconMouse,
  IconPalette,
  IconPlug,
  IconPlugOff,
  IconRefresh
} from '@tabler/icons-react'
import {
  DEFAULT_RAZER_THEME,
  type RazerChromaTheme,
  type RazerDetectedDevice,
  type RazerStatus,
  type RazerThemeSettings
} from '../../../shared/razer'
import { RazerIcon } from '../../components/ui/RazerIcon'
import { PageHeader } from '../../components/layout/PageHeader'

const EMPTY_STATUS: RazerStatus = {
  connected: false,
  connecting: false,
  serviceUrl: 'http://localhost:54235/razer/chromasdk',
  sessionUri: null,
  lastError: null,
  lastHeartbeatAt: null,
  devices: [],
  lightingDevices: [],
  supportedTargets: ['keyboard', 'mouse', 'mousepad', 'keypad', 'headset', 'chromalink'],
  theme: DEFAULT_RAZER_THEME
}

const THEME_OPTIONS: Array<{ id: RazerChromaTheme; label: string }> = [
  { id: 'spectrum', label: 'Spectrum' },
  { id: 'static', label: 'Static' },
  { id: 'breathing', label: 'Breathing' },
  { id: 'wave', label: 'Wave' },
  { id: 'reactive', label: 'Reactive' }
]

export default function RazerPage() {
  const [status, setStatus] = useState<RazerStatus>(EMPTY_STATUS)
  const [busyAction, setBusyAction] = useState<'connect' | 'scan' | 'test' | 'theme' | null>(null)

  const visibleDevices = useMemo(() => status.devices, [status.devices])
  const hasKeyboard = visibleDevices.some((device) => device.kind === 'keyboard')
  const hasMouse = visibleDevices.some((device) => device.kind === 'mouse')
  const heartbeatLabel = status.lastHeartbeatAt
    ? `${Math.max(0, Math.round((Date.now() - status.lastHeartbeatAt) / 1000))}s ago`
    : 'Waiting'

  useEffect(() => {
    if (!window.api?.razer) return

    void window.api.razer.getStatus().then(setStatus)
    const unsubscribe = window.api.on?.('razer:status-changed', (nextStatus: unknown) => {
      setStatus(nextStatus as RazerStatus)
    })

    return () => {
      unsubscribe?.()
    }
  }, [])

  const runAction = async (action: 'connect' | 'disconnect' | 'scan' | 'test') => {
    if (!window.api?.razer) return
    setBusyAction(action === 'disconnect' ? 'connect' : action)
    try {
      const nextStatus =
        action === 'connect'
          ? await window.api.razer.connect()
          : action === 'disconnect'
            ? await window.api.razer.disconnect()
            : action === 'scan'
              ? await window.api.razer.scan()
              : await window.api.razer.testEffect()
      setStatus(nextStatus)
    } finally {
      setBusyAction(null)
    }
  }

  const updateTheme = async (themeUpdate: Partial<RazerThemeSettings>) => {
    if (!window.api?.razer) return
    const optimisticTheme = { ...status.theme, ...themeUpdate }
    setStatus((prev) => ({ ...prev, theme: optimisticTheme }))
    setBusyAction('theme')
    try {
      const nextStatus = await window.api.razer.setTheme(themeUpdate)
      setStatus(nextStatus)
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <div className="app-page razer-page">
      <PageHeader
        title="Razer Chroma"
        description="Connect Synapse Chroma SDK and route stream effects to your Razer hardware."
        iconNode={<RazerIcon size={24} />}
        iconClassName="razer-title-icon"
        actionsClassName="razer-actions"
        actions={
          <>
          <button
            type="button"
            className="app-button !h-10 !px-4"
            onClick={() => runAction('scan')}
            disabled={busyAction !== null}
          >
            <IconRefresh size={16} />
            Rescan
          </button>
          <button
            type="button"
            className="app-button !h-10 !px-4"
            onClick={() => runAction('test')}
            disabled={!status.connected || busyAction !== null}
          >
            <IconBolt size={16} />
            Test flash
          </button>
          <button
            type="button"
            className={status.connected ? 'app-button !h-10 !px-4' : 'app-button-primary !h-10 !px-5'}
            onClick={() => runAction(status.connected ? 'disconnect' : 'connect')}
            disabled={busyAction !== null || status.connecting}
          >
            {status.connected ? <IconPlugOff size={16} /> : <IconPlug size={16} />}
            {status.connected ? 'Disconnect' : status.connecting || busyAction === 'connect' ? 'Connecting' : 'Connect SDK'}
          </button>
          </>
        }
      />

      <div className="razer-metrics">
        <Metric
          icon={status.connected ? <IconCircleCheck size={20} /> : <IconAlertTriangle size={20} />}
          label="Chroma SDK"
          value={status.connected ? 'Connected' : status.connecting ? 'Connecting' : 'Offline'}
          sub={status.connected ? 'Session active' : 'Synapse + Chroma Apps required'}
          tone={status.connected ? 'good' : status.lastError ? 'bad' : 'muted'}
        />
        <Metric
          icon={<RazerIcon size={24} />}
          label="Detected hardware"
          value={`${visibleDevices.length}`}
          sub={visibleDevices.length ? 'Windows device scan' : 'No Razer HID devices found'}
          tone={visibleDevices.length ? 'good' : 'muted'}
        />
        <Metric
          icon={<IconActivity size={20} />}
          label="Heartbeat"
          value={heartbeatLabel}
          sub={status.connected ? 'SDK keepalive' : 'No active session'}
          tone={status.connected ? 'good' : 'muted'}
        />
      </div>

      {status.lastError && (
        <div className="razer-alert">
          <IconAlertTriangle size={18} />
          <div>
            <strong>Chroma SDK connection issue</strong>
            <span>{status.lastError}</span>
          </div>
        </div>
      )}

      <section className="app-section-card glass razer-panel razer-theme-panel">
        <div className="app-section-head">
          <div className="flex items-center gap-3">
            <div className="razer-section-icon">
              <IconPalette size={18} />
            </div>
            <div>
              <h2>Chroma Theme</h2>
              <p>Base lighting restores after test flashes and stream-event effects.</p>
            </div>
          </div>
          <span className={busyAction === 'theme' ? 'razer-status-pill' : 'razer-status-pill is-online'}>
            {busyAction === 'theme' ? 'Applying' : status.theme.theme}
          </span>
        </div>

        <div className="razer-theme-body">
          <div className="razer-theme-options">
            {THEME_OPTIONS.map((theme) => (
              <button
                key={theme.id}
                type="button"
                className={`razer-theme-button ${status.theme.theme === theme.id ? 'is-active' : ''}`}
                onClick={() => updateTheme({ theme: theme.id })}
                disabled={busyAction !== null}
              >
                {theme.label}
              </button>
            ))}
          </div>

          <div className="razer-theme-controls">
            <ColorControl
              label="Primary"
              value={status.theme.primaryColor}
              onChange={(value) => updateTheme({ primaryColor: value })}
            />
            <ColorControl
              label="Secondary"
              value={status.theme.secondaryColor}
              onChange={(value) => updateTheme({ secondaryColor: value })}
              disabled={status.theme.theme !== 'breathing'}
            />
            <label className="razer-theme-field">
              <span>Wave</span>
              <select
                className="app-select"
                value={status.theme.waveDirection}
                disabled={status.theme.theme !== 'wave' || busyAction !== null}
                onChange={(event) => updateTheme({ waveDirection: Number(event.currentTarget.value) === 2 ? 2 : 1 })}
              >
                <option value={1}>Left to right</option>
                <option value={2}>Right to left</option>
              </select>
            </label>
            <label className="razer-theme-field">
              <span>Reactive</span>
              <select
                className="app-select"
                value={status.theme.reactiveDuration}
                disabled={status.theme.theme !== 'reactive' || busyAction !== null}
                onChange={(event) => {
                  const duration = Number(event.currentTarget.value)
                  updateTheme({ reactiveDuration: duration === 2 || duration === 3 || duration === 4 ? duration : 1 })
                }}
              >
                <option value={1}>Short</option>
                <option value={2}>Medium</option>
                <option value={3}>Long</option>
                <option value={4}>Extra long</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="app-section-card glass razer-panel">
          <div className="app-section-head">
            <div>
              <h2>Peripheral Discovery</h2>
              <p>Detected devices are mapped to Chroma SDK target classes for stream effects.</p>
            </div>
            <span className={status.connected ? 'razer-status-pill is-online' : 'razer-status-pill'}>
              {status.connected ? 'Ready' : 'Waiting'}
            </span>
          </div>

          <div className="razer-device-grid">
            {visibleDevices.length > 0 ? (
              visibleDevices.map((device) => <DeviceRow key={device.id} device={device} />)
            ) : (
              <div className="razer-empty">
                <RazerIcon size={44} />
                <strong>No Razer devices detected yet</strong>
                <span>
                  Plug in your BlackWidow and Basilisk, open Synapse, then hit Rescan. The SDK can still target virtual
                  keyboard and mouse classes after connecting.
                </span>
              </div>
            )}
          </div>
        </section>

        <section className="app-section-card glass razer-panel">
          <div className="app-section-head">
            <div>
              <h2>Device Targets</h2>
              <p>What ilyStream will drive when an effect runs.</p>
            </div>
          </div>

          <div className="razer-target-list">
            <TargetCheck icon={<IconKeyboard size={18} />} label="BlackWidow keyboard" active={hasKeyboard || status.connected} />
            <TargetCheck icon={<IconMouse size={18} />} label="Basilisk V3 Pro mouse" active={hasMouse || status.connected} />
            <TargetCheck icon={<IconActivity size={18} />} label="Shared alert effects" active={status.connected} />
          </div>

          <div className="razer-help">
            <strong>Need Synapse enabled</strong>
            <span>Razer Synapse must be running with Chroma Apps enabled. If the SDK stays offline, the local REST service on port 54235 is not accepting sessions.</span>
          </div>
        </section>
      </div>
    </div>
  )
}

function ColorControl({
  label,
  value,
  disabled,
  onChange
}: {
  label: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className={`razer-theme-field ${disabled ? 'is-disabled' : ''}`}>
      <span>{label}</span>
      <div className="razer-color-control">
        <input
          type="color"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
          aria-label={`${label} color`}
        />
        <code>{value}</code>
      </div>
    </label>
  )
}

function Metric({
  icon,
  label,
  value,
  sub,
  tone
}: {
  icon: ReactNode
  label: string
  value: string
  sub: string
  tone: 'good' | 'bad' | 'muted'
}) {
  return (
    <div className={`razer-metric is-${tone}`}>
      <div className="razer-metric-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <em>{sub}</em>
      </div>
    </div>
  )
}

function DeviceRow({ device }: { device: RazerDetectedDevice }) {
  const icon = device.kind === 'mouse' ? <IconMouse size={18} /> : <IconKeyboard size={18} />
  return (
    <div className="razer-device-row">
      <div className="razer-device-icon">{icon}</div>
      <div className="min-w-0">
        <strong>{device.name}</strong>
        <span>{device.kind === 'unknown' ? 'Razer device' : `${device.kind} target`} - {device.source}</span>
      </div>
      <span className={device.online ? 'razer-status-pill is-online' : 'razer-status-pill'}>
        {device.online ? 'Online' : 'Offline'}
      </span>
    </div>
  )
}

function TargetCheck({ icon, label, active }: { icon: ReactNode; label: string; active: boolean }) {
  return (
    <div className={`razer-target ${active ? 'is-active' : ''}`}>
      <div>{icon}</div>
      <span>{label}</span>
      {active ? <IconCircleCheck size={16} /> : <IconAlertTriangle size={16} />}
    </div>
  )
}
