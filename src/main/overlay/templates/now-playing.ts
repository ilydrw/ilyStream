import { NowPlayingConfig, DEFAULT_NOW_PLAYING_CONFIG } from '../../../shared/widgets'
import { getAnimationCss } from './animation-utils'

const OVERLAY_POSITION_MAP: Record<string, string> = {
  'bottom-left':   'align-items:flex-end;justify-content:flex-start',
  'bottom-right':  'align-items:flex-end;justify-content:flex-end',
  'top-left':      'align-items:flex-start;justify-content:flex-start',
  'top-right':     'align-items:flex-start;justify-content:flex-end',
  'top-center':    'align-items:flex-start;justify-content:center',
  'bottom-center': 'align-items:flex-end;justify-content:center',
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function buildNowPlayingOverlayHtml(widget?: any): string {
  const cfg: NowPlayingConfig = { ...DEFAULT_NOW_PLAYING_CONFIG, ...(widget?.config || {}) }
  const glassIntensity = cfg.glassIntensity ?? 0.5
  const bgOpacity = (0.4 + (glassIntensity * 0.45))
  const blur = glassIntensity * 45
  const borderRadius = cfg.borderRadius ?? 24
  const fontFamily = cfg.fontFamily || 'Inter'
  const bgRgba = hexToRgba(cfg.backgroundColor, bgOpacity)
  const accentRgba = hexToRgba(cfg.accentColor, 1)

  const shellStyle = OVERLAY_POSITION_MAP[cfg.position] ?? OVERLAY_POSITION_MAP['top-left']
  const accentSoftRgba = hexToRgba(cfg.accentColor, 0.15)

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>ilyStream Now Playing & Queue</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: "${fontFamily}", "Inter", "Segoe UI", sans-serif;
        --chroma: linear-gradient(45deg, #00f2ff, #006aff, #7000ff, #ff00c8);
        --cyber: linear-gradient(45deg, #ff00ff, #00ffff, #ff00ff);
        --radius: ${borderRadius}px;
        --blur: ${blur}px;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background: transparent;
        color: ${cfg.textColor};
        display: flex;
        ${shellStyle};
        padding: 32px;
      }
      .container {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: ${cfg.width}px;
        max-width: calc(100vw - 64px);
        filter: drop-shadow(0 20px 40px rgba(0,0,0,0.4));
      }
      ${getAnimationCss({ style: cfg.animationStyle || 'slide', duration: cfg.animationDuration || 600 }, '.container')}
      .container.is-visible {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      @property --angle {
        syntax: '<angle>';
        initial-value: 0deg;
        inherits: false;
      }
      @keyframes rotate {
        to { --angle: 360deg; }
      }
      .panel {
        position: relative;
        width: 100%;
        border-radius: var(--radius);
        display: flex;
        flex-direction: column;
        background: ${cfg.showBorder && cfg.borderType === 'solid' ? cfg.borderColor : 'transparent'};
      }
      .panel-border-wrap {
        position: absolute;
        inset: 0;
        z-index: 2;
        pointer-events: none;
        display: ${cfg.showBorder && cfg.borderType !== 'solid' ? 'block' : 'none'};
        border-radius: var(--radius);
        padding: ${cfg.borderWidth}px;
        background: conic-gradient(from var(--angle), ${cfg.borderType === 'chroma'
          ? '#00f2ff, #006aff, #7000ff, #ff00c8, #00f2ff'
          : '#ff00ff, #00ffff, #ff00ff'}) border-box;
        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        animation: rotate 4s linear infinite;
      }
      .panel-inner {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
        gap: 20px;
        background: ${bgRgba};
        margin: ${cfg.showBorder ? cfg.borderWidth : 0}px;
        border-radius: ${cfg.showBorder ? `calc(var(--radius) - ${cfg.borderWidth}px)` : 'var(--radius)'};
        backdrop-filter: blur(var(--blur)) saturate(220%);
        -webkit-backdrop-filter: blur(var(--blur)) saturate(220%);
        box-shadow: inset 0 0 20px rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.12);
        width: calc(100% - ${cfg.showBorder ? cfg.borderWidth * 2 : 0}px);
        overflow: hidden;
      }
      .panel-inner::before {
        content: "";
        position: absolute;
        inset: 0;
        background: radial-gradient(circle at 20% 0%, rgba(255,255,255,0.05) 0%, transparent 50%);
        pointer-events: none;
        display: ${cfg.backgroundOpacity > 0 ? 'block' : 'none'};
      }
      .panel-inner::after {
        content: "";
        position: absolute;
        bottom: -20px;
        right: -20px;
        width: 100px;
        height: 100px;
        background: ${accentRgba};
        filter: blur(60px);
        opacity: 0.15;
        pointer-events: none;
        display: ${cfg.backgroundOpacity > 0 ? 'block' : 'none'};
      }
      .art {
        width: 72px;
        height: 72px;
        border-radius: calc(var(--radius) * 0.5);
        background: rgba(255, 255, 255, 0.05);
        flex-shrink: 0;
        background-size: cover;
        background-position: center;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      }
      .body { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; overflow: hidden; }
      .label-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 2px;
      }
      .label {
        text-transform: uppercase;
        letter-spacing: 0.15em;
        font-size: 10px;
        font-weight: 800;
        color: ${accentRgba};
      }
      .track {
        font-size: ${cfg.fontSize}px;
        font-weight: 800;
        line-height: 1.2;
        white-space: nowrap;
        position: relative;
        display: inline-block;
      }
      .artist {
        font-size: ${Math.max(12, cfg.fontSize * 0.65)}px;
        font-weight: 500;
        opacity: 0.7;
        white-space: nowrap;
        display: inline-block;
      }

      .scroll-container {
        overflow: hidden;
        white-space: nowrap;
        width: 100%;
        position: relative;
      }

      .marquee {
        display: inline-block;
        padding-left: 0;
        animation: marquee var(--duration, 10s) linear infinite;
        white-space: nowrap;
        width: max-content;
      }

      @keyframes marquee {
        0% { transform: translateX(0); }
        15% { transform: translateX(0); }
        85% { transform: translateX(calc(-100% + var(--container-width))); }
        100% { transform: translateX(calc(-100% + var(--container-width))); }
      }
      .requester {
        margin-top: 6px;
        font-size: 10px;
        font-weight: 600;
        opacity: 0.5;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .progress {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 4px;
        background: rgba(255, 255, 255, 0.05);
        ${cfg.showProgressBar ? '' : 'display:none;'}
      }
      .progress-bar {
        height: 100%;
        width: 0%;
        background: ${accentRgba};
        transition: width 800ms linear;
      }

      .queue-panel {
        background: ${bgRgba};
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        padding: 12px;
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        display: flex;
        flex-direction: column;
        gap: 8px;
        ${cfg.showQueue ? '' : 'display:none;'}
        animation: slideUp 400ms ease-out;
      }
      .queue-header {
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        opacity: 0.4;
        padding-left: 4px;
      }
      .queue-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 8px;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.03);
      }
      .queue-info { min-width: 0; flex: 1; }
      .queue-track {
        font-size: 13px;
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .queue-artist {
        font-size: 11px;
        opacity: 0.5;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .queue-requester {
        font-size: 9px;
        font-weight: 700;
        color: ${accentRgba};
        opacity: 0.8;
      }
      .queue-status {
        font-size: 9px;
        font-weight: 900;
        padding: 2px 6px;
        border-radius: 4px;
        background: ${accentRgba};
        color: #000;
        letter-spacing: 0.05em;
      }
      .queue-item.is-injected {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid ${accentSoftRgba};
      }

      @keyframes slideUp {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
    </style>
  </head>
  <body>
    <div class="container" id="container">
      <div class="panel" id="panel">
        <div class="panel-border-wrap"></div>
        <div class="panel-inner">
          <div class="art" id="art" style="${cfg.showAlbumArt ? '' : 'display:none;'}"></div>
          <div class="body">
            <div class="label-row">
              <span class="label">Now Playing</span>
            </div>
            <div class="scroll-container" id="track-container">
              <span class="track" id="track">—</span>
            </div>
            <div class="scroll-container" id="artist-container">
              <span class="artist" id="artist"></span>
            </div>
            <div class="requester" id="requester" style="${cfg.showRequester ? '' : 'display:none;'}"></div>
          </div>
          <div class="progress"><div class="progress-bar" id="bar"></div></div>
        </div>
      </div>

      <div class="queue-panel" id="queue-panel">
        <div class="queue-header">Up Next</div>
        <div id="queue-list"></div>
      </div>
    </div>

    <script>
      const HIDE_WHEN_IDLE = ${cfg.hideWhenIdle ? 'true' : 'false'};
      const SHOW_REQUESTER = ${cfg.showRequester ? 'true' : 'false'};
      const SHOW_QUEUE = ${cfg.showQueue ? 'true' : 'false'};
      const MAX_QUEUE = ${cfg.maxQueueItems ?? 5};

      const container = document.getElementById('container');
      const trackEl = document.getElementById('track');
      const artistEl = document.getElementById('artist');
      const trackContainer = document.getElementById('track-container');
      const artistContainer = document.getElementById('artist-container');
      const artEl = document.getElementById('art');
      const requesterEl = document.getElementById('requester');
      const barEl = document.getElementById('bar');
      const queuePanel = document.getElementById('queue-panel');
      const queueList = document.getElementById('queue-list');

      function updateMarquee(el, container) {
        el.classList.remove('marquee');
        el.style.removeProperty('--container-width');

        const isOverflowing = el.scrollWidth > container.clientWidth;
        if (isOverflowing) {
          el.classList.add('marquee');
          el.style.setProperty('--container-width', container.clientWidth + 'px');
          const duration = Math.max(8, el.scrollWidth / 35);
          el.style.setProperty('--duration', duration + 's');
          el.style.animationDuration = duration + 's';
        }
      }

      function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }

      function safeImageUrl(value) {
        if (typeof value !== 'string' || !value.trim()) return '';
        try {
          const url = new URL(value, window.location.origin);
          return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
        } catch {
          return '';
        }
      }

      function render(state) {
        if (!state) return;

        if (state.status === 'unauthorized') {
          container.classList.add('is-visible');
          trackEl.textContent = 'Spotify Unauthorized';
          artistEl.textContent = 'Check settings/login';
          artEl.style.backgroundImage = '';
          requesterEl.innerHTML = '';
          barEl.style.width = '0%';
          queuePanel.style.display = 'none';
          return;
        }

        if (state.isRefreshing) {
          container.classList.add('is-visible');
          trackEl.textContent = 'Spotify Connecting...';
          artistEl.textContent = 'Refreshing session';
          artEl.style.backgroundImage = '';
          requesterEl.innerHTML = '';
          barEl.style.width = '0%';
          return;
        }

        if (state.status === 'no-device') {
          container.classList.add('is-visible');
          trackEl.textContent = 'No active device';
          artistEl.textContent = 'Open Spotify on PC';
          artEl.style.backgroundImage = '';
          requesterEl.innerHTML = '';
          barEl.style.width = '0%';
          queuePanel.style.display = 'none';
          return;
        }

        if (!state.trackId && (!state.queue || state.queue.length === 0)) {
          if (HIDE_WHEN_IDLE) {
            container.classList.remove('is-visible');
          } else {
            container.classList.add('is-visible');
            trackEl.textContent = 'Nothing playing';
            artistEl.textContent = 'Spotify is idle';
            artEl.style.backgroundImage = '';
            requesterEl.innerHTML = '';
            barEl.style.width = '0%';
            queuePanel.style.display = 'none';
          }
          return;
        }

        container.classList.add('is-visible');

        if (state.trackId) {
          trackEl.textContent = state.trackName || '—';
          artistEl.textContent = (state.artists || []).join(', ');

          setTimeout(() => {
            updateMarquee(trackEl, trackContainer);
            updateMarquee(artistEl, artistContainer);
          }, 50);

          const albumArtUrl = safeImageUrl(state.albumArtUrl);
          if (albumArtUrl) {
            artEl.style.backgroundImage = 'url("' + albumArtUrl.replace(/"/g, '%22') + '")';
          } else {
            artEl.style.backgroundImage = '';
          }

          if (SHOW_REQUESTER && state.requestedBy) {
            requesterEl.style.display = 'flex';
            requesterEl.textContent = 'Requested by ' + state.requestedBy;
          } else {
            requesterEl.style.display = 'none';
          }

          const progress = state.durationMs > 0 ? (state.progressMs / state.durationMs) * 100 : 0;
          barEl.style.width = progress + '%';
        }

        if (SHOW_QUEUE && state.queue && state.queue.length > 0) {
          queuePanel.style.display = 'flex';
          queueList.innerHTML = '';
          state.queue.slice(0, MAX_QUEUE).forEach(item => {
            const isInjected = item.status === 'injected';
            const row = document.createElement('div');
            row.className = 'queue-item' + (isInjected ? ' is-injected' : '');

            let html = '<div class="queue-info">';
            html += '<div class="queue-track">' + escapeHtml(item.track.name) + '</div>';
            html += '<div class="queue-artist">' + escapeHtml((item.track?.artists || []).join(', ')) + '</div>';
            html += '</div>';

            if (item.requestedBy) {
              html += '<div class="queue-requester">' + escapeHtml(item.requestedBy) + '</div>';
            } else if (isInjected) {
              html += '<div class="queue-status">NEXT</div>';
            }

            row.innerHTML = html;
            queueList.appendChild(row);
          });
        } else {
          queuePanel.style.display = 'none';
        }
      }

      async function hydrate() {
        const response = await fetch('/overlay/now-playing/state', { cache: 'no-store' });
        const state = await response.json();
        render(state);
      }

      hydrate().catch(console.error);

      const source = new EventSource('/overlay/events?channel=now-playing');
      source.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'snapshot') render(msg.payload);
        else if (msg.type === 'reload') window.location.reload();
      };
    </script>
  </body>
</html>`
}
