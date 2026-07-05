import { ipcMain, BrowserWindow } from 'electron'
import { Database } from '../../db/database'
import { OverlayServer } from '../../overlay/overlay-server'
import { OBSService } from '../../obs/obs-service'
import { AppSettingKey, isAllowedAppSettingKey, resolveAppSettings, resolveAppSetting } from '../../../shared/app-settings'

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
    if (!isAllowedAppSettingKey(key)) return undefined
    return resolveAppSettings(db.getAllSettings())[key]
  })
  ipcMain.handle('settings:set', (_event, key: AppSettingKey, value) => {
    console.log(`[ipc] settings:set key=${key}`)
    return updateSetting(key, value)
  })
  ipcMain.handle('settings:set-many', async (_event, settings: Record<string, any>) => {
    if (!isSettingsRecord(settings)) {
      throw new Error('settings:set-many expects a settings object')
    }

    const entries = Object.entries(settings)
    if (entries.length > 1000) {
      throw new Error('settings:set-many received too many keys')
    }

    console.log(`[ipc] settings:set-many received ${entries.length} keys`);
    for (const [key, value] of entries) {
      if (!isAllowedAppSettingKey(key)) {
        console.warn(`[ipc] ignored unsupported setting key: ${key}`)
        continue
      }
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
    if (!isAllowedAppSettingKey(key)) {
      event.returnValue = undefined
      return
    }
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

function isSettingsRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
