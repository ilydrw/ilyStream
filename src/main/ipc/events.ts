import { BrowserWindow } from 'electron'
import { ServiceRegistry } from '../services/service-registry'
import { AnyStreamEvent, Platform, ConnectionStatus } from '../platforms/types'
import { ConnectorError } from '../platforms/base-connector'

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
    if (!window.isDestroyed()) {
      window.webContents.send('event:stream', toRendererStreamEvent(event))
    }
  })

  // Forward platform status changes
  platformManager.on('status', (platform: Platform, status: ConnectionStatus) => {
    if (!window.isDestroyed()) {
      window.webContents.send('platform:status-change', { platform, status })
    }
  })

  platformManager.on('connector-error', (error: ConnectorError) => {
    if (!window.isDestroyed()) {
      window.webContents.send('platform:error', toRendererConnectorError(error))
    }
  })

  platformManager.on('reconnecting', (data: { platform: string; attempt: number; maxAttempts: number; delayMs: number }) => {
    if (!window.isDestroyed()) {
      window.webContents.send('platform:reconnecting', data)
    }
  })

  // Forward TTS events to renderer
  ttsEngine.on('tts:speak', (data) => {
    if (!window.isDestroyed()) {
      window.webContents.send('tts:speak', data)
    }
  })

  ttsEngine.on('tts:prefetch', (data) => {
    if (!window.isDestroyed()) {
      window.webContents.send('tts:prefetch', data)
    }
  })

  ttsEngine.on('tts:stop-speaking', () => {
    if (!window.isDestroyed()) {
      window.webContents.send('tts:stop-speaking')
    }
  })

  ttsEngine.on('tts:pause', () => {
    if (!window.isDestroyed()) {
      window.webContents.send('tts:pause')
    }
  })

  ttsEngine.on('tts:resume', () => {
    if (!window.isDestroyed()) {
      window.webContents.send('tts:resume')
    }
  })

  ttsEngine.on('queue-update', (queue) => {
    if (!window.isDestroyed()) {
      window.webContents.send('tts:queue-update', queue)
    }
  })

  // Forward alert/sound events to renderer
  const forwardSound = (action: any) => {
    if (!window.isDestroyed()) {
      window.webContents.send('action:play-sound', action)
    }
  }

  const forwardAlert = (alert: any) => {
    if (!window.isDestroyed()) {
      window.webContents.send('action:show-alert', alert)
    }
  }

  triggerEngine.on('action:play-sound', (action) => {
    if (typeof action?.filePath === 'string' && action.filePath.trim()) {
      soundboardService.playSound(action.filePath, action.volume)
    }
  })
  
  triggerEngine.on('action:show-alert', forwardAlert)
  services.overlayServer.on('show-alert', forwardAlert)
  soundboardService.on('action:play-sound', forwardSound)
  services.overlayServer.on('status', (status) => {
    if (!window.isDestroyed()) {
      window.webContents.send('overlay:status-changed', status)
    }
  })

  streamingService.on('status', (status) => {
    if (!window.isDestroyed()) {
      window.webContents.send('streaming:status-changed', status)
    }
  })

  streamingService.on('native-clock', (payload) => {
    if (!window.isDestroyed()) {
      window.webContents.send('streaming:native-audio-clock', payload)
    }
  })

  // Panic-stop fan-out: anywhere in main can call soundboardService.stopAll()
  // and the renderer will halt every active <audio> it owns.
  soundboardService.on('action:stop-all-sounds', () => {
    if (!window.isDestroyed()) {
      window.webContents.send('action:stop-all-sounds')
    }
  })
  
  // Forward Govee status changes
  services.goveeService.on('status-changed', (status) => {
    if (!window.isDestroyed()) {
      window.webContents.send('govee:status-changed', status)
    }
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
