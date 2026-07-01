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
  // Honor the config's backgroundOpacity in both preview and production — the
  // editor frame is a checkerboard so transparent values still read as
  // transparent, but the user needs to see what their slider actually does.
  const bgOpacity = Math.min(1, Math.max(0, cfg.backgroundOpacity))

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
      .platform-row {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 10px;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--accent, var(--fallback-accent));
        text-shadow: 0 1px 3px rgba(0,0,0,0.5);
        margin-bottom: 4px;
        opacity: 0.92;
      }
      .platform-icon {
        width: 12px;
        height: 12px;
        display: inline-flex;
        flex-shrink: 0;
      }
      .platform-icon svg { width: 100%; height: 100%; fill: currentColor; display: block; }
      .username {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        row-gap: 4px;
        column-gap: 8px;
        margin-bottom: 4px;
      }
      .display-name {
        min-width: 0;
        overflow-wrap: anywhere;
        word-break: break-word;
        font-size: calc(var(--font-size) * 0.9);
        font-weight: 800;
        color: #fff;
        text-shadow: 0 2px 4px rgba(0,0,0,0.5);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .role-badges { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px; }
      .role-badge-chip {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        padding: 2px 7px 2px 5px;
        border-radius: 999px;
        background: rgba(255,255,255,0.1);
        white-space: nowrap;
        flex-shrink: 0;
      }
      .role-badge-icon {
        width: 10px;
        height: 10px;
        object-fit: contain;
        border-radius: 2px;
        flex-shrink: 0;
      }
      .role-badge-glyph {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 10px;
        height: 10px;
        flex-shrink: 0;
      }
      .role-badge-glyph svg { width: 100%; height: 100%; display: block; }
      .role-badge-chip--mod { color: #34d399; background: rgba(52,211,153,0.16); }
      .role-badge-chip--superfan { color: #fbbf24; background: rgba(251,191,36,0.16); }
      .role-badge-chip--member { color: #f472b6; background: rgba(244,114,182,0.16); }
      .role-badge-chip--vip { color: #c084fc; background: rgba(192,132,252,0.16); }
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

      var PLATFORM_ICONS = {
        twitch: '<path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0h1.714v5.143h-1.714zm-10.286 0h1.714v5.143H6zm1.714-2.572H1.714v15.428h4.286v3.429l3.429-3.429h2.572l7.714-7.714V2.142zm11.143 10.286-3 3H10.286L7.714 18v-2.571H3.429V3.857h12.857z"/>',
        youtube: '<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>',
        tiktok: '<path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.06-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.03 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.9-.32-1.89-.23-2.74.24-.81.47-1.38 1.31-1.55 2.24-.12.7-.06 1.41.16 2.09.32.93.99 1.73 1.84 2.25.71.43 1.54.6 2.37.52 1.14-.1 2.2-.76 2.82-1.71.46-.7.65-1.53.66-2.35-.01-4.28-.02-8.55-.02-12.83z"/>',
        kick: '<path d="M2.25 0H21.75C23 0 24 1 24 2.25V21.75C24 23 23 24 21.75 24H2.25C1 24 0 23 0 21.75V2.25C0 1 1 0 2.25 0ZM7.32422 5.0625V18.9375H10.125V13.623L13.125 18.9375H16.4297L13.125 13.0781L16.4297 5.0625H13.125L10.125 12.3398V5.0625H7.32422Z"/>'
      };

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

        if (CFG.showBadge) {
          var platformRow = document.createElement('div');
          platformRow.className = 'platform-row';
          var platformIconWrap = document.createElement('span');
          platformIconWrap.className = 'platform-icon';
          platformIconWrap.innerHTML = '<svg viewBox="0 0 24 24">' + (PLATFORM_ICONS[item.platform] || PLATFORM_ICONS.twitch) + '</svg>';
          platformRow.appendChild(platformIconWrap);
          platformRow.appendChild(document.createTextNode(item.platformLabel));
          bodyCol.appendChild(platformRow);
        }

        if (item.emphasis && item.kind !== 'chat') {
          var tag = document.createElement('span');
          tag.className = 'event-tag';
          tag.textContent = item.kind.replace(/-/g, ' ');
          bodyCol.appendChild(tag);
        }

        var userLine = document.createElement('div');
        userLine.className = 'username';

        var nameSpan = document.createElement('span');
        nameSpan.className = 'display-name';
        nameSpan.textContent = item.displayName;
        userLine.appendChild(nameSpan);

        if (Array.isArray(item.badges) && item.badges.length) {
          var BADGE_SVG = {
            mod: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l7 3v6c0 4.4-3 8.3-7 9.5C8 19.3 5 15.4 5 11V5z"/></svg>',
            superfan: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.8 5.9 21.4l1.4-6.8L2.2 9.9l6.9-.8z"/></svg>',
            member: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.5-9.5-9C1 9 2.5 5.5 6 5.5c2 0 3.2 1.1 4 2.3.8-1.2 2-2.3 4-2.3 3.5 0 5 3.5 3.5 6.5C19 16.5 12 21 12 21z"/></svg>',
            vip: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l4 6 6 .9-4.5 4.2L18.5 22 12 18.5 5.5 22l1-8.9L2 8.9 8 8z"/></svg>'
          };
          var badgeWrap = document.createElement('span');
          badgeWrap.className = 'role-badges';
          for (var bi = 0; bi < item.badges.length; bi++) {
            var rb = item.badges[bi] || {};
            var chip = document.createElement('span');
            chip.className = 'role-badge-chip role-badge-chip--' + (rb.kind || 'member');
            chip.title = rb.title || '';
            if (rb.imageUrl) {
              var bimg = document.createElement('img');
              bimg.className = 'role-badge-icon';
              bimg.src = rb.imageUrl;
              bimg.alt = '';
              bimg.onerror = function () { this.remove(); };
              chip.appendChild(bimg);
            } else if (BADGE_SVG[rb.kind]) {
              var bspan = document.createElement('span');
              bspan.className = 'role-badge-glyph';
              bspan.innerHTML = BADGE_SVG[rb.kind];
              chip.appendChild(bspan);
            }
            if (rb.title) {
              var chipLabel = document.createElement('span');
              chipLabel.textContent = rb.title;
              chip.appendChild(chipLabel);
            }
            badgeWrap.appendChild(chip);
          }
          if (badgeWrap.childNodes.length) userLine.appendChild(badgeWrap);
        }

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

      var pollingTimer = null;

      function requestJson(url) {
        if (typeof fetch === 'function') {
          return fetch(url, { cache: 'no-store' })
            .then(function(r) {
              if (!r.ok) throw new Error('chat state ' + r.status);
              return r.json();
            });
        }

        return new Promise(function(resolve, reject) {
          var xhr = new XMLHttpRequest();
          xhr.open('GET', url, true);
          xhr.onreadystatechange = function() {
            if (xhr.readyState !== 4) return;
            if (xhr.status < 200 || xhr.status >= 300) {
              reject(new Error('chat state ' + xhr.status));
              return;
            }
            try {
              resolve(JSON.parse(xhr.responseText || '[]'));
            } catch (error) {
              reject(error);
            }
          };
          xhr.onerror = function() { reject(new Error('chat state network error')); };
          xhr.send();
        });
      }

      function chatStateUrl() {
        var url = new URL('/overlay/chat/state', window.location.href);
        url.searchParams.set('t', String(Date.now()));
        return url.href;
      }

      function hydrate() {
        return requestJson(chatStateUrl())
          .then(function(items) { renderSnapshot(items || []); })
          .catch(function() { renderEmpty(); });
      }

      // Show placeholder immediately so the widget is visible in preview.
      renderEmpty();

      function startPolling() {
        if (pollingTimer) return;
        hydrate();
        pollingTimer = setInterval(hydrate, 2000);
      }

      function stopPolling() {
        if (!pollingTimer) return;
        clearInterval(pollingTimer);
        pollingTimer = null;
      }

      function connectSSE() {
        if (typeof EventSource !== 'function') {
          console.warn('[chat] EventSource not supported, using polling fallback.');
          startPolling();
          return;
        }

        var src;
        try {
          src = new EventSource(new URL('/overlay/events?channel=chat', window.location.href).href);
        } catch (error) {
          console.warn('[chat] EventSource failed to start, using polling fallback.', error);
          startPolling();
          return;
        }

        src.onopen = function() {
          stopPolling();
        };
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
          startPolling();
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
