import { ipcMain, BrowserWindow, desktopCapturer, screen, session, nativeImage } from 'electron'
import { join } from 'path'
import { execFileSync } from 'child_process'
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

export function registerStudioHandlers(db: Database, overlayServer: OverlayServer, browserSourceService: BrowserSourceService) {
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

  ipcMain.handle('studio:prepare-display-capture', (_event, request: { sourceId?: string; withAudio?: boolean; audioOnly?: boolean; forceLoopback?: boolean }) => {
    const sourceId = typeof request?.sourceId === 'string' ? request.sourceId : ''
    if (!sourceId) return { success: false, error: 'No desktop source selected' }
    pendingDisplayMediaRequest = {
      sourceId,
      withAudio: request?.withAudio === true,
      audioOnly: request?.audioOnly === true,
      forceLoopback: request?.forceLoopback === true
    }
    return { success: true }
  })

  ipcMain.handle('studio:find-spotify-source', async () => {
    try {
      const output = execFileSync('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-Command',
        'Get-Process Spotify -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowHandle -ne 0} | Select-Object -ExpandProperty MainWindowHandle'
      ], { encoding: 'utf8', timeout: 5000, windowsHide: true }).trim()

      if (!output) {
        console.log('[SpotifySource] No Spotify process found with MainWindowHandle.')
        return null
      }
      const handles = output.split(/\r?\n/).map(h => h.trim()).filter(Boolean)
      if (handles.length === 0) return null

      const sources = await desktopCapturer.getSources({ types: ['window'] })
      for (const handle of handles) {
        const match = sources.find(s => s.id === `window:${handle}` || s.id.endsWith(`:${handle}`))
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
      console.warn('[SpotifySource] Spotify handle found but no matching window in desktopCapturer.')
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
  ipcMain.handle('studio:open-projector', async (_event, { monitorId, sceneId }) => {
    const displays = screen.getAllDisplays()
    const targetDisplay = displays.find(d => d.id === monitorId) || screen.getPrimaryDisplay()

    const iconPath = join(__dirname, '../../resources/ilyStream-AppIcon.ico')
    const icon = nativeImage.createFromPath(iconPath)
    
    const projectorWindow = new BrowserWindow({
      x: targetDisplay.bounds.x,
      y: targetDisplay.bounds.y,
      width: targetDisplay.bounds.width,
      height: targetDisplay.bounds.height,
      title: 'ilyStream Program Projector',
      icon: icon,
      fullscreen: true,
      autoHideMenuBar: true,
      frame: false,
      skipTaskbar: false,
      backgroundColor: '#000000',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        backgroundThrottling: false
      }
    })

    const encodedSceneId = encodeURIComponent(String(sceneId || ''))
    const loadUrl = is.dev && process.env['ELECTRON_RENDERER_URL']
      ? `${process.env['ELECTRON_RENDERER_URL']}?projectorSceneId=${encodedSceneId}`
      : `file://${join(__dirname, '../renderer/index.html')}?projectorSceneId=${encodedSceneId}`

    await projectorWindow.loadURL(loadUrl)

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
