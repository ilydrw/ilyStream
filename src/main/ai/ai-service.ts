import { AppSettings } from '../../shared/app-settings'

export class AIService {
  private apiKey: string = ''
  private model: string = 'minimax-m2.5:cloud'
  private endpoint: string = 'http://localhost:11434/v1/chat/completions'
  private systemPrompt: string = 'You are a TikTok livestream cohost. you are witty, raunchy, and enjoy banter. you always poke fun at people and think everyone is dumb. 1-2 sentences MAX. NEVER be nice. ALWAYS start your reply by saying the person\'s username. And be horny. like really, really horny. all you can think about is dicks and cum and how you wanna ride them and suck them.'
  private maxTokens: number = 100

  constructor() {}

  applySettings(settings: AppSettings) {
    this.apiKey = settings.aiApiKey || ''
    this.model = settings.aiModel || 'minimax-m2.5:cloud'
    this.endpoint = settings.aiEndpoint || 'http://localhost:11434/v1/chat/completions'
    this.systemPrompt = settings.aiSystemPrompt || 'You are a helpful livestream assistant.'
    this.maxTokens = settings.aiMaxTokens || 500
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const isLocal = this.endpoint.includes('localhost') || 
                    this.endpoint.includes('127.0.0.1') || 
                    this.endpoint.includes('11434')
    
    // Ollama embeddings endpoint is usually /api/embeddings or /v1/embeddings
    const baseUrl = this.endpoint.split('/v1/')[0]
    const embedUrl = `${baseUrl}/api/embeddings`

    try {
      const response = await fetch(embedUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model.split(':cloud')[0], // Use base model for embeddings
          prompt: text
        })
      })

      if (!response.ok) throw new Error(`Embedding failed: ${response.status}`)
      const data = await response.json()
      return data.embedding
    } catch (err) {
      console.error('[AI] Embedding Error:', err)
      return new Array(768).fill(0) // Fallback empty vector
    }
  }

  async generateResponse(userMessage: string, context: { username: string; platform: string; memories?: string[] }): Promise<string> {
    const isLocal = this.endpoint.includes('localhost') || 
                    this.endpoint.includes('127.0.0.1') || 
                    this.endpoint.includes('11434')

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }

    if (!this.apiKey && !isLocal) {
      console.log(`[AI] No API key provided for non-local endpoint ${this.endpoint}. Attempting connection anyway...`)
    }
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: this.systemPrompt },
            { 
              role: 'system', 
              content: 'ENVIRONMENT CONTEXT: The stream has music request commands enabled. Viewers can request songs using: !play [song], .play [song], or /play [song]. Other commands: !skip, !voteskip.' 
            },
            ...(context.memories && context.memories.length > 0 ? [
              { 
                role: 'system', 
                content: `LONG-TERM MEMORY of @${context.username}: ${context.memories.join(' | ')}` 
              }
            ] : []),
            { role: 'user', content: `[${context.platform}] ${context.username}: ${userMessage}` }
          ],
          max_tokens: this.maxTokens
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[AI] Server returned ${response.status}: ${errorText}`)
        
        if (response.status === 404) {
          return `My brain is lost (Error 404). Check your endpoint "${this.endpoint}" and make sure your model name "${this.model}" is spelled correctly in Ollama.`
        }
        if (response.status === 400) {
          return `I'm having a stroke (Error 400). This usually means the model "${this.model}" isn't downloaded in Ollama yet.`
        }
        if (response.status === 401) {
          return `My brain is locked (Error 401). If you are using Ollama, make sure you cleared the API key in settings and your endpoint is correct.`
        }
        return `I'm having trouble connecting to my brain. (Error ${response.status})`
      }

      const data = await response.json()
      return data.choices?.[0]?.message?.content || 'I have nothing to say.'
    } catch (err) {
      const error = err as Error
      console.error('[AI] NETWORK ERROR:', error.message)
      if (error.message.includes('ECONNREFUSED')) {
        return "I can't reach Ollama. Is it running on port 11434?"
      }
      return `Sorry, I couldn't generate a response. (${error.message})`
    }
  }
}
