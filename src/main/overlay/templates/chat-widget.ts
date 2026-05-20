import { DEFAULT_CHAT_CONFIG, DEFAULT_CHAT_UNIFIED_CONFIG, type ChatConfig, type ChatUnifiedConfig } from '../../../shared/widgets'
import { getAnimationCss } from './animation-utils'

type UnifiedChatRuntimeConfig = ChatConfig & ChatUnifiedConfig

export function buildChatWidgetHtml(widget?: any, isPreview = false): string {
  const cfg = {
    ...DEFAULT_CHAT_CONFIG,
    ...DEFAULT_CHAT_UNIFIED_CONFIG,
    ...(widget?.config || {})
  } as UnifiedChatRuntimeConfig
  const bgOpacity = isPreview ? 0 : Math.max(0, Math.min(1, cfg.backgroundOpacity ?? (0.3 + (cfg.glassIntensity * 0.5))))
  const blur = Math.max(0, Math.min(100, Number(cfg.blur ?? (cfg.glassIntensity * 40))))
  const borderRadius = cfg.borderRadius ?? 14
  const fontFamily = cfg.fontFamily || 'Outfit'
  const animationStyle = cfg.animationStyle || 'slide'
  const accentColor = (cfg as any).accentColor || '#00f2ff'
  const secondaryColor = (cfg as any).secondaryColor || '#ff00ff'
  const scale = Math.max(0.4, Math.min(2.5, Number(cfg.scale || 1)))
  const opacity = Math.max(0, Math.min(1, Number(cfg.opacity ?? 1)))
  const showPlatformBadge = cfg.showPlatformBadge !== false

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
            --glass-border: rgba(255, 255, 255, ${0.05 + (cfg.glassIntensity * 0.1)});
            --bubble: rgba(9, 11, 16, ${Math.max(0.16, bgOpacity)});
            --bubble-strong: rgba(255, 255, 255, 0.07);
            --cyan: ${accentColor};
            --magenta: ${secondaryColor};
            --twitch: #9146ff;
            --youtube: #ff0000;
            --tiktok: #00f2ea;
            --kick: #53fc18;
            --font-size: ${Math.max(16, cfg.fontSize)}px;
            --width: ${cfg.width}px;
            --blur: ${blur}px;
            --radius: ${borderRadius}px;
            --font-main: '${fontFamily}', 'Outfit', sans-serif;
            --feed-scale: ${scale};
            --feed-opacity: ${opacity};
        }

        body {
            margin: 0;
            padding: 24px;
            font-family: var(--font-main);
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
            gap: 10px;
            mask-image: linear-gradient(to bottom, transparent, black 15%);
            padding-top: 50px;
            width: min(var(--width), 100%);
            transition: all 0.3s ease;
            filter: drop-shadow(0 16px 34px rgba(0,0,0,0.48));
            opacity: var(--feed-opacity);
            transform: scale(var(--feed-scale));
            transform-origin: bottom left;
        }

        /* Social Stream Ninja-inspired: circular avatars leading compact
           speech bubbles with a tiny platform badge tucked into the avatar. */
        .message {
            display: grid;
            grid-template-columns: 50px minmax(0, 1fr);
            align-items: start;
            gap: 10px;
            padding: 0;
            animation: ${animationStyle === 'none' ? 'none' : 'get-anim 0.35s ease both'};
            will-change: transform, opacity;
            transform: translateZ(0);
            position: relative;
            max-width: 100%;
        }

        ${getAnimationCss({ style: cfg.animationStyle || 'slide', duration: cfg.animationDuration || 400 }, '.message')}
        @keyframes get-anim { from { } to { } } /* Fallback anchor */

        .message.fading-out {
            animation: fadeOut 0.5s ease forwards;
        }

        @keyframes fadeOut {
            from { opacity: 1; transform: translateY(0) scale(1); }
            to { opacity: 0; transform: translateY(-10px) scale(0.9); }
        }

        .empty-placeholder {
            opacity: 0.3;
            font-size: 14px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0;
            text-align: center;
            width: 100%;
            padding: 60px;
            border: 2px dashed rgba(255,255,255,0.15);
            border-radius: 32px;
            color: rgba(255,255,255,0.6);
            backdrop-filter: blur(10px);
        }

        @keyframes slideIn {
            from { opacity: 0; transform: translateX(-30px) scale(0.9); }
            to { opacity: 1; transform: translateX(0) scale(1); }
        }

        @keyframes zoomIn {
            from { opacity: 0; transform: scale(0.5); }
            to { opacity: 1; transform: scale(1); }
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        .avatar-wrap {
            position: relative;
            flex-shrink: 0;
            width: 50px;
            height: 50px;
            margin-top: 2px;
            filter: drop-shadow(0 8px 14px rgba(0,0,0,0.45));
        }

        .avatar {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background:
                radial-gradient(circle at 30% 22%, rgba(255,255,255,0.22), transparent 34%),
                linear-gradient(145deg, rgba(255,255,255,0.14), rgba(255,255,255,0.04));
            object-fit: cover;
            border: 3px solid var(--platform-color, rgba(255,255,255,0.35));
            box-shadow:
                0 0 0 2px rgba(8, 10, 14, 0.94),
                0 0 18px var(--platform-glow, rgba(0,0,0,0.4));
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 900;
            font-size: 18px;
            color: rgba(255,255,255,0.92);
            text-align: center;
            line-height: 1;
            box-sizing: border-box;
            overflow: hidden;
            text-transform: uppercase;
        }

        img.avatar {
            display: block;
            padding: 0;
        }

        .platform-badge {
            position: absolute;
            bottom: -2px;
            right: -4px;
            width: 21px;
            height: 21px;
            border-radius: 50%;
            background: var(--platform-color, #333);
            border: 2px solid rgba(7, 9, 12, 0.98);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            box-shadow: 0 2px 6px rgba(0,0,0,0.5);
        }

        .platform-badge svg {
            width: 11px;
            height: 11px;
            fill: white;
        }

        .content-box {
            flex: 1;
            min-width: 0;
            position: relative;
            padding: 8px 12px 10px;
            border-radius: max(12px, var(--radius));
            background:
                linear-gradient(180deg, var(--bubble-strong), transparent 42%),
                var(--bubble);
            border: 1px solid var(--platform-soft, rgba(255,255,255,0.18));
            box-shadow:
                inset 0 1px 0 rgba(255,255,255,0.08),
                0 10px 28px rgba(0,0,0,0.34);
            backdrop-filter: blur(var(--blur)) saturate(160%);
            -webkit-backdrop-filter: blur(var(--blur)) saturate(160%);
        }

        .content-box::before {
            content: "";
            position: absolute;
            left: -6px;
            top: 15px;
            width: 10px;
            height: 10px;
            background: var(--bubble);
            border-left: 1px solid var(--platform-soft, rgba(255,255,255,0.16));
            border-bottom: 1px solid var(--platform-soft, rgba(255,255,255,0.16));
            transform: rotate(45deg);
            backdrop-filter: blur(var(--blur));
        }

        .username {
            font-weight: 900;
            font-size: calc(var(--font-size) * 0.72);
            margin-bottom: 2px;
            display: flex;
            align-items: center;
            gap: 8px;
            text-shadow: 0 1px 3px rgba(0,0,0,0.6);
            letter-spacing: 0;
            text-transform: uppercase;
            color: var(--platform-color, #fff);
        }

        .kind-tag {
            font-size: 0.7em;
            font-weight: 800;
            background: var(--platform-chip, rgba(255,255,255,0.14));
            padding: 2px 7px;
            border-radius: 999px;
            letter-spacing: 0;
            color: rgba(255,255,255,0.85);
            text-transform: uppercase;
        }

        .text {
            font-size: var(--font-size);
            line-height: 1.35;
            word-wrap: break-word;
            opacity: 1;
            font-weight: 600;
            text-shadow: 0 1px 4px rgba(0,0,0,0.4);
            color: rgba(255,255,255,0.95);
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
            background: rgba(10, 12, 18, 0.9);
            backdrop-filter: blur(60px);
            border: 2px solid var(--cyan);
            border-radius: 40px;
            padding: 50px;
            box-shadow: 0 0 120px rgba(0, 242, 255, 0.25);
            animation: featuredIn 0.8s cubic-bezier(0.19, 1, 0.22, 1);
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
        }

        @keyframes featuredIn {
            0% { opacity: 0; transform: translateY(120px) scale(0.8) rotateX(25deg); }
            100% { opacity: 1; transform: translateY(0) scale(1) rotateX(0); }
        }

        .featured-username {
            font-size: 1.8rem;
            font-weight: 800;
            margin-bottom: 24px;
            color: var(--cyan);
            text-transform: uppercase;
            letter-spacing: 0;
        }

        .featured-text {
            font-size: 3rem;
            font-weight: 600;
            line-height: 1.1;
            text-shadow: 0 5px 20px rgba(0,0,0,0.5);
        }

        .featured-platform {
            margin-top: 40px;
            opacity: 0.5;
            font-weight: 900;
            font-size: 1rem;
            letter-spacing: 0;
        }

        /* Event Emphasis */
        .message.gift .content-box {
            border-color: rgba(255, 215, 0, 0.45);
            background: linear-gradient(135deg, var(--bubble), rgba(255, 215, 0, 0.12));
        }
        .message.follow .content-box {
            border-color: rgba(0, 242, 255, 0.45);
            background: linear-gradient(135deg, var(--bubble), rgba(0, 242, 255, 0.12));
        }
        .message.emphasis .content-box {
            box-shadow: 0 0 40px rgba(0, 242, 255, 0.15);
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
        const SHOW_PLATFORM_BADGE = ${showPlatformBadge};
        const IS_PREVIEW = ${JSON.stringify(isPreview)};
        const PREVIEW_MESSAGES = [
            {
                id: 'preview-chat-1',
                kind: 'chat',
                platform: 'tiktok',
                displayName: 'MiaMoon',
                profilePictureUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=MiaMoon',
                message: 'The overlay is looking clean tonight.',
                accentColor: '#00f2ea'
            },
            {
                id: 'preview-chat-2',
                kind: 'chat',
                platform: 'twitch',
                displayName: 'PixelDrew',
                profilePictureUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=PixelDrew',
                message: 'Can you queue Neon Skyline next?',
                accentColor: '#9146ff'
            },
            {
                id: 'preview-chat-3',
                kind: 'gift',
                platform: 'kick',
                displayName: 'GreenRoom',
                profilePictureUrl: '',
                message: 'sent a GG',
                accentColor: '#53fc18',
                emphasis: true
            }
        ];

        const platformIcons = {
            twitch: '<path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0h1.714v5.143h-1.714zm-10.286 0h1.714v5.143H6zm1.714-2.572H1.714v15.428h4.286v3.429l3.429-3.429h2.572l7.714-7.714V2.142zm11.143 10.286-3 3H10.286L7.714 18v-2.571H3.429V3.857h12.857z"/>',
            youtube: '<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>',
            tiktok: '<path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.06-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.03 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.9-.32-1.89-.23-2.74.24-.81.47-1.38 1.31-1.55 2.24-.12.7-.06 1.41.16 2.09.32.93.99 1.73 1.84 2.25.71.43 1.54.6 2.37.52 1.14-.1 2.2-.76 2.82-1.71.46-.7.65-1.53.66-2.35-.01-4.28-.02-8.55-.02-12.83z"/>',
            kick: '<path d="M2.25 0H21.75C23 0 24 1 24 2.25V21.75C24 23 23 24 21.75 24H2.25C1 24 0 23 0 21.75V2.25C0 1 1 0 2.25 0ZM7.32422 5.0625V18.9375H10.125V13.623L13.125 18.9375H16.4297L13.125 13.0781L16.4297 5.0625H13.125L10.125 12.3398V5.0625H7.32422Z"/>'
        };

        function escapeHtml(s) {
            return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
        }

        function escapeAttr(s) {
            return escapeHtml(s);
        }

        function safeAvatarUrl(url) {
            if (typeof url !== 'string' || !url.trim()) return '';
            try {
                const parsed = new URL(url, window.location.origin);
                return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '';
            } catch {
                return '';
            }
        }

        function safeHexColor(value, fallback) {
            return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback;
        }

        function hexWithAlpha(hex, alpha) {
            const c = String(hex).replace('#', '');
            if (c.length !== 6) return 'rgba(255,255,255,' + alpha + ')';
            const r = parseInt(c.slice(0, 2), 16);
            const g = parseInt(c.slice(2, 4), 16);
            const b = parseInt(c.slice(4, 6), 16);
            if ([r, g, b].some((n) => Number.isNaN(n))) return 'rgba(255,255,255,' + alpha + ')';
            return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
        }

        // Inline avatar img onerror calls this to swap in an initial-letter fallback.
        window.__buildAvatarFallback = function(initial) {
            return '<div class="avatar">' + escapeHtml(initial || '?') + '</div>';
        };

        function addMessage(msg) {
            const allowedKinds = ['chat', 'gift', 'follow', 'subscription', 'raid'];
            if (msg.kind && !allowedKinds.includes(msg.kind)) return;

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

            const accent = safeHexColor(msg.accentColor, platformColors[msg.platform] || '#888888');
            const iconPath = platformIcons[msg.platform] || platformIcons.twitch;
            const glow = hexWithAlpha(accent, 0.45);
            const soft = hexWithAlpha(accent, 0.42);
            const chip = hexWithAlpha(accent, 0.24);
            const name = msg.displayName || msg.username || 'Anonymous';
            const initial = String(name).trim().charAt(0).toUpperCase() || '?';
            const avatarUrl = safeAvatarUrl(msg.profilePictureUrl);

            const avatarBody = avatarUrl
                ? '<img src="' + escapeAttr(avatarUrl) + '" class="avatar" onerror="this.outerHTML=window.__buildAvatarFallback(this.dataset.initial)" data-initial="' + escapeAttr(initial) + '">'
                : '<div class="avatar">' + escapeHtml(initial) + '</div>';

            const kindTag = msg.kind === 'gift' ? '<span class="kind-tag">Gift</span>'
                : msg.kind === 'follow' ? '<span class="kind-tag">Follow</span>'
                : msg.kind === 'subscription' ? '<span class="kind-tag">Sub</span>'
                : msg.kind === 'raid' ? '<span class="kind-tag">Raid</span>'
                : '';

            div.style.setProperty('--platform-color', accent);
            div.style.setProperty('--platform-glow', glow);
            div.style.setProperty('--platform-soft', soft);
            div.style.setProperty('--platform-chip', chip);

            const platformBadge = SHOW_PLATFORM_BADGE
                ? '<div class="platform-badge">' +
                    '<svg viewBox="0 0 24 24">' + iconPath + '</svg>' +
                  '</div>'
                : '';

            div.innerHTML =
                '<div class="avatar-wrap">' +
                    avatarBody +
                    platformBadge +
                '</div>' +
                '<div class="content-box">' +
                    '<div class="username">' +
                        escapeHtml(name) +
                        (kindTag ? ' ' + kindTag : '') +
                    '</div>' +
                    '<div class="text">' + escapeHtml(msg.message || '') + '</div>' +
                '</div>';

            feed.appendChild(div);

            if (feed.children.length > MAX_MESSAGES) {
                feed.removeChild(feed.firstChild);
            }

            if (FADE_OUT_MS > 0) {
                setTimeout(() => {
                    div.classList.add('fading-out');
                    setTimeout(() => div.remove(), 600);
                }, FADE_OUT_MS);
            }

            div.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }

        function showFeatured(msg) {
            document.getElementById('f-user').textContent = msg.displayName || msg.username;
            document.getElementById('f-text').textContent = msg.message;
            document.getElementById('f-plat').textContent = (msg.platform || 'SYSTEM').toUpperCase();

            featuredOverlay.style.display = 'block';
            featuredOverlay.style.opacity = '1';

            setTimeout(() => {
                featuredOverlay.style.opacity = '0';
                featuredOverlay.style.transition = 'opacity 1s';
                setTimeout(() => {
                    featuredOverlay.style.display = 'none';
                }, 1000);
            }, 8000);
        }

        function connect() {
            const evs = new EventSource('/overlay/events?channel=chat-unified');
            evs.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'snapshot') {
                    feed.innerHTML = '';
                    if (data.payload && data.payload.length > 0) {
                        data.payload.forEach(addMessage);
                    } else {
                        feed.innerHTML = \'<div class="empty-placeholder">Waiting for chat messages...</div>\';
                    }
                } else if (data.type === \'append\') {
                    addMessage(data.payload);
                } else if (data.type === \'reload\') {
                    window.location.reload();
                } else if (data.type === \'feature-broadcast\' || data.type === \'feature\') {
                    showFeatured(data.payload);
                }
            };

            evs.onerror = () => {
                evs.close();
                setTimeout(connect, 2000);
            };
        }

        if (IS_PREVIEW) {
            feed.innerHTML = '';
            PREVIEW_MESSAGES.forEach(addMessage);
        } else {
            connect();
        }
    </script>
</body>
</html>
  `;
}
