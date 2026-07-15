import {
  DEFAULT_BORDER_CONFIG,
  DEFAULT_CHAT_CONFIG,
  DEFAULT_CHAT_UNIFIED_CONFIG,
  DEFAULT_DISCORD_PROMO_CONFIG,
  DEFAULT_FOLLOWER_GOAL_CONFIG,
  DEFAULT_LATEST_GIFTER_CONFIG,
  DEFAULT_LEADERBOARD_CONFIG,
  DEFAULT_LIKES_TRACKER_CONFIG,
  DEFAULT_NODE_NETWORK_CONFIG,
  DEFAULT_NOW_PLAYING_CONFIG,
  DEFAULT_PARTICLE_CONFIG,
  DEFAULT_PARTICLES_CONFIG,
  DEFAULT_PHYSICS_CONFIG,
  DEFAULT_ROSE_CONFIG,
  DEFAULT_SOCIALS_CONFIG,
  type Widget,
  type WidgetType
} from '../../shared/widgets'
import { buildAlertsOverlayHtml } from './templates/alerts'
import { buildChatOverlayHtml } from './templates/chat'
import { buildChatWidgetHtml } from './templates/chat-widget'
import { buildDeckHtml } from './templates/deck'
import { buildDiscordPromoHtml } from './templates/discord-promo'
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

export const WIDGET_ALIAS_MAP: Record<string, WidgetType | 'deck'> = {
  chat: 'chat',
  alerts: 'alerts',
  spotify: 'now-playing',
  'unified-chat': 'chat-unified',
  'likes-tracker': 'likes-tracker',
  likes: 'likes-tracker',
  goals: 'goal',
  'now-playing': 'now-playing',
  'follower-goal': 'follower-goal',
  followers: 'follower-goal',
  socials: 'socials',
  'screen-border': 'screen-border',
  border: 'screen-border',
  'event-particles': 'event-particles',
  hearts: 'event-particles',
  'gift-overlays': 'event-particles',
  'falling-roses': 'falling-roses',
  roses: 'falling-roses',
  'tiktok-roses': 'falling-roses',
  particles: 'particles',
  'discord-promo': 'discord-promo',
  discord: 'discord-promo',
  'node-network': 'node-network',
  nodes: 'node-network',
  web: 'node-network',
  'latest-gifter': 'latest-gifter',
  gifter: 'latest-gifter',
  deck: 'deck',
  physics: 'physics',
  leaderboard: 'leaderboard',
  'chat-unified': 'chat-unified',
  'chat-v2': 'chat-unified',
  unified: 'chat-unified'
}

export interface OverlayRendererContext {
  settings: Record<string, unknown>
  boardSounds: unknown[]
  deckActions: unknown[]
}

export function getDefaultWidgetConfig(type: WidgetType): any {
  switch (type) {
    case 'chat': return DEFAULT_CHAT_CONFIG
    case 'event-particles': return DEFAULT_PARTICLE_CONFIG
    case 'falling-roses': return DEFAULT_ROSE_CONFIG
    case 'particles': return DEFAULT_PARTICLES_CONFIG
    case 'screen-border': return DEFAULT_BORDER_CONFIG
    case 'follower-goal': return DEFAULT_FOLLOWER_GOAL_CONFIG
    case 'socials': return DEFAULT_SOCIALS_CONFIG
    case 'now-playing': return DEFAULT_NOW_PLAYING_CONFIG
    case 'discord-promo': return DEFAULT_DISCORD_PROMO_CONFIG
    case 'node-network': return DEFAULT_NODE_NETWORK_CONFIG
    case 'latest-gifter': return DEFAULT_LATEST_GIFTER_CONFIG
    case 'physics': return DEFAULT_PHYSICS_CONFIG
    case 'leaderboard': return DEFAULT_LEADERBOARD_CONFIG
    case 'chat-unified': return DEFAULT_CHAT_UNIFIED_CONFIG
    case 'likes-tracker': return DEFAULT_LIKES_TRACKER_CONFIG
    default: return {}
  }
}

export function generateOverlayHtml(
  widget: Widget,
  isPreview: boolean,
  context: OverlayRendererContext
): string | null {
  const type = widget.type === ('gift-overlays' as any) ? 'event-particles' : widget.type
  const config = type === 'alerts'
    ? { ...(widget.config as any), ...(context.settings as any) }
    : widget.config

  switch (type as any) {
    case 'chat': return buildChatOverlayHtml(widget, isPreview)
    case 'alerts': return buildAlertsOverlayHtml({ ...widget, config }, isPreview)
    case 'goal': return buildGoalsOverlayHtml(widget, isPreview)
    case 'follower-goal': return buildFollowerGoalHtml(widget, isPreview)
    case 'socials': return buildSocialsOverlayHtml(widget, isPreview)
    case 'now-playing': return buildNowPlayingOverlayHtml(widget, isPreview)
    case 'screen-border': return buildScreenBorderHtml(widget, isPreview)
    case 'event-particles': return buildParticleOverlayHtml(widget, isPreview)
    case 'falling-roses': return buildRoseOverlayHtml(widget, isPreview)
    case 'particles': return buildParticlesOverlayHtml(widget, isPreview)
    case 'discord-promo': return buildDiscordPromoHtml(widget, isPreview)
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
    { key: 'goals', label: 'Goal Tracker', icon: '🎯' },
    { key: 'now-playing', label: 'Now Playing', icon: '🎵' },
    { key: 'socials', label: 'Socials Rotation', icon: '📱' },
    { key: 'screen-border', label: 'Screen Border', icon: '🖼️' },
    { key: 'particles', label: 'Particles', icon: '✨' },
    { key: 'discord-promo', label: 'Discord Promo', icon: '💬' },
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
      <title>IlyStream | Overlay Directory</title>
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

// Bootstrap script injected into preview HTML so the WidgetEditorModal can
// update the preview via postMessage instead of changing the iframe `src`
// (which would tear down the document and restart all timers/animations).
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
//     Full HTML replacement. Used when a template hasn't opted into the
//     live-config protocol. Head children (other than this bootstrap) are
//     replaced, body innerHTML is swapped, and inline <script>s are
//     re-executed via the clone-and-replace dance (innerHTML alone doesn't
//     run them).
//
//   iframe -> parent: { type: 'ilystream:preview-ready' }
//     Sent once on load so the parent knows to push the initial draft.
//
//   iframe -> parent: { type: 'ilystream:preview-needs-html' }
//     Sent when the iframe receives a `preview-config` but has no
//     `__ilystreamApplyConfig` to handle it. Parent should switch to the
//     HTML-swap path for this iframe.
function buildPreviewBootstrapScript(previewToken: string): string {
  const serializedToken = JSON.stringify(previewToken)
  return `<script id="ilystream-preview-bootstrap">
(function(){
  var PREVIEW_TOKEN=${serializedToken};
  var trustedParentOrigin=null;
  var APPLY_HTML='ilystream:preview-html';
  var APPLY_CONFIG='ilystream:preview-config';
  var READY='ilystream:preview-ready';
  var NEEDS_HTML='ilystream:preview-needs-html';
  function reexecScripts(root){
    var scripts = root.querySelectorAll('script');
    for (var i=0; i<scripts.length; i++){
      var old = scripts[i];
      var ns = document.createElement('script');
      for (var j=0; j<old.attributes.length; j++){
        var a = old.attributes[j];
        ns.setAttribute(a.name, a.value);
      }
      ns.textContent = old.textContent || '';
      old.parentNode && old.parentNode.replaceChild(ns, old);
    }
  }
  function applyHtml(htmlString){
    try {
      var doc = new DOMParser().parseFromString(htmlString, 'text/html');
      var newHead = doc.head;
      var newBody = doc.body;
      if (!newHead || !newBody) return;
      var bootstrap = document.getElementById('ilystream-preview-bootstrap');
      var head = document.head;
      var keep = bootstrap;
      while (head.firstChild) head.removeChild(head.firstChild);
      var heads = Array.prototype.slice.call(newHead.childNodes);
      for (var i=0; i<heads.length; i++) {
        var node = heads[i];
        if (node && node.nodeType === 1 && node.id === 'ilystream-preview-bootstrap') continue;
        head.appendChild(document.importNode(node, true));
      }
      if (keep) head.appendChild(keep);
      document.body.innerHTML = newBody.innerHTML;
      reexecScripts(document.body);
    } catch (err) {
      console.error('[ilystream-preview] apply HTML failed', err);
    }
  }
  function applyConfig(config){
    var fn = window.__ilystreamApplyConfig;
    if (typeof fn === 'function') {
      try { fn(config); return true; }
      catch (err) { console.error('[ilystream-preview] applyConfig failed', err); return true; }
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
  window.addEventListener('message', function(event){
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
  });
  function postReady(){ postToParent({ type: READY }); }
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    postReady();
  } else {
    document.addEventListener('DOMContentLoaded', postReady, { once: true });
  }
})();
</script>`
}

const OVERLAY_RUNTIME_BOOTSTRAP_SCRIPT = `<script id="ilystream-overlay-runtime">
(function(){
  if (window.__ilystreamOverlayRuntime) return;
  var NativeEventSource = window.EventSource;
  function toAbsoluteUrl(value){
    try { return new URL(value, window.location.href).href; }
    catch (err) { return String(value || ''); }
  }
  function requestJson(url){
    if (typeof fetch === 'function') {
      return fetch(url, { cache: 'no-store' }).then(function(response){
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      });
    }
    return new Promise(function(resolve, reject){
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
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
      xhr.send();
    });
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
    this._pollTimer = null;
    this._lastEventId = 0;
    this._closed = false;
    this._startNative();
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
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
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
    var openTimer = setTimeout(function(){
      if (!opened && !self._closed) self._startPolling('EventSource open timeout');
    }, 5000);
    this._native.onopen = function(event){
      opened = true;
      clearTimeout(openTimer);
      if (self._closed) return;
      self.readyState = RuntimeEventSource.OPEN;
      self._dispatch('open', event || { type: 'open' });
    };
    this._native.onmessage = function(event){
      if (self._closed) return;
      var id = parseInt(event.lastEventId || '', 10);
      if (Number.isFinite(id) && id > self._lastEventId) self._lastEventId = id;
      self._dispatchMessage(event.data, event.lastEventId);
    };
    this._native.onerror = function(){
      clearTimeout(openTimer);
      if (self._closed) return;
      if (self._native) {
        try { self._native.close(); } catch (err) {}
        self._native = null;
      }
      self._startPolling('EventSource stream failed');
    };
  };
  RuntimeEventSource.prototype._startPolling = function(reason){
    var self = this;
    if (this._pollTimer || this._closed) return;
    this.readyState = RuntimeEventSource.OPEN;
    console.warn('[ilystream-overlay] ' + reason + '; using polling transport for ' + this._readChannel() + '.');
    this._dispatch('open', { type: 'open' });
    var poll = function(){
      if (self._closed) return;
      var url = new URL('/overlay/events/poll', window.location.href);
      url.searchParams.set('channel', self._readChannel());
      url.searchParams.set('after', String(self._lastEventId || 0));
      url.searchParams.set('limit', '80');
      url.searchParams.set('t', String(Date.now()));
      requestJson(url.href).then(function(result){
        var events = Array.isArray(result && result.events) ? result.events : [];
        for (var i = 0; i < events.length; i++) {
          var item = events[i];
          var id = Number(item && item.id) || 0;
          if (id > self._lastEventId) self._lastEventId = id;
          self._dispatchMessage(JSON.stringify(item ? item.data : null), id);
        }
        var cursor = Number(result && result.cursor);
        if (Number.isFinite(cursor) && cursor > self._lastEventId) self._lastEventId = cursor;
      }).catch(function(err){
        console.warn('[ilystream-overlay] polling transport failed', err);
      });
    };
    poll();
    this._pollTimer = setInterval(poll, 2000);
  };
  window.__ilystreamOverlayRuntime = {
    nativeEventSource: NativeEventSource || null,
    pollingEndpoint: '/overlay/events/poll',
    requestJson: requestJson
  };
  window.__ilystreamRequestJson = requestJson;
  window.EventSource = RuntimeEventSource;
})();
</script>`

/**
 * Inject the preview-bootstrap script into a rendered widget HTML string.
 * Inserted just before `</head>` so it runs before any body scripts. If there
 * is no `</head>` the script is prepended so it still runs first.
 */
export function injectPreviewBootstrap(html: string, previewToken: string): string {
  if (!html) return html
  const previewBootstrapScript = buildPreviewBootstrapScript(previewToken)
  const idx = html.toLowerCase().indexOf('</head>')
  if (idx === -1) return previewBootstrapScript + html
  return html.slice(0, idx) + previewBootstrapScript + html.slice(idx)
}

/**
 * Inject runtime hardening for external browser sources such as TikTok Live
 * Studio. It wraps EventSource with a native-first transport that falls back
 * to local HTTP polling through /overlay/events/poll when embedded Chromium
 * drops or blocks SSE.
 */
export function injectOverlayRuntimeBootstrap(html: string): string {
  if (!html || html.includes('id="ilystream-overlay-runtime"')) return html
  const idx = html.toLowerCase().indexOf('</head>')
  if (idx === -1) return OVERLAY_RUNTIME_BOOTSTRAP_SCRIPT + html
  return html.slice(0, idx) + OVERLAY_RUNTIME_BOOTSTRAP_SCRIPT + html.slice(idx)
}

/**
 * Render a widget's preview HTML with the bootstrap pre-injected. Returns
 * `null` if the widget type has no renderer (matches `generateOverlayHtml`).
 */
export function renderWidgetPreviewHtml(
  widget: Widget,
  context: OverlayRendererContext,
  previewToken: string
): string | null {
  const html = generateOverlayHtml(widget, true, context)
  if (!html) return null
  return injectPreviewBootstrap(html, previewToken)
}
