import { ChatConfig, DEFAULT_CHAT_CONFIG } from '../../../shared/widgets'

export function buildChatWidgetHtml(widget?: any, isPreview = false): string {
  const cfg: ChatConfig = { ...DEFAULT_CHAT_CONFIG, ...(widget?.config || {}) }
  const bgOpacity = isPreview ? 0 : Math.min(1, Math.max(0, cfg.backgroundOpacity))

  return `
<!DOCTYPE html>
<html lang="en" style="background: transparent !important; background-color: transparent !important;">
<head>
    <meta charset="UTF-8">
    <title>ilyStream Unified Chat</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --glass: rgba(10, 12, 16, ${bgOpacity});
            --glass-border: rgba(255, 255, 255, 0.12);
            --cyan: #00f2ff;
            --magenta: #ff00ff;
            --twitch: #9146ff;
            --youtube: #ff0000;
            --tiktok: #00f2ea;
            --kick: #53fc18;
            --font-size: ${Math.max(16, cfg.fontSize)}px;
            --width: ${cfg.width}px;
        }

        body {
            margin: 0;
            padding: 24px;
            font-family: 'Outfit', sans-serif;
            color: white;
            height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
            overflow: hidden;
            background: transparent;
            /* Force GPU acceleration and keep-alive for embedded browsers */
            transform: translateZ(0);
            animation: keep-alive 10s infinite linear;
        }

        @keyframes keep-alive {
            0% { filter: brightness(1); }
            50% { filter: brightness(1.01); }
            100% { filter: brightness(1); }
        }

        #v2-chat-feed {
            display: flex;
            flex-direction: column;
            gap: 12px;
            mask-image: linear-gradient(to bottom, transparent, black 15%);
            padding-top: 60px;
            width: min(var(--width), 100%);
            transition: all 0.3s ease;
        }

        .message {
            background: var(--glass);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid var(--glass-border);
            padding: 14px 18px;
            border-radius: 20px;
            display: flex;
            align-items: flex-start;
            gap: 14px;
            animation: slideIn 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28);
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            will-change: transform, opacity;
            transform: translateZ(0);
        }

        .message.fading-out {
            animation: fadeOut 0.5s ease forwards;
        }

        @keyframes fadeOut {
            from { opacity: 1; transform: translateY(0) scale(1); }
            to { opacity: 0; transform: translateY(-10px) scale(0.9); }
        }

        .empty-placeholder {
            opacity: 0.4;
            font-size: 13px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 3px;
            text-align: center;
            width: 100%;
            padding: 50px;
            border: 2px dashed rgba(255,255,255,0.08);
            border-radius: 24px;
            color: rgba(255,255,255,0.6);
        }

        @keyframes slideIn {
            from { opacity: 0; transform: translateX(-30px) scale(0.9); }
            to { opacity: 1; transform: translateX(0) scale(1); }
        }

        .platform-icon {
            width: 20px;
            height: 20px;
            margin-top: 3px;
            filter: drop-shadow(0 0 5px currentColor);
        }

        .content-box {
            flex: 1;
            min-width: 0;
        }

        .username {
            font-weight: 800;
            font-size: calc(var(--font-size) * 0.85);
            margin-bottom: 4px;
            display: flex;
            align-items: center;
            gap: 8px;
            text-shadow: 0 2px 4px rgba(0,0,0,0.5);
        }

        .text {
            font-size: var(--font-size);
            line-height: 1.4;
            word-wrap: break-word;
            opacity: 1;
            font-weight: 600;
            text-shadow: 0 2px 8px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,1);
            letter-spacing: -0.01em;
        }

        /* Featured Message Pop-up */
        #featured-overlay {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 80%;
            max-width: 800px;
            z-index: 9999;
            pointer-events: none;
            display: none;
        }

        .featured-card {
            background: rgba(15, 17, 21, 0.9);
            backdrop-filter: blur(40px);
            border: 2px solid var(--cyan);
            border-radius: 32px;
            padding: 40px;
            box-shadow: 0 0 100px rgba(0, 242, 255, 0.2);
            animation: featuredIn 0.8s cubic-bezier(0.19, 1, 0.22, 1);
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
        }

        @keyframes featuredIn {
            0% { opacity: 0; transform: translateY(100px) scale(0.8) rotateX(20deg); }
            100% { opacity: 1; transform: translateY(0) scale(1) rotateX(0); }
        }

        .featured-username {
            font-size: 1.5rem;
            font-weight: 800;
            margin-bottom: 20px;
            color: var(--cyan);
            text-transform: uppercase;
            letter-spacing: 4px;
        }

        .featured-text {
            font-size: 2.5rem;
            font-weight: 600;
            line-height: 1.2;
        }

        .featured-platform {
            margin-top: 30px;
            opacity: 0.6;
            font-weight: 800;
            font-size: 0.8rem;
            letter-spacing: 2px;
        }

        /* Event Emphasis */
        .message.gift {
            border-color: rgba(255, 215, 0, 0.3);
            background: linear-gradient(90deg, var(--glass), rgba(255, 215, 0, 0.05));
        }
        .message.follow {
            border-color: rgba(0, 242, 255, 0.3);
            background: linear-gradient(90deg, var(--glass), rgba(0, 242, 255, 0.05));
        }
        .message.emphasis {
            box-shadow: 0 0 20px rgba(0, 242, 255, 0.1);
        }
    </style>
</head>
<body>
    <div id="v2-chat-feed">
        <div class="empty-placeholder">Waiting for chat messages...</div>
    </div>

    <div id="featured-overlay">
        <div class="featured-card">
            <div class="featured-username" id="f-user">USERNAME</div>
            <div class="featured-text" id="f-text">MESSAGE CONTENT</div>
            <div class="featured-platform" id="f-plat">TWITCH</div>
        </div>
    </div>

    <script>
        const feed = document.getElementById('v2-chat-feed');
        const featuredOverlay = document.getElementById('featured-overlay');
        const MAX_MESSAGES = ${cfg.maxItems || 75};
        const FADE_OUT_MS = ${(cfg as any).fadeOutAfterSeconds || 0} * 1000;

        function addMessage(msg) {
            // FILTER: Only show chats, gifts, follows, subs, and raids
            const allowedKinds = ['chat', 'gift', 'follow', 'subscription', 'raid'];
            if (msg.kind && !allowedKinds.includes(msg.kind)) {
                return;
            }

            const placeholder = feed.querySelector('.empty-placeholder');
            if (placeholder) placeholder.remove();

            const div = document.createElement('div');
            div.className = 'message ' + (msg.kind || 'chat');
            if (msg.emphasis) div.classList.add('emphasis');
            
            const platformColors = {
                twitch: '#9146ff',
                youtube: '#ff0000',
                tiktok: '#00f2ea',
                kick: '#53fc18'
            };

            const accent = msg.accentColor || platformColors[msg.platform] || '#fff';

            div.innerHTML = 
                '<div class="platform-icon" style="color: ' + accent + '">' +
                   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/></svg>' +
                '</div>' +
                '<div class="content-box">' +
                    '<div class="username" style="color: ' + accent + '">' +
                        (msg.displayName || msg.username || 'Anonymous') +
                        (msg.kind === 'gift' ? ' <span style="opacity:0.6; font-size: 0.8em; font-weight: 400;">(GIFT)</span>' : '') +
                        (msg.kind === 'follow' ? ' <span style="opacity:0.6; font-size: 0.8em; font-weight: 400;">(FOLLOW)</span>' : '') +
                        (msg.kind === 'subscription' ? ' <span style="opacity:0.6; font-size: 0.8em; font-weight: 400;">(SUB)</span>' : '') +
                        (msg.kind === 'raid' ? ' <span style="opacity:0.6; font-size: 0.8em; font-weight: 400;">(RAID)</span>' : '') +
                    '</div>' +
                    '<div class="text">' + (msg.message || '') + '</div>' +
                '</div>';

            feed.appendChild(div);

            if (feed.children.length > MAX_MESSAGES) {
                feed.removeChild(feed.firstChild);
            }

            // Implement auto-fade
            if (FADE_OUT_MS > 0) {
                setTimeout(() => {
                    div.classList.add('fading-out');
                    setTimeout(() => div.remove(), 600);
                }, FADE_OUT_MS);
            }

            div.scrollIntoView({ behavior: 'smooth', block: 'end' });
            // Visual heartbeat
            document.body.style.opacity = document.body.style.opacity === '0.999' ? '1' : '0.999';
        }

        function showFeatured(msg) {
            document.getElementById('f-user').textContent = msg.displayName || msg.username;
            document.getElementById('f-text').textContent = msg.message;
            document.getElementById('f-plat').textContent = (msg.platform || 'SYSTEM').toUpperCase();
            
            featuredOverlay.style.display = 'block';
            
            setTimeout(() => {
                featuredOverlay.style.opacity = '0';
                featuredOverlay.style.transition = 'opacity 1s';
                setTimeout(() => {
                    featuredOverlay.style.display = 'none';
                    featuredOverlay.style.opacity = '1';
                }, 1000);
            }, 8000);
        }

        function connect() {
            const evs = new EventSource('/overlay/events?channel=chat');
            evs.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'snapshot') {
                    feed.innerHTML = '';
                    if (data.payload && data.payload.length > 0) {
                        data.payload.forEach(addMessage);
                    } else {
                        feed.innerHTML = '<div class="empty-placeholder">Waiting for chat messages...</div>';
                    }
                } else if (data.type === 'append') {
                    addMessage(data.payload);
                }
            };

            const alertEvs = new EventSource('/overlay/events?channel=alerts');
            alertEvs.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'featured-message') {
                    showFeatured(data.payload);
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
