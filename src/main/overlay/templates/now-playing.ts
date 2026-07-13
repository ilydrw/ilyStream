import { NowPlayingConfig, DEFAULT_NOW_PLAYING_CONFIG } from '../../../shared/widgets'
import { getAnimationCss } from './animation-utils'
import { INLINE_AVATAR_RUNTIME_SCRIPT } from './runtime-assets'

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

function resolveAnimatedBorderStops(borderType: NowPlayingConfig['borderType']): string {
  if (borderType === 'chroma') {
    return '#ff3b30, #ffd60a, #34d399, #00e5ff, #3b82f6, #d946ef, #ff3b30'
  }

  if (borderType === 'gob-the-stopper') {
    return '#b6ff00, #f7ffe8, #050505, #8fd400, #050505, #b6ff00'
  }

  return '#ff00ff, #00ffff, #ff00ff'
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = (hex || '').replace('#', '').trim()
  if (cleaned.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return { r: 11, g: 13, b: 16 }
  }
  return {
    r: parseInt(cleaned.slice(0, 2), 16),
    g: parseInt(cleaned.slice(2, 4), 16),
    b: parseInt(cleaned.slice(4, 6), 16)
  }
}

export function buildNowPlayingOverlayHtml(widget?: any, isPreview = false): string {
  const cfg: NowPlayingConfig = { ...DEFAULT_NOW_PLAYING_CONFIG, ...(widget?.config || {}) }
  const glassIntensity = cfg.glassIntensity ?? 0.5
  const bgOpacity = (0.4 + (glassIntensity * 0.45))
  const blur = glassIntensity * 45
  const borderRadius = cfg.borderRadius ?? 24
  const fontFamily = cfg.fontFamily || 'Inter'
  // Split the background into its rgb + alpha CSS variables so the live-config
  // hook can flip glassIntensity (alpha) and backgroundColor (rgb)
  // independently without rebuilding the document.
  const bgRgb = hexToRgb(cfg.backgroundColor)
  const accentRgba = hexToRgba(cfg.accentColor, 1)

  // Clamp the sizing fields server-side so a corrupt/legacy config can't render
  // the widget as a single 1px stripe in OBS/TLS. The editor's NumberInput
  // enforces these ranges in the UI, but stored values predate the clamp.
  const widthPx = clamp(cfg.width, 240, 1600, DEFAULT_NOW_PLAYING_CONFIG.width)
  const fontSizePx = clamp(cfg.fontSize, 12, 72, DEFAULT_NOW_PLAYING_CONFIG.fontSize)
  const borderWidthPx = clamp(cfg.borderWidth, 0, 20, DEFAULT_NOW_PLAYING_CONFIG.borderWidth)

  const accentSoftRgba = hexToRgba(cfg.accentColor, 0.15)
  const animatedBorderStops = resolveAnimatedBorderStops(cfg.borderType)

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>ilyStream Now Playing & Queue</title>
    ${INLINE_AVATAR_RUNTIME_SCRIPT}
    <style>
      :root {
        color-scheme: dark;
        font-family: "${fontFamily}", "Inter", "Segoe UI", sans-serif;
        --chroma: linear-gradient(45deg, #ff3b30, #ffd60a, #34d399, #00e5ff, #3b82f6, #d946ef);
        --cyber: linear-gradient(45deg, #ff00ff, #00ffff, #ff00ff);
        --radius: ${borderRadius}px;
        --blur: ${blur}px;
        --width: ${widthPx}px;
        --font-size: ${fontSizePx}px;
        --bg-rgb: ${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b};
        --bg-alpha: ${bgOpacity};
        --bg: rgba(var(--bg-rgb), var(--bg-alpha));
      }
      * { box-sizing: border-box; }
      /* Fluid sizing so the widget fills the user's browser source whatever
         dimensions they set in OBS / TikTok Live Studio. The min-* fallback
         guards against CEF's "iframe collapses to 1px before first layout"
         quirk — without it, 100% would resolve to 0px and the page would be
         invisible. A 1920×1080 fixed stage (the pattern alerts.ts uses) is
         wrong here: this is a small fixed widget, and locking to 1920×1080
         pushes any non-top-left position config off-screen for a typical
         500×120 source. */
      html, body {
        width: 100%;
        height: 100%;
        min-width: 480px;
        min-height: 140px;
        margin: 0;
        padding: 0;
        overflow: hidden;
        background: transparent !important;
      }
      body {
        color: ${cfg.textColor};
        display: flex;
        padding: 32px;
      }
      /* All six positions are emitted up-front so the live-config hook can
         switch the layout via a single attribute flip. The default matches
         OVERLAY_POSITION_MAP's top-left, which is also the legacy fallback. */
      body { align-items: flex-start; justify-content: flex-start; }
      body[data-position="top-left"]      { align-items: flex-start; justify-content: flex-start; }
      body[data-position="top-center"]    { align-items: flex-start; justify-content: center; }
      body[data-position="top-right"]     { align-items: flex-start; justify-content: flex-end; }
      body[data-position="bottom-left"]   { align-items: flex-end;   justify-content: flex-start; }
      body[data-position="bottom-center"] { align-items: flex-end;   justify-content: center; }
      body[data-position="bottom-right"]  { align-items: flex-end;   justify-content: flex-end; }
      .container {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: var(--width);
        /* Body has min-width 480px (above), so 100% - 64px is at least 416px
           even when the iframe viewport collapses. The width itself is also
           server-clamped to [240, 1600], so it can't grow past the body. */
        max-width: calc(100% - 64px);
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
        padding: ${borderWidthPx}px;
        background: conic-gradient(from var(--angle), ${animatedBorderStops}) border-box;
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
        background: var(--bg);
        margin: ${cfg.showBorder ? borderWidthPx : 0}px;
        border-radius: ${cfg.showBorder ? `calc(var(--radius) - ${borderWidthPx}px)` : 'var(--radius)'};
        backdrop-filter: blur(var(--blur)) saturate(220%);
        -webkit-backdrop-filter: blur(var(--blur)) saturate(220%);
        box-shadow: inset 0 0 20px rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.12);
        width: calc(100% - ${cfg.showBorder ? borderWidthPx * 2 : 0}px);
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
        letter-spacing: 0;
        font-size: 10px;
        font-weight: 800;
        color: ${accentRgba};
      }
      .track {
        font-size: var(--font-size);
        font-weight: 800;
        line-height: 1.2;
        white-space: nowrap;
        position: relative;
        display: inline-block;
      }
      .artist {
        font-size: max(12px, calc(var(--font-size) * 0.65));
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
        background: var(--bg);
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
        letter-spacing: 0;
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
        letter-spacing: 0;
      }
      .queue-item.is-injected {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid ${accentSoftRgba};
      }

      @keyframes slideUp {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* Self-diagnosing banner that fires when the browser-source iframe is
         too small to render the widget — typically OBS / TLS added the source
         without explicit Width/Height. Without this the widget would clip to
         invisibility with no clue why. Pattern mirrors alerts.ts. */
      .size-warning {
        position: fixed;
        inset: 8px;
        border: 2px dashed rgba(255, 200, 0, 0.6);
        border-radius: 12px;
        background: rgba(20, 16, 0, 0.88);
        color: #ffd166;
        font-family: "${fontFamily}", "Inter", "Segoe UI", sans-serif;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 12px;
        z-index: 10001;
        gap: 6px;
      }
      .size-warning h1 { font-size: clamp(14px, 4vw, 20px); font-weight: 800; margin: 0; }
      .size-warning p  { font-size: clamp(11px, 2.4vw, 14px); line-height: 1.45; max-width: 520px; margin: 0; }
      .size-warning code { background: rgba(0, 0, 0, 0.45); padding: 2px 6px; border-radius: 4px; font-size: 0.95em; }
      .size-warning .current { opacity: 0.6; font-size: clamp(10px, 2vw, 12px); }
    </style>
  </head>
  <body data-position="${cfg.position}">
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
      const IS_PREVIEW = ${JSON.stringify(isPreview)};
      const PREVIEW_STATE = {
        isPlaying: true,
        trackId: 'preview-track',
        trackName: 'Neon Skyline',
        artists: ['Luna Vale', 'Signal Bloom'],
        albumName: 'After Hours Broadcast',
        albumArtUrl: null,
        durationMs: 214000,
        progressMs: 86000,
        requestedBy: 'MiaMoon',
        requesterPlatform: 'tiktok',
        status: 'ok',
        queue: [
          {
            id: 'preview-request-next',
            requestedBy: 'PixelDrew',
            platform: 'twitch',
            requestedAt: Date.now(),
            status: 'queued',
            track: {
              id: 'preview-next',
              name: 'Late Night Queue',
              artists: ['Glass Circuit'],
              albumName: 'Chat Requests',
              durationMs: 189000,
              progressMs: 0,
              explicit: false,
              uri: 'spotify:track:preview-next',
              externalUrl: '',
              albumArtUrl: null
            }
          },
          {
            id: 'preview-spotify-next',
            requestedBy: '',
            platform: 'spotify',
            requestedAt: Date.now(),
            status: 'injected',
            track: {
              id: 'preview-spotify',
              name: 'Autoplay Drift',
              artists: ['Spotify Queue'],
              albumName: 'Radio',
              durationMs: 202000,
              progressMs: 0,
              explicit: false,
              uri: 'spotify:track:preview-spotify',
              externalUrl: '',
              albumArtUrl: null
            }
          }
        ]
      };

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
        return window.__ilyAvatar.proxy(value);
      }

      function requestJson(url) {
        var runtime = window.__ilystreamOverlayRuntime;
        if (runtime && typeof runtime.requestJson === 'function') {
          return runtime.requestJson(url);
        }
        return fetch(url, { cache: 'no-store' }).then(function(response) {
          if (!response.ok) throw new Error('state HTTP ' + response.status);
          return response.json();
        });
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

        const hasTrack = Boolean(state.trackId || state.trackName);

        if (!hasTrack && (!state.queue || state.queue.length === 0)) {
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

        if (hasTrack) {
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

        const upcoming = Array.isArray(state.queue)
          ? state.queue.filter(item => item && item.status !== 'played' && item.status !== 'skipped')
          : [];

        if (SHOW_QUEUE && upcoming.length > 0) {
          queuePanel.style.display = 'flex';
          queueList.innerHTML = '';
          upcoming.slice(0, MAX_QUEUE).forEach((item, index) => {
            const isInjected = item.status === 'injected';
            const row = document.createElement('div');
            row.className = 'queue-item' + (isInjected ? ' is-injected' : '');

            let html = '<div class="queue-info">';
            var track = item.track || {};
            var artists = Array.isArray(track.artists) ? track.artists : [];
            html += '<div class="queue-track">' + escapeHtml(track.name || 'Unknown track') + '</div>';
            html += '<div class="queue-artist">' + escapeHtml(artists.join(', ')) + '</div>';
            html += '</div>';

            if (item.requestedBy) {
              html += '<div class="queue-requester">' + escapeHtml(item.requestedBy) + '</div>';
            }

            if (index === 0) {
              html += '<div class="queue-status">NEXT</div>';
            } else if (isInjected) {
              html += '<div class="queue-status">SPOTIFY</div>';
            }

            row.innerHTML = html;
            queueList.appendChild(row);
          });
        } else {
          queuePanel.style.display = 'none';
        }
      }

      // Default fallback state — guarantees the widget paints something the
      // moment the script runs so TikTok Live Studio / OBS don't see a zero
      // dimension box while the first fetch is in flight. Replaced as soon as
      // /overlay/now-playing/state resolves.
      const IDLE_FALLBACK_STATE = {
        isPlaying: false,
        trackId: null,
        trackName: '',
        artists: [],
        durationMs: 0,
        progressMs: 0,
        queue: [],
        status: 'ok'
      };

      function hydrate() {
        if (IS_PREVIEW) {
          render(PREVIEW_STATE);
          return;
        }

        // Paint the idle fallback immediately so the iframe has visible layout
        // before the network round-trip resolves.
        render(IDLE_FALLBACK_STATE);

        requestJson('/overlay/now-playing/state')
        .then(function(state) {
          render(state);
        })
        .catch(function(err) {
          console.error('[now-playing] hydrate failed:', err);
          // Leave the idle fallback on screen — SSE will catch up if the
          // server comes back online.
        });
      }

      hydrate();

      if (!IS_PREVIEW) {
        const source = new EventSource('/overlay/events?channel=now-playing');
        source.onmessage = (event) => {
          const msg = JSON.parse(event.data);
          if (msg.type === 'snapshot') render(msg.payload);
          else if (msg.type === 'reload') window.location.reload();
        };
      }

      // Self-diagnosing size check. Skipped in preview mode (the editor
      // intentionally varies its preview size — the message would be noise).
      function checkViewportSize() {
        if (IS_PREVIEW) return;
        var existing = document.getElementById('np-size-warning');
        if (existing) existing.remove();
        var tooSmall = window.innerWidth < 240 || window.innerHeight < 100;
        if (!tooSmall) return;
        var el = document.createElement('div');
        el.id = 'np-size-warning';
        el.className = 'size-warning';
        el.innerHTML = ''
          + '<h1>Browser source too small</h1>'
          + '<p>Set this source\\'s width &amp; height to at least <code>480 \\u00d7 140</code> '
          + 'so the now-playing widget can render. In OBS / TikTok Live Studio, '
          + 'right-click the source and edit its dimensions.</p>'
          + '<p class="current">Current viewport: ' + window.innerWidth + ' \\u00d7 ' + window.innerHeight + '</p>';
        document.body.appendChild(el);
      }
      window.addEventListener('load', checkViewportSize);
      window.addEventListener('resize', checkViewportSize);
      checkViewportSize();

      // Live-config hook. Handles the high-frequency tweaks (size, position,
      // radius, font-size, glass, background color) that map cleanly to CSS
      // variables and attribute flips. Border type / animation / font-family
      // touch CSS rules that are config-baked at render time; if those
      // change, the hook bails out and asks the parent to fall back to HTML
      // mode.
      var NP_LIVE_FIELDS = {
        borderRadius: 1, width: 1, fontSize: 1, glassIntensity: 1, position: 1,
        backgroundColor: 1
      };
      window.__ilystreamApplyConfig = function(cfg) {
        if (!cfg) return;
        var root = document.documentElement;
        var body = document.body;
        var prev = window.__ilystreamLastConfig || null;
        // On the second+ call, check whether any field outside our handled
        // set changed since the last apply. If so, ask the parent for HTML.
        if (prev) {
          for (var k in cfg) {
            if (!cfg.hasOwnProperty(k)) continue;
            if (NP_LIVE_FIELDS[k]) continue;
            if (prev[k] !== cfg[k]) {
              try {
                window.parent && window.parent.postMessage(
                  { type: 'ilystream:preview-needs-html' }, '*'
                );
              } catch (e) {}
              // Don't apply partial state — let the HTML push replace us.
              return;
            }
          }
        }
        if (cfg.borderRadius != null) root.style.setProperty('--radius', cfg.borderRadius + 'px');
        if (cfg.width != null) root.style.setProperty('--width', cfg.width + 'px');
        if (cfg.fontSize != null) root.style.setProperty('--font-size', cfg.fontSize + 'px');
        if (cfg.glassIntensity != null) {
          // Both --blur and --bg-alpha track glassIntensity using the same
          // formulas the TS renderer uses (blur = glass * 45, bgAlpha =
          // 0.4 + glass * 0.45). Without the alpha update, the panel would
          // stay at its original transparency while the blur changed —
          // confusing the user who sees only half of the slider's effect.
          root.style.setProperty('--blur', (cfg.glassIntensity * 45) + 'px');
          root.style.setProperty('--bg-alpha', String(0.4 + cfg.glassIntensity * 0.45));
        }
        if (typeof cfg.position === 'string') {
          body.setAttribute('data-position', cfg.position);
        }
        if (typeof cfg.backgroundColor === 'string') {
          var c = cfg.backgroundColor.replace('#', '').trim();
          if (c.length === 6 && /^[0-9a-fA-F]{6}$/.test(c)) {
            root.style.setProperty(
              '--bg-rgb',
              parseInt(c.slice(0, 2), 16) + ', ' +
              parseInt(c.slice(2, 4), 16) + ', ' +
              parseInt(c.slice(4, 6), 16)
            );
          }
        }
        window.__ilystreamLastConfig = cfg;
      };
    </script>
  </body>
</html>`
}
