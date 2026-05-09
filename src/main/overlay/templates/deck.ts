export function buildDeckHtml(sounds: any[] = [], actions: any[] = []): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>ilyStream Control Deck</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #050505;
            --glass: rgba(255, 255, 255, 0.03);
            --glass-border: rgba(255, 255, 255, 0.08);
            --cyan: #19c8ff;
            --magenta: #fe2c55;
            --teal: #25f4ee;
            --red: #ff3b30;
            --yellow: #ffcc00;
            --accent: #19c8ff;
        }

        * {
            box-sizing: border-box;
            -webkit-tap-highlight-color: transparent;
            -webkit-font-smoothing: antialiased;
        }

        body {
            margin: 0;
            padding: 0;
            background: var(--bg);
            color: white;
            font-family: 'Outfit', sans-serif;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            overflow-x: hidden;
            overflow-y: auto;
            user-select: none;
        }

        /* Scrollbar */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 24px 20px;
            background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);
            position: sticky;
            top: 0;
            z-index: 100;
            backdrop-filter: blur(10px);
        }

        .logo {
            font-weight: 800;
            font-size: 1.1rem;
            letter-spacing: 2px;
            text-transform: uppercase;
            background: linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.5) 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--teal);
            box-shadow: 0 0 15px var(--teal);
            animation: pulse 2s infinite;
        }

        .section-label {
            padding: 0 24px;
            margin: 20px 0 12px 0;
            font-size: 10px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 2px;
            color: rgba(255,255,255,0.2);
            display: flex;
            align-items: center;
            gap: 12px;
        }
        
        .section-label::after {
            content: '';
            height: 1px;
            flex: 1;
            background: rgba(255,255,255,0.05);
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            padding: 0 20px 20px 20px;
        }

        .card {
            aspect-ratio: 1;
            background: var(--glass);
            border: 1px solid var(--glass-border);
            border-radius: 16px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 12px;
            text-align: center;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
        }

        .card:active {
            transform: scale(0.92);
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(255,255,255,0.2);
        }

        .card svg {
            width: 24px;
            height: 24px;
            margin-bottom: 8px;
            opacity: 0.6;
        }

        .card .emoji {
            font-size: 24px;
            margin-bottom: 8px;
        }

        .card .label {
            font-weight: 700;
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: rgba(255,255,255,0.6);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            width: 100%;
        }

        /* Color Variants */
        .card.urgent { border-color: rgba(254, 44, 85, 0.3); background: rgba(254, 44, 85, 0.05); }
        .card.urgent .label { color: var(--magenta); }

        .card.action { border-color: rgba(25, 200, 255, 0.3); background: rgba(25, 200, 255, 0.05); }
        .card.action .label { color: var(--cyan); }

        .card.sound { border-color: rgba(37, 244, 238, 0.2); background: rgba(255,255,255,0.02); }
        .card.sound .label { color: rgba(255,255,255,0.4); }

        .now-playing {
            position: sticky;
            bottom: 0;
            background: rgba(10,10,10,0.9);
            backdrop-filter: blur(20px);
            border-top: 1px solid var(--glass-border);
            padding: 16px 20px;
            display: flex;
            align-items: center;
            gap: 16px;
            z-index: 100;
        }

        .album-art {
            width: 44px;
            height: 44px;
            border-radius: 8px;
            background: #111;
            object-fit: cover;
            border: 1px solid rgba(255,255,255,0.1);
        }

        .track-info {
            flex: 1;
            overflow: hidden;
        }

        .track-name {
            font-weight: 800;
            font-size: 13px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-bottom: 2px;
        }

        .track-artist {
            font-size: 10px;
            font-weight: 600;
            color: rgba(255,255,255,0.4);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        @keyframes pulse {
            0% { opacity: 0.4; }
            50% { opacity: 1; }
            100% { opacity: 0.4; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">Studio Deck</div>
        <div class="status-dot"></div>
    </div>

    <div class="section-label">Studio Actions</div>
    <div class="grid">
        ${actions.map(a => `
            <div class="card action" onclick="triggerAction('${a.id}')">
                <div class="emoji">${a.icon || '⚡'}</div>
                <div class="label">${a.name}</div>
            </div>
        `).join('')}
        <div class="card" onclick="window.location.reload()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
            <div class="label">Reload</div>
        </div>
    </div>

    <div class="section-label">Sound Library</div>
    <div class="grid">
        ${sounds.length === 0 ? `
            <div style="grid-column: span 3; padding: 40px 20px; text-align: center; color: rgba(255,255,255,0.2); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; border: 1px dashed rgba(255,255,255,0.05); border-radius: 16px;">
                No sounds uploaded
            </div>
        ` : sounds.map(s => `
            <div class="card sound" onclick="triggerAction('PLAY_SOUND', '${s.id}')">
                <div class="emoji">${s.emoji || '🔊'}</div>
                <div class="label">${s.name.split('.')[0]}</div>
            </div>
        `).join('')}
    </div>

    <div style="height: 40px;"></div>

    <div class="now-playing" id="spotify-bar" style="display: none;">
        <img class="album-art" id="art" src="" alt="">
        <div class="track-info">
            <div class="track-name" id="track-name">Not Playing</div>
            <div class="track-artist" id="artist-name">---</div>
        </div>
        <button onclick="triggerAction('SKIP_TRACK')" style="background: none; border: none; color: white; opacity: 0.5; padding: 10px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 20px; height: 20px; margin: 0;"><path d="m5 4 10 8-10 8V4ZM19 5v14"/></svg>
        </button>
    </div>

    <script>
        async function triggerAction(type, payload = null) {
            try {
                const body = { type };
                if (payload) body.payload = payload;
                
                const response = await fetch('/overlay/deck/action' + window.location.search, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const result = await response.json();
                if (!result.success) console.error('Action failed:', result.error);
                
                // Haptic feedback if available
                if (window.navigator && window.navigator.vibrate) {
                    window.navigator.vibrate(15);
                }
            } catch (err) {
                console.error('Network error:', err);
            }
        }

        function connectSSE() {
            // Listen to both now-playing (for the bar) and deck (for real-time UI updates)
            const evs = new EventSource('/overlay/events?channel=now-playing,deck');
            
            evs.onmessage = (event) => {
                const data = JSON.parse(event.data);
                
                if (data.type === 'snapshot' || data.type === 'update') {
                    updateSpotify(data.payload);
                } else if (data.type === 'reload') {
                    // Server notified us of a structural change (new sound, emoji change, etc)
                    console.log('Deck update received, reloading...');
                    window.location.reload();
                }
            };
            
            evs.onerror = () => {
                evs.close();
                setTimeout(connectSSE, 3000);
            };
        }

        function updateSpotify(payload) {
            const bar = document.getElementById('spotify-bar');
            if (!payload || !payload.trackId) {
                bar.style.display = 'none';
                return;
            }
            bar.style.display = 'flex';
            document.getElementById('track-name').textContent = payload.trackName;
            document.getElementById('artist-name').textContent = payload.artistName;
            document.getElementById('art').src = payload.albumArtUrl || '';
        }

        connectSSE();
    </script>
</body>
</html>
  `;
}
