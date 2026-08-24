import {
  DEFAULT_ALERTS_CONFIG,
  DEFAULT_BORDER_CONFIG,
  DEFAULT_BRB_SCREEN_CONFIG,
  DEFAULT_CAMERA_FRAME_CONFIG,
  DEFAULT_CHAT_CONFIG,
  DEFAULT_CHAT_UNIFIED_CONFIG,
  DEFAULT_DISCORD_CALL_CONFIG,
  DEFAULT_DISCORD_PROMO_CONFIG,
  DEFAULT_FOLLOWER_GOAL_CONFIG,
  DEFAULT_LATEST_GIFTER_CONFIG,
  DEFAULT_LEADERBOARD_CONFIG,
  DEFAULT_LIKES_TRACKER_CONFIG,
  DEFAULT_NODE_NETWORK_CONFIG,
  DEFAULT_NOW_PLAYING_CONFIG,
  DEFAULT_PARTICLE_CONFIG,
  DEFAULT_PARTICLES_CONFIG,
  DEFAULT_PHYSICS_CONFIG,
  DEFAULT_ROSE_CONFIG,
  DEFAULT_SOCIALS_CONFIG,
  DEFAULT_TEXT_WIDGET_CONFIG
} from './configs'
import type { WidgetType } from './types'

export interface WidgetNaturalFrame {
  width: number
  height: number
}

export interface WidgetRuntimeDefinition {
  /** URL aliases accepted by the local overlay router. */
  aliases: readonly string[]
  /** Canonical renderer used by legacy widget types such as gift-overlays. */
  canonicalType: WidgetType
  /** Config used when an alias has no saved widget yet. */
  defaultConfig: Record<string, unknown>
  /** Existing semantic stream used for data and targeted config delivery. */
  eventChannel: string
  /** The shared runtime must open the event stream when the template does not. */
  runtimeOwnsEventStream?: boolean
  /** The template exposes the apply-config contract and can avoid a reload. */
  supportsHotConfig?: boolean
  /** Typical browser-source dimensions used by editor previews and placement. */
  naturalFrame?: WidgetNaturalFrame
}

const GOAL_DEFAULT_CONFIG = {
  goalType: 'follows',
  target: 100,
  accentColor: '#00ff9d'
}

/**
 * Runtime behavior that must stay consistent between URL routing, save
 * broadcasts, browser-source updates, and editor previews.
 */
export const WIDGET_RUNTIME_REGISTRY: Record<WidgetType, WidgetRuntimeDefinition> = {
  chat: {
    aliases: ['chat'],
    canonicalType: 'chat',
    defaultConfig: DEFAULT_CHAT_CONFIG as unknown as Record<string, unknown>,
    eventChannel: 'chat',
    naturalFrame: { width: 1920, height: 1080 }
  },
  alerts: {
    aliases: ['alerts'],
    canonicalType: 'alerts',
    defaultConfig: DEFAULT_ALERTS_CONFIG as unknown as Record<string, unknown>,
    eventChannel: 'alerts',
    naturalFrame: { width: 1920, height: 1080 }
  },
  goal: {
    aliases: ['goal', 'goals'],
    canonicalType: 'goal',
    defaultConfig: GOAL_DEFAULT_CONFIG,
    eventChannel: 'goals',
    naturalFrame: { width: 720, height: 160 }
  },
  'now-playing': {
    aliases: ['now-playing', 'spotify'],
    canonicalType: 'now-playing',
    defaultConfig: DEFAULT_NOW_PLAYING_CONFIG as unknown as Record<string, unknown>,
    eventChannel: 'now-playing',
    supportsHotConfig: true,
    naturalFrame: { width: 560, height: 220 }
  },
  'follower-goal': {
    aliases: ['follower-goal', 'followers'],
    canonicalType: 'follower-goal',
    defaultConfig: DEFAULT_FOLLOWER_GOAL_CONFIG as unknown as Record<string, unknown>,
    eventChannel: 'goals',
    supportsHotConfig: true,
    naturalFrame: { width: 720, height: 180 }
  },
  text: {
    aliases: ['text', 'custom-text'],
    canonicalType: 'text',
    defaultConfig: DEFAULT_TEXT_WIDGET_CONFIG as unknown as Record<string, unknown>,
    eventChannel: 'text',
    runtimeOwnsEventStream: true,
    supportsHotConfig: true,
    naturalFrame: { width: 800, height: 240 }
  },
  socials: {
    aliases: ['socials'],
    canonicalType: 'socials',
    defaultConfig: DEFAULT_SOCIALS_CONFIG as unknown as Record<string, unknown>,
    eventChannel: 'socials',
    naturalFrame: { width: 720, height: 140 }
  },
  'screen-border': {
    aliases: ['screen-border', 'border'],
    canonicalType: 'screen-border',
    defaultConfig: DEFAULT_BORDER_CONFIG as unknown as Record<string, unknown>,
    eventChannel: 'screen-border',
    supportsHotConfig: true,
    naturalFrame: { width: 1920, height: 1080 }
  },
  'camera-frame': {
    aliases: ['camera-frame', 'camera-mask', 'camera'],
    canonicalType: 'camera-frame',
    defaultConfig: DEFAULT_CAMERA_FRAME_CONFIG as unknown as Record<string, unknown>,
    eventChannel: 'camera-frame',
    naturalFrame: { width: 640, height: 360 }
  },
  'brb-screen': {
    aliases: ['brb-screen', 'be-right-back', 'brb'],
    canonicalType: 'brb-screen',
    defaultConfig: DEFAULT_BRB_SCREEN_CONFIG as unknown as Record<string, unknown>,
    eventChannel: 'brb-screen',
    naturalFrame: { width: 1920, height: 1080 }
  },
  'event-particles': {
    aliases: ['event-particles', 'hearts', 'gift-overlays'],
    canonicalType: 'event-particles',
    defaultConfig: DEFAULT_PARTICLE_CONFIG as unknown as Record<string, unknown>,
    eventChannel: 'event-particles',
    naturalFrame: { width: 1920, height: 1080 }
  },
  'falling-roses': {
    aliases: ['falling-roses', 'roses', 'tiktok-roses'],
    canonicalType: 'falling-roses',
    defaultConfig: DEFAULT_ROSE_CONFIG as unknown as Record<string, unknown>,
    eventChannel: 'falling-roses',
    naturalFrame: { width: 1080, height: 1920 }
  },
  'gift-overlays': {
    aliases: [],
    canonicalType: 'event-particles',
    defaultConfig: DEFAULT_PARTICLE_CONFIG as unknown as Record<string, unknown>,
    eventChannel: 'event-particles',
    naturalFrame: { width: 1920, height: 1080 }
  },
  particles: {
    aliases: ['particles'],
    canonicalType: 'particles',
    defaultConfig: DEFAULT_PARTICLES_CONFIG as unknown as Record<string, unknown>,
    eventChannel: 'particles',
    naturalFrame: { width: 1920, height: 1080 }
  },
  'discord-promo': {
    aliases: ['discord-promo', 'discord'],
    canonicalType: 'discord-promo',
    defaultConfig: DEFAULT_DISCORD_PROMO_CONFIG as unknown as Record<string, unknown>,
    eventChannel: 'discord-promo',
    naturalFrame: { width: 520, height: 160 }
  },
  'discord-call': {
    aliases: ['discord-call', 'call'],
    canonicalType: 'discord-call',
    defaultConfig: DEFAULT_DISCORD_CALL_CONFIG as unknown as Record<string, unknown>,
    eventChannel: 'discord-call',
    naturalFrame: { width: 480, height: 360 }
  },
  'node-network': {
    aliases: ['node-network', 'nodes', 'web'],
    canonicalType: 'node-network',
    defaultConfig: DEFAULT_NODE_NETWORK_CONFIG as unknown as Record<string, unknown>,
    eventChannel: 'node-network',
    naturalFrame: { width: 1920, height: 1080 }
  },
  'latest-gifter': {
    aliases: ['latest-gifter', 'gifter'],
    canonicalType: 'latest-gifter',
    defaultConfig: DEFAULT_LATEST_GIFTER_CONFIG as unknown as Record<string, unknown>,
    eventChannel: 'latest-gifter',
    naturalFrame: { width: 520, height: 180 }
  },
  physics: {
    aliases: ['physics'],
    canonicalType: 'physics',
    defaultConfig: DEFAULT_PHYSICS_CONFIG as unknown as Record<string, unknown>,
    eventChannel: 'physics',
    naturalFrame: { width: 1920, height: 1080 }
  },
  leaderboard: {
    aliases: ['leaderboard'],
    canonicalType: 'leaderboard',
    defaultConfig: DEFAULT_LEADERBOARD_CONFIG as unknown as Record<string, unknown>,
    eventChannel: 'leaderboard',
    naturalFrame: { width: 440, height: 640 }
  },
  'chat-unified': {
    aliases: ['chat-unified', 'unified-chat', 'chat-v2', 'unified'],
    canonicalType: 'chat-unified',
    defaultConfig: DEFAULT_CHAT_UNIFIED_CONFIG as unknown as Record<string, unknown>,
    eventChannel: 'chat-unified',
    naturalFrame: { width: 1080, height: 1920 }
  },
  'likes-tracker': {
    aliases: ['likes-tracker', 'likes'],
    canonicalType: 'likes-tracker',
    defaultConfig: DEFAULT_LIKES_TRACKER_CONFIG as unknown as Record<string, unknown>,
    eventChannel: 'likes',
    naturalFrame: { width: 400, height: 280 }
  }
}

export const WIDGET_ALIAS_MAP: Readonly<Record<string, WidgetType>> = Object.freeze(
  Object.entries(WIDGET_RUNTIME_REGISTRY).reduce<Record<string, WidgetType>>(
    (aliases, [type, definition]) => {
      aliases[type] = definition.canonicalType
      for (const alias of definition.aliases) aliases[alias] = definition.canonicalType
      return aliases
    },
    {}
  )
)

export function getWidgetRuntimeDefinition(type: WidgetType): WidgetRuntimeDefinition {
  return WIDGET_RUNTIME_REGISTRY[type]
}

export function getWidgetDefaultConfig(type: WidgetType): Record<string, unknown> {
  return WIDGET_RUNTIME_REGISTRY[type].defaultConfig
}

export function getWidgetEventChannel(type: WidgetType): string {
  return WIDGET_RUNTIME_REGISTRY[type].eventChannel
}

export function getWidgetNaturalFrame(type: WidgetType): WidgetNaturalFrame | undefined {
  return WIDGET_RUNTIME_REGISTRY[type].naturalFrame
}

export function widgetSupportsHotConfig(type: WidgetType): boolean {
  return WIDGET_RUNTIME_REGISTRY[type].supportsHotConfig === true
}
