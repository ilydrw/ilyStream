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
            letter-spacing: 2px;
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
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="title">LIKEATHON</div>
            <div class="live-tag">LIVE</div>
        </div>
        <div id="leaderboard" class="list">
            <!-- Rankings will be injected here -->
        </div>
    </div>

    <script>
        const container = document.getElementById('leaderboard');
        let currentData = [];

        function updateLeaderboard(newData) {
            // Only update if data actually changed
            if (JSON.stringify(newData) === JSON.stringify(currentData)) return;
            currentData = newData;

            container.innerHTML = newData.slice(0, 10).map((u, i) =>
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

        function connect() {
            const evs = new EventSource('/overlay/events?channel=leaderboard');
            evs.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'update') {
                    updateLeaderboard(data.data);
                }
            };
            evs.onerror = () => {
                evs.close();
                setTimeout(connect, 2000);
            };
        }

        connect();
    </script>
</body>
</html>
  `;
}
