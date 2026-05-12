import { PlatformManager } from '../platforms/platform-manager'
import { AIService } from './ai-service'
import { TTSEngine } from '../tts/tts-engine'
import { ChatRelayService } from '../chat/chat-relay-service'
import { ChatEvent } from '../platforms/types'
import { AppSettings } from '../../shared/app-settings'

import { MemoryService } from './memory-service'

export class CoHostService {
  private lastResponseTime = 0
  private readonly COOLDOWN_MS = 5000 // 5 seconds between AI responses
  private enabled = false

  constructor(
    private platformManager: PlatformManager,
    private aiService: AIService,
    private ttsEngine: TTSEngine,
    private chatRelayService: ChatRelayService,
    private memoryService: MemoryService
  ) {
    this.platformManager.on('event', (event) => {
      if (this.enabled && event.type === 'chat') {
        this.handleChat(event as ChatEvent)
      }
    })
  }

  public applySettings(settings: AppSettings['ai']): void {
    this.enabled = settings?.enabled ?? false
  }

  private async handleChat(event: ChatEvent): Promise<void> {
    const message = event.message.trim()

    // 0. Prevent the AI from responding to itself or bots
    if (event.user.username === 'ai-cohost' || event.user.username === 'bot') return
    
    const lowerMessage = message.toLowerCase()
    
    // ONLY trigger if message starts with !ai or !AI
    if (!lowerMessage.startsWith('!ai')) {
      return
    }

    console.log(`[CoHost] Triggered by "${event.user.username}": "${message}"`)

    // 2. Anti-spam check
    const now = Date.now()
    if (now - this.lastResponseTime < this.COOLDOWN_MS) {
      console.warn(`[CoHost] Skipping (Cooldown active: ${Math.round((this.COOLDOWN_MS - (now - this.lastResponseTime)) / 1000)}s remaining)`)
      return
    }

    // 3. Ignore replies
    if (event.isReply) return

    const prompt = message.slice(3).trim()
    if (!prompt) return

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

      // 6. Post it back
      await this.chatRelayService.sendManualMessage([event.platform], response)
      
      // 7. Emit a local event so the Overlay / Chat Widget sees it
      this.platformManager.emit('event', {
        id: `ai-${Date.now()}`,
        type: 'chat',
        platform: event.platform,
        message: response,
        user: {
          id: 'ai-cohost',
          username: 'ai-cohost',
          displayName: 'ilyStream AI',
          profilePictureUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=ilyStream', // Cool bot avatar
          isModerator: true,
          isSubscriber: false,
          isVip: false,
          badges: [{ id: 'moderator', name: 'AI' }]
        },
        isReply: false,
        timestamp: new Date()
      })

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
}
