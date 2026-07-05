import { ipcMain } from 'electron'
import { RemoteAuthService } from '../../services/remote-auth-service'

export function registerRemoteAuthHandlers(remoteAuthService: RemoteAuthService): void {
  ipcMain.handle('remote:get-tokens', () => {
    return remoteAuthService.listTokenSummaries()
  })

  ipcMain.handle('remote:generate-token', (_event, label: string) => {
    return remoteAuthService.generateToken(label)
  })

  ipcMain.handle('remote:revoke-token', (_event, id: string) => {
    remoteAuthService.revokeTokenByIdOrToken(id)
    return { success: true }
  })
}
