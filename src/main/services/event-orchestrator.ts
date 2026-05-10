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

export class EventOrchestrator {
  /** Track requestIds we've already counted, so a queue-update doesn't double-count. */
  private countedSongRequestIds = new Set<string>()

  constructor(
    private platformManager: PlatformManager,
    private db: Database,
    private overlayServer: OverlayServer,
    private eventSoundService: EventSoundService,
    private spotifyService: SpotifyService,
    private ttsEngine: TTSEngine,
    private hueService: HueService,
    private triggerEngine: TriggerEngine,
    private automationService: AutomationService,
    private voicemodService: VoicemodService,
    private vtubeService: VTubeService,
    private economyService: EconomyService,
    private statsService: StatsService,
    private goveeService: GoveeService
  ) {}

  init(): void {
    this.platformManager.on('event', (event) => {
      // 1. Log to DB
      this.db.addEvent(
        event.platform,
        event.type,
        'user' in event ? event.user.displayName || event.user.username : null,
        event
      )

      // 2. Broadcast to Overlay
      this.overlayServer.handleStreamEvent(event)

      // 3. Play Sounds
      this.eventSoundService.processEvent(event)

      // 4. Spotify Integration (Song Requests, etc)
      const handledBySpotify = this.spotifyService.processEvent(event)
      
      // 5. TTS (only if not a spotify command or if configured)
      if (!handledBySpotify) {
        this.ttsEngine.processEvent(event)
      }

      // 6. Hardware (Hue)
      this.handleHardwareAlerts(event)

      // 7. Automation Triggers
      this.triggerEngine.evaluate(event)

      // 8. System Automation (Direct Mapping)
      this.handleAutomation(event)

      // 9. Economy (Likes, Timer, Points)
      this.handleEconomy(event)

      // 10. Lifetime stats (per-user + global counters surfaced on the Stats page)
      try {
        this.statsService.recordEvent(event)
      } catch (err) {
        console.error('[EventOrchestrator] Stats recording failed:', err)
      }

      // 11. DB Pruning (Throttle)
      if (Date.now() % 100 === 0) {
        this.db.pruneEventHistory()
      }
    })

    // Listen to Trigger Actions
    this.triggerEngine.on('action:voicemod', (action) => this.handleVoicemodAction(action))
    this.triggerEngine.on('action:vtube', (action) => this.handleVTubeAction(action))
    this.triggerEngine.on('action:discord', (action, event) => this.handleDiscordAction(action, event))
    this.triggerEngine.on('action:physics', (action, event) => this.handlePhysicsAction(action, event))
    this.triggerEngine.on('action:show-alert', (alert) => this.overlayServer.pushAlert(alert, 'all'))
    this.triggerEngine.on('action:play-sound', (action) => {
      this.eventSoundService.playSound(action.soundId, action.volume || 1)
    })
    
    // Listen to Deck Actions
    this.overlayServer.on('deck-action', (action) => this.handleDeckAction(action))

    // Listen to Economy Events
    this.economyService.on('leaderboard-update', (data) => {
      this.overlayServer.broadcast('deck', { type: 'leaderboard', data })
      this.overlayServer.broadcast('leaderboard', { type: 'update', data })
    })
    this.economyService.on('timer-update', (endTime) => {
      this.overlayServer.broadcast('deck', { type: 'timer', endTime })
      this.overlayServer.broadcast('timer', { type: 'update', endTime })
    })
    this.economyService.on('points-drop-start', (data) => {
      this.overlayServer.broadcast('deck', { type: 'points-drop', data })
      // Trigger visual physics drop too
      this.handlePhysicsAction({ amount: 10 }, { user: { username: 'Economy', displayName: 'Points Drop', profilePictureUrl: 'asset://resources/icon.png' } })
    })
    this.economyService.on('points-drop-claimed', (data) => this.overlayServer.broadcast('deck', { type: 'points-claimed', data }))

    // 12. Spotify -> Overlay Bridge
    this.spotifyService.on('now-playing', (payload) => {
      this.overlayServer.setNowPlaying(payload)
    })

    // 13. Spotify -> Stats: count each song request exactly once when it
    // first appears in the queue. The queue updates frequently as songs
    // play / get removed, so we de-dupe on requestId.
    this.spotifyService.on('song-requested', (request) => this.recordSongRequested(request))

    // Initial sync
    this.overlayServer.setNowPlaying(this.spotifyService.getNowPlaying())
  }

  private recordSongRequested(request: any): void {
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
        body: JSON.stringify(body)
      })
    } catch (err) {
      console.error('[Discord] Webhook failed:', err)
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
    if (event.type === 'follow' && settings.hueFlashOnFollow) {
      this.hueService.triggerStrobe(settings.hueFlashDurationMs).catch(() => {})
    }
    if (event.type === 'follow' && settings.goveeFlashOnFollow) {
      this.goveeService.triggerStrobe(settings.goveeFlashDurationMs).catch(() => {})
    }

    if (event.type === 'gift' && settings.hueFlashOnGift && !event.isCombo) {
      this.hueService.triggerCyberGradientStrobe(settings.hueFlashDurationMs).catch(() => {})
    }
    if (event.type === 'gift' && settings.goveeFlashOnGift && !event.isCombo) {
      this.goveeService.triggerCyberGradientStrobe(settings.goveeFlashDurationMs).catch(() => {})
    }

    if (event.type === 'subscription') {
      this.hueService.triggerSuperfanCyberGradientStrobe(settings.hueFlashDurationMs).catch(() => {})
      if (settings.goveeFlashOnFollow || settings.goveeFlashOnGift) {
        this.goveeService.triggerSuperfanCyberGradientStrobe(settings.goveeFlashDurationMs).catch(() => {})
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
      } else if (event.type === 'gift') {
        await this.automationService.handleTrigger(event.giftName, 'gift', settings.automationKeystrokeMapping)
      }
    } catch (error) {
      console.error('[EventOrchestrator] Automation error:', error)
    }
  }

  private handleDeckAction(action: { type: string; payload?: any }): void {
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
        this.hueService.triggerStrobe(2000).catch(() => {})
        this.goveeService.triggerStrobe(2000).catch(() => {})
        break

      case 'HALVING':
        this.economyService.halving()
        this.ttsEngine.speak("THE SNAP! Half of all points and likes have been wiped from existence.")
        break

      case 'POINTS_DROP':
        this.economyService.triggerPointsDrop()
        break

      case 'FEATURE_MESSAGE':
        this.overlayServer.broadcast('alerts', { type: 'featured-message', payload: action.payload })
        break

      case 'PLAY_SOUND':
        if (action.payload?.soundId) {
          this.eventSoundService.playSound(action.payload.soundId, action.payload.volume || 1)
        }
        break

      default:
        console.warn(`[EventOrchestrator] Unknown deck action type: ${action.type}`)
    }
  }

  private handleEconomy(event: any): void {
    if (event.type === 'like') {
      this.economyService.registerLike(event.user.username, event.likeCount)
    } else if (event.type === 'gift') {
      // 1 cent = 1 second for example (standard tikfinity-like logic)
      const seconds = Math.floor(event.monetaryValue / 10) // Simplified
      if (seconds > 0) this.economyService.addTimeToSubathon(seconds)
    } else if (event.type === 'chat') {
      const msg = event.message.trim().toLowerCase()
      if (msg === '!get') {
        this.economyService.claimPointsDrop(event.user.username, event.platform)
      } else if (msg === '!points') {
        this.economyService.getPoints(event.user.username, event.platform).then(pts => {
          // Speak points or send to chat
          this.ttsEngine.speak(`${event.user.displayName}, you have ${pts} points.`)
        })
      } else if (msg === '!spin') {
        this.economyService.spendPoints(event.user.username, event.platform, 5).then(success => {
          if (success) {
            const win = Math.random() > 0.7 ? 20 : 0
            if (win > 0) {
              this.economyService.addPoints(event.user.username, event.platform, win)
              this.ttsEngine.speak(`JACKPOT! ${event.user.displayName} won ${win} points!`)
            } else {
              this.ttsEngine.speak(`Sorry ${event.user.displayName}, better luck next time.`)
            }
          } else {
            this.ttsEngine.speak(`${event.user.displayName}, you need 5 points to spin.`)
          }
        })
      }
    }
  }
}
