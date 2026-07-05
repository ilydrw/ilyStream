import { BrowserWindow, ipcMain } from 'electron'
import { GoveeService } from '../../services/govee-service'
import type {
  GoveeBleDevicePickerItem,
  GoveeBleDeviceRecord,
  GoveeBleProtocol
} from '../../../shared/govee-ble'
import { sendToRenderer } from '../safe-send'

export function registerGoveeHandlers(window: BrowserWindow, goveeService: GoveeService) {
  let selectBluetoothCallback: ((deviceId: string) => void) | null = null

  window.webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault()
    selectBluetoothCallback = callback
    const devices: GoveeBleDevicePickerItem[] = deviceList.map((device) => ({
      deviceId: device.deviceId,
      deviceName: device.deviceName || 'Unnamed Bluetooth device'
    }))
    sendToRenderer(window, 'govee:ble-device-list', devices)
  })

  ipcMain.handle('govee:connect', async (_event, apiKey: string) => {
    return await goveeService.connect(apiKey)
  })

  ipcMain.handle('govee:disconnect', async () => {
    await goveeService.disconnect()
    return true
  })

  ipcMain.handle('govee:get-status', () => {
    return goveeService.getStatus()
  })

  ipcMain.handle('govee:get-devices', async (_event, forceRefresh = false) => {
    return await goveeService.getGoveeDevices(forceRefresh)
  })

  ipcMain.handle('govee:set-selected-devices', (_event, ids: string[]) => {
    goveeService.setSelectedDevices(ids)
    return goveeService.getStatus()
  })

  ipcMain.handle('govee:test-strobe', async () => {
    return await goveeService.triggerStrobe(2000)
  })

  ipcMain.handle('govee:ble-select-device', (_event, deviceId: string) => {
    if (!selectBluetoothCallback) return false
    selectBluetoothCallback(deviceId)
    selectBluetoothCallback = null
    return true
  })

  ipcMain.handle('govee:ble-cancel-selection', () => {
    if (!selectBluetoothCallback) return false
    selectBluetoothCallback('')
    selectBluetoothCallback = null
    sendToRenderer(window, 'govee:ble-device-list', [])
    return true
  })

  ipcMain.handle('govee:ble-get-devices', () => {
    return goveeService.getBleDevices()
  })

  ipcMain.handle('govee:ble-register-device', (_event, device: GoveeBleDeviceRecord) => {
    return goveeService.registerBleDevice(device)
  })

  ipcMain.handle('govee:ble-update-status', (_event, payload: { device: string; connected: boolean; lastError?: string }) => {
    return goveeService.updateBleDeviceStatus(payload)
  })

  ipcMain.handle('govee:ble-set-protocol', (_event, payload: { deviceId: string; protocol: GoveeBleProtocol }) => {
    return goveeService.setBleDeviceProtocol(payload.deviceId, payload.protocol)
  })

  ipcMain.handle('govee:ble-remove-device', (_event, deviceId: string) => {
    return goveeService.removeBleDevice(deviceId)
  })
}
