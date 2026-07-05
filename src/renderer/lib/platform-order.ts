import type { Platform } from '../../main/platforms/types'

export const PRIMARY_PLATFORM_ORDER: Platform[] = ['tiktok', 'twitch', 'youtube', 'kick']

export function platformOrderIndex(platform: Platform | string): number {
  const index = PRIMARY_PLATFORM_ORDER.indexOf(platform as Platform)
  return index >= 0 ? index : PRIMARY_PLATFORM_ORDER.length
}

export function sortPlatformsByDisplayOrder<T extends Platform | string>(platforms: T[]): T[] {
  return [...platforms].sort((a, b) => platformOrderIndex(a) - platformOrderIndex(b) || String(a).localeCompare(String(b)))
}
