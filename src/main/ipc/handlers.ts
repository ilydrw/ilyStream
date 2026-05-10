import { BrowserWindow, ipcMain } from 'electron'
import { ServiceRegistry } from '../services/service-registry'
import { resolveAppSetting, resolveAppSettings, type AppSettingKey } from '../../shared/app-settings'

// Modular handlers
import { registerPlatformHandlers } from './handlers/platform-handlers'
import { registerTTSHandlers } from './handlers/tts-handlers'
import { registerSoundHandlers } from './handlers/sound-handlers'
import { registerAssetHandlers } from './handlers/asset-handlers'
import { registerWidgetHandlers } from './handlers/widget-handlers'
import { registerSettingsHandlers } from './handlers/settings-handlers'
import { registerSpotifyHandlers } from './handlers/spotify-handlers'
import { registerHueHandlers } from './handlers/hue-handlers'
import { registerWindowHandlers } from './handlers/window-handlers'
import { registerAIHandlers } from './handlers/ai-handlers'
import { registerOverlayHandlers } from './handlers/overlay-handlers'
import { registerRemoteAuthHandlers } from './handlers/remote-auth-handlers'
import { registerStreamingHandlers } from './handlers/streaming-handlers'
import { registerStudioHandlers } from './handlers/studio-handlers'
import { registerStatsHandlers } from './handlers/stats-handlers'
import { registerDeviceHandlers } from './handlers/device-handlers'
import { registerGoveeHandlers } from './handlers/govee-handlers'

export function registerIpcHandlers(
  window: BrowserWindow,
  services: ServiceRegistry
): void {
  const {
    db,
    platformManager,
    ttsEngine,
    triggerEngine,
    soundboardService,
    eventSoundService,
    chatRelayService,
    overlayServer,
    obsService,
    aiService,
    spotifyService,
    assetService,
    hueService,
    remoteAuthService
  } = services

  const emitSettingsChanged = () => {
    if (!window.isDestroyed()) {
      window.webContents.send('settings:changed', resolveAppSettings(db.getAllSettings()))
    }
  }

  const emitOBSStatusChanged = () => {
    if (!window.isDestroyed()) {
      window.webContents.send('obs:status-changed', obsService.getStatus())
    }
  }

  obsService.on('status', emitOBSStatusChanged)

  const applyRuntimeSettings = async () => {
    const settings = resolveAppSettings(db.getAllSettings())
    ttsEngine.applySettings(settings)
    eventSoundService.applySettings(settings)
    await overlayServer.setPort(settings.overlayPort)
    await obsService.applySettings(settings)
    aiService.applySettings(settings)
    services.coHostService.applySettings(settings)
    services.hueService.applySettings(settings)
    services.goveeService.applySettings(settings)
  }

  const updateSetting = async <K extends AppSettingKey>(key: K, value: unknown) => {
    const resolvedValue = resolveAppSetting(key, value)
    db.setSetting(key, resolvedValue)
    await applyRuntimeSettings()
    emitSettingsChanged()
    return resolvedValue
  }

  // Register modular handlers
  registerPlatformHandlers(platformManager, chatRelayService, db)
  registerTTSHandlers(window, ttsEngine, db, updateSetting)
  registerSoundHandlers(window, soundboardService, db, applyRuntimeSettings, emitSettingsChanged, overlayServer)
  registerAssetHandlers(window, assetService, db, applyRuntimeSettings, emitSettingsChanged)
  registerWidgetHandlers(db, overlayServer)
  registerOverlayHandlers(overlayServer, services.eventOrchestrator)
  registerSettingsHandlers(
    window, 
    db, 
    overlayServer, 
    obsService, 
    applyRuntimeSettings, 
    emitSettingsChanged, 
    emitOBSStatusChanged, 
    updateSetting
  )
  registerSpotifyHandlers(window, spotifyService)
  registerHueHandlers(hueService, services.goveeService)
  registerWindowHandlers(window)
  registerAIHandlers(aiService)
  registerRemoteAuthHandlers(remoteAuthService)
  registerStreamingHandlers(services.streamingService)
  registerStudioHandlers(db, overlayServer, services.browserSourceService)
  registerStatsHandlers(services.statsService)
  registerDeviceHandlers(services.deviceApi)
  registerGoveeHandlers(services.goveeService)

  // Trigger handlers
  ipcMain.handle('triggers:get-all', () => triggerEngine.getRules())
  ipcMain.handle('triggers:save', (_event, rule) => {
    triggerEngine.updateRule(rule)
    db.saveTrigger(rule)
  })

  ipcMain.handle('triggers:delete', (_event, id) => {
    triggerEngine.removeRule(id)
    db.deleteTrigger(id)
  })

  ipcMain.handle('event:simulate-chat', async (_event, payload) => {
    const { platform, message, username } = payload
    platformManager.emit('event', {
      id: `sim-${Date.now()}`,
      platform,
      timestamp: new Date(),
      type: 'chat',
      user: {
        id: 'sim-user',
        username,
        displayName: username,
        isModerator: false,
        isSubscriber: false,
        isVip: false,
        badges: []
      },
      message,
      emotes: [],
      raw: { simulated: true }
    })
  })
}
