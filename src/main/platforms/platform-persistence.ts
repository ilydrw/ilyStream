import { AnyPlatformConfig, Platform } from './types'

export type SavedPlatformConfigs = Partial<Record<Platform, AnyPlatformConfig>>

export interface PlatformConnector {
  connect(config: AnyPlatformConfig): Promise<void>
}

export async function restoreEnabledPlatformConnections(
  platformManager: PlatformConnector,
  configs: SavedPlatformConfigs
): Promise<void> {
  const enabledConfigs = Object.values(configs).filter(
    (config): config is AnyPlatformConfig => Boolean(config?.enabled)
  )

  await Promise.allSettled(enabledConfigs.map((config) => platformManager.connect(config)))
}
