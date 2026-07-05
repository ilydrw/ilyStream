const DEFAULT_AI_COMMAND_PREFIXES = ['!ai']

const SONG_REQUEST_COMMANDS = new Set(['!sr', '!songrequest', '!play', '.play', '/play'])
const EXPLICIT_SONG_REQUEST_COMMANDS = new Set(['!sr', '!songrequest'])
const AMBIGUOUS_PLAY_COMMANDS = new Set(['!play', '.play', '/play'])
const SKIP_COMMANDS = new Set(['!skip', '!voteskip', '.skip', '/skip'])

const AI_LITERAL_OPENERS = new Set([
  'is',
  'are',
  'am',
  'was',
  'were',
  'be',
  'being',
  'been',
  'looks',
  'look',
  'seems',
  'seem',
  'sounds',
  'sound',
  'feels',
  'feel'
])

export type AiCommandIntent =
  | { kind: 'ai'; executable: true; command: string; prompt: string }
  | { kind: 'literal' | 'none'; executable: false; command?: string; reason?: string }

export type SpotifyCommandIntent =
  | { kind: 'song-request'; executable: true; command: string; query: string }
  | { kind: 'skip'; executable: true; command: string }
  | { kind: 'literal' | 'none'; executable: false; command?: string; reason?: string }

interface LeadingCommand {
  command: string
  argument: string
}

export function classifyAiCommand(
  message: string,
  prefixes: string[] = DEFAULT_AI_COMMAND_PREFIXES
): AiCommandIntent {
  const parsed = parseLeadingCommand(message)
  if (!parsed) return { kind: 'none', executable: false }

  const allowedPrefixes = normalizeCommandPrefixes(prefixes, DEFAULT_AI_COMMAND_PREFIXES)
  if (!allowedPrefixes.includes(parsed.command)) return { kind: 'none', executable: false }
  if (!parsed.argument) return { kind: 'literal', executable: false, command: parsed.command, reason: 'missing-prompt' }
  if (looksLikeLiteralAiSentence(parsed.argument)) {
    return { kind: 'literal', executable: false, command: parsed.command, reason: 'declarative-sentence' }
  }

  return {
    kind: 'ai',
    executable: true,
    command: parsed.command,
    prompt: parsed.argument
  }
}

export function classifyAmbientAiPrompt(message: string): AiCommandIntent {
  const prompt = message.trim()
  if (!prompt) return { kind: 'none', executable: false }

  const lower = prompt.toLowerCase()
  const mentionsCohost = /\b(ai|cohost|assistant|chatgpt)\b/.test(lower)
  const directAddress = /\b(?:hey|ok|okay)\s+(?:ai|cohost|assistant)\b/.test(lower)
  const asksForHelp = /\b(?:ai|cohost|assistant)\b[\s,.:;-]*(?:say|tell|explain|answer|help|respond|what|why|how|when|where|who|can|could|should|would|do|does|is|are)\b/.test(lower)

  if ((mentionsCohost && prompt.includes('?')) || directAddress || asksForHelp) {
    return {
      kind: 'ai',
      executable: true,
      command: 'ambient',
      prompt
    }
  }

  return { kind: 'none', executable: false }
}

export function classifySpotifyCommand(message: string): SpotifyCommandIntent {
  const parsed = parseLeadingCommand(message)
  if (!parsed) return { kind: 'none', executable: false }

  if (SONG_REQUEST_COMMANDS.has(parsed.command)) {
    if (!parsed.argument) {
      return { kind: 'literal', executable: false, command: parsed.command, reason: 'missing-query' }
    }

    if (EXPLICIT_SONG_REQUEST_COMMANDS.has(parsed.command) || looksLikeIntentionalSongRequest(parsed.argument)) {
      return {
        kind: 'song-request',
        executable: true,
        command: parsed.command,
        query: parsed.argument
      }
    }

    return { kind: 'literal', executable: false, command: parsed.command, reason: 'ambiguous-play-command' }
  }

  if (SKIP_COMMANDS.has(parsed.command)) {
    return { kind: 'skip', executable: true, command: parsed.command }
  }

  return { kind: 'none', executable: false }
}

export function shouldSuppressChatTtsForCommand(message: string): boolean {
  return classifyAiCommand(message).executable || classifySpotifyCommand(message).executable
}

function parseLeadingCommand(message: string): LeadingCommand | null {
  const trimmed = message.trim()
  if (!trimmed) return null

  const match = trimmed.match(/^(\S+)(?:\s+([\s\S]*))?$/)
  if (!match) return null

  return {
    command: match[1].toLowerCase(),
    argument: (match[2] ?? '').trim()
  }
}

function normalizeCommandPrefixes(prefixes: string[], fallback: string[]): string[] {
  const normalized = prefixes
    .map((prefix) => prefix.trim().toLowerCase())
    .filter(Boolean)

  return normalized.length > 0 ? normalized : fallback
}

function firstWord(value: string): string {
  return value
    .trim()
    .split(/\s+/)[0]
    ?.replace(/^[("'`]+|[.,!?;:)"'`]+$/g, '')
    .toLowerCase() || ''
}

function looksLikeLiteralAiSentence(argument: string): boolean {
  if (argument.includes('?')) return false
  return AI_LITERAL_OPENERS.has(firstWord(argument))
}

function looksLikeIntentionalSongRequest(argument: string): boolean {
  const normalized = argument.trim()
  if (!normalized) return false

  const lower = normalized.toLowerCase()
  return (
    /^https?:\/\//i.test(normalized) ||
    /^spotify:/i.test(normalized) ||
    /^["'].*["']$/.test(normalized) ||
    /\s+-\s+/.test(normalized) ||
    /\s+by\s+/i.test(normalized) ||
    /\b(song|track|music|artist|album|spotify|lyric|lyrics|remix|cover|soundtrack|ost|official audio)\b/.test(lower)
  )
}

export function isAmbiguousPlayCommand(message: string): boolean {
  const parsed = parseLeadingCommand(message)
  return Boolean(parsed && AMBIGUOUS_PLAY_COMMANDS.has(parsed.command))
}
