import { app, BrowserWindow } from 'electron'
import log from 'electron-log'
import { autoUpdater } from 'electron-updater'

type UpdateState =
  | 'checking'
  | 'available'
  | 'not-available'
  | 'download-progress'
  | 'downloaded'
  | 'error'

type UpdatePayload = {
  state: UpdateState
  version?: string
  percent?: number
  message?: string
}

const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000
let updateTimer: ReturnType<typeof setInterval> | null = null
let configured = false

function emitUpdateStatus(getWindow: () => BrowserWindow | null, payload: UpdatePayload): void {
  const window = getWindow()
  if (!window || window.isDestroyed()) return
  window.webContents.send('system:update-status', payload)
}

function scheduleUpdateCheck(getWindow: () => BrowserWindow | null): void {
  const check = (): void => {
    void autoUpdater.checkForUpdates().catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[updates] Check failed: ${message}`)
      emitUpdateStatus(getWindow, { state: 'error', message })
    })
  }

  setTimeout(check, 15000)
  updateTimer = setInterval(check, UPDATE_CHECK_INTERVAL_MS)
}

export function setupAutoUpdates(getWindow: () => BrowserWindow | null): void {
  if (configured) return
  configured = true

  if (!app.isPackaged) {
    console.log('[updates] Skipping updater in development mode.')
    return
  }

  autoUpdater.logger = log
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false

  autoUpdater.on('checking-for-update', () => {
    console.log('[updates] Checking for updates...')
    emitUpdateStatus(getWindow, { state: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    console.log(`[updates] Update available: ${info.version}`)
    emitUpdateStatus(getWindow, { state: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', (info) => {
    console.log(`[updates] No update available. Current release: ${info.version}`)
    emitUpdateStatus(getWindow, { state: 'not-available', version: info.version })
  })

  autoUpdater.on('download-progress', (progress) => {
    emitUpdateStatus(getWindow, {
      state: 'download-progress',
      percent: Number(progress.percent.toFixed(1))
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[updates] Update ${info.version} downloaded; it will install when ilyStream quits.`)
    emitUpdateStatus(getWindow, { state: 'downloaded', version: info.version })
  })

  autoUpdater.on('error', (error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[updates] ${message}`)
    emitUpdateStatus(getWindow, { state: 'error', message })
  })

  scheduleUpdateCheck(getWindow)
}

export function disposeAutoUpdates(): void {
  if (!updateTimer) return
  clearInterval(updateTimer)
  updateTimer = null
}
