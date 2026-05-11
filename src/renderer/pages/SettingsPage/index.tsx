import {IconMovie, IconDatabase, IconDevices, IconPalette, IconDeviceFloppy, IconWifi} from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { DEFAULT_APP_SETTINGS, resolveAppSettings, type AppSettings } from '../../../shared/app-settings'
import type { OBSRuntimeStatus } from '../../../shared/obs'
import type { OverlayRuntimeStatus } from '../../../shared/overlay'
import { applyAppAppearance } from '../../lib/app-appearance'
import { Metric, OBSStatusBadge, StatusBadge } from './components/SettingsShared'
import { OBSRemoteSection } from './components/OBSRemoteSection'
import { OverlayHubSection } from './components/OverlayHubSection'
import { AutomationSection } from './components/AutomationSection'
import { PersonalizationSection } from './components/PersonalizationSection'
import { StudioRuntimeSection } from './components/StudioRuntimeSection'
import { BroadcastDefaultsSection } from './components/BroadcastDefaultsSection'

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)
  const [saved, setSaved] = useState(false)
  const [overlayStatus, setOverlayStatus] = useState<OverlayRuntimeStatus | null>(null)
  const [obsStatus, setObsStatus] = useState<OBSRuntimeStatus | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

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
      setSettings(resolved)
      applyAppAppearance(resolved)
      setIsInitialized(true)
    })
    loadOverlayStatus()
    loadOBSStatus()

    const settingsUnsubscribe = window.api.on('settings:changed', (nextSettings: unknown) => {
      const resolved = resolveAppSettings(nextSettings as Partial<Record<keyof AppSettings, unknown>>)
      setSettings(resolved)
      applyAppAppearance(resolved)
      loadOverlayStatus()
      loadOBSStatus()
    })
    const overlayUnsubscribe = window.api.on('overlay:status-changed', (status: unknown) => {
      setOverlayStatus(status as OverlayRuntimeStatus)
    })
    const obsUnsubscribe = window.api.on('obs:status-changed', (status: unknown) => {
      setObsStatus(status as OBSRuntimeStatus)
    })
    const statusTimer = window.setInterval(loadOverlayStatus, 3000)

    return () => {
      settingsUnsubscribe()
      overlayUnsubscribe()
      obsUnsubscribe()
      window.clearInterval(statusTimer)
    }
  }, [])

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    if (!isInitialized) return
    
    setSettings((prev) => {
      const next = resolveAppSettings({ ...prev, [key]: value })
      applyAppAppearance(next)
      
      // Auto-save
      void window.api.settings.setMany({ [key]: value }).then(() => {
        setSaved(true)
        setTimeout(() => setSaved(false), 1000)
      })
      
      return next
    })
  }

  const handleSave = async () => {
    await window.api.settings.setMany(settings)
    const status = (await window.api.overlay.getStatus()) as OverlayRuntimeStatus
    setOverlayStatus(status)
    const nextObsStatus = (await window.api.obs.getStatus()) as OBSRuntimeStatus
    setObsStatus(nextObsStatus)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
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

  return (
    <div className="app-page">
      <header className="app-page-header">
        <div className="flex items-center gap-6">
          <div className="flex items-center justify-center">
            <IconDevices size={32} className="text-accent" />
          </div>
          <div>
            <h1>Studio Settings</h1>
            <p className="app-page-intro">
              Premium controls for the app shell, stream runtime, local overlay delivery,
              OBS automation, and outbound broadcast defaults.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <StatusBadge status={overlayStatus} />
          <OBSStatusBadge status={obsStatus} />
          <button onClick={handleSave} className="app-button-primary !h-12 !px-8">
            <IconDeviceFloppy size={18} className="mr-2" />
            {saved ? 'Settings Synced' : 'Save Changes'}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4 mb-20">
        <Metric icon={<IconPalette size={24} className="text-accent" />} label="Theme" value={settings.theme} />
        <Metric icon={<IconDatabase size={24} className="text-success" />} label="Message Buffer" value={`${settings.chatMaxMessages}`} />
        <Metric icon={<IconWifi size={24} className="text-warning" />} label="OBS Remote" value={`${settings.obsHost}`} />
        <Metric icon={<IconMovie size={24} className="text-accent" />} label="Broadcast" value={`${settings.streamingWidth}x${settings.streamingHeight}`} />
      </div>

      <div className="grid grid-cols-1 gap-10 2xl:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)]">
        <div className="flex flex-col gap-10">
          <PersonalizationSection settings={settings} onUpdate={updateSetting} />
          <StudioRuntimeSection settings={settings} onUpdate={updateSetting} />
          <BroadcastDefaultsSection settings={settings} onUpdate={updateSetting} />
          <AutomationSection settings={settings} onUpdate={updateSetting} />
        </div>

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
    </div>
  )
}
