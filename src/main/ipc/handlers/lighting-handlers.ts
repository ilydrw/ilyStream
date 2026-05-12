// src/main/ipc/handlers/lighting-handlers.ts
import { ipcMain, BrowserWindow } from 'electron'
import { LightingManagerService } from '../../services/lighting/lighting-manager'

export function registerLightingHandlers(
  window: BrowserWindow,
  lightingManager: LightingManagerService
): void {
  ipcMain.handle('lighting:get-state', () => {
    return lightingManager.getState()
  })

  ipcMain.handle('lighting:scan', async () => {
    await lightingManager.scanAll()
    return lightingManager.getState()
  })

  ipcMain.handle('lighting:execute-action', async (_event, deviceId, action, params) => {
    await lightingManager.executeAction(deviceId, action, params)
    return { success: true }
  })

  lightingManager.on('state-change', (state) => {
    if (!window.isDestroyed()) {
      window.webContents.send('lighting:state-changed', state)
    }
  })
}
