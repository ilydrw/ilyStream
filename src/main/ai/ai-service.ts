import { AppSettings } from '../../shared/app-settings'

export class AIService {
  private apiKey: string = ''
  private model: string = 'minimax-m2.5:cloud'
  private endpoint: string = 'http://localhost:11434/v1/chat/completions'
  private systemPrompt: string = 'You are an upbeat livestream co-host. Keep replies short, specific, playful, and safe for a broad audience. Start with the viewer name when it feels natural.'
  private maxTokens: number = 100

  // Embedding state — embeddings are optional and gracefully degrade when no
  // embedding model is installed. We cache the unavailability so we don't spam
  // 404s on every chat message (which is what was happening with the legacy
  // /api/embeddings + stripped :cloud suffix path).
  private embeddingsDisabled: boolean = false
  private embeddingDisabledReason: string = ''
  private embeddingModelTried: string = ''

  constructor() {}

  applySettings(settings: AppSettings['ai']) {
    if (!settings) return
    this.apiKey = settings.apiKey || ''
    const nextModel = settings.model || 'minimax-m2.5:cloud'
    if (nextModel !== this.model) {
      // Reset embedding probe — new chat model might pair with a different embed model.
      this.embeddingsDisabled = false
      this.embeddingDisabledReason = ''
      this.embeddingModelTried = ''
    }
    this.model = nextModel
    this.endpoint = settings.endpoint || 'http://localhost:11434/v1/chat/completions'
    this.systemPrompt = settings.systemPrompt || 'You are a helpful livestream assistant.'
    this.maxTokens = settings.maxTokens || 500
  }

  /**
   * Returns a semantic embedding for `text`, or an empty array when no
   * embedding model is available. Callers (memory service, CoHost) should treat
   * `[]` as "skip memory" rather than store a meaningless zero vector.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (this.embeddingsDisabled) return []

    const baseUrl = this.endpoint.split('/v1/')[0]
    // Try the modern endpoint first; fall back to the legacy one for older Ollama builds.
    const candidates = [
      { url: `${baseUrl}/api/embed`, field: 'input' as const },
      { url: `${baseUrl}/api/embeddings`, field: 'prompt' as const }
    ]

    // Cloud chat models (`:cloud` suffix) can't be used for embeddings — Ollama
    // returns 401. Use a dedicated local embedding model instead. nomic-embed-text
    // is the default Ollama recommendation; users can `ollama pull nomic-embed-text`.
    const embedModel = this.model.includes(':cloud') ? 'nomic-embed-text' : this.model
    this.embeddingModelTried = embedModel

    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: embedModel, [candidate.field]: text })
        })

        if (response.ok) {
          const data = (await response.json()) as {
            embeddings?: number[][]
            embedding?: number[]
          }
          // `/api/embed` returns `embeddings: number[][]`, legacy returns `embedding: number[]`.
          const vec: number[] | undefined = data.embeddings?.[0] ?? data.embedding
          if (Array.isArray(vec) && vec.length > 0) return vec
        } else if (response.status !== 404) {
          // 404 means this endpoint doesn't exist on this Ollama build; try the next one.
          // Any other status (401, 501, etc.) means the endpoint works but rejected us — give up.
          const body = await response.text().catch(() => '')
          this.disableEmbeddings(`HTTP ${response.status}: ${body.slice(0, 200)}`)
          return []
        }
      } catch (err) {
        this.disableEmbeddings((err as Error).message)
        return []
      }
    }

    this.disableEmbeddings(`no embedding endpoint accepted model "${embedModel}". Try \`ollama pull nomic-embed-text\`.`)
    return []
  }

  private disableEmbeddings(reason: string): void {
    this.embeddingsDisabled = true
    this.embeddingDisabledReason = reason
    console.warn(`[AI] Embeddings disabled (${reason}). AI co-host will run without long-term memory until restart or model change.`)
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

        // Throw instead of returning a string. Callers (CoHost, triggers,
        // renderer) wrap in try/catch and log — otherwise the error message
        // would be spoken aloud by TTS, which is what users were hearing.
        const usingCloudModel = this.model.includes(':cloud')
        const messageDetail = parseOllamaErrorMessage(errorText)

        if (response.status === 404) {
          throw new Error(
            `404: Endpoint "${this.endpoint}" not found, or model "${this.model}" isn't installed (try "ollama pull ${this.model}").`
          )
        }
        if (response.status === 400) {
          throw new Error(
            `400: Bad request — usually the model "${this.model}" isn't downloaded yet${messageDetail ? `. ${messageDetail}` : ''}.`
          )
        }
        if (response.status === 401) {
          throw new Error(
            `401: Unauthorized — clear the API key for local Ollama, or paste a valid key for hosted providers.`
          )
        }
        if (response.status === 403) {
          if (usingCloudModel) {
            throw new Error(
              `403: Ollama Cloud rejected the request. Model "${this.model}" requires an Ollama account (sign in via "ollama signin") or an API key in Settings → Intelligence → Access Key.`
            )
          }
          throw new Error(
            `403: Forbidden — your API key is missing, invalid, or lacks access to model "${this.model}"${messageDetail ? `. ${messageDetail}` : ''}.`
          )
        }
        if (response.status === 429) {
          throw new Error(`429: Rate limited by the AI provider — slow down or upgrade your plan.`)
        }
        throw new Error(`HTTP ${response.status}: ${messageDetail || errorText || response.statusText}`)
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const content = data.choices?.[0]?.message?.content || 'I have nothing to say.'
      return normalizeAIResponse(content)
    } catch (err) {
      const error = err as Error
      console.error('[AI] NETWORK ERROR:', error.message)
      if (error.message.includes('ECONNREFUSED')) {
        throw new Error("Can't reach Ollama at " + this.endpoint + ' — make sure `ollama serve` is running.')
      }
      throw error
    }
  }
}

function parseOllamaErrorMessage(raw: string): string {
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw)
    return parsed?.error?.message || parsed?.error || parsed?.message || ''
  } catch {
    return raw.length > 200 ? raw.slice(0, 200) + '…' : raw
  }
}

/**
 * Strip Markdown code fences and unwrap JSON envelopes so the spoken/sent
 * output is just the conversational text — not `mode`/`risk`/`confidence`/etc.
 *
 * The default system prompt teaches the model a JSON schema for structured
 * mode; some models return that envelope even when free-form text was asked.
 * This function makes that always-safe.
 */
function normalizeAIResponse(raw: string): string {
  if (!raw) return raw
  let text = raw.trim()

  // Strip ```json ... ``` or ``` ... ``` fences (with or without language tag).
  const fenceMatch = text.match(/^```(?:[a-zA-Z]+)?\s*\n?([\s\S]*?)\n?```\s*$/)
  if (fenceMatch) text = fenceMatch[1].trim()

  // If the whole thing parses as a JSON envelope, prefer common spoken fields.
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    try {
      const parsed = JSON.parse(text)
      const candidate =
        parsed?.speak ??
        parsed?.response ??
        parsed?.message ??
        parsed?.text ??
        parsed?.content ??
        (Array.isArray(parsed) ? parsed.find((v) => typeof v === 'string') : undefined)
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim()
      }
    } catch {
      // Not valid JSON — fall through to raw text below.
    }
  }

  return text
}

