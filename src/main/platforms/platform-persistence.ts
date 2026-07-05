import { AnyPlatformConfig, Platform } from './types'

export type SavedPlatformConfigs = Partial<Record<Platform, AnyPlatformConfig>> | AnyPlatformConfig[]

export interface PlatformConnector {
  connect(config: AnyPlatformConfig): Promise<void>
}

// One-shot guard shared by the IPC handler and main-process startup, so the
// renderer's restore call and the automatic boot-time restore never double-connect.
let hasRestoredPlatformConnections = false

export async function restorePlatformConnectionsOnce(
  platformManager: PlatformConnector,
  configs: SavedPlatformConfigs
): Promise<void> {
  if (hasRestoredPlatformConnections) return
  hasRestoredPlatformConnections = true
  await restoreEnabledPlatformConnections(platformManager, configs)
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

  // The Kick webhook receiver is a passive local HTTP listener — starting it
  // costs nothing and having to click "Start Receiver" every launch was the #1
  // Kick complaint. Restore whenever a channel is configured.
  if (config.platform === 'kick') {
    return hasText(config.channelName)
  }

  // YouTube's InnerTube reader waits for the stream by checking the channel's
  // public /live page (free), so restoring it at launch is StreamElements-style
  // "it just connects when you go live" behavior with no quota cost.
  if (config.platform === 'youtube') {
    return hasText(config.channelId) || hasText(config.refreshToken)
  }

  return false
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}
