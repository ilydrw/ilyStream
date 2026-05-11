// src/main/ipc/handlers/virtual-camera-handlers.ts
import { ipcMain } from 'electron'
import { ServiceRegistry } from '../../services/service-registry'
import { StartVirtualCameraOptions } from '../../../shared/virtual-camera'

export function registerVirtualCameraHandlers(registry: ServiceRegistry) {
  ipcMain.handle('virtualcamera:start', async (_, options?: StartVirtualCameraOptions) => {
    return registry.virtualCameraService.start(options)
  })

  ipcMain.handle('virtualcamera:stop', async () => {
    return registry.virtualCameraService.stop()
  })

  ipcMain.handle('virtualcamera:get-status', async () => {
    return registry.virtualCameraService.getStatus()
  })

  // Listen for status changes and forward to all windows
  registry.virtualCameraService.on('status-change', (status) => {
    // Note: We need a way to find all windows. 
    // Usually, this is handled by a window manager or by broadcasting to all BrowserWindow instances.
    const { BrowserWindow } = require('electron')
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('virtualcamera:status-changed', status)
    })
  })
}
