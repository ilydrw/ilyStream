import type { EventType, Platform } from '../../main/platforms/types'
import type {
  Action,
  Condition,
  TriggerRule
} from '../../main/triggers/trigger-types'

export const PLATFORM_OPTIONS: Array<{ value: Platform; label: string }> = [
  { value: 'tiktok', label: 'TikTok' },
  { value: 'twitch', label: 'Twitch' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'kick', label: 'Kick' }
]

export const EVENT_TYPE_OPTIONS: Array<{ value: EventType; label: string }> = [
  { value: 'chat', label: 'Chat' },
  { value: 'gift', label: 'Gift' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'follow', label: 'Follow' },
  { value: 'raid', label: 'Raid' },
  { value: 'like', label: 'Like' },
  { value: 'share', label: 'Share' },
  { value: 'join', label: 'Join' },
  { value: 'viewer-count', label: 'Viewer Count' }
]

export const CONDITION_TYPE_OPTIONS: Array<{ value: Condition['type']; label: string }> = [
  { value: 'event_type', label: 'Event Type' },
  { value: 'keyword', label: 'Keyword' },
  { value: 'gift_value_gte', label: 'Gift Value' },
  { value: 'user_role', label: 'User Role' },
  { value: 'username', label: 'Username' },
  { value: 'viewer_count_gte', label: 'Viewer Count' },
  { value: 'user_status', label: 'User Status' }
]

export const ACTION_TYPE_OPTIONS: Array<{ value: Action['type']; label: string }> = [
  { value: 'tts', label: 'Text-to-Speech' },
  { value: 'play_sound', label: 'Play Sound' },
  { value: 'show_alert', label: 'Show Alert' },
  { value: 'obs_set_scene', label: 'OBS: Set Scene' },
  { value: 'obs_set_source_visibility', label: 'OBS: Set Source Visibility' },
  { value: 'obs_toggle_source_visibility', label: 'OBS: Toggle Source Visibility' },
  { value: 'http_webhook', label: 'HTTP Webhook' },
  { value: 'run_command', label: 'Run Command' },
  { value: 'ai_respond', label: 'AI: Smart Response' },
  { value: 'voicemod_voice', label: 'Voicemod: Set Voice' },
  { value: 'voicemod_sound', label: 'Voicemod: Play Sound' },
  { value: 'vtube_expression', label: 'VTube: Expression' },
  { value: 'vtube_animation', label: 'VTube: Animation' },
  { value: 'vtube_throw', label: 'VTube: Throw Item' },
  { value: 'discord_embed', label: 'Discord: Send Embed' },
  { value: 'physics_spawn', label: 'Physics: Spawn Body' }
]

export function cloneTriggerRule(rule: TriggerRule): TriggerRule {
  return JSON.parse(JSON.stringify(rule)) as TriggerRule
}

export function createDefaultCondition(type: Condition['type'] = 'event_type'): Condition {
  switch (type) {
    case 'event_type':
      return { type: 'event_type', value: 'chat' }
    case 'keyword':
      return {
        type: 'keyword',
        value: '',
        matchMode: 'contains',
        caseSensitive: false
      }
    case 'gift_value_gte':
      return { type: 'gift_value_gte', value: 100 }
    case 'user_role':
      return { type: 'user_role', value: 'subscriber' }
    case 'username':
      return { type: 'username', value: '', matchMode: 'exact' }
    case 'viewer_count_gte':
      return { type: 'viewer_count_gte', value: 10 }
    case 'user_status':
      return { type: 'user_status', status: 'is_super_fan' }
  }
}

export function createDefaultAction(type: Action['type'] = 'tts'): Action {
  switch (type) {
    case 'tts':
      return {
        type: 'tts',
        template: '{username}: {message}'
      }
    case 'play_sound':
      return {
        type: 'play_sound',
        filePath: '',
        volume: 0.8
      }
    case 'show_alert':
      return {
        type: 'show_alert',
        template: '<strong>{username}</strong> triggered an alert!',
        durationMs: 5000,
        animationIn: 'wave',
        animationOut: 'dissolve',
        audioVolume: 1
      }
    case 'http_webhook':
      return {
        type: 'http_webhook',
        url: '',
        method: 'POST',
        headers: {},
        body: '{"username":"{username}","message":"{message}"}'
      }
    case 'obs_set_scene':
      return {
        type: 'obs_set_scene',
        sceneName: ''
      }
    case 'obs_set_source_visibility':
      return {
        type: 'obs_set_source_visibility',
        sceneName: '',
        sourceName: '',
        visible: true
      }
    case 'obs_toggle_source_visibility':
      return {
        type: 'obs_toggle_source_visibility',
        sceneName: '',
        sourceName: ''
      }
    case 'run_command':
      return {
        type: 'run_command',
        command: ''
      }
    case 'ai_respond':
      return {
        type: 'ai_respond',
        output: 'both'
      }
    case 'voicemod_voice':
      return {
        type: 'voicemod_voice',
        voiceId: '',
        durationSec: 30
      }
    case 'voicemod_sound':
      return {
        type: 'voicemod_sound',
        soundId: ''
      }
    case 'vtube_expression':
      return {
        type: 'vtube_expression',
        expressionId: '',
        toggle: true
      }
    case 'vtube_animation':
      return {
        type: 'vtube_animation',
        animationId: ''
      }
    case 'vtube_throw':
      return {
        type: 'vtube_throw',
        itemId: '',
        count: 1
      }
    case 'discord_embed':
      return {
        type: 'discord_embed',
        title: 'Stream Alert',
        description: '{username} just triggered an event!',
        color: '#ff00ff'
      }
    case 'physics_spawn':
      return {
        type: 'physics_spawn',
        amount: 1
      }
  }
}

export function createDefaultTrigger(sortOrder: number): TriggerRule {
  return {
    id: crypto.randomUUID(),
    name: 'New Trigger',
    enabled: true,
    platforms: PLATFORM_OPTIONS.map((platform) => platform.value),
    conditions: [createDefaultCondition('event_type')],
    actions: [createDefaultAction('tts')],
    cooldown: 0,
    userCooldown: 0,
    sortOrder
  }
}

export function normalizeTriggerRule(rule: TriggerRule, sortOrder = rule.sortOrder): TriggerRule {
  const normalized = cloneTriggerRule(rule)

  return {
    ...normalized,
    name: normalized.name.trim() || 'Untitled Trigger',
    platforms: Array.from(new Set(normalized.platforms)),
    conditions:
      normalized.conditions.length > 0
        ? normalized.conditions
        : [createDefaultCondition('event_type')],
    actions:
      normalized.actions.length > 0
        ? normalized.actions.map((action) =>
            action.type === 'tts' && action.voiceProfileId === ''
              ? { ...action, voiceProfileId: undefined }
              : action
          )
        : [createDefaultAction('tts')],
    cooldown: Math.max(0, Math.round(normalized.cooldown)),
    userCooldown: Math.max(0, Math.round(normalized.userCooldown)),
    sortOrder
  }
}

export function getTriggerValidationErrors(rule: TriggerRule): string[] {
  const errors: string[] = []

  if (rule.name.trim().length === 0) {
    errors.push('Trigger name is required.')
  }

  if (rule.platforms.length === 0) {
    errors.push('Select at least one platform.')
  }

  if (rule.conditions.length === 0) {
    errors.push('Add at least one condition.')
  }

  if (rule.actions.length === 0) {
    errors.push('Add at least one action.')
  }

  for (const condition of rule.conditions) {
    switch (condition.type) {
      case 'keyword':
        if (condition.value.trim().length === 0) {
          errors.push('Keyword conditions need a value.')
        }
        break
      case 'username':
        if (condition.value.trim().length === 0) {
          errors.push('Username conditions need a value.')
        }
        break
    }
  }

  for (const action of rule.actions) {
    switch (action.type) {
      case 'play_sound':
        if (action.filePath.trim().length === 0) {
          errors.push('Play sound actions need a file path.')
        }
        break
      case 'show_alert':
        if (action.template.trim().length === 0) {
          errors.push('Show alert actions need a template.')
        }
        break
      case 'http_webhook':
        if (action.url.trim().length === 0) {
          errors.push('Webhook actions need a URL.')
        }
        break
      case 'obs_set_scene':
        if (action.sceneName.trim().length === 0) {
          errors.push('OBS set scene actions need a scene name.')
        }
        break
      case 'obs_set_source_visibility':
        if (action.sceneName.trim().length === 0) {
          errors.push('OBS source visibility actions need a scene name.')
        }
        if (action.sourceName.trim().length === 0) {
          errors.push('OBS source visibility actions need a source name.')
        }
        break
      case 'obs_toggle_source_visibility':
        if (action.sceneName.trim().length === 0) {
          errors.push('OBS toggle source actions need a scene name.')
        }
        if (action.sourceName.trim().length === 0) {
          errors.push('OBS toggle source actions need a source name.')
        }
        break
      case 'run_command':
        if (action.command.trim().length === 0) {
          errors.push('Run command actions need a command.')
        }
        break
    }
  }

  return Array.from(new Set(errors))
}

export function describeCondition(condition: Condition): string {
  switch (condition.type) {
    case 'event_type':
      return `When event type is ${condition.value}`
    case 'keyword':
      return `Message ${condition.matchMode.replace('_', ' ')} "${condition.value || '...'}"`
    case 'gift_value_gte':
      return `Gift value is at least ${condition.value} cents`
    case 'user_role':
      return `User is a ${condition.value}`
    case 'username':
      return `Username ${condition.matchMode} "${condition.value || '...'}"`
    case 'viewer_count_gte':
      return `Viewer count is at least ${condition.value}`
    case 'user_status':
      return `User is a ${condition.status.replace(/is_/g, '').replace(/_/g, ' ')}`
  }
}

export function describeAction(action: Action): string {
  switch (action.type) {
    case 'tts':
      return action.template
        ? `Speak "${action.template}"`
        : 'Speak the event message'
    case 'play_sound':
      return `Play sound: ${action.filePath || '(none)'}`
    case 'show_alert':
      return `Show alert for ${Math.round(action.durationMs / 1000)}s`
    case 'http_webhook':
      return `Send ${action.method} to ${action.url || '(set URL)'}`
    case 'obs_set_scene':
      return `Switch OBS to ${action.sceneName || '(set scene)'}`
    case 'obs_set_source_visibility':
      return `${action.visible ? 'Show' : 'Hide'} ${action.sourceName || '(set source)'} in ${action.sceneName || '(set scene)'}`
    case 'obs_toggle_source_visibility':
      return `Toggle ${action.sourceName || '(set source)'} in ${action.sceneName || '(set scene)'}`
    case 'run_command':
      return `Run "${action.command || 'command'}"`
    case 'ai_respond':
      return `AI: Generate ${action.output} response`
    case 'voicemod_voice':
      return `Voicemod: Set voice to "${action.voiceId || '...'}" for ${action.durationSec}s`
    case 'voicemod_sound':
      return `Voicemod: Play sound effect`
    case 'vtube_expression':
      return `VTube: Trigger expression "${action.expressionId || '...'}"`
    case 'vtube_animation':
      return `VTube: Run animation "${action.animationId || '...'}"`
    case 'vtube_throw':
      return `VTube: Throw ${action.count || 1}x item`
    case 'discord_embed':
      return `Discord: Send embed to webhook`
    case 'physics_spawn':
      return `Physics: Spawn ${action.amount || 1} objects`
  }
}
