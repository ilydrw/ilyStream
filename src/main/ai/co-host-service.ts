import { PlatformManager } from '../platforms/platform-manager'
import { AIService } from './ai-service'
import { TTSEngine } from '../tts/tts-engine'
import { ChatRelayService, isSuppressedChatRelayEcho } from '../chat/chat-relay-service'
import { ChatEvent } from '../platforms/types'
import { AppSettings } from '../../shared/app-settings'
import { classifyAiCommand, classifyAmbientAiPrompt } from '../../shared/chat-command-intent'
import { isCohostIdentity } from './cohost-identity'

import { MemoryService } from './memory-service'

export class CoHostService {
  private lastResponseTime = 0
  private readonly COOLDOWN_MS = 5000 // 5 seconds between AI responses
  private enabled = false
  private requireCommand = true
  private commandPrefixes = ['!ai']

  constructor(
    private platformManager: PlatformManager,
    private aiService: AIService,
    private ttsEngine: TTSEngine,
    private chatRelayService: ChatRelayService,
    private memoryService: MemoryService,
    private statsService?: any
  ) {
    this.platformManager.on('event', (event) => {
      if (this.enabled && event.type === 'chat') {
        this.handleChat(event as ChatEvent)
      }
    })
  }

  public applySettings(settings: AppSettings['ai']): void {
    this.enabled = settings?.enabled ?? false
    this.requireCommand = settings?.requireCommand ?? true
    this.commandPrefixes = normalizeCommandPrefixes(settings?.commandPrefixes ?? [], ['!ai'])
  }

  private async handleChat(event: ChatEvent): Promise<void> {
    const message = event.message.trim()

    // 0. Prevent the AI from responding to itself or bots
    if (isCohostIdentity(event.user) || isSuppressedChatRelayEcho(event)) return

    const commandIntent = classifyAiCommand(message, this.commandPrefixes)
    const aiIntent = commandIntent.executable
      ? commandIntent
      : this.requireCommand
        ? commandIntent
        : classifyAmbientAiPrompt(message)

    if (!aiIntent.executable) return

    const prompt = aiIntent.prompt.trim()
    if (!prompt) return

    console.log(`[CoHost] Triggered by "${event.user.username}": "${message}"`)

    // 1. Ignore replies
    if (event.isReply) return

    // 2. Count a real AI prompt as usage before response cooldown/generation
    // can prevent the bot from answering. This keeps profile stats honest for
    // valid prompts sent during cooldowns or provider failures.
    this.recordCohostCall(event)

    // 3. Anti-spam check
    const now = Date.now()
    if (now - this.lastResponseTime < this.COOLDOWN_MS) {
      console.warn(`[CoHost] Skipping (Cooldown active: ${Math.round((this.COOLDOWN_MS - (now - this.lastResponseTime)) / 1000)}s remaining)`)
      return
    }

    this.lastResponseTime = now

    try {
      // 4. Vector Memory Retrieval
      const queryVector = await this.aiService.generateEmbedding(prompt)
      const memories = await this.memoryService.getRelevantMemories(
        event.user.username,
        event.platform,
        queryVector
      )

      // 5. Generate response via Ollama Minimax with memory context
      const response = await this.aiService.generateResponse(prompt, {
        username: event.user.displayName,
        platform: event.platform,
        memories
      })

      console.log(`[CoHost] AI Speaking: "${response.slice(0, 50)}..."`)

      // 5. Speak it - Use the user's default voice profile but keep the robot effect
      this.ttsEngine.enqueue({
        text: response,
        username: 'ilyStream AI',
        platform: 'all',
        priority: 'urgent',
        eventType: 'chat'
      })

      // 6. Post it back. If the platform accepts the message, its normal
      // chat echo path can show it; otherwise emit a local fallback below.
      const sendResults = await this.chatRelayService.sendManualMessage([event.platform], response)
      const platformSendSucceeded = sendResults.some((result) => result.platform === event.platform && result.ok)
      
      // 7. Emit a local event so the Overlay / Chat Widget sees it
      if (!platformSendSucceeded) {
        this.platformManager.emit('event', {
          id: `ai-${Date.now()}`,
          type: 'chat',
          platform: event.platform,
          message: response,
          user: {
            id: 'ai-cohost',
            username: 'ai-cohost',
            displayName: 'ilyStream AI',
            profilePictureUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=ilyStream',
            isModerator: true,
            isSubscriber: false,
            isVip: false,
            badges: [{ id: 'moderator', name: 'AI' }]
          },
          isReply: false,
          timestamp: new Date()
        })
      }

      // 8. Store new memory (asynchronously)
      this.aiService.generateEmbedding(`${prompt} -> ${response}`).then(newVector => {
        this.memoryService.addMemory(
          event.user.username,
          event.platform,
          `${prompt} -> ${response}`,
          newVector
        )
      }).catch(err => console.error('[Memory] Failed to save memory:', err))
      
    } catch (error) {
      console.error('[CoHost] AI ERROR:', (error as Error).message)
    }
  }

  private recordCohostCall(event: ChatEvent): void {
    if (!this.statsService) return

    try {
      this.statsService.recordCohostCall(event.platform, event.user)
    } catch (err) {
      console.error('[CoHost] Failed to record stats:', err)
    }
  }
}

function normalizeCommandPrefixes(prefixes: string[], fallback: string[]): string[] {
  const normalized = prefixes.map((prefix) => prefix.trim()).filter(Boolean)
  return normalized.length > 0 ? normalized : fallback
}
