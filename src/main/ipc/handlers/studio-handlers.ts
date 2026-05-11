import { ipcMain, BrowserWindow, desktopCapturer, screen, session, nativeImage } from 'electron'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { Database } from '../../db/database'
import { OverlayServer } from '../overlay/overlay-server'
import { BrowserSourceService, type BrowserSourceCaptureConfig } from '../../services/browser-source-service'

let pendingDisplayMediaRequest: {
  sourceId: string
  withAudio: boolean
  audioOnly: boolean
  forceLoopback?: boolean
} | null = null

function resolveBundledResource(...segments: string[]): string | null {
  const candidates = [
    join(__dirname, '../../resources', ...segments),
    join(process.resourcesPath, ...segments),
    join(process.resourcesPath, 'resources', ...segments),
    join(process.cwd(), 'resources', ...segments)
  ]

  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

export function registerStudioHandlers(db: Database, overlayServer: OverlayServer, browserSourceService: BrowserSourceService) {
  const projectorWindows = new Set<BrowserWindow>()
  const ownerCleanupHandlers = new WeakMap<BrowserWindow, () => void>()

  // Deck Actions
  ipcMain.handle('studio:get-deck-actions', () => db.getAllDeckActions())
  ipcMain.handle('studio:save-deck-action', (_event, action) => {
    const result = db.saveDeckAction(action)
    overlayServer.broadcastWidgetUpdate('deck', 'manual')
    return result
  })
  ipcMain.handle('studio:delete-deck-action', (_event, id) => {
    const result = db.deleteDeckAction(id)
    overlayServer.broadcastWidgetUpdate('deck', 'manual')
    return result
  })

  // Get all available monitors
  ipcMain.handle('studio:get-monitors', () => {
    return screen.getAllDisplays().map(display => ({
      id: display.id,
      label: display.label || `Monitor ${display.id}`,
      bounds: display.bounds,
      isPrimary: display.id === screen.getPrimaryDisplay().id
    }))
  })

  ipcMain.handle('studio:get-desktop-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 280, height: 158 },
      fetchWindowIcons: true
    })

    return sources.map(source => ({
      id: source.id,
      name: source.name,
      displayId: source.display_id,
      appIcon: source.appIcon?.isEmpty() ? null : source.appIcon?.toDataURL(),
      thumbnail: source.thumbnail.isEmpty() ? null : source.thumbnail.toDataURL(),
      type: source.id.startsWith('screen:') ? 'screen' : 'window'
    }))
  })

  ipcMain.handle('studio:prepare-display-capture', async (_event, request: { sourceId?: string; withAudio?: boolean; audioOnly?: boolean; forceLoopback?: boolean }) => {
    const sourceId = typeof request?.sourceId === 'string' ? request.sourceId : ''
    if (!sourceId) return { success: false, error: 'No desktop source selected' }
    const source = await findDesktopSource(sourceId)
    if (!source) return { success: false, error: `Desktop source is no longer available: ${sourceId}` }

    pendingDisplayMediaRequest = {
      sourceId,
      withAudio: request?.withAudio === true,
      audioOnly: request?.audioOnly === true,
      forceLoopback: request?.forceLoopback === true
    }
    return { success: true, source: { id: source.id, name: source.name } }
  })

  ipcMain.handle('studio:find-spotify-source', async () => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['window'] })
      const handles = getSpotifyWindowHandles()
      for (const handle of handles) {
        const match = sources.find(s => sourceMatchesWindowHandle(s.id, handle))
        if (match) {
          console.log(`[SpotifySource] Found window via handle: ${match.name} (${match.id})`)
          return { id: match.id, name: match.name }
        }
      }
      const nameMatch = sources.find(s => s.name.toLowerCase().includes('spotify'))
      if (nameMatch) {
        console.log(`[SpotifySource] Found window via name match: ${nameMatch.name} (${nameMatch.id})`)
        return { id: nameMatch.id, name: nameMatch.name }
      }
      if (handles.length > 0) {
        console.warn('[SpotifySource] Spotify handle found but no matching window in desktopCapturer.')
      } else {
        console.log('[SpotifySource] No Spotify window found in desktopCapturer.')
      }
      return null
    } catch (err) {
      console.error('[SpotifySource] Error finding Spotify source:', err)
      return null
    }
  })

  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    const pending = pendingDisplayMediaRequest
    pendingDisplayMediaRequest = null
    let callbackCalled = false

    const safeCallback = (result: any) => {
      if (callbackCalled) return
      callbackCalled = true
      callback(result)
    }

    // Fallback: If no pending request, maybe it's a direct getDisplayMedia call without preparation
    if (!pending) {
      console.warn('[StudioHandlers] getDisplayMedia called without preparation. Returning empty.')
      safeCallback({})
      return
    }

    try {
      const sources = await desktopCapturer.getSources({ 
        types: ['screen', 'window'], 
        fetchWindowIcons: false,
        thumbnailSize: { width: 0, height: 0 } // Performance
      })
      
      const source = sources.find(s => s.id === pending.sourceId)
      
      let audioSource: 'loopback' | 'loopbackWithMute' | undefined
      if (pending.withAudio) {
        // We use loopbackWithMute to prevent the IlyStream application's own
        // audio output (like TTS or mixer monitoring) from being captured
        // back into the desktop/app audio stream, which causes doubling and
        // feedback loops.
        audioSource = 'loopbackWithMute'
        
        if (source && source.id.startsWith('window:')) {
          console.log(`[StudioHandlers] Using loopbackWithMute for isolated window capture: ${source.name}`)
        }
      }

      if (!source) {
        console.warn(`[StudioHandlers] Requested source ${pending.sourceId} not found. Available: ${sources.length}`)
        safeCallback({})
        return
      }

      console.log(`[StudioHandlers] Serving display media request: video=${source.name}, audio=${audioSource || 'none'}`)

      safeCallback({
        video: source,
        audio: audioSource,
        enableLocalEcho: false // Setting to false reduces processing overhead and prevents jitter
      })
    } catch (err) {
      console.error('[StudioHandlers] Display media request failed:', err)
      safeCallback({})
    }
  }, { useSystemPicker: false })

  // Open fullscreen projector
  ipcMain.handle('studio:open-projector', async (event, payload: { monitorId: number, sceneId: string, aspectRatio?: string, layerId?: string }) => {
    console.log('[StudioHandlers] Opening Projector Payload:', payload)
    const { monitorId, sceneId, aspectRatio = '16:9', layerId } = payload
    
    if (!sceneId) {
      console.error('[StudioHandlers] Cannot open projector: Missing sceneId')
      return false
    }

    const displays = screen.getAllDisplays()
    const targetDisplay = displays.find(d => d.id === monitorId) || screen.getPrimaryDisplay()
    console.log('[StudioHandlers] Target Display Bounds:', targetDisplay.bounds)

    const iconPath = resolveBundledResource('ilyStream-AppIcon.ico')
    const icon = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty()

    const projectorWindow = new BrowserWindow({
      x: targetDisplay.bounds.x,
      y: targetDisplay.bounds.y,
      width: targetDisplay.bounds.width,
      height: targetDisplay.bounds.height,
      title: 'ilyStream Program Projector',
      icon: icon.isEmpty() ? undefined : icon,
      fullscreen: true,
      autoHideMenuBar: true,
      frame: false,
      backgroundColor: '#000000',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    projectorWindows.add(projectorWindow)
    projectorWindow.once('closed', () => projectorWindows.delete(projectorWindow))
    
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (owner && !ownerCleanupHandlers.has(owner)) {
      const closeAllProjectors = () => {
        for (const win of projectorWindows) {
          if (!win.isDestroyed()) win.close()
        }
        projectorWindows.clear()
      }
      ownerCleanupHandlers.set(owner, closeAllProjectors)
      owner.once('close', closeAllProjectors)
    }

    const encodedSceneId = encodeURIComponent(String(sceneId || ''))
    const query = `?projectorSceneId=${encodedSceneId}&aspectRatio=${encodeURIComponent(aspectRatio)}${layerId ? `&projectorLayerId=${encodeURIComponent(layerId)}` : ''}`

    const loadUrl = is.dev && process.env['ELECTRON_RENDERER_URL']
      ? `${process.env['ELECTRON_RENDERER_URL']}${query}`
      : `file://${join(__dirname, '../renderer/index.html')}${query}`

    console.log('[StudioHandlers] Loading Projector URL:', loadUrl)
    await projectorWindow.loadURL(loadUrl)

    projectorWindow.once('ready-to-show', () => {
      projectorWindow.show()
      projectorWindow.focus()
    })

    // Close on Escape, and allow F11 to escape fullscreen if focus ever gets weird.
    projectorWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'Escape') {
        event.preventDefault()
        projectorWindow.close()
      } else if (input.key === 'F11') {
        event.preventDefault()
        projectorWindow.setFullScreen(!projectorWindow.isFullScreen())
      }
    })

    return true
  })

  ipcMain.handle('studio:browser-source:start', (event, config: BrowserSourceCaptureConfig) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner) return { success: false, error: 'No renderer window is available' }
    browserSourceService.start(owner, config)
    return { success: true }
  })

  ipcMain.handle('studio:browser-source:update', (event, config: BrowserSourceCaptureConfig) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner) return { success: false, error: 'No renderer window is available' }
    browserSourceService.update(owner, config)
    return { success: true }
  })

  ipcMain.handle('studio:browser-source:reload', (event, id: string) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner) return { success: false, error: 'No renderer window is available' }
    browserSourceService.reload(owner, id)
    return { success: true }
  })

  ipcMain.handle('studio:browser-source:stop', (event, id: string) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner) return { success: false, error: 'No renderer window is available' }
    browserSourceService.stop(owner, id)
    return { success: true }
  })

  // Persistence
  ipcMain.handle('studio:save-state', (_event, state) => {
    console.log('[StudioHandlers] Saving state to DB...')
    db.setSetting('studio_state_v1', state)
    return true
  })

  ipcMain.handle('studio:load-state', () => {
    console.log('[StudioHandlers] Loading state from DB...')
    return db.getSetting('studio_state_v1')
  })
}

async function findDesktopSource(sourceId: string) {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    fetchWindowIcons: false,
    thumbnailSize: { width: 0, height: 0 }
  })
  return sources.find(source => source.id === sourceId) || null
}

function getSpotifyWindowHandles(): string[] {
  try {
    const output = execFileSync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command',
      'Get-Process -Name Spotify -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object { $_.MainWindowHandle }; exit 0'
    ], { encoding: 'utf8', timeout: 5000, windowsHide: true }).trim()

    return output.split(/\r?\n/).map(handle => handle.trim()).filter(Boolean)
  } catch (err) {
    console.warn('[SpotifySource] Unable to query Spotify process handles:', err instanceof Error ? err.message : err)
    return []
  }
}

function sourceMatchesWindowHandle(sourceId: string, handle: string): boolean {
  const parts = sourceId.split(':')
  return sourceId === `window:${handle}` || (parts[0] === 'window' && parts[1] === handle)
}
