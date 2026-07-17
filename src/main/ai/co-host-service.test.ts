import { EventEmitter } from 'events'
import { describe, expect, it, vi } from 'vitest'
import { CoHostService } from './co-host-service'

describe('CoHostService', () => {
  it('passes the configured dedicated voice profile to TTS', async () => {
    const platformManager = new EventEmitter()
    const aiService = {
      generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2]),
      generateResponse: vi.fn().mockResolvedValue('Hello from the co-host')
    }
    const ttsEngine = { enqueue: vi.fn().mockReturnValue(true) }
    const chatRelayService = {
      sendManualMessage: vi.fn().mockResolvedValue([{ platform: 'tiktok', ok: true }])
    }
    const memoryService = {
      getRelevantMemories: vi.fn().mockResolvedValue([]),
      addMemory: vi.fn().mockResolvedValue(undefined)
    }

    const service = new CoHostService(
      platformManager as any,
      aiService as any,
      ttsEngine as any,
      chatRelayService as any,
      memoryService as any
    )
    service.applySettings({
      enabled: true,
      endpoint: '',
      apiKey: '',
      systemPrompt: '',
      maxTokens: 256,
      requireCommand: true,
      commandPrefixes: ['!ai'],
      voiceProfileId: 'queena-chaos-profile',
      speechPrefix: '',
      model: ''
    })

    platformManager.emit('event', {
      id: 'chat-1',
      type: 'chat',
      platform: 'tiktok',
      message: '!ai say hi',
      timestamp: new Date(),
      isReply: false,
      user: {
        id: 'viewer-1',
        username: 'viewer',
        displayName: 'Viewer',
        isModerator: false,
        isSubscriber: false,
        isVip: false,
        badges: []
      }
    })

    await vi.waitFor(() => {
      expect(ttsEngine.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Hello from the co-host',
          voiceProfileId: 'queena-chaos-profile'
        })
      )
    })
  })
})
