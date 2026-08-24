import { BrowserWindow, ipcMain, shell } from 'electron'
import type { OBSWorkspaceService } from '../../obs/obs-workspace-service'
import type { OBSIntegrationInstaller } from '../../obs/obs-integration-installer'

export function registerOBSWorkspaceHandlers(
  window: BrowserWindow,
  service: OBSWorkspaceService,
  installer: OBSIntegrationInstaller
): void {
  const focusApp = () => {
    if (window.isDestroyed()) throw new Error('The ilyStream window is no longer available.')
    if (window.isMinimized()) window.restore()
    if (!window.isVisible()) window.show()
    window.focus()
  }

  const openControlCenter = async (pairUrl: string) => {
    await shell.openExternal(pairUrl)
  }

  service.setUiHandlers({ focusApp, openControlCenter })

  ipcMain.handle('obs-workspace:get-access', () => service.getAccess())
  ipcMain.handle('obs-workspace:get-snapshot', () => service.getSnapshot())
  ipcMain.handle('obs-workspace:rotate-pairing', () => service.rotatePairing())
  ipcMain.handle('obs-workspace:open-control-center', async () => {
    const pairUrl = service.getAccess().pairUrl
    if (!pairUrl) throw new Error('The ilyStream Control Center is offline.')
    await openControlCenter(pairUrl)
    return true
  })
  ipcMain.handle('obs-workspace:get-setup-status', () => installer.getStatus())
  ipcMain.handle('obs-workspace:install-theme', () => installer.installTheme())
  ipcMain.handle('obs-workspace:stage-plugin', () => installer.stagePlugin())
  ipcMain.handle('obs-workspace:install-staged-plugin', () => installer.installStagedPlugin())
}
