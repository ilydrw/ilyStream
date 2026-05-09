import { ChatConfig, DEFAULT_CHAT_CONFIG } from '../../../shared/widgets'

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

  const configJson = JSON.stringify({
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
        --bg: rgba(13, 16, 28, ${bgOpacity});
        --bg-event: rgba(26, 12, 48, ${bgOpacity});
        --font-size: ${cfg.fontSize}px;
        --feed-width: ${cfg.width}px;
        --fallback-accent: ${cfg.accentColor};
      }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: transparent !important; background-color: transparent !important; color: #fff; min-height: 100vh; overflow: hidden; }
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
        width: min(var(--feed-width), calc(100vw - 40px));
        display: flex;
        flex-direction: ${feedDir};
        gap: 8px;
      }
      .entry {
        position: relative;
        overflow: hidden;
        border-radius: 18px;
        padding: 12px 18px;
        background: var(--bg);
        backdrop-filter: blur(var(--blur)) saturate(180%);
        -webkit-backdrop-filter: blur(var(--blur)) saturate(180%);
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.08);
        animation: entry-slide-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
        transition: transform 0.3s ease;
      }
      .entry--event { 
        background: linear-gradient(135deg, var(--bg-event), rgba(20, 10, 40, ${bgOpacity}));
        border-color: rgba(147, 51, 234, 0.3);
      }
      .entry::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.03), transparent);
        transform: translateX(-100%);
        animation: EntryShimmer 3s infinite;
      }
      @keyframes EntryShimmer {
        to { transform: translateX(100%); }
      }
      .username {
        font-size: calc(var(--font-size) * 1.05);
        font-weight: 800;
        color: var(--accent, var(--fallback-accent));
        text-shadow: 0 2px 4px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .badge {
        font-size: 9px;
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(255,255,255,0.1);
        color: rgba(255,255,255,0.6);
        text-transform: uppercase;
        font-weight: 900;
        letter-spacing: 0.5px;
      }
      .body {
        margin-top: 6px;
        font-size: var(--font-size);
        line-height: 1.5;
        color: rgba(255,255,255,0.95);
        word-break: break-word;
        font-weight: 500;
      }
      .event-tag {
        font-size: 10px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: var(--accent, var(--fallback-accent));
        margin-bottom: 2px;
        display: block;
      }
      @keyframes entry-slide-in {
        from { opacity: 0; transform: translateX(-20px) scale(0.95); }
        to { opacity: 1; transform: translateX(0) scale(1); }
      }
      .fading {
        animation: entry-fade-out 0.6s ease forwards;
      }
      @keyframes entry-fade-out {
        to { opacity: 0; transform: translateY(-10px) scale(0.95); }
      }
      .empty {
        background: rgba(255,255,255,0.03);
        border: 1px dashed rgba(255,255,255,0.1);
        border-radius: 18px;
        padding: 20px;
        color: rgba(255,255,255,0.2);
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 1px;
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

      function makeEntry(item) {
        var entry = document.createElement('article');
        entry.className = 'entry' + (item.emphasis ? ' entry--event' : '');
        entry.dataset.id = item.id;
        entry.style.setProperty('--accent', item.accentColor);

        if (item.emphasis && item.kind !== 'chat') {
          var tag = document.createElement('span');
          tag.className = 'event-tag';
          tag.textContent = item.kind.replace(/-/g, ' ');
          entry.appendChild(tag);
        }

        var userLine = document.createElement('div');
        userLine.className = 'username';

        if (CFG.showBadge) {
          var badge = document.createElement('span');
          badge.className = 'badge';
          badge.textContent = item.platformLabel;
          userLine.appendChild(badge);
        }

        var nameText = document.createTextNode(item.displayName);
        userLine.appendChild(nameText);
        entry.appendChild(userLine);


        if (item.message) {
          var body = document.createElement('div');
          body.className = 'body';
          body.textContent = item.message;
          entry.appendChild(body);
        }

        if (item.meta) {
          var note = document.createElement('div');
          note.className = 'meta-note';
          note.textContent = item.meta;
          entry.appendChild(note);
        }

        return entry;
      }

      function trimFeed() {
        while (FEED.children.length > CFG.maxItems) {
          FEED.firstElementChild.remove();
        }
      }

      function addItem(item, animate) {
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
        var visible = items.slice(-CFG.maxItems);
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
