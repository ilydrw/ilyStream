import { ipcMain } from 'electron'
import type { DeviceApi } from '../../overlay/device-api'

export function registerDeviceHandlers(deviceApi: DeviceApi): void {
  ipcMain.handle('device:start-pair', () => deviceApi.startPairCode())
  ipcMain.handle('device:list-paired', () => deviceApi.listPairedDevices())
  ipcMain.handle('device:revoke', (_event, token: string) => {
    if (typeof token !== 'string' || !token) return false
    deviceApi.revokeDevice(token)
    return true
  })
}
