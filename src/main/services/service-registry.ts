import { Database } from '../db/database'
import { PlatformManager } from '../platforms/platform-manager'
import { SpotifyService } from '../spotify/spotify-service'
import { XService } from '../x/x-service'
import { TTSEngine } from '../tts/tts-engine'
import { SoundboardService } from '../soundboard/soundboard-service'
import { AssetService } from '../system/asset-service'
import { AIService } from '../ai/ai-service'
import { HueService } from '../hue/hue-service'
import { TriggerEngine } from '../triggers/trigger-engine'
import { OverlayServer } from '../overlay/overlay-server'
import { EventSoundService } from '../soundboard/event-sound-service'
import { OBSService } from '../obs/obs-service'
import { ChatRelayService } from '../chat/chat-relay-service'
import { CoHostService } from '../ai/co-host-service'
import { resolveAppSettings } from '../../shared/app-settings'
import { normalizeBroadcastStreamInfo } from '../../shared/stream-info'
import { renderGoLiveTemplate } from '../../shared/x-types'
import { EventOrchestrator } from './event-orchestrator'
import { AutomationService } from '../automation/automation-service'
import { VoicemodService } from './voicemod-service'
import { VTubeService } from './vtube-service'
import { MemoryService } from '../ai/memory-service'
import { RemoteAuthService } from './remote-auth-service'
import { EconomyService } from '../economy/economy-service'
import { StreamingService } from './streaming-service'
import { StatsService } from '../stats/stats-service'
import { DeviceApi } from '../overlay/device-api'
import { BrowserSourceService } from './browser-source-service'
import { GoveeService } from './govee-service'
import { RazerChromaService } from './razer-chroma-service'
import { VirtualCameraService } from './virtual-camera-service'
import { LightingManagerService } from './lighting/lighting-manager'
import { TikTokChatSender } from '../platforms/tiktok/tiktok-chat-sender'
import { RecordingsService } from './recordings-service'
import { LoyaltyService } from '../loyalty/loyalty-service'
import { StreamIntelligenceService } from '../ai/stream-intelligence-service'
import { StreamerbotBridgeService } from './streamerbot-bridge-service'

// Ignore TikTok connect/reconnect flaps within this window so we announce a
// go-live at most once per ~stream, not on every brief reconnect.
const TIKTOK_GO_LIVE_COOLDOWN_MS = 30 * 60_000

export class ServiceRegistry {
  public db: Database
  public platformManager: PlatformManager
  public spotifyService: SpotifyService
  public xService: XService
  public ttsEngine: TTSEngine
  public soundboardService: SoundboardService
  public assetService: AssetService
  public aiService: AIService
  public hueService: HueService
  public triggerEngine: TriggerEngine
  public overlayServer: OverlayServer
  public eventSoundService: EventSoundService
  public obsService: OBSService
  public chatRelayService: ChatRelayService
  public coHostService: CoHostService
  public automationService: AutomationService
  public voicemodService: VoicemodService
  public vtubeService: VTubeService
  public memoryService: MemoryService
  public remoteAuthService: RemoteAuthService
  public economyService: EconomyService
  public loyaltyService: LoyaltyService
  public streamingService: StreamingService
  public browserSourceService: BrowserSourceService
  public statsService: StatsService
  public streamIntelligenceService: StreamIntelligenceService
  public streamerbotBridgeService: StreamerbotBridgeService
  public deviceApi: DeviceApi
  public eventOrchestrator: EventOrchestrator
  public goveeService: GoveeService
  public razerChromaService: RazerChromaService
  public virtualCameraService: VirtualCameraService
  public lightingManager: LightingManagerService
  public tiktokChatSender: TikTokChatSender
  public recordingsService: RecordingsService

  private initialized = false
  private initializationPromise: Promise<void> | null = null
  private lastTikTokGoLiveAt = 0

  constructor() {
    this.db = new Database()
    this.tiktokChatSender = new TikTokChatSender()
    this.platformManager = new PlatformManager(this.db, this.tiktokChatSender)
    this.spotifyService = new SpotifyService(this.db, this.platformManager)
    this.xService = new XService(this.db)
    this.ttsEngine = new TTSEngine(
      (platform, username, identity) => this.db.getViewerProfileId(platform, username, identity),
      (profileId, permission) => this.db.stats.profileMatchesPermission(profileId, permission)
    )
    this.soundboardService = new SoundboardService(this.db)
    this.assetService = new AssetService()
    this.aiService = new AIService()
    this.memoryService = new MemoryService(this.db)
    this.remoteAuthService = new RemoteAuthService(this.db)
    this.economyService = new EconomyService(this.db)
    this.loyaltyService = new LoyaltyService(this.db)
    this.hueService = new HueService(this.db)
    this.triggerEngine = new TriggerEngine(this.ttsEngine, this.aiService)
    this.triggerEngine.loadRules(this.db.getAllTriggers())
    this.overlayServer = new OverlayServer()
    this.eventSoundService = new EventSoundService(
      this.soundboardService,
      this.overlayServer,
      (platform, username, identity) => this.db.getViewerProfileId(platform, username, identity)
    )
    this.obsService = new OBSService()
    this.streamingService = new StreamingService()
    this.browserSourceService = new BrowserSourceService()
    this.statsService = new StatsService(this.db)
    this.streamIntelligenceService = new StreamIntelligenceService()
    this.streamerbotBridgeService = new StreamerbotBridgeService()
    this.goveeService = new GoveeService(this.db)
    this.razerChromaService = new RazerChromaService(this.db)
    this.virtualCameraService = new VirtualCameraService(this.streamingService)
    this.lightingManager = new LightingManagerService()
    this.recordingsService = new RecordingsService()


    // Register lighting providers
    this.lightingManager.registerProvider(this.hueService)
    this.lightingManager.registerProvider(this.goveeService)
    this.lightingManager.registerProvider(this.razerChromaService)

    const settingsFetcher = () => resolveAppSettings(this.db.getAllSettings())
    this.chatRelayService = new ChatRelayService(this.platformManager, settingsFetcher)
    this.coHostService = new CoHostService(
      this.platformManager,
      this.aiService,
      this.ttsEngine,
      this.chatRelayService,
      this.memoryService,
      this.statsService
    )
    this.automationService = new AutomationService()
    this.voicemodService = new VoicemodService()
    this.vtubeService = new VTubeService()

    this.eventOrchestrator = new EventOrchestrator(
      this.platformManager,
      this.db,
      this.overlayServer,
      this.eventSoundService,
      this.spotifyService,
      this.chatRelayService,
      this.ttsEngine,
      this.hueService,
      this.triggerEngine,
      this.automationService,
      this.voicemodService,
      this.vtubeService,
      this.economyService,
      this.loyaltyService,
      this.statsService,
      this.goveeService,
      this.lightingManager,
      this.streamingService
    )

    this.overlayServer.setDatabase(this.db)
    this.overlayServer.setAssetService(this.assetService)
    this.overlayServer.setAuthService(this.remoteAuthService)
    this.overlayServer.setSoundboardService(this.soundboardService)
    this.overlayServer.setObsService(this.obsService)
    this.overlayServer.setPlatformManager(this.platformManager)

    // Device API forwards deck actions back through the orchestrator's normal path.
    this.deviceApi = new DeviceApi(
      this.db,
      this.soundboardService,
      this.remoteAuthService,
      (action) => this.overlayServer.emit('deck-action', action)
    )
    this.overlayServer.setDeviceApi(this.deviceApi)

    // Broadcast recording state to DeskThing / Overlays
    this.streamingService.on('status', (status) => {
      this.overlayServer.broadcastRecordingState(status.recording, this.streamingService.getRecordingOutputPath() || undefined)
    })

    // Push OBS scene/stream/recording state to LAN companions over the deck
    // channel — before this, companions only saw OBS state at page load.
    this.obsService.on('status', (status) => {
      this.overlayServer.broadcast('deck', { type: 'obs-status', payload: status })
    })

    this.platformManager.on('event', (event) => {
      this.streamIntelligenceService.recordEvent(event)
      this.streamerbotBridgeService.forwardEvent(event)
    })

    // TikTok go-live automations: when the connector reaches "connected" the host
    // has actually gone live. Fire the opt-in automations, with a cooldown so a
    // brief reconnect blip doesn't re-announce.
    this.platformManager.on('status', (platform, status) => {
      if (platform !== 'tiktok' || status !== 'connected') return
      const now = Date.now()
      if (now - this.lastTikTokGoLiveAt < TIKTOK_GO_LIVE_COOLDOWN_MS) return
      this.lastTikTokGoLiveAt = now
      void this.runTikTokGoLiveAutomations()
    })

    this.triggerEngine.on('receipt', (receipt) => {
      this.streamerbotBridgeService.forwardAutomationReceipt(receipt)
    })
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    if (this.initializationPromise) return this.initializationPromise

    this.initializationPromise = this.initializeCoreServices()
    try {
      await this.initializationPromise
      this.initialized = true
    } finally {
      this.initializationPromise = null
    }
  }

  private async initializeCoreServices(): Promise<void> {
    // Wire up the orchestrator's platform-event subscription before anything
    // that might throw. If a later applySettings step fails, alerts / Spotify
    // commands / DeskThing relay would otherwise silently stop because the
    // orchestrator listener never got attached.
    this.eventOrchestrator.init()

    const settings = resolveAppSettings(this.db.getAllSettings())

    const stages: Array<[string, () => void]> = [
      ['tts settings', () => this.ttsEngine.applySettings(settings.tts)],
      ['ai settings', () => this.aiService.applySettings(settings.ai)],
      ['co-host settings', () => this.coHostService.applySettings(settings.ai)],
      ['event-sound settings', () => this.eventSoundService.applySettings(settings)],
      ['voicemod settings', () => this.voicemodService.applySettings(settings)],
      ['vtube settings', () => this.vtubeService.applySettings(settings)],
      ['streamerbot settings', () => this.streamerbotBridgeService.applySettings(settings.integrations.streamerbot)],
      ['recordings folder', () => {
        this.streamingService.setRecordingsFolder(settings.recordingsFolder)
        this.recordingsService.setRecordingsFolder(settings.recordingsFolder)
      }],
      ['companion theme', () => this.overlayServer.broadcastAppTheme(settings.ui)],
      ['voice profiles', () => this.ttsEngine.getVoiceProfiles().loadFromRecords(this.db.getAllVoiceProfiles())]
    ]

    for (const [name, run] of stages) {
      try {
        run()
      } catch (err) {
        console.error(`[services] ${name} failed to apply:`, err)
      }
    }

    // Start OverlayServer first (critical for renderer)
    try {
      const port = settings.overlay.port || 8899;
      // Existing pairings start the isolated companion API listener. Browser-
      // source routes remain on the local overlay listener.
      const preferLan = this.deviceApi.listPairedDevices().length > 0
      console.log(`[services] Starting OverlayServer on port ${port}${preferLan ? ' with companion API' : ''}...`)
      await this.overlayServer.start(port, { preferLan })
      console.log('[services] OverlayServer ready.')
    } catch (err) {
      console.error('[services] OverlayServer failed:', err)
    }

    // Start other background services
    await Promise.allSettled([

      (async () => {
        console.log('[services] Applying OBS settings...')
        // Timeout OBS initialization to 5s to prevent startup hang
        const obsPromise = this.obsService.applySettings(settings.integrations.obs)
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('OBS connection timed out')), 5000)
        )
        try {
          await Promise.race([obsPromise, timeoutPromise])
          console.log('[services] OBS settings applied.')
        } catch (err) {
          console.warn('[services] OBS initialization skipped or failed:', err instanceof Error ? err.message : err)
        }
      })(),
      (async () => {
        console.log('[services] Restoring Spotify session...')
        await this.spotifyService.restoreSession()
        console.log('[services] Spotify session restoration attempt complete.')
      })(),
      (async () => {
        console.log('[services] Initializing Lighting Manager (and hardware providers)...')
        await this.lightingManager.initialize()
      })()
    ])
    console.log('[services] Service initialization sequence finished.')
  }

  /**
   * Runs opt-in TikTok go-live automations. X auto-posting stays behind the
   * paid-API toggle and only fires when an OAuth account is connected.
   */
  private async runTikTokGoLiveAutomations(): Promise<void> {
    const autoOpenSender = this.db.getSetting('tiktokAutoOpenSender') === true
    const autoPostGoLiveX = this.db.getSetting('tiktokAutoPostGoLiveX') === true

    if (autoOpenSender && !this.tiktokChatSender.getStatus().isWindowOpen) {
      this.tiktokChatSender.openWindow().catch((err) => {
        console.warn('[services] TikTok go-live: failed to open sender:', err)
      })
    }

    if (autoPostGoLiveX && this.xService.getStatus().connected) {
      const streamInfo = normalizeBroadcastStreamInfo(this.db.getSetting('broadcastStreamInfo'))
      const text = renderGoLiveTemplate(this.xService.getTemplate(), { title: streamInfo.title })
      if (text) {
        this.xService.postTweet(text).catch((err) => {
          console.warn('[services] TikTok go-live: X auto-post failed:', err)
        })
      }
    }
  }

  async dispose(): Promise<void> {
    this.chatRelayService.dispose()
    this.economyService.dispose()
    this.streamerbotBridgeService.dispose()
    await this.spotifyService.dispose()
    await this.lightingManager.dispose()
    this.tiktokChatSender.closeWindow()
    await Promise.allSettled([
      // Stop streaming/recording FIRST and let ffmpeg finalize — otherwise a
      // recording in progress is left corrupt and ffmpeg children are orphaned.
      this.streamingService.dispose(),
      this.overlayServer.stop(),
      Promise.resolve(this.browserSourceService.stopAll()),
      this.obsService.disconnect(),
      this.platformManager.disconnectAll(),
      this.virtualCameraService.stop()
    ])
    this.db.close()
  }
}
