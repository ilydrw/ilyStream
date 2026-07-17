import {
  IconBolt,
  IconDatabase,
  IconDevices,
  IconHeartbeat,
  IconMovie,
  IconPalette,
  IconServer,
  IconTerminal2,
  IconVolume,
  IconWifi
} from '@tabler/icons-react'
import { IconDeviceFloppy } from '../../components/ui/icons'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Toggle } from '../../components/ui/Inputs'
import {
  DEFAULT_APP_SETTINGS,
  getAppThemeLabel,
  resolveAppSettings,
  type AppSettings
} from '../../../shared/app-settings'
import type { OBSRuntimeStatus } from '../../../shared/obs'
import type { OverlayRuntimeStatus } from '../../../shared/overlay'
import { applyAppAppearance } from '../../lib/app-appearance'
import { Metric, OBSStatusBadge, SettingRow, StatusBadge, TextInput } from './components/SettingsShared'
import { OBSRemoteSection } from './components/OBSRemoteSection'
import { OverlayHubSection } from './components/OverlayHubSection'
import { AutomationSection } from './components/AutomationSection'
import { PersonalizationSection } from './components/PersonalizationSection'
import { StudioRuntimeSection } from './components/StudioRuntimeSection'
import { BroadcastDefaultsSection } from './components/BroadcastDefaultsSection'
import { IntelligenceSection } from './components/IntelligenceSection'
import { ConsoleSection } from './components/ConsoleSection'
import { SystemSection } from './components/SystemSection'
import { PageHeader } from '../../components/layout/PageHeader'

type SettingsTabId = 'basic' | 'system' | 'streaming' | 'audio' | 'automation' | 'advanced'

const SETTINGS_TABS = [
  { id: 'basic', label: 'Appearance', icon: IconPalette },
  { id: 'system', label: 'System', icon: IconDevices },
  { id: 'streaming', label: 'Streaming', icon: IconMovie },
  { id: 'audio', label: 'Audio', icon: IconVolume },
  { id: 'automation', label: 'Automation', icon: IconBolt },
  { id: 'advanced', label: 'Advanced', icon: IconTerminal2 }
] satisfies Array<{ id: SettingsTabId; label: string; icon: typeof IconPalette }>

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)
  const [saved, setSaved] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [overlayStatus, setOverlayStatus] = useState<OverlayRuntimeStatus | null>(null)
  const [obsStatus, setObsStatus] = useState<OBSRuntimeStatus | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [activeTab, setActiveTab] = useState<SettingsTabId>('basic')
  const persistedSettingsRef = useRef<AppSettings>(DEFAULT_APP_SETTINGS)
  const draftSettingsRef = useRef<AppSettings>(DEFAULT_APP_SETTINGS)
  const isDirtyRef = useRef(false)
  const isSavingRef = useRef(false)

  useEffect(() => {
    if (!window.api?.settings) return

    const loadOverlayStatus = () => {
      void window.api.overlay.getStatus().then((status: OverlayRuntimeStatus) => {
        setOverlayStatus(status)
      })
    }

    const loadOBSStatus = () => {
      void window.api.obs.getStatus().then((status: OBSRuntimeStatus) => {
        setObsStatus(status)
      })
    }

    void window.api.settings.getAll().then((all: AppSettings) => {
      const resolved = resolveAppSettings(all)
      persistedSettingsRef.current = resolved
      draftSettingsRef.current = resolved
      setSettings(resolved)
      applyAppAppearance(resolved.ui)
      setIsInitialized(true)
    })
    loadOverlayStatus()
    loadOBSStatus()

    const settingsUnsubscribe = window.api.on('settings:changed', (nextSettings: unknown) => {
      const resolved = resolveAppSettings(nextSettings as Partial<Record<keyof AppSettings, unknown>>)
      persistedSettingsRef.current = resolved

      const currentDraft = draftSettingsRef.current
      const draftStillDiffers = !settingsEqual(currentDraft, resolved)
      if (isSavingRef.current || !isDirtyRef.current || !draftStillDiffers) {
        draftSettingsRef.current = resolved
        isDirtyRef.current = false
        setSettings(resolved)
        setIsDirty(false)
        applyAppAppearance(resolved.ui)
      } else {
        // Runtime actions such as "Save & Connect" may persist one subset of
        // settings. Keep unrelated local edits intact until the user saves or
        // discards the page-wide draft.
        applyAppAppearance(currentDraft.ui)
      }

      loadOverlayStatus()
      loadOBSStatus()
    })
    const overlayUnsubscribe = window.api.on('overlay:status-changed', (status: unknown) => {
      setOverlayStatus(status as OverlayRuntimeStatus)
    })
    const obsUnsubscribe = window.api.on('obs:status-changed', (status: unknown) => {
      setObsStatus(status as OBSRuntimeStatus)
    })
    const statusTimer = window.setInterval(() => {
      loadOverlayStatus()
      loadOBSStatus()
    }, 3000)

    return () => {
      settingsUnsubscribe()
      overlayUnsubscribe()
      obsUnsubscribe()
      window.clearInterval(statusTimer)
      applyAppAppearance(persistedSettingsRef.current.ui)
    }
  }, [])

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    updateSettings({ [key]: value })
  }

  const updateSettings = (updates: Partial<AppSettings>) => {
    if (!isInitialized) return

    const next = resolveAppSettings({ ...draftSettingsRef.current, ...updates })
    const dirty = !settingsEqual(next, persistedSettingsRef.current)
    draftSettingsRef.current = next
    isDirtyRef.current = dirty
    setSettings(next)
    setIsDirty(dirty)
    applyAppAppearance(next.ui)
    setSaved(false)
  }

  const handleSave = async () => {
    if (!isDirty || isSaving) return
    isSavingRef.current = true
    setIsSaving(true)
    try {
      await window.api.settings.setMany(settings)
      const persisted = resolveAppSettings(await window.api.settings.getAll())
      persistedSettingsRef.current = persisted
      draftSettingsRef.current = persisted
      isDirtyRef.current = false
      setSettings(persisted)
      setIsDirty(false)
      applyAppAppearance(persisted.ui)

      const status = (await window.api.overlay.getStatus()) as OverlayRuntimeStatus
      setOverlayStatus(status)
      const nextObsStatus = (await window.api.obs.getStatus()) as OBSRuntimeStatus
      setObsStatus(nextObsStatus)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      isSavingRef.current = false
      setIsSaving(false)
    }
  }

  const handleDiscard = () => {
    const persisted = persistedSettingsRef.current
    draftSettingsRef.current = persisted
    isDirtyRef.current = false
    setSettings(persisted)
    setIsDirty(false)
    setSaved(false)
    applyAppAppearance(persisted.ui)
  }

  const handleOBSConnect = async () => {
    await window.api.settings.setMany({
      obsEnabled: settings.obsEnabled,
      obsHost: settings.obsHost,
      obsPort: settings.obsPort,
      obsPassword: settings.obsPassword
    })
    const status = (await window.api.obs.reconnect()) as OBSRuntimeStatus
    setObsStatus(status)
  }

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'basic':
        return (
          <div className="grid grid-cols-1 gap-10 2xl:grid-cols-[minmax(0,1fr)_minmax(440px,0.82fr)]">
            <PersonalizationSection settings={settings} onUpdate={updateSetting} onUpdateMany={updateSettings} />
            <StudioRuntimeSection settings={settings} onUpdate={updateSetting} />
          </div>
        )
      case 'system':
        return <SystemSection settings={settings} onUpdate={updateSetting} />
      case 'streaming':
        return (
          <div className="grid grid-cols-1 gap-10 2xl:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)]">
            <BroadcastDefaultsSection settings={settings} onUpdate={updateSetting} />
            <div className="flex flex-col gap-10">
              <OBSRemoteSection
                settings={settings}
                obsStatus={obsStatus}
                onUpdate={updateSetting}
                onConnect={handleOBSConnect}
              />
              <OverlayHubSection
                settings={settings}
                overlayStatus={overlayStatus}
                onUpdate={updateSetting}
              />
            </div>
          </div>
        )
      case 'audio':
        return <AudioRoutingSection settings={settings} onUpdate={updateSetting} />
      case 'automation':
        return (
          <div className="grid grid-cols-1 gap-10 2xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
            <AutomationSection settings={settings} onUpdate={updateSetting} />
            <IntelligenceSection settings={settings} onUpdate={updateSetting} />
          </div>
        )
      case 'advanced':
        return <ConsoleSection />
      default:
        return null
    }
  }

  return (
    <div className="app-page">
      <PageHeader
        title="Settings"
        description="App defaults, broadcast output, audio routing, automation, and runtime diagnostics."
        icon={IconDevices}
        actions={
          <>
          <StatusBadge status={overlayStatus} />
          <OBSStatusBadge status={obsStatus} />
          {isDirty ? (
            <button onClick={handleDiscard} className="app-button !h-12 !px-5">
              Discard
            </button>
          ) : null}
          <button
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            className="app-button-primary !h-12 !px-8"
          >
            <IconDeviceFloppy size={18} className="mr-2" />
            {isSaving ? 'Saving…' : saved ? 'Settings synced' : isDirty ? 'Save changes' : 'Saved'}
          </button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4 mb-20">
        <Metric icon={<IconPalette size={24} className="text-accent" />} label="Theme" value={getAppThemeLabel(settings.theme)} />
        <Metric icon={<IconDatabase size={24} className="text-success" />} label="Message buffer" value={`${settings.chatMaxMessages}`} />
        <Metric icon={<IconWifi size={24} className="text-warning" />} label="OBS remote" value={`${settings.obsHost}`} />
        <Metric icon={<IconMovie size={24} className="text-accent" />} label="Broadcast" value={`${settings.streamingWidth}x${settings.streamingHeight}`} />
      </div>

      <RuntimeHealthPanel settings={settings} overlayStatus={overlayStatus} obsStatus={obsStatus} />

      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="app-segment">
          {SETTINGS_TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`app-segment-btn !h-9 !px-4 ${activeTab === tab.id ? 'is-active' : ''}`}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {renderActiveTab()}
    </div>
  )
}

function RuntimeHealthPanel({
  settings,
  overlayStatus,
  obsStatus
}: {
  settings: AppSettings
  overlayStatus: OverlayRuntimeStatus | null
  obsStatus: OBSRuntimeStatus | null
}) {
  const overlayOk = Boolean(overlayStatus?.running && !overlayStatus.lastError)
  const obsRequired = settings.integrations.obs.enabled
  const obsOk = !obsRequired || Boolean(obsStatus?.connected)
  const streamReady = !settings.streaming.enabled || Boolean(settings.streaming.rtmpUrl && settings.streaming.streamKey)
  const audioReady = Boolean(settings.tts.enabled || settings.alerts.gift.soundEnabled || settings.alerts.follow.soundEnabled)

  return (
    <section className="app-section-card glass mb-10">
      <div className="app-section-head">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center text-accent">
            <IconHeartbeat size={28} />
          </div>
          <div>
            <h2>Setup Health</h2>
            <p>Connection and runtime checks for the pieces that usually break first.</p>
          </div>
        </div>
      </div>
      <div className="settings-health-grid">
        <HealthItem
          icon={<IconServer size={16} />}
          label="Overlay Server"
          value={overlayOk ? `Port ${overlayStatus?.port}` : overlayStatus?.lastError || 'Offline'}
          tone={overlayOk ? 'good' : 'bad'}
        />
        <HealthItem
          icon={<IconMovie size={16} />}
          label="OBS remote"
          value={obsRequired ? (obsStatus?.connected ? 'Connected' : obsStatus?.connecting ? 'Connecting' : 'Needs attention') : 'Optional'}
          tone={obsOk ? 'good' : 'muted'}
        />
        <HealthItem
          icon={<IconWifi size={16} />}
          label="Stream Output"
          value={streamReady ? (settings.streaming.enabled ? 'Ready' : 'Standby') : 'Missing key'}
          tone={streamReady ? 'good' : 'bad'}
        />
        <HealthItem
          icon={<IconVolume size={16} />}
          label="Audio"
          value={audioReady ? `TTS ${Math.round(settings.tts.volume * 100)}%` : 'Muted'}
          tone={audioReady ? 'good' : 'muted'}
        />
      </div>
    </section>
  )
}

function HealthItem({
  icon,
  label,
  value,
  tone
}: {
  icon: ReactNode
  label: string
  value: string
  tone: 'good' | 'bad' | 'muted'
}) {
  return (
    <div className={`settings-health-item is-${tone}`}>
      <div className="settings-health-icon">{icon}</div>
      <div className="min-w-0">
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </div>
  )
}

function AudioRoutingSection({
  settings,
  onUpdate
}: {
  settings: AppSettings
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}) {
  return (
    <section className="app-section-card glass">
      <div className="app-section-head">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center text-accent">
            <IconVolume size={32} />
          </div>
          <div>
            <h2>Audio Routing</h2>
            <p>TTS output, alert sound toggles, and global playback target.</p>
          </div>
        </div>
      </div>

      <div className="app-section-content !p-0">
        <div className="p-8">
          <SettingRow label="Text-to-Speech" hint="Master switch for chat and event speech playback.">
            <Toggle value={settings.tts.enabled} onChange={(value) => onUpdate('ttsEnabled', value)} />
          </SettingRow>

          <SettingRow label={`TTS Volume - ${Math.round(settings.tts.volume * 100)}%`} hint="Controls generated speech before it reaches the mixer.">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.tts.volume}
              onChange={(event) => onUpdate('ttsVolume', Number(event.currentTarget.value))}
              className="w-64 accent-accent"
            />
          </SettingRow>

          <SettingRow label="Output Device" hint="Use default for the system playback device, or paste a browser device id.">
            <TextInput
              value={settings.audio.outputDeviceId || 'default'}
              onChange={(value) => onUpdate('audioOutputDeviceId', value || 'default')}
              placeholder="default"
            />
          </SettingRow>

          <div className="grid grid-cols-1 gap-4 pt-6 lg:grid-cols-3">
            <EventSoundQuickControl
              label="Gift Sounds"
              enabled={settings.alerts.gift.soundEnabled}
              volume={settings.alerts.gift.soundVolume}
              onEnabled={(value) => onUpdate('eventSoundGiftEnabled', value)}
              onVolume={(value) => onUpdate('eventSoundGiftVolume', value)}
            />
            <EventSoundQuickControl
              label="Follow Sounds"
              enabled={settings.alerts.follow.soundEnabled}
              volume={settings.alerts.follow.soundVolume}
              onEnabled={(value) => onUpdate('eventSoundFollowEnabled', value)}
              onVolume={(value) => onUpdate('eventSoundFollowVolume', value)}
            />
            <EventSoundQuickControl
              label="Superfan Sounds"
              enabled={settings.alerts.superfan.soundEnabled}
              volume={settings.alerts.superfan.soundVolume}
              onEnabled={(value) => onUpdate('eventSoundSuperfanEnabled', value)}
              onVolume={(value) => onUpdate('eventSoundSuperfanVolume', value)}
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function EventSoundQuickControl({
  label,
  enabled,
  volume,
  onEnabled,
  onVolume
}: {
  label: string
  enabled: boolean
  volume: number
  onEnabled: (value: boolean) => void
  onVolume: (value: number) => void
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-5">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-white">{label}</p>
          <p className="text-[10px] font-semibold tracking-tight text-white/25">{Math.round(volume * 100)}%</p>
        </div>
        <Toggle value={enabled} onChange={onEnabled} />
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        disabled={!enabled}
        onChange={(event) => onVolume(Number(event.currentTarget.value))}
        className="w-full accent-accent disabled:opacity-30"
      />
    </div>
  )
}

function settingsEqual(a: AppSettings, b: AppSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
