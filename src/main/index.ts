import { app, shell, BrowserWindow, protocol, Tray, Menu, nativeImage, net } from 'electron'
import { isAbsolute, join, relative, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { existsSync, mkdirSync } from 'fs'
import { stat } from 'fs/promises'
import { pathToFileURL } from 'url'
import { ServiceRegistry } from './services/service-registry'
import { registerIpcHandlers } from './ipc/handlers'
import { setupEventForwarding } from './ipc/events'
import { setupLogger } from './lib/logger'
import { setupAutoUpdates, disposeAutoUpdates } from './services/update-service'

// Global logger setup
setupLogger()

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

// Global service registry
let services: ServiceRegistry
let initPromise: Promise<void>

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

function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' || url.protocol === 'mailto:') return true
    if (url.protocol !== 'http:') return false
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  } catch {
    return false
  }
}

function isSameOriginUrl(value: string, baseUrl: string): boolean {
  try {
    return new URL(value).origin === new URL(baseUrl).origin
  } catch {
    return false
  }
}

function openExternalSafely(value: string): void {
  if (!isSafeExternalUrl(value)) {
    console.warn(`[main] Blocked unsafe external URL: ${value}`)
    return
  }

  void shell.openExternal(value)
}

function isSafePathWithin(root: string, filePath: string): boolean {
  const relativePath = relative(resolve(root), resolve(filePath))
  return relativePath !== '' && !relativePath.startsWith('..') && !isAbsolute(relativePath)
}

function resolveAssetPath(root: string, assetId: string): string | null {
  const filePath = resolve(root, assetId)
  return isSafePathWithin(root, filePath) ? filePath : null
}

async function isReadableFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile()
  } catch {
    return false
  }
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

  // Lock window to 16:10 aspect ratio
  mainWindow.setAspectRatio(1280 / 800)

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()

    console.log('[main] UI visible. Initializing services in background...')
    initPromise.then(() => {
        console.log('[main] Services initialized successfully.')
        // Start health watchdog after services are up
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

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    // Electron 30+ uses a single object for params. Earlier versions use multiple arguments.
    let logMessage = message
    let logLevel = level
    let logLine = line
    let logSource = sourceId

    if (typeof level === 'object' && level !== null) {
      const details = level as any
      logLevel = details.level
      logMessage = details.message
      logLine = details.line
      logSource = details.sourceId
    }

    const label = ['debug', 'info', 'warning', 'error'][logLevel as number] || 'log'
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
  registerIpcHandlers(mainWindow, services)
  setupEventForwarding(mainWindow, services)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(loadUrl)
  } else {
    mainWindow.loadFile(loadUrl)
  }
}

function isProductionAppFileUrl(value: string, loadUrl: string): boolean {
  try {
    const url = new URL(value)
    const appUrl = new URL(pathToFileURL(loadUrl).toString())
    return url.protocol === 'file:' && url.pathname === appUrl.pathname
  } catch {
    return false
  }
}

function createTray(): void {
  const icon = createAppIcon()
  if (icon.isEmpty()) return
  tray = new Tray(icon)
  tray.setToolTip('ilyStream')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show', click: () => mainWindow?.show() },
      { label: 'Quit', click: () => app.quit() }
    ])
  )
  tray.on('double-click', () => mainWindow?.show())
}

function registerAssetProtocol(): void {
  protocol.handle('asset', async (request) => {
    try {
      const url = new URL(request.url)
      let assetId = decodeURIComponent(url.hostname + url.pathname)
      assetId = assetId.replace(/^\/+/, '').replace(/\/+$/, '')

      if (assetId.startsWith('app/')) {
        assetId = assetId.slice(4)
      }

      console.log(`[AssetProtocol] Resolving: ${assetId}`)

      let assetPath: string | null = null
      // 1. AppData Assets (Try root, then sounds/assets subdirs)
      const userData = app.getPath('userData')
      const userRoots = [
        userData,
        join(userData, 'sounds'),
        join(userData, 'assets')
      ]

      for (const root of userRoots) {
        const filePath = resolveAssetPath(root, assetId)
        if (filePath && await isReadableFile(filePath)) {
          assetPath = filePath
          break
        }
      }

      // 4. Resources
      if (!assetPath) {
        const resourceRoots = [
          join(__dirname, '../../resources'),
          join(app.getAppPath(), 'resources'),
          process.resourcesPath,
          join(process.resourcesPath, 'resources'),
          join(process.cwd(), 'resources')
        ]
        for (const root of resourceRoots) {
          const filePath = resolveAssetPath(root, assetId)
          if (filePath && await isReadableFile(filePath)) {
            assetPath = filePath
            break
          }
        }
      }

      if (assetPath) {
        return net.fetch(pathToFileURL(assetPath).toString())
      }

      console.warn(`[AssetProtocol] Asset not found: ${assetId}`)
      return new Response('Not Found', { status: 404 })
    } catch (err) {
      console.error('[AssetProtocol] Error:', err)
      return new Response('Internal Error', { status: 500 })
    }
  })
}

app.whenReady().then(async () => {
  services = new ServiceRegistry(); initPromise = services.initialize();
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
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
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
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('system:ping')
      
      // We don't wait for a response here to avoid blocking main
      // but we can log the attempt.
      console.log('[watchdog] Sent ping to renderer.')
    }
  }, 60000) // Ping every minute
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
  // Minimize to tray behavior could go here, but app.quit() is requested for now
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





