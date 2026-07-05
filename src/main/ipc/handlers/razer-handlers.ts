import { BrowserWindow, ipcMain } from 'electron'
import type { RazerChromaService } from '../../services/razer-chroma-service'
import type { RazerThemeSettings } from '../../../shared/razer'
import { sendToRenderer } from '../safe-send'

export function registerRazerHandlers(window: BrowserWindow, razerService: RazerChromaService): void {
  ipcMain.handle('razer:get-status', () => razerService.getStatus())

  ipcMain.handle('razer:connect', async () => {
    return razerService.connect()
  })

  ipcMain.handle('razer:disconnect', async () => {
    return razerService.disconnect()
  })

  ipcMain.handle('razer:scan', async () => {
    await razerService.scan()
    return razerService.getStatus()
  })

  ipcMain.handle('razer:test-effect', async () => {
    return razerService.testEffect()
  })

  ipcMain.handle('razer:set-theme', async (_event, theme: Partial<RazerThemeSettings>) => {
    return razerService.setTheme(theme)
  })

  razerService.on('status-changed', (status) => {
    sendToRenderer(window, 'razer:status-changed', status)
  })
}
