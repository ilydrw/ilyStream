import { EventEmitter } from 'events'
import { OBSWebSocket } from 'obs-websocket-js'
import type {
  OBSSetSceneAction,
  OBSSetSourceVisibilityAction,
  OBSToggleSourceVisibilityAction,
  OBSSaveReplayBufferAction
} from '../triggers/trigger-types'
import type { AppSettings } from '../../shared/app-settings'
import type {
  OBSAttachManagedBrowserSourceRequest,
  OBSAttachManagedBrowserSourceResult,
  OBSManagedBrowserSourceInspection,
  OBSRefreshManagedBrowserSourceResult,
  OBSRepairManagedBrowserSourceRequest,
  OBSRepairManagedBrowserSourceResult,
  OBSRuntimeStatus,
  OBSUpsertWidgetBrowserSourceRequest,
  OBSUpsertWidgetBrowserSourceResult
} from '../../shared/obs'
import {
  OBSBrowserSourceManager,
  isIlyStreamOverlayUrl
} from './obs-browser-source-manager'

export {
  getWidgetBrowserSourceRecommendation,
  isIlyStreamOverlayUrl
} from './obs-browser-source-manager'

type OBSAction =
  | OBSSetSceneAction
  | OBSSetSourceVisibilityAction
  | OBSToggleSourceVisibilityAction
  | OBSSaveReplayBufferAction

type OBSSettings = AppSettings['integrations']['obs']

const DEFAULT_OBS_SETTINGS: OBSSettings = {
  enabled: false,
  host: '127.0.0.1',
  port: 4455,
  password: ''
}

const OBS_RECONNECT_BASE_DELAY_MS = 1_000
const OBS_RECONNECT_MAX_DELAY_MS = 15_000

export class OBSService extends EventEmitter {
  private client = new OBSWebSocket()
  private settings: OBSSettings = { ...DEFAULT_OBS_SETTINGS }
  private manualDisconnecting = false
  private shouldReconnect = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private reconnectInFlight: Promise<OBSRuntimeStatus> | null = null
  private browserSourcesRefreshed = false
  private overlayPort = 8899
  private status: OBSRuntimeStatus = {
    enabled: false,
    connecting: false,
    connected: false,
    host: DEFAULT_OBS_SETTINGS.host,
    port: DEFAULT_OBS_SETTINGS.port,
    currentSceneName: null,
    lastError: null,
    obsWebSocketVersion: null,
    obsVersion: null,
    virtualCameraActive: null,
    recordingActive: false,
    streamActive: false,
    scenes: [],
    updatedAt: null
  }
  private browserSourceManager = new OBSBrowserSourceManager(
    this.client,
    () => this.status.connected,
    () => this.overlayPort
  )

  constructor() {
    super()
    this.client.on('ConnectionClosed', (error) => {
      const shouldRetry = this.shouldReconnect && !this.manualDisconnecting
      this.markDisconnected(this.manualDisconnecting ? null : (error?.message ?? null))
      this.manualDisconnecting = false
      this.emitStatus()
      if (shouldRetry) this.scheduleReconnect()
    })

    this.client.on('ConnectionError', (error) => {
      const shouldRetry = this.shouldReconnect && !this.manualDisconnecting
      this.markDisconnected(error?.message ?? 'Connection error')
      this.emitStatus()
      // A failed connect() is handled by reconnectInternal once its promise
      // rejects. Established connections do not have an in-flight owner.
      if (shouldRetry && !this.reconnectInFlight) this.scheduleReconnect()
    })

    this.client.on('CurrentProgramSceneChanged', (event) => {
      this.status.currentSceneName = event.sceneName ?? null
      this.status.updatedAt = new Date().toISOString()
      this.emitStatus()
    })

    this.client.on('VirtualcamStateChanged', (event) => {
      this.status.virtualCameraActive = Boolean((event as any).outputActive)
      this.status.updatedAt = new Date().toISOString()
      this.emitStatus()
    })

    this.client.on('StreamStateChanged', (data) => {
      this.status.streamActive = data.outputActive
      this.status.updatedAt = new Date().toISOString()
      this.emitStatus()
    })

    this.client.on('RecordStateChanged', (data) => {
      this.status.recordingActive = data.outputActive
      this.status.updatedAt = new Date().toISOString()
      this.emitStatus()
    })

    this.client.on('SceneListChanged', (data) => {
      this.status.scenes = data.scenes.map((s: any) => s.sceneName)
      this.status.updatedAt = new Date().toISOString()
      this.emitStatus()
    })
  }

  getStatus(): OBSRuntimeStatus {
    return { ...this.status }
  }

  setOverlayPort(port: number): void {
    if (!Number.isInteger(port) || port < 1 || port > 65_535) return
    if (this.overlayPort !== port) this.browserSourcesRefreshed = false
    this.overlayPort = port
  }

  async applySettings(settings: OBSSettings): Promise<OBSRuntimeStatus> {
    const nextSettings = {
      enabled: settings.enabled,
      host: (settings.host || '').trim() || DEFAULT_OBS_SETTINGS.host,
      port: settings.port,
      password: settings.password
    }

    const changed =
      nextSettings.enabled !== this.settings.enabled ||
      nextSettings.host !== this.settings.host ||
      nextSettings.port !== this.settings.port ||
      nextSettings.password !== this.settings.password

    this.settings = nextSettings
    this.status.enabled = nextSettings.enabled
    this.status.host = nextSettings.host
    this.status.port = nextSettings.port
    this.shouldReconnect = nextSettings.enabled

    if (!nextSettings.enabled) {
      await this.disconnect()
      return this.getStatus()
    }

    if (changed || !this.status.connected) {
      await this.reconnect()
    } else {
      this.emitStatus()
    }

    return this.getStatus()
  }

  async reconnect(): Promise<OBSRuntimeStatus> {
    this.shouldReconnect = this.settings.enabled
    if (this.reconnectInFlight) return this.reconnectInFlight

    const reconnect = this.reconnectInternal()
    this.reconnectInFlight = reconnect
    try {
      return await reconnect
    } finally {
      if (this.reconnectInFlight === reconnect) {
        this.reconnectInFlight = null
      }
    }
  }

  private async reconnectInternal(): Promise<OBSRuntimeStatus> {
    this.clearReconnectTimer()
    await this.disconnectClient()

    if (!this.shouldReconnect || !this.settings.enabled) return this.getStatus()

    this.status.connecting = true
    this.status.lastError = null
    this.status.updatedAt = new Date().toISOString()
    this.emitStatus()

    try {
      const response = await this.client.connect(
        this.getAddress(),
        this.settings.password || undefined
      )

      if (!this.shouldReconnect || !this.settings.enabled) {
        await this.disconnectClient()
        return this.getStatus()
      }

      this.status.connected = true
      this.status.connecting = false
      this.status.obsVersion = (response as any).obsVersion ?? null
      this.status.obsWebSocketVersion = (response as any).obsWebSocketVersion ?? null
      this.status.lastError = null
      this.status.updatedAt = new Date().toISOString()
      this.reconnectAttempts = 0
      this.clearReconnectTimer()
      await this.refreshSceneState()
      this.emitStatus()
      await this.refreshIlyStreamBrowserSourcesOnce()
    } catch (error) {
      this.markDisconnected(error instanceof Error ? error.message : String(error))
      this.emitStatus()
      if (this.shouldReconnect && this.settings.enabled) this.scheduleReconnect()
    }

    return this.getStatus()
  }

  async disconnect(): Promise<void> {
    this.shouldReconnect = false
    this.clearReconnectTimer()
    await this.disconnectClient()
  }

  private async disconnectClient(): Promise<void> {
    const mayHaveClient = this.status.connected || this.status.connecting || Boolean(this.reconnectInFlight)

    if (mayHaveClient) {
      try {
        this.manualDisconnecting = true
        await this.client.disconnect()
      } catch {
        // Ignore close failures from stale sockets.
      } finally {
        this.manualDisconnecting = false
      }
    }

    this.markDisconnected(null)
    this.emitStatus()
  }

  async startVirtualCamera(): Promise<OBSRuntimeStatus> {
    if (!this.status.connected) {
      throw new Error('OBS is not connected')
    }
    await this.client.call('StartVirtualCam')
    this.status.virtualCameraActive = true
    this.status.updatedAt = new Date().toISOString()
    this.emitStatus()
    return this.getStatus()
  }

  async stopVirtualCamera(): Promise<OBSRuntimeStatus> {
    if (!this.status.connected) {
      throw new Error('OBS is not connected')
    }
    await this.client.call('StopVirtualCam')
    this.status.virtualCameraActive = false
    this.status.updatedAt = new Date().toISOString()
    this.emitStatus()
    return this.getStatus()
  }

  async toggleVirtualCamera(): Promise<OBSRuntimeStatus> {
    if (!this.status.connected) {
      throw new Error('OBS is not connected')
    }
    await this.client.call('ToggleVirtualCam')
    await this.refreshVirtualCameraState()
    this.emitStatus()
    return this.getStatus()
  }

  async executeAction(action: OBSAction): Promise<void> {
    if (!this.status.connected) {
      throw new Error('OBS is not connected')
    }

    switch (action.type) {
      case 'obs_set_scene':
        await this.client.call('SetCurrentProgramScene', { sceneName: action.sceneName })
        this.status.currentSceneName = action.sceneName
        this.status.updatedAt = new Date().toISOString()
        this.emitStatus()
        return

      case 'obs_set_source_visibility': {
        const sceneItemId = await this.getSceneItemId(action.sceneName, action.sourceName)
        await this.client.call('SetSceneItemEnabled', {
          sceneName: action.sceneName,
          sceneItemId,
          sceneItemEnabled: action.visible
        })
        return
      }

      case 'obs_toggle_source_visibility': {
        const sceneItemId = await this.getSceneItemId(action.sceneName, action.sourceName)
        const { sceneItemEnabled } = await this.client.call('GetSceneItemEnabled', {
          sceneName: action.sceneName,
          sceneItemId
        }) as { sceneItemEnabled: boolean }
        await this.client.call('SetSceneItemEnabled', {
          sceneName: action.sceneName,
          sceneItemId,
          sceneItemEnabled: !sceneItemEnabled
        })
        return
      }

      case 'obs_save_replay_buffer': {
        await this.client.call('SaveReplayBuffer')
        return
      }
    }
  }

  async getManagedBrowserSources(): Promise<OBSManagedBrowserSourceInspection> {
    return this.browserSourceManager.getManagedBrowserSources()
  }

  async attachManagedBrowserSourceToScene(
    request: OBSAttachManagedBrowserSourceRequest
  ): Promise<OBSAttachManagedBrowserSourceResult> {
    return this.browserSourceManager.attachManagedBrowserSourceToScene(request)
  }

  async upsertWidgetBrowserSource(
    request: OBSUpsertWidgetBrowserSourceRequest
  ): Promise<OBSUpsertWidgetBrowserSourceResult> {
    return this.browserSourceManager.upsertWidgetBrowserSource(request)
  }

  async repairManagedBrowserSource(
    request: OBSRepairManagedBrowserSourceRequest
  ): Promise<OBSRepairManagedBrowserSourceResult> {
    return this.browserSourceManager.repairManagedBrowserSource(request)
  }

  async refreshManagedBrowserSource(inputName: string): Promise<OBSRefreshManagedBrowserSourceResult> {
    return this.browserSourceManager.refreshManagedBrowserSource(inputName)
  }

  private scheduleReconnect(): void {
    if (
      !this.shouldReconnect
      || !this.settings.enabled
      || this.status.connected
      || this.reconnectTimer
    ) {
      return
    }

    const delay = Math.min(
      OBS_RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts),
      OBS_RECONNECT_MAX_DELAY_MS
    )
    this.reconnectAttempts += 1
    console.warn(`[obs] Connection unavailable; retrying in ${Math.round(delay / 1000)}s.`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.reconnect()
    }, delay)
    this.reconnectTimer.unref?.()
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private markDisconnected(lastError: string | null): void {
    this.status.connected = false
    this.status.connecting = false
    this.status.currentSceneName = null
    this.status.obsWebSocketVersion = null
    this.status.obsVersion = null
    this.status.virtualCameraActive = null
    this.status.recordingActive = false
    this.status.streamActive = false
    this.status.scenes = []
    this.status.lastError = lastError
    this.status.updatedAt = new Date().toISOString()
  }

  /**
   * OBS can start before ilyStream. In that order a browser source may be
   * sitting on Chromium's connection-refused page, which has none of our
   * in-page reconnect runtime. Refresh only ilyStream's loopback overlays once
   * after the first successful OBS connection; unrelated browser sources are
   * never touched and stream-state changes do not cause reloads.
   */
  private async refreshIlyStreamBrowserSourcesOnce(): Promise<void> {
    if (this.browserSourcesRefreshed) return

    try {
      const response = await this.client.call('GetInputList') as { inputs?: Array<Record<string, unknown>> }
      const inputs = Array.isArray(response.inputs) ? response.inputs : []
      this.browserSourcesRefreshed = true
      let refreshed = 0

      for (const input of inputs) {
        const inputName = typeof input.inputName === 'string' ? input.inputName : ''
        const inputKind = typeof input.inputKind === 'string' ? input.inputKind : ''
        const unversionedInputKind = typeof input.unversionedInputKind === 'string'
          ? input.unversionedInputKind
          : ''
        if (!inputName || (inputKind !== 'browser_source' && unversionedInputKind !== 'browser_source')) {
          continue
        }

        try {
          const settingsResponse = await this.client.call('GetInputSettings', { inputName })
          const url = (settingsResponse.inputSettings as Record<string, unknown>)?.url
          if (!isIlyStreamOverlayUrl(url, this.overlayPort)) continue

          await this.client.call('PressInputPropertiesButton', {
            inputName,
            propertyName: 'refreshnocache'
          })
          refreshed += 1
        } catch (error) {
          console.warn(
            `[obs] Could not refresh browser source "${inputName}":`,
            error instanceof Error ? error.message : error
          )
        }
      }

      if (refreshed > 0) {
        console.log(`[obs] Refreshed ${refreshed} ilyStream browser source${refreshed === 1 ? '' : 's'}.`)
      }
    } catch (error) {
      console.warn(
        '[obs] Could not inspect browser sources for startup recovery:',
        error instanceof Error ? error.message : error
      )
    }
  }

  private async refreshSceneState(): Promise<void> {
    if (!this.status.connected) return

    try {
      const sceneList = await this.client.call('GetSceneList')
      this.status.currentSceneName = sceneList.currentProgramSceneName ?? null
      this.status.scenes = sceneList.scenes.map((s: any) => s.sceneName)

      const streamStatus = await this.client.call('GetStreamStatus')
      this.status.streamActive = streamStatus.outputActive

      const recordStatus = await this.client.call('GetRecordStatus')
      this.status.recordingActive = recordStatus.outputActive

      await this.refreshVirtualCameraState()
      this.status.updatedAt = new Date().toISOString()
    } catch (error) {
      this.status.lastError = error instanceof Error ? error.message : String(error)
      this.status.updatedAt = new Date().toISOString()
    }
  }

  private async refreshVirtualCameraState(): Promise<void> {
    if (!this.status.connected) return

    try {
      const response = await this.client.call('GetVirtualCamStatus') as {
        outputActive?: boolean
      }
      this.status.virtualCameraActive = Boolean(response.outputActive)
      this.status.updatedAt = new Date().toISOString()
    } catch {
      this.status.virtualCameraActive = null
    }
  }

  private async getSceneItemId(sceneName: string, sourceName: string): Promise<number> {
    const response = await this.client.call('GetSceneItemId', {
      sceneName,
      sourceName
    }) as { sceneItemId: number }
    return response.sceneItemId
  }

  private getAddress(): string {
    return `ws://${this.settings.host}:${this.settings.port}`
  }

  private emitStatus(): void {
    this.emit('status', this.getStatus())
  }
}

