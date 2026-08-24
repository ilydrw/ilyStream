import { afterEach, describe, expect, it, vi } from 'vitest'
import { AIService } from './ai-service'

const settings = {
  enabled: true,
  requireCommand: true,
  commandPrefixes: ['!ai'],
  voiceProfileId: '',
  speechPrefix: '',
  apiKey: '',
  model: 'minimax-m2.5:cloud',
  endpoint: 'http://localhost:11434/v1/chat/completions',
  systemPrompt: 'Keep replies short.',
  maxTokens: 256
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AIService retired Ollama model recovery', () => {
  it('retries with an installed local chat model and persists it', async () => {
    const persistModel = vi.fn()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'minimax-m2.5 was retired' }), { status: 410 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [
          { id: 'minimax-m2.7:cloud' },
          { id: 'nomic-embed-text:latest' },
          { id: 'glm-4.7-flash:latest' }
        ]
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        message: { content: 'Recovered response' }
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const service = new AIService(persistModel)
    service.applySettings(settings)

    await expect(service.generateResponse('hello', { username: 'viewer', platform: 'twitch' }))
      .resolves.toBe('Recovered response')
    expect(service.getActiveModel()).toBe('glm-4.7-flash:latest')
    expect(persistModel).toHaveBeenCalledWith('glm-4.7-flash:latest')
    expect(fetchMock).toHaveBeenCalledTimes(3)

    const replacementRequest = JSON.parse(fetchMock.mock.calls[2][1].body as string)
    expect(replacementRequest.model).toBe('glm-4.7-flash:latest')
    expect(replacementRequest.think).toBe(false)
    expect(replacementRequest.options).toEqual({ num_ctx: 8192, num_predict: 256 })
    expect(fetchMock.mock.calls[2][0]).toBe('http://localhost:11434/api/chat')
  })

  it('does not substitute models for a non-Ollama provider', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'model retired' }), { status: 410 })
    )
    vi.stubGlobal('fetch', fetchMock)

    const service = new AIService()
    service.applySettings({
      ...settings,
      endpoint: 'https://example.com/v1/chat/completions'
    })

    await expect(service.generateResponse('hello', { username: 'viewer', platform: 'twitch' }))
      .rejects.toThrow('Model "minimax-m2.5:cloud" was retired')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(request.think).toBeUndefined()
    expect(request.max_tokens).toBe(256)
  })
})
