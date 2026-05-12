import { EventEmitter } from 'events'
import type { AnyStreamEvent, ChatEvent } from '../../platforms/types'
import type { Action, AIRespondAction } from '../trigger-types'
import type { TTSEngine } from '../../tts/tts-engine'
import type { AIService } from '../../ai/ai-service'

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;'
}

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]!)
}

export class ActionExecutor extends EventEmitter {
  constructor(private ttsEngine: TTSEngine, private aiService: AIService) {
    super()
  }

  async execute(action: Action, event: AnyStreamEvent): Promise<void> {
    switch (action.type) {
      case 'tts': {
        const speechMessage =
          event.type === 'chat' ? this.ttsEngine.prepareChatSpeechMessage(event as ChatEvent) : null
        if (event.type === 'chat' && !speechMessage) return

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
        break
      }

      case 'play_sound':
        this.emit('play-sound', action, event)
        break

      case 'show_alert': {
        const alertHtml = this.fillTemplateHtml(action.template, event)
        this.emit('show-alert', { ...action, template: alertHtml, imageUrl: action.imageUrl }, event)
        break
      }

      case 'http_webhook':
        await this.executeWebhook(action, event)
        break

      case 'run_command':
        this.emit('run-command', action, event)
        break

      case 'obs_set_scene':
      case 'obs_set_source_visibility':
      case 'obs_toggle_source_visibility':
        this.emit('obs-control', action, event)
        break

      case 'ai_respond':
        await this.executeAIRespond(action, event)
        break

      case 'voicemod_voice':
      case 'voicemod_sound':
        this.emit('voicemod', action, event)
        break

      case 'vtube_expression':
      case 'vtube_animation':
      case 'vtube_throw':
        this.emit('vtube', action, event)
        break

      case 'discord_embed':
        this.emit('discord', action, event)
        break

      case 'physics_spawn':
        this.emit('physics', action, event)
        break
    }
  }

  private async executeAIRespond(action: AIRespondAction, event: AnyStreamEvent): Promise<void> {
    const user = this.getEventUser(event)
    const speechMessage =
      event.type === 'chat' ? this.ttsEngine.prepareChatSpeechMessage(event as ChatEvent) : null
    if (event.type === 'chat' && !speechMessage) return

    const message = speechMessage || this.getEventMessage(event) || '(no message)'

    const responseText = await this.aiService.generateResponse(message, {
      username: user?.username || 'Unknown',
      platform: event.platform
    })

    if (action.output === 'chat' || action.output === 'both') {
      this.emit('send-chat', { platform: event.platform, message: responseText })
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
  }

  private async executeWebhook(action: Action & { type: 'http_webhook' }, event: AnyStreamEvent): Promise<void> {
    try {
      const body = this.fillTemplate(action.body, event)
      await fetch(action.url, {
        method: action.method,
        headers: { 'Content-Type': 'application/json', ...action.headers },
        body: action.method !== 'GET' ? body : undefined
      })
    } catch (error) {
      console.error('[triggers] Webhook failed:', error)
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
