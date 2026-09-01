import {
  getWidgetDefaultConfig,
  WIDGET_RUNTIME_REGISTRY,
  WIDGET_ALIAS_MAP as SHARED_WIDGET_ALIAS_MAP,
  type Widget,
  type WidgetType
} from '../../shared/widgets'
import { buildAlertsOverlayHtml } from './templates/alerts'
import { buildBrbScreenHtml } from './templates/brb-screen'
import { buildCameraFrameHtml } from './templates/camera-frame'
import { buildChatOverlayHtml } from './templates/chat'
import { buildChatWidgetHtml } from './templates/chat-widget'
import { buildDeckHtml } from './templates/deck'
import { buildDiscordPromoHtml } from './templates/discord-promo'
import { buildDiscordCallHtml } from './templates/discord-call'
import { buildParticleOverlayHtml } from './templates/event-particles'
import { buildRoseOverlayHtml } from './templates/falling-roses'
import { buildFollowerGoalHtml } from './templates/follower-goal'
import { buildGoalsOverlayHtml } from './templates/goals'
import { buildLatestGifterHtml } from './templates/latest-gifter'
import { buildLeaderboardHtml } from './templates/leaderboard'
import { buildLikesTrackerHtml } from './templates/likes-tracker'
import { buildNodeNetworkHtml } from './templates/node-network'
import { buildNowPlayingOverlayHtml } from './templates/now-playing'
import { buildParticlesOverlayHtml } from './templates/particles'
import { buildPhysicsOverlayHtml } from './templates/physics'
import { buildScreenBorderHtml } from './templates/screen-border'
import { buildSocialsOverlayHtml } from './templates/socials'
import { buildTextWidgetHtml } from './templates/text-widget'

export const WIDGET_ALIAS_MAP: Record<string, WidgetType | 'deck'> = {
  ...SHARED_WIDGET_ALIAS_MAP,
  deck: 'deck'
}

export interface OverlayRendererContext {
  settings: Record<string, unknown>
  boardSounds: unknown[]
  deckActions: unknown[]
}

export function getDefaultWidgetConfig(type: WidgetType): any {
  return getWidgetDefaultConfig(type)
}

export function generateOverlayHtml(
  widget: Widget,
  isPreview: boolean,
  context: OverlayRendererContext
): string | null {
  const type = widget.type === ('deck' as any)
    ? 'deck'
    : WIDGET_RUNTIME_REGISTRY[widget.type]?.canonicalType || widget.type
  const config = type === 'alerts'
    ? { ...(widget.config as any), ...(context.settings as any) }
    : widget.config

  switch (type as any) {
    case 'chat': return buildChatOverlayHtml(widget, isPreview)
    case 'alerts': return buildAlertsOverlayHtml({ ...widget, config }, isPreview)
    case 'goal': return buildGoalsOverlayHtml(widget, isPreview)
    case 'follower-goal': return buildFollowerGoalHtml(widget, isPreview)
    case 'text': return buildTextWidgetHtml(widget, isPreview)
    case 'socials': return buildSocialsOverlayHtml(widget, isPreview)
    case 'now-playing': return buildNowPlayingOverlayHtml(widget, isPreview)
    case 'screen-border': return buildScreenBorderHtml(widget, isPreview)
    case 'brb-screen': return buildBrbScreenHtml(widget, isPreview)
    case 'camera-frame': return buildCameraFrameHtml(widget, isPreview)
    case 'event-particles': return buildParticleOverlayHtml(widget, isPreview)
    case 'falling-roses': return buildRoseOverlayHtml(widget, isPreview)
    case 'particles': return buildParticlesOverlayHtml(widget, isPreview)
    case 'discord-promo': return buildDiscordPromoHtml(widget, isPreview)
    case 'discord-call': return buildDiscordCallHtml(widget, isPreview)
    case 'node-network': return buildNodeNetworkHtml(widget, isPreview)
    case 'latest-gifter': return buildLatestGifterHtml(widget, isPreview)
    case 'physics': return buildPhysicsOverlayHtml(widget, isPreview)
    case 'deck': return buildDeckHtml(context.boardSounds as any, context.deckActions as any)
    case 'leaderboard': return buildLeaderboardHtml(widget, isPreview)
    case 'chat-unified': return buildChatWidgetHtml(widget, isPreview)
    case 'likes-tracker': return buildLikesTrackerHtml(widget, isPreview)
    default: return null
  }
}

export function buildOverlayDirectoryHtml(widgetId?: string): string {
  const entries: Array<{ key: string; label: string; icon: string }> = [
    { key: 'chat-unified', label: 'Unified Chat', icon: '💬' },
    { key: 'chat', label: 'Classic Chat Feed', icon: '💬' },
    { key: 'alerts', label: 'Event Alerts', icon: '🔔' },
    { key: 'follower-goal', label: 'Follower Goal', icon: '👥' },
    { key: 'text', label: 'Custom Text', icon: '🔤' },
    { key: 'goals', label: 'Goal Tracker', icon: '🎯' },
    { key: 'now-playing', label: 'Now Playing', icon: '🎵' },
    { key: 'socials', label: 'Socials Rotation', icon: '📱' },
    { key: 'screen-border', label: 'Screen Border', icon: '🖼️' },
    { key: 'brb-screen', label: 'Be Right Back', icon: '☕' },
    { key: 'camera-frame', label: 'Camera Mask Outline', icon: '📷' },
    { key: 'particles', label: 'Particles', icon: '✨' },
    { key: 'discord-promo', label: 'Discord Promo', icon: '💬' },
    { key: 'discord-call', label: 'Discord Call', icon: '🎙️' },
    { key: 'node-network', label: 'Node Network', icon: '🔗' },
    { key: 'latest-gifter', label: 'Latest Gifter', icon: '✨' },
    { key: 'physics', label: 'Physics Field', icon: '⚡' },
    { key: 'leaderboard', label: 'Likeathon Board', icon: '🏆' },
    { key: 'likes-tracker', label: 'Like Tracker', icon: '❤️' },
    { key: 'deck', label: 'Deck', icon: '🎛️' }
  ]

  const cards = entries.map((entry) => {
    return `
      <a href="/overlay/${entry.key}" class="card">
        <div class="icon">${entry.icon}</div>
        <div class="name">${escapeHtml(entry.label)}</div>
      </a>
    `
  }).join('')

  return `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>ilyStream | Overlay Directory</title>
      <style>
        body {
          margin: 0;
          background: #050505;
          color: white;
          font-family: Inter, Outfit, Segoe UI, system-ui, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
        }
        .container {
          max-width: 800px;
          width: 90%;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          padding: 40px;
          box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        }
        h1 { margin: 0 0 10px; font-size: 32px; font-weight: 800; }
        p.subtitle { color: rgba(255,255,255,0.5); margin: 0 0 32px; font-size: 16px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; }
        .card {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 20px;
          text-decoration: none;
          color: white;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .card:hover { background: rgba(255,255,255,0.1); border-color: #19c8ff; transform: translateY(-3px); }
        .icon { font-size: 24px; margin-bottom: 12px; }
        .name { font-weight: 700; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
        .error-box {
          background: rgba(254, 44, 85, 0.1);
          border-left: 4px solid #fe2c55;
          padding: 15px 20px;
          margin-bottom: 30px;
          border-radius: 8px;
        }
        .error-box b { color: #fe2c55; }
      </style>
    </head>
    <body>
      <div class="container">
        ${widgetId && widgetId !== 'overlay' && widgetId !== 'widget' ? `
          <div class="error-box"><b>Unknown Path:</b> The widget ID "${escapeHtml(widgetId)}" was not found.</div>
        ` : ''}
        <h1>Overlay Directory</h1>
        <p class="subtitle">Legacy fallback routes. For OBS, use the URL shown on a saved widget card in the app.</p>
        <div class="grid">${cards}</div>
      </div>
    </body>
    </html>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Preview shell used by WidgetEditorModal. The shell keeps the outer iframe
// URL stable while rendering widget HTML inside a child `srcdoc` iframe.
// Replacing `srcdoc` creates a fresh JavaScript realm for every full preview
// update, so top-level `let`/`const` declarations cannot collide and timers,
// animation frames, and EventSource connections from the previous render are
// torn down with the old child document.
//
// Protocol:
//   parent -> iframe: { type: 'ilystream:preview-config', config: object }
//     Live config delivery. The template can define
//     `window.__ilystreamApplyConfig(config)` to consume it without a DOM
//     swap (CSS variables + data attributes). If no handler is registered,
//     the bootstrap posts `preview-needs-html` back so the parent falls
//     back to the HTML-swap path for that iframe.
//
//   parent -> iframe: { type: 'ilystream:preview-html', html: string }
//     Full HTML replacement. The child iframe navigates to a new `srcdoc`
//     document so its scripts execute once in a clean scope.
//
//   iframe -> parent: { type: 'ilystream:preview-ready' }
//     Sent once on load so the parent knows to push the initial draft.
//
//   iframe -> parent: { type: 'ilystream:preview-needs-html' }
//     Sent when the iframe receives a `preview-config` but has no
//     `__ilystreamApplyConfig` to handle it. Parent should switch to the
//     HTML-swap path for this iframe.
function serializePreviewScriptValue(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function serializeInlineScriptData(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function buildPreviewShell(previewToken: string, initialHtml: string): string {
  const serializedToken = serializePreviewScriptValue(previewToken)
  const serializedInitialHtml = serializePreviewScriptValue(initialHtml)
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  html, body, #ilystream-preview-stage, .ilystream-preview-frame {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    overflow: hidden;
    background: transparent;
  }
  #ilystream-preview-stage { position: relative; }
  .ilystream-preview-frame {
    position: absolute;
    inset: 0;
    display: block;
    opacity: 0;
    visibility: hidden;
  }
  .ilystream-preview-frame.is-active {
    opacity: 1;
    visibility: visible;
  }
</style>
<script id="ilystream-preview-bootstrap">
(function(){
  var PREVIEW_TOKEN=${serializedToken};
  var INITIAL_HTML=${serializedInitialHtml};
  var trustedParentOrigin=null;
  var APPLY_HTML='ilystream:preview-html';
  var APPLY_CONFIG='ilystream:preview-config';
  var READY='ilystream:preview-ready';
  var NEEDS_HTML='ilystream:preview-needs-html';
  var FRAME_IDS=['ilystream-preview-frame-a','ilystream-preview-frame-b'];
  var ACTIVATION_FALLBACK_MS=250;
  var activeFrameId=null;
  var htmlRevision=0;
  function getFrameById(id){
    return id ? document.getElementById(id) : null;
  }
  function getActiveFrame(){
    return getFrameById(activeFrameId);
  }
  function getInactiveFrame(){
    return getFrameById(activeFrameId === FRAME_IDS[0] ? FRAME_IDS[1] : FRAME_IDS[0]);
  }
  function isPreviewFrameSource(source){
    for (var i=0; i<FRAME_IDS.length; i++) {
      var frame = getFrameById(FRAME_IDS[i]);
      if (frame && source === frame.contentWindow) return true;
    }
    return false;
  }
  function activateFrame(frame, previous, revision){
    if (!frame || revision !== htmlRevision) return;
    frame.onload = null;
    frame.classList.add('is-active');
    if (previous && previous !== frame) {
      previous.classList.remove('is-active');
      previous.srcdoc = '<!DOCTYPE html><html><body></body></html>';
    }
    activeFrameId = frame.id;
  }
  function applyHtml(htmlString){
    try {
      var previous = getActiveFrame();
      var frame = getInactiveFrame();
      if (!frame) return;
      var revision = ++htmlRevision;
      frame.onload = function(){
        activateFrame(frame, previous, revision);
      };
      frame.srcdoc = htmlString;
      // There is no old document to preserve on first paint. Make the initial
      // buffer visible immediately so an aborted/replaced srcdoc navigation
      // cannot leave both buffers permanently hidden in Electron.
      if (!previous) activateFrame(frame, null, revision);
      // Chromium normally fires load for srcdoc, but a rapid replacement can
      // abort that navigation. Keep the previous frame until either load or a
      // short bounded fallback activates the completed buffer.
      setTimeout(function(){
        activateFrame(frame, previous, revision);
      }, ACTIVATION_FALLBACK_MS);
    } catch (err) {
      console.error('[ilystream-preview] apply HTML failed', err);
    }
  }
  function applyConfig(config){
    var frame = getActiveFrame();
    var fn = null;
    try { fn = frame && frame.contentWindow && frame.contentWindow.__ilystreamApplyConfig; }
    catch (err) {}
    if (typeof fn === 'function') {
      try { return fn.call(frame.contentWindow, config) !== false; }
      catch (err) { console.error('[ilystream-preview] applyConfig failed', err); return false; }
    }
    return false;
  }
  function postToParent(message){
    var p = window.parent;
    if (p && p !== window) {
      message.previewToken = PREVIEW_TOKEN;
      try { p.postMessage(message, '*'); } catch (e) {}
    }
  }
  function forwardToParent(data){
    if (!data || typeof data !== 'object') return;
    var message = {};
    for (var key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) message[key] = data[key];
    }
    message.previewToken = PREVIEW_TOKEN;
    var p = window.parent;
    if (p && p !== window) {
      try { p.postMessage(message, trustedParentOrigin || '*'); } catch (e) {}
    }
  }
  window.addEventListener('message', function(event){
    var frame = getActiveFrame();
    if (isPreviewFrameSource(event.source)) {
      forwardToParent(event.data);
      return;
    }
    if (event.source !== window.parent) return;
    var data = event && event.data;
    if (!data || data.previewToken !== PREVIEW_TOKEN) return;
    if (trustedParentOrigin === null) trustedParentOrigin = event.origin;
    if (event.origin !== trustedParentOrigin) return;
    if (data.type === APPLY_HTML && typeof data.html === 'string') {
      applyHtml(data.html);
      return;
    }
    if (data.type === APPLY_CONFIG && data.config && typeof data.config === 'object') {
      var handled = applyConfig(data.config);
      if (!handled) postToParent({ type: NEEDS_HTML });
      return;
    }
    if (frame && frame.contentWindow) {
      try { frame.contentWindow.postMessage(data, '*'); } catch (e) {}
    }
  });
  try {
    Object.defineProperty(window, '__masterVolume', {
      configurable: true,
      get: function(){
        try { return window.parent.__masterVolume || 0; }
        catch (err) { return 0; }
      }
    });
  } catch (err) {}
  function initialize(){
    applyHtml(INITIAL_HTML);
    postToParent({ type: READY });
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initialize();
  } else {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  }
})();
</script>
</head>
<body>
  <div id="ilystream-preview-stage">
    <iframe id="ilystream-preview-frame-a" class="ilystream-preview-frame" title="Widget preview content" referrerpolicy="no-referrer"></iframe>
    <iframe id="ilystream-preview-frame-b" class="ilystream-preview-frame" title="Widget preview content buffer" referrerpolicy="no-referrer"></iframe>
  </div>
</body>
</html>`
}

const OVERLAY_RUNTIME_BOOTSTRAP_SCRIPT = `<script id="ilystream-overlay-runtime">
(function(){
  if (window.__ilystreamOverlayRuntime) return;
  var NativeEventSource = window.EventSource;
  var WIDGET_META = window.__ilystreamWidgetRuntimeMeta || null;
  var WS_CAPABILITY = String(window.__ilystreamWsCapability || '');
  var widgetReloadTimer = null;
  var ownedWidgetEventSource = null;
  function parseRuntimeMessage(data){
    if (typeof data !== 'string') return data && typeof data === 'object' ? data : null;
    try { return JSON.parse(data); } catch (err) { return null; }
  }
  function isWidgetControlMessage(message){
    return Boolean(message && (
      message.type === 'widget-config' ||
      message.type === 'widget-dispose' ||
      (message.type === 'reload' && String(message.reason || '').indexOf('overlay-') === 0)
    ));
  }
  function matchesCurrentWidget(message){
    if (!WIDGET_META || !message) return false;
    if (String(message.widgetId || '') === String(WIDGET_META.widgetId || '')) return true;
    return WIDGET_META.sourceKind === 'alias' &&
      WIDGET_META.widgetId === 'default' &&
      String(message.widgetType || '') === String(WIDGET_META.widgetType || '');
  }
  function reloadCurrentWidget(){
    if (widgetReloadTimer || !WIDGET_META || WIDGET_META.sourceKind === 'preview') return;
    widgetReloadTimer = setTimeout(function(){
      try { window.location.reload(); } catch (err) {}
    }, 25);
  }
  function handleWidgetControl(data){
    var message = parseRuntimeMessage(data);
    if (!isWidgetControlMessage(message)) return false;
    if (message.type === 'reload') {
      if (WIDGET_META && WIDGET_META.sourceKind !== 'preview') reloadCurrentWidget();
      return true;
    }
    // Control messages share the widget's semantic channel, but template code
    // must never interpret another widget's config as platform data.
    if (!matchesCurrentWidget(message) || !WIDGET_META || WIDGET_META.sourceKind === 'preview') return true;
    var generation = String(message.generation || '');
    if (generation && generation !== String(WIDGET_META.generation || '')) {
      WIDGET_META.generation = generation;
      WIDGET_META.revision = 0;
    }
    var revision = Number(message.revision) || 0;
    if (revision && revision <= (Number(WIDGET_META.revision) || 0)) return true;
    if (revision) WIDGET_META.revision = revision;
    if (message.type === 'widget-dispose') {
      if (WIDGET_META.sourceKind === 'alias') {
        reloadCurrentWidget();
      } else {
        // Keep the control stream alive so recreating the same widget ID can
        // recover this source, while preventing old template timers painting.
        try { document.documentElement.style.visibility = 'hidden'; } catch (err) {}
      }
      return true;
    }
    try { document.documentElement.style.visibility = ''; } catch (err) {}
    var applyConfig = window.__ilystreamApplyConfig;
    if (typeof applyConfig === 'function') {
      try {
        if (applyConfig.call(window, message.config || {}) !== false) return true;
      } catch (err) {
        console.warn('[ilystream-overlay] live config failed; reloading the affected widget.', err);
      }
    }
    reloadCurrentWidget();
    return true;
  }
  function toAbsoluteUrl(value){
    try { return new URL(value, window.location.href).href; }
    catch (err) { return String(value || ''); }
  }
  var REQUEST_TIMEOUT_MS = 5000;
  var RECONCILE_INTERVAL_MS = 3000;
  function requestJson(url){
    if (typeof fetch === 'function') {
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = setTimeout(function(){
        if (controller) controller.abort();
      }, REQUEST_TIMEOUT_MS);
      return fetch(url, {
        cache: 'no-store',
        signal: controller ? controller.signal : undefined
      }).then(function(response){
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      }).catch(function(err){
        if (err && err.name === 'AbortError') throw new Error('request timed out');
        throw err;
      }).then(function(result){
        clearTimeout(timer);
        return result;
      }, function(err){
        clearTimeout(timer);
        throw err;
      });
    }
    return new Promise(function(resolve, reject){
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = REQUEST_TIMEOUT_MS;
      xhr.onreadystatechange = function(){
        if (xhr.readyState !== 4) return;
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error('HTTP ' + xhr.status));
          return;
        }
        try { resolve(JSON.parse(xhr.responseText || '{}')); }
        catch (err) { reject(err); }
      };
      xhr.onerror = function(){ reject(new Error('network error')); };
      xhr.ontimeout = function(){ reject(new Error('request timed out')); };
      xhr.send();
    });
  }
  var HUB_OPEN_TIMEOUT_MS = 2500;
  var overlayHub = null;
  function createOverlayHub(){
    if (typeof WebSocket !== 'function' && typeof SharedWorker !== 'function') return null;
    var subscriptions = Object.create(null);
    var workerPort = null;
    var socket = null;
    var reconnectTimer = null;
    var reconnectDelay = 250;
    var directMode = false;
    var sequence = 0;
    function makeId(){
      sequence += 1;
      return 'overlay-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + sequence;
    }
  function socketUrl(){
    var url = new URL('/overlay/ws', window.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('cap', WS_CAPABILITY);
    return url.href;
    }
    function dispatch(message){
      if (!message || typeof message !== 'object') return;
      if (message.subscriptionId && subscriptions[message.subscriptionId]) {
        var targeted = subscriptions[message.subscriptionId];
        if (message.type === 'subscribed' || message.type === 'open') {
          if (message.reset) targeted.after = 0;
          targeted.onOpen(message);
        } else if (message.type === 'event') {
          if (Number(message.id) > 0) targeted.after = Math.max(targeted.after, Number(message.id));
          targeted.onEvent(message);
        } else if (message.type === 'reconnecting') {
          targeted.onReconnect(message);
        }
        return;
      }
      if (message.type !== 'event' || !message.channel) return;
      for (var id in subscriptions) {
        if (!Object.prototype.hasOwnProperty.call(subscriptions, id)) continue;
        var subscription = subscriptions[id];
        if (subscription.channel !== message.channel) continue;
        if (Number(message.id) > 0) subscription.after = Math.max(subscription.after, Number(message.id));
        subscription.onEvent(message);
      }
    }
    function sendDirect(message){
      if (!socket || socket.readyState !== 1) return false;
      try { socket.send(JSON.stringify(message)); return true; } catch (err) { return false; }
    }
    function sendSubscription(subscription){
      var message = {
        type: 'subscribe',
        subscriptionId: subscription.id,
        channel: subscription.channel,
        after: subscription.after || 0,
        sinceAt: subscription.sinceAt || 0,
        limit: 120
      };
      if (workerPort) {
        try { workerPort.postMessage(message); return true; } catch (err) { return false; }
      }
      return sendDirect(message);
    }
    function hasSubscriptions(){
      for (var id in subscriptions) {
        if (Object.prototype.hasOwnProperty.call(subscriptions, id)) return true;
      }
      return false;
    }
    function scheduleReconnect(){
      if (workerPort || reconnectTimer || !hasSubscriptions()) return;
      reconnectTimer = setTimeout(function(){
        reconnectTimer = null;
        connectDirect();
      }, reconnectDelay);
      reconnectDelay = Math.min(5000, reconnectDelay * 2);
    }
    function connectDirect(){
      if (workerPort || !hasSubscriptions()) return;
      if (socket && (socket.readyState === 0 || socket.readyState === 1)) return;
      try { socket = new WebSocket(socketUrl()); }
      catch (err) { scheduleReconnect(); return; }
      socket.onopen = function(){
        reconnectDelay = 250;
        for (var id in subscriptions) {
          if (Object.prototype.hasOwnProperty.call(subscriptions, id)) sendSubscription(subscriptions[id]);
        }
      };
      socket.onmessage = function(event){
        try { dispatch(JSON.parse(event.data)); } catch (err) {}
      };
      socket.onclose = function(){
        socket = null;
        for (var id in subscriptions) {
          if (Object.prototype.hasOwnProperty.call(subscriptions, id)) subscriptions[id].onReconnect({ type: 'reconnecting' });
        }
        scheduleReconnect();
      };
      socket.onerror = function(){};
    }
    if (typeof SharedWorker === 'function') {
      try {
        var worker = new SharedWorker('/overlay/runtime/shared-worker.js?v=3&cap=' + encodeURIComponent(WS_CAPABILITY), 'ilystream-overlay-hub-v3');
        workerPort = worker.port;
        workerPort.onmessage = function(event){ dispatch(event && event.data); };
        workerPort.start();
      } catch (err) {
        workerPort = null;
      }
    }
    directMode = !workerPort;
    return {
      mode: directMode ? 'websocket' : 'shared-worker-websocket',
      subscribe: function(channel, after, sinceAt, handlers){
        var id = makeId();
        subscriptions[id] = {
          id: id,
          channel: channel,
          after: after || 0,
          sinceAt: sinceAt || Date.now(),
          onOpen: handlers.onOpen,
          onEvent: handlers.onEvent,
          onReconnect: handlers.onReconnect
        };
        if (!sendSubscription(subscriptions[id]) && !workerPort) connectDirect();
        return id;
      },
      unsubscribe: function(id){
        if (!id || !subscriptions[id]) return;
        delete subscriptions[id];
        var message = { type: 'unsubscribe', subscriptionId: id };
        if (workerPort) {
          try { workerPort.postMessage(message); } catch (err) {}
        } else {
          sendDirect(message);
        }
      },
      receipt: function(message){
        message.type = 'receipt';
        if (workerPort) {
          try { workerPort.postMessage(message); } catch (err) {}
        } else {
          sendDirect(message);
        }
      }
    };
  }
  function getOverlayHub(){
    if (!overlayHub) overlayHub = createOverlayHub();
    return overlayHub;
  }
  function scheduleHubReceipt(hub, subscriptionId, message, receivedAt){
    if (!message || !message.measure || !hub || typeof hub.receipt !== 'function') return;
    var sent = false;
    var acknowledge = function(){
      if (sent) return;
      sent = true;
      hub.receipt({
        subscriptionId: subscriptionId,
        channel: message.channel,
        eventId: message.id,
        transport: hub.mode,
        widgetId: WIDGET_META && WIDGET_META.widgetId,
        widgetType: WIDGET_META && WIDGET_META.widgetType,
        sourceKind: WIDGET_META && WIDGET_META.sourceKind,
        receivedAt: receivedAt,
        paintedAt: Date.now()
      });
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(acknowledge);
    setTimeout(acknowledge, 250);
  }
  function RuntimeEventSource(url, config){
    this.url = toAbsoluteUrl(url);
    this.config = config;
    this.readyState = RuntimeEventSource.CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this._listeners = { open: [], message: [], error: [] };
    this._native = null;
    this._hub = null;
    this._hubSubscriptionId = null;
    this._hubOpenTimer = null;
    this._nativeOpenTimer = null;
    this._pollTimer = null;
    this._reconcileTimer = null;
    this._pollInFlight = false;
    this._pollOpened = false;
    this._lastEventId = 0;
    this._startedAt = Date.now();
    this._serverGeneration = null;
    this._closed = false;
    this._startHub();
  }
  RuntimeEventSource.CONNECTING = 0;
  RuntimeEventSource.OPEN = 1;
  RuntimeEventSource.CLOSED = 2;
  RuntimeEventSource.prototype.addEventListener = function(type, listener){
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(listener);
  };
  RuntimeEventSource.prototype.removeEventListener = function(type, listener){
    var list = this._listeners[type];
    if (!list) return;
    this._listeners[type] = list.filter(function(item){ return item !== listener; });
  };
  RuntimeEventSource.prototype.close = function(){
    this._closed = true;
    this.readyState = RuntimeEventSource.CLOSED;
    if (this._native) {
      try { this._native.close(); } catch (err) {}
      this._native = null;
    }
    if (this._hub && this._hubSubscriptionId) {
      try { this._hub.unsubscribe(this._hubSubscriptionId); } catch (err) {}
      this._hubSubscriptionId = null;
    }
    if (this._hubOpenTimer) {
      clearTimeout(this._hubOpenTimer);
      this._hubOpenTimer = null;
    }
    if (this._nativeOpenTimer) {
      clearTimeout(this._nativeOpenTimer);
      this._nativeOpenTimer = null;
    }
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    if (this._reconcileTimer) {
      clearInterval(this._reconcileTimer);
      this._reconcileTimer = null;
    }
  };
  RuntimeEventSource.prototype._dispatch = function(type, event){
    if (this._closed) return;
    var handler = this['on' + type];
    if (typeof handler === 'function') {
      try { handler.call(this, event); } catch (err) { setTimeout(function(){ throw err; }, 0); }
    }
    var list = this._listeners[type] || [];
    for (var i = 0; i < list.length; i++) {
      try { list[i].call(this, event); } catch (err) { setTimeout(function(){ throw err; }, 0); }
    }
  };
  RuntimeEventSource.prototype._dispatchMessage = function(data, id){
    var numericId = parseInt(id || '', 10);
    if (Number.isFinite(numericId) && numericId > 0) {
      // Native SSE and reconciliation polling may observe the same event.
      // Advance and deduplicate in one place so a fallback race cannot render
      // the same alert, chat message, or artwork update twice.
      if (numericId <= this._lastEventId) return;
      this._lastEventId = numericId;
    }
    if (handleWidgetControl(data)) return;
    var event = { type: 'message', data: data, lastEventId: String(id || '') };
    this._dispatch('message', event);
  };
  RuntimeEventSource.prototype._readChannel = function(){
    try {
      var parsed = new URL(this.url, window.location.href);
      return parsed.searchParams.get('channel') || 'chat';
    } catch (err) {
      return 'chat';
    }
  };
  RuntimeEventSource.prototype._startHub = function(){
    var self = this;
    var protocol = '';
    try { protocol = new URL(this.url, window.location.href).protocol; } catch (err) {}
    if (protocol !== 'http:' && protocol !== 'https:') {
      this._startNative();
      return;
    }
    var hub = getOverlayHub();
    if (!hub) {
      this._startNative();
      return;
    }
    this._hub = hub;
    try {
      this._hubSubscriptionId = hub.subscribe(
        this._readChannel(),
        this._lastEventId,
        this._startedAt,
        {
          onOpen: function(message){
            if (self._closed || !self._hubSubscriptionId) return;
            if (self._hubOpenTimer) {
              clearTimeout(self._hubOpenTimer);
              self._hubOpenTimer = null;
            }
            if (message && message.generation) self._serverGeneration = String(message.generation);
            if (message && message.reset) self._lastEventId = 0;
            self.readyState = RuntimeEventSource.OPEN;
            self._dispatch('open', { type: 'open', transport: hub.mode });
          },
          onEvent: function(message){
            if (self._closed || !self._hubSubscriptionId) return;
            var receivedAt = Date.now();
            var generation = message && message.generation ? String(message.generation) : '';
            if ((generation && self._serverGeneration && generation !== self._serverGeneration) || Boolean(message && message.reset)) {
              self._lastEventId = 0;
            }
            if (generation) self._serverGeneration = generation;
            self._dispatchMessage(JSON.stringify(message ? message.data : null), message && message.id);
            scheduleHubReceipt(hub, self._hubSubscriptionId, message, receivedAt);
          },
          onReconnect: function(){
            if (!self._closed) self.readyState = RuntimeEventSource.CONNECTING;
          }
        }
      );
    } catch (err) {
      this._hubSubscriptionId = null;
      this._startNative();
      return;
    }
    this._hubOpenTimer = setTimeout(function(){
      self._hubOpenTimer = null;
      if (self._closed || self.readyState === RuntimeEventSource.OPEN) return;
      if (self._hub && self._hubSubscriptionId) {
        try { self._hub.unsubscribe(self._hubSubscriptionId); } catch (err) {}
      }
      self._hubSubscriptionId = null;
      self._startNative();
    }, HUB_OPEN_TIMEOUT_MS);
  };
  RuntimeEventSource.prototype._startNative = function(){
    var self = this;
    if (typeof NativeEventSource !== 'function') {
      this._startPolling('EventSource unavailable');
      return;
    }
    try {
      this._native = new NativeEventSource(this.url, this.config);
    } catch (err) {
      this._startPolling('EventSource constructor failed');
      return;
    }
    var opened = false;
    this._nativeOpenTimer = setTimeout(function(){
      self._nativeOpenTimer = null;
      if (opened || self._closed) return;
      // Close the half-open native stream before polling. Otherwise a late
      // native onopen leaves two active transports delivering duplicates.
      if (self._native) {
        try { self._native.close(); } catch (err) {}
        self._native = null;
      }
      self._startPolling('EventSource open timeout');
    }, 5000);
    this._native.onopen = function(event){
      opened = true;
      if (self._nativeOpenTimer) {
        clearTimeout(self._nativeOpenTimer);
        self._nativeOpenTimer = null;
      }
      if (self._closed) return;
      self.readyState = RuntimeEventSource.OPEN;
      self._dispatch('open', event || { type: 'open' });
      self._startReconciliation();
    };
    this._native.onmessage = function(event){
      if (self._closed) return;
      self._dispatchMessage(event.data, event.lastEventId);
    };
    this._native.onerror = function(){
      if (self._nativeOpenTimer) {
        clearTimeout(self._nativeOpenTimer);
        self._nativeOpenTimer = null;
      }
      if (self._closed) return;
      if (self._native) {
        try { self._native.close(); } catch (err) {}
        self._native = null;
      }
      if (self._reconcileTimer) {
        clearInterval(self._reconcileTimer);
        self._reconcileTimer = null;
      }
      self._startPolling('EventSource stream failed');
    };
  };
  RuntimeEventSource.prototype._pollOnce = function(reconcileOnly){
    var self = this;
    if (this._closed || this._pollInFlight) return;
    this._pollInFlight = true;
    var url = new URL('/overlay/events/poll', window.location.href);
    url.searchParams.set('channel', this._readChannel());
    url.searchParams.set('after', String(this._lastEventId || 0));
    if (!this._lastEventId) url.searchParams.set('since', String(this._startedAt));
    url.searchParams.set('limit', '80');
    url.searchParams.set('t', String(Date.now()));
    requestJson(url.href).then(function(result){
      var generation = result && result.generation ? String(result.generation) : '';
      var generationChanged = Boolean(
        generation &&
        self._serverGeneration &&
        generation !== self._serverGeneration
      );
      if (generation) self._serverGeneration = generation;
      if (generationChanged || Boolean(result && result.reset)) {
        self._lastEventId = 0;
      }
      if (!reconcileOnly && !self._pollOpened) {
        self._pollOpened = true;
        self.readyState = RuntimeEventSource.OPEN;
        self._dispatch('open', { type: 'open' });
      }
      var events = Array.isArray(result && result.events) ? result.events : [];
      for (var i = 0; i < events.length; i++) {
        var item = events[i];
        var id = Number(item && item.id) || 0;
        self._dispatchMessage(JSON.stringify(item ? item.data : null), id);
      }
      var cursor = Number(result && result.cursor);
      if (Number.isFinite(cursor) && cursor > self._lastEventId) self._lastEventId = cursor;
    }).catch(function(err){
      if (!reconcileOnly) {
        self.readyState = RuntimeEventSource.CONNECTING;
        self._pollOpened = false;
      }
      console.warn('[ilystream-overlay] ' + (reconcileOnly ? 'reconciliation' : 'polling') + ' transport failed', err);
    }).then(function(){
      self._pollInFlight = false;
    });
  };
  RuntimeEventSource.prototype._startReconciliation = function(){
    var self = this;
    if (this._closed || this._reconcileTimer || this._pollTimer) return;
    this._reconcileTimer = setInterval(function(){
      self._pollOnce(true);
    }, RECONCILE_INTERVAL_MS);
  };
  RuntimeEventSource.prototype._startPolling = function(reason){
    var self = this;
    if (this._pollTimer || this._closed) return;
    if (this._reconcileTimer) {
      clearInterval(this._reconcileTimer);
      this._reconcileTimer = null;
    }
    this.readyState = RuntimeEventSource.CONNECTING;
    console.warn('[ilystream-overlay] ' + reason + '; using polling transport for ' + this._readChannel() + '.');
    var poll = function(){
      self._pollOnce(false);
    };
    poll();
    this._pollTimer = setInterval(poll, 2000);
  };
  function startOwnedWidgetEventStream(){
    if (!WIDGET_META || !WIDGET_META.runtimeOwnsEventStream || WIDGET_META.sourceKind === 'preview') return;
    if (ownedWidgetEventSource) return;
    try {
      ownedWidgetEventSource = new RuntimeEventSource(
        '/overlay/events?channel=' + encodeURIComponent(WIDGET_META.eventChannel)
      );
    } catch (err) {
      console.warn('[ilystream-overlay] widget config stream failed to start.', err);
    }
  }
  window.__ilystreamOverlayRuntime = {
    nativeEventSource: NativeEventSource || null,
    pollingEndpoint: '/overlay/events/poll',
    requestJson: requestJson,
    handleWidgetControl: handleWidgetControl,
    widget: WIDGET_META,
    getHub: getOverlayHub
  };
  window.__ilystreamRequestJson = requestJson;
  window.EventSource = RuntimeEventSource;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startOwnedWidgetEventStream, { once: true });
  } else {
    startOwnedWidgetEventStream();
  }
})();
</script>`

/**
 * Wrap rendered widget HTML in the stable preview shell. The widget itself is
 * loaded into a child browsing context so every full update gets a fresh
 * script scope while the parent-facing postMessage endpoint remains stable.
 */
export function injectPreviewBootstrap(html: string, previewToken: string): string {
  if (!html) return html
  return buildPreviewShell(previewToken, html)
}

/**
 * Inject runtime hardening for external browser sources such as TikTok Live
 * Studio. It wraps EventSource with a native-first transport that falls back
 * to local HTTP polling through /overlay/events/poll when embedded Chromium
 * drops or blocks SSE.
 */
export interface OverlayRuntimeWidgetContext {
  widget: Pick<Widget, 'id' | 'type'>
  sourceKind: 'alias' | 'id' | 'preview'
}

export function injectOverlayRuntimeBootstrap(
  html: string,
  context?: OverlayRuntimeWidgetContext,
  webSocketCapability = ''
): string {
  if (!html || html.includes('id="ilystream-overlay-runtime"')) return html
  const definition = context
    ? WIDGET_RUNTIME_REGISTRY[context.widget.type]
    : undefined
  const metadata = definition && context
    ? `<script id="ilystream-widget-runtime-meta">window.__ilystreamWidgetRuntimeMeta=${serializeInlineScriptData({
        widgetId: context.widget.id,
        widgetType: context.widget.type,
        eventChannel: definition.eventChannel,
        runtimeOwnsEventStream: definition.runtimeOwnsEventStream === true,
        sourceKind: context.sourceKind,
        generation: '',
        revision: 0
      })};</script>`
    : ''
  const capability = `<script id="ilystream-ws-capability">window.__ilystreamWsCapability=${serializeInlineScriptData(webSocketCapability)};</script>`
  const bootstrap = metadata + capability + OVERLAY_RUNTIME_BOOTSTRAP_SCRIPT
  const idx = html.toLowerCase().indexOf('</head>')
  if (idx === -1) return bootstrap + html
  return html.slice(0, idx) + bootstrap + html.slice(idx)
}

/**
 * Render the widget document loaded inside the editor's stable preview shell.
 * This must stay as raw widget content: wrapping it in another preview shell
 * would forward a nested READY message and trigger an endless render cycle.
 */
export function renderWidgetPreviewContent(
  widget: Widget,
  context: OverlayRendererContext,
  webSocketCapability = ''
): string | null {
  const html = generateOverlayHtml(widget, true, context)
  if (!html) return null
  return injectOverlayRuntimeBootstrap(html, { widget, sourceKind: 'preview' }, webSocketCapability)
}
