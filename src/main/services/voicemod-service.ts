import { WebSocket } from 'ws'
import log from 'electron-log'
import { AppSettings } from '../../shared/app-settings'

export class VoicemodService {
  private ws: WebSocket | null = null
  private settings: AppSettings | null = null
  private reconnectTimer: NodeJS.Timeout | null = null

  constructor() {}

  public applySettings(settings: AppSettings) {
    this.settings = settings
    if (settings.voicemodEnabled) {
      this.connect()
    } else {
      this.disconnect()
    }
  }

  private connect() {
    if (this.ws || !this.settings?.voicemodEnabled) return

    const host = this.settings.voicemodHost || '127.0.0.1'
    const url = `ws://${host}:59129/v1`

    try {
      this.ws = new WebSocket(url)

      this.ws.on('open', () => {
        log.info('[Voicemod] Connected')
        this.authenticate()
      })

      this.ws.on('message', (data) => {
        const msg = JSON.parse(data.toString())
        log.debug('[Voicemod] Received:', msg)
      })

      this.ws.on('close', () => {
        log.warn('[Voicemod] Connection closed')
        this.ws = null
        this.scheduleReconnect()
      })

      this.ws.on('error', (err) => {
        log.error('[Voicemod] WebSocket error:', err)
        this.ws = null
        this.scheduleReconnect()
      })
    } catch (err) {
      log.error('[Voicemod] Connection failed:', err)
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
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || !this.settings?.voicemodEnabled) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 5000)
  }

  private authenticate() {
    if (!this.ws || !this.settings?.voicemodApiKey) return
    
    this.send({
      id: 'auth',
      action: 'authenticate',
      payload: {
        apiKey: this.settings.voicemodApiKey
      }
    })
  }

  private send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  public async setVoice(voiceId: string, durationSec: number = 0) {
    log.info(`[Voicemod] Switching to voice: ${voiceId}`)
    this.send({
      id: 'set-voice',
      action: 'loadVoice',
      payload: { voiceId }
    })

    if (durationSec > 0) {
      setTimeout(() => {
        log.info('[Voicemod] Resetting voice to clean')
        this.send({
          id: 'reset-voice',
          action: 'loadVoice',
          payload: { voiceId: 'clean' }
        })
      }, durationSec * 1000)
    }
  }

  public async playSound(soundId: string) {
    log.info(`[Voicemod] Playing sound: ${soundId}`)
    this.send({
      id: 'play-sound',
      action: 'playMeme',
      payload: { fileName: soundId }
    })
  }
}
