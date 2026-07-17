import { INLINE_AVATAR_RUNTIME_SCRIPT } from './runtime-assets'

export function buildCompanionHtml(data: {
  obsStatus: any;
  viewerCounts: Record<string, number>;
  latestAlerts: any[];
  nowPlaying: any;
  ui: any;
}): string {
  const { obsStatus, viewerCounts, latestAlerts, ui } = data;

  const totalViewers = Object.values(viewerCounts).reduce((a, b) => a + b, 0);
  const currentScene = String(obsStatus?.currentSceneName || 'Disconnected');
  const isRecording = obsStatus?.recordingActive || false;
  const isStreaming = obsStatus?.streamActive || false;
  const scenes = Array.isArray(obsStatus?.scenes) ? obsStatus.scenes.map(String) : [];
  const currentSceneJson = jsonForScript(currentScene);
  const currentSceneHtml = escapeHtml(currentScene);
  const scenesJson = jsonForScript(scenes);
  const alertsJson = jsonForScript(Array.isArray(latestAlerts) ? latestAlerts.slice(0, 4) : []);

  // Theme logic ('joker' is the legacy id for the gob theme)
  const isGob = ui?.theme === 'gob' || ui?.theme === 'joker';
  const accent = safeHexColor(ui?.accentColor, isGob ? '#b6ff00' : '#19c8ff');
  const secondary = isGob ? '#050505' : '#a783ff';
  const background = isGob ? '#050505' : '#0A0C10';
  const gradient = `linear-gradient(135deg, ${accent}, ${secondary})`;

  return `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>ilyStream — DeskThing companion</title>
${INLINE_AVATAR_RUNTIME_SCRIPT}
<style>
  :root {
    --font-sans: 'Outfit', system-ui, sans-serif;
    --font-mono: 'JetBrains Mono', ui-monospace, monospace;
    --grad-brand: ${gradient};
    --color-accent: ${accent};
    --shadow-card: 0 10px 30px rgba(0,0,0,0.5);
  }

  *, *::before, *::after { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; background: #000; overflow: hidden; display: grid; place-items: center; }

  .device {
    width: 800px; height: 480px;
    background:
      radial-gradient(circle at 18% 100%, ${hexToRgba(secondary, 0.12)}, transparent 55%),
      radial-gradient(circle at 92% 0%, ${hexToRgba(accent, 0.12)}, transparent 50%),
      ${background};
    color: #fff;
    font-family: var(--font-sans);
    position: relative;
    overflow: hidden;
    box-shadow: 0 30px 80px rgba(0,0,0,.65), 0 0 0 8px #1a1a1a, 0 0 0 9px #0e0e0e;
    border-radius: 18px;
  }

  /* Top bar */
  .bar { height: 52px; display: flex; align-items: center; gap: 14px; padding: 0 22px; border-bottom: 1px solid rgba(255,255,255,.08); }
  .bar .word { font-size: 16px; font-weight: 800; letter-spacing: -.01em; background: var(--grad-brand); -webkit-background-clip: text; background-clip: text; color: transparent; }

  .status-pills { display: flex; gap: 8px; }
  .pill { display: inline-flex; align-items: center; gap: 8px; height: 28px; padding: 0 12px; border-radius: 999px; font-size: 13px; font-weight: 700; }
  .pill i { width: 9px; height: 9px; border-radius: 50%; }

  .pill.live { background: rgba(34,197,94,.16); border: 1px solid rgba(34,197,94,.36); color: #4ADE80; }
  .pill.live i { background: #22C55E; box-shadow: 0 0 10px rgba(34,197,94,.8); }

  .pill.rec { background: rgba(255,107,107,.12); border: 1px solid rgba(255,107,107,.35); color: #FF6B6B; }
  .pill.rec i { background: #FF6B6B; box-shadow: 0 0 10px rgba(255,107,107,.8); }

  .pill.off { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); color: rgba(255,255,255,0.4); }
  .pill.off i { background: rgba(255,255,255,0.2); box-shadow: none; }

  .bar .clock { margin-left: auto; font-family: var(--font-mono); font-size: 18px; font-weight: 700; color: #fff; letter-spacing: .02em; }

  /* Body */
  .body { padding: 14px 22px 12px; display: grid; grid-template-columns: 1.1fr 1fr; gap: 14px; height: calc(100% - 52px - 76px - 70px); min-height: 0; }
  .body > * { min-height: 0; }
  .device.no-np .body { height: calc(100% - 52px - 78px); }

  .left-col { display: flex; flex-direction: column; gap: 12px; min-height: 0; }

  /* Scene card */
  .scene-card { border-radius: 14px; padding: 16px 18px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); box-shadow: var(--shadow-card); flex: 0 0 auto; overflow: hidden; }
  .scene-card .kicker { font-size: 12px; font-weight: 700; color: rgba(255,255,255,.55); }
  .scene-card .title { font-size: 34px; font-weight: 800; letter-spacing: -.03em; line-height: 1; margin-top: 4px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .rec-status { display: inline-flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.25); }
  .rec-status.active { color: #FF6B6B; }
  .rec-status i { width: 9px; height: 9px; border-radius: 50%; background: currentColor; box-shadow: 0 0 10px currentColor; }

  .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
  .stat { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 10px; padding: 8px 12px; }
  .stat .k { font-size: 12px; font-weight: 700; color: rgba(255,255,255,.6); }
  .stat .v { font-size: 24px; font-weight: 800; letter-spacing: -.02em; margin-top: 1px; color: #fff; line-height: 1.1; font-variant-numeric: tabular-nums; }
  .stat .v.cy { color: var(--color-accent); }

  /* Latest alert */
  .alerts { flex: 1 1 auto; border-radius: 12px; padding: 12px 16px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); overflow: hidden; display: flex; flex-direction: column; min-height: 0; }
  .alerts h4 { font-size: 12px; font-weight: 700; color: rgba(255,255,255,.55); margin: 0 0 8px; }
  .alerts .empty { font-size: 13px; color: rgba(255,255,255,.28); font-style: italic; padding: 6px 0; }
  .alerts .hero { display: flex; align-items: center; gap: 12px; }
  .alerts .hero .av { width: 36px; height: 36px; border-radius: 50%; font: 700 15px var(--font-sans); display: grid; place-items: center; color: #fff; flex: 0 0 auto; background: rgba(255,255,255,.14); }
  .alerts .hero .nm { font-size: 16px; font-weight: 800; color: #fff; letter-spacing: -.01em; line-height: 1.1; }
  .alerts .hero .what { font-size: 13px; color: rgba(255,255,255,.75); font-weight: 600; margin-top: 1px; }

  .alerts .ticker { display: flex; flex-direction: column; gap: 4px; margin-top: 9px; padding-top: 9px; border-top: 1px solid rgba(255,255,255,.08); overflow: hidden; }
  .alerts .row { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .alerts .row .av { width: 20px; height: 20px; border-radius: 50%; font: 700 10px var(--font-sans); display: grid; place-items: center; color: #fff; flex: 0 0 auto; background: rgba(255,255,255,.14); }
  .alerts .row .nm { font-size: 12px; font-weight: 700; color: #fff; white-space: nowrap; }
  .alerts .row .what { font-size: 12px; color: rgba(255,255,255,.6); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* Chat feed — newest at the bottom, rolls upward as messages arrive. */
  .chat { border-radius: 14px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); box-shadow: var(--shadow-card); display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
  .chat .head { display: flex; align-items: baseline; gap: 8px; padding: 12px 16px 8px; flex: 0 0 auto; }
  .chat .head h4 { font-size: 12px; font-weight: 700; color: rgba(255,255,255,.55); margin: 0; }
  .chat .head .count { margin-left: auto; font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: var(--color-accent); }

  .chat .feed { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 0 14px 10px; display: flex; flex-direction: column; gap: 6px; scrollbar-width: none; }
  .chat .feed::-webkit-scrollbar { display: none; }
  .chat .feed .empty { margin: auto; font-size: 13px; color: rgba(255,255,255,.28); font-style: italic; }

  .msg { display: flex; align-items: flex-start; gap: 8px; min-width: 0; flex: 0 0 auto; }
  .msg .av { width: 24px; height: 24px; border-radius: 50%; font: 700 11px var(--font-sans); display: grid; place-items: center; color: #fff; flex: 0 0 auto; background: rgba(255,255,255,.14); margin-top: 1px; }
  .msg .body-txt { min-width: 0; font-size: 13px; line-height: 1.35; overflow-wrap: break-word; }
  .msg .nm { font-weight: 800; letter-spacing: -.01em; margin-right: 6px; }
  .msg .txt { color: rgba(255,255,255,.82); font-weight: 500; }

  .msg.event { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); border-radius: 9px; padding: 5px 9px; }
  .msg.event .txt { color: rgba(255,255,255,.7); font-weight: 600; }
  .msg.event .glyph { margin-right: 6px; }

  /* Platform colors */
  .av.tiktok { background: #FE2C55; }
  .av.twitch { background: #9146FF; }
  .av.youtube { background: #FF0000; }
  .av.kick { background: #53FC18; color: #062a06; }

  /* Now Playing Strip */
  .now-playing {
    position: absolute; left: 0; right: 0; bottom: 0; height: 76px;
    background: rgba(0,0,0,0.4); border-top: 1px solid rgba(255,255,255,0.05);
    padding: 0 22px; display: flex; align-items: center; gap: 16px;
    backdrop-filter: blur(10px);
  }
  .np-art { width: 44px; height: 44px; border-radius: 6px; background: rgba(255,255,255,0.05); object-fit: cover; }
  .np-info { flex: 1; min-width: 0; }
  .np-name { font-size: 16px; font-weight: 800; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .np-artist { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.45); }
  .np-ctrls { display: flex; gap: 12px; }
  .np-btn { background: none; border: none; color: #fff; opacity: 0.4; cursor: pointer; padding: 4px; }
  .np-btn:hover { opacity: 1; }

  /* Scene Strip */
  .strip { position: absolute; left: 22px; right: 22px; bottom: 84px; height: 58px; display: flex; gap: 10px; align-items: center; }
  .strip .scn { flex: 1; height: 100%; border-radius: 10px; border: 1px solid rgba(255,255,255,.10); background: rgba(255,255,255,.04); display: flex; flex-direction: column; justify-content: center; gap: 2px; padding: 0 14px; cursor: pointer; transition: all 0.2s; }
  .strip .scn .num { font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: rgba(255,255,255,.5); }
  .strip .scn .name { font-size: 15px; font-weight: 700; color: rgba(255,255,255,.85); letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .strip .scn.active { background: ${hexToRgba(accent, 0.16)}; border-color: ${hexToRgba(accent, 0.5)}; box-shadow: 0 0 18px ${hexToRgba(accent, 0.28)}; }
  .strip .scn.active .name { color: #fff; font-weight: 800; }
  .strip .scn.active .num { color: ${accent}; }

  /* Hidden Now Playing when not active */
  .device.no-np .strip { bottom: 20px; }
  .device.no-np .now-playing { display: none; }
</style>
</head>
<body>
  <div class="device no-np" id="device-root">
    <div class="bar">
      <span class="word">ilyStream</span>
      <div class="status-pills">
        <span class="pill ${isStreaming ? 'live' : 'off'}" id="pill-live"><i></i><span>Live</span></span>
        <span class="pill rec" id="pill-rec" style="display: ${isRecording ? 'inline-flex' : 'none'};"><i></i><span>Rec</span></span>
      </div>
      <span class="clock" id="clock">--:--:--</span>
    </div>

    <div class="body">
      <div class="left-col">
        <div class="scene-card">
          <div class="kicker">Current scene</div>
          <div class="title" id="scene-name">${currentSceneHtml}</div>
          <div class="rec-status ${isRecording ? 'active' : ''}" id="rec-status-line"><i></i><span>${isRecording ? 'Recording' : 'Not recording'}</span></div>
          <div class="stats">
            <div class="stat"><div class="k">Viewers</div><div class="v cy" id="viewer-count">${totalViewers.toLocaleString()}</div></div>
            <div class="stat"><div class="k">Chats</div><div class="v" id="chat-count">0</div></div>
          </div>
        </div>

        <div class="alerts">
          <h4>Latest alert</h4>
          <div id="alerts-container">
            <div class="empty">No alerts yet this session.</div>
          </div>
        </div>
      </div>

      <div class="chat">
        <div class="head">
          <h4>Chat</h4>
          <span class="count" id="chat-live-dot"></span>
        </div>
        <div class="feed" id="chat-feed">
          <div class="empty" id="chat-empty">Waiting for chat…</div>
        </div>
      </div>
    </div>

    <div class="strip" id="scene-strip">
      <!-- Scenes will be injected here -->
    </div>

    <div class="now-playing" id="np-strip" style="display: none;">
      <img class="np-art" id="np-art" src="" alt="">
      <div class="np-info">
        <div class="np-name" id="np-name">Not playing</div>
        <div class="np-artist" id="np-artist">---</div>
      </div>
      <div class="np-ctrls">
        <button class="np-btn" onclick="deckAction('SKIP_TRACK')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 4 10 8-10 8V4ZM19 5v14"/></svg>
        </button>
      </div>
    </div>
  </div>

  <script>
    let sceneList = ${scenesJson};
    let currentSceneName = ${currentSceneJson};
    let alertsState = ${alertsJson};

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
      ));
    }

    function escapeAttr(value) {
      return escapeHtml(value);
    }

    function safeClass(value) {
      return String(value || '').replace(/[^a-z0-9_-]/gi, '');
    }

    function safeImageUrl(value) {
      return window.__ilyAvatar.proxy(value);
    }

    // ---- Scenes ------------------------------------------------------------

    function updateScenes(scenes, current) {
      const container = document.getElementById('scene-strip');
      if (!container) return;

      container.innerHTML = scenes.slice(0, 4).map((s, i) => \`
        <div class="scn \${s === current ? 'active' : ''}" data-scene="\${escapeAttr(s)}">
          <span class="num">0\${i+1}</span>
          <span class="name">\${escapeHtml(s)}</span>
        </div>
      \`).join('');

      container.querySelectorAll('.scn').forEach((button) => {
        button.addEventListener('click', () => setScene(button.dataset.scene || ''));
      });
    }

    async function setScene(name) {
      await deckAction('obs_set_scene', { sceneName: name });
    }

    async function deckAction(type, payload = null) {
      try {
        await fetch('/overlay/deck/action' + window.location.search, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, payload })
        });
      } catch (err) { console.error('Action failed', err); }
    }

    // ---- OBS status (deck channel) -----------------------------------------

    function updateObs(payload) {
      document.getElementById('scene-name').textContent = payload.currentSceneName || 'Disconnected';

      const recStatus = document.getElementById('rec-status-line');
      recStatus.className = 'rec-status ' + (payload.recordingActive ? 'active' : '');
      recStatus.querySelector('span').textContent = payload.recordingActive ? 'Recording' : 'Not recording';

      document.getElementById('pill-live').className = 'pill ' + (payload.streamActive ? 'live' : 'off');
      document.getElementById('pill-rec').style.display = payload.recordingActive ? 'inline-flex' : 'none';

      if (Array.isArray(payload.scenes)) {
        updateScenes(payload.scenes.map(String), payload.currentSceneName);
      }
    }

    // ---- Alerts ------------------------------------------------------------

    function renderAlerts() {
      const container = document.getElementById('alerts-container');
      if (!container) return;

      if (!alertsState || alertsState.length === 0) {
        container.innerHTML = '<div class="empty">No alerts yet this session.</div>';
        return;
      }

      const humanKind = (t) => t ? String(t).charAt(0).toUpperCase() + String(t).slice(1) : '';
      const alertName = (a) => a.headline || a.eyebrow || humanKind(a.eventType) || 'Alert';
      const alertDetail = (a) => a.subtitle || a.meta || (a.headline ? humanKind(a.eventType) : '');

      const latest = alertsState[0];
      const ticker = alertsState.slice(1, 2);

      let html = \`
        <div class="hero">
          <div class="av \${safeClass(latest.platform)}">\${escapeHtml(alertName(latest)[0])}</div>
          <div>
            <div class="nm">\${escapeHtml(alertName(latest))}</div>
            <div class="what">\${escapeHtml(alertDetail(latest))}</div>
          </div>
        </div>
      \`;

      if (ticker.length > 0) {
        html += '<div class="ticker">';
        ticker.forEach(a => {
          html += \`
            <div class="row">
              <div class="av \${safeClass(a.platform)}">\${escapeHtml(alertName(a)[0])}</div>
              <span class="nm">\${escapeHtml(alertName(a))}</span>
              <span class="what">\${escapeHtml(alertDetail(a))}</span>
            </div>
          \`;
        });
        html += '</div>';
      }

      container.innerHTML = html;
    }

    function appendAlert(item) {
      if (!item) return;
      alertsState = [item, ...alertsState].slice(0, 4);
      renderAlerts();
    }

    // ---- Chat feed ---------------------------------------------------------
    // Newest messages append at the bottom; the feed sticks to the bottom so
    // the list rolls upward as chat arrives, unless the user scrolled back.

    const CHAT_MAX_ROWS = 60;
    const EVENT_GLYPHS = { gift: '🎁', subscription: '⭐', follow: '➕', raid: '🚀', share: '🔁' };
    let chatCount = 0;
    let stickToBottom = true;

    const feedEl = document.getElementById('chat-feed');

    feedEl.addEventListener('scroll', () => {
      stickToBottom = feedEl.scrollHeight - feedEl.scrollTop - feedEl.clientHeight < 40;
    });

    function chatRow(item) {
      const row = document.createElement('div');
      const isChat = item.kind === 'chat';
      row.className = isChat ? 'msg' : 'msg event';

      const av = document.createElement('div');
      av.className = 'av ' + safeClass(item.platform);
      av.textContent = (item.displayName || '?')[0];

      const body = document.createElement('div');
      body.className = 'body-txt';

      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = item.displayName || 'Unknown';
      if (item.accentColor) nm.style.color = item.accentColor;

      const txt = document.createElement('span');
      txt.className = 'txt';
      txt.textContent = item.message || '';

      if (!isChat) {
        const glyph = document.createElement('span');
        glyph.className = 'glyph';
        glyph.textContent = EVENT_GLYPHS[item.kind] || '✦';
        body.appendChild(glyph);
      }

      body.appendChild(nm);
      body.appendChild(txt);
      row.appendChild(av);
      row.appendChild(body);
      return row;
    }

    function appendChat(item, scroll = true) {
      if (!item || !item.displayName) return;

      const empty = document.getElementById('chat-empty');
      if (empty) empty.remove();

      feedEl.appendChild(chatRow(item));
      while (feedEl.children.length > CHAT_MAX_ROWS) {
        feedEl.removeChild(feedEl.firstChild);
      }

      if (item.kind === 'chat') {
        chatCount += 1;
        document.getElementById('chat-count').textContent = chatCount.toLocaleString();
      }

      if (scroll && stickToBottom) {
        feedEl.scrollTop = feedEl.scrollHeight;
      }
    }

    function loadChatSnapshot(items) {
      feedEl.innerHTML = '';
      chatCount = 0;
      if (!items || items.length === 0) {
        feedEl.innerHTML = '<div class="empty" id="chat-empty">Waiting for chat…</div>';
        document.getElementById('chat-count').textContent = '0';
        return;
      }
      items.slice(-CHAT_MAX_ROWS).forEach((item) => appendChat(item, false));
      feedEl.scrollTop = feedEl.scrollHeight;
    }

    // ---- Now playing -------------------------------------------------------

    function updateNowPlaying(payload) {
      const strip = document.getElementById('np-strip');
      const root = document.getElementById('device-root');
      if (payload && payload.trackId) {
        strip.style.display = 'flex';
        root.classList.remove('no-np');
        document.getElementById('np-name').textContent = payload.trackName;
        document.getElementById('np-artist').textContent = payload.artistName;
        document.getElementById('np-art').src = safeImageUrl(payload.albumArtUrl);
      } else {
        strip.style.display = 'none';
        root.classList.add('no-np');
      }
    }

    // ---- SSE plumbing -------------------------------------------------------
    // The overlay event stream serves ONE channel per connection, so the
    // companion opens one EventSource per channel it needs. Each handler knows
    // exactly what its channel carries — no payload shape-sniffing.

    function subscribe(channel, onEvent) {
      let source = null;
      const connect = () => {
        source = new EventSource('/overlay/events?channel=' + channel);
        source.onmessage = (event) => {
          try {
            onEvent(JSON.parse(event.data));
          } catch (err) {
            console.error('[companion] Bad payload on ' + channel, err);
          }
        };
        source.onerror = () => {
          source.close();
          setTimeout(connect, 3000);
        };
      };
      connect();
    }

    subscribe('chat', (data) => {
      if (data.type === 'snapshot') loadChatSnapshot(Array.isArray(data.payload) ? data.payload : []);
      if (data.type === 'append') appendChat(data.payload);
    });

    subscribe('alerts', (data) => {
      if (data.type === 'snapshot' && Array.isArray(data.payload) && data.payload.length > 0) {
        alertsState = data.payload.slice(0, 4);
        renderAlerts();
      }
      if (data.type === 'append') appendAlert(data.payload);
    });

    subscribe('now-playing', (data) => {
      if (data.type === 'snapshot' || data.type === 'update') updateNowPlaying(data.payload);
    });

    subscribe('deck', (data) => {
      if (data.type === 'obs-status' && data.payload) updateObs(data.payload);
      if (data.type === 'viewer-count' && data.payload) {
        document.getElementById('viewer-count').textContent = Number(data.payload.total || 0).toLocaleString();
      }
    });

    // ---- Boot ---------------------------------------------------------------

    updateScenes(sceneList, currentSceneName);
    renderAlerts();

    function tickClock() {
      document.getElementById('clock').textContent = new Date().toLocaleTimeString([], { hour12: false });
    }
    tickClock();
    setInterval(tickClock, 1000);
  </script>
</body>
</html>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function safeHexColor(value: unknown, fallback: string): string {
  const color = String(value || '').trim()
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback
}

function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
