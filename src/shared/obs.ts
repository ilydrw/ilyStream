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
  updatedAt: string | null
}
