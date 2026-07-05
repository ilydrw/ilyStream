import { ipcMain } from 'electron'
import type { StatsService } from '../../stats/stats-service'
import type { GetTopUsersOptions, ViewerAccountInput, ViewerProfileInput } from '../../../shared/stats'
import type { Platform } from '../../platforms/types'

export function registerStatsHandlers(stats: StatsService): void {
  ipcMain.handle('stats:get-global', () => stats.getGlobalStats())

  ipcMain.handle('stats:get-top-users', (_event, opts: GetTopUsersOptions) => {
    return stats.getTopUsers({
      sortBy: opts?.sortBy ?? 'totalLikes',
      platform: opts?.platform,
      query: opts?.query,
      limit: typeof opts?.limit === 'number' ? opts.limit : 100,
      offset: typeof opts?.offset === 'number' ? opts.offset : 0
    })
  })

  ipcMain.handle('stats:get-top-identities', (_event, opts: GetTopUsersOptions) => {
    return stats.getTopIdentities({
      sortBy: opts?.sortBy ?? 'totalLikes',
      platform: opts?.platform,
      query: opts?.query,
      limit: typeof opts?.limit === 'number' ? opts.limit : 100,
      offset: typeof opts?.offset === 'number' ? opts.offset : 0
    })
  })

  ipcMain.handle('stats:get-identity', (_event, id: string) => {
    return stats.getUserIdentity(id)
  })

  ipcMain.handle('stats:get-user', (_event, payload: { platform: Platform; username: string }) => {
    if (!payload?.platform || !payload?.username) return null
    return stats.getUserStat(payload.platform, payload.username)
  })

  ipcMain.handle('stats:reset', () => {
    stats.reset()
    return stats.getGlobalStats()
  })

  ipcMain.handle('stats:set-manual-follower-count', (_event, payload: { platform: Platform; count: number }) => {
    if (!payload?.platform || typeof payload.count !== 'number') return stats.getGlobalStats()
    stats.setManualFollowerCount(payload.platform, payload.count)
    return stats.getGlobalStats()
  })

  ipcMain.handle('stats:link-accounts', (_event, payload: { p1: Platform; u1: string; p2: Platform; u2: string }) => {
    const profile = stats.linkAccounts(payload.p1, payload.u1, payload.p2, payload.u2)
    return { success: true, profile }
  })

  ipcMain.handle('stats:unlink-account', (_event, payload: { platform: Platform; username: string }) => {
    stats.unlinkAccount(payload.platform, payload.username)
    return { success: true }
  })

  ipcMain.handle('stats:get-viewer-profiles', (_event, opts?: { query?: string; limit?: number }) => {
    return stats.getViewerProfiles(opts || {})
  })

  ipcMain.handle('stats:create-viewer-profile', (_event, input: ViewerProfileInput) => {
    return stats.createViewerProfile(input || {})
  })

  ipcMain.handle('stats:get-link-suggestions', (_event, profileId: string) => {
    if (!profileId) return []
    return stats.getLinkSuggestions(profileId)
  })

  ipcMain.handle('stats:update-viewer-profile', (_event, payload: { id: string; patch: Partial<ViewerProfileInput> }) => {
    if (!payload?.id) return null
    return stats.updateViewerProfile(payload.id, payload.patch || {})
  })

  ipcMain.handle('stats:add-viewer-account', (_event, payload: { profileId: string; account: ViewerAccountInput }) => {
    if (!payload?.profileId || !payload.account) return null
    return stats.addViewerAccount(payload.profileId, payload.account)
  })
}
