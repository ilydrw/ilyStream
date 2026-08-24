import { BrowserWindow } from 'electron'
import { AnyStreamEvent, Platform, ConnectionStatus } from '../platforms/types'
import { ServiceRegistry } from '../services/service-registry'
import { ConnectorError } from '../platforms/base-connector'
import { logEmitter } from '../lib/logger'
import { sendToRenderer } from './safe-send'
import { LIKE_LOG_VERBOSE } from '../../shared/debug-flags'

/**
 * Forward events from main process services to the renderer via IPC.
 */
export function setupEventForwarding(
  window: BrowserWindow,
  services: ServiceRegistry
): void {
  const { platformManager, ttsEngine, triggerEngine, soundboardService, streamingService } = services

  // Forward all stream events to renderer
  platformManager.on('event', (event: AnyStreamEvent) => {
    if (event.type !== 'like' || LIKE_LOG_VERBOSE) {
      console.log(`[ipc:events] Forwarding ${event.type} to renderer...`)
    }
    if (!sendToRenderer(window, 'event:stream', toRendererStreamEvent(event))) {
      console.warn('[ipc:events] Cannot forward event: window is destroyed')
    }
  })

  // Forward platform status changes
  platformManager.on('status', (platform: Platform, status: ConnectionStatus) => {
    sendToRenderer(window, 'platform:status-change', { platform, status })
  })

  platformManager.on('connector-error', (error: ConnectorError) => {
    sendToRenderer(window, 'platform:error', toRendererConnectorError(error))
  })

  platformManager.on('reconnecting', (data: { platform: string; attempt: number; maxAttempts: number; delayMs: number; reason?: string }) => {
    sendToRenderer(window, 'platform:reconnecting', data)
  })

  platformManager.on('profile-health', (data: { platform: Platform; state: 'idle' | 'healthy' | 'degraded'; lastSuccessAt?: number; lastFailureAt?: number; retryAt?: number; error?: string }) => {
    sendToRenderer(window, 'platform:profile-health', data)
  })

  // Forward TTS events to renderer
  ttsEngine.on('tts:speak', (data) => {
    sendToRenderer(window, 'tts:speak', data)
  })

  ttsEngine.on('tts:prefetch', (data) => {
    sendToRenderer(window, 'tts:prefetch', data)
  })

  ttsEngine.on('tts:stop-speaking', () => {
    sendToRenderer(window, 'tts:stop-speaking')
  })

  ttsEngine.on('tts:pause', () => {
    sendToRenderer(window, 'tts:pause')
  })

  ttsEngine.on('tts:resume', () => {
    sendToRenderer(window, 'tts:resume')
  })

  ttsEngine.on('queue-update', (queue) => {
    sendToRenderer(window, 'tts:queue-update', queue)
  })

  // Forward alert/sound events to renderer
  const forwardSound = (action: any) => {
    sendToRenderer(window, 'action:play-sound', action)
  }

  const forwardAlert = (alert: any) => {
    sendToRenderer(window, 'action:show-alert', alert)
  }

  triggerEngine.on('action:play-sound', (action) => {
    if (typeof action?.filePath === 'string' && action.filePath.trim()) {
      soundboardService.playSound(action.filePath, action.volume)
    }
  })
  
  services.overlayServer.on('show-alert', forwardAlert)
  soundboardService.on('action:play-sound', forwardSound)
  triggerEngine.on('receipt', (receipt) => {
    sendToRenderer(window, 'automation:run-receipt', receipt)
  })

  services.overlayServer.on('status', (status) => {
    sendToRenderer(window, 'overlay:status-changed', status)
  })

  services.overlayServer.on('overlay-broadcast', (payload) => {
    sendToRenderer(window, 'event:overlay-broadcast', payload)
  })

  services.overlayServer.on('overlay-performance', (payload) => {
    sendToRenderer(window, 'event:overlay-performance', payload)
  })

  services.overlayServer.on('device-broadcast', (payload) => {
    sendToRenderer(window, 'event:device-broadcast', payload)
  })

  streamingService.on('status', (status) => {
    sendToRenderer(window, 'streaming:status-changed', status)
  })

  // Adaptive bitrate decisions are made in main (it owns the drop counters),
  // but the h264 encoders live in renderer workers — forward so the matching
  // layout encoder can reconfigure live.
  streamingService.on('adaptive-bitrate', (payload) => {
    sendToRenderer(window, 'streaming:bitrate-adjusted', payload)
  })

  streamingService.on('native-clock', (payload) => {
    sendToRenderer(window, 'streaming:native-audio-clock', payload)
  })

  streamingService.on('program-audio', (payload) => {
    services.obsWorkspaceService.publishProgramAudio(payload)
  })

  services.obsWorkspaceService.on('programConsumersChanged', (count: number) => {
    sendToRenderer(window, 'obs:program-consumers-changed', { count })
  })

  // Panic-stop fan-out: anywhere in main can call soundboardService.stopAll()
  // and the renderer will halt every active <audio> it owns.
  soundboardService.on('action:stop-all-sounds', () => {
    sendToRenderer(window, 'action:stop-all-sounds')
  })
  
  // Forward Govee status changes
  services.goveeService.on('status-changed', (status) => {
    sendToRenderer(window, 'govee:status-changed', status)
  })

  services.goveeService.on('ble-command', (payload) => {
    sendToRenderer(window, 'govee:ble-command', payload)
  })

  // Forward logs to renderer
  logEmitter.on('log', (logData) => {
    sendToRenderer(window, 'system:log', logData)
  })
}

function toRendererStreamEvent(event: AnyStreamEvent): Omit<AnyStreamEvent, 'raw' | 'timestamp'> & { timestamp: string } {
  const { raw: _raw, timestamp, ...rest } = event as AnyStreamEvent & { raw?: unknown }
  return {
    ...rest,
    timestamp: timestamp instanceof Date ? timestamp.toISOString() : String(timestamp ?? new Date().toISOString())
  } as Omit<AnyStreamEvent, 'raw' | 'timestamp'> & { timestamp: string }
}

function toRendererConnectorError(error: ConnectorError): Omit<ConnectorError, 'timestamp'> & { timestamp: string } {
  return {
    ...error,
    timestamp: error.timestamp instanceof Date ? error.timestamp.toISOString() : String(error.timestamp ?? new Date().toISOString())
  }
}
