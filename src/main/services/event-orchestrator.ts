import { PlatformManager } from '../platforms/platform-manager'
import { Database } from '../db/database'
import { OverlayServer } from '../overlay/overlay-server'
import { EventSoundService } from '../soundboard/event-sound-service'
import { SpotifyService } from '../spotify/spotify-service'
import { TTSEngine } from '../tts/tts-engine'
import { HueService } from '../hue/hue-service'
import { TriggerEngine } from '../triggers/trigger-engine'
import { AutomationService } from '../automation/automation-service'
import { resolveAppSettings } from '../../shared/app-settings'
import { VoicemodService } from './voicemod-service'
import { VTubeService } from './vtube-service'
import { EconomyService } from '../economy/economy-service'
import { StatsService } from '../stats/stats-service'
import { GoveeService } from './govee-service'
import { LightingManagerService } from './lighting/lighting-manager'
import { StreamingService } from './streaming-service'
import { BrowserWindow } from 'electron'
import { ChatRelayService, isSuppressedChatRelayEcho } from '../chat/chat-relay-service'
import { LoyaltyService } from '../loyalty/loyalty-service'
import { LIKE_LOG_VERBOSE } from '../../shared/debug-flags'
import { isCohostIdentity } from '../ai/cohost-identity'
import { htmlToSingleLinePlainText } from '../../shared/plain-text'
import type { SpotifySongRequest } from '../../shared/spotify-types'
import type { LoyaltyLevelUpEvent } from '../../shared/loyalty'
import type { AnyStreamEvent, Platform } from '../platforms/types'
import { sendToRenderer } from '../ipc/safe-send'

const HOST_CHAT_MESSAGE_MAX_LENGTH = 140
const HOST_CHAT_PLATFORMS: Platform[] = ['tiktok', 'twitch', 'youtube', 'kick']
const HOST_CHAT_PLATFORM_SET = new Set<string>(HOST_CHAT_PLATFORMS)

export class EventOrchestrator {
  /** Track requestIds we've already counted, so a queue-update doesn't double-count. */
  private countedSongRequestIds = new Set<string>()
  private initialized = false
  /** Wall-clock ms of the last history-prune pass. Throttles prune to at most
   * once every `HISTORY_PRUNE_INTERVAL_MS` instead of every event. */
  private lastHistoryPruneAt = 0
  private static readonly HISTORY_PRUNE_INTERVAL_MS = 5 * 60 * 1000

  constructor(
    private platformManager: PlatformManager,
    private db: Database,
    private overlayServer: OverlayServer,
    private eventSoundService: EventSoundService,
    private spotifyService: SpotifyService,
    private chatRelayService: ChatRelayService,
    private ttsEngine: TTSEngine,
    private hueService: HueService,
    private triggerEngine: TriggerEngine,
    private automationService: AutomationService,
    private voicemodService: VoicemodService,
    private vtubeService: VTubeService,
    private economyService: EconomyService,
    private loyaltyService: LoyaltyService,
    private statsService: StatsService,
    private goveeService: GoveeService,
    private lightingManager: LightingManagerService,
    private streamingService: StreamingService
  ) {}

  init(): void {
    if (this.initialized) {
      console.log('[orchestrator] init: already subscribed')
      return
    }
    this.initialized = true

    console.log('[orchestrator] init: subscribing to platform events')
    this.platformManager.on('event', (event) => {
      void this.handlePlatformEvent(event)
    })

    // Listen to Trigger Actions
    this.triggerEngine.on('action:voicemod', (action) => this.handleVoicemodAction(action))
    this.triggerEngine.on('action:vtube', (action) => this.handleVTubeAction(action))
    this.triggerEngine.on('action:discord', (action, event) => this.handleDiscordAction(action, event))
    this.triggerEngine.on('action:physics', (action, event) => this.handlePhysicsAction(action, event))
    this.triggerEngine.on('action:send-chat', (action, event) => this.handleSendChatAction(action, event))
    this.triggerEngine.on('action:show-alert', (alert) => this.overlayServer.pushAlert(alert, 'all'))
    this.triggerEngine.on('action:play-sound', (action) => {
      this.eventSoundService.playSound(action.soundId, action.volume || 1)
    })

    // Listen to Deck Actions
    this.overlayServer.on('deck-action', (action) => this.handleDeckAction(action))

    // Listen to Economy Events
    this.economyService.on('leaderboard-update', (data) => {
      if (typeof (this.overlayServer as any).broadcast === 'function') {
        this.overlayServer.broadcast('deck', { type: 'leaderboard', data })
        this.overlayServer.broadcast('leaderboard', { type: 'update', data })
      } else {
        console.error('[orchestrator] CRITICAL: overlayServer.broadcast is MISSING at runtime!')
      }
    })
    this.economyService.on('timer-update', (endTime) => {
      if (typeof (this.overlayServer as any).broadcast === 'function') {
        this.overlayServer.broadcast('deck', { type: 'timer', endTime })
        this.overlayServer.broadcast('timer', { type: 'update', endTime })
      }
    })
    this.economyService.on('points-drop-start', (data) => {
      if (typeof (this.overlayServer as any).broadcast === 'function') {
        this.overlayServer.broadcast('deck', { type: 'points-drop', data })
      }
      // Trigger visual physics drop too
      this.handlePhysicsAction({ amount: 10 }, { user: { username: 'Economy', displayName: 'Points Drop', profilePictureUrl: 'asset://resources/icon.png' } })
    })
    this.economyService.on('points-drop-claimed', (data) => {
      if (typeof (this.overlayServer as any).broadcast === 'function') {
        this.overlayServer.broadcast('deck', { type: 'points-claimed', data })
      }
    })

    this.loyaltyService.on('level-up', (event: LoyaltyLevelUpEvent) => {
      this.handleLoyaltyLevelUp(event)
    })

    // 12. Spotify -> Overlay Bridge
    this.spotifyService.on('now-playing', (payload) => {
      try {
        this.overlayServer.setNowPlaying(payload)
      } catch (err) {
        console.error('[EventOrchestrator] Spotify now-playing bridge failed:', err)
      }
    })

    // 13. Spotify -> Stats: count each song request exactly once when it
    // first appears in the queue. The queue updates frequently as songs
    // play / get removed, so we de-dupe on requestId.
    this.spotifyService.on('song-requested', (request) => {
      try {
        this.recordSongRequested(request)
        this.loyaltyService.recordSongRequest({
          username: request.requestedBy,
          platform: request.platform,
          displayName: request.displayName
        })
      } catch (err) {
        console.error('[EventOrchestrator] Song request stats recording failed:', err)
      }

      void this.sendHostChatMessage(request.platform, this.buildSongRequestConfirmation(request))
    })

    // Initial sync. Wrap because a throw here would skip the success log and
    // could mask the fact that all .on() subscriptions above already ran.
    try {
      this.overlayServer.setNowPlaying(this.spotifyService.getNowPlaying())
    } catch (err) {
      console.error('[orchestrator] init: initial now-playing sync failed:', err)
    }

    console.log('[orchestrator] init: subscriptions ready')
  }

  private async handlePlatformEvent(event: AnyStreamEvent): Promise<void> {
    const verboseForEvent = event.type !== 'like' || LIKE_LOG_VERBOSE
    if (verboseForEvent) {
      console.log(`[orchestrator] Received ${event.type} event from ${event.platform}`)
    }

    // 1. Log to DB
    await this.runEventStage('event history', () => {
      this.db.addEvent(
        event.platform,
        event.type,
        'user' in event ? event.user.displayName || event.user.username : null,
        event
      )
    })

    // 2. Broadcast to Overlay
    await this.runEventStage('overlay broadcast', () => {
      if (verboseForEvent) {
        console.log(`[orchestrator] Broadcasting to overlays...`)
      }
      this.overlayServer.handleStreamEvent(event)
    })

    if (isDisplayOnlyChatEvent(event)) {
      return
    }

    // 3. Play Sounds
    await this.runEventStage('event sounds', () => {
      this.eventSoundService.processEvent(event)
    })

    // 4. Spotify Integration (Song Requests, etc)
    let handledBySpotify = false
    await this.runEventStage('spotify', async () => {
      handledBySpotify = await this.spotifyService.processEvent(event)
    })

    // 5. TTS (only if not a spotify command or if configured)
    if (!handledBySpotify && shouldRouteEventToTts(event)) {
      await this.runEventStage('tts', () => {
        console.log(`[orchestrator] Sending ${event.type} to TTS engine...`)
        this.ttsEngine.processEvent(event)
      })
    }

    // 6. Hardware (Hue)
    await this.runEventStage('hardware alerts', () => {
      this.handleHardwareAlerts(event)
    })

    // 7. Automation Triggers
    await this.runEventStage('triggers', () => {
      if (verboseForEvent) {
        console.log(`[orchestrator] Processing triggers...`)
      }
      this.triggerEngine.evaluate(event)
    })

    // 8. System Automation (Direct Mapping)
    await this.runEventStage('automation', () => {
      this.handleAutomation(event)
    })

    // 9. Economy (Likes, Timer, Points)
    await this.runEventStage('economy', () => {
      this.handleEconomy(event)
    })

    // 10. Lifetime stats (per-user + global counters surfaced on the Stats page)
    await this.runEventStage('stats', () => {
      this.statsService.recordEvent(event)
    })

    // 10b. Loyalty XP and levels
    await this.runEventStage('loyalty', () => {
      this.loyaltyService.recordEvent(event)
    })

    // 11. DB Pruning (Throttle)
    await this.runEventStage('event history pruning', () => {
      const now = Date.now()
      if (now - this.lastHistoryPruneAt < EventOrchestrator.HISTORY_PRUNE_INTERVAL_MS) {
        return
      }
      this.lastHistoryPruneAt = now
      this.db.pruneEventHistory()
    })
  }

  private async runEventStage(stage: string, handler: () => void | Promise<void>): Promise<void> {
    try {
      await handler()
    } catch (err) {
      console.error(`[EventOrchestrator] ${stage} failed:`, err)
    }
  }

  private recordSongRequested(request: SpotifySongRequest): void {
    if (!request || typeof request.id !== 'string') return

    // We de-dupe to ensure we don't count the same request multiple times if events overlap
    if (this.countedSongRequestIds.has(request.id)) return
    this.countedSongRequestIds.add(request.id)

    // Record the successful song request
    this.statsService.recordSongRequest({
      username: request.requestedBy,
      platform: request.platform,
      displayName: request.displayName,
      profilePictureUrl: request.profilePictureUrl
    })

    // Bound the de-dupe set so it doesn't grow unbounded across long sessions.
    if (this.countedSongRequestIds.size > 5000) {
      this.countedSongRequestIds = new Set(Array.from(this.countedSongRequestIds).slice(-2500))
    }
  }

  private async sendHostChatMessage(platform: unknown, message: string): Promise<void> {
    const text = this.truncateHostChatMessage(message)
    if (!text || !this.areHostChatResponsesEnabled() || !isHostChatPlatform(platform)) {
      return
    }

    const capability = this.platformManager.getChatCapabilities()[platform]
    if (!capability?.canSend) {
      return
    }

    try {
      const results = await this.chatRelayService.sendManualMessage([platform], text)
      const failure = results.find((result) => !result.ok)
      if (failure) {
        console.warn(
          `[EventOrchestrator] Host chat response failed for ${failure.platform}: ${failure.error || 'Unknown error'}`
        )
      }
    } catch (err) {
      console.error('[EventOrchestrator] Host chat response failed:', err)
    }
  }

  private areHostChatResponsesEnabled(): boolean {
    try {
      return resolveAppSettings(this.db.getAllSettings()).chat.hostResponsesEnabled
    } catch {
      return true
    }
  }

  private buildSongRequestConfirmation(request: SpotifySongRequest): string {
    const requester = this.cleanHostChatText(request.displayName || request.requestedBy) || 'viewer'
    const trackName = this.cleanHostChatText(request.track?.name) || 'song'
    const artists = Array.isArray(request.track?.artists)
      ? request.track.artists.map((artist) => this.cleanHostChatText(artist)).filter(Boolean).join(', ')
      : ''
    const trackLabel = artists ? `${trackName} by ${artists}` : trackName

    return `Queued "${trackLabel}" for ${requester}.`
  }

  private getEventDisplayName(event: any): string {
    return this.cleanHostChatText(event?.user?.displayName || event?.user?.username) || 'viewer'
  }

  private cleanHostChatText(value: unknown): string {
    return htmlToSingleLinePlainText(value)
  }

  private truncateHostChatMessage(message: string): string {
    const normalized = this.cleanHostChatText(message)
    if (normalized.length <= HOST_CHAT_MESSAGE_MAX_LENGTH) {
      return normalized
    }

    return `${normalized.slice(0, HOST_CHAT_MESSAGE_MAX_LENGTH - 3).trimEnd()}...`
  }

  private handleVoicemodAction(action: any): void {
    if (action.type === 'voicemod_voice') {
      this.voicemodService.setVoice(action.voiceId, action.durationSec)
    } else if (action.type === 'voicemod_sound') {
      this.voicemodService.playSound(action.soundId)
    }
  }

  private handleVTubeAction(action: any): void {
    if (action.type === 'vtube_expression') {
      this.vtubeService.triggerExpression(action.expressionId, action.toggle)
    } else if (action.type === 'vtube_animation') {
      this.vtubeService.triggerHotkey(action.animationId)
    }
  }

  private async handleDiscordAction(action: any, event: any): Promise<void> {
    const settings = resolveAppSettings(this.db.getAllSettings())
    if (!settings.discordEnabled || !settings.discordWebhookUrl) return

    const user = 'user' in event ? event.user.displayName || event.user.username : 'Unknown'
    const body = {
      embeds: [{
        title: action.title || 'Stream Event',
        description: (action.description || 'Event triggered').replace('{username}', user),
        color: parseInt((action.color || '#ff00ff').replace('#', ''), 16),
        timestamp: new Date().toISOString()
      }]
    }

    try {
      await fetch(settings.discordWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        // Bound the outbound call so a slow/misconfigured webhook never blocks
        // the orchestrator pipeline. Discord's own servers respond in well under
        // a second, so 3s is generous and protects the next event from stall.
        signal: AbortSignal.timeout(3000)
      })
    } catch (err) {
      console.error('[Discord] Webhook failed:', err)
    }
  }

  private handleSendChatAction(action: any, event: AnyStreamEvent): void {
    const targetPlatform = isHostChatPlatform(action.platform) ? action.platform : event.platform
    const message = this.cleanHostChatText(action.message || action.template)
    if (!message) return

    void this.sendHostChatMessage(targetPlatform, message)
  }

  private handleLoyaltyLevelUp(event: LoyaltyLevelUpEvent): void {
    const message = `${event.displayName} hit level ${event.level}!`
    void this.sendHostChatMessage(event.platform, message)

    try {
      this.overlayServer.pushAlert({
        type: 'show_alert',
        template: `${event.displayName} hit level ${event.level}!`,
        durationMs: 4200,
        animationIn: 'zoom',
        animationOut: 'fade'
      }, 'all')
    } catch (err) {
      console.error('[EventOrchestrator] Loyalty level alert failed:', err)
    }
  }

  private handlePhysicsAction(action: any, event: any): void {
    const user = 'user' in event ? event.user : null
    if (!user) return

    // Broadcast multiple times if amount > 1
    const count = action.amount || 1
    for (let i = 0; i < count; i++) {
      this.overlayServer.broadcastPhysicsSpawn({
        imageUrl: user.profilePictureUrl || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + user.username,
        username: user.displayName || user.username,
        x: Math.random(), // Random entrance point
        size: 50,
        mass: 1,
        restitution: 0.6
      })
    }
  }

  private handleHardwareAlerts(event: any): void {
    const settings = resolveAppSettings(this.db.getAllSettings())
    const devices = this.lightingManager.getState().devices

    if (event.type === 'follow') {
      const duration = settings.hueFlashDurationMs || settings.goveeFlashDurationMs || 5000
      for (const device of devices) {
        if (device.platform === 'hue' && settings.hueFlashOnFollow) {
          this.lightingManager.executeAction(device.id, 'flash', { duration })
        } else if (device.platform === 'govee' && settings.goveeFlashOnFollow) {
          this.lightingManager.executeAction(device.id, 'flash', { duration })
        } else if (device.platform === 'razer' && settings.razerFlashOnFollow !== false) {
          this.lightingManager.executeAction(device.id, 'flash', { duration, color: '#19C8FF' })
        }
      }
    }

    if (event.type === 'gift' && !event.isCombo) {
      const duration = settings.hueFlashDurationMs || settings.goveeFlashDurationMs || 5000
      for (const device of devices) {
        if (device.platform === 'hue' && settings.hueFlashOnGift) {
          this.lightingManager.executeAction(device.id, 'pulse', { duration, color: '#D035F1' })
        } else if (device.platform === 'govee' && settings.goveeFlashOnGift) {
          this.lightingManager.executeAction(device.id, 'pulse', { duration, color: '#D035F1' })
        } else if (device.platform === 'razer' && settings.razerFlashOnGift !== false) {
          this.lightingManager.executeAction(device.id, 'pulse', { duration, color: '#D035F1' })
        }
      }
    }

    if (event.type === 'subscription') {
      const duration = settings.hueFlashDurationMs || settings.goveeFlashDurationMs || 5000
      for (const device of devices) {
        this.lightingManager.executeAction(device.id, 'pulse', { duration, color: '#19C8FF' })
      }
    }
  }

  private async handleAutomation(event: any): Promise<void> {
    try {
      const settings = resolveAppSettings(this.db.getAllSettings())
      if (!settings.automationEnabled) return

      if (event.type === 'chat') {
        const message = event.message.trim().toLowerCase()
        await this.automationService.handleTrigger(message, 'chat-command', settings.automationKeystrokeMapping)
      } else if (event.type === 'gift' && !event.isCombo) {
        await this.automationService.handleTrigger(event.giftName, 'gift', settings.automationKeystrokeMapping)
      }
    } catch (error) {
      console.error('[EventOrchestrator] Automation error:', error)
    }
  }

  public handleDeckAction(action: { type: string; payload?: any }): void {
    console.log(`[EventOrchestrator] Executing Deck Action: ${action.type}`)

    switch (action.type) {
      case 'KILL_TTS':
        this.ttsEngine.skip()
        this.ttsEngine.clearQueue()
        break

      case 'STOP_ALL_SOUNDS':
        // Panic stop — kill every active soundboard playback in the renderer
        // AND drop the TTS queue, so a single tap on the Car Thing footer
        // brings everything back to silent.
        this.eventSoundService.stopAll()
        this.ttsEngine.skip()
        this.ttsEngine.clearQueue()
        break

      case 'PHYSICS_DROP':
        // Trigger a burst of 15 objects
        this.handlePhysicsAction(
          { amount: 15 },
          { user: { username: 'Deck', displayName: 'Stream Deck', profilePictureUrl: 'asset://resources/icon.png' } }
        )
        break

      case 'SKIP_TRACK':
        this.spotifyService.skip().catch(err => {
          console.error('[Deck] Spotify Skip failed:', err)
          this.overlayServer.broadcastDeckNotification(err.message, 'error')
        })
        break

      case 'PAUSE_TRACK':
        this.spotifyService.pause().catch(err => {
          console.error('[Deck] Spotify Pause failed:', err)
          this.overlayServer.broadcastDeckNotification(err.message, 'error')
        })
        break

      case 'RESUME_TRACK':
        this.spotifyService.resume().catch(err => {
          console.error('[Deck] Spotify Resume failed:', err)
          this.overlayServer.broadcastDeckNotification(err.message, 'error')
        })
        break

      case 'LIKE_TRACK':
        this.spotifyService.likeCurrent().catch(err => {
          console.error('[Deck] Spotify Like failed:', err)
          this.overlayServer.broadcastDeckNotification(err.message, 'error')
        })
        break

      case 'HUE_STRIKE':
        for (const device of this.lightingManager.getState().devices) {
          this.lightingManager.executeAction(device.id, 'flash', { duration: 2000 })
        }
        break

      case 'HALVING':
        this.economyService.halving()
        this.ttsEngine.speak("THE SNAP! Half of all points and likes have been wiped from existence.")
        break

      case 'POINTS_DROP':
        this.economyService.triggerPointsDrop()
        break

      case 'FEATURE_MESSAGE':
        this.overlayServer.broadcastFeatureMessage(action.payload)
        break

      case 'SET_SCENE':
        if (action.payload?.sceneId) {
          console.log(`[EventOrchestrator] Triggering Scene Change: ${action.payload.sceneId}`)
          BrowserWindow.getAllWindows().forEach(win => {
            sendToRenderer(win, 'studio:active-scene-changed', action.payload.sceneId)
          })
        }
        break

      case 'PLAY_SOUND':
        if (action.payload?.soundId) {
          this.eventSoundService.playSound(action.payload.soundId, action.payload.volume || 1)
        }
        break

      case 'START_RECORDING':
        this.streamingService.startRecording(action.payload || {}).catch((err: any) => {
          console.error('[Deck] Start Recording failed:', err)
          this.overlayServer.broadcastDeckNotification(err?.message || 'Unknown recording error', 'error')
        })
        break

      case 'STOP_RECORDING':
        this.streamingService.stopRecording()
        break

      default:
        console.warn(`[EventOrchestrator] Unknown deck action type: ${action.type}`)
    }
  }

  private handleEconomy(event: any): void {
    if (event.type === 'like') {
      const username = event.user?.username || event.user?.id || event.user?.displayName || 'anonymous'
      const displayName = event.user?.displayName || event.user?.username || username
      this.economyService.registerLike(username, event.likeCount, displayName)
    } else if (event.type === 'gift') {
      // 1 cent = 1 second for example (standard tikfinity-like logic)
      const seconds = Math.floor(event.monetaryValue / 10) // Simplified
      if (seconds > 0) this.economyService.addTimeToSubathon(seconds)
    } else if (event.type === 'chat') {
      const msg = event.message.trim().toLowerCase()
      const displayName = this.getEventDisplayName(event)
      if (msg === '!get') {
        const claimed = this.economyService.claimPointsDrop(event.user.username, event.platform)
        if (claimed) {
          void this.sendHostChatMessage(event.platform, `${displayName} claimed the points drop!`)
        }
      } else if (msg === '!points') {
        this.economyService.getPoints(event.user.username, event.platform)
          .then(pts => {
            const response = `${displayName}, you have ${pts} points.`
            this.ttsEngine.speak(response)
            void this.sendHostChatMessage(event.platform, response)
          })
          .catch(err => console.error('[EventOrchestrator] Points lookup failed:', err))
      } else if (msg === '!spin') {
        this.economyService.spendPoints(event.user.username, event.platform, 5)
          .then(success => {
            let response: string
            if (success) {
              const win = Math.random() > 0.7 ? 20 : 0
              if (win > 0) {
                this.economyService.addPoints(event.user.username, event.platform, win)
                response = `JACKPOT! ${displayName} won ${win} points!`
              } else {
                response = `Sorry ${displayName}, better luck next time.`
              }
            } else {
              response = `${displayName}, you need 5 points to spin.`
            }
            this.ttsEngine.speak(response)
            void this.sendHostChatMessage(event.platform, response)
          })
          .catch(err => console.error('[EventOrchestrator] Spin command failed:', err))
      }
    }
  }
}

function isHostChatPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && HOST_CHAT_PLATFORM_SET.has(value)
}

function shouldRouteEventToTts(event: AnyStreamEvent): boolean {
  if (isSuppressedChatRelayEcho(event)) return false
  if (event.type === 'chat' && isCohostIdentity(event.user)) return false
  return event.type === 'chat' || event.type === 'subscription'
}

function isDisplayOnlyChatEvent(event: AnyStreamEvent): boolean {
  return event.type === 'chat' && (
    isSuppressedChatRelayEcho(event) ||
    isCohostIdentity(event.user)
  )
}
