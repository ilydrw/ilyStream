/**
 * TTS text filter pipeline.
 * Applies profanity filtering, length limits, duplicate detection,
 * URL stripping, and username pronunciation overrides.
 */

export class TTSFilter {
  private maxLength = 120
  private minLength = 3
  private recentMessages: Map<string, number> = new Map()
  private duplicateWindowMs = 30_000
  private usernameOverrides: Map<string, string> = new Map()
  private blockedPatterns: RegExp[] = []
  private profanityList: Set<string> = new Set()
  private enabled = {
    profanity: true,
    duplicates: true,
    urlStrip: true,
    lengthLimit: true,
    readAtSymbol: false,
    skipMessagesStartingWithAt: false
  }

  /**
   * Apply all filters to a message. Returns null if the message should be rejected.
   */
  apply(text: string, username: string, bypassLengthLimit = false): string | null {
    let result = text

    // Strip URLs
    if (this.enabled.urlStrip) {
      result = this.stripUrls(result)
    }

    // Strip '@' if disabled (for mentions within messages)
    if (!this.enabled.readAtSymbol) {
      result = this.stripAtSymbol(result)
    }

    // Normalize text before content checks:
    //  - strip emoji (they become garbled or slow in TTS)
    //  - collapse runs of 4+ identical characters ("LOOOOOL" → "LOOOL")
    result = this.stripEmoji(result)
    result = this.normalizeRepeats(result)

    // Check blocked patterns
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(result)) return null
    }

    // Profanity filter (replace with asterisks)
    if (this.enabled.profanity) {
      result = this.filterProfanity(result)
    }

    // Apply username pronunciation overrides
    result = this.applyUsernameOverrides(result, username)

    // Reject if too short — avoids reading spam like "w", "l", "lol"
    if (result.trim().length < this.minLength) return null

    // Length limit — truncate rather than silence
    if (!bypassLengthLimit && this.enabled.lengthLimit && result.length > this.maxLength) {
      result = result.substring(0, this.maxLength).trimEnd() + '...'
    }

    // Duplicate detection should operate on the final spoken text.
    if (this.enabled.duplicates && this.isDuplicate(result)) {
      return null
    }

    // Reject if empty after filtering
    if (result.trim().length === 0) return null

    // Track for duplicate detection
    this.trackMessage(result)

    return result
  }

  // --- Configuration ---

  setMaxLength(length: number): void {
    this.maxLength = length
  }

  setMinLength(length: number): void {
    this.minLength = Math.max(0, length)
  }

  setDuplicateWindow(ms: number): void {
    this.duplicateWindowMs = ms
  }

  addProfanityWords(words: string[]): void {
    for (const word of words) {
      this.profanityList.add(word.toLowerCase())
    }
  }

  removeProfanityWords(words: string[]): void {
    for (const word of words) {
      this.profanityList.delete(word.toLowerCase())
    }
  }

  setProfanityList(words: string[]): void {
    this.profanityList = new Set(words.map((w) => w.toLowerCase()))
  }

  addBlockedPattern(pattern: string): void {
    if (pattern.length > 500) return // ReDoS guard
    try {
      this.blockedPatterns.push(new RegExp(pattern, 'i'))
    } catch {
      // Ignore invalid user-provided patterns instead of breaking TTS setup.
    }
  }

  setUsernameOverride(username: string, pronunciation: string): void {
    this.usernameOverrides.set(username.toLowerCase(), pronunciation)
  }

  removeUsernameOverride(username: string): void {
    this.usernameOverrides.delete(username.toLowerCase())
  }

  setFilterEnabled(filter: keyof typeof this.enabled, enabled: boolean): void {
    this.enabled[filter] = enabled
  }

  isFilterEnabled(filter: keyof typeof this.enabled): boolean {
    return this.enabled[filter]
  }

  // --- Internal methods ---

  private stripUrls(text: string): string {
    return text.replace(/https?:\/\/\S+/gi, '[link]')
  }

  private stripAtSymbol(text: string): string {
    return text.replace(/@/g, '')
  }

  private filterProfanity(text: string): string {
    if (this.profanityList.size === 0) return text

    let result = text
    for (const word of this.profanityList) {
      const regex = new RegExp(`\\b${this.escapeRegex(word)}\\b`, 'gi')
      result = result.replace(regex, '*'.repeat(word.length))
    }
    return result
  }

  private isDuplicate(text: string): boolean {
    const normalized = text.toLowerCase().trim()
    const now = Date.now()

    // MEMORY FIX: Only clean old entries periodically or if the map is too large
    if (this.recentMessages.size > 100 || Math.random() < 0.1) {
      for (const [msg, time] of this.recentMessages) {
        if (now - time > this.duplicateWindowMs) {
          this.recentMessages.delete(msg)
        }
      }
    }

    return this.recentMessages.has(normalized)
  }

  private trackMessage(text: string): void {
    this.recentMessages.set(text.toLowerCase().trim(), Date.now())
  }

  private applyUsernameOverrides(text: string, username: string): string {
    let result = text

    // Replace the current user's name if there's an override
    const override = this.usernameOverrides.get(username.toLowerCase())
    if (override) {
      const regex = new RegExp(`\\b${this.escapeRegex(username)}\\b`, 'gi')
      result = result.replace(regex, override)
    }

    // Also replace any mentioned usernames
    for (const [name, pronunciation] of this.usernameOverrides) {
      const regex = new RegExp(`\\b${this.escapeRegex(name)}\\b`, 'gi')
      result = result.replace(regex, pronunciation)
    }

    return result
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  /**
   * Replace emoji/pictographic characters with a single space.
   * Emoji read poorly in TTS ("fire emoji", slow phoneme generation) and
   * are better omitted entirely.
   */
  private stripEmoji(text: string): string {
    return text
      .replace(/\p{Extended_Pictographic}/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * Collapse runs of 4+ identical characters.
   * "LOOOOOOL" → "LOOOL", "noooooo" → "nooo".
   * Keeps speech natural without completely losing emphasis.
   */
  private normalizeRepeats(text: string): string {
    return text.replace(/(.)\1{3,}/g, '$1$1$1')
  }
}
