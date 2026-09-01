import type { BrowserWindow } from 'electron'
import { RemoteAuthService } from '../../services/remote-auth-service'
import { secureHandle } from '../secure-handle'

export function registerRemoteAuthHandlers(window: BrowserWindow, remoteAuthService: RemoteAuthService): void {
  secureHandle(window, 'remote:get-tokens', () => {
    return remoteAuthService.listTokenSummaries()
  })

  secureHandle(window, 'remote:generate-token', (_event, label: string) => {
    return remoteAuthService.generateToken(label)
  })

  secureHandle(window, 'remote:revoke-token', (_event, id: string) => {
    remoteAuthService.revokeTokenByIdOrToken(id)
    return { success: true }
  })
}
