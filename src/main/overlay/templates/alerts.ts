import { Widget } from '../../../shared/widgets'
import { INLINE_AVATAR_RUNTIME_SCRIPT } from './runtime-assets'

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function parseHexRgb(value: unknown): { r: number; g: number; b: number } | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) return null
  let hex = match[1]
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16)
  }
}

export function buildAlertsOverlayHtml(_widget: Widget, isPreview: boolean): string {
  const cfg = (_widget.config as any) || {}
  const glassIntensity = clamp01(Number(cfg.glassIntensity ?? 0.5))
  // Explicit background-opacity slider wins and goes all the way to 0
  // (fully transparent); widgets saved before the slider existed keep the
  // legacy glass-derived value (0.2–0.6).
  const bgOpacity = Number.isFinite(Number(cfg.backgroundOpacity))
    ? clamp01(Number(cfg.backgroundOpacity))
    : 0.2 + glassIntensity * 0.4
  const blur = Number.isFinite(Number(cfg.blur))
    ? Math.min(120, Math.max(0, Number(cfg.blur)))
    : glassIntensity * 60
  const borderRadius = cfg.borderRadius ?? 40
  const borderWidth = Number.isFinite(Number(cfg.borderWidth))
    ? Math.min(20, Math.max(0, Number(cfg.borderWidth)))
    : 1
  const fontFamily = cfg.fontFamily || 'Inter'
  const backgroundRgb = parseHexRgb(cfg.backgroundColor) || { r: 10, g: 12, b: 18 }
  const textColor = typeof cfg.textColor === 'string' && /^#[0-9a-f]{3,8}$/i.test(cfg.textColor)
    ? cfg.textColor
    : '#ffffff'
  // Panel chrome (drop shadow, inner glow, shine, frost) scales with the
  // background tint so a transparent card is truly invisible, not a ghost
  // box of shadow and blur. At the legacy default alpha (0.4) the scale is
  // exactly 1, preserving the original look.
  const chromeScale = Math.min(1, bgOpacity / 0.4)
  const frostScale = Math.min(1, bgOpacity * 4)

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=1920, height=1080, initial-scale=1" />
  <title>ilyStream Alerts</title>
  ${INLINE_AVATAR_RUNTIME_SCRIPT}
  <style>
    :root {
      --cyber-blue: #00f2ff;
      --cyber-pink: #ff00e5;
      --glass-bg: rgba(${backgroundRgb.r}, ${backgroundRgb.g}, ${backgroundRgb.b}, ${bgOpacity});
      --glass-border: rgba(255, 255, 255, 0.15);
      --liquid-shine: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(255,255,255,0.05) 100%);
      --radius: ${borderRadius}px;
      --font-main: "${fontFamily}", Inter, "Segoe UI", Arial, sans-serif;
      --blur: ${(blur * frostScale).toFixed(1)}px;
      --card-border-width: ${borderWidth}px;
      --card-shadow-alpha: ${(0.6 * chromeScale).toFixed(3)};
      --card-inner-alpha: ${(0.05 * chromeScale).toFixed(3)};
      --card-shine: ${chromeScale.toFixed(3)};
      --card-saturate: ${100 + Math.round(150 * frostScale)}%;
      --alert-text-color: ${textColor};
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    html,
    body {
      width: 1920px;
      height: 1080px;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: transparent !important;
      font-family: var(--font-main);
      -webkit-font-smoothing: antialiased;
      text-rendering: geometricPrecision;
    }

    #v5-alert-stage {
      position: absolute;
      top: 0;
      left: 0;
      width: 1920px;
      height: 1080px;
      overflow: hidden;
      perspective: 1200px;
    }

    .alert-wrapper {
      position: absolute;
      top: var(--alert-top, 10%);
      left: var(--alert-left, 50%);
      max-width: 95vw;
      opacity: 0;
      filter: blur(10px);
      transform: translate(-50%, 0) translateY(30px) scale(0.9) rotateX(10deg);
      transform-origin: top center;
      transition:
        opacity 0.7s cubic-bezier(0.19, 1, 0.22, 1),
        filter 0.7s cubic-bezier(0.19, 1, 0.22, 1),
        transform 0.7s cubic-bezier(0.19, 1, 0.22, 1);
      will-change: transform, opacity, filter;
    }

    .alert-wrapper.anim-slide {
      transform: translate(-50%, 0) translateY(70px) scale(0.96);
    }

    .alert-wrapper.anim-zoom {
      transform: translate(-50%, 0) scale(0.65);
    }

    .alert-wrapper.active {
      opacity: 1;
      filter: blur(0);
      transform: translate(-50%, 0) translateY(0) scale(1) rotateX(0deg);
    }

    .alert-wrapper.anim-bounce.active {
      transition-timing-function: cubic-bezier(0.2, 1.4, 0.28, 1);
    }

    .alert-content {
      position: relative;
      display: flex;
      width: max-content;
      min-width: 320px;
      max-width: 92vw;
      align-items: center;
      gap: 20px;
      overflow: visible;
      border: var(--card-border-width) solid var(--glass-border);
      border-radius: var(--radius);
      background: var(--glass-bg);
      padding: 35px 50px;
      text-align: center;
      box-shadow:
        0 30px 80px rgba(0, 0, 0, var(--card-shadow-alpha)),
        inset 0 0 20px rgba(255, 255, 255, var(--card-inner-alpha));
      backdrop-filter: blur(var(--blur)) saturate(var(--card-saturate));
      -webkit-backdrop-filter: blur(var(--blur)) saturate(var(--card-saturate));
    }

    .alert-content::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: var(--liquid-shine);
      opacity: var(--card-shine);
      pointer-events: none;
    }

    .layout-stacked .alert-content {
      flex-direction: column;
    }

    .layout-side-by-side .alert-content {
      flex-direction: row;
      gap: 30px;
      padding-right: 60px;
      text-align: left;
    }

    .layout-text-only .alert-content {
      justify-content: center;
      padding: 30px 60px;
    }

    .layout-image-only .alert-content {
      justify-content: center;
      padding: 30px;
    }

    .cyber-border .alert-content::before {
      content: "";
      position: absolute;
      inset: calc(var(--cyber-width, 3px) * -1);
      border-radius: inherit;
      padding: var(--cyber-width, 3px);
      background: linear-gradient(90deg, var(--cyber-blue), var(--cyber-pink), var(--cyber-blue));
      background-size: 200% 100%;
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      animation: border-flow 3s linear infinite;
      pointer-events: none;
    }

    @keyframes border-flow {
      0% { background-position: 0% 0%; }
      100% { background-position: -200% 0%; }
    }

    .alert-image-container {
      position: relative;
      isolation: isolate;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 32px;
    }

    /* Alert artwork is often a transparent black PNG. Give it a neutral,
       translucent stage so it remains visible on the dark glass alert card
       without recoloring the uploaded image itself. */
    .alert-image-container:not(.alert-image-failed)::before {
      content: "";
      position: absolute;
      inset: 4px;
      z-index: -1;
      border: 1px solid rgba(255, 255, 255, 0.42);
      border-radius: inherit;
      background: rgba(255, 255, 255, 0.38);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.50),
        0 0 36px rgba(255, 255, 255, 0.10);
      pointer-events: none;
    }

    .alert-image {
      position: relative;
      z-index: 1;
      width: 200px;
      height: 200px;
      object-fit: contain;
      filter:
        drop-shadow(0 12px 28px rgba(0, 0, 0, 0.36))
        drop-shadow(0 0 1px rgba(255, 255, 255, 0.70));
      animation: float 3s ease-in-out infinite;
    }

    .layout-side-by-side .alert-image {
      width: 120px;
      height: 120px;
    }

    /* Diagnostic tile shown when an alert image 404s (usually a stale OBS
       browser-source cache from before the asset was uploaded). Makes a silent
       missing image obvious instead of leaving a blank gap. */
    .alert-image-container.alert-image-failed {
      width: 200px;
      height: 200px;
      box-sizing: border-box;
      flex-direction: column;
      gap: 6px;
      padding: 12px;
      border: 2px dashed rgba(255, 90, 90, 0.75);
      border-radius: 16px;
      background: rgba(255, 60, 60, 0.08);
      color: rgba(255, 170, 170, 0.96);
      font-size: 12px;
      font-weight: 700;
      text-align: center;
      word-break: break-all;
      overflow: hidden;
    }
    .alert-image-container.alert-image-failed .alert-image { display: none; }
    .alert-image-container.alert-image-failed::before {
      content: "⚠ image failed to load";
      display: block;
    }
    .alert-image-container.alert-image-failed::after {
      content: attr(data-image-error);
      display: block;
      font-weight: 500;
      opacity: 0.85;
    }

    @keyframes float {
      0%, 100% { transform: translateY(0) scale(1); }
      50% { transform: translateY(-12px) scale(1.05); }
    }

    .alert-text {
      flex: 1;
      min-width: 0;
    }

    .alert-main-text {
      color: var(--alert-text-color, #fff);
      font-size: 42px;
      font-weight: 900;
      line-height: 1.1;
      letter-spacing: 0;
      overflow-wrap: anywhere;
      text-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
      white-space: pre-wrap;
    }

    .layout-side-by-side .alert-main-text {
      text-align: left;
    }

    .alert-wrapper.alert-clean {
      max-width: 720px;
      filter: blur(8px);
      transform: translate(-50%, 0) translateY(18px) scale(0.98);
    }

    .alert-wrapper.alert-clean.active {
      filter: blur(0);
      transform: translate(-50%, 0) translateY(0) scale(1);
    }

    .alert-clean .alert-content {
      width: min(640px, calc(100vw - 96px));
      min-width: 420px;
      max-width: 640px;
      min-height: 112px;
      flex-direction: row;
      align-items: center;
      gap: 18px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.13);
      border-radius: 24px;
      background:
        linear-gradient(135deg, rgba(18, 22, 30, 0.88), rgba(12, 15, 22, 0.74)),
        radial-gradient(circle at 18% 0%, rgba(255, 255, 255, 0.12), transparent 34%);
      padding: 18px 22px;
      text-align: left;
      box-shadow:
        0 22px 70px rgba(0, 0, 0, 0.46),
        0 1px 0 rgba(255, 255, 255, 0.12) inset;
      backdrop-filter: blur(26px) saturate(165%);
      -webkit-backdrop-filter: blur(26px) saturate(165%);
    }

    .alert-clean .alert-content::before {
      content: "";
      position: absolute;
      inset: 0 auto 0 0;
      width: 5px;
      border-radius: inherit;
      background: var(--alert-accent, #38bdf8);
      box-shadow: 0 0 24px var(--alert-accent, #38bdf8);
      pointer-events: none;
    }

    .alert-clean .alert-content::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.12), transparent 42%, rgba(255, 255, 255, 0.04));
      pointer-events: none;
    }

    .clean-alert-media {
      position: relative;
      z-index: 1;
      flex: 0 0 auto;
      width: 76px;
      height: 76px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 22px;
      background:
        radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.20), transparent 36%),
        linear-gradient(135deg, rgba(255, 255, 255, 0.10), rgba(255, 255, 255, 0.03));
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.30);
    }

    .clean-alert-media::after {
      content: "";
      position: absolute;
      inset: auto 10px 8px 10px;
      height: 2px;
      border-radius: 999px;
      background: var(--alert-accent, #38bdf8);
      opacity: 0.78;
    }

    .clean-alert-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      filter: none;
      animation: none;
    }

    .clean-alert-initial {
      color: rgba(255, 255, 255, 0.92);
      font-size: 30px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: 0;
    }

    .clean-alert-body {
      position: relative;
      z-index: 1;
      flex: 1 1 auto;
      min-width: 0;
    }

    .clean-alert-topline {
      display: flex;
      align-items: center;
      gap: 9px;
      min-width: 0;
      margin-bottom: 5px;
    }

    .clean-alert-eyebrow {
      color: rgba(255, 255, 255, 0.58);
      font-size: 12px;
      font-weight: 700;
      line-height: 1;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    .clean-alert-pill {
      flex: 0 0 auto;
      border: 1px solid rgba(255, 255, 255, 0.10);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.06);
      color: rgba(255, 255, 255, 0.52);
      padding: 4px 8px;
      font-size: 11px;
      font-weight: 700;
      line-height: 1;
      letter-spacing: 0;
    }

    .clean-alert-title {
      color: #ffffff;
      font-size: 31px;
      font-weight: 760;
      line-height: 1.04;
      letter-spacing: 0;
      overflow-wrap: anywhere;
      text-shadow: 0 8px 26px rgba(0, 0, 0, 0.36);
    }

    .clean-alert-subtitle {
      margin-top: 6px;
      color: rgba(255, 255, 255, 0.70);
      font-size: 17px;
      font-weight: 560;
      line-height: 1.28;
      letter-spacing: 0;
      overflow-wrap: anywhere;
    }

    .alert-clean-gift .alert-content {
      border-color: rgba(247, 201, 72, 0.26);
    }

    .alert-clean-follow .alert-content {
      border-color: rgba(56, 189, 248, 0.24);
    }

    .alert-clean-superfan .alert-content {
      border-color: rgba(232, 121, 249, 0.26);
    }

    .exit-fade {
      opacity: 0 !important;
      filter: blur(15px);
      transform: translate(-50%, 0) translateY(20px) scale(0.9) !important;
    }

    .exit-slide {
      opacity: 0 !important;
      transform: translate(calc(-50% + 100vw), 0) !important;
    }

    .exit-tv-warp {
      animation: tv-warp 0.6s cubic-bezier(0.19, 1, 0.22, 1) forwards;
    }

    @keyframes tv-warp {
      0% { transform: translate(-50%, 0) scale(1) skew(0deg); opacity: 1; }
      20% { transform: translate(calc(-50% + 10px), 0) scale(1.1, 0.9) skew(5deg); }
      50% { transform: translate(calc(-50% - 20px), 0) scale(1.8, 0.05) skew(15deg); filter: brightness(2); }
      100% { transform: translate(-50%, 0) scale(0, 4); opacity: 0; }
    }

    .diag-overlay {
      position: fixed;
      top: 20px;
      left: 50%;
      z-index: 10000;
      transform: translateX(-50%);
      border-radius: 100px;
      background: rgba(255, 40, 40, 0.9);
      color: white;
      padding: 10px 30px;
      font-size: 14px;
      font-weight: 700;
      transition: all 0.5s;
    }

    .diag-overlay.connected {
      background: rgba(40, 255, 100, 0.9);
      color: #000;
    }

    .diag-overlay.hidden {
      opacity: 0;
      transform: translate(-50%, -100%);
    }

    /* Self-diagnosing banner that fires when the iframe viewport is too
       small to render alerts (typically the browser source was added to
       OBS / TikTok Live Studio without explicit Width/Height). Without
       this the alert renders at 1px and looks broken with no explanation. */
    .size-warning {
      position: fixed;
      inset: 8px;
      border: 2px dashed rgba(255, 200, 0, 0.6);
      border-radius: 12px;
      background: rgba(20, 16, 0, 0.88);
      color: #ffd166;
      font-family: var(--font-main);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 12px;
      z-index: 10001;
      gap: 6px;
    }
    .size-warning h1 {
      font-size: clamp(14px, 4vw, 20px);
      font-weight: 800;
      margin: 0;
      letter-spacing: -0.01em;
    }
    .size-warning p {
      font-size: clamp(11px, 2.4vw, 14px);
      line-height: 1.45;
      max-width: 520px;
      margin: 0;
    }
    .size-warning code {
      background: rgba(0, 0, 0, 0.45);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.95em;
    }
    .size-warning .current {
      opacity: 0.6;
      font-size: clamp(10px, 2vw, 12px);
    }
  </style>
</head>
<body>
  <div id="v5-alert-stage"></div>

  <script>
    const IS_PREVIEW = ${JSON.stringify(isPreview)};
    const container = document.getElementById('v5-alert-stage');
    const alertQueue = [];
    const audioQueue = [];
    const seenAlertIds = new Set();
    const playedAudioIds = new Set();
    const audioCache = new Map();
    const AUDIO_CACHE_LIMIT = 32;
    const AUDIO_PLAYBACK_MAX_MS = 30 * 1000;
    const MAX_ALERT_AGE_MS = 15 * 1000;
    const MAX_PENDING_VISUAL_ALERTS = 4;
    const MAX_PENDING_AUDIO_ALERTS = 4;
    const PLAYED_AUDIO_LIMIT = 500;
    const bootTime = Date.now() - 10000;
    let isShowing = false;
    let isPlayingAudio = false;
    let pollingTimer = null;
    let eventSource = null;
    let lastPollAt = bootTime;

    function getAlertCreatedAt(alert) {
      const createdAt = alert && alert.createdAt ? Date.parse(alert.createdAt) : Date.now();
      return Number.isNaN(createdAt) ? null : createdAt;
    }

    function markSeen(alert) {
      if (alert && alert.id) seenAlertIds.add(alert.id);
      const createdAt = getAlertCreatedAt(alert);
      if (createdAt !== null) lastPollAt = Math.max(lastPollAt, createdAt);
    }

    function shouldShow(alert) {
      if (!alert) return false;
      if (alert.id && seenAlertIds.has(alert.id)) return false;
      const createdAt = getAlertCreatedAt(alert);
      return createdAt === null || (createdAt >= bootTime && !isAlertStale(alert));
    }

    function queueAlert(alert) {
      if (!shouldShow(alert)) return;
      markSeen(alert);

      const alertHtml = String(alert.html || alert.template || '');
      const hasVisual = Boolean(getCleanAlertType(alert) || alert.imageUrl || alertHtml.trim());
      const hasAudio = Boolean(alert.audioUrl);

      if (hasVisual) {
        queueVisualAlert(alert);
      } else if (hasAudio) {
        // Join sounds and other audio-only items have their own lane. They can
        // never occupy the visual queue or delay the next on-screen alert.
        queueAlertAudio(alert);
      }
    }

    function isAlertStale(alert) {
      const createdAt = getAlertCreatedAt(alert);
      return createdAt !== null && Date.now() - createdAt > MAX_ALERT_AGE_MS;
    }

    function removeStaleQueuedAlerts(queue, label) {
      for (let index = queue.length - 1; index >= 0; index -= 1) {
        if (!isAlertStale(queue[index])) continue;
        const stale = queue.splice(index, 1)[0];
        console.warn('[alerts] Dropping stale ' + label + ' alert: ' + String(stale && stale.id || 'unknown'));
      }
    }

    function queueVisualAlert(alert) {
      if (!isShowing) {
        showAlert(alert);
        return;
      }

      removeStaleQueuedAlerts(alertQueue, 'visual');
      if (alertQueue.length >= MAX_PENDING_VISUAL_ALERTS) {
        const dropped = alertQueue.shift();
        console.warn('[alerts] Visual queue full; dropping oldest pending alert: ' + String(dropped && dropped.id || 'unknown'));
      }
      alertQueue.push(alert);
    }

    function rememberLimited(set, value, limit) {
      if (!value) return;
      if (set.has(value)) set.delete(value);
      set.add(value);
      while (set.size > limit) {
        const oldest = set.values().next().value;
        set.delete(oldest);
      }
    }

    function getAudioKey(alert) {
      if (!alert || !alert.audioUrl) return '';
      return String(alert.id || alert.createdAt || '') + ':' + String(alert.audioUrl);
    }

    function prepareAlertAudio(url) {
      if (!url) return null;

      let cached = audioCache.get(url);
      if (!cached) {
        cached = new Audio(url);
        cached.preload = 'auto';
        audioCache.set(url, cached);

        try {
          cached.load();
        } catch (error) {
          console.warn('[alerts] Audio preload failed:', error);
        }

        while (audioCache.size > AUDIO_CACHE_LIMIT) {
          const oldestKey = audioCache.keys().next().value;
          const oldestAudio = audioCache.get(oldestKey);
          audioCache.delete(oldestKey);
          try {
            oldestAudio.pause();
            oldestAudio.removeAttribute('src');
            oldestAudio.load();
          } catch {}
        }
      }

      return cached;
    }

    function playAlertAudioOnce(alert) {
      const audioKey = getAudioKey(alert);
      if (!audioKey || playedAudioIds.has(audioKey)) return Promise.resolve();
      rememberLimited(playedAudioIds, audioKey, PLAYED_AUDIO_LIMIT);
      return playAlertAudio(alert);
    }

    function queueAlertAudio(alert) {
      if (!alert || !alert.audioUrl || isAlertStale(alert)) return;

      const audioKey = getAudioKey(alert);
      if (!audioKey || playedAudioIds.has(audioKey)) return;

      if (!isPlayingAudio) {
        playNextAlertAudio(alert);
        return;
      }

      removeStaleQueuedAlerts(audioQueue, 'audio');
      if (audioQueue.length >= MAX_PENDING_AUDIO_ALERTS) {
        const dropped = audioQueue.shift();
        console.warn('[alerts] Audio queue full; dropping oldest pending alert: ' + String(dropped && dropped.id || 'unknown'));
      }
      audioQueue.push(alert);
    }

    function playNextAlertAudio(alert) {
      if (!alert || isAlertStale(alert)) {
        return finishAlertAudio();
      }

      isPlayingAudio = true;
      Promise.resolve(playAlertAudioOnce(alert)).then(finishAlertAudio, function(error) {
        console.error('[alerts] Audio lane failed:', error);
        finishAlertAudio();
      });
    }

    function finishAlertAudio() {
      removeStaleQueuedAlerts(audioQueue, 'audio');
      const next = audioQueue.shift();
      if (next) {
        playNextAlertAudio(next);
      } else {
        isPlayingAudio = false;
      }
    }

    function playAlertAudio(alert) {
      if (!alert.audioUrl) return Promise.resolve();

      const preparedAudio = prepareAlertAudio(alert.audioUrl);
      const audio = preparedAudio ? preparedAudio.cloneNode(true) : new Audio(alert.audioUrl);
      audio.preload = 'auto';
      audio.volume = clampNumber(alert.audioVolume, 0, 1, 1);

      return new Promise(function(resolve) {
        let settled = false;
        const watchdog = setTimeout(function() {
          console.warn('[alerts] Audio exceeded queue timeout; stopping it so the queue can continue.');
          cleanup(true);
        }, AUDIO_PLAYBACK_MAX_MS);

        function cleanup(stopPlayback) {
          if (settled) return;
          settled = true;
          clearTimeout(watchdog);
          try {
            if (stopPlayback) audio.pause();
            audio.removeAttribute('src');
            audio.load();
          } catch {}
          resolve();
        }

        audio.addEventListener('ended', function() { cleanup(false); }, { once: true });
        audio.addEventListener('error', function() { cleanup(true); }, { once: true });
        audio.play().catch(function(error) {
          cleanup(true);
          console.error('[alerts] Audio failed:', error);
        });
      });
    }

    function showAlert(alert) {
      isShowing = true;
      queueAlertAudio(alert);

      const alertHtml = String(alert.html || alert.template || '');
      const cleanAlertType = getCleanAlertType(alert);
      const hasVisual = Boolean(cleanAlertType || alert.imageUrl || alertHtml.trim());

      if (!hasVisual) return finishAlert();

      let wrapper = null;

      if (hasVisual) {
        const layout = normalizeLayout(alert.layout);
        const animationIn = normalizeAnimationIn(alert.animationIn);
        const isCyber = !cleanAlertType && (alert.borderColor === 'gradient' || alert.isCyber);
        wrapper = document.createElement('div');
        wrapper.className = cleanAlertType
          ? 'alert-wrapper alert-clean alert-clean-' + cleanAlertType + ' anim-' + animationIn
          : 'alert-wrapper layout-' + layout + ' anim-' + animationIn + (isCyber ? ' cyber-border' : '');
        wrapper.style.setProperty('--alert-left', clampNumber(alert.alertLeft, 0, 100, 50) + '%');
        wrapper.style.setProperty('--alert-top', clampNumber(alert.alertTop, 0, 100, 10) + '%');
        if (cleanAlertType) {
          wrapper.style.setProperty('--alert-accent', safeCssValue(alert.accentColor, getCleanAlertAccent(cleanAlertType)));
        }

        const alertContent = document.createElement('div');
        alertContent.className = 'alert-content';
        if (!cleanAlertType) {
          applyCardStyle(alertContent, alert, isCyber);
        }

        const innerHtml = [];

        if (cleanAlertType) {
          innerHtml.push(renderCleanAlert(alert, cleanAlertType));
        } else if (layout !== 'text-only' && alert.imageUrl) {
          const imageLeft = clampNumber(alert.imageLeft, -1000, 1000, 0);
          const imageTop = clampNumber(alert.imageTop, -1000, 1000, 0);
          const imageSize = clampNumber(alert.imageSize, 0, 1024, 0);
          const imageStyle = imageSize > 0 ? ' style="width: ' + imageSize + 'px; height: ' + imageSize + 'px"' : '';
          innerHtml.push('<div class="alert-image-container" style="transform: translate(' + imageLeft + 'px, ' + imageTop + 'px)">');
          innerHtml.push('  <img class="alert-image"' + imageStyle + ' src="' + escapeAttr(window.__ilyAvatar.proxy(alert.imageUrl, alert.id || alert.createdAt)) + '" alt="" />');
          innerHtml.push('</div>');
        }

        if (!cleanAlertType && layout !== 'image-only') {
          const fontSize = clampNumber(alert.fontSize, 12, 180, layout === 'side-by-side' ? 34 : 42);
          const fontWeight = clampNumber(alert.fontWeight, 100, 1000, 900);
          const placement = normalizeImagePlacement(alert.imagePlacement);
          const effectiveRow = placement ? (placement === 'left' || placement === 'right') : layout === 'side-by-side';
          const textAlign = normalizeTextAlign(alert.textAlign) || (effectiveRow ? 'left' : 'center');
          const textStyle = [
            'font-size: ' + fontSize + 'px',
            'color: ' + safeCssValue(alert.textColor, 'var(--alert-text-color)'),
            'text-shadow: ' + safeCssValue(alert.textShadow, '0 4px 15px rgba(0,0,0,0.5)'),
            'font-weight: ' + fontWeight,
            'text-align: ' + textAlign
          ].join('; ');

          innerHtml.push('<div class="alert-text">');
          innerHtml.push('  <div class="alert-main-text" style="' + escapeAttr(textStyle) + '">');
          innerHtml.push('    ' + (alert.html || alert.template || ''));
          innerHtml.push('  </div>');
          innerHtml.push('</div>');
        }

        alertContent.innerHTML = innerHtml.join('');
        wrapper.appendChild(alertContent);
        container.appendChild(wrapper);

        // Surface image load failures instead of leaving a silent gap. If the
        // <img> 404s (commonly a stale OBS browser-source cache from before the
        // asset was uploaded), log the URL and swap in a visible error tile.
        const alertImg = alertContent.querySelector('.alert-image');
        if (alertImg) {
          let imageSettled = false;
          const handleImageLoaded = function() {
            if (imageSettled) return;
            imageSettled = true;
            console.log('[alerts] image loaded: ' + alertImg.getAttribute('src'));
          };
          const handleImageFailed = function() {
            if (imageSettled) return;
            imageSettled = true;
            const failedSrc = alertImg.getAttribute('src') || '';
            console.error('[alerts] image FAILED to load: ' + failedSrc +
              ' — check the asset exists and the overlay server can reach it.');
            const box = alertImg.closest('.alert-image-container');
            if (box) {
              box.classList.add('alert-image-failed');
              box.setAttribute('data-image-error', failedSrc);
            }
          };
          alertImg.addEventListener('load', handleImageLoaded, { once: true });
          alertImg.addEventListener('error', handleImageFailed, { once: true });

          // OBS can satisfy a cached image synchronously while innerHTML is
          // being assigned, before the listeners above exist.
          if (alertImg.complete) {
            if (alertImg.naturalWidth > 0) handleImageLoaded();
            else handleImageFailed();
          }
        }

        setTimeout(function() {
          if (wrapper) wrapper.classList.add('active');
        }, 50);
      }

      setTimeout(function() {
        if (wrapper) {
          wrapper.classList.add('exit-' + normalizeAnimationOut(alert.animationOut));
          wrapper.classList.remove('active');
        }

        setTimeout(function() {
          if (wrapper) wrapper.remove();
          finishAlert();
        }, 600);
      }, clampNumber(alert.durationMs, 1000, 30000, 5000));

      function finishAlert() {
        isShowing = false;
        removeStaleQueuedAlerts(alertQueue, 'visual');
        const next = alertQueue.shift();
        if (next) showAlert(next);
      }
    }

    const diag = null;

    function setDiag(text, connected) {
      console.log('[alerts-diag]', text, connected ? '(connected)' : '(error)');
      if (!diag) return;
      diag.textContent = text;
      diag.classList.toggle('connected', connected);
      if (connected) {
        setTimeout(function() { diag.classList.add('hidden'); }, 1500);
      } else {
        diag.classList.remove('hidden');
      }
    }

    function requestJson(url) {
      var runtime = window.__ilystreamOverlayRuntime;
      if (runtime && typeof runtime.requestJson === 'function') {
        return runtime.requestJson(url);
      }
      return fetch(url, { cache: 'no-store' }).then(function(response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      });
    }

    async function pollAlertState(seedOnly) {
      try {
        const url = '/overlay/alerts/state?since=' + encodeURIComponent(String(seedOnly ? 0 : lastPollAt));
        const alerts = await requestJson(url);
        if (!Array.isArray(alerts)) return;

        let newestSeenAt = lastPollAt;
        for (const alert of alerts) {
          const createdAt = getAlertCreatedAt(alert);
          if (createdAt !== null) {
            newestSeenAt = Math.max(newestSeenAt, createdAt);
          }

          if (seedOnly && createdAt !== null && createdAt < bootTime) {
            markSeen(alert);
          } else {
            queueAlert(alert);
          }
        }
        lastPollAt = newestSeenAt;
      } catch (error) {
        console.error('[alerts] Poll failed:', error);
      }
    }

    function startPolling(seedOnly) {
      if (pollingTimer) return;
      console.log('[alerts] Starting fallback polling...');
      pollAlertState(seedOnly);
      pollingTimer = setInterval(function() { pollAlertState(false); }, 2000);
    }

    function stopPolling() {
      if (!pollingTimer) return;
      clearInterval(pollingTimer);
      pollingTimer = null;
    }

    function connectEventStream() {
      const origin = window.location.origin;
      const sseUrl = origin + '/overlay/events?channel=alerts';

      console.log('[alerts] Initializing connection to:', origin);
      setDiag('CONNECTING TO SERVER...', false);

      if (typeof EventSource !== 'function') {
        console.warn('[alerts] EventSource not supported, falling back to polling.');
        setDiag('SSE NOT SUPPORTED - USING POLLING', true);
        startPolling(true);
        return;
      }

      try {
        eventSource = new EventSource(sseUrl);

        eventSource.onopen = function() {
          setDiag('CONNECTED! READY FOR ALERTS', true);
          stopPolling();
          pollAlertState(true);
        };

        eventSource.onmessage = function(event) {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'append') {
              queueAlert(data.payload);
            } else if (data.type === 'snapshot' && Array.isArray(data.payload)) {
              data.payload.forEach(markSeen);
            } else if (data.type === 'reload') {
              window.location.reload();
            }
          } catch (error) {
            console.error('[alerts] Bad event payload:', error);
          }
        };

        eventSource.onerror = function() {
          requestJson('/overlay/health').then(function() {
            setDiag('SSE BLOCKED - USING POLLING', true);
          }).catch(function() {
            setDiag('SERVER OFFLINE', false);
          });
          startPolling(false);
        };
      } catch (error) {
        console.error('[alerts] Event stream setup failed:', error);
        setDiag('CONNECTION FAILED', false);
        startPolling(true);
      }
    }

    function normalizeLayout(layout) {
      if (layout === 'above-below') return 'stacked';
      if (layout === 'side-by-side' || layout === 'text-only' || layout === 'image-only') return layout;
      return 'stacked';
    }

    function normalizeImagePlacement(value) {
      if (value === 'left' || value === 'right' || value === 'top' || value === 'bottom') return value;
      return '';
    }

    function normalizeTextAlign(value) {
      if (value === 'left' || value === 'center' || value === 'right') return value;
      return '';
    }

    // Widget-level blur in px, pre-scaling; per-alert frost scales from this.
    const BASE_BLUR_PX = ${blur};

    // Mirrors composeAlertBackground in src/shared/alert-rules.ts: combine the
    // rule's background color with its 0–100 opacity slider. Opacity -1 (or
    // absent) keeps whatever alpha the color string itself carries.
    function composeBackground(color, opacityPercent) {
      const parsed = parseCssColor(typeof color === 'string' ? color : '');
      if (!parsed) return { css: null, alpha: null };
      const pct = Number(opacityPercent);
      const alpha = Number.isFinite(pct) && pct >= 0
        ? Math.min(100, Math.max(0, pct)) / 100
        : parsed.alpha;
      return {
        css: 'rgba(' + parsed.r + ', ' + parsed.g + ', ' + parsed.b + ', ' + (Math.round(alpha * 1000) / 1000) + ')',
        alpha: alpha
      };
    }

    function parseCssColor(value) {
      const raw = value.trim();
      const hexMatch = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
      if (hexMatch) {
        let hex = hexMatch[1];
        if (hex.length === 3) hex = hex.split('').map(function(c) { return c + c; }).join('');
        return {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16),
          alpha: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
        };
      }
      const rgbMatch = raw.match(/^rgba?\\(\\s*(\\d{1,3})\\s*,\\s*(\\d{1,3})\\s*,\\s*(\\d{1,3})\\s*(?:,\\s*([0-9.]+)\\s*)?\\)$/i);
      if (rgbMatch) {
        const alpha = rgbMatch[4] === undefined ? 1 : Math.min(1, Math.max(0, Number(rgbMatch[4])));
        if (!Number.isFinite(alpha)) return null;
        return {
          r: Math.min(255, Math.max(0, Number(rgbMatch[1]))),
          g: Math.min(255, Math.max(0, Number(rgbMatch[2]))),
          b: Math.min(255, Math.max(0, Number(rgbMatch[3]))),
          alpha: alpha
        };
      }
      return null;
    }

    // Applies the rule's full card styling. Panel chrome (shadow, inner glow,
    // shine, frost) scales with the background alpha so opacity 0 renders a
    // truly invisible card instead of a ghost box of shadow and blur.
    function applyCardStyle(content, alert, isCyber) {
      const bg = composeBackground(alert.backgroundColor, alert.backgroundOpacity);
      if (bg.css) {
        content.style.background = bg.css;
      } else {
        content.style.background = safeCssValue(alert.backgroundColor, 'var(--glass-bg)');
      }

      if (bg.alpha !== null) {
        const chromeScale = Math.min(1, bg.alpha / 0.4);
        const frostScale = Math.min(1, bg.alpha * 4);
        content.style.setProperty('--card-shadow-alpha', (0.6 * chromeScale).toFixed(3));
        content.style.setProperty('--card-inner-alpha', (0.05 * chromeScale).toFixed(3));
        content.style.setProperty('--card-shine', chromeScale.toFixed(3));
        content.style.setProperty('--blur', (BASE_BLUR_PX * frostScale).toFixed(1) + 'px');
        content.style.setProperty('--card-saturate', (100 + Math.round(150 * frostScale)) + '%');
      }

      if (!isCyber) {
        content.style.borderColor = safeCssValue(alert.borderColor, 'var(--glass-border)');
      }

      const borderWidth = Number(alert.borderWidth);
      if (Number.isFinite(borderWidth)) {
        const width = Math.min(20, Math.max(0, borderWidth));
        content.style.borderWidth = width + 'px';
        content.style.setProperty('--cyber-width', Math.max(1, width) + 'px');
      }

      const radius = Number(alert.borderRadius);
      if (Number.isFinite(radius) && radius >= 0) {
        content.style.borderRadius = Math.min(200, radius) + 'px';
      }

      const paddingX = Number(alert.paddingX);
      const paddingY = Number(alert.paddingY);
      if ((Number.isFinite(paddingX) && paddingX >= 0) || (Number.isFinite(paddingY) && paddingY >= 0)) {
        const px = Number.isFinite(paddingX) && paddingX >= 0 ? Math.min(300, paddingX) : 50;
        const py = Number.isFinite(paddingY) && paddingY >= 0 ? Math.min(300, paddingY) : 35;
        content.style.padding = py + 'px ' + px + 'px';
      }

      const placement = normalizeImagePlacement(alert.imagePlacement);
      if (placement) {
        content.style.flexDirection =
          placement === 'left' ? 'row' :
          placement === 'right' ? 'row-reverse' :
          placement === 'top' ? 'column' : 'column-reverse';
      }
    }

    function getCleanAlertType(alert) {
      if (!alert) return '';
      if (alert.variant === 'clean-gift') return 'gift';
      if (alert.variant === 'clean-follow') return 'follow';
      if (alert.variant === 'clean-superfan') return 'superfan';
      if (alert.variant === 'clean-like-milestone') return 'like-milestone';
      return '';
    }

    function getCleanAlertAccent(cleanAlertType) {
      if (cleanAlertType === 'gift') return '#f7c948';
      if (cleanAlertType === 'superfan') return '#e879f9';
      if (cleanAlertType === 'like-milestone') return '#fe2c55';
      return '#38bdf8';
    }

    function renderCleanAlert(alert, cleanAlertType) {
      const headline = String(alert.headline || textFromHtml(alert.html) || 'Viewer');
      const fallbackSubtitle = cleanAlertType === 'gift'
        ? 'sent a gift'
        : cleanAlertType === 'superfan'
          ? 'joined the community'
          : cleanAlertType === 'like-milestone'
            ? 'reached a like milestone'
          : 'started following';
      const fallbackEyebrow = cleanAlertType === 'gift'
        ? 'Gift received'
        : cleanAlertType === 'superfan'
          ? 'Super fan'
          : cleanAlertType === 'like-milestone'
            ? 'Like milestone'
          : 'New follower';
      const subtitle = String(alert.subtitle || textFromHtml(alert.html) || fallbackSubtitle);
      const eyebrow = String(alert.eyebrow || fallbackEyebrow);
      const meta = String(alert.meta || platformLabel(alert.platform));
      const initial = (headline.trim().charAt(0) || 'V').toUpperCase();
      const media = alert.imageUrl
        ? '<img class="clean-alert-image" data-name="' + escapeAttr(headline) + '" src="' + escapeAttr(window.__ilyAvatar.resolve(alert.imageUrl, headline, alert.id || alert.createdAt)) + '" alt="" onerror="window.__ilyAvatar.fallbackImage(this, this.dataset.name)" />'
        : '<span class="clean-alert-initial">' + escapeHtml(initial) + '</span>';

      return ''
        + '<div class="clean-alert-media">' + media + '</div>'
        + '<div class="clean-alert-body">'
        + '  <div class="clean-alert-topline">'
        + '    <span class="clean-alert-eyebrow">' + escapeHtml(eyebrow) + '</span>'
        + (meta ? '    <span class="clean-alert-pill">' + escapeHtml(meta) + '</span>' : '')
        + '  </div>'
        + '  <div class="clean-alert-title">' + escapeHtml(headline) + '</div>'
        + '  <div class="clean-alert-subtitle">' + escapeHtml(subtitle) + '</div>'
        + '</div>';
    }

    function platformLabel(platform) {
      switch (platform) {
        case 'tiktok': return 'TikTok';
        case 'twitch': return 'Twitch';
        case 'youtube': return 'YouTube';
        case 'kick': return 'Kick';
        default: return platform ? String(platform) : '';
      }
    }

    function textFromHtml(html) {
      const el = document.createElement('div');
      el.innerHTML = String(html || '');
      return el.textContent || el.innerText || '';
    }

    function normalizeAnimationIn(animation) {
      if (animation === 'slide' || animation === 'bounce' || animation === 'zoom') return animation;
      return 'fade';
    }

    function normalizeAnimationOut(animation) {
      if (animation === 'slide' || animation === 'tv-warp') return animation;
      return 'fade';
    }

    function clampNumber(value, min, max, fallback) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return fallback;
      return Math.min(max, Math.max(min, numeric));
    }

    function safeCssValue(value, fallback) {
      if (typeof value !== 'string' || !value.trim()) return fallback;
      if (/[;{}<>]/.test(value)) return fallback;
      return value;
    }

    function escapeAttr(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    window.addEventListener('message', function(event) {
      const data = event.data;
      if (!data || data.type !== 'ilystream:preview-alert') return;
      const payload = data.payload || {};
      queueAlert({
        ...payload,
        id: payload.id || 'preview-alert-' + Date.now(),
        createdAt: new Date().toISOString()
      });
    });

    // Self-diagnosing size check. When a streamer adds this overlay as a
    // browser source in OBS / TikTok Live Studio without explicit Width /
    // Height, the iframe loads at ~1px and alerts render invisibly. Show a
    // big yellow warning when that happens so the user knows what to fix.
    // Skipped in preview mode — the WidgetEditorModal intentionally varies
    // its preview size and the message would just be noise there.
    function checkViewportSize() {
      if (IS_PREVIEW) return;
      try { window.resizeTo(1920, 1080); } catch (e) {}
      const tooSmall = window.innerWidth < 200 || window.innerHeight < 200;
      const existing = document.getElementById('alert-size-warning');
      if (existing) existing.remove();
      if (!tooSmall) return;
      const el = document.createElement('div');
      el.id = 'alert-size-warning';
      el.className = 'size-warning';
      el.innerHTML = ''
        + '<h1>Browser source too small</h1>'
        + '<p>Set this source\\'s width &amp; height to at least <code>1280 \\u00d7 720</code> '
        + '(ideally <code>1920 \\u00d7 1080</code>) so the alert can render. '
        + 'In OBS / TikTok Live Studio, right-click the source and edit its dimensions.</p>'
        + '<p class="current">Current viewport: ' + window.innerWidth + ' \\u00d7 ' + window.innerHeight + '</p>';
      document.body.appendChild(el);
    }
    window.addEventListener('load', checkViewportSize);
    window.addEventListener('resize', checkViewportSize);
    // Run once now in case load already fired (some embed environments).
    checkViewportSize();

    if (IS_PREVIEW) {
      setDiag('PREVIEW MODE', true);
      queueAlert({
        id: 'preview-alert',
        createdAt: new Date().toISOString(),
        html: '<span>MiaMoon sent 5x Galaxy!</span>',
        durationMs: 600000,
        animationIn: 'bounce',
        animationOut: 'fade',
        layout: 'stacked',
        // No backgroundColor here on purpose: the preview card falls through
        // to var(--glass-bg) so the widget editor's background color/opacity
        // sliders are visible live in the preview.
        borderColor: 'gradient',
        fontSize: 42,
        fontWeight: 900,
        textShadow: '0 4px 16px rgba(0,0,0,0.55)',
        alertTop: 14,
        alertLeft: 50
      });
    } else {
      connectEventStream();
    }
  </script>
</body>
</html>
  `;
}
