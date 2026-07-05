import { EventEmitter } from 'events'
import type { AnyStreamEvent, ChatEvent } from '../../platforms/types'
import type { Action, AIRespondAction } from '../trigger-types'
import type { TTSEngine } from '../../tts/tts-engine'
import type { AIService } from '../../ai/ai-service'
import type { AutomationActionStatus } from '../../../shared/automation-receipts'
import { htmlToSingleLinePlainText } from '../../../shared/plain-text'

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;'
}
const WEBHOOK_TIMEOUT_MS = 10_000

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]!)
}

export class ActionExecutor extends EventEmitter {
  constructor(private ttsEngine: TTSEngine, private aiService: AIService) {
    super()
  }

  async execute(action: Action, event: AnyStreamEvent): Promise<ActionExecutionResult> {
    switch (action.type) {
      case 'tts': {
        const speechMessage =
          event.type === 'chat' ? this.ttsEngine.prepareChatSpeechMessage(event as ChatEvent) : null
        if (event.type === 'chat' && !speechMessage) {
          return {
            status: 'skipped',
            summary: describeAction(action),
            reason: 'Chat message was rejected by TTS filters, role gates, or command prefix rules.'
          }
        }

        const text = action.template
          ? this.fillTemplate(action.template, event, speechMessage ?? undefined)
          : speechMessage || this.getEventMessage(event) || ''
        const user = this.getEventUser(event)
        this.ttsEngine.enqueue({
          text,
          username: user?.username || '',
          platform: event.platform,
          priority: 'high',
          voiceProfileId: action.voiceProfileId,
          eventType: event.type
        })
        return { status: 'ran', summary: describeAction(action) }
      }

      case 'play_sound':
        this.emit('play-sound', action, event)
        return { status: 'ran', summary: describeAction(action) }

      case 'show_alert': {
        const alertHtml = this.fillTemplateHtml(action.template, event)
        this.emit('show-alert', { ...action, template: alertHtml, imageUrl: action.imageUrl }, event)
        return { status: 'ran', summary: describeAction(action) }
      }

      case 'http_webhook':
        return this.executeWebhook(action, event)

      case 'send_chat':
        this.emit('send-chat', {
          ...action,
          platform: action.platform === 'source' ? event.platform : action.platform || event.platform,
          message: htmlToSingleLinePlainText(this.fillTemplate(action.template, event))
        }, event)
        return { status: 'ran', summary: describeAction(action) }

      case 'run_command':
        this.emit('run-command', action, event)
        return { status: 'ran', summary: describeAction(action) }

      case 'obs_set_scene':
      case 'obs_set_source_visibility':
      case 'obs_toggle_source_visibility':
      case 'obs_save_replay_buffer':
        this.emit('obs-control', action, event)
        return { status: 'ran', summary: describeAction(action) }

      case 'ai_respond':
        return this.executeAIRespond(action, event)

      case 'voicemod_voice':
      case 'voicemod_sound':
        this.emit('voicemod', action, event)
        return { status: 'ran', summary: describeAction(action) }

      case 'vtube_expression':
      case 'vtube_animation':
      case 'vtube_throw':
        this.emit('vtube', action, event)
        return { status: 'ran', summary: describeAction(action) }

      case 'discord_embed':
        this.emit('discord', action, event)
        return { status: 'ran', summary: describeAction(action) }

      case 'physics_spawn':
        this.emit('physics', action, event)
        return { status: 'ran', summary: describeAction(action) }
    }
  }

  private async executeAIRespond(action: AIRespondAction, event: AnyStreamEvent): Promise<ActionExecutionResult> {
    const user = this.getEventUser(event)
    const speechMessage =
      event.type === 'chat' ? this.ttsEngine.prepareChatSpeechMessage(event as ChatEvent) : null
    if (event.type === 'chat' && !speechMessage) {
      return {
        status: 'skipped',
        summary: describeAction(action),
        reason: 'Chat message was rejected before AI response generation.'
      }
    }

    const message = speechMessage || this.getEventMessage(event) || '(no message)'

    const responseText = await this.aiService.generateResponse(message, {
      username: user?.username || 'Unknown',
      platform: event.platform
    })

    if (action.output === 'chat' || action.output === 'both') {
      this.emit('send-chat', { platform: event.platform, message: htmlToSingleLinePlainText(responseText) })
    }

    if (action.output === 'tts' || action.output === 'both') {
      this.ttsEngine.enqueue({
        text: responseText,
        username: 'AI Assistant',
        platform: event.platform,
        priority: 'high',
        voiceProfileId: action.voiceProfileId,
        eventType: 'chat'
      })
    }

    return { status: 'ran', summary: describeAction(action) }
  }

  private async executeWebhook(action: Action & { type: 'http_webhook' }, event: AnyStreamEvent): Promise<ActionExecutionResult> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS)

    try {
      const body = this.fillTemplate(action.body, event)
      await fetch(action.url, {
        method: action.method,
        headers: { 'Content-Type': 'application/json', ...action.headers },
        body: action.method !== 'GET' ? body : undefined,
        signal: controller.signal
      })
      return { status: 'ran', summary: describeAction(action) }
    } catch (error) {
      console.error('[triggers] Webhook failed:', error)
      return {
        status: 'failed',
        summary: describeAction(action),
        reason: error instanceof Error && error.name === 'AbortError'
          ? `Webhook timed out after ${Math.round(WEBHOOK_TIMEOUT_MS / 1000)}s.`
          : error instanceof Error ? error.message : 'Webhook request failed.'
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  private getEventMessage(event: AnyStreamEvent): string | null {
    if ('message' in event) return (event as ChatEvent).message
    return null
  }

  private getEventUser(event: AnyStreamEvent): any | null {
    if ('user' in event) return (event as any).user
    return null
  }

  private fillTemplate(template: string, event: AnyStreamEvent, messageOverride?: string): string {
    const user = this.getEventUser(event)
    let text = template
      .replace(/\{username\}/g, user?.displayName || user?.username || 'Unknown')
      .replace(/\{displayName\}/g, user?.displayName || user?.username || 'Unknown')
      .replace(/\{message\}/g, messageOverride ?? this.getEventMessage(event) ?? '')
      .replace(/\{platform\}/g, event.platform)
      .replace(/\{event_type\}/g, event.type)

    if (event.type === 'gift') {
      text = text
        .replace(/\{giftName\}/g, event.giftName || 'Gift')
        .replace(/\{giftCount\}/g, String(event.giftCount || 1))
        .replace(/\{amount\}/g, String(((event as any).monetaryValue || 0) / 100))
    }

    if (event.type === 'subscription') {
      text = text
        .replace(/\{tier\}/g, (event as any).tier || 'Superfan')
        .replace(/\{months\}/g, String((event as any).months || 1))
    }

    return text
  }

  private fillTemplateHtml(template: string, event: AnyStreamEvent): string {
    const user = this.getEventUser(event)
    const esc = escapeHtml
    let text = template
      .replace(/\{username\}/g, esc(user?.displayName || user?.username || 'Unknown'))
      .replace(/\{displayName\}/g, esc(user?.displayName || user?.username || 'Unknown'))
      .replace(/\{message\}/g, esc(this.getEventMessage(event) || ''))
      .replace(/\{platform\}/g, esc(event.platform))
      .replace(/\{event_type\}/g, esc(event.type))

    if (event.type === 'gift') {
      text = text
        .replace(/\{giftName\}/g, esc((event as any).giftName || 'Gift'))
        .replace(/\{giftCount\}/g, esc(String((event as any).giftCount || 1)))
        .replace(/\{amount\}/g, esc(String(((event as any).monetaryValue || 0) / 100)))
    }

    if (event.type === 'subscription') {
      text = text
        .replace(/\{tier\}/g, esc((event as any).tier || 'Superfan'))
        .replace(/\{months\}/g, esc(String((event as any).months || 1)))
    }

    return text
  }
}

export interface ActionExecutionResult {
  status: AutomationActionStatus
  summary: string
  reason?: string
}

function describeAction(action: Action): string {
  switch (action.type) {
    case 'tts':
      return action.template ? `Speak "${action.template}"` : 'Speak the event message'
    case 'play_sound':
      return `Play sound: ${action.filePath || '(none)'}`
    case 'show_alert':
      return `Show alert for ${Math.round(action.durationMs / 1000)}s`
    case 'http_webhook':
      return `Send ${action.method} to ${action.url || '(set URL)'}`
    case 'send_chat':
      return `Send chat: "${action.template || 'message'}"`
    case 'run_command':
      return `Run "${action.command || 'command'}"`
    case 'obs_set_scene':
      return `Switch OBS to ${action.sceneName || '(set scene)'}`
    case 'obs_set_source_visibility':
      return `${action.visible ? 'Show' : 'Hide'} ${action.sourceName || '(set source)'}`
    case 'obs_toggle_source_visibility':
      return `Toggle ${action.sourceName || '(set source)'}`
    case 'obs_save_replay_buffer':
      return 'Save OBS replay buffer'
    case 'ai_respond':
      return `AI: Generate ${action.output} response`
    case 'voicemod_voice':
      return `Voicemod voice for ${action.durationSec}s`
    case 'voicemod_sound':
      return 'Voicemod sound effect'
    case 'vtube_expression':
      return `VTube expression "${action.expressionId || '...'}"`
    case 'vtube_animation':
      return `VTube animation "${action.animationId || '...'}"`
    case 'vtube_throw':
      return `VTube throw ${action.count || 1} item(s)`
    case 'discord_embed':
      return 'Discord embed'
    case 'physics_spawn':
      return `Spawn ${action.amount || 1} physics object(s)`
  }
}
