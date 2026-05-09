import { ipcMain } from 'electron'
import { HueService } from '../../hue/hue-service'
import { GoveeService } from '../../services/govee-service'

export function registerHueHandlers(hueService: HueService, goveeService?: GoveeService) {
  ipcMain.handle('hue:discover-bridges', () => hueService.discoverBridges())
  ipcMain.handle('hue:connect', (_event, ip: string, username: string) => hueService.connect(ip, username))
  ipcMain.handle('hue:save-username', (_event, username: string) => hueService.saveUsername(username))
  ipcMain.handle('hue:get-lights', () => hueService.getLights())
  ipcMain.handle('hue:get-groups', () => hueService.getGroups())
  ipcMain.handle('hue:trigger-flash', async (_event, color) => {
    await Promise.allSettled([
      hueService.triggerFlash(color),
      goveeService?.triggerFlash(color)
    ])
  })
  ipcMain.handle('hue:trigger-strobe', async (_event, durationMs: number) => {
    await Promise.allSettled([
      hueService.triggerStrobe(durationMs),
      goveeService?.triggerStrobe(durationMs)
    ])
  })
  ipcMain.handle('hue:set-safety-lock', (_event, locked: boolean) => hueService.setSafetyLock(locked))
  ipcMain.handle('hue:set-selected-lights', (_event, ids: string[]) => hueService.setSelectedLights(ids))
  ipcMain.handle('hue:get-status', () => hueService.getStatus())
}
