import { DEFAULT_CHAT_CONFIG, DEFAULT_CHAT_UNIFIED_CONFIG, type ChatConfig, type ChatUnifiedConfig } from '../../../shared/widgets'
import { TIKTOK_SHORTCODE_PAIRS } from '../../../shared/tiktok-shortcode-emojis'
import { getAnimationCss } from './animation-utils'
import { INLINE_AVATAR_RUNTIME_SCRIPT } from './runtime-assets'

type UnifiedChatRuntimeConfig = ChatConfig & ChatUnifiedConfig & { dockMode?: boolean }
const UNIFIED_CHAT_MAX_MESSAGES = 5
const UNIFIED_CHAT_DOCK_MAX_MESSAGES = 80
const UNIFIED_CHAT_MAX_LIFETIME_SECONDS = 120

/**
 * Unified multi-platform chat feed, modeled on Social Stream Ninja's compact
 * docked layout: small round avatar, bold platform-colored name with role
 * badges inline, message below on a high-contrast card. The page is fully
 * fluid — it fills whatever size the browser source is, so it can sit in a
 * small top-left corner region of a TikTok (9:16) canvas and stay legible.
 */
export function buildChatWidgetHtml(widget?: any, isPreview = false): string {
  const cfg = {
    ...DEFAULT_CHAT_CONFIG,
    ...DEFAULT_CHAT_UNIFIED_CONFIG,
    ...(widget?.config || {})
  } as UnifiedChatRuntimeConfig
  // Honor backgroundOpacity in both preview and production. Card legibility
  // must never depend on backdrop-filter — OBS's CEF often can't sample the
  // transparent backdrop, so the card background alpha alone has to carry it.
  const bgOpacity = Math.max(0.35, Math.min(1, cfg.backgroundOpacity ?? 0.75))
  const blur = Math.max(0, Math.min(100, Number(cfg.blur ?? 0)))
  const borderRadius = Math.max(4, Math.min(28, Number(cfg.borderRadius ?? 10)))
  const fontFamily = cfg.fontFamily || 'Inter'
  const animationStyle = cfg.animationStyle || 'slide'
  const dockMode = cfg.dockMode === true
  const scale = dockMode ? 1 : Math.max(0.4, Math.min(2.5, Number(cfg.scale || 1)))
  const opacity = Math.max(0, Math.min(1, Number(cfg.opacity ?? 1)))
  const showPlatformBadge = cfg.showPlatformBadge !== false
  const maxMessages = dockMode
    ? UNIFIED_CHAT_DOCK_MAX_MESSAGES
    : Math.max(1, Math.min(UNIFIED_CHAT_MAX_MESSAGES, Number(cfg.maxItems) || DEFAULT_CHAT_UNIFIED_CONFIG.maxItems))
  const fadeOutAfterSeconds = dockMode
    ? 0
    : Math.max(0, Math.min(
        UNIFIED_CHAT_MAX_LIFETIME_SECONDS,
        Number(cfg.fadeOutAfterSeconds) || 0
      ))
  const configuredFontSize = Number(cfg.fontSize) || 15
  const fontSize = dockMode
    ? Math.max(12, Math.min(18, configuredFontSize))
    : Math.max(12, Math.min(40, configuredFontSize))
  const maxWidth = Math.max(220, Math.min(1200, Number(cfg.width) || 480))
  const position = String(cfg.position || 'top-left')
  const anchorBottom = position.startsWith('bottom')
  const anchorRight = position.endsWith('right')
  const pageBackground = dockMode ? '#080d16' : 'transparent'
  const tiktokShortcodePairs = JSON.stringify(TIKTOK_SHORTCODE_PAIRS)
  const emptyStateHtml = dockMode
    ? `<div class="empty-placeholder"><div class="empty-state-inner"><div class="empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2.5 6.25a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5zm5.5 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5zm5.5 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5z"/></svg></div><div class="empty-title">Chat is quiet</div><div class="empty-copy">Messages from every connected platform will show up here.</div></div></div>`
    : '<div class="empty-placeholder">Waiting for chat messages...</div>'

  return `
<!DOCTYPE html>
<html lang="en" data-dock-mode="${dockMode ? '1' : '0'}" style="background: ${pageBackground} !important; background-color: ${pageBackground} !important;">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ilyStream Unified Chat</title>
    ${INLINE_AVATAR_RUNTIME_SCRIPT}
    <style>
        :root {
            --card: rgba(11, 13, 17, ${bgOpacity});
            --card-highlight: rgba(255, 255, 255, 0.05);
            --font-size: ${fontSize}px;
            --radius: ${borderRadius}px;
            --font-main: '${fontFamily}', 'Inter', 'Outfit', system-ui, sans-serif;
            --feed-scale: ${scale};
            --feed-opacity: ${opacity};
        }

        html, body {
            margin: 0;
            padding: 0;
            background: ${dockMode
              ? 'radial-gradient(circle at 110% -10%, rgba(119, 70, 255, 0.12), transparent 42%), #080d16'
              : 'transparent'};
            width: 100%;
            height: 100%;
            overflow: hidden;
        }

        body {
            padding: ${dockMode ? '0' : '6px'};
            box-sizing: border-box;
            font-family: var(--font-main);
            color: #fff;
            display: flex;
            flex-direction: column;
            align-items: ${dockMode ? 'stretch' : (anchorRight ? 'flex-end' : 'flex-start')};
            justify-content: ${dockMode ? 'stretch' : (anchorBottom ? 'flex-end' : 'flex-start')};
            /* Force GPU acceleration and keep-alive for embedded browsers */
            transform: translateZ(0);
            animation: keep-alive 10s infinite linear;
        }

        .dock-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex: 0 0 auto;
            min-height: 54px;
            gap: 10px;
            padding: 7px 10px;
            box-sizing: border-box;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            background: linear-gradient(180deg, rgba(20, 28, 45, 0.98), rgba(13, 20, 34, 0.98));
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
            z-index: 2;
        }

        .dock-identity {
            display: flex;
            align-items: center;
            gap: 9px;
            min-width: 0;
        }

        .dock-logo {
            display: grid;
            place-items: center;
            width: 30px;
            height: 30px;
            flex: 0 0 auto;
            border: 1px solid rgba(67, 210, 255, 0.38);
            border-radius: 9px;
            color: #66dcff;
            background: linear-gradient(145deg, rgba(102, 220, 255, 0.16), rgba(126, 92, 255, 0.12));
            box-shadow: inset 0 1px rgba(255, 255, 255, 0.08), 0 5px 16px rgba(0, 0, 0, 0.22);
        }

        .dock-logo svg {
            width: 18px;
            height: 18px;
            fill: currentColor;
        }

        .dock-heading {
            min-width: 0;
        }

        .dock-title {
            overflow: hidden;
            color: #f7f9ff;
            font-size: 12px;
            font-weight: 800;
            letter-spacing: 0.01em;
            line-height: 1.15;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .dock-summary {
            overflow: hidden;
            margin-top: 3px;
            color: rgba(215, 224, 240, 0.55);
            font-size: 9px;
            font-weight: 650;
            letter-spacing: 0.025em;
            line-height: 1.1;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .dock-connection {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            min-width: 0;
            padding: 4px 7px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 999px;
            color: rgba(226, 232, 243, 0.68);
            background: rgba(2, 6, 13, 0.46);
            font-size: 9px;
            font-weight: 750;
            letter-spacing: 0.025em;
            white-space: nowrap;
        }

        .dock-status-dot {
            width: 6px;
            height: 6px;
            flex: 0 0 auto;
            border-radius: 999px;
            background: #94a3b8;
            box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.09);
        }

        .dock-connection[data-state="live"] { color: #b9f8dd; border-color: rgba(52, 211, 153, 0.18); }
        .dock-connection[data-state="live"] .dock-status-dot { background: #34d399; box-shadow: 0 0 9px rgba(52, 211, 153, 0.58); }
        .dock-connection[data-state="polling"] { color: #beeafb; border-color: rgba(56, 189, 248, 0.2); }
        .dock-connection[data-state="polling"] .dock-status-dot { background: #38bdf8; box-shadow: 0 0 9px rgba(56, 189, 248, 0.5); }
        .dock-connection[data-state="offline"] { color: #fecaca; border-color: rgba(248, 113, 113, 0.2); }
        .dock-connection[data-state="offline"] .dock-status-dot { background: #f87171; box-shadow: 0 0 9px rgba(248, 113, 113, 0.48); }
        .dock-connection[data-state="connecting"] .dock-status-dot {
            animation: dock-pulse 1.35s ease-in-out infinite;
        }

        @keyframes dock-pulse {
            0%, 100% { opacity: 0.45; }
            50% { opacity: 1; }
        }

        @keyframes keep-alive {
            0% { filter: brightness(1); }
            50% { filter: brightness(1.01); }
            100% { filter: brightness(1); }
        }

        #v2-chat-feed {
            display: flex;
            flex-direction: column;
            justify-content: ${dockMode ? 'flex-start' : (anchorBottom ? 'flex-end' : 'flex-start')};
            gap: 6px;
            width: ${dockMode ? 'auto' : '100%'};
            max-width: ${dockMode ? 'none' : `${maxWidth}px`};
            min-height: 0;
            ${dockMode ? 'flex: 1 1 auto; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; padding: 7px; box-sizing: border-box;' : ''}
            opacity: var(--feed-opacity);
            transform: scale(var(--feed-scale));
            transform-origin: ${anchorBottom ? 'bottom' : 'top'} ${anchorRight ? 'right' : 'left'};
            scrollbar-color: rgba(105, 126, 158, 0.62) transparent;
            scrollbar-width: thin;
        }

        #v2-chat-feed::-webkit-scrollbar { width: 7px; }
        #v2-chat-feed::-webkit-scrollbar-track { background: transparent; }
        #v2-chat-feed::-webkit-scrollbar-thumb {
            border: 2px solid transparent;
            border-radius: 999px;
            background: rgba(105, 126, 158, 0.62);
            background-clip: padding-box;
        }

        .message {
            display: flex;
            align-items: flex-start;
            gap: 7px;
            max-width: 100%;
            animation: ${animationStyle === 'none' ? 'none' : 'get-anim 0.3s ease both'};
            will-change: transform, opacity;
            transform: translateZ(0);
        }

        ${getAnimationCss({ style: cfg.animationStyle || 'slide', duration: cfg.animationDuration || 350 }, '.message')}
        @keyframes get-anim { from { } to { } } /* Fallback anchor */

        .message.fading-out {
            animation: fadeOut 0.5s ease forwards;
        }

        @keyframes fadeOut {
            from { opacity: 1; transform: translateY(0) scale(1); }
            to { opacity: 0; transform: translateY(-8px) scale(0.95); }
        }

        .empty-placeholder {
            opacity: 0.35;
            font-size: 12px;
            font-weight: 800;
            text-transform: uppercase;
            text-align: center;
            width: 100%;
            box-sizing: border-box;
            padding: 18px 10px;
            border: 2px dashed rgba(255,255,255,0.2);
            border-radius: 14px;
            color: rgba(255,255,255,0.75);
            ${dockMode
              ? 'display: flex; flex: 1 1 auto; min-height: 150px; align-items: center; justify-content: center; padding: 22px 18px; border: 0; background: transparent; color: rgba(245, 248, 255, 0.7); opacity: 1; text-transform: none; letter-spacing: 0;'
              : ''}
        }

        .empty-state-inner {
            display: flex;
            flex-direction: column;
            align-items: center;
            max-width: 220px;
        }

        .empty-icon {
            display: grid;
            place-items: center;
            width: 38px;
            height: 38px;
            margin-bottom: 11px;
            border: 1px solid rgba(102, 220, 255, 0.2);
            border-radius: 13px;
            color: rgba(102, 220, 255, 0.72);
            background: rgba(102, 220, 255, 0.06);
        }

        .empty-icon svg { width: 20px; height: 20px; fill: currentColor; }
        .empty-title { color: rgba(247, 249, 255, 0.88); font-size: 12px; font-weight: 800; }
        .empty-copy {
            margin-top: 5px;
            color: rgba(190, 202, 222, 0.5);
            font-size: 10px;
            font-weight: 550;
            line-height: 1.4;
            text-transform: none;
        }

        .avatar-wrap {
            position: relative;
            flex-shrink: 0;
            width: calc(var(--font-size) * 2.1);
            height: calc(var(--font-size) * 2.1);
            margin-top: 1px;
        }

        .avatar {
            width: 100%;
            height: 100%;
            border-radius: 50%;
            background: linear-gradient(145deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05)), rgba(10, 12, 16, 0.9);
            object-fit: cover;
            border: 2px solid var(--platform-color, rgba(255,255,255,0.4));
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            font-size: calc(var(--font-size) * 0.9);
            color: rgba(255,255,255,0.92);
            text-align: center;
            line-height: 1;
            box-sizing: border-box;
            overflow: hidden;
            text-transform: uppercase;
        }

        img.avatar { display: block; padding: 0; }

        .platform-badge {
            position: absolute;
            bottom: -3px;
            right: -3px;
            width: calc(var(--font-size) * 0.95);
            height: calc(var(--font-size) * 0.95);
            border-radius: 50%;
            background: var(--platform-color, #333);
            border: 2px solid rgba(7, 9, 12, 0.95);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
        }

        .platform-badge svg {
            width: 62%;
            height: 62%;
            fill: white;
        }

        .content-box {
            flex: 1;
            min-width: 0;
            padding: calc(var(--font-size) * 0.28) calc(var(--font-size) * 0.55) calc(var(--font-size) * 0.38);
            border-radius: var(--radius);
            background: linear-gradient(180deg, var(--card-highlight), transparent 45%), var(--card);
            border-left: 3px solid var(--platform-color, rgba(255,255,255,0.3));
            box-shadow: 0 2px 10px rgba(0,0,0,0.35);
            ${blur > 0 ? `backdrop-filter: blur(${blur}px); -webkit-backdrop-filter: blur(${blur}px);` : ''}
        }

        .username {
            font-weight: 800;
            font-size: calc(var(--font-size) * 0.82);
            line-height: 1.25;
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 5px;
            color: var(--platform-color, #fff);
            text-shadow: 0 1px 2px rgba(0,0,0,0.85);
        }

        .kind-tag {
            font-size: calc(var(--font-size) * 0.58);
            font-weight: 800;
            background: var(--platform-chip, rgba(255,255,255,0.16));
            padding: 1px 6px;
            border-radius: 999px;
            color: rgba(255,255,255,0.92);
            text-transform: uppercase;
            letter-spacing: 0.02em;
        }

        .role-badges {
            display: inline-flex;
            align-items: center;
            gap: 3px;
        }
        .role-badge {
            width: calc(var(--font-size) * 0.85);
            height: calc(var(--font-size) * 0.85);
            object-fit: contain;
            border-radius: 3px;
            flex-shrink: 0;
        }
        .role-badge-glyph {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: calc(var(--font-size) * 0.85);
            height: calc(var(--font-size) * 0.85);
            flex-shrink: 0;
            filter: drop-shadow(0 1px 2px rgba(0,0,0,0.6));
        }
        .role-badge-glyph svg { width: 100%; height: 100%; display: block; }
        .role-badge-mod { color: #34d399; }
        .role-badge-superfan { color: #fbbf24; }
        .role-badge-member { color: #f472b6; }
        .role-badge-vip { color: #c084fc; }
        .role-badge-team { color: #38bdf8; }

        .text {
            font-size: var(--font-size);
            line-height: 1.3;
            word-wrap: break-word;
            overflow-wrap: anywhere;
            font-weight: 600;
            color: #ffffff;
            text-shadow: 0 1px 2px rgba(0,0,0,0.85);
            margin-top: 1px;
        }

        .tiktok-shortcode-emoji {
            display: inline-block;
            margin: 0 0.08em;
            font-size: 1.18em;
            line-height: 1;
            vertical-align: -0.12em;
        }

        .meta {
            display: inline-block;
            margin-left: 6px;
            font-size: calc(var(--font-size) * 0.78);
            font-weight: 800;
            color: #ffd75e;
            text-shadow: 0 1px 2px rgba(0,0,0,0.85);
        }

        .message-time {
            display: none;
            margin-left: auto;
            padding-left: 5px;
            color: rgba(190, 202, 222, 0.43);
            font-size: 9px;
            font-weight: 650;
            letter-spacing: 0;
            text-shadow: none;
            white-space: nowrap;
        }

        html[data-dock-mode="1"] #v2-chat-feed {
            --feed-scale: 1;
            --feed-opacity: 1;
        }

        html[data-dock-mode="1"] .message {
            width: 100%;
            flex: 0 0 auto;
            gap: 7px;
        }

        html[data-dock-mode="1"] .avatar-wrap {
            width: 29px;
            height: 29px;
            margin-top: 2px;
        }

        html[data-dock-mode="1"] .avatar {
            border-width: 1px;
            font-size: 11px;
        }

        html[data-dock-mode="1"] .platform-badge {
            right: -2px;
            bottom: -2px;
            width: 13px;
            height: 13px;
            border-width: 2px;
        }

        html[data-dock-mode="1"] .content-box {
            padding: 6px 8px 7px;
            border: 1px solid rgba(255, 255, 255, 0.055);
            border-left: 2px solid var(--platform-color, rgba(255,255,255,0.3));
            border-radius: 8px;
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.028), transparent 55%), rgba(15, 23, 38, 0.9);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
            transition: border-color 120ms ease, background 120ms ease;
        }

        html[data-dock-mode="1"] .message:hover .content-box {
            border-top-color: rgba(255, 255, 255, 0.1);
            border-right-color: rgba(255, 255, 255, 0.1);
            border-bottom-color: rgba(255, 255, 255, 0.1);
            background: rgba(20, 30, 48, 0.96);
        }

        html[data-dock-mode="1"] .username {
            min-width: 0;
            flex-wrap: nowrap;
            gap: 4px;
            font-size: 10.5px;
            line-height: 1.2;
            text-shadow: none;
        }

        html[data-dock-mode="1"] .display-name {
            overflow: hidden;
            min-width: 0;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        html[data-dock-mode="1"] .role-badges { gap: 2px; }
        html[data-dock-mode="1"] .role-badge,
        html[data-dock-mode="1"] .role-badge-glyph { width: 11px; height: 11px; }
        html[data-dock-mode="1"] .kind-tag { padding: 1px 4px; font-size: 8px; }

        html[data-dock-mode="1"] .text {
            margin-top: 3px;
            color: rgba(248, 250, 255, 0.93);
            font-size: 12.5px;
            font-weight: 540;
            line-height: 1.34;
            text-shadow: none;
        }

        html[data-dock-mode="1"] .message-time { display: inline-block; }
        html[data-dock-mode="1"] .meta { font-size: 10px; text-shadow: none; }

        @media (max-width: 225px) {
            .dock-connection-label { display: none; }
            .dock-connection { padding: 5px; }
            .dock-logo { width: 27px; height: 27px; border-radius: 8px; }
            .dock-logo svg { width: 16px; height: 16px; }
            html[data-dock-mode="1"] .avatar-wrap { width: 26px; height: 26px; }
        }

        /* Featured Message Pop-up */
        #featured-overlay {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 86%;
            max-width: 640px;
            z-index: 9999;
            pointer-events: none;
            display: none;
        }

        .featured-card {
            background: rgba(10, 12, 18, 0.94);
            border: 2px solid var(--platform-color, #19c8ff);
            border-radius: 22px;
            padding: 26px;
            box-shadow: 0 12px 60px rgba(0,0,0,0.55);
            animation: featuredIn 0.6s cubic-bezier(0.19, 1, 0.22, 1);
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
        }

        @keyframes featuredIn {
            0% { opacity: 0; transform: translateY(60px) scale(0.85); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
        }

        .featured-username {
            font-size: calc(var(--font-size) * 1.2);
            font-weight: 800;
            margin-bottom: 12px;
            color: #19c8ff;
            text-transform: uppercase;
        }

        .featured-text {
            font-size: calc(var(--font-size) * 1.7);
            font-weight: 700;
            line-height: 1.15;
            text-shadow: 0 3px 12px rgba(0,0,0,0.5);
        }

        .featured-platform {
            margin-top: 18px;
            opacity: 0.5;
            font-weight: 800;
            font-size: calc(var(--font-size) * 0.8);
        }

        /* Event emphasis */
        .message.gift .content-box { border-left-color: #ffd75e; background: linear-gradient(90deg, rgba(255, 215, 94, 0.16), transparent 60%), var(--card); }
        .message.subscription .content-box,
        .message.follow .content-box { background: linear-gradient(90deg, var(--platform-chip, rgba(255,255,255,0.1)), transparent 60%), var(--card); }
    </style>
</head>
<body>
    ${dockMode ? `<header class="dock-header">
        <div class="dock-identity">
            <div class="dock-logo" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm3 6v2h4V9H7zm6 0v2h4V9h-4z"/></svg></div>
            <div class="dock-heading">
                <div class="dock-title">ilyStream Chat</div>
                <div class="dock-summary"><span id="dock-message-count">0 messages</span> · All platforms</div>
            </div>
        </div>
        <div class="dock-connection" id="dock-connection" data-state="connecting" title="Connecting to ilyStream">
            <span class="dock-status-dot"></span><span class="dock-connection-label" id="dock-connection-label">Connecting</span>
        </div>
    </header>` : ''}
    <div id="v2-chat-feed">
        ${emptyStateHtml}
    </div>

    <div id="featured-overlay">
        <div class="featured-card">
            <div class="featured-username" id="f-user">USERNAME</div>
            <div class="featured-text" id="f-text">MESSAGE CONTENT</div>
            <div class="featured-platform" id="f-plat">TWITCH</div>
        </div>
    </div>

    <script>
    (function(){
        if (typeof window.__ilystreamUnifiedChatCleanup === 'function') {
            try { window.__ilystreamUnifiedChatCleanup(); } catch (error) { console.warn('[unified-chat] cleanup failed', error); }
        }

        var cleanupTasks = [];
        var activeEventSource = null;
        var reconnectTimer = null;
        var blankWatchdogTimer = null;

        const feed = document.getElementById('v2-chat-feed');
        const featuredOverlay = document.getElementById('featured-overlay');
        const MAX_MESSAGES = ${maxMessages};
        const FADE_OUT_MS = ${fadeOutAfterSeconds * 1000};
        const SHOW_PLATFORM_BADGE = ${showPlatformBadge};
        const IS_PREVIEW = ${JSON.stringify(isPreview)};
        const DOCK_MODE = ${JSON.stringify(dockMode)};
        const ANCHOR_BOTTOM = ${JSON.stringify(anchorBottom)};
        const EMPTY_STATE_HTML = ${JSON.stringify(emptyStateHtml)};
        const DUPLICATE_WINDOW_MS = 2500;
        const SEEN_ID_TTL_MS = 5 * 60 * 1000;
        const PREVIEW_MESSAGES = [
            {
                id: 'preview-chat-1',
                kind: 'chat',
                platform: 'tiktok',
                displayName: 'MiaMoon',
                profilePictureUrl: '',
                badges: [
                    { kind: 'mod', title: 'Moderator' },
                    { kind: 'member', title: 'TikTok Fan Club' },
                    { kind: 'superfan', title: 'Super Fan' }
                ],
                message: 'The overlay is looking clean tonight.',
                accentColor: '#FE2C55'
            },
            {
                id: 'preview-chat-2',
                kind: 'chat',
                platform: 'twitch',
                displayName: 'PixelDrew',
                profilePictureUrl: '',
                badges: [{ kind: 'vip', title: 'VIP' }],
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
                meta: '$4.99',
                accentColor: '#53fc18',
                emphasis: true
            },
            {
                id: 'preview-chat-4',
                kind: 'follow',
                platform: 'youtube',
                displayName: 'NovaVale',
                profilePictureUrl: '',
                message: 'followed the stream',
                accentColor: '#ff3333',
                emphasis: true
            },
            {
                id: 'preview-chat-5',
                kind: 'chat',
                platform: 'tiktok',
                displayName: 'LearningRussian',
                profilePictureUrl: '',
                badges: [{ kind: 'member', title: 'TikTok Fan Club' }],
                message: 'Top-left stack is easier to read.',
                accentColor: '#FE2C55'
            }
        ];
        const seenMessageIds = new Map();
        const seenChatFingerprints = new Map();
        const messageTimeouts = new Set();
        const dockConnection = document.getElementById('dock-connection');
        const dockConnectionLabel = document.getElementById('dock-connection-label');
        const dockMessageCount = document.getElementById('dock-message-count');
        let connectionState = 'connecting';

        function setConnectionState(state, label) {
            connectionState = state;
            if (!dockConnection || !dockConnectionLabel) return;
            dockConnection.dataset.state = state;
            dockConnection.title = label + ' to ilyStream';
            dockConnectionLabel.textContent = label;
        }

        function updateFeedSummary() {
            if (!dockMessageCount) return;
            const count = feed.querySelectorAll('.message').length;
            dockMessageCount.textContent = count + (count === 1 ? ' message' : ' messages');
        }

        function showEmptyState() {
            feed.innerHTML = EMPTY_STATE_HTML;
            updateFeedSummary();
        }

        function isNearLatestMessage() {
            if (!DOCK_MODE) return false;
            return feed.scrollHeight - feed.scrollTop - feed.clientHeight < 56;
        }

        function scrollToLatestMessage() {
            if (!DOCK_MODE) return;
            feed.scrollTop = feed.scrollHeight;
        }

        function formatMessageTime(value) {
            const parsed = Date.parse(String(value || ''));
            const date = Number.isFinite(parsed) ? new Date(parsed) : new Date();
            try {
                return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            } catch (error) {
                return '';
            }
        }

        function clearMessageTimeouts() {
            messageTimeouts.forEach((timeout) => clearTimeout(timeout));
            messageTimeouts.clear();
        }

        function scheduleMessageTimeout(callback, delay) {
            const timeout = setTimeout(() => {
                messageTimeouts.delete(timeout);
                callback();
            }, delay);
            messageTimeouts.add(timeout);
        }

        window.__ilystreamUnifiedChatCleanup = function() {
            stopPolling();
            clearMessageTimeouts();

            if (activeEventSource) {
                try { activeEventSource.close(); } catch (error) {}
                activeEventSource = null;
            }

            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }

            if (blankWatchdogTimer) {
                clearInterval(blankWatchdogTimer);
                blankWatchdogTimer = null;
            }

            cleanupTasks.forEach((cleanup) => {
                try { cleanup(); } catch (error) {}
            });
            cleanupTasks = [];

            if (window.__ilystreamUnifiedChatCleanup) {
                window.__ilystreamUnifiedChatCleanup = null;
            }
        };

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

        const TIKTOK_SHORTCODE_PAIRS = ${tiktokShortcodePairs};
        const TIKTOK_SHORTCODE_EMOJIS = TIKTOK_SHORTCODE_PAIRS.reduce((acc, pair) => {
            const normalized = normalizeTikTokShortcode(pair[0]);
            acc[normalized] = pair[1];
            acc[normalized.replace(/\\s+/g, '')] = pair[1];
            return acc;
        }, {});

        function normalizeTikTokShortcode(shortcode) {
            return String(shortcode || '')
                .normalize('NFKC')
                .toLowerCase()
                .trim()
                .replace(/[_-]+/g, ' ')
                .replace(/\\s+/g, ' ');
        }

        function resolveTikTokShortcodeEmoji(shortcode) {
            const normalized = normalizeTikTokShortcode(shortcode);
            if (!normalized) return '';
            const compact = normalized.replace(/\\s+/g, '');
            const direct = TIKTOK_SHORTCODE_EMOJIS[normalized] || TIKTOK_SHORTCODE_EMOJIS[compact];
            if (direct) return direct;

            const withoutRockyPrefix = normalized.replace(/^rocky\\s+/, '');
            if (withoutRockyPrefix !== normalized) {
                return TIKTOK_SHORTCODE_EMOJIS[withoutRockyPrefix] ||
                    TIKTOK_SHORTCODE_EMOJIS[withoutRockyPrefix.replace(/\\s+/g, '')] ||
                    '';
            }
            return '';
        }

        function renderMessageText(message, platform) {
            const text = String(message || '');
            if (platform !== 'tiktok') return escapeHtml(text);

            let html = '';
            let lastIndex = 0;
            const re = /\\[([^\\[\\]\\r\\n]{1,48})\\]/g;
            let match;
            while ((match = re.exec(text)) !== null) {
                const emoji = resolveTikTokShortcodeEmoji(match[1]);
                if (!emoji) continue;

                if (match.index > lastIndex) html += escapeHtml(text.slice(lastIndex, match.index));
                html += '<span class="tiktok-shortcode-emoji" title="[' + escapeAttr(match[1].trim()) + ']">' + escapeHtml(emoji) + '</span>';
                lastIndex = match.index + match[0].length;
            }

            if (lastIndex === 0) return escapeHtml(text);
            if (lastIndex < text.length) html += escapeHtml(text.slice(lastIndex));
            return html;
        }

        function resetMessageDedupe() {
            seenMessageIds.clear();
            seenChatFingerprints.clear();
        }

        function cleanupMessageDedupe(now) {
            seenMessageIds.forEach((seenAt, id) => {
                if (now - seenAt > SEEN_ID_TTL_MS) seenMessageIds.delete(id);
            });
            seenChatFingerprints.forEach((seenAt, key) => {
                if (now - seenAt > DUPLICATE_WINDOW_MS) seenChatFingerprints.delete(key);
            });
        }

        function normalizedMessageText(value) {
            return String(value || '').replace(/\\s+/g, ' ').trim();
        }

        function chatFingerprint(msg) {
            return [
                msg.kind || 'chat',
                msg.platform || '',
                String(msg.displayName || msg.username || '').trim().toLowerCase(),
                normalizedMessageText(msg.message)
            ].join(String.fromCharCode(31));
        }

        function shouldSkipDuplicateMessage(msg) {
            const now = Date.now();
            cleanupMessageDedupe(now);

            const id = String(msg.id || '').trim();
            if (id && seenMessageIds.has(id)) return true;

            const isChat = !msg.kind || msg.kind === 'chat';
            const fingerprint = isChat ? chatFingerprint(msg) : '';
            if (fingerprint && seenChatFingerprints.has(fingerprint)) return true;

            if (id) seenMessageIds.set(id, now);
            if (fingerprint) seenChatFingerprints.set(fingerprint, now);
            return false;
        }

        function roleBadgeSvg(kind) {
            if (kind === 'mod') return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l7 3v6c0 4.4-3 8.3-7 9.5C8 19.3 5 15.4 5 11V5z"/></svg>';
            if (kind === 'superfan') return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.8 5.9 21.4l1.4-6.8L2.2 9.9l6.9-.8z"/></svg>';
            if (kind === 'member') return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.5-9.5-9C1 9 2.5 5.5 6 5.5c2 0 3.2 1.1 4 2.3.8-1.2 2-2.3 4-2.3 3.5 0 5 3.5 3.5 6.5C19 16.5 12 21 12 21z"/></svg>';
            if (kind === 'vip') return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l4 6 6 .9-4.5 4.2L18.5 22 12 18.5 5.5 22l1-8.9L2 8.9 8 8z"/></svg>';
            if (kind === 'team') return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4zm-7 8c0-2.8 4.7-4.5 7-4.5s7 1.7 7 4.5V21H5z"/></svg>';
            return '';
        }

        function buildRoleBadges(badges) {
            if (!Array.isArray(badges) || !badges.length) return '';
            var html = '';
            for (var i = 0; i < badges.length; i++) {
                var b = badges[i] || {};
                var title = escapeAttr(b.title || '');
                var glyph = roleBadgeSvg(b.kind);
                if (b.imageUrl) {
                    html += '<img class="role-badge" src="' + escapeAttr(window.__ilyAvatar.proxy(b.imageUrl)) + '" alt="' + title + '" title="' + title + '" onerror="this.remove()">';
                } else if (glyph) {
                    html += '<span class="role-badge-glyph role-badge-' + escapeAttr(b.kind || '') + '" title="' + title + '">' + glyph + '</span>';
                }
            }
            return html ? '<span class="role-badges">' + html + '</span>' : '';
        }

        function safeAvatarUrl(url) {
            if (typeof url !== 'string' || !url.trim()) return '';
            return window.__ilyAvatar.resolve(url, '?');
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

        function getMessageRemainingLifetimeMs(msg) {
            if (FADE_OUT_MS <= 0) return null;

            const timestamp = Date.parse(String(msg.timestamp || ''));
            if (!Number.isFinite(timestamp)) return FADE_OUT_MS;

            const age = Math.max(0, Date.now() - timestamp);
            return Math.max(0, FADE_OUT_MS - age);
        }

        // Inline avatar img onerror calls this to swap in an initial-letter fallback.
        window.__buildAvatarFallback = function(initial) {
            return '<div class="avatar">' + escapeHtml(initial || '?') + '</div>';
        };

        function addMessage(msg, allowAutoScroll) {
            const allowedKinds = ['chat', 'gift', 'follow', 'subscription', 'raid'];
            if (msg.kind && !allowedKinds.includes(msg.kind)) return;
            const remainingLifetimeMs = getMessageRemainingLifetimeMs(msg);
            if (remainingLifetimeMs !== null && remainingLifetimeMs <= 0) return;
            if (shouldSkipDuplicateMessage(msg)) return;
            const followLatest = DOCK_MODE && allowAutoScroll !== false &&
                (!feed.querySelector('.message') || isNearLatestMessage());

            const placeholder = feed.querySelector('.empty-placeholder');
            if (placeholder) placeholder.remove();

            const div = document.createElement('div');
            div.className = 'message ' + (msg.kind || 'chat');
            if (msg.emphasis) div.classList.add('emphasis');

            const platformColors = {
                twitch: '#a970ff',
                youtube: '#ff4d4d',
                tiktok: '#FE2C55',
                kick: '#53fc18'
            };

            const accent = safeHexColor(msg.accentColor, platformColors[msg.platform] || '#9aa4b2');
            const nameColor = platformColors[msg.platform] || accent;
            const iconPath = platformIcons[msg.platform] || platformIcons.twitch;
            const chip = hexWithAlpha(nameColor, 0.28);
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

            div.style.setProperty('--platform-color', nameColor);
            div.style.setProperty('--platform-chip', chip);

            const platformBadge = SHOW_PLATFORM_BADGE
                ? '<div class="platform-badge">' +
                    '<svg viewBox="0 0 24 24">' + iconPath + '</svg>' +
                  '</div>'
                : '';

            const meta = msg.meta ? '<span class="meta">' + escapeHtml(msg.meta) + '</span>' : '';
            const messageTime = DOCK_MODE
                ? '<span class="message-time">' + escapeHtml(formatMessageTime(msg.timestamp)) + '</span>'
                : '';

            div.innerHTML =
                '<div class="avatar-wrap">' +
                    avatarBody +
                    platformBadge +
                '</div>' +
                '<div class="content-box">' +
                    '<div class="username">' +
                        '<span class="display-name">' + escapeHtml(name) + '</span>' +
                        buildRoleBadges(msg.badges) +
                        kindTag + messageTime +
                    '</div>' +
                    '<div class="text">' + renderMessageText(msg.message || '', msg.platform) + meta + '</div>' +
                '</div>';

            feed.appendChild(div);

            while (feed.children.length > MAX_MESSAGES) {
                feed.removeChild(feed.firstChild);
            }

            updateFeedSummary();
            if (followLatest) requestAnimationFrame(scrollToLatestMessage);

            if (remainingLifetimeMs !== null) {
                scheduleMessageTimeout(() => {
                    if (!div.isConnected) return;
                    div.classList.add('fading-out');
                    scheduleMessageTimeout(() => {
                        div.remove();
                        if (!feed.querySelector('.message')) showEmptyState();
                        else updateFeedSummary();
                    }, 600);
                }, remainingLifetimeMs);
            }
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

        function renderSnapshot(items) {
            const previousScrollTop = feed.scrollTop;
            const followLatest = DOCK_MODE && (!feed.querySelector('.message') || isNearLatestMessage());
            clearMessageTimeouts();
            feed.innerHTML = '';
            resetMessageDedupe();
            if (items && items.length > 0) {
                // Newest messages win the limited slots; render the tail.
                const tail = items.slice(-MAX_MESSAGES);
                // Isolate each item: one malformed message must never blank the
                // whole feed by throwing out of the forEach.
                tail.forEach((item) => {
                    try { addMessage(item, false); } catch (error) { console.warn('[unified-chat] skipped bad item', error); }
                });
                if (!feed.querySelector('.message')) {
                    showEmptyState();
                }
            } else {
                showEmptyState();
            }
            updateFeedSummary();
            if (followLatest) requestAnimationFrame(scrollToLatestMessage);
            else if (DOCK_MODE) feed.scrollTop = previousScrollTop;
        }

        function handleRealtimePacket(data) {
            if (!data || typeof data !== 'object') return;
            if (data.type === 'snapshot') {
                renderSnapshot(data.payload);
            } else if (data.type === 'append') {
                addMessage(data.payload);
            } else if (data.type === 'reload') {
                window.location.reload();
            } else if (data.type === 'feature-broadcast' || data.type === 'feature') {
                showFeatured(data.payload);
            }
        }

        let pollingStarted = false;
        let pollingTimer = null;

        function requestJson(url) {
            if (typeof fetch === 'function') {
                return fetch(url, { cache: 'no-store' })
                    .then((response) => response.ok ? response.json() : Promise.reject(new Error('chat state ' + response.status)));
            }

            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.onreadystatechange = () => {
                    if (xhr.readyState !== 4) return;
                    if (xhr.status < 200 || xhr.status >= 300) {
                        reject(new Error('chat state ' + xhr.status));
                        return;
                    }
                    try {
                        resolve(JSON.parse(xhr.responseText || '[]'));
                    } catch (error) {
                        reject(error);
                    }
                };
                xhr.onerror = () => reject(new Error('chat state network error'));
                xhr.send();
            });
        }

        function chatStateUrl() {
            const url = new URL('/overlay/chat/state', window.location.href);
            url.searchParams.set('t', Date.now().toString());
            return url.href;
        }

        function hydrateChatState() {
            return requestJson(chatStateUrl())
                .then((items) => {
                    renderSnapshot(items);
                    if (connectionState !== 'live') setConnectionState('polling', 'Synced');
                })
                .catch((error) => {
                    if (connectionState !== 'live') setConnectionState('offline', 'Offline');
                    console.warn('[unified-chat] hydration failed', error);
                });
        }

        function startPolling() {
            if (pollingStarted) return;
            pollingStarted = true;
            const poll = () => {
                requestJson(chatStateUrl())
                    .then((items) => {
                        renderSnapshot(items);
                        setConnectionState('polling', 'Polling');
                    })
                    .catch((error) => {
                        setConnectionState('offline', 'Offline');
                        console.warn('[unified-chat] polling failed', error);
                    });
            };
            poll();
            pollingTimer = setInterval(poll, 2000);
        }

        function stopPolling() {
            if (pollingTimer) {
                clearInterval(pollingTimer);
                pollingTimer = null;
            }
            pollingStarted = false;
        }

        function connect() {
            if (activeEventSource) {
                try { activeEventSource.close(); } catch (error) {}
                activeEventSource = null;
            }

            if (typeof EventSource !== 'function') {
                console.warn('[unified-chat] EventSource not supported, using polling fallback.');
                startPolling();
                return;
            }

            const eventUrl = new URL('/overlay/events?channel=chat-unified', window.location.href).href;
            let evs;
            try {
                evs = new EventSource(eventUrl);
                activeEventSource = evs;
            } catch (error) {
                console.warn('[unified-chat] EventSource failed to start, using polling fallback.', error);
                startPolling();
                scheduleReconnect();
                return;
            }
            evs.onopen = () => {
                stopPolling();
                setConnectionState('live', 'Live');
            };
            evs.onmessage = (event) => {
                try {
                    handleRealtimePacket(JSON.parse(event.data));
                } catch (error) {
                    console.warn('[unified-chat] ignored malformed event', error);
                }
            };

            evs.onerror = () => {
                evs.close();
                if (activeEventSource === evs) activeEventSource = null;
                setConnectionState('connecting', 'Reconnecting');
                startPolling();
                scheduleReconnect();
            };
        }

        function scheduleReconnect() {
            if (reconnectTimer) clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                connect();
            }, 2000);
        }

        // Blank-state watchdog. Browser sources (especially OBS/TikTok Live
        // Studio CEF) can lose their rendered content without the SSE firing an
        // error — a hidden/re-shown source, a GPU-process blip, or a silently
        // stalled stream. If the feed ends up empty, re-hydrate from the server
        // (and kick the realtime connection) so the widget can never get stuck
        // blank while messages are actually available.
        //
        // Only when fade-out is OFF: with fade-out enabled an empty feed is the
        // intended resting state, so re-hydrating would wrongly resurrect old
        // messages.
        function recoverIfBlank() {
            if (IS_PREVIEW || FADE_OUT_MS > 0) return;
            if (feed.querySelector('.message')) return;
            hydrateChatState();
            if (!pollingStarted) startPolling();
        }

        function startBlankWatchdog() {
            if (blankWatchdogTimer) clearInterval(blankWatchdogTimer);
            blankWatchdogTimer = setInterval(recoverIfBlank, 12000);
        }

        // Re-check as soon as the source becomes visible again.
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') recoverIfBlank();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        cleanupTasks.push(() => document.removeEventListener('visibilitychange', handleVisibilityChange));

        if (IS_PREVIEW) {
            feed.innerHTML = '';
            PREVIEW_MESSAGES.forEach(addMessage);
            setConnectionState('polling', 'Preview');
            requestAnimationFrame(scrollToLatestMessage);
        } else {
            hydrateChatState();
            connect();
            startBlankWatchdog();
        }
    })();
    </script>
</body>
</html>
  `;
}
