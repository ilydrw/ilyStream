import { ipcMain } from 'electron'
import { RemoteAuthService } from '../../services/remote-auth-service'

export function registerRemoteAuthHandlers(remoteAuthService: RemoteAuthService): void {
  ipcMain.handle('remote:get-tokens', () => {
    return remoteAuthService.getAllTokens()
  })

  ipcMain.handle('remote:generate-token', (_event, label: string) => {
    return remoteAuthService.generateToken(label)
  })

  ipcMain.handle('remote:revoke-token', (_event, token: string) => {
    remoteAuthService.revokeToken(token)
    return { success: true }
  })
}
