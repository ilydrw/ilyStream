export interface OBSWorkspaceTemplateOptions {
  csrfToken: string
  nonce: string
  appVersion: string
}

export function buildOBSWorkspaceHtml(options: OBSWorkspaceTemplateOptions): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>ilyStream Control Center</title>
  <style nonce="${options.nonce}">
    :root {
      color-scheme: dark;
      font-family: Inter, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
      --bg: #080d16;
      --surface: #0f1726;
      --surface-2: #131e31;
      --line: rgba(255,255,255,.075);
      --line-strong: rgba(255,255,255,.13);
      --text: #f7f9ff;
      --muted: #8c9bb4;
      --faint: #5e6c83;
      --cyan: #66dcff;
      --violet: #9b7cff;
      --green: #34d399;
      --amber: #fbbf24;
      --red: #fb7185;
      --radius: 10px;
    }
    * { box-sizing: border-box; }
    html, body { width: 100%; min-width: 0; min-height: 100%; margin: 0; background: var(--bg); color: var(--text); }
    body {
      background: radial-gradient(circle at 110% -5%, rgba(119,70,255,.11), transparent 32rem), var(--bg);
      font-size: 12px;
      line-height: 1.35;
    }
    button, select, textarea { font: inherit; }
    button { -webkit-user-select: none; user-select: none; }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-height: 54px;
      padding: 7px 9px;
      border-bottom: 1px solid var(--line);
      background: linear-gradient(180deg, rgba(20,28,45,.98), rgba(13,20,34,.98));
      box-shadow: 0 8px 24px rgba(0,0,0,.22);
    }
    .brand { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .brand-mark {
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      flex: 0 0 auto;
      border: 1px solid rgba(102,220,255,.36);
      border-radius: 9px;
      color: var(--cyan);
      background: linear-gradient(145deg, rgba(102,220,255,.16), rgba(126,92,255,.12));
    }
    .brand-mark svg { width: 18px; height: 18px; fill: currentColor; }
    .brand-copy { min-width: 0; }
    .brand-title { overflow: hidden; font-size: 12px; font-weight: 800; letter-spacing: .01em; text-overflow: ellipsis; white-space: nowrap; }
    .brand-subtitle { margin-top: 2px; color: var(--faint); font-size: 9px; font-weight: 650; white-space: nowrap; }
    .connection {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 7px;
      border: 1px solid var(--line);
      border-radius: 999px;
      color: var(--muted);
      background: rgba(2,6,13,.45);
      font-size: 9px;
      font-weight: 750;
      white-space: nowrap;
    }
    .dot { width: 6px; height: 6px; flex: 0 0 auto; border-radius: 50%; background: #94a3b8; }
    .connection.is-live { color: #b9f8dd; border-color: rgba(52,211,153,.2); }
    .connection.is-live .dot { background: var(--green); box-shadow: 0 0 9px rgba(52,211,153,.55); }
    .connection.is-warn { color: #fde68a; border-color: rgba(251,191,36,.2); }
    .connection.is-warn .dot { background: var(--amber); }
    .connection.is-offline { color: #fecdd3; border-color: rgba(251,113,133,.22); }
    .connection.is-offline .dot { background: var(--red); }
    main { display: flex; flex-direction: column; gap: 8px; padding: 8px; }
    .panel { overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius); background: rgba(15,23,38,.94); box-shadow: 0 5px 18px rgba(0,0,0,.16); }
    .panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 37px; padding: 7px 9px; border-bottom: 1px solid var(--line); }
    .panel-title { min-width: 0; }
    .panel-title strong { display: block; overflow: hidden; font-size: 10px; font-weight: 800; letter-spacing: .06em; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
    .panel-title span { display: block; margin-top: 1px; color: var(--faint); font-size: 9px; }
    .panel-body { padding: 8px; }
    .status-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 6px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); font-size: 8.5px; font-weight: 750; white-space: nowrap; }
    .status-chip.good { color: #b9f8dd; border-color: rgba(52,211,153,.2); background: rgba(52,211,153,.06); }
    .status-chip.warn { color: #fde68a; border-color: rgba(251,191,36,.2); background: rgba(251,191,36,.06); }
    .status-chip.bad { color: #fecdd3; border-color: rgba(251,113,133,.2); background: rgba(251,113,133,.06); }
    .metrics { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 5px; margin-bottom: 8px; }
    .metric { min-width: 0; padding: 6px; border: 1px solid var(--line); border-radius: 7px; background: rgba(2,6,13,.32); }
    .metric span { display: block; overflow: hidden; color: var(--faint); font-size: 8px; font-weight: 700; letter-spacing: .04em; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
    .metric strong { display: block; overflow: hidden; margin-top: 2px; color: #e8edf8; font-size: 10px; font-weight: 750; text-overflow: ellipsis; white-space: nowrap; }
    .stack { display: flex; flex-direction: column; gap: 6px; }
    .row { display: flex; align-items: center; gap: 6px; min-width: 0; }
    .row.wrap { flex-wrap: wrap; }
    .space-top { margin-top: 6px; }
    .field-label { display: block; margin-bottom: 4px; color: var(--faint); font-size: 8.5px; font-weight: 750; letter-spacing: .04em; text-transform: uppercase; }
    select, textarea {
      width: 100%;
      min-width: 0;
      border: 1px solid var(--line-strong);
      border-radius: 7px;
      outline: 0;
      color: var(--text);
      background: #0a111e;
    }
    select { height: 30px; padding: 0 26px 0 8px; }
    textarea { min-height: 58px; resize: vertical; padding: 7px 8px; line-height: 1.35; }
    select:focus, textarea:focus { border-color: rgba(102,220,255,.45); box-shadow: 0 0 0 2px rgba(102,220,255,.08); }
    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      min-height: 29px;
      padding: 5px 8px;
      border: 1px solid var(--line-strong);
      border-radius: 7px;
      color: #dbe4f3;
      background: rgba(255,255,255,.045);
      font-size: 9.5px;
      font-weight: 750;
      line-height: 1.1;
      cursor: pointer;
      transition: border-color 120ms ease, background 120ms ease, transform 120ms ease;
    }
    .button:hover:not(:disabled) { border-color: rgba(102,220,255,.28); background: rgba(102,220,255,.08); }
    .button:active:not(:disabled) { transform: translateY(1px); }
    .button:disabled { cursor: not-allowed; opacity: .42; }
    .button.primary { border-color: rgba(102,220,255,.34); color: #06111b; background: linear-gradient(135deg,#7ce2ff,#8eb9ff); }
    .button.danger:hover:not(:disabled) { border-color: rgba(251,113,133,.35); background: rgba(251,113,133,.1); }
    .button.flex { flex: 1 1 0; min-width: 0; }
    .button.tiny { min-height: 25px; padding: 4px 6px; font-size: 8.5px; }
    .quick-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 5px; }
    .platforms { display: flex; flex-wrap: wrap; gap: 5px; }
    .platform-option { position: relative; }
    .platform-option input { position: absolute; opacity: 0; pointer-events: none; }
    .platform-option span { display: inline-flex; align-items: center; gap: 4px; padding: 4px 7px; border: 1px solid var(--line); border-radius: 999px; color: var(--faint); font-size: 8.5px; font-weight: 750; cursor: pointer; }
    .platform-option input:checked + span { border-color: rgba(102,220,255,.3); color: #dff7ff; background: rgba(102,220,255,.09); }
    .platform-option input:disabled + span { cursor: not-allowed; opacity: .38; }
    .platform-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
    .widget-list, .sound-list { display: flex; flex-direction: column; gap: 5px; }
    .widget, .sound { display: flex; align-items: center; gap: 7px; min-width: 0; padding: 6px; border: 1px solid var(--line); border-radius: 8px; background: rgba(2,6,13,.28); }
    .widget-accent { width: 3px; align-self: stretch; flex: 0 0 auto; border-radius: 99px; background: linear-gradient(var(--cyan),var(--violet)); }
    .widget-copy, .sound-copy { flex: 1 1 auto; min-width: 0; }
    .widget-name, .sound-name { overflow: hidden; color: #e8edf8; font-size: 10px; font-weight: 750; text-overflow: ellipsis; white-space: nowrap; }
    .widget-meta, .sound-meta { overflow: hidden; margin-top: 2px; color: var(--faint); font-size: 8.5px; text-overflow: ellipsis; white-space: nowrap; }
    .widget-actions { display: flex; flex: 0 0 auto; gap: 4px; }
    .empty { padding: 16px 8px; color: var(--faint); font-size: 9.5px; text-align: center; }
    .sound-list { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); }
    .sound { cursor: pointer; }
    .sound:hover { border-color: rgba(155,124,255,.3); background: rgba(155,124,255,.07); }
    .sound-emoji { display: grid; place-items: center; width: 24px; height: 24px; flex: 0 0 auto; border-radius: 7px; background: rgba(155,124,255,.11); font-size: 13px; }
    .integration { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .integration-copy { min-width: 0; }
    .integration-copy strong { display: block; font-size: 10px; }
    .integration-copy span { display: block; overflow: hidden; margin-top: 2px; color: var(--faint); font-size: 8.5px; text-overflow: ellipsis; white-space: nowrap; }
    .toast { position: fixed; right: 8px; bottom: 8px; left: 8px; z-index: 30; padding: 8px 10px; border: 1px solid rgba(102,220,255,.24); border-radius: 8px; color: #def7ff; background: rgba(8,18,31,.97); box-shadow: 0 10px 30px rgba(0,0,0,.4); font-size: 9.5px; font-weight: 700; opacity: 0; pointer-events: none; transform: translateY(8px); transition: opacity 150ms ease, transform 150ms ease; }
    .toast.show { opacity: 1; transform: none; }
    .toast.error { border-color: rgba(251,113,133,.35); color: #fecdd3; }
    .locked { display: none; margin: 20px 8px; padding: 18px 12px; border: 1px solid rgba(251,191,36,.2); border-radius: 10px; color: #fde68a; background: rgba(251,191,36,.05); text-align: center; }
    .locked strong { display: block; margin-bottom: 5px; font-size: 12px; }
    .locked span { color: #b9a66b; font-size: 9.5px; }
    @media (max-width: 225px) {
      .connection-label { display: none; }
      .connection { padding: 5px; }
      .metrics { grid-template-columns: 1fr; }
      .quick-grid { grid-template-columns: 1fr; }
      .sound-list { grid-template-columns: 1fr; }
      .widget { align-items: flex-start; }
      .widget-actions { flex-direction: column; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="brand">
      <div class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm3 6v2h4V9H7zm6 0v2h4V9h-4z"/></svg></div>
      <div class="brand-copy"><div class="brand-title">ilyStream Control</div><div class="brand-subtitle">OBS workspace · v${escapeHtml(options.appVersion)}</div></div>
    </div>
    <div class="connection" id="app-connection"><span class="dot"></span><span class="connection-label" id="app-connection-label">Loading</span></div>
  </header>

  <div class="locked" id="locked"><strong>Pair this dock from ilyStream</strong><span>Open Settings → Streaming → OBS Workspace and copy the fresh paired dock URL.</span></div>

  <main id="workspace">
    <section class="panel">
      <div class="panel-head"><div class="panel-title"><strong>OBS Studio</strong><span id="obs-subtitle">Checking WebSocket…</span></div><span class="status-chip" id="obs-chip">Checking</span></div>
      <div class="panel-body">
        <div class="metrics">
          <div class="metric"><span>Scene</span><strong id="metric-scene">—</strong></div>
          <div class="metric"><span>Stream</span><strong id="metric-stream">—</strong></div>
          <div class="metric"><span>Record</span><strong id="metric-record">—</strong></div>
        </div>
        <label class="field-label" for="scene-select">Program scene</label>
        <div class="row"><select id="scene-select" aria-label="Program scene"></select><button class="button" id="scene-apply">Switch</button></div>
        <div class="quick-grid space-top">
          <button class="button" id="obs-reconnect">Reconnect</button>
          <button class="button" id="virtual-camera">Virtual camera</button>
          <button class="button" id="save-replay">Save replay</button>
          <button class="button danger" id="stop-sounds">Stop audio</button>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head"><div class="panel-title"><strong>Widgets</strong><span>Standard OBS browser sources</span></div><span class="status-chip" id="widget-count">0 saved</span></div>
      <div class="panel-body"><div class="widget-list" id="widget-list"></div></div>
    </section>

    <section class="panel">
      <div class="panel-head"><div class="panel-title"><strong>Unified Chat</strong><span>Send through connected accounts</span></div><span class="status-chip" id="viewer-count">0 viewers</span></div>
      <div class="panel-body stack">
        <div class="platforms" id="chat-platforms"></div>
        <textarea id="chat-message" maxlength="500" placeholder="Send a message to selected platforms…"></textarea>
        <button class="button primary" id="chat-send">Send message</button>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head"><div class="panel-title"><strong>Live Controls</strong><span>Fast, finite actions</span></div><span class="status-chip" id="tts-chip">TTS</span></div>
      <div class="panel-body quick-grid">
        <button class="button" id="tts-toggle">Pause TTS</button>
        <button class="button" id="tts-skip">Skip speech</button>
        <button class="button" id="test-follow">Test follow alert</button>
        <button class="button" id="refresh-now">Refresh status</button>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head"><div class="panel-title"><strong>Soundboard</strong><span>Presses overlap immediately</span></div><span class="status-chip" id="sound-count">0 sounds</span></div>
      <div class="panel-body"><div class="sound-list" id="sound-list"></div></div>
    </section>

    <section class="panel">
      <div class="panel-head"><div class="panel-title"><strong>Integration</strong><span>Optional native bridge</span></div></div>
      <div class="panel-body integration"><div class="integration-copy"><strong id="native-title">ilyStream OBS plugin</strong><span id="native-detail">Waiting for bridge…</span></div><span class="status-chip" id="native-chip">Offline</span></div>
    </section>
  </main>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>

  <script nonce="${options.nonce}">
    (() => {
      const CSRF_TOKEN = ${JSON.stringify(options.csrfToken)};
      const workspace = document.getElementById('workspace');
      const locked = document.getElementById('locked');
      const toast = document.getElementById('toast');
      const state = { snapshot: null, selectedPlatforms: new Set(), platformSelectionTouched: false, loading: false, toastTimer: null };

      function text(id, value) {
        const node = document.getElementById(id);
        if (node) node.textContent = String(value == null ? '' : value);
      }

      function make(tag, className, value) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (value != null) node.textContent = String(value);
        return node;
      }

      function showToast(message, isError) {
        toast.textContent = message;
        toast.className = 'toast show' + (isError ? ' error' : '');
        if (state.toastTimer) clearTimeout(state.toastTimer);
        state.toastTimer = setTimeout(() => { toast.className = 'toast'; }, 2800);
      }

      function setChip(id, label, tone) {
        const chip = document.getElementById(id);
        if (!chip) return;
        chip.textContent = label;
        chip.className = 'status-chip' + (tone ? ' ' + tone : '');
      }

      async function api(path, options) {
        const response = await fetch(path, {
          cache: 'no-store',
          credentials: 'same-origin',
          ...options,
          headers: {
            'Content-Type': 'application/json',
            'X-ilyStream-CSRF': CSRF_TOKEN,
            ...(options && options.headers ? options.headers : {})
          }
        });
        if (response.status === 401 || response.status === 403) {
          workspace.style.display = 'none';
          locked.style.display = 'block';
          throw new Error('This dock needs to be paired again from ilyStream.');
        }
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.ok === false) throw new Error(payload.message || payload.error || ('Request failed: ' + response.status));
        return payload;
      }

      async function refreshSnapshot(showErrors) {
        if (state.loading) return;
        state.loading = true;
        try {
          const snapshot = await api('/api/snapshot');
          state.snapshot = snapshot;
          workspace.style.display = '';
          locked.style.display = 'none';
          render(snapshot);
        } catch (error) {
          const connection = document.getElementById('app-connection');
          connection.className = 'connection is-offline';
          text('app-connection-label', 'Offline');
          if (showErrors) showToast(error.message || String(error), true);
        } finally {
          state.loading = false;
        }
      }

      async function invoke(button, action) {
        if (button) button.disabled = true;
        try {
          const result = await api('/api/action', { method: 'POST', body: JSON.stringify(action) });
          showToast(result.message || 'Done', false);
          if (result.snapshot) {
            state.snapshot = result.snapshot;
            render(result.snapshot);
          } else {
            await refreshSnapshot(false);
          }
          return result;
        } catch (error) {
          showToast(error.message || String(error), true);
          return null;
        } finally {
          if (button) button.disabled = false;
        }
      }

      function render(snapshot) {
        const connection = document.getElementById('app-connection');
        connection.className = 'connection is-live';
        text('app-connection-label', 'Live');
        renderOBS(snapshot.obs);
        renderPlatforms(snapshot.platforms || []);
        renderWidgets(snapshot.widgets || []);
        renderSounds(snapshot.soundboard || []);
        renderTTS(snapshot.tts || {});
        renderNative(snapshot.nativeBridge || {});
      }

      function renderOBS(obs) {
        const connected = Boolean(obs && obs.connected);
        const connecting = Boolean(obs && obs.connecting);
        setChip('obs-chip', connected ? 'Connected' : connecting ? 'Connecting' : 'Offline', connected ? 'good' : connecting ? 'warn' : 'bad');
        text('obs-subtitle', connected ? ((obs.obsVersion ? 'OBS ' + obs.obsVersion + ' · ' : '') + 'WebSocket ' + (obs.obsWebSocketVersion || 'ready')) : (obs.lastError || 'WebSocket not connected'));
        text('metric-scene', obs.currentSceneName || '—');
        text('metric-stream', obs.streamActive == null ? '—' : obs.streamActive ? 'Live' : 'Idle');
        text('metric-record', obs.recordingActive == null ? '—' : obs.recordingActive ? 'Recording' : 'Idle');

        const select = document.getElementById('scene-select');
        const previous = select.value;
        select.replaceChildren();
        (obs.scenes || []).forEach((sceneName) => {
          const option = document.createElement('option');
          option.value = sceneName;
          option.textContent = sceneName;
          option.selected = sceneName === (previous || obs.currentSceneName);
          select.appendChild(option);
        });
        select.disabled = !connected || !obs.scenes || !obs.scenes.length;
        document.getElementById('scene-apply').disabled = select.disabled;
        document.getElementById('virtual-camera').disabled = !connected;
        document.getElementById('save-replay').disabled = !connected;
        text('virtual-camera', obs.virtualCameraActive ? 'Stop virtual camera' : 'Start virtual camera');
      }

      function renderPlatforms(platforms) {
        const holder = document.getElementById('chat-platforms');
        holder.replaceChildren();
        const enabledPlatformIds = new Set(platforms
          .filter((platform) => platform.status === 'connected' && platform.canSendChat)
          .map((platform) => platform.id));
        if (!state.platformSelectionTouched) {
          state.selectedPlatforms.clear();
          enabledPlatformIds.forEach((platformId) => state.selectedPlatforms.add(platformId));
        } else {
          [...state.selectedPlatforms].forEach((platformId) => {
            if (!enabledPlatformIds.has(platformId)) state.selectedPlatforms.delete(platformId);
          });
        }
        let viewers = 0;
        let available = 0;
        platforms.forEach((platform) => {
          viewers += Number(platform.viewerCount || 0);
          const enabled = platform.status === 'connected' && platform.canSendChat;
          if (enabled) available += 1;

          const label = make('label', 'platform-option');
          const input = document.createElement('input');
          input.type = 'checkbox';
          input.value = platform.id;
          input.checked = state.selectedPlatforms.has(platform.id);
          input.disabled = !enabled;
          input.addEventListener('change', () => {
            state.platformSelectionTouched = true;
            if (input.checked) state.selectedPlatforms.add(platform.id);
            else state.selectedPlatforms.delete(platform.id);
            document.getElementById('chat-send').disabled = state.selectedPlatforms.size === 0;
          });
          const pill = make('span', '', platform.id.charAt(0).toUpperCase() + platform.id.slice(1));
          const dot = make('i', 'platform-dot');
          pill.prepend(dot);
          pill.title = enabled ? 'Connected and ready' : (platform.chatUnavailableReason || platform.error || platform.status);
          label.append(input, pill);
          holder.appendChild(label);
        });
        text('viewer-count', viewers.toLocaleString() + ' viewers');
        document.getElementById('chat-send').disabled = available === 0 || state.selectedPlatforms.size === 0;
      }

      function renderWidgets(widgets) {
        const holder = document.getElementById('widget-list');
        holder.replaceChildren();
        text('widget-count', widgets.length + (widgets.length === 1 ? ' saved' : ' saved'));
        if (!widgets.length) {
          holder.appendChild(make('div', 'empty', 'Create a widget in ilyStream and it will appear here.'));
          return;
        }
        const currentScene = state.snapshot && state.snapshot.obs.currentSceneName;
        widgets.forEach((widget) => {
          const source = widget.managedSource;
          const attachedHere = Boolean(source && source.sceneReferences && source.sceneReferences.some((ref) => ref.sceneName === currentScene));
          const card = make('div', 'widget');
          card.appendChild(make('div', 'widget-accent'));
          const copy = make('div', 'widget-copy');
          copy.appendChild(make('div', 'widget-name', widget.name));
          copy.appendChild(make('div', 'widget-meta', !source ? widget.type + ' · not in OBS' : attachedHere ? source.inputName + ' · in this scene' : source.inputName + ' · saved in OBS'));
          const actions = make('div', 'widget-actions');
          const upsert = make('button', 'button tiny', !source ? 'Add' : attachedHere ? 'Sync' : 'Attach');
          upsert.disabled = !state.snapshot.obs.connected;
          upsert.addEventListener('click', () => invoke(upsert, { type: 'widget.upsert', widgetId: widget.id, sceneName: currentScene || undefined }));
          actions.appendChild(upsert);
          if (source) {
            const refresh = make('button', 'button tiny', '↻');
            refresh.title = 'Refresh browser source cache';
            refresh.disabled = !state.snapshot.obs.connected;
            refresh.addEventListener('click', () => invoke(refresh, { type: 'widget.refresh', inputName: source.inputName }));
            actions.appendChild(refresh);
          }
          card.append(copy, actions);
          holder.appendChild(card);
        });
      }

      function renderSounds(sounds) {
        const holder = document.getElementById('sound-list');
        holder.replaceChildren();
        text('sound-count', sounds.length + (sounds.length === 1 ? ' sound' : ' sounds'));
        if (!sounds.length) {
          holder.appendChild(make('div', 'empty', 'Add soundboard clips in ilyStream to use them here.'));
          return;
        }
        sounds.slice(0, 40).forEach((sound) => {
          const button = make('button', 'sound');
          button.type = 'button';
          button.appendChild(make('span', 'sound-emoji', sound.emoji || '♪'));
          const copy = make('span', 'sound-copy');
          copy.appendChild(make('span', 'sound-name', String(sound.name || '').replace(/\.(mp3|wav)$/i, '')));
          copy.appendChild(make('span', 'sound-meta', 'Play now · overlaps'));
          button.appendChild(copy);
          button.addEventListener('click', () => invoke(button, { type: 'sound.play', soundId: sound.id }));
          holder.appendChild(button);
        });
      }

      function renderTTS(tts) {
        setChip('tts-chip', !tts.enabled ? 'Disabled' : tts.paused ? 'Paused' : tts.playing ? 'Speaking' : (tts.queueLength || 0) + ' queued', !tts.enabled ? '' : tts.paused ? 'warn' : 'good');
        text('tts-toggle', tts.paused ? 'Resume TTS' : 'Pause TTS');
      }

      function renderNative(nativeBridge) {
        setChip('native-chip', nativeBridge.connected ? 'Linked' : nativeBridge.running ? 'Ready' : 'Offline', nativeBridge.connected ? 'good' : nativeBridge.running ? 'warn' : 'bad');
        text('native-detail', nativeBridge.connected ? ('Plugin ' + (nativeBridge.clientVersion || 'connected') + ' · OBS ' + (nativeBridge.obsVersion || 'unknown')) : nativeBridge.lastError || (nativeBridge.running ? 'Waiting for the optional OBS plugin' : 'Bridge service is offline'));
      }

      document.getElementById('scene-apply').addEventListener('click', (event) => {
        const sceneName = document.getElementById('scene-select').value;
        if (sceneName) invoke(event.currentTarget, { type: 'obs.setScene', sceneName });
      });
      document.getElementById('obs-reconnect').addEventListener('click', (event) => invoke(event.currentTarget, { type: 'obs.reconnect' }));
      document.getElementById('virtual-camera').addEventListener('click', (event) => invoke(event.currentTarget, { type: 'obs.toggleVirtualCamera' }));
      document.getElementById('save-replay').addEventListener('click', (event) => invoke(event.currentTarget, { type: 'obs.saveReplayBuffer' }));
      document.getElementById('stop-sounds').addEventListener('click', (event) => invoke(event.currentTarget, { type: 'sound.stopAll' }));
      document.getElementById('tts-toggle').addEventListener('click', (event) => invoke(event.currentTarget, { type: state.snapshot && state.snapshot.tts.paused ? 'tts.resume' : 'tts.pause' }));
      document.getElementById('tts-skip').addEventListener('click', (event) => invoke(event.currentTarget, { type: 'tts.skip' }));
      document.getElementById('test-follow').addEventListener('click', (event) => invoke(event.currentTarget, { type: 'alert.testFollow' }));
      document.getElementById('refresh-now').addEventListener('click', () => refreshSnapshot(true));
      document.getElementById('chat-send').addEventListener('click', async (event) => {
        const input = document.getElementById('chat-message');
        const message = input.value.trim();
        const platforms = [...state.selectedPlatforms];
        if (!message || !platforms.length) return;
        const result = await invoke(event.currentTarget, { type: 'chat.send', platforms, text: message });
        if (result) input.value = '';
      });
      document.getElementById('chat-message').addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          document.getElementById('chat-send').click();
        }
      });

      refreshSnapshot(true);
      setInterval(() => { if (document.visibilityState === 'visible') refreshSnapshot(false); }, 2000);
    })();
  </script>
</body>
</html>`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character] || character)
}
