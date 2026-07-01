import { Widget } from '../../../shared/widgets'
import { getAnimationCss } from './animation-utils'

export function buildLeaderboardHtml(_widget: Widget, isPreview: boolean): string {
  const cfg = (_widget.config as any) || {}
  const glassIntensity = cfg.glassIntensity ?? 0.6
  const bgOpacity = (0.3 + (glassIntensity * 0.4))
  const blur = glassIntensity * 50
  const borderRadius = cfg.borderRadius ?? 32
  const fontFamily = cfg.fontFamily || 'Outfit'
  const accentColor = cfg.accentColor || '#ff00ff'
  const secondaryColor = cfg.secondaryColor || accentColor
  const sourceMinWidth = 440
  const sourceMinHeight = 640

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Likeathon Leaderboard</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: rgba(10, 12, 18, ${bgOpacity});
            --glass: rgba(255, 255, 255, 0.05);
            --glass-border: rgba(255, 255, 255, 0.1);
            --cyan: ${accentColor};
            --magenta: ${secondaryColor};
            --white: #ffffff;
            --radius: ${borderRadius}px;
            --font-main: "${fontFamily}", sans-serif;
            --blur: ${blur}px;
        }

        body {
            margin: 0;
            padding: 20px;
            min-width: ${sourceMinWidth}px;
            min-height: ${sourceMinHeight}px;
            font-family: var(--font-main);
            color: var(--white);
            overflow: hidden;
        }

        .container {
            width: 320px;
            background: var(--bg);
            backdrop-filter: blur(var(--blur)) saturate(220%);
            -webkit-backdrop-filter: blur(var(--blur)) saturate(220%);
            border: 1px solid var(--glass-border);
            border-radius: var(--radius);
            padding: 24px;
            box-shadow:
                0 25px 60px rgba(0, 0, 0, 0.5),
                inset 0 0 20px rgba(255, 255, 255, 0.05);
            position: relative;
            overflow: hidden;
        }

        ${getAnimationCss({
          style: cfg.animationStyle || 'fade',
          duration: 600
        }, '.container')}

        .container::after {
            content: "";
            position: absolute;
            inset: 0;
            background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(255,255,255,0.05) 100%);
            pointer-events: none;
            border-radius: inherit;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }

        .title {
            font-size: 0.9rem;
            font-weight: 800;
            letter-spacing: 0;
            text-transform: uppercase;
            background: linear-gradient(45deg, var(--cyan), var(--magenta));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .live-tag {
            font-size: 0.6rem;
            font-weight: 800;
            background: var(--magenta);
            padding: 2px 8px;
            border-radius: 10px;
            animation: pulse 2s infinite;
        }

        .list {
            display: flex;
            flex-direction: column;
            gap: 12px;
            min-height: 64px;
            position: relative;
        }

        .empty-state {
            color: rgba(255, 255, 255, 0.58);
            font-size: 0.82rem;
            font-weight: 700;
            text-align: center;
            padding: 20px 10px;
        }

        .list.has-items .empty-state {
            display: none;
        }

        .item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 15px;
            background: var(--glass);
            border-radius: 16px;
            border: 1px solid transparent;
            transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
        }

        .rank {
            font-weight: 800;
            font-size: 0.8rem;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 50%;
            color: var(--cyan);
        }

        .username {
            flex: 1;
            font-weight: 600;
            font-size: 0.95rem;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .score {
            font-family: monospace;
            font-weight: 800;
            color: var(--cyan);
            font-size: 1.1rem;
            text-shadow: 0 0 10px rgba(0, 242, 255, 0.5);
        }

        /* Top 3 Stylings */
        .item:nth-child(1) { border-color: rgba(255, 204, 0, 0.3); background: rgba(255, 204, 0, 0.05); }
        .item:nth-child(1) .rank { background: #ffcc00; color: #000; }

        .item:nth-child(2) { border-color: rgba(204, 204, 204, 0.3); background: rgba(204, 204, 204, 0.05); }
        .item:nth-child(2) .rank { background: #cccccc; color: #000; }

        .item:nth-child(3) { border-color: rgba(205, 127, 50, 0.3); background: rgba(205, 127, 50, 0.05); }
        .item:nth-child(3) .rank { background: #cd7f32; color: #000; }

        @keyframes pulse {
            0% { opacity: 0.6; transform: scale(0.95); }
            50% { opacity: 1; transform: scale(1); }
            100% { opacity: 0.6; transform: scale(0.95); }
        }

        /* List transition animations (physics simulation feel) */
        .item-enter { opacity: 0; transform: translateX(-20px); }
        .item-enter-active { opacity: 1; transform: translateX(0); }

        .size-warning {
            position: fixed;
            inset: 0;
            border: 2px dashed rgba(255, 200, 0, 0.6);
            background: rgba(20, 16, 0, 0.9);
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

        .size-warning h1 { font-size: clamp(14px, 4vw, 20px); font-weight: 800; margin: 0; }
        .size-warning p { font-size: clamp(11px, 2.4vw, 14px); line-height: 1.45; max-width: 520px; margin: 0; }
        .size-warning code { background: rgba(0, 0, 0, 0.45); padding: 2px 6px; border-radius: 4px; font-size: 0.95em; }
        .size-warning .current { opacity: 0.6; font-size: clamp(10px, 2vw, 12px); }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="title">LIKEATHON</div>
            <div class="live-tag">LIVE</div>
        </div>
        <div id="leaderboard" class="list">
            <div class="empty-state">Waiting for likes</div>
            <!-- Rankings will be injected here -->
        </div>
    </div>

    <script>
        const container = document.getElementById('leaderboard');
        const IS_PREVIEW = ${JSON.stringify(isPreview)};
        const SOURCE_MIN_WIDTH = ${sourceMinWidth};
        const SOURCE_MIN_HEIGHT = ${sourceMinHeight};
        const PREVIEW_DATA = [
            { username: 'MiaMoon', score: 12840 },
            { username: 'PixelDrew', score: 10325 },
            { username: 'GreenRoom', score: 9100 },
            { username: 'LunaLive', score: 7120 },
            { username: 'ChatHero', score: 5400 }
        ];
        let currentData = [];
        let fallbackPollingTimer = null;

        function updateLeaderboard(newData) {
            newData = Array.isArray(newData) ? newData : [];
            // Only update if data actually changed
            if (JSON.stringify(newData) === JSON.stringify(currentData)) return;
            currentData = newData;
            container.classList.toggle('has-items', newData.length > 0);

            const emptyMarkup = '<div class="empty-state">Waiting for likes</div>';
            container.innerHTML = emptyMarkup + newData.slice(0, 10).map((u, i) =>
                '<div class="item" style="transform: translateY(0); transition-delay: ' + (i * 50) + 'ms">' +
                    '<div class="rank">' + (i + 1) + '</div>' +
                    '<div class="username">' + escapeHtml(u.username || u.displayName || 'Unknown') + '</div>' +
                    '<div class="score">' + formatScore(u.score) + '</div>' +
                '</div>'
            ).join('');
        }

        function escapeHtml(value) {
            return String(value).replace(/[&<>"']/g, (char) => (
                { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
            ));
        }

        function formatScore(value) {
            const numeric = Number(value);
            return Number.isFinite(numeric) ? numeric.toLocaleString() : '0';
        }

        function checkViewportSize() {
            if (IS_PREVIEW) return;
            const existing = document.getElementById('leaderboard-size-warning');
            if (existing) existing.remove();
            const tooSmall = window.innerWidth < SOURCE_MIN_WIDTH || window.innerHeight < SOURCE_MIN_HEIGHT;
            if (!tooSmall) return;
            console.warn('[leaderboard] Browser source is smaller than the recommended ' + SOURCE_MIN_WIDTH + 'x' + SOURCE_MIN_HEIGHT + '; rendering compact instead of blocking the widget.');
        }

        function requestJson(url) {
            if (typeof fetch === 'function') {
                return fetch(url, { cache: 'no-store' }).then((res) => {
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    return res.json();
                });
            }

            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.onreadystatechange = () => {
                    if (xhr.readyState !== 4) return;
                    if (xhr.status < 200 || xhr.status >= 300) {
                        reject(new Error('HTTP ' + xhr.status));
                        return;
                    }
                    try {
                        resolve(JSON.parse(xhr.responseText || '[]'));
                    } catch (err) {
                        reject(err);
                    }
                };
                xhr.onerror = () => reject(new Error('network error'));
                xhr.send();
            });
        }

        async function hydrateLeaderboardState() {
            try {
                updateLeaderboard(await requestJson(new URL('/overlay/leaderboard/state?t=' + Date.now(), window.location.href).href));
            } catch (err) {
                console.error('[leaderboard] state hydrate failed:', err);
            }
        }

        function startFallbackPolling() {
            if (fallbackPollingTimer) return;
            hydrateLeaderboardState();
            fallbackPollingTimer = setInterval(hydrateLeaderboardState, 2000);
        }

        function stopFallbackPolling() {
            if (!fallbackPollingTimer) return;
            clearInterval(fallbackPollingTimer);
            fallbackPollingTimer = null;
        }

        function connect() {
            if (typeof EventSource !== 'function') {
                console.warn('[leaderboard] EventSource not supported, using polling fallback.');
                startFallbackPolling();
                return;
            }

            let evs = null;
            try {
                evs = new EventSource(new URL('/overlay/events?channel=leaderboard', window.location.href).href);
            } catch (err) {
                console.error('[leaderboard] SSE setup failed:', err);
                startFallbackPolling();
                return;
            }
            evs.onopen = () => {
                stopFallbackPolling();
            };
            evs.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'update') {
                        updateLeaderboard(data.data);
                    } else if (data.type === 'snapshot') {
                        updateLeaderboard(data.payload);
                    } else if (data.type === 'reload') {
                        window.location.reload();
                    }
                } catch (err) {
                    console.warn('[leaderboard] ignored malformed event', err);
                }
            };
            evs.onerror = () => {
                startFallbackPolling();
            };
        }

        window.addEventListener('load', checkViewportSize);
        window.addEventListener('resize', checkViewportSize);
        checkViewportSize();

        if (IS_PREVIEW) {
            updateLeaderboard(PREVIEW_DATA);
        } else {
            hydrateLeaderboardState();
            connect();
        }
    </script>
</body>
</html>
  `;
}
