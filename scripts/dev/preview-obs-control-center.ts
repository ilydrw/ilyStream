import { createServer } from 'node:http'
import { buildOBSWorkspaceHtml } from '../../src/main/obs/obs-workspace-template'

const host = '127.0.0.1'
const port = Number(process.env.ILYSTREAM_OBS_CONTROL_PREVIEW_PORT || 18991)

const snapshot = {
  protocol: 1,
  generatedAt: new Date().toISOString(),
  appVersion: '0.0.27-preview',
  obs: {
    enabled: true,
    connecting: false,
    connected: true,
    host: '127.0.0.1',
    port: 4455,
    currentSceneName: 'Black on Black',
    lastError: null,
    obsWebSocketVersion: '5.7.4',
    obsVersion: '32.2.2',
    virtualCameraActive: false,
    recordingActive: false,
    streamActive: false,
    scenes: ['Black on Black', 'Starting Soon', 'BRB', 'Vertical'],
    updatedAt: new Date().toISOString()
  },
  overlay: { running: true, port: 8899, lastError: null },
  platforms: [
    { id: 'tiktok', status: 'connected', error: null, viewerCount: 142, canSendChat: true, chatUnavailableReason: null },
    { id: 'twitch', status: 'connected', error: null, viewerCount: 38, canSendChat: true, chatUnavailableReason: null },
    { id: 'youtube', status: 'disconnected', error: null, viewerCount: 0, canSendChat: false, chatUnavailableReason: 'Connect YouTube to send chat.' },
    { id: 'kick', status: 'connected', error: null, viewerCount: 19, canSendChat: true, chatUnavailableReason: null }
  ],
  widgets: [
    { id: 'unified-chat', name: 'ilyStream Unified Chat', type: 'chat-unified', inputName: 'ilyStream Unified Chat', managedSource: { inputName: 'ilyStream Unified Chat', sceneReferences: [{ sceneName: 'Black on Black' }] } },
    { id: 'alerts', name: 'ilyStream Alerts', type: 'alerts', inputName: 'ilyStream Alerts', managedSource: { inputName: 'ilyStream Alerts', sceneReferences: [{ sceneName: 'Black on Black' }] } },
    { id: 'follower-goal', name: 'Follower Goal', type: 'follower-goal', inputName: null, managedSource: null },
    { id: 'likes', name: 'Likes Leaderboard', type: 'likes-tracker', inputName: 'ilyStream Likes Leaderboard', managedSource: { inputName: 'ilyStream Likes Leaderboard', sceneReferences: [{ sceneName: 'Vertical' }] } }
  ],
  widgetWarnings: [],
  soundboard: [
    { id: 'board/airhorn.mp3', name: 'airhorn.mp3', emoji: '📣' },
    { id: 'board/bruh.wav', name: 'bruh.wav', emoji: '💀' },
    { id: 'board/applause.mp3', name: 'applause.mp3', emoji: '👏' },
    { id: 'board/vine-boom.wav', name: 'vine-boom.wav', emoji: '💥' }
  ],
  tts: { enabled: true, paused: false, playing: false, queueLength: 2 },
  nativeBridge: {
    running: true,
    connected: true,
    clientVersion: '0.1.0',
    obsVersion: '32.2.2',
    capabilities: ['dock', 'frontend-events'],
    lastSeenAt: new Date().toISOString(),
    lastError: null
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${host}:${port}`)
  if (url.pathname === '/api/snapshot') {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    response.end(JSON.stringify(snapshot))
    return
  }
  if (url.pathname === '/api/action') {
    for await (const _chunk of request) {}
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    response.end(JSON.stringify({ ok: true, action: 'preview', message: 'Preview action completed.', snapshot }))
    return
  }
  if (url.pathname === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    response.end(buildOBSWorkspaceHtml({ csrfToken: 'preview-token', nonce: 'preview-nonce', appVersion: '0.0.27' }))
    return
  }
  response.writeHead(404)
  response.end()
})

server.listen(port, host, () => {
  console.log(`OBS Control Center preview: http://${host}:${port}/`)
})

