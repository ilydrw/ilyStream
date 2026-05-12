export function buildCompanionHtml(data: {
  obsStatus: any;
  viewerCounts: Record<string, number>;
  latestAlerts: any[];
  nowPlaying: any;
  ui: any;
}): string {
  const { obsStatus, viewerCounts, latestAlerts, nowPlaying, ui } = data;
  
  const totalViewers = Object.values(viewerCounts).reduce((a, b) => a + b, 0);
  const currentScene = obsStatus?.currentSceneName || 'Disconnected';
  const isRecording = obsStatus?.recordingActive || false;
  const isStreaming = obsStatus?.streamActive || false;
  const scenes = obsStatus?.scenes || [];

  // Theme logic
  const isJoker = ui?.theme === 'joker';
  const accent = ui?.accentColor || (isJoker ? '#1ddd33' : '#19c8ff');
  const secondary = isJoker ? '#ab5dce' : '#d035f1';
  const background = isJoker ? '#0a050c' : '#0A0C10';
  const gradient = `linear-gradient(135deg, ${accent}, ${secondary})`;
  
  return `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>ilyStream — DeskThing companion</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800;900&family=JetBrains+Mono:wght@700&display=swap" rel="stylesheet">
<style>
  :root {
    --font-sans: 'Outfit', sans-serif;
    --font-mono: 'JetBrains Mono', monospace;
    --grad-brand: ${gradient};
    --color-accent: ${accent};
    --shadow-card: 0 10px 30px rgba(0,0,0,0.5);
  }

  *, *::before, *::after { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; background: #000; overflow: hidden; display: grid; place-items: center; }
  
  .device {
    width: 800px; height: 480px;
    background:
      radial-gradient(circle at 18% 100%, rgba(171,93,206,.15), transparent 55%),
      radial-gradient(circle at 92% 0%, rgba(29,221,51,.12), transparent 50%),
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
  .bar .logo { width: 22px; height: 22px; border-radius: 6px; }
  .bar .word { font-size: 16px; font-weight: 900; letter-spacing: -.01em; background: var(--grad-brand); -webkit-background-clip: text; background-clip: text; color: transparent; }
  
  .status-pills { display: flex; gap: 8px; }
  .pill { display: inline-flex; align-items: center; gap: 8px; height: 28px; padding: 0 12px; border-radius: 999px; font-size: 13px; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; }
  
  .pill.live { background: rgba(34,197,94,.16); border: 1px solid rgba(34,197,94,.36); color: #4ADE80; }
  .pill.live i { width: 9px; height: 9px; border-radius: 50%; background: #22C55E; box-shadow: 0 0 10px rgba(34,197,94,.8); }
  
  .pill.off { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); color: rgba(255,255,255,0.4); }
  .pill.off i { width: 9px; height: 9px; border-radius: 50%; background: rgba(255,255,255,0.2); }

  .bar .time { margin-left: auto; font-family: var(--font-mono); font-size: 18px; font-weight: 700; color: #fff; letter-spacing: .02em; }

  /* Body */
  .body { padding: 16px 22px 12px; display: grid; grid-template-columns: 1.5fr 1fr; gap: 14px; height: calc(100% - 52px - 76px); min-height: 0; }
  .body > * { min-height: 0; }

  /* Scene card */
  .scene-card { border-radius: 14px; padding: 18px 20px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); box-shadow: var(--shadow-card); display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }
  .scene-card .kicker { font-size: 12px; font-weight: 900; letter-spacing: .18em; text-transform: uppercase; color: rgba(255,255,255,.55); }
  .scene-card .title { font-size: 40px; font-weight: 950; letter-spacing: -.04em; line-height: .95; margin-top: 6px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  
  .rec-status { display: inline-flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 13px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; color: rgba(255,255,255,0.2); }
  .rec-status.active { color: #FF6B6B; }
  .rec-status i { width: 10px; height: 10px; border-radius: 50%; background: currentColor; box-shadow: 0 0 10px currentColor; }
  
  .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
  .stat { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 10px; padding: 10px 12px; }
  .stat .k { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .12em; color: rgba(255,255,255,.6); }
  .stat .v { font-size: 26px; font-weight: 900; letter-spacing: -.02em; margin-top: 2px; color: #fff; line-height: 1.1; }
  .stat .v.cy { color: var(--color-accent); }
  .stat .v.gr { color: #4ADE80; }

  .right-col { display: flex; flex-direction: column; gap: 12px; min-height: 0; }

  /* Mic Meter */
  .mic { border-radius: 12px; padding: 14px 16px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); flex: 0 0 auto; }
  .mic .head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .mic .lbl { font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .18em; color: rgba(255,255,255,.7); }
  .mic .db { margin-left: auto; font-family: var(--font-mono); font-size: 15px; font-weight: 700; color: #fff; }
  .mic .bars { display: flex; gap: 4px; }
  .mic .bars i { flex: 1; height: 20px; border-radius: 3px; background: rgba(255,255,255,.08); transition: background 0.1s; }
  .mic .bars i.on { background: #22C55E; box-shadow: 0 0 8px rgba(34,197,94,.6); }
  .mic .bars i.peak { background: #F59E0B; box-shadow: 0 0 8px rgba(245,158,11,.6); }
  .mic .bars i.warn { background: #EF4444; box-shadow: 0 0 8px rgba(239,68,68,.6); }

  /* Alerts */
  .alerts { flex: 1 1 auto; border-radius: 12px; padding: 12px 16px 8px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); overflow: hidden; display: flex; flex-direction: column; min-height: 0; }
  .alerts h4 { font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .18em; color: rgba(255,255,255,.55); margin: 0 0 8px; }
  .alerts .hero { display: flex; align-items: center; gap: 12px; }
  .alerts .hero .av { width: 38px; height: 38px; border-radius: 50%; font: 900 16px var(--font-sans); display: grid; place-items: center; color: #fff; flex: 0 0 auto; }
  .alerts .hero .nm { font-size: 17px; font-weight: 900; color: #fff; letter-spacing: -.01em; line-height: 1.1; }
  .alerts .hero .what { font-size: 13px; color: rgba(255,255,255,.75); font-weight: 600; margin-top: 1px; }
  
  .alerts .ticker { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,.08); overflow: hidden; }
  .alerts .row { display: flex; align-items: center; gap: 8px; }
  .alerts .row .av { width: 22px; height: 22px; border-radius: 50%; font: 900 11px var(--font-sans); display: grid; place-items: center; color: #fff; flex: 0 0 auto; }
  .alerts .row .nm { font-size: 13px; font-weight: 800; color: #fff; }
  .alerts .row .what { font-size: 13px; color: rgba(255,255,255,.6); font-weight: 600; }
  .alerts .row .t { margin-left: auto; font-family: var(--font-mono); font-size: 12px; color: rgba(255,255,255,.55); font-weight: 700; }

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
  .np-artist { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.05em; }
  .np-ctrls { display: flex; gap: 12px; }
  .np-btn { background: none; border: none; color: #fff; opacity: 0.4; cursor: pointer; padding: 4px; }
  .np-btn:hover { opacity: 1; }

  /* Scene Strip */
  .strip { position: absolute; left: 22px; right: 22px; bottom: 84px; height: 58px; display: flex; gap: 10px; align-items: center; }
  .strip .scn { flex: 1; height: 100%; border-radius: 10px; border: 1px solid rgba(255,255,255,.10); background: rgba(255,255,255,.04); display: flex; flex-direction: column; justify-content: center; gap: 2px; padding: 0 14px; cursor: pointer; transition: all 0.2s; }
  .strip .scn .num { font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: rgba(255,255,255,.5); }
  .strip .scn .name { font-size: 15px; font-weight: 800; color: rgba(255,255,255,.85); letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .strip .scn.active { background: rgba(171,93,206,.16); border-color: rgba(171,93,206,.5); box-shadow: 0 0 18px rgba(171,93,206,.28); }
  .strip .scn.active .name { color: #fff; font-weight: 900; }
  .strip .scn.active .num { color: #ab5dce; }

  /* Hidden Now Playing when not active */
  .device.no-np .body { height: calc(100% - 52px - 84px); }
  .device.no-np .strip { bottom: 20px; }
  .device.no-np .now-playing { display: none; }
</style>
</head>
<body>
  <div class="device" id="device-root">
    <div class="bar">
      <span class="word">ilyStream</span>
      <div class="status-pills">
        <span class="pill ${isStreaming ? 'live' : 'off'}" id="pill-live"><i></i><span>Live</span></span>
        <span class="pill ${isRecording ? 'live' : 'off'}" id="pill-rec" style="color: #FF6B6B; border-color: rgba(255,107,107,0.3); background: rgba(255,107,107,0.1);"><i></i><span>Rec</span></span>
      </div>
      <span class="time" id="uptime">00:00:00</span>
    </div>

    <div class="body">
      <div class="scene-card">
        <div>
          <div class="kicker">Current scene</div>
          <div class="title" id="scene-name">${currentScene}</div>
          <div class="rec-status ${isRecording ? 'active' : ''}" id="rec-status-line"><i></i><span>${isRecording ? 'Recording' : 'Not recording'}</span></div>
        </div>
        <div class="stats">
          <div class="stat"><div class="k">Viewers</div><div class="v cy" id="viewer-count">${totalViewers.toLocaleString()}</div></div>
          <div class="stat"><div class="k">Bitrate</div><div class="v gr" id="bitrate">0.0 Mbps</div></div>
        </div>
      </div>

      <div class="right-col">
        <div class="mic">
          <div class="head">
            <span class="lbl">Mic</span>
            <span class="db" id="mic-db">−∞ dB</span>
          </div>
          <div class="bars" id="mic-bars">
            <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
          </div>
        </div>

        <div class="alerts">
          <h4>Latest alert</h4>
          <div id="alerts-container">
            <div class="p-4 text-center opacity-20 italic text-xs">Waiting for events...</div>
          </div>
        </div>
      </div>
    </div>

    <div class="strip" id="scene-strip">
      <!-- Scenes will be injected here -->
    </div>

    <div class="now-playing" id="np-strip" style="display: none;">
      <img class="np-art" id="np-art" src="" alt="">
      <div class="np-info">
        <div class="np-name" id="np-name">Not Playing</div>
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
    let sceneList = ${JSON.stringify(scenes)};
    let currentSceneName = "${currentScene}";
    
    function updateScenes(scenes, current) {
      const container = document.getElementById('scene-strip');
      if (!container) return;
      
      container.innerHTML = scenes.slice(0, 4).map((s, i) => \`
        <div class="scn \${s === current ? 'active' : ''}" onclick="setScene('\${s}')">
          <span class="num">0\${i+1}</span>
          <span class="name">\${s}</span>
        </div>
      \`).join('');
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

    function updateAlerts(alerts) {
      const container = document.getElementById('alerts-container');
      if (!container || !alerts || alerts.length === 0) return;
      
      const latest = alerts[0];
      const ticker = alerts.slice(1, 3);
      
      let html = \`
        <div class="hero">
          <div class="av \${latest.platform}">\${latest.displayName[0]}</div>
          <div>
            <div class="nm">\${latest.displayName}</div>
            <div class="what">\${latest.summary}</div>
          </div>
        </div>
      \`;
      
      if (ticker.length > 0) {
        html += \`<div class="ticker">\`;
        ticker.forEach(a => {
          html += \`
            <div class="row">
              <div class="av \${a.platform}">\${a.displayName[0]}</div>
              <span class="nm">\${a.displayName}</span>
              <span class="what">\${a.summary}</span>
            </div>
          \`;
        });
        html += \`</div>\`;
      }
      
      container.innerHTML = html;
    }

    function updateMic(rms, peak) {
      const bars = document.getElementById('mic-bars').querySelectorAll('i');
      const db = rms > 0 ? Math.round(20 * Math.log10(rms)) : -100;
      document.getElementById('mic-db').textContent = db <= -90 ? '−∞ dB' : \`\${db} dB\`;
      
      const count = bars.length;
      const activeCount = Math.round(rms * count);
      const peakIndex = Math.round(peak * count) - 1;
      
      bars.forEach((b, i) => {
        b.className = '';
        if (i < activeCount) {
          if (i > count * 0.8) b.className = 'warn';
          else if (i > count * 0.6) b.className = 'peak';
          else b.className = 'on';
        }
        if (i === peakIndex) b.className = 'peak';
      });
    }

    function connectSSE() {
      const evs = new EventSource('/overlay/events?channel=chat,alerts,goals,now-playing,obs,node-network');
      
      evs.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const payload = data.payload;

        if (data.type === 'snapshot' || data.type === 'update') {
          if (Array.isArray(payload) && payload.length > 0 && payload[0].platform) {
            updateAlerts(payload);
          } else if (payload && payload.trackId !== undefined) {
            const strip = document.getElementById('np-strip');
            const root = document.getElementById('device-root');
            if (payload.trackId) {
              strip.style.display = 'flex';
              root.classList.remove('no-np');
              document.getElementById('np-name').textContent = payload.trackName;
              document.getElementById('np-artist').textContent = payload.artistName;
              document.getElementById('np-art').src = payload.albumArtUrl || '';
            } else {
              strip.style.display = 'none';
              root.classList.add('no-np');
            }
          } else if (payload && payload.connected !== undefined) {
            // OBS update
            document.getElementById('scene-name').textContent = payload.currentSceneName || 'Disconnected';
            const recStatus = document.getElementById('rec-status-line');
            recStatus.className = 'rec-status ' + (payload.recordingActive ? 'active' : '');
            recStatus.querySelector('span').textContent = payload.recordingActive ? 'Recording' : 'Not recording';
            
            document.getElementById('pill-live').className = 'pill ' + (payload.streamActive ? 'live' : 'off');
            document.getElementById('pill-rec').style.display = payload.recordingActive ? 'inline-flex' : 'none';
            
            if (payload.scenes) {
              updateScenes(payload.scenes, payload.currentSceneName);
            }
          }
        }
        
        if (data.type === 'audio-levels') {
          updateMic(payload.rms, payload.peak);
        }
        
        if (data.type === 'viewer-count') {
          document.getElementById('viewer-count').textContent = payload.total.toLocaleString();
        }
      };
      
      evs.onerror = () => {
        evs.close();
        setTimeout(connectSSE, 3000);
      };
    }

    updateScenes(sceneList, currentSceneName);
    connectSSE();
    
    // Simple clock
    setInterval(() => {
      const now = new Date();
      document.getElementById('uptime').textContent = now.toLocaleTimeString([], { hour12: false });
    }, 1000);
  </script>
</body>
</html>
  `;
}
