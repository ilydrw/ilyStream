import { ipcMain, BrowserWindow, dialog } from 'electron'
import { AssetService } from '../../system/asset-service'
import { Database } from '../../db/database'
import { AppSettingKey, resolveAppSettings } from '../../../shared/app-settings'

const EVENT_IMAGE_SETTING_KEYS: AppSettingKey[] = [
  'eventImageGiftAssetId',
  'eventImageFollowAssetId',
  'eventImageSuperfanAssetId'
]

export function registerAssetHandlers(
  window: BrowserWindow,
  assetService: AssetService,
  db: Database,
  applyRuntimeSettings: () => Promise<void>,
  emitSettingsChanged: () => void
) {
  ipcMain.handle('assets:images:get-all', () => assetService.getAllImages())
  ipcMain.handle('assets:images:pick-file', async () => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Choose an image asset',
      properties: ['openFile'],
      filters: [{ name: 'Image files', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
    })

    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  ipcMain.handle('assets:images:upload', (_event, path: string) => assetService.uploadImage(path))
  ipcMain.handle('assets:images:delete', (_event, id: string) => assetService.deleteAsset(id))
  ipcMain.handle('assets:images:rename', async (_event, id: string, newName: string) => {
    const result = await assetService.renameAsset(id, newName)
    const settings = resolveAppSettings(db.getAllSettings())
    let changed = false
    
    for (const key of EVENT_IMAGE_SETTING_KEYS) {
      if (settings[key] === id) {
        db.setSetting(key, result.id)
        changed = true
      }
    }
    
    if (changed) {
      await applyRuntimeSettings()
      emitSettingsChanged()
    }
    return result
  })
}
