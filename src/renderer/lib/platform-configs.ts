import type {
  AnyPlatformConfig,
  Platform,
  PlatformChatCapability
} from '../../main/platforms/types'

type PlatformConfigCollection =
  | Partial<Record<Platform, AnyPlatformConfig>>
  | AnyPlatformConfig[]
  | null
  | undefined

type PlatformCapabilityCollection =
  | Partial<Record<Platform, PlatformChatCapability>>
  | PlatformChatCapability[]
  | null
  | undefined

export function toPlatformConfigMap(
  configs: PlatformConfigCollection
): Partial<Record<Platform, AnyPlatformConfig>> {
  if (Array.isArray(configs)) {
    return configs.reduce<Partial<Record<Platform, AnyPlatformConfig>>>((acc, config) => {
      if (config?.platform) acc[config.platform] = config
      return acc
    }, {})
  }

  return configs && typeof configs === 'object' ? configs : {}
}

export function getPlatformConfig(
  configs: PlatformConfigCollection,
  platform: Platform
): AnyPlatformConfig | undefined {
  return toPlatformConfigMap(configs)[platform]
}

export function getPlatformCapability(
  capabilities: PlatformCapabilityCollection,
  platform: Platform
): PlatformChatCapability | undefined {
  if (Array.isArray(capabilities)) {
    return capabilities.find((capability) => capability?.platform === platform)
  }

  return capabilities && typeof capabilities === 'object' ? capabilities[platform] : undefined
}
