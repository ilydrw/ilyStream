import { Widget } from '../../../shared/widgets'

export function buildAlertsOverlayHtml(_widget: Widget, isPreview: boolean): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ilyStream Alerts</title>
  <style>
    :root {
      --cyber-blue: #00f2ff;
      --cyber-pink: #ff00e5;
      --glass-bg: rgba(10, 12, 18, 0.5);
      --glass-border: rgba(255, 255, 255, 0.15);
      --liquid-shine: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(255,255,255,0.05) 100%);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    html,
    body {
      width: 100vw;
      height: 100vh;
      margin: 0;
      padding: 0;
      background: transparent !important;
      overflow: hidden;
      font-family: Inter, "Segoe UI", Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      text-rendering: geometricPrecision;
    }

    #v5-alert-stage {
      position: relative;
      width: 100vw;
      height: 100vh;
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
      border: 1px solid var(--glass-border);
      border-radius: 40px;
      background: var(--glass-bg);
      padding: 35px 50px;
      text-align: center;
      box-shadow:
        0 30px 80px rgba(0, 0, 0, 0.6),
        inset 0 0 30px rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(50px) saturate(250%);
      -webkit-backdrop-filter: blur(50px) saturate(250%);
    }

    .alert-content::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: var(--liquid-shine);
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
      inset: -3px;
      border-radius: 35px;
      padding: 3px;
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
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .alert-image {
      width: 200px;
      height: 200px;
      object-fit: contain;
      filter: drop-shadow(0 15px 40px rgba(0, 0, 0, 0.6));
      animation: float 3s ease-in-out infinite;
    }

    .layout-side-by-side .alert-image {
      width: 120px;
      height: 120px;
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
      color: #fff;
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
  </style>
</head>
<body>
  <div id="diag" class="diag-overlay">DISCONNECTED</div>
  <div id="v5-alert-stage"></div>
  <div id="keep-alive" style="width:1px;height:1px;position:absolute;bottom:0;right:0;background:rgba(255,255,255,0.005);animation:rendering-heartbeat 2s infinite;"></div>

  <script>
    const IS_PREVIEW = ${JSON.stringify(isPreview)};
    const container = document.getElementById('v5-alert-stage');
    const alertQueue = [];
    const seenAlertIds = new Set();
    const bootTime = Date.now() - 10000;
    let isShowing = false;
    let pollingTimer = null;
    let eventSource = null;
    let lastPollAt = bootTime;

    function markSeen(alert) {
      if (alert && alert.id) seenAlertIds.add(alert.id);
    }

    function shouldShow(alert) {
      if (!alert || !alert.id) return true;
      if (seenAlertIds.has(alert.id)) return false;
      const createdAt = alert.createdAt ? Date.parse(alert.createdAt) : Date.now();
      return Number.isNaN(createdAt) || createdAt >= bootTime;
    }

    function queueAlert(alert) {
      if (!shouldShow(alert)) return;
      markSeen(alert);
      showAlert(alert);
    }

    function playAlertAudio(alert) {
      if (!alert.audioUrl) return;

      const audio = new Audio(alert.audioUrl);
      audio.volume = clampNumber(alert.audioVolume, 0, 1, 1);
      audio.play().catch(function(error) { console.error('[alerts] Audio failed:', error); });
    }

    function showAlert(alert) {
      if (isShowing) {
        alertQueue.push(alert);
        return;
      }

      isShowing = true;
      const alertHtml = String(alert.html || alert.template || '');
      const hasVisual = Boolean(alert.imageUrl || alertHtml.trim());

      if (!hasVisual) {
        playAlertAudio(alert);
        isShowing = false;
        if (alertQueue.length > 0) {
          showAlert(alertQueue.shift());
        }
        return;
      }

      const layout = normalizeLayout(alert.layout);
      const animationIn = normalizeAnimationIn(alert.animationIn);
      const isCyber = alert.borderColor === 'gradient' || alert.isCyber;
      const wrapper = document.createElement('div');
      wrapper.className = 'alert-wrapper layout-' + layout + ' anim-' + animationIn + (isCyber ? ' cyber-border' : '');
      wrapper.style.setProperty('--alert-left', clampNumber(alert.alertLeft, 0, 100, 50) + '%');
      wrapper.style.setProperty('--alert-top', clampNumber(alert.alertTop, 0, 100, 10) + '%');

      const alertContent = document.createElement('div');
      alertContent.className = 'alert-content';
      alertContent.style.background = safeCssValue(alert.backgroundColor, 'var(--glass-bg)');
      if (!isCyber) {
        alertContent.style.borderColor = safeCssValue(alert.borderColor, 'var(--glass-border)');
      }

      const innerHtml = [];

      if (layout !== 'text-only' && alert.imageUrl) {
        const imageLeft = clampNumber(alert.imageLeft, -1000, 1000, 0);
        const imageTop = clampNumber(alert.imageTop, -1000, 1000, 0);
        innerHtml.push('<div class="alert-image-container" style="transform: translate(' + imageLeft + 'px, ' + imageTop + 'px)">');
        innerHtml.push('  <img class="alert-image" src="' + escapeAttr(alert.imageUrl) + '" alt="" />');
        innerHtml.push('</div>');
      }

      if (layout !== 'image-only') {
        const fontSize = clampNumber(alert.fontSize, 12, 180, layout === 'side-by-side' ? 34 : 42);
        const fontWeight = clampNumber(alert.fontWeight, 100, 1000, 900);
        const textStyle = [
          'font-size: ' + fontSize + 'px',
          'color: ' + safeCssValue(alert.textColor, '#ffffff'),
          'text-shadow: ' + safeCssValue(alert.textShadow, '0 4px 15px rgba(0,0,0,0.5)'),
          'font-weight: ' + fontWeight
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

      playAlertAudio(alert);

      setTimeout(function() {
        wrapper.classList.add('active');
      }, 50);

      setTimeout(function() {
        wrapper.classList.add('exit-' + normalizeAnimationOut(alert.animationOut));
        wrapper.classList.remove('active');

        setTimeout(function() {
          wrapper.remove();
          isShowing = false;
          if (alertQueue.length > 0) {
            showAlert(alertQueue.shift());
          }
        }, 600);
      }, clampNumber(alert.durationMs, 1000, 30000, 5000));
    }

    const diag = document.getElementById('diag');

    function setDiag(text, connected) {
      if (!diag) return;
      console.log('[alerts-diag]', text, connected ? '(connected)' : '(error)');
      diag.textContent = text;
      diag.classList.toggle('connected', connected);
      if (connected) {
        setTimeout(function() { diag.classList.add('hidden'); }, 1500);
      } else {
        diag.classList.remove('hidden');
      }
    }

    async function pollAlertState(seedOnly) {
      try {
        const url = '/overlay/alerts/state?since=' + encodeURIComponent(String(seedOnly ? 0 : lastPollAt));
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
          console.warn('[alerts] Poll failed with status:', response.status);
          return;
        }

        const alerts = await response.json();
        if (!Array.isArray(alerts)) return;

        let newestSeenAt = lastPollAt;
        for (const alert of alerts) {
          const createdAt = alert.createdAt ? Date.parse(alert.createdAt) : Date.now();
          if (!Number.isNaN(createdAt)) {
            newestSeenAt = Math.max(newestSeenAt, createdAt);
          }

          if (seedOnly && !Number.isNaN(createdAt) && createdAt < bootTime) {
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
          startPolling(true);
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
          fetch('/overlay/health').then(function(response) {
            setDiag(response.ok ? 'SSE BLOCKED - USING POLLING' : 'SERVER UNREACHABLE', response.ok);
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

    if (IS_PREVIEW) {
      setDiag('PREVIEW MODE', true);
    } else {
      connectEventStream();
    }
  </script>
</body>
</html>
  `;
}
