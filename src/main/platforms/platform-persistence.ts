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
  const restorableConfigs = values.filter(
    (config): config is AnyPlatformConfig => isRestorablePlatformConnection(config)
  )

  await Promise.allSettled(restorableConfigs.map((config) => platformManager.connect(config)))
}

export function isRestorablePlatformConnection(config: AnyPlatformConfig | undefined | null): config is AnyPlatformConfig {
  if (!config) return false
  if (config.enabled) return true

  // Twitch chat/event telemetry is independent of whether ilyStream is the RTMP
  // broadcaster. Restore it when chat auth is configured so unified chat still
  // works while video is sent through Streamlabs or another encoder.
  if (config.platform === 'twitch') {
    return hasText(config.channel) && hasText(config.clientId) && hasText(config.accessToken)
  }

  return false
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}
