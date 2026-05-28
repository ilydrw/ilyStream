import { AnyPlatformConfig, Platform } from './types'

export type SavedPlatformConfigs = Partial<Record<Platform, AnyPlatformConfig>> | AnyPlatformConfig[]

export interface PlatformConnector {
  connect(config: AnyPlatformConfig): Promise<void>
}

export async function restoreEnabledPlatformConnections(
  platformManager: PlatformConnector,
  configs: SavedPlatformConfigs
): Promise<void> {
  const values = Array.isArray(configs) ? configs : Object.values(configs)
  const enabledConfigs = values.filter(
    (config): config is AnyPlatformConfig => Boolean(config?.enabled)
  )

  await Promise.allSettled(enabledConfigs.map((config) => platformManager.connect(config)))
}
