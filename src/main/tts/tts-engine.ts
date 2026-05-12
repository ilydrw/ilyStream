import crypto from 'crypto'
import { EventEmitter } from 'events'
import { TTSQueue, TTSQueueItem, TTSPriority } from './queue'
import { TTSFilter } from './filters'
import { VoiceProfileManager, VoiceProfile } from './voice-profiles'
import { ChatEvent, SubscriptionEvent, AnyStreamEvent, UserInfo } from '../platforms/types'
import {
  AppSettings,
  DEFAULT_TTS_COMMAND_PREFIXES,
  TTSAudiencePermission,
  TTSUserVoiceOverride
} from '../../shared/app-settings'
import { DEFAULT_KOKORO_VOICE, ELEVENLABS_DEFAULT_VOICE_ID } from '../../shared/tts-providers'

export interface TTSRequest {
  text: string
  username: string
  platform: string
  priority: TTSPriority
  voiceProfileId?: string
  eventType: string
  voiceOverride?: VoiceProfile
}

export interface TTSTestResult {
  ok: boolean
  reason?: string
}

interface VoiceResolution {
  voiceProfileId?: string
  voiceOverride?: VoiceProfile
}

export class TTSEngine extends EventEmitter {
  private queue: TTSQueue
  private filter: TTSFilter
  private voiceProfiles: VoiceProfileManager
  private isPlaying = false
  private isPaused = false
  private currentItem: TTSQueueItem | null = null
  private enabled = true
  private chatVoiceProfileId = ''
  private subscriptionVoiceProfileId = ''
  private onlySubsAndMods = false
  private requireCommand = false
  private ignoreEmotes = true
  private globalVolume = 0.8
  private commandPrefixes = [...DEFAULT_TTS_COMMAND_PREFIXES]
  private allowedRoles: TTSAudiencePermission[] = ['everyone']
  private userVoiceOverrides: TTSUserVoiceOverride[] = []


  constructor() {
    super()
    this.queue = new TTSQueue()
    this.filter = new TTSFilter()
    this.voiceProfiles = new VoiceProfileManager()
  }

  /** Process a stream event and enqueue TTS if applicable */
  processEvent(event: AnyStreamEvent): void {
    if (!this.enabled) return
 
    let request: TTSRequest | null = null

    switch (event.type) {
      case 'chat': {
        const chat = event as ChatEvent
        console.log(`[TTS] Processing chat from ${chat.user.username} (${chat.platform}): "${chat.message}"`)
        const speechMessage = this.resolveChatSpeechMessage(chat)
        if (!speechMessage) {
          // Reason already logged in resolveChatSpeechMessage
          return
        }
        request = this.chatToRequest(chat, speechMessage)
        console.log(`[TTS] Enqueueing chat from ${chat.user.username}: "${speechMessage}"`)
        break
      }
      case 'subscription':
        request = this.subToRequest(event as SubscriptionEvent)
        break
    }

    if (request) {
      this.enqueue(request)
    }
  }

  /** Enqueue a TTS request after filtering */
  enqueue(request: TTSRequest): boolean {
    // Priority 'urgent' (AI/Test) bypasses the global enabled check
    if (!this.enabled && request.priority !== 'urgent') return false

    // Per-user block: a disabled override entry means "no TTS for this user"
    if (this.isUserBlocked(request.platform, request.username)) {
      console.log(`[TTS] Skipping: User ${request.username} is explicitly blocked in overrides.`)
      return false
    }

    const isUrgent = request.priority === 'urgent'
    const filteredText = this.filter.apply(request.text, request.username, isUrgent)
    if (!filteredText) {
      console.log(`[TTS] Skipping: Message from "${request.username}" was rejected by filters. Raw: "${request.text}". Filtered: "${filteredText}" (Empty, spam, or too short).`)
      return false
    }

    const voiceResolution = this.resolveUserVoiceAssignment(
      request.platform,
      request.username,
      request.voiceProfileId ?? ''
    )

    const item: TTSQueueItem = {
      id: crypto.randomUUID(),
      text: filteredText,
      originalText: request.text,
      username: request.username,
      platform: request.platform,
      priority: request.priority,
      voiceProfileId: request.voiceOverride ? undefined : voiceResolution.voiceProfileId,
      voiceOverride: request.voiceOverride ?? voiceResolution.voiceOverride,
      eventType: request.eventType,
      enqueuedAt: Date.now()
    }

    const added = this.queue.add(item)
    if (added) {
      this.emit('queue-update', this.queue.getAll())
      if (this.isPlaying && !this.isPaused) {
        this.emitPrefetchForNext()
      }
      this.processNext()
    }
    return added
  }

  enqueueTestSpeech(payload: { text: string; voiceProfileId?: string }): TTSTestResult {
    if (!this.enabled) {
      return { ok: false, reason: 'TTS is disabled.' }
    }

    const text = payload.text.trim()
    if (text.length === 0) {
      return { ok: false, reason: 'Enter test text first.' }
    }

    const item: TTSQueueItem = {
      id: crypto.randomUUID(),
      text,
      originalText: text,
      username: 'TTS Test',
      platform: 'local',
      priority: 'normal',
      voiceProfileId: payload.voiceProfileId,
      eventType: 'test',
      enqueuedAt: Date.now()
    }

    const added = this.queue.add(item)
    if (!added) {
      return { ok: false, reason: 'The TTS queue is full.' }
    }

    this.emit('queue-update', this.queue.getAll())
    this.processNext()
    return { ok: true }
  }

  /** Skip the currently playing item */
  skip(): void {
    if (this.currentItem) {
      this.emit('tts:stop-speaking')
      this.currentItem = null
      this.isPlaying = false
      this.processNext()
    }
  }

  /** Clear the entire queue */
  clearQueue(): void {
    this.queue.clear()
    this.emit('queue-update', [])
  }

  /** Pause TTS playback */
  pause(): void {
    this.isPaused = true
    this.emit('tts:pause')
  }

  /** Resume TTS playback */
  resume(): void {
    this.isPaused = false
    this.emit('tts:resume')
    this.processNext()
  }

  /** Toggle TTS on/off */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      this.skip()
      this.clearQueue()
    }
  }

  applySettings(settings: AppSettings['tts']): void {
    this.filter.setMaxLength(settings.maxLength)
    this.filter.setMinLength(settings.minLength)
    this.filter.setDuplicateWindow(settings.duplicateWindow * 1000)
    this.filter.setFilterEnabled('readAtSymbol', settings.readAtSymbol)
    this.filter.setFilterEnabled('skipMessagesStartingWithAt', settings.skipMessagesStartingWithAt)
    this.queue.setPerUserLimit(settings.perUserLimit)
    this.queue.setPerUserWindow(settings.duplicateWindow * 1000)
    this.chatVoiceProfileId = settings.chatVoiceProfileId
    this.subscriptionVoiceProfileId = settings.subscriptionVoiceProfileId
    this.onlySubsAndMods = settings.onlySubsAndMods
    this.requireCommand = settings.requireCommand
    this.commandPrefixes = [...(settings.commandPrefixes || [])].sort((left, right) => right.length - left.length)
    this.allowedRoles = settings.allowedRoles
    this.userVoiceOverrides = settings.userVoiceOverrides
    this.ignoreEmotes = settings.ignoreEmotes
    this.globalVolume = settings.volume
    this.setEnabled(settings.enabled)
  }

  /** Get current queue state */
  getQueue(): TTSQueueItem[] {
    return this.queue.getAll()
  }

  /** Get voice profiles manager */
  getVoiceProfiles(): VoiceProfileManager {
    return this.voiceProfiles
  }

  /** Get filter for configuration */
  getFilter(): TTSFilter {
    return this.filter
  }

  /**
   * Apply the same audience and command-prefix policy used by live chat TTS.
   * Trigger actions call this before enqueueing chat-derived speech so they
   * cannot accidentally bypass "command only" mode.
   */
  prepareChatSpeechMessage(event: ChatEvent): string | null {
    return this.resolveChatSpeechMessage(event)
  }

  /** Called by renderer when speech finishes */
  onSpeechComplete(): void {
    this.currentItem = null
    this.isPlaying = false
    this.processNext()
  }

  private processNext(): void {
    if (this.isPlaying || this.isPaused) return

    const next = this.queue.next()
    if (!next) return

    this.currentItem = next
    this.isPlaying = true

    const profile = next.voiceOverride ?? this.resolveProfile(next.voiceProfileId)

    // Emit speak command to renderer via IPC
    const finalProfile = profile ? { ...profile, volume: (profile.volume ?? 1) * this.globalVolume } : undefined

    this.emit('tts:speak', {
      id: next.id,
      text: next.text,
      username: next.username,
      voice: finalProfile
    })

    this.emitPrefetchForNext()

    this.emit('queue-update', this.queue.getAll())
  }

  private emitPrefetchForNext(): void {
    // Lookahead: signal the renderer to begin generating the *next* item's audio
    // while the current item plays. This also runs when a new first-in-line item
    // arrives during active speech, so queued chat is already rendered by the
    // time the current sentence finishes.
    const upcoming = this.queue.peek()
    if (!upcoming) return

    const upcomingProfile = upcoming.voiceOverride ?? this.resolveProfile(upcoming.voiceProfileId)
    const finalUpcomingProfile = upcomingProfile ? { ...upcomingProfile, volume: (upcomingProfile.volume ?? 1) * this.globalVolume } : undefined

    this.emit('tts:prefetch', {
      id: upcoming.id,
      text: upcoming.text,
      voice: finalUpcomingProfile
    })
  }

  private resolveProfile(voiceProfileId?: string): VoiceProfile | undefined {
    return voiceProfileId
      ? (this.voiceProfiles.get(voiceProfileId) ?? this.voiceProfiles.getDefault())
      : this.voiceProfiles.getDefault()
  }

  /**
   * Returns true if a user has an explicit "blocked" override entry (enabled = false).
   * This mirrors TikFinity's "Allowed" checkbox — unchecked = silenced entirely.
   */
  private isUserBlocked(platform: string, username: string): boolean {
    const normalized = normalizeUsername(username)
    if (!normalized) return false

    return this.userVoiceOverrides.some((override) => {
      if (override.enabled) return false // enabled overrides are voice assignments, not blocks
      if (override.platform !== 'all' && override.platform !== platform) return false
      return normalizeUsername(override.username) === normalized
    })
  }

  private resolveUserVoiceAssignment(
    platform: string,
    username: string,
    fallbackProfileId: string
  ): VoiceResolution {
    const normalizedUsername = normalizeUsername(username)
    if (!normalizedUsername) return { voiceProfileId: fallbackProfileId || undefined }

    const match = this.userVoiceOverrides.find((override) => {
      if (!override.enabled) return false
      if (override.platform !== 'all' && override.platform !== platform) return false
      return normalizeUsername(override.username) === normalizedUsername
    })

    if (!match) {
      return { voiceProfileId: fallbackProfileId || undefined }
    }

    if (match.mode === 'custom') {
      return { voiceOverride: this.buildUserVoiceProfile(match) }
    }

    return {
      voiceProfileId: match.voiceProfileId || fallbackProfileId || undefined
    }
  }

  private buildUserVoiceProfile(override: TTSUserVoiceOverride): VoiceProfile {
    return {
      id: `user-voice:${override.id}`,
      name: `@${override.username}`,
      provider: override.provider,
      voiceName: override.voiceName,
      kokoroVoice: override.kokoroVoice || DEFAULT_KOKORO_VOICE,
      elevenlabsVoiceId: override.elevenlabsVoiceId || ELEVENLABS_DEFAULT_VOICE_ID,
      elevenlabsStability: override.elevenlabsStability,
      elevenlabsSimilarity: override.elevenlabsSimilarity,
      elevenlabsStyle: override.elevenlabsStyle,
      lang: override.lang || 'en-US',
      pitch: override.pitch,
      rate: override.rate,
      volume: override.volume,
      effects: [],
      isDefault: false
    }
  }

  private resolveChatSpeechMessage(event: ChatEvent): string | null {
    if (this.onlySubsAndMods && !isSubscriberModeratorOrVip(event.user)) {
      console.log(`[TTS] Skipping chat from ${event.user.username}: Subs/Mods only mode is ON.`)
      return null
    }

    if (!this.canUserUseChatTTS(event.user)) {
      // canUserUseChatTTS logs its own reasons
      return null
    }

    if (event.isReply) {
      return null
    }

    let message = event.message.trim()

    if (this.requireCommand) {
      const matchedPrefix = this.commandPrefixes.find((prefix) => message.startsWith(prefix))
      if (!matchedPrefix) {
        console.log(`[TTS] Skipping: Message from "${event.user.username}" lacks required command prefix. Msg: "${message}"`)
        return null
      }

      message = message.slice(matchedPrefix.length).trim()
    }

    // NEW: Check if we should skip messages starting with @
    // This is checked BEFORE prefix removal or AFTER depending on preference.
    // Usually, users mean the actual message content starts with @.
    if (this.filter.isFilterEnabled('skipMessagesStartingWithAt') && message.startsWith('@')) {
      console.log(`[TTS] Skipping: Message from "${event.user.username}" starts with @ and "skip @ messages" is enabled.`)
      return null
    }

    if (this.ignoreEmotes && event.emotes && event.emotes.length > 0) {
      message = this.stripEmotes(message, event.emotes)
    }

    if (message.length === 0) {
      console.log(`[TTS] Skipping: Message from "${event.user.username}" became empty after processing.`)
      return null
    }

    return message.length > 0 ? message : null
  }

  private stripEmotes(message: string, emotes: any[]): string {
    // Sort emotes by startIndex descending so we can splice from end to start without breaking indices
    const sorted = [...emotes].sort((a, b) => b.startIndex - a.startIndex)
    let result = message

    for (const emote of sorted) {
      const start = emote.startIndex
      const end = emote.endIndex + 1
      if (start >= 0 && end <= result.length) {
        result = result.slice(0, start) + result.slice(end)
      }
    }

    // Collapse multiple spaces left behind
    return result.replace(/\s+/g, ' ').trim()
  }

  private canUserUseChatTTS(user: UserInfo): boolean {
    if (this.allowedRoles.includes('everyone')) return true

    const permitted = this.allowedRoles.some((role) => {
      const match = userMatchesPermission(user, role)
      if (match) {
        console.log(`[TTS] User "${user.username}" permitted by role: ${role}`)
      }
      return match
    })

    if (!permitted) {
      console.log(`[TTS] Skipping: User "${user.username}" does not have required permissions. Roles allowed: ${this.allowedRoles.join(', ')}. User state: Follower=${user.isFollower ?? false}, Sub=${user.isSubscriber}, Mod=${user.isModerator}, VIP=${user.isVip}`)
    }

    return permitted
  }

  private chatToRequest(event: ChatEvent, speechMessage: string): TTSRequest {
    return {
      text: `${event.user.displayName} says: ${speechMessage}`,
      username: event.user.username,
      platform: event.platform,
      priority: event.user.isModerator ? 'high' : 'normal',
      voiceProfileId: this.chatVoiceProfileId || undefined,
      eventType: 'chat'
    }
  }

  private subToRequest(event: SubscriptionEvent): TTSRequest {
    const msg = event.isGift
      ? `${event.gifterUser?.displayName || 'Someone'} gifted a subscription to ${event.user.displayName}!`
      : `${event.user.displayName} subscribed for ${event.months} months!`
    return {
      text: msg,
      username: event.user.username,
      platform: event.platform,
      priority: 'urgent',
      voiceProfileId: this.subscriptionVoiceProfileId || undefined,
      eventType: 'subscription'
    }
  }
}

function normalizeUsername(username: string): string {
  return username.trim().replace(/^@+/, '').toLowerCase()
}

function isSubscriberModeratorOrVip(user: UserInfo): boolean {
  return user.isSubscriber || user.isModerator || user.isVip
}

function userMatchesPermission(user: UserInfo, permission: TTSAudiencePermission): boolean {
  // Common checks for hierarchical permissions
  const isPrivileged = 
    !!user.isModerator || 
    !!user.isVip || 
    !!user.isSubscriber || 
    !!user.isTeamMember

  switch (permission) {
    case 'everyone':
      return true

    case 'followers':
      // Mod/Sub/VIP always count as at least "Follower" level for TTS
      return !!user.isFollower || isPrivileged || hasBadge(user, ['follower', 'following'])
 
    case 'fanClub':
    case 'subscribers':
      // Mod/Staff always count as Sub level
      return !!user.isSubscriber || !!user.isFanClubMember || !!user.isModerator || !!user.isTeamMember
 
    case 'moderators':
      return !!user.isModerator || !!user.isTeamMember
 
    case 'vips':
      return !!user.isVip || !!user.isModerator || !!user.isTeamMember
 
    case 'teamMembers':
      return !!user.isTeamMember

    default:
      return false
  }
}

function hasBadge(user: UserInfo, terms: string[]): boolean {
  return user.badges.some((badge) => {
    const haystack = `${badge.id} ${badge.name}`.toLowerCase()
    return terms.some((term) => haystack.includes(term))
  })
}

