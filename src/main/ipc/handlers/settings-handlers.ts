import { ipcMain, BrowserWindow } from 'electron'
import { Database } from '../../db/database'
import { OverlayServer } from '../../overlay/overlay-server'
import { OBSService } from '../../obs/obs-service'
import { AppSettingKey, resolveAppSettings, resolveAppSetting } from '../../../shared/app-settings'

export function registerSettingsHandlers(
  window: BrowserWindow,
  db: Database,
  overlayServer: OverlayServer,
  obsService: OBSService,
  applyRuntimeSettings: () => Promise<void>,
  emitSettingsChanged: () => void,
  emitOBSStatusChanged: () => void,
  updateSetting: <K extends AppSettingKey>(key: K, value: unknown) => Promise<unknown>
) {
  ipcMain.handle('settings:get', (_event, key: AppSettingKey) => {
    return resolveAppSettings(db.getAllSettings())[key]
  })
  ipcMain.handle('settings:set', (_event, key: AppSettingKey, value) => {
    console.log(`[ipc] settings:set key=${key}`)
    return updateSetting(key, value)
  })
  ipcMain.handle('settings:set-many', async (_event, settings: Record<string, any>) => {
    console.log(`[ipc] settings:set-many received ${Object.keys(settings).length} keys`);
    for (const [key, value] of Object.entries(settings)) {
      const k = key as AppSettingKey
      const resolved = resolveAppSetting(k, value);
      console.log(`  [ipc] setting updated: ${key}`);
      db.setSetting(k, resolved)
    }
    await applyRuntimeSettings()
    emitSettingsChanged()
    return true
  })
  ipcMain.handle('settings:get-all', () => resolveAppSettings(db.getAllSettings()))

  ipcMain.on('settings:get-sync', (event, key: AppSettingKey) => {
    event.returnValue = resolveAppSettings(db.getAllSettings())[key]
  })

  ipcMain.handle('obs:get-status', () => obsService.getStatus())
  ipcMain.handle('obs:reconnect', async () => {
    const status = await obsService.reconnect()
    emitOBSStatusChanged()
    return status
  })
  ipcMain.handle('obs:start-virtual-camera', async () => {
    const status = await obsService.startVirtualCamera()
    emitOBSStatusChanged()
    return status
  })
  ipcMain.handle('obs:stop-virtual-camera', async () => {
    const status = await obsService.stopVirtualCamera()
    emitOBSStatusChanged()
    return status
  })
  ipcMain.handle('obs:toggle-virtual-camera', async () => {
    const status = await obsService.toggleVirtualCamera()
    emitOBSStatusChanged()
    return status
  })
}
