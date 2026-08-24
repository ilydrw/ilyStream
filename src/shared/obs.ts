import type { WidgetType } from './widgets'

export interface OBSRuntimeStatus {
  enabled: boolean
  connecting: boolean
  connected: boolean
  host: string
  port: number
  currentSceneName: string | null
  lastError: string | null
  obsWebSocketVersion: string | null
  obsVersion: string | null
  virtualCameraActive: boolean | null
  recordingActive: boolean | null
  streamActive: boolean | null
  scenes: string[]
  updatedAt: string | null
}

export interface OBSWidgetBrowserSourceSpec {
  widgetId: string
  widgetName: string
  widgetType: WidgetType
  widgetConfig?: unknown
}

export interface OBSBrowserSourceRecommendation {
  url: string
  width: number
  height: number
  fps: number
}

export interface OBSManagedBrowserSourceSceneReference {
  sceneName: string
  containerName: string
  sceneItemId: number
  nested: boolean
}

export interface OBSManagedBrowserSource {
  inputName: string
  inputUuid: string | null
  widgetId: string
  url: string
  width: number | null
  height: number | null
  fps: number | null
  fpsCustom: boolean
  sceneReferences: OBSManagedBrowserSourceSceneReference[]
}

export interface OBSManagedBrowserSourceInspection {
  sources: OBSManagedBrowserSource[]
  warnings: string[]
}

export interface OBSAttachManagedBrowserSourceRequest {
  inputName: string
  /** Uses the current program scene when omitted. */
  sceneName?: string
  sceneItemEnabled?: boolean
}

export interface OBSAttachManagedBrowserSourceResult {
  inputName: string
  sceneName: string
  containerName: string
  sceneItemId: number
  attached: boolean
  alreadyAttached: boolean
  nested: boolean
}

export interface OBSUpsertWidgetBrowserSourceRequest extends OBSWidgetBrowserSourceSpec {
  /** Preferred OBS input name. A collision is resolved without renaming the other input. */
  inputName?: string
  /** Uses the current program scene when omitted. */
  sceneName?: string
  sceneItemEnabled?: boolean
  width?: number
  height?: number
  fps?: number
}

export interface OBSUpsertWidgetBrowserSourceResult {
  source: OBSManagedBrowserSource
  recommendation: OBSBrowserSourceRecommendation
  created: boolean
  updated: boolean
  attachment: OBSAttachManagedBrowserSourceResult | null
  duplicateInputNames: string[]
  warnings: string[]
}

export interface OBSRepairManagedBrowserSourceRequest extends OBSWidgetBrowserSourceSpec {
  inputName: string
  width?: number
  height?: number
  fps?: number
}

export interface OBSRepairManagedBrowserSourceResult {
  source: OBSManagedBrowserSource
  recommendation: OBSBrowserSourceRecommendation
  repaired: boolean
}

export interface OBSRefreshManagedBrowserSourceResult {
  inputName: string
  refreshed: true
}
