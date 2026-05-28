import type { Action, TriggerRule } from '../../main/triggers/trigger-types'
import { automationRecipes, createRecipeRule, type AutomationRecipe } from './automation-recipes'
import {
  describeAction,
  describeCondition,
  getTriggerValidationErrors,
  normalizeTriggerRule
} from './trigger-editor'

export const RECIPE_PACK_TYPE = 'ilystream.trigger-pack'
export const RECIPE_PACK_SCHEMA_VERSION = 1
export const RECIPE_PACK_COMPATIBLE_APP_VERSION = '0.0.18'

export interface RecipePackMetadata {
  id: string
  name: string
  author: string
  description: string
  tags: string[]
  version: string
  compatibleAppVersion: string
  createdAt: string
  updatedAt?: string
}

export interface RecipePack {
  type: typeof RECIPE_PACK_TYPE
  schemaVersion: number
  metadata: RecipePackMetadata
  rules: TriggerRule[]
  requiredAssets?: {
    sounds?: string[]
    images?: string[]
    widgets?: string[]
  }
}

export interface RecipePackRisk {
  severity: 'low' | 'medium' | 'high'
  ruleName: string
  actionType: Action['type']
  message: string
}

export interface RecipePackRuleReview {
  rule: TriggerRule
  conditionSummaries: string[]
  actionSummaries: string[]
  validationErrors: string[]
  risks: RecipePackRisk[]
  duplicateName: boolean
}

export interface RecipePackReview {
  pack: RecipePack
  rules: RecipePackRuleReview[]
  risks: RecipePackRisk[]
  invalidRuleCount: number
  duplicateRuleCount: number
  canImport: boolean
}

export const starterRecipePacks: RecipePack[] = [
  createStarterPack({
    id: 'starter-tiktok-gifts',
    name: 'TikTok Gifts Starter',
    description: 'Gift, superfan, and like burst automations for TikTok-style live energy.',
    tags: ['tiktok', 'gifts', 'likes'],
    recipeIds: ['gift-gg-celebration', 'superfan-vip-pop', 'like-burst-spotlight']
  }),
  createStarterPack({
    id: 'starter-spotify-requests',
    name: 'Spotify Requests Starter',
    description: 'Viewer-facing feedback for !play requests and friendly command testing.',
    tags: ['spotify', 'music', 'chat'],
    recipeIds: ['spotify-request-spotlight', 'hello-command-hook']
  }),
  createStarterPack({
    id: 'starter-growth-alerts',
    name: 'Growth Alerts Starter',
    description: 'Follower, raid, viewer milestone, and like burst moments for channel growth.',
    tags: ['growth', 'follow', 'raid'],
    recipeIds: ['follow-welcome-pop', 'raid-takeover', 'viewer-count-milestone', 'like-burst-spotlight']
  }),
  createStarterPack({
    id: 'starter-chat-commands',
    name: 'Chat Commands Starter',
    description: 'Simple command-triggered feedback loops you can expand into a larger command library.',
    tags: ['chat', 'commands', 'tts'],
    recipeIds: ['hello-command-hook', 'spotify-request-spotlight']
  }),
  createStarterPack({
    id: 'starter-tikfinity-challenger',
    name: 'TikFinity Challenger Starter',
    description: 'Host chat replies, AI question handling, gifts, and bridge-ready fanout in one starter pack.',
    tags: ['tiktok', 'host chat', 'ai', 'streamerbot'],
    recipeIds: ['song-request-host-reply', 'ai-question-catcher', 'gift-gg-celebration', 'streamerbot-gift-action']
  })
]

export function createRecipePack(
  rules: TriggerRule[],
  metadata: Partial<RecipePackMetadata> = {}
): RecipePack {
  const now = new Date().toISOString()
  const name = cleanText(metadata.name, 'Untitled Recipe Pack', 80)

  return {
    type: RECIPE_PACK_TYPE,
    schemaVersion: RECIPE_PACK_SCHEMA_VERSION,
    metadata: {
      id: cleanText(metadata.id, createPackId(name), 96),
      name,
      author: cleanText(metadata.author, 'ilyStream Creator', 80),
      description: cleanText(metadata.description, 'Shared ilyStream automation recipes.', 240),
      tags: normalizeTags(metadata.tags ?? []),
      version: cleanText(metadata.version, '1.0.0', 24),
      compatibleAppVersion: cleanText(metadata.compatibleAppVersion, RECIPE_PACK_COMPATIBLE_APP_VERSION, 24),
      createdAt: metadata.createdAt ?? now,
      updatedAt: metadata.updatedAt
    },
    rules: clone(rules)
  }
}

export function parseRecipePackText(text: string): RecipePack {
  const parsed = JSON.parse(text)
  return normalizeRecipePack(parsed)
}

export function normalizeRecipePack(value: unknown): RecipePack {
  if (Array.isArray(value)) {
    return createRecipePack(value.filter(isTriggerRuleLike), {
      name: 'Legacy Trigger Pack',
      description: 'Imported from a plain trigger rule array.'
    })
  }

  const raw = value as Partial<RecipePack> & {
    version?: number
    exportedAt?: string
    name?: string
    author?: string
    description?: string
    tags?: string[]
  }

  if (!raw || !Array.isArray(raw.rules)) {
    throw new Error('That pack does not contain a rules array.')
  }

  const metadataSource = raw.metadata ?? {
    name: raw.name,
    author: raw.author,
    description: raw.description,
    tags: raw.tags,
    createdAt: raw.exportedAt
  }

  return {
    type: RECIPE_PACK_TYPE,
    schemaVersion: Number(raw.schemaVersion ?? raw.version ?? RECIPE_PACK_SCHEMA_VERSION),
    metadata: createRecipePack([], metadataSource).metadata,
    requiredAssets: raw.requiredAssets,
    rules: raw.rules.filter(isTriggerRuleLike)
  }
}

export function reviewRecipePack(pack: RecipePack, existingRules: TriggerRule[] = []): RecipePackReview {
  const existingNames = new Set(existingRules.map((rule) => rule.name.trim().toLowerCase()))
  const rules = pack.rules.map((rule) => {
    const risks = detectRuleRisks(rule)
    return {
      rule,
      conditionSummaries: rule.conditions.map((condition) => describeCondition(condition)),
      actionSummaries: rule.actions.map((action) => describeAction(action)),
      validationErrors: getTriggerValidationErrors(rule),
      risks,
      duplicateName: existingNames.has(rule.name.trim().toLowerCase())
    }
  })

  const risks = rules.flatMap((rule) => rule.risks)
  const invalidRuleCount = rules.filter((rule) => rule.validationErrors.length > 0).length
  const duplicateRuleCount = rules.filter((rule) => rule.duplicateName).length

  return {
    pack,
    rules,
    risks,
    invalidRuleCount,
    duplicateRuleCount,
    canImport: pack.rules.length > 0 && invalidRuleCount === 0
  }
}

export function prepareRulesForImport(
  pack: RecipePack,
  startingSortOrder: number,
  options: { namePrefix?: string } = {}
): TriggerRule[] {
  const prefix = options.namePrefix ?? 'Imported: '
  return pack.rules.map((rule, index) => {
    const name = prefix && !rule.name.startsWith(prefix) ? `${prefix}${rule.name}` : rule.name
    return normalizeTriggerRule(
      {
        ...clone(rule),
        id: createRuleId(),
        name
      },
      startingSortOrder + index
    )
  })
}

export function detectRuleRisks(rule: TriggerRule): RecipePackRisk[] {
  return rule.actions.flatMap((action) => detectActionRisks(rule.name, action))
}

function detectActionRisks(ruleName: string, action: Action): RecipePackRisk[] {
  switch (action.type) {
    case 'run_command':
      return [{
        severity: 'high',
        ruleName,
        actionType: action.type,
        message: `Runs a local shell command: ${action.command || '(empty command)'}`
      }]
    case 'http_webhook':
      return [{
        severity: 'high',
        ruleName,
        actionType: action.type,
        message: `Sends data to ${action.url || '(unset webhook URL)'}`
      }]
    case 'send_chat':
      return [{
        severity: 'medium',
        ruleName,
        actionType: action.type,
        message: 'Sends a message from the host account when the platform sender is ready.'
      }]
    case 'discord_embed':
      return [{
        severity: 'medium',
        ruleName,
        actionType: action.type,
        message: 'Sends a Discord webhook embed if Discord is configured.'
      }]
    case 'play_sound':
      return action.filePath
        ? []
        : [{
            severity: 'medium',
            ruleName,
            actionType: action.type,
            message: 'References a sound action with no file selected yet.'
          }]
    case 'show_alert': {
      const risks: RecipePackRisk[] = []
      if (action.audioUrl) {
        risks.push({
          severity: action.audioUrl.startsWith('http') ? 'medium' : 'low',
          ruleName,
          actionType: action.type,
          message: `Alert uses an external or packaged audio URL: ${action.audioUrl}`
        })
      }
      if (action.imageUrl?.startsWith('http')) {
        risks.push({
          severity: 'low',
          ruleName,
          actionType: action.type,
          message: `Alert loads a remote image: ${action.imageUrl}`
        })
      }
      return risks
    }
    case 'obs_set_scene':
    case 'obs_set_source_visibility':
    case 'obs_toggle_source_visibility':
    case 'obs_save_replay_buffer':
      return [{
        severity: 'medium',
        ruleName,
        actionType: action.type,
        message: 'Controls OBS when the trigger fires.'
      }]
    case 'ai_respond':
      return action.output === 'chat' || action.output === 'both'
        ? [{
            severity: 'medium',
            ruleName,
            actionType: action.type,
            message: 'Can send an AI-generated response back to chat.'
          }]
        : []
    default:
      return []
  }
}

function createStarterPack({
  id,
  name,
  description,
  tags,
  recipeIds
}: {
  id: string
  name: string
  description: string
  tags: string[]
  recipeIds: string[]
}): RecipePack {
  const recipes = recipeIds
    .map((recipeId) => automationRecipes.find((recipe) => recipe.id === recipeId))
    .filter((recipe): recipe is AutomationRecipe => Boolean(recipe))

  return createRecipePack(
    recipes.map((recipe, index) => createRecipeRule(recipe, index, `${id}-${recipe.id}`)),
    {
      id,
      name,
      author: 'ilyStream',
      description,
      tags,
      version: '1.0.0',
      compatibleAppVersion: RECIPE_PACK_COMPATIBLE_APP_VERSION,
      createdAt: '2026-05-20T00:00:00.000Z'
    }
  )
}

function isTriggerRuleLike(value: unknown): value is TriggerRule {
  const rule = value as TriggerRule
  return Boolean(
    rule &&
    typeof rule.id === 'string' &&
    typeof rule.name === 'string' &&
    typeof rule.enabled === 'boolean' &&
    Array.isArray(rule.platforms) &&
    Array.isArray(rule.conditions) &&
    Array.isArray(rule.actions) &&
    typeof rule.cooldown === 'number' &&
    typeof rule.userCooldown === 'number'
  )
}

function createPackId(name: string): string {
  return `pack-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled'}-${Date.now()}`
}

function createRuleId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `imported-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function cleanText(value: unknown, fallback: string, maxLength: number): string {
  const text = String(value ?? '').trim()
  return (text || fallback).slice(0, maxLength)
}

function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean))).slice(0, 8)
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
