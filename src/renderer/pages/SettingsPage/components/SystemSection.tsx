import { useEffect, useRef, useState } from 'react'
import {
  IconDownload,
  IconFolder,
  IconInfoCircle,
  IconPower,
  IconRefresh,
  IconUpload
} from '@tabler/icons-react'
import { Toggle } from '../../../components/ui/Inputs'
import type { AppSettings } from '../../../../shared/app-settings'
import { SettingRow } from './SettingsShared'
import { useUIStore } from '../../../stores/ui-store'

interface AppInfo {
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
  packaged: boolean
  userDataPath: string
  logsPath: string
  recordingsPath: string
  loginItemEnabled: boolean
}

interface SystemSectionProps {
  settings: AppSettings
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}

export function SystemSection({ settings, onUpdate }: SystemSectionProps) {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [loginItem, setLoginItem] = useState(false)
  const [updateFeedback, setUpdateFeedback] = useState<string | null>(null)
  const [importFeedback, setImportFeedback] = useState<string | null>(null)
  const updateStatus = useUIStore((s) => s.updateStatus)
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void window.api.system.getAppInfo?.().then((info: AppInfo) => {
      setAppInfo(info)
      setLoginItem(info.loginItemEnabled)
    }).catch(() => {})
  }, [])

  const handleCheckUpdates = async () => {
    setUpdateFeedback('Checking…')
    const result = await window.api.system.checkForUpdates()
    setUpdateFeedback(result.ok ? null : result.message || 'Update check failed')
  }

  const handleToggleLoginItem = async (enabled: boolean) => {
    const applied = await window.api.system.setLoginItem(enabled)
    setLoginItem(Boolean(applied))
  }

  const handleChooseRecordingsFolder = async () => {
    const folder = await window.api.system.chooseFolder('Choose recordings folder')
    if (folder) onUpdate('recordingsFolder', folder)
  }

  const handleExportSettings = async () => {
    const all = await window.api.settings.getAll()
    const payload = {
      exportedAt: new Date().toISOString(),
      appVersion: appInfo?.version,
      settings: all
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ilystream-settings-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleImportSettings = async (file: File) => {
    setImportFeedback(null)
    try {
      const parsed = JSON.parse(await file.text())
      const imported = parsed?.settings
      if (!imported || typeof imported !== 'object') {
        throw new Error('Not an ilyStream settings export')
      }
      await window.api.settings.setMany(imported)
      setImportFeedback(`Imported ${Object.keys(imported).length} settings.`)
    } catch (err) {
      setImportFeedback(err instanceof Error ? err.message : 'Import failed')
    }
  }

  const updateStateLabel = (() => {
    switch (updateStatus?.state) {
      case 'checking': return 'Checking for updates…'
      case 'available': return `Downloading v${updateStatus.version}…`
      case 'download-progress': return `Downloading… ${updateStatus.percent ?? 0}%`
      case 'downloaded': return `v${updateStatus.version} ready — restarts on quit`
      case 'not-available': return 'Up to date'
      case 'error': return updateStatus.message || 'Update error'
      default: return appInfo?.packaged ? 'Auto-checks every 4 hours' : 'Disabled in development'
    }
  })()

  return (
    <section className="app-section-card glass">
      <div className="app-section-head">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center text-accent">
            <IconInfoCircle size={32} />
          </div>
          <div>
            <h2>System</h2>
            <p>Version, startup, storage locations, and settings backup.</p>
          </div>
        </div>
        {appInfo && (
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold tracking-tight text-white/50">
            v{appInfo.version} · Electron {appInfo.electron}
          </span>
        )}
      </div>

      <div className="app-section-content !p-0">
        <div className="p-8">
          <SettingRow label="Updates" hint={updateStateLabel}>
            <div className="flex items-center gap-3">
              {updateStatus?.state === 'downloaded' && (
                <button onClick={() => window.api.system.installUpdate()} className="app-button-primary !h-10 !px-4 text-xs">
                  Restart & Install
                </button>
              )}
              <button onClick={handleCheckUpdates} className="app-button !h-10 !px-4 text-xs flex items-center gap-2">
                <IconRefresh size={14} />
                Check now
              </button>
            </div>
          </SettingRow>
          {updateFeedback && <p className="mb-4 text-xs font-semibold text-warning">{updateFeedback}</p>}

          <SettingRow label="Launch at startup" hint="Start ilyStream automatically when you sign in to Windows.">
            <div className="flex items-center gap-3">
              <IconPower size={16} className={loginItem ? 'text-success' : 'text-white/20'} />
              <Toggle value={loginItem} onChange={(value) => void handleToggleLoginItem(value)} />
            </div>
          </SettingRow>

          <SettingRow
            label="Recordings folder"
            hint={settings.recordingsFolder || appInfo?.recordingsPath || 'Videos\\ilyStream\\Recordings'}
          >
            <div className="flex items-center gap-2">
              {settings.recordingsFolder && (
                <button
                  onClick={() => onUpdate('recordingsFolder', '')}
                  className="app-button !h-10 !px-3 text-xs"
                  title="Reset to the default folder"
                >
                  Reset
                </button>
              )}
              <button onClick={() => void window.api.system.openAppFolder('recordings')} className="app-button !h-10 !px-3 text-xs" title="Open folder">
                <IconFolder size={14} />
              </button>
              <button onClick={() => void handleChooseRecordingsFolder()} className="app-button !h-10 !px-4 text-xs">
                Change…
              </button>
            </div>
          </SettingRow>

          <SettingRow label="App folders" hint="Open the log and data directories for troubleshooting.">
            <div className="flex items-center gap-2">
              <button onClick={() => void window.api.system.openAppFolder('logs')} className="app-button !h-10 !px-4 text-xs">
                Logs
              </button>
              <button onClick={() => void window.api.system.openAppFolder('userData')} className="app-button !h-10 !px-4 text-xs">
                App data
              </button>
            </div>
          </SettingRow>

          <SettingRow label="Settings backup" hint="Export everything to a JSON file, or restore from a previous export.">
            <div className="flex items-center gap-2">
              <button onClick={() => void handleExportSettings()} className="app-button !h-10 !px-4 text-xs flex items-center gap-2">
                <IconDownload size={14} />
                Export
              </button>
              <button onClick={() => importInputRef.current?.click()} className="app-button !h-10 !px-4 text-xs flex items-center gap-2">
                <IconUpload size={14} />
                Import
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void handleImportSettings(file)
                  event.target.value = ''
                }}
              />
            </div>
          </SettingRow>
          {importFeedback && <p className="mt-2 text-xs font-semibold text-accent">{importFeedback}</p>}
        </div>
      </div>
    </section>
  )
}
