import { ipcMain } from 'electron'
import type { DeviceApi } from '../../overlay/device-api'
import type { OverlayServer } from '../../overlay/overlay-server'

export function registerDeviceHandlers(deviceApi: DeviceApi, overlayServer?: OverlayServer): void {
  ipcMain.handle('device:start-pair', async () => {
    await overlayServer?.ensureLanAccess()
    return deviceApi.startPairCode()
  })
  ipcMain.handle('device:list-paired', () => deviceApi.listPairedDevices())
  ipcMain.handle('device:revoke', (_event, id: string) => {
    if (typeof id !== 'string' || !id) return false
    deviceApi.revokeDevice(id)
    return true
  })
}
