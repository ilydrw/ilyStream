import { ipcMain, BrowserWindow, shell, clipboard, app, dialog } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { getWindowsSettingsUri, type WindowsSettingsTarget } from '../../system/windows-settings'
import { installUpdate, checkForUpdatesNow } from '../../services/update-service'

export interface WindowHandlerOptions {
  /** Current recordings folder (honors the user override from Settings). */
  getRecordingsFolder?: () => string
}

export function registerWindowHandlers(window: BrowserWindow, options: WindowHandlerOptions = {}) {
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
  ipcMain.handle('system:check-for-updates', () => checkForUpdatesNow())
  ipcMain.handle('system:copy-to-clipboard', (_event, text: string) => {
    clipboard.writeText(String(text ?? ''))
    return true
  })
  ipcMain.handle('system:open-windows-settings', async (_event, target: WindowsSettingsTarget) => {
    await shell.openExternal(getWindowsSettingsUri(target))
  })

  ipcMain.handle('system:get-app-info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    packaged: app.isPackaged,
    userDataPath: app.getPath('userData'),
    logsPath: app.getPath('logs'),
    recordingsPath: options.getRecordingsFolder?.() || join(app.getPath('videos'), 'ilyStream', 'Recordings'),
    loginItemEnabled: app.getLoginItemSettings().openAtLogin
  }))

  ipcMain.handle('system:set-login-item', (_event, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: Boolean(enabled) })
    return app.getLoginItemSettings().openAtLogin
  })

  // Deliberately allowlisted — the renderer can only open app-owned folders.
  ipcMain.handle('system:open-app-folder', async (_event, target: 'logs' | 'userData' | 'recordings') => {
    const path =
      target === 'logs' ? app.getPath('logs') :
      target === 'userData' ? app.getPath('userData') :
      options.getRecordingsFolder?.() || join(app.getPath('videos'), 'ilyStream', 'Recordings')
    if (target === 'recordings' && !existsSync(path)) mkdirSync(path, { recursive: true })
    const error = await shell.openPath(path)
    return { success: !error, error: error || undefined, path }
  })

  ipcMain.handle('system:choose-folder', async (_event, title?: string) => {
    const result = await dialog.showOpenDialog(window, {
      title: title || 'Choose folder',
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0] ?? null
  })
}
