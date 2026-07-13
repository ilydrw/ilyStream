import { BridgeHttpError, type TikTokLiveProvider } from './types.js'

export class PendingTikTokLiveProvider implements TikTokLiveProvider {
  async getAccess(): Promise<{ access: 'pending'; message: string }> {
    return {
      access: 'pending',
      message: 'TikTok native LIVE partner access is under review.'
    }
  }

  async prepare(): Promise<never> {
    throw new BridgeHttpError(
      403,
      'live_access_pending',
      'TikTok native LIVE partner access is under review.'
    )
  }

  async complete(): Promise<void> {
    // Idempotent while no approved provider can create a LIVE session.
  }
}
