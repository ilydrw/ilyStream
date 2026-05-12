import { ipcMain } from 'electron'
import { GoveeService } from '../../services/govee-service'

export function registerGoveeHandlers(goveeService: GoveeService) {
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
}
