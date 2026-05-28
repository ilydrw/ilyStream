import { app, BrowserWindow, protocol, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { existsSync, mkdirSync } from 'fs'
import { ServiceRegistry } from './services/service-registry'
import { registerIpcHandlers } from './ipc/handlers'
import { setupEventForwarding } from './ipc/events'
import { setupLogger } from './lib/logger'
import { setupAutoUpdates, disposeAutoUpdates } from './services/update-service'
import { sendToRenderer } from './ipc/safe-send'
import { registerAssetProtocol } from './lib/asset-protocol'
import { reportFatalError, buildStartupErrorHtml, writeCrashLog } from './lib/crash-reporter'
import { openExternalSafely, isSameOriginUrl, isProductionAppFileUrl } from './lib/url-handler'

// Global logger setup
setupLogger()

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  console.log('[main] Another instance is already running. Quitting...')
  app.exit(0)
} else {
  app.on('second-instance', () => {
    showMainWindow()
  })
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
// Chromium's Windows Media Foundation backend can spam native stderr with
// per-frame camera buffer warnings even when the stream recovers. Keep those
// native logs from drowning out ilyStream's own diagnostics.
app.commandLine.appendSwitch('log-level', '3')
if (is.dev) {
  app.commandLine.appendSwitch('disable-http-cache')
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
  app.commandLine.appendSwitch('disk-cache-size', '0')
  app.commandLine.appendSwitch('media-cache-size', '0')
}

// Global service registry
let services: ServiceRegistry | null = null
let initPromise: Promise<void> = Promise.resolve()
let startupError: unknown = null

// Register asset scheme as privileged before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'asset',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      stream: true
    }
  }
])

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let healthWatchdogTimer: ReturnType<typeof setInterval> | null = null
let historyPruneTimer: ReturnType<typeof setInterval> | null = null
let isQuitting = false

function getMainWindow(): BrowserWindow | null {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = null
    return null
  }

  return mainWindow
}

function showMainWindow(): void {
  const window = getMainWindow()

  if (!window) {
    if (app.isReady() && !isQuitting) createWindow()
    return
  }

  if (window.isMinimized()) window.restore()
  if (!window.isVisible()) window.show()
  window.focus()
}

function resolveBundledResource(...segments: string[]): string | null {
  const candidates = [
    join(__dirname, '../../resources', ...segments),
    join(app.getAppPath(), 'resources', ...segments),
    join(process.resourcesPath, ...segments),
    join(process.resourcesPath, 'resources', ...segments),
    join(process.cwd(), 'resources', ...segments)
  ]

  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

function createAppIcon() {
  const iconPath = resolveBundledResource('ilyStream-AppIcon.ico')
  return iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty()
}

process.on('uncaughtException', (error) => {
  reportFatalError('Uncaught exception', error, mainWindow, startupError)
})

process.on('unhandledRejection', (reason) => {
  reportFatalError('Unhandled promise rejection', reason, mainWindow, startupError)
})

function createWindow(): void {
  const icon = createAppIcon()

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    backgroundColor: '#0f1115',
    icon: icon.isEmpty() ? undefined : icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })
  const createdWindow = mainWindow

  // Lock window to 16:10 aspect ratio
  mainWindow.setAspectRatio(1280 / 800)

  mainWindow.on('closed', () => {
    if (mainWindow === createdWindow) mainWindow = null
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()

    console.log('[main] UI visible. Initializing services in background...')
    initPromise.then(() => {
        console.log('[main] Services initialized successfully.')
        startHealthWatchdog()
      })
      .catch((error) => {
        console.error('[main] Services failed to initialize:', error)
      })
  })

  mainWindow.on('unresponsive', () => {
    console.error('[main] Main window became unresponsive.')
  })

  mainWindow.on('responsive', () => {
    console.log('[main] Main window recovered from unresponsive state.')
  })

  mainWindow.webContents.on('console-message', (event) => {
    const details = event as Electron.Event & {
      level?: number | string
      message?: string
      line?: number
      lineNumber?: number
      sourceId?: string
    }
    const logLevel = details.level ?? 'info'
    const logMessage = details.message ?? ''
    const logLine = details.lineNumber ?? details.line
    const logSource = details.sourceId
    const label = typeof logLevel === 'number'
      ? ['debug', 'info', 'warning', 'error'][logLevel] || 'log'
      : logLevel
    console.log(`[renderer:${label}] ${logMessage}${logSource ? ` (${logSource}:${logLine})` : ''}`)
  })

  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error(`[main] Preload failed at ${preloadPath}:`, error)
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[main] Main renderer exited: ${details.reason} (${details.exitCode})`)
  })

  mainWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
    console.error(`[main] Window failed to load: ${errorCode} ${errorDescription} at ${validatedURL}`)
  })

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[main] Window finished loading content.')
  })

  const loadUrl = is.dev && process.env['ELECTRON_RENDERER_URL']
    ? (process.env['ELECTRON_RENDERER_URL'].endsWith('/') ? process.env['ELECTRON_RENDERER_URL'] : process.env['ELECTRON_RENDERER_URL'] + '/')
    : join(__dirname, '../renderer/index.html')

  mainWindow.webContents.setWindowOpenHandler((details) => {
    openExternalSafely(details.url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isAppNavigation = is.dev && process.env['ELECTRON_RENDERER_URL']
      ? isSameOriginUrl(url, loadUrl)
      : isProductionAppFileUrl(url, loadUrl)

    if (isAppNavigation) return

    event.preventDefault()
    openExternalSafely(url)
  })

  console.log(`[main] Loading URL: ${loadUrl}`)

  // Set up IPC and events using the registry
  if (!services || startupError) {
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildStartupErrorHtml(startupError || 'Services unavailable'))}`)
    return
  }

  registerIpcHandlers(mainWindow, services)
  setupEventForwarding(mainWindow, services)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(loadUrl)
  } else {
    mainWindow.loadFile(loadUrl)
  }
}

function createTray(): void {
  const icon = createAppIcon()
  if (icon.isEmpty()) return
  tray = new Tray(icon)
  tray.setToolTip('ilyStream')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show', click: () => showMainWindow() },
      { label: 'Quit', click: () => app.quit() }
    ])
  )
  tray.on('double-click', () => showMainWindow())
}

app.whenReady().then(async () => {
  if (!gotTheLock) return

  try {
    services = new ServiceRegistry()
    initPromise = services.initialize()
  } catch (error) {
    startupError = error
    writeCrashLog('Service registry construction failed', error)
    const failedInitPromise = Promise.reject(error)
    failedInitPromise.catch(() => {})
    initPromise = failedInitPromise
  }
  electronApp.setAppUserModelId('com.ilystream.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Ensure directories exist
  const appData = app.getPath('userData')
  const dirs = ['assets', 'sounds', 'temp']
  dirs.forEach(d => {
    const p = join(appData, d)
    if (!existsSync(p)) mkdirSync(p, { recursive: true })
  })

  registerAssetProtocol()
  createTray()
  console.log('[main] Creating main window...')
  createWindow()

  // Initialize auto-updates (handled in background)
  setupAutoUpdates(() => mainWindow)

  console.log('[main] Application ready.')

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      showMainWindow()
    }
  })

  startHistoryPrune()
})

function startHistoryPrune(): void {
  if (historyPruneTimer) return
  historyPruneTimer = setInterval(() => services?.db?.pruneEventHistory(), 60 * 60 * 1000)
}

function startHealthWatchdog(): void {
  if (healthWatchdogTimer) return

  healthWatchdogTimer = setInterval(() => {
    if (sendToRenderer(mainWindow, 'system:ping')) {
      console.log('[watchdog] Sent ping to renderer.')
    }
  }, 60000)
}

function stopBackgroundTimers(): void {
  if (historyPruneTimer) {
    clearInterval(historyPruneTimer)
    historyPruneTimer = null
  }
  if (healthWatchdogTimer) {
    clearInterval(healthWatchdogTimer)
    healthWatchdogTimer = null
  }
}

app.on('window-all-closed', () => {
})

app.on('before-quit', (event) => {
  if (isQuitting) return
  isQuitting = true
  event.preventDefault()
  stopBackgroundTimers()
  disposeAutoUpdates()
  void (async () => {
    try {
      if (services) await services.dispose()
    } finally {
      app.exit(0)
    }
  })()
})
