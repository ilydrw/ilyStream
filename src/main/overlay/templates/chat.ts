import { ChatConfig, DEFAULT_CHAT_CONFIG } from '../../../shared/widgets'
import { getAnimationCss } from './animation-utils'

export function buildChatOverlayHtml(widget?: any, isPreview = false): string {
  const cfg: ChatConfig = { ...DEFAULT_CHAT_CONFIG, ...(widget?.config || {}) }

  const positionMap: Record<string, string> = {
    'bottom-left':  'align-items:flex-end;justify-content:flex-start',
    'bottom-right': 'align-items:flex-end;justify-content:flex-end',
    'top-left':     'align-items:flex-start;justify-content:flex-start',
    'top-right':    'align-items:flex-start;justify-content:flex-end',
  }
  const shellStyle = positionMap[cfg.position] ?? positionMap['bottom-left']
  const feedDir = cfg.position.startsWith('top') ? 'column-reverse' : 'column'
  const bgOpacity = isPreview ? 0 : Math.min(1, Math.max(0, cfg.backgroundOpacity))

  const configJson = jsonForScript({
    maxItems: cfg.maxItems,
    chatOnly: cfg.chatOnly,
    fadeAfterMs: cfg.fadeOutAfterSeconds > 0 ? cfg.fadeOutAfterSeconds * 1000 : 0,
    showBadge: cfg.showPlatformBadge,
  })

  return `<!doctype html>
<html lang="en" style="background: transparent !important; background-color: transparent !important;">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ilyStream Chat</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: "Outfit", "Inter", system-ui, sans-serif;
        --blur: ${cfg.blur}px;
        --glass: rgba(15, 18, 25, ${bgOpacity});
        --glass-border: rgba(255, 255, 255, 0.12);
        --bg-event: rgba(26, 12, 48, ${bgOpacity});
        --font-size: ${cfg.fontSize}px;
        --feed-width: ${cfg.width}px;
        --fallback-accent: ${cfg.accentColor};
      }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: transparent !important; background-color: transparent !important; color: #fff; min-height: 100vh; overflow: hidden; font-family: "Outfit", "Inter", system-ui, sans-serif; }
      .shell {
        position: relative;
        ${cfg.forceTikTokDimensions ? 'width: 1080px; height: 1920px;' : (
            cfg.aspectRatio === 'tiktok' ? 'aspect-ratio: 9/16; height: 100%; width: auto; margin: 0 auto;' :
            cfg.aspectRatio === 'landscape' ? 'aspect-ratio: 16/9; width: 100%; height: auto; margin: auto 0;' : 'width: 100%; height: 100%;'
        )}
        display: flex;
        padding: 30px;
        ${shellStyle};
      }
      .feed {
        width: min(${cfg.width}px, calc(100vw - 40px));
        display: flex;
        flex-direction: ${feedDir};
        gap: 12px;
        filter: drop-shadow(0 20px 40px rgba(0,0,0,0.5));
      }
      .entry {
        position: relative;
        overflow: hidden;
        border-radius: 24px;
        padding: 16px 20px;
        background: var(--glass);
        backdrop-filter: blur(var(--blur)) saturate(220%);
        -webkit-backdrop-filter: blur(var(--blur)) saturate(220%);
        border: 1px solid var(--glass-border);
        box-shadow:
            0 10px 30px rgba(0,0,0,0.4),
            inset 0 0 20px rgba(255,255,255,0.05);
        transition: transform 0.3s ease;
        display: flex;
        align-items: flex-start;
        gap: 14px;
      }
      .entry > .body-col {
        flex: 1;
        min-width: 0;
      }
      .avatar {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: rgba(255,255,255,0.08);
        border: 2px solid var(--accent, var(--fallback-accent));
        object-fit: cover;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 900;
        font-size: 18px;
        color: #fff;
        text-transform: uppercase;
        line-height: 1;
        overflow: hidden;
      }
      img.avatar { padding: 0; }
      ${getAnimationCss({ style: cfg.animationStyle || 'slide', duration: cfg.animationDuration || 400 }, '.entry')}
      .entry::before {
        content: "";
        position: absolute;
        inset: 0;
        background: radial-gradient(circle at 20% 0%, rgba(255,255,255,0.08) 0%, transparent 60%);
        pointer-events: none;
      }
      .entry--event {
        background: linear-gradient(135deg, var(--bg-event), rgba(20, 10, 40, ${bgOpacity}));
        border-color: rgba(147, 51, 234, 0.4);
      }
      .entry--event::before {
        background: radial-gradient(circle at 20% 0%, rgba(147, 51, 234, 0.15) 0%, transparent 60%);
      }
      .entry::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent);
        transform: translateX(-100%);
        animation: EntryShimmer 4s infinite linear;
        pointer-events: none;
      }
      @keyframes EntryShimmer {
        0% { transform: translateX(-100%); }
        30% { transform: translateX(100%); }
        100% { transform: translateX(100%); }
      }
      .username {
        font-size: calc(var(--font-size) * 0.9);
        font-weight: 800;
        color: var(--accent, var(--fallback-accent));
        text-shadow: 0 2px 4px rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .badge {
        font-size: 10px;
        padding: 2px 8px;
        border-radius: 6px;
        background: rgba(255,255,255,0.12);
        color: rgba(255,255,255,0.8);
        text-transform: uppercase;
        font-weight: 900;
        letter-spacing: 1px;
      }
      .body {
        font-size: var(--font-size);
        line-height: 1.4;
        color: #fff;
        word-break: break-word;
        font-weight: 600;
        text-shadow: 0 2px 8px rgba(0,0,0,0.4);
      }
      .event-tag {
        font-size: 10px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 2px;
        color: var(--accent, var(--fallback-accent));
        margin-bottom: 6px;
        display: block;
        opacity: 0.8;
      }
      .fading {
        animation: entry-fade-out 0.6s ease forwards;
      }
      @keyframes entry-fade-out {
        to { opacity: 0; transform: translateY(-10px) scale(0.95); }
      }
      .empty {
        background: rgba(255,255,255,0.05);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px dashed rgba(255,255,255,0.2);
        border-radius: 24px;
        padding: 30px;
        color: rgba(255,255,255,0.3);
        font-size: 14px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 4px;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <div id="feed" class="feed"></div>
    </div>
    <script>
      var FEED = document.getElementById('feed');
      var CFG = ${configJson};
      var reconnectDelay = 1500;

      function safeAvatarUrl(url) {
        if (typeof url !== 'string' || !url.trim()) return '';
        try {
          var parsed = new URL(url, window.location.origin);
          return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '';
        } catch (_) {
          return '';
        }
      }

      window.__chatAvatarFallback = function(initial) {
        var span = document.createElement('div');
        span.className = 'avatar';
        span.textContent = initial || '?';
        return span;
      };

      function makeAvatar(item) {
        var name = item.displayName || '';
        var initial = name.trim().charAt(0) || '?';
        var url = safeAvatarUrl(item.profilePictureUrl);
        if (!url) {
          return window.__chatAvatarFallback(initial);
        }
        var img = document.createElement('img');
        img.className = 'avatar';
        img.src = url;
        img.alt = '';
        img.dataset.initial = initial;
        img.onerror = function() {
          var fallback = window.__chatAvatarFallback(this.dataset.initial);
          this.replaceWith(fallback);
        };
        return img;
      }

      function makeEntry(item) {
        var entry = document.createElement('article');
        entry.className = 'entry' + (item.emphasis ? ' entry--event' : '');
        entry.dataset.id = item.id;
        entry.style.setProperty('--accent', item.accentColor);

        entry.appendChild(makeAvatar(item));

        var bodyCol = document.createElement('div');
        bodyCol.className = 'body-col';

        if (item.emphasis && item.kind !== 'chat') {
          var tag = document.createElement('span');
          tag.className = 'event-tag';
          tag.textContent = item.kind.replace(/-/g, ' ');
          bodyCol.appendChild(tag);
        }

        var userLine = document.createElement('div');
        userLine.className = 'username';

        if (CFG.showBadge) {
          var badge = document.createElement('span');
          badge.className = 'badge';
          badge.textContent = item.platformLabel;
          userLine.appendChild(badge);
        }

        userLine.appendChild(document.createTextNode(item.displayName));
        bodyCol.appendChild(userLine);

        if (item.message) {
          var body = document.createElement('div');
          body.className = 'body';
          body.textContent = item.message;
          bodyCol.appendChild(body);
        }

        if (item.meta) {
          var note = document.createElement('div');
          note.className = 'meta-note';
          note.textContent = item.meta;
          bodyCol.appendChild(note);
        }

        entry.appendChild(bodyCol);
        return entry;
      }

      function trimFeed() {
        while (FEED.children.length > CFG.maxItems) {
          FEED.firstElementChild.remove();
        }
      }

      function addItem(item, animate) {
        var allowedKinds = ['chat', 'gift', 'follow', 'subscription', 'raid', 'share'];
        if (item.kind && allowedKinds.indexOf(item.kind) === -1) return;
        if (CFG.chatOnly && item.kind !== 'chat') return;
        maybeClearEmpty();
        var existing = FEED.querySelector('[data-id="' + item.id + '"]');
        if (existing) existing.remove();
        var entry = makeEntry(item);
        if (!animate) entry.classList.add('no-anim');
        FEED.appendChild(entry);
        trimFeed();
        if (CFG.fadeAfterMs > 0) {
          setTimeout(function() {
            entry.classList.add('fading');
            setTimeout(function() {
              entry.remove();
              if (FEED.children.length === 0) renderEmpty();
            }, 500);
          }, CFG.fadeAfterMs);
        }
      }

      function renderEmpty() {
        FEED.innerHTML = '';
        var empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'Waiting for chat…';
        FEED.appendChild(empty);
      }

      function renderSnapshot(items) {
        FEED.innerHTML = '';
        var allowedKinds = ['chat', 'gift', 'follow', 'subscription', 'raid', 'share'];
        var visible = items.filter(function(i) { return !i.kind || allowedKinds.indexOf(i.kind) !== -1; }).slice(-CFG.maxItems);
        if (CFG.chatOnly) visible = visible.filter(function(i) { return i.kind === 'chat'; });
        if (visible.length === 0) { renderEmpty(); return; }
        visible.forEach(function(item) { addItem(item, false); });
      }

      function maybeClearEmpty() {
        var existing = FEED.querySelector('.empty');
        if (existing) existing.remove();
      }

      function hydrate() {
        return fetch('/overlay/chat/state', { cache: 'no-store' })
          .then(function(r) { return r.json(); })
          .then(function(items) { renderSnapshot(items || []); })
          .catch(function() { renderEmpty(); });
      }

      // Show placeholder immediately so the widget is visible in preview.
      renderEmpty();

      function connectSSE() {
        var src = new EventSource('/overlay/events?channel=chat');
        src.onmessage = function(e) {
          reconnectDelay = 1500;
          var msg = JSON.parse(e.data);
          if (msg.type === 'snapshot') renderSnapshot(msg.payload);
          else if (msg.type === 'append') addItem(msg.payload, true);
          else if (msg.type === 'reload') window.location.reload();
          else if (msg.type === 'feature-broadcast') {
            // Optional: Implement featured message popup for standard chat too
            console.log('Featured broadcast:', msg.payload);
          }
        };
        src.onerror = function() {
          src.close();
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
          setTimeout(connectSSE, reconnectDelay);
        };
      }

      hydrate().catch(console.error);
      if (!${isPreview}) {
        connectSSE();
      }
    </script>
  </body>
</html>`
}

function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
