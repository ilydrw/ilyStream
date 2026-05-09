import { ipcMain } from 'electron'
import type { StatsService } from '../../stats/stats-service'
import type { GetTopUsersOptions } from '../../../shared/stats'
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

  ipcMain.handle('stats:get-user', (_event, payload: { platform: Platform; username: string }) => {
    if (!payload?.platform || !payload?.username) return null
    return stats.getUserStat(payload.platform, payload.username)
  })

  ipcMain.handle('stats:reset', () => {
    stats.reset()
    return stats.getGlobalStats()
  })
}
