import { WebSocket } from 'ws'
import log from 'electron-log'
import { AppSettings } from '../../shared/app-settings'

export class VTubeService {
  private ws: WebSocket | null = null
  private settings: AppSettings | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private authenticated = false

  constructor() {}

  public applySettings(settings: AppSettings) {
    this.settings = settings
    if (settings.vtubeEnabled) {
      this.connect()
    } else {
      this.disconnect()
    }
  }

  private connect() {
    if (this.ws || !this.settings?.vtubeEnabled) return

    const host = this.settings.vtubeHost || '127.0.0.1'
    const port = this.settings.vtubePort || 8001
    const url = `ws://${host}:${port}`

    try {
      this.ws = new WebSocket(url)

      this.ws.on('open', () => {
        log.info('[VTube] Connected')
        this.authenticate()
      })

      this.ws.on('message', (data) => {
        const msg = JSON.parse(data.toString())
        this.handleMessage(msg)
      })

      this.ws.on('close', () => {
        log.warn('[VTube] Connection closed')
        this.ws = null
        this.authenticated = false
        this.scheduleReconnect()
      })

      this.ws.on('error', (err) => {
        log.error('[VTube] WebSocket error:', err)
        this.ws = null
        this.scheduleReconnect()
      })
    } catch (err) {
      log.error('[VTube] Connection failed:', err)
      this.scheduleReconnect()
    }
  }

  private disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
      this.authenticated = false
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || !this.settings?.vtubeEnabled) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 5000)
  }

  private authenticate() {
    if (!this.ws) return
    
    // If we have a token, use it
    if (this.settings?.vtubeToken) {
      this.send({
        apiName: 'VTubeStudioPublicAPI',
        apiVersion: '1.0',
        requestID: 'AuthenticationRequest',
        messageType: 'AuthenticationRequest',
        data: {
          pluginName: 'IlyStream',
          pluginDeveloper: 'Drew',
          authenticationToken: this.settings.vtubeToken
        }
      })
    } else {
      // Request a token
      this.send({
        apiName: 'VTubeStudioPublicAPI',
        apiVersion: '1.0',
        requestID: 'TokenRequest',
        messageType: 'AuthenticationTokenRequest',
        data: {
          pluginName: 'IlyStream',
          pluginDeveloper: 'Drew'
        }
      })
    }
  }

  private handleMessage(msg: any) {
    if (msg.messageType === 'AuthenticationTokenResponse') {
      log.info('[VTube] Received Token. Please save it in settings.')
      // In a real app, we would emit an IPC event to the renderer to notify the user
    } else if (msg.messageType === 'AuthenticationResponse') {
      if (msg.data.authenticated) {
        log.info('[VTube] Authenticated Successfully')
        this.authenticated = true
      } else {
        log.error('[VTube] Authentication Failed:', msg.data.reason)
      }
    }
  }

  private send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  public triggerHotkey(hotkeyId: string) {
    if (!this.authenticated) return
    this.send({
      apiName: 'VTubeStudioPublicAPI',
      apiVersion: '1.0',
      requestID: 'HotkeyRequest',
      messageType: 'HotkeyTriggerRequest',
      data: {
        hotkeyID: hotkeyId
      }
    })
  }

  public triggerExpression(expressionFile: string, active: boolean = true) {
    if (!this.authenticated) return
    this.send({
      apiName: 'VTubeStudioPublicAPI',
      apiVersion: '1.0',
      requestID: 'ExpressionRequest',
      messageType: 'ExpressionActivationRequest',
      data: {
        expressionFile,
        active
      }
    })
  }
}
