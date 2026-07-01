import { ipcMain } from 'electron'
import type { DeviceApi } from '../../overlay/device-api'

export function registerDeviceHandlers(deviceApi: DeviceApi): void {
  ipcMain.handle('device:start-pair', () => deviceApi.startPairCode())
  ipcMain.handle('device:list-paired', () => deviceApi.listPairedDevices())
  ipcMain.handle('device:revoke', (_event, id: string) => {
    if (typeof id !== 'string' || !id) return false
    deviceApi.revokeDevice(id)
    return true
  })
}
