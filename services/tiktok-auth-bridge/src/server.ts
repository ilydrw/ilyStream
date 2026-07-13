import { createServer } from 'node:http'
import { TikTokAuthBridge } from './bridge.js'
import { loadTikTokBridgeConfig } from './config.js'
import { createTikTokBridgeHandler } from './http-handler.js'
import { PendingTikTokLiveProvider } from './live-provider.js'
import { EncryptedFileTikTokSessionStore } from './session-store.js'
import { OfficialTikTokOAuthClient } from './tiktok-oauth-client.js'

const config = loadTikTokBridgeConfig()
const sessionStore = new EncryptedFileTikTokSessionStore(
  config.sessionFile,
  config.encryptionKey
)
const oauthClient = new OfficialTikTokOAuthClient(config.clientKey, config.clientSecret)
const bridge = new TikTokAuthBridge({
  clientKey: config.clientKey,
  redirectUri: config.redirectUri,
  desktopSessionTtlMs: config.desktopSessionTtlMs,
  oauthClient,
  sessionStore,
  liveProvider: new PendingTikTokLiveProvider()
})
const server = createServer(createTikTokBridgeHandler(bridge))

server.listen(config.port, config.host, () => {
  console.log(`[tiktok-bridge] Listening on http://${config.host}:${config.port}`)
})

const shutdown = (): void => {
  server.close((error) => {
    if (error) {
      console.error('[tiktok-bridge] Shutdown failed.', error)
      process.exitCode = 1
    }
  })
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
