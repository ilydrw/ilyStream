import { ipcMain } from 'electron'
import type { EconomyService } from '../../economy/economy-service'
import type { EconomyConfig, EconomyRedemption } from '../../../shared/economy'

export function registerEconomyHandlers(economy: EconomyService): void {
  ipcMain.handle('economy:get-dashboard', () => economy.getDashboard())
  ipcMain.handle('economy:get-config', () => economy.getConfig())
  ipcMain.handle('economy:update-config', (_event, config: Partial<EconomyConfig>) => economy.updateConfig(config))
  ipcMain.handle('economy:get-redemptions', (_event, includeDisabled?: boolean) => economy.getRedemptions(includeDisabled !== false))
  ipcMain.handle('economy:save-redemption', (_event, redemption: Partial<EconomyRedemption>) => economy.saveRedemption(redemption))
  ipcMain.handle('economy:delete-redemption', (_event, id: string) => economy.deleteRedemption(id))
  ipcMain.handle('economy:get-transactions', (_event, limit?: number) => economy.getTransactions(limit))
  ipcMain.handle('economy:grant-points', (_event, input: {
    username: string
    platform: string
    amount: number
    reason?: string
  }) => economy.grantPoints(input))
}
