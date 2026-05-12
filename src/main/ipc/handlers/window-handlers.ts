import { ipcMain, BrowserWindow, shell } from 'electron'
import { getWindowsSettingsUri, type WindowsSettingsTarget } from '../../system/windows-settings'
import { installUpdate } from '../../services/update-service'

export function registerWindowHandlers(window: BrowserWindow) {
  ipcMain.handle('window:minimize', () => window.minimize())
  ipcMain.handle('window:maximize', () => {
    if (window.isMaximized()) {
      window.unmaximize()
    } else {
      window.maximize()
    }
  })
  ipcMain.handle('window:close', () => window.hide())
  ipcMain.handle('system:install-update', () => installUpdate())
  ipcMain.handle('system:open-windows-settings', async (_event, target: WindowsSettingsTarget) => {
    await shell.openExternal(getWindowsSettingsUri(target))
  })
}
