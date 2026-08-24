import { describe, expect, it } from 'vitest'
import {
  getWidgetDefaultConfig,
  getWidgetEventChannel,
  getWidgetNaturalFrame,
  WIDGET_ALIAS_MAP,
  WIDGET_RUNTIME_REGISTRY
} from './registry'
import type { WidgetType } from './types'

describe('widget runtime registry', () => {
  it('defines runtime behavior for every widget type', () => {
    const widgetTypes: WidgetType[] = [
      'chat', 'alerts', 'goal', 'now-playing', 'follower-goal', 'text',
      'socials', 'screen-border', 'camera-frame', 'brb-screen',
      'event-particles', 'falling-roses', 'gift-overlays', 'particles',
      'discord-promo', 'discord-call', 'node-network', 'latest-gifter',
      'physics', 'leaderboard', 'chat-unified', 'likes-tracker'
    ]

    expect(Object.keys(WIDGET_RUNTIME_REGISTRY).sort()).toEqual([...widgetTypes].sort())
    for (const type of widgetTypes) {
      expect(getWidgetDefaultConfig(type)).toBeTypeOf('object')
      expect(getWidgetEventChannel(type)).toBeTruthy()
    }
  })

  it('keeps aliases, semantic channels, and preview frames consistent', () => {
    expect(WIDGET_ALIAS_MAP.spotify).toBe('now-playing')
    expect(WIDGET_ALIAS_MAP.goals).toBe('goal')
    expect(WIDGET_ALIAS_MAP['gift-overlays']).toBe('event-particles')
    expect(WIDGET_ALIAS_MAP['unified-chat']).toBe('chat-unified')
    expect(getWidgetEventChannel('follower-goal')).toBe('goals')
    expect(getWidgetEventChannel('likes-tracker')).toBe('likes')
    expect(getWidgetNaturalFrame('chat-unified')).toEqual({ width: 1080, height: 1920 })
  })
})
