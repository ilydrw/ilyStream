import { EventEmitter } from 'events'
import { OBSWebSocket } from 'obs-websocket-js'
import type {
  OBSSetSceneAction,
  OBSSetSourceVisibilityAction,
  OBSToggleSourceVisibilityAction,
  OBSSaveReplayBufferAction
} from '../triggers/trigger-types'
import type { AppSettings } from '../../shared/app-settings'
import type { OBSRuntimeStatus } from '../../shared/obs'

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

export class OBSService extends EventEmitter {
  private client = new OBSWebSocket()
  private settings: OBSSettings = { ...DEFAULT_OBS_SETTINGS }
  private manualDisconnecting = false
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

  constructor() {
    super()
    this.client.on('ConnectionClosed', (error) => {
      this.status.connected = false
      this.status.connecting = false
      this.status.lastError = this.manualDisconnecting ? null : (error?.message ?? null)
      this.manualDisconnecting = false
      this.status.updatedAt = new Date().toISOString()
      this.emitStatus()
    })

    this.client.on('ConnectionError', (error) => {
      this.status.connected = false
      this.status.connecting = false
      this.status.lastError = error?.message ?? 'Connection error'
      this.status.updatedAt = new Date().toISOString()
      this.emitStatus()
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

    if (!nextSettings.enabled) {
      await this.disconnect()
      return this.getStatus()
    }

    if (changed) {
      await this.reconnect()
    } else {
      this.emitStatus()
    }

    return this.getStatus()
  }

  async reconnect(): Promise<OBSRuntimeStatus> {
    await this.disconnect()

    if (!this.settings.enabled) {
      return this.getStatus()
    }

    this.status.connecting = true
    this.status.lastError = null
    this.status.updatedAt = new Date().toISOString()
    this.emitStatus()

    try {
      const response = await this.client.connect(
        this.getAddress(),
        this.settings.password || undefined
      )

      this.status.connected = true
      this.status.connecting = false
      this.status.obsVersion = (response as any).obsVersion ?? null
      this.status.obsWebSocketVersion = (response as any).obsWebSocketVersion ?? null
      this.status.lastError = null
      this.status.updatedAt = new Date().toISOString()
      await this.refreshSceneState()
      this.emitStatus()
    } catch (error) {
      this.status.connected = false
      this.status.connecting = false
      this.status.currentSceneName = null
      this.status.virtualCameraActive = null
      this.status.lastError = error instanceof Error ? error.message : String(error)
      this.status.updatedAt = new Date().toISOString()
      this.emitStatus()
    }

    return this.getStatus()
  }

  async disconnect(): Promise<void> {
    if (!this.status.connected && !this.status.connecting) {
      this.status.currentSceneName = null
      this.status.obsVersion = null
      this.status.obsWebSocketVersion = null
      this.status.virtualCameraActive = null
      this.status.updatedAt = new Date().toISOString()
      this.emitStatus()
      return
    }

    try {
      this.manualDisconnecting = true
      await this.client.disconnect()
    } catch {
      this.manualDisconnecting = false
      // Ignore close failures from stale sockets.
    }

    this.status.connected = false
    this.status.connecting = false
    this.status.currentSceneName = null
    this.status.obsVersion = null
    this.status.obsWebSocketVersion = null
    this.status.virtualCameraActive = null
    this.status.updatedAt = new Date().toISOString()
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


