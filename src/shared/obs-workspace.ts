import type { OBSManagedBrowserSource, OBSRuntimeStatus } from './obs'
import type { OverlayRuntimeStatus } from './overlay'
import type { WidgetType } from './widgets'

export const OBS_WORKSPACE_PROTOCOL_VERSION = 1 as const
export const OBS_WORKSPACE_DEFAULT_PORT = 18_989

export interface OBSWorkspacePlatformState {
  id: string
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  error: string | null
  viewerCount: number
  canSendChat: boolean
  chatUnavailableReason: string | null
}

export interface OBSWorkspaceWidgetState {
  id: string
  name: string
  type: WidgetType
  inputName: string | null
  managedSource: OBSManagedBrowserSource | null
}

export interface OBSWorkspaceSound {
  id: string
  name: string
  emoji: string | null
}

export interface OBSNativeBridgeStatus {
  running: boolean
  connected: boolean
  clientVersion: string | null
  obsVersion: string | null
  capabilities: string[]
  programConsumers: number
  lastSeenAt: string | null
  lastError: string | null
}

export interface OBSWorkspaceSnapshot {
  protocol: typeof OBS_WORKSPACE_PROTOCOL_VERSION
  generatedAt: string
  appVersion: string
  obs: OBSRuntimeStatus
  overlay: OverlayRuntimeStatus
  platforms: OBSWorkspacePlatformState[]
  widgets: OBSWorkspaceWidgetState[]
  widgetWarnings: string[]
  soundboard: OBSWorkspaceSound[]
  tts: {
    enabled: boolean
    paused: boolean
    playing: boolean
    queueLength: number
  }
  nativeBridge: OBSNativeBridgeStatus
}

export type OBSWorkspaceAction =
  | { type: 'obs.reconnect' }
  | { type: 'obs.setScene'; sceneName: string }
  | { type: 'obs.toggleVirtualCamera' }
  | { type: 'obs.saveReplayBuffer' }
  | { type: 'widget.upsert'; widgetId: string; sceneName?: string }
  | { type: 'widget.repair'; widgetId: string; inputName: string }
  | { type: 'widget.refresh'; inputName: string }
  | { type: 'sound.play'; soundId: string; volume?: number }
  | { type: 'sound.stopAll' }
  | { type: 'tts.pause' }
  | { type: 'tts.resume' }
  | { type: 'tts.skip' }
  | { type: 'chat.send'; platforms: string[]; text: string }
  | { type: 'alert.testFollow'; platform?: string }

export interface OBSWorkspaceActionResult {
  ok: boolean
  action: OBSWorkspaceAction['type']
  message: string
  data?: unknown
  snapshot?: OBSWorkspaceSnapshot
}

export interface OBSWorkspaceAccess {
  protocol: typeof OBS_WORKSPACE_PROTOCOL_VERSION
  running: boolean
  port: number | null
  controlUrl: string | null
  pairUrl: string | null
  lastError: string | null
  nativeBridge: OBSNativeBridgeStatus
}

export type OBSWorkspaceSetupComponent = 'theme' | 'plugin'

export interface OBSWorkspaceSetupComponentStatus {
  available: boolean
  installed: boolean
  sourcePath: string | null
  installPath: string | null
  stagedPath?: string | null
  version: string | null
  detail: string
}

export interface OBSWorkspaceSetupStatus {
  obsRunning: boolean
  theme: OBSWorkspaceSetupComponentStatus
  plugin: OBSWorkspaceSetupComponentStatus
}

export interface OBSWorkspaceSetupResult {
  ok: boolean
  component: OBSWorkspaceSetupComponent
  message: string
  status: OBSWorkspaceSetupStatus
}
