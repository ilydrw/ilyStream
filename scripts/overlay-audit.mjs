/**
 * Overlay audit server — renders every widget exactly the way OBS receives it
 * (real templates, non-preview mode, with the overlay runtime bootstrap
 * injected) and serves it with mock SSE/state endpoints carrying realistic
 * payloads. Open http://127.0.0.1:8901 in any browser (or an OBS browser
 * source) to eyeball every widget without running the full app.
 *
 *   node scripts/overlay-audit.mjs
 */
import { createServer } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import esbuild from 'esbuild'

const PORT = Number(process.env.OVERLAY_AUDIT_PORT || 8901)
const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..')

const outDir = mkdtempSync(join(tmpdir(), 'ilystream-overlay-audit-'))
const outFile = join(outDir, 'widget-renderers.mjs')
await esbuild.build({
  entryPoints: [join(repoRoot, 'src/main/overlay/widget-renderers.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  external: ['electron'],
  outfile: outFile,
  logLevel: 'silent'
})
const renderers = await import(pathToFileURL(outFile).href)
const { WIDGET_ALIAS_MAP, generateOverlayHtml, getDefaultWidgetConfig, injectOverlayRuntimeBootstrap } = renderers

const now = () => new Date().toISOString()

const CHAT_ITEMS = [
  { id: 'audit-1', kind: 'chat', platform: 'tiktok', platformLabel: 'TikTok', displayName: 'queena.chaos', profilePictureUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=queena', badges: [{ kind: 'mod', title: 'Moderator' }, { kind: 'member', title: 'TikTok Fan Club' }, { kind: 'superfan', title: 'Super Fan' }], message: 'This is a moderately long chat message to check wrapping in the corner layout.', accentColor: '#ff0050', timestamp: now(), emphasis: false },
  { id: 'audit-2', kind: 'chat', platform: 'twitch', platformLabel: 'Twitch', displayName: 'PicklePlaysGames', profilePictureUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=pickle', badges: [{ kind: 'member', title: 'Subscriber' }, { kind: 'vip', title: 'VIP' }], message: 'short msg', accentColor: '#9147ff', timestamp: now(), emphasis: false },
  { id: 'audit-3', kind: 'gift', platform: 'kick', platformLabel: 'Kick', displayName: 'itzgonabmay', profilePictureUrl: '', badges: [{ kind: 'team', title: 'Team member' }], message: 'sent 5 GG', meta: '$4.99', accentColor: '#53fc18', timestamp: now(), emphasis: true },
  { id: 'audit-4', kind: 'follow', platform: 'youtube', platformLabel: 'YouTube', displayName: 'DrewWatcher', profilePictureUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=drew', badges: [{ kind: 'superfan', title: 'Member' }], message: 'followed the stream', accentColor: '#ff3333', timestamp: now(), emphasis: true }
]
const GOALS_STATE = { totalLikes: 4200, totalGiftCount: 87, totalGiftValueCents: 12950, totalSubscriptions: 12, totalFollows: 58, totalShares: 21, totalRaids: 2, currentViewerCount: 341, twitchFollows: 20, twitchSubs: 8, tiktokFollows: 38, tiktokLikes: 4200, tiktokGifts: 87, lastUpdatedAt: now() }
const NOW_PLAYING_STATE = { isPlaying: true, trackId: 'audit-track', trackName: 'Neon Skyline', artists: ['Midnight Static'], albumName: 'City Lights', albumArtUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=album', durationMs: 214000, progressMs: 61000, requestedBy: 'PixelDrew', requesterPlatform: 'twitch', queue: [], status: 'ok' }
const LIKES_STATE = { totalLikes: 4200, users: [{ displayName: 'queena.chaos', count: 900, profilePictureUrl: '' }, { displayName: 'PicklePlaysGames', count: 620, profilePictureUrl: '' }, { displayName: 'itzgonabmay', count: 410, profilePictureUrl: '' }] }
const LEADERBOARD_STATE = [{ username: 'queena.chaos', score: 5200 }, { username: 'PicklePlaysGames', score: 3100 }, { username: 'itzgonabmay', score: 1800 }]
const LATEST_GIFTER = { displayName: 'itzgonabmay', giftName: 'GG', amountCents: 499, platform: 'kick' }

const CONFIG_OVERRIDES = {
  particles: {
    followerHearts: { enabled: true, count: 20 }, fallingRoses: { enabled: true, count: 20 },
    galaxy: { enabled: true, count: 20 }, ggs: { enabled: true, count: 12 }, heartMe: { enabled: true, count: 8 }
  }
}

function structuredCloneSafe(v) { return JSON.parse(JSON.stringify(v)) }
function mergeDeep(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) target[key] = mergeDeep(target[key] || {}, source[key])
    else target[key] = source[key]
  }
  return target
}
function channelSnapshot(channel) {
  if (channel === 'chat' || channel === 'chat-unified') return CHAT_ITEMS
  if (channel === 'goals') return GOALS_STATE
  if (channel === 'likes') return LIKES_STATE
  if (channel === 'leaderboard') return LEADERBOARD_STATE
  if (channel === 'latest-gifter') return LATEST_GIFTER
  if (channel === 'now-playing') return NOW_PLAYING_STATE
  if (channel === 'alerts') return []
  return null
}

const sseClients = new Set()
const eventLog = new Map()
let eventCounter = 0
function broadcast(channel, payload) {
  const id = ++eventCounter
  if (!eventLog.has(channel)) eventLog.set(channel, [])
  const log = eventLog.get(channel); log.push({ id, payload }); if (log.length > 200) log.shift()
  const packet = `id: ${id}\ndata: ${JSON.stringify(payload)}\n\n`
  for (const client of sseClients) { if (client.channel !== channel) continue; try { client.res.write(packet) } catch { sseClients.delete(client) } }
}

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)
  const path = url.pathname
  const sendJson = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(data)) }
  const sendHtml = (html, status = 200) => { res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(html) }

  if (path === '/overlay/events') {
    const channel = url.searchParams.get('channel') || 'chat'
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' })
    res.write(`data: ${JSON.stringify({ type: 'snapshot', payload: channelSnapshot(channel) })}\n\n`)
    const client = { res, channel }; sseClients.add(client); req.on('close', () => sseClients.delete(client)); return
  }
  if (path === '/inject') {
    const channel = url.searchParams.get('channel') || 'particles'
    const type = url.searchParams.get('type') || 'follow'
    const event = { id: 'inject-' + type + '-' + Math.random().toString(36).slice(2), type, platform: url.searchParams.get('platform') || 'tiktok', giftName: url.searchParams.get('giftName') || undefined, user: { username: 'tester', displayName: 'Tester' } }
    broadcast(channel, { type: 'event', payload: event }); sendJson({ ok: true, channel, event }); return
  }
  if (path === '/debug/clients') { const byChannel = {}; for (const c of sseClients) byChannel[c.channel] = (byChannel[c.channel] || 0) + 1; sendJson({ total: sseClients.size, byChannel, eventCounter }); return }
  if (path === '/overlay/events/poll') {
    const channel = url.searchParams.get('channel') || 'chat'
    const after = Math.max(0, Number(url.searchParams.get('after') || 0) || 0)
    if (after <= 0) { sendJson({ events: [{ id: eventCounter, data: { type: 'snapshot', payload: channelSnapshot(channel) } }], cursor: eventCounter }); return }
    const log = eventLog.get(channel) || []; const events = log.filter((e) => e.id > after).map((e) => ({ id: e.id, data: e.payload }))
    sendJson({ events, cursor: events.length ? events[events.length - 1].id : after }); return
  }
  const stateMap = { '/overlay/chat/state': CHAT_ITEMS, '/overlay/goals/state': GOALS_STATE, '/overlay/now-playing/state': NOW_PLAYING_STATE, '/overlay/state/latest-gifter': LATEST_GIFTER, '/overlay/likes/state': LIKES_STATE, '/overlay/leaderboard/state': LEADERBOARD_STATE, '/overlay/alerts/state': [] }
  if (path in stateMap) { sendJson(stateMap[path]); return }

  const widgetMatch = path.match(/^\/(?:widget|overlay)\/([a-z0-9-]+)$/)
  if (widgetMatch) {
    const alias = widgetMatch[1]; const type = WIDGET_ALIAS_MAP[alias]
    if (!type) { sendJson({ error: `Unknown widget alias: ${alias}` }, 404); return }
    if (type === 'deck') { sendJson({ error: 'deck excluded from audit' }, 400); return }
    const baseConfig = getDefaultWidgetConfig(type)
    const override = CONFIG_OVERRIDES[alias] || CONFIG_OVERRIDES[type]
    const config = override ? mergeDeep(structuredCloneSafe(baseConfig), override) : baseConfig
    const widget = { id: 'audit', name: 'Audit', type, config }
    const isPreview = url.searchParams.has('preview')
    const html = generateOverlayHtml(widget, isPreview, { settings: {}, boardSounds: [], deckActions: [] })
    if (!html) { sendJson({ error: `No renderer for ${type}` }, 500); return }
    sendHtml(injectOverlayRuntimeBootstrap(html)); return
  }
  if (path === '/' || path === '/index.html') {
    const seen = new Set()
    const links = Object.keys(WIDGET_ALIAS_MAP).filter((a) => WIDGET_ALIAS_MAP[a] !== 'deck').sort().filter((a) => { if (seen.has(WIDGET_ALIAS_MAP[a])) return false; seen.add(WIDGET_ALIAS_MAP[a]); return true }).map((a) => `<li><a href="/widget/${a}">${WIDGET_ALIAS_MAP[a]}</a> <code>/widget/${a}</code></li>`).join('\n')
    sendHtml(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Overlay audit</title><style>body{font-family:system-ui;background:#101216;color:#eee;padding:40px}a{color:#19c8ff}li{margin:6px 0}</style></head><body><h1>Overlay audit</h1><ul>${links}</ul></body></html>`); return
  }
  sendJson({ error: 'not found' }, 404)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[overlay-audit] serving on http://127.0.0.1:${PORT}`)
  const types = new Set(Object.values(WIDGET_ALIAS_MAP)); types.delete('deck')
  console.log(`[overlay-audit] widget types: ${[...types].join(', ')}`)
})
