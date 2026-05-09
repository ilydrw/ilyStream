import { Platform, EventType } from '../platforms/types'

export interface TriggerRule {
  id: string
  name: string
  enabled: boolean
  platforms: Platform[]
  conditions: Condition[]
  actions: Action[]
  /** Global cooldown in seconds */
  cooldown: number
  /** Per-user cooldown in seconds */
  userCooldown: number
  sortOrder: number
}

// --- Conditions ---

export type Condition =
  | EventTypeCondition
  | KeywordCondition
  | GiftValueCondition
  | UserRoleCondition
  | UsernameCondition
  | ViewerCountCondition
  | UserStatusCondition

export interface UserStatusCondition {
  type: 'user_status'
  status: 'is_super_fan' | 'is_fan_club' | 'is_team'
}

export interface EventTypeCondition {
  type: 'event_type'
  value: EventType
}

export interface KeywordCondition {
  type: 'keyword'
  value: string
  matchMode: 'contains' | 'exact' | 'regex' | 'starts_with'
  caseSensitive: boolean
}

export interface GiftValueCondition {
  type: 'gift_value_gte'
  /** Minimum value in cents */
  value: number
}

export interface UserRoleCondition {
  type: 'user_role'
  value: 'moderator' | 'subscriber' | 'vip'
}

export interface UsernameCondition {
  type: 'username'
  value: string
  matchMode: 'exact' | 'contains'
}

export interface ViewerCountCondition {
  type: 'viewer_count_gte'
  value: number
}

// --- Actions ---

export type Action =
  | TTSAction
  | PlaySoundAction
  | ShowAlertAction
  | WebhookAction
  | RunCommandAction
  | OBSSetSceneAction
  | OBSSetSourceVisibilityAction
  | OBSToggleSourceVisibilityAction
  | OBSSaveReplayBufferAction
  | AIRespondAction
  | VoicemodVoiceAction
  | VoicemodSoundAction
  | VTubeExpressionAction
  | VTubeAnimationAction
  | VTubeThrowAction
  | DiscordEmbedAction
  | PhysicsSpawnAction

export interface AIRespondAction {
  type: 'ai_respond'
  /** Optional custom system prompt override for this specific trigger */
  systemPrompt?: string
  /** Whether to send response to chat or just speak via TTS */
  output: 'chat' | 'tts' | 'both'
  /** Voice profile to use if output includes TTS */
  voiceProfileId?: string
}

export interface TTSAction {
  type: 'tts'
  voiceProfileId?: string
  /** Template string with {username}, {message}, {platform} placeholders */
  template?: string
}

export interface PlaySoundAction {
  type: 'play_sound'
  filePath: string
  volume: number
}

export interface ShowAlertAction {
  type: 'show_alert'
  /** HTML template with placeholders */
  template: string
  /** Optional image to display with the alert */
  imageUrl?: string
  /** Optional sound to play with the alert */
  audioUrl?: string
  audioVolume?: number
  durationMs: number
  animationIn: 'fade' | 'slide' | 'bounce' | 'zoom' | 'wave'
  animationOut: 'fade' | 'slide' | 'dissolve'
}

export interface WebhookAction {
  type: 'http_webhook'
  url: string
  method: 'GET' | 'POST' | 'PUT'
  headers: Record<string, string>
  /** Template body with placeholders */
  body: string
}

export interface RunCommandAction {
  type: 'run_command'
  command: string
}

export interface OBSSetSceneAction {
  type: 'obs_set_scene'
  sceneName: string
}

export interface OBSSetSourceVisibilityAction {
  type: 'obs_set_source_visibility'
  sceneName: string
  sourceName: string
  visible: boolean
}

export interface OBSToggleSourceVisibilityAction {
  type: 'obs_toggle_source_visibility'
  sceneName: string
  sourceName: string
}

export interface OBSSaveReplayBufferAction {
  type: 'obs_save_replay_buffer'
}

export interface VoicemodVoiceAction {
  type: 'voicemod_voice'
  voiceId: string
  durationSec: number
}

export interface VoicemodSoundAction {
  type: 'voicemod_sound'
  soundId: string
}

export interface VTubeExpressionAction {
  type: 'vtube_expression'
  expressionId: string
  toggle?: boolean
}

export interface VTubeAnimationAction {
  type: 'vtube_animation'
  animationId: string
}

export interface VTubeThrowAction {
  type: 'vtube_throw'
  itemId: string
  count?: number
}

export interface DiscordEmbedAction {
  type: 'discord_embed'
  title?: string
  description?: string
  color?: string
  imageUrl?: string
}

export interface PhysicsSpawnAction {
  type: 'physics_spawn'
  amount?: number
  gravityOverride?: number
}
