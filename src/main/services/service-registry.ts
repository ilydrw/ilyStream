import { Database } from '../db/database'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { PlatformManager } from '../platforms/platform-manager'
import { SpotifyService } from '../spotify/spotify-service'
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

export class ServiceRegistry {
  public db: Database
  public platformManager: PlatformManager
  public spotifyService: SpotifyService
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
  public streamingService: StreamingService
  public browserSourceService: BrowserSourceService
  public statsService: StatsService
  public deviceApi: DeviceApi
  public eventOrchestrator: EventOrchestrator
  public goveeService: GoveeService
  private initialized = false
  private initializationPromise: Promise<void> | null = null

  constructor() {
    this.db = new Database()
    this.platformManager = new PlatformManager(this.db)
    this.spotifyService = new SpotifyService(this.db, this.platformManager)
    this.ttsEngine = new TTSEngine()
    this.soundboardService = new SoundboardService(this.db)
    this.assetService = new AssetService()
    this.aiService = new AIService()
    this.memoryService = new MemoryService(this.db)
    this.remoteAuthService = new RemoteAuthService(this.db)
    this.economyService = new EconomyService(this.db)
    this.hueService = new HueService(this.db)
    this.triggerEngine = new TriggerEngine(this.ttsEngine, this.aiService)
    this.overlayServer = new OverlayServer()
    this.eventSoundService = new EventSoundService(this.soundboardService, this.overlayServer)
    this.obsService = new OBSService()
    this.streamingService = new StreamingService()
    this.browserSourceService = new BrowserSourceService()
    this.statsService = new StatsService(this.db)
    this.goveeService = new GoveeService(this.db)

    const settingsFetcher = () => resolveAppSettings(this.db.getAllSettings())
    this.chatRelayService = new ChatRelayService(this.platformManager, settingsFetcher)
    this.coHostService = new CoHostService(
      this.platformManager, 
      this.aiService, 
      this.ttsEngine, 
      this.chatRelayService,
      this.memoryService
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
      this.ttsEngine,
      this.hueService,
      this.triggerEngine,
      this.automationService,
      this.voicemodService,
      this.vtubeService,
      this.economyService,
      this.statsService,
      this.goveeService
    )

    this.overlayServer.setDatabase(this.db)
    this.overlayServer.setAssetService(this.assetService)
    this.overlayServer.setAuthService(this.remoteAuthService)
    this.overlayServer.setSoundboardService(this.soundboardService)

    // Device API forwards deck actions back through the orchestrator's normal path.
    this.deviceApi = new DeviceApi(
      this.db,
      this.soundboardService,
      this.remoteAuthService,
      (action) => this.overlayServer.emit('deck-action', action)
    )
    this.overlayServer.setDeviceApi(this.deviceApi)
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    if (this.initializationPromise) return this.initializationPromise

    // Kill any existing instances on our primary port before starting
    await this.killZombieProcesses()

    this.initializationPromise = this.initializeCoreServices()
    try {
      await this.initializationPromise
      this.initialized = true
    } finally {
      this.initializationPromise = null
    }
  }

  private async killZombieProcesses(): Promise<void> {
    if (process.platform !== 'win32') return

    const settings = resolveAppSettings(this.db.getAllSettings())
    const configuredPort = Number(settings.overlayPort || 8899)
    const port = Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65535
      ? configuredPort
      : 8899
    const execFileAsync = promisify(execFile)

    try {
      // Find the PID of whatever is listening on our port without shell interpolation.
      const { stdout } = await execFileAsync('netstat', ['-ano'])
      const lines = stdout.split('\n')
      
      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 5 && parts[1].includes(`:${port}`) && parts[3] === 'LISTENING') {
          const pid = parts[4]
          if (pid && pid !== '0' && parseInt(pid) !== process.pid) {
            console.log(`[services] Killing zombie process ${pid} on port ${port}...`)
            await execFileAsync('taskkill', ['/F', '/PID', pid])
          }
        }
      }
    } catch (err) {
      // Netstat fails if no process is found, which is fine
    }
  }

  private async initializeCoreServices(): Promise<void> {
    const settings = resolveAppSettings(this.db.getAllSettings())
    
    this.ttsEngine.applySettings(settings)
    this.eventSoundService.applySettings(settings)
    this.aiService.applySettings(settings)
    this.coHostService.applySettings(settings)
    this.voicemodService.applySettings(settings)
    this.vtubeService.applySettings(settings)
    this.ttsEngine.getVoiceProfiles().loadFromRecords(this.db.getAllVoiceProfiles())
    
    this.eventOrchestrator.init()
    
    // Background services start
    console.log('[services] Initializing core services...')
    await Promise.allSettled([
      (async () => {
        try {
          const port = settings.overlayPort || 8899;
          console.log(`[services] Attempting to start OverlayServer on port ${port}...`)
          await this.overlayServer.start(port)
          console.log('[services] OverlayServer started successfully.')
        } catch (err) {
          console.error('[services] OverlayServer failed to start:', err)
        }
      })(),
      (async () => {
        console.log('[services] Applying OBS settings...')
        // Timeout OBS initialization to 5s to prevent startup hang
        const obsPromise = this.obsService.applySettings(settings)
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
        console.log('[services] Initializing Hue service...')
        await this.hueService.initialize()
      })(),
      (async () => {
        console.log('[services] Initializing Govee service...')
        await this.goveeService.initialize()
      })()
    ])
    console.log('[services] Service initialization sequence finished.')
  }

  async dispose(): Promise<void> {
    this.chatRelayService.dispose()
    this.economyService.dispose()
    this.spotifyService.dispose()
    this.hueService.dispose()
    this.goveeService.dispose()
    await Promise.allSettled([
      this.overlayServer.stop(),
      Promise.resolve(this.browserSourceService.stopAll()),
      this.obsService.disconnect(),
      this.platformManager.disconnectAll()
    ])
    this.db.close()
  }
}
