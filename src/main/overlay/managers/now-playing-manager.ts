import { EMPTY_NOW_PLAYING, type NowPlayingPayload } from '../../../shared/widgets'
import type { SSEManager } from '../sse-manager'
import type { DeviceApi } from '../device-api'

export class NowPlayingManager {
  private state: NowPlayingPayload = { ...EMPTY_NOW_PLAYING }
  private sse: SSEManager
  private deviceApi: DeviceApi | null = null

  constructor(sse: SSEManager, deviceApi: DeviceApi | null) {
    this.sse = sse
    this.deviceApi = deviceApi
  }

  setDeviceApi(deviceApi: DeviceApi): void {
    this.deviceApi = deviceApi
  }

  getState(): NowPlayingPayload {
    return this.state
  }

  setState(payload: NowPlayingPayload): void {
    this.state = payload
    this.sse.broadcast('now-playing', { type: 'snapshot', payload })
    this.deviceApi?.broadcast('nowPlaying', payload)
  }
}
