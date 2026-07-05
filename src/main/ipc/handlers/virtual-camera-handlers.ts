// src/main/ipc/handlers/virtual-camera-handlers.ts
import { BrowserWindow, ipcMain } from 'electron'
import { ServiceRegistry } from '../../services/service-registry'
import { StartVirtualCameraOptions } from '../../../shared/virtual-camera'
import { sendToRenderer } from '../safe-send'

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

  ipcMain.handle('virtualcamera:install-driver', async () => {
    return registry.virtualCameraService.installDriver()
  })

  // Listen for status changes and forward to all windows
  registry.virtualCameraService.on('status-change', (status) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      sendToRenderer(win, 'virtualcamera:status-changed', status)
    })
  })
}
