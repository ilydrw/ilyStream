import { ipcMain, BrowserWindow } from 'electron'
import { SpotifyService } from '../../spotify/spotify-service'
import { sendToRenderer } from '../safe-send'

export function registerSpotifyHandlers(
  window: BrowserWindow,
  spotifyService: SpotifyService
) {
  const emitSpotifyStatus = () => {
    sendToRenderer(window, 'spotify:status-changed', spotifyService.getStatus())
  }

  const emitSpotifyQueue = () => {
    sendToRenderer(window, 'spotify:queue-update', spotifyService.getQueue())
  }

  const emitNowPlaying = () => {
    sendToRenderer(window, 'spotify:now-playing', spotifyService.getNowPlaying())
  }

  spotifyService.on('status', emitSpotifyStatus)
  spotifyService.on('queue-update', emitSpotifyQueue)
  spotifyService.on('now-playing', emitNowPlaying)

  ipcMain.handle('spotify:connect', async (_event, clientId: string) => {
    return spotifyService.connect(clientId)
  })

  ipcMain.handle('spotify:disconnect', async () => {
    await spotifyService.disconnect()
  })

  ipcMain.handle('spotify:get-status', () => spotifyService.getStatus())
  ipcMain.handle('spotify:get-queue', () => spotifyService.getQueue())
  ipcMain.handle('spotify:remove-from-queue', (_event, requestId: string) => {
    spotifyService.removeFromQueue(requestId)
  })
  ipcMain.handle('spotify:clear-queue', () => {
    spotifyService.clearQueue()
  })
  ipcMain.handle('spotify:skip', async () => {
    await spotifyService.skip()
  })
}
