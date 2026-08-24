import { DEFAULT_APP_SETTINGS, type AppSettings } from '../../shared/app-settings'

type PersistModel = (model: string) => void | Promise<void>
const OLLAMA_COHOST_CONTEXT_TOKENS = 8192

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>
  message?: { content?: string }
}

interface OllamaModelList {
  data?: Array<{ id?: string }>
}

export class AIService {
  private apiKey: string = ''
  private model: string = DEFAULT_APP_SETTINGS.ai.model
  private endpoint: string = DEFAULT_APP_SETTINGS.ai.endpoint
  private systemPrompt: string = DEFAULT_APP_SETTINGS.ai.systemPrompt
  private maxTokens: number = DEFAULT_APP_SETTINGS.ai.maxTokens

  // Embedding state — embeddings are optional and gracefully degrade when no
  // embedding model is installed. We cache the unavailability so we don't spam
  // 404s on every chat message (which is what was happening with the legacy
  // /api/embeddings + stripped :cloud suffix path).
  private embeddingsDisabled: boolean = false
  private embeddingDisabledReason: string = ''
  private embeddingModelTried: string = ''

  constructor(private readonly persistRecoveredModel?: PersistModel) {}

  applySettings(settings: AppSettings['ai']) {
    if (!settings) return
    this.apiKey = settings.apiKey || ''
    this.setModel(settings.model || DEFAULT_APP_SETTINGS.ai.model)
    this.endpoint = settings.endpoint || DEFAULT_APP_SETTINGS.ai.endpoint
    this.systemPrompt = settings.systemPrompt || DEFAULT_APP_SETTINGS.ai.systemPrompt
    this.maxTokens = settings.maxTokens || DEFAULT_APP_SETTINGS.ai.maxTokens
  }

  getActiveModel(): string {
    return this.model
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

  private setModel(model: string): void {
    if (model === this.model) return

    this.model = model
    // A recovered chat model may have different embedding support, so allow a
    // fresh probe instead of carrying forward the previous model's failure.
    this.embeddingsDisabled = false
    this.embeddingDisabledReason = ''
    this.embeddingModelTried = ''
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
    const messages = [
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
    ]

    try {
      let response = await this.requestChatCompletion(this.model, headers, messages)

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[AI] Server returned ${response.status}: ${errorText}`)

        const recovered = await this.recoverRetiredOllamaModel(response.status, errorText, headers, messages)
        if (recovered) {
          response = recovered
        } else {
          this.throwProviderError(response, errorText)
        }
      }

      const data = (await response.json()) as ChatCompletionResponse
      const content = data.choices?.[0]?.message?.content ?? data.message?.content ?? 'I have nothing to say.'
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

  private requestChatCompletion(
    model: string,
    headers: Record<string, string>,
    messages: Array<{ role: string; content: string }>
  ): Promise<Response> {
    const ollamaBaseUrl = getLocalOllamaBaseUrl(this.endpoint)
    const url = ollamaBaseUrl ? `${ollamaBaseUrl}/api/chat` : this.endpoint
    const body: Record<string, unknown> = ollamaBaseUrl
      ? {
          model,
          messages,
          stream: false,
          // A livestream reply needs low latency, not a visible reasoning
          // trace. Bounding context also avoids Ollama reserving the model's
          // entire 200k+ window on a streaming workstation.
          think: false,
          options: {
            num_ctx: OLLAMA_COHOST_CONTEXT_TOKENS,
            num_predict: this.maxTokens
          }
        }
      : { model, messages, max_tokens: this.maxTokens }

    return fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })
  }

  private async recoverRetiredOllamaModel(
    status: number,
    errorText: string,
    headers: Record<string, string>,
    messages: Array<{ role: string; content: string }>
  ): Promise<Response | null> {
    const ollamaBaseUrl = getLocalOllamaBaseUrl(this.endpoint)
    if (status !== 410 || !/retired/i.test(errorText) || !ollamaBaseUrl) return null

    let modelListResponse: Response
    try {
      modelListResponse = await fetch(`${ollamaBaseUrl}/v1/models`, { headers })
    } catch (err) {
      console.warn('[AI] Could not discover a replacement Ollama model:', (err as Error).message)
      return null
    }

    if (!modelListResponse.ok) return null

    const modelList = (await modelListResponse.json()) as OllamaModelList
    const candidates = (modelList.data || [])
      .map((entry) => entry.id?.trim() || '')
      .filter((model) => isLocalChatModel(model) && model !== this.model)

    for (const candidate of candidates) {
      console.warn(`[AI] Model "${this.model}" was retired. Trying installed local model "${candidate}".`)
      const response = await this.requestChatCompletion(candidate, headers, messages)
      if (!response.ok) {
        const candidateError = await response.text().catch(() => '')
        console.warn(`[AI] Replacement model "${candidate}" failed with HTTP ${response.status}: ${candidateError.slice(0, 200)}`)
        continue
      }

      this.setModel(candidate)
      try {
        await this.persistRecoveredModel?.(candidate)
      } catch (err) {
        // The response is usable even if persistence fails. Keep the recovered
        // model active for this session and try again after the next restart.
        console.warn('[AI] Could not persist recovered model:', (err as Error).message)
      }
      console.info(`[AI] Recovered from retired model with "${candidate}".`)
      return response
    }

    return null
  }

  private throwProviderError(response: Response, errorText: string): never {
    // Throw instead of returning a string. Callers (CoHost, triggers,
    // renderer) wrap in try/catch and log — otherwise the error message would
    // be spoken aloud by TTS.
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
    if (response.status === 410) {
      throw new Error(
        `410: Model "${this.model}" was retired. Choose another model installed in Ollama${messageDetail ? `. ${messageDetail}` : ''}.`
      )
    }
    if (response.status === 429) {
      throw new Error(`429: Rate limited by the AI provider — slow down or upgrade your plan.`)
    }
    throw new Error(`HTTP ${response.status}: ${messageDetail || errorText || response.statusText}`)
  }
}

function getLocalOllamaBaseUrl(endpoint: string): string | null {
  try {
    const url = new URL(endpoint)
    const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
    if (!isLoopback || url.port !== '11434') return null
    return `${url.protocol}//${url.host}`
  } catch {
    return null
  }
}

function isLocalChatModel(model: string): boolean {
  if (!model || model.endsWith(':cloud')) return false
  return !/(^|[-_.:])(embed|embedding)([-_.:]|$)/i.test(model)
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

