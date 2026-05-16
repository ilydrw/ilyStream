import { SocialsConfig, DEFAULT_SOCIALS_CONFIG } from '../../../shared/widgets'
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

export function buildSocialsOverlayHtml(widget?: any, isPreview = false): string {
  const cfg: SocialsConfig = { ...DEFAULT_SOCIALS_CONFIG, ...(widget?.config || {}) }
  const glassIntensity = cfg.glassIntensity ?? 0.5
  const bgOpacity = (0.35 + (glassIntensity * 0.55))
  const blur = glassIntensity * 45
  const borderRadius = cfg.borderRadius ?? 20
  const fontFamily = cfg.fontFamily || 'Outfit'
  const bgRgba = isPreview ? 'transparent' : hexToRgba(cfg.backgroundColor, bgOpacity)
  const shellStyle = OVERLAY_POSITION_MAP[cfg.position] || OVERLAY_POSITION_MAP['bottom-left']

  const platformIcons: Record<string, string> = {
    twitter: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
    youtube: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
    tiktok: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="#EE1D52" d="M8.45095 19.7926C8.60723 18.4987 9.1379 17.7743 10.1379 17.0317C11.5688 16.0259 13.3561 16.5948 13.3561 16.5948V13.2197C13.7907 13.2085 14.2254 13.2343 14.6551 13.2966V17.6401C14.6551 17.6401 12.8683 17.0712 11.4375 18.0775C10.438 18.8196 9.90623 19.5446 9.7505 20.8385C9.74562 21.5411 9.87747 22.4595 10.4847 23.2536C10.3345 23.1766 10.1815 23.0889 10.0256 22.9905C8.68807 22.0923 8.44444 20.7449 8.45095 19.7926ZM22.0352 6.97898C21.0509 5.90039 20.6786 4.81139 20.5441 4.04639H21.7823C21.7823 4.04639 21.5354 6.05224 23.3347 8.02482L23.3597 8.05134C22.8747 7.7463 22.43 7.38624 22.0352 6.97898ZM28 10.0369V14.293C28 14.293 26.42 14.2312 25.2507 13.9337C23.6179 13.5176 22.5685 12.8795 22.5685 12.8795C22.5685 12.8795 21.8436 12.4245 21.785 12.3928V21.1817C21.785 21.6711 21.651 22.8932 21.2424 23.9125C20.709 25.246 19.8859 26.1212 19.7345 26.3001C19.7345 26.3001 18.7334 27.4832 16.9672 28.28C15.3752 28.9987 13.9774 28.9805 13.5596 28.9987C13.5596 28.9987 11.1434 29.0944 8.96915 27.6814C8.49898 27.3699 8.06011 27.0172 7.6582 26.6277L7.66906 26.6355C9.84383 28.0485 12.2595 27.9528 12.2595 27.9528C12.6779 27.9346 14.0756 27.9528 15.6671 27.2341C17.4317 26.4374 18.4344 25.2543 18.4344 25.2543C18.5842 25.0754 19.4111 24.2001 19.9423 22.8662C20.3498 21.8474 20.4849 20.6247 20.4849 20.1354V11.3475C20.5435 11.3797 21.2679 11.8347 21.2679 11.8347C21.2679 11.8347 22.3179 12.4734 23.9506 12.8889C25.1204 13.1864 26.7 13.2483 26.7 13.2483V9.91314C27.2404 10.0343 27.7011 10.0671 28 10.0369Z"/><path fill="#ffffff" d="M26.7009 9.91314V13.2472C26.7009 13.2472 25.1213 13.1853 23.9515 12.8879C22.3188 12.4718 21.2688 11.8337 21.2688 11.8337C21.2688 11.8337 20.5444 11.3787 20.4858 11.3464V20.1364C20.4858 20.6258 20.3518 21.8484 19.9432 22.8672C19.4098 24.2012 18.5867 25.0764 18.4353 25.2553C18.4353 25.2553 17.4337 26.4384 15.668 27.2352C14.0765 27.9539 12.6788 27.9357 12.2604 27.9539C12.2604 27.9539 9.84473 28.0496 7.66995 26.6366L7.6591 26.6288C7.42949 26.4064 7.21336 26.1717 7.01177 25.9257C6.31777 25.0795 5.89237 24.0789 5.78547 23.7934C5.61347 23.2937 5.25209 22.1022 5.30147 20.9482C5.38883 18.9122 6.10507 17.6625 6.29444 17.3494C6.79597 16.4957 7.44828 15.7318 8.22233 15.0919C8.90538 14.5396 9.6796 14.1002 10.5132 13.7917C11.4144 13.4295 12.3794 13.2353 13.3565 13.2197V16.5948C13.3565 16.5948 11.5691 16.028 10.1388 17.0317C9.13879 17.7743 8.60812 18.4987 8.45185 19.7926C8.44534 20.7449 8.68897 22.0923 10.0254 22.991C10.1813 23.0898 10.3343 23.1775 10.4845 23.2541C10.7179 23.5576 11.0021 23.8221 11.3255 24.0368C12.631 24.8632 13.7249 24.9209 15.1238 24.3842C16.0565 24.0254 16.7586 23.2167 17.0842 22.3206C17.2888 21.7611 17.2861 21.1978 17.2861 20.6154V4.04639H20.5417C20.6763 4.81139 21.0485 5.90039 22.0328 6.97898C22.4276 7.38624 22.8724 7.7463 23.3573 8.05134C23.5006 8.19955 24.2331 8.93231 25.1734 9.38216C25.6596 9.61469 26.1722 9.79285 26.7009 9.91314Z"/><path fill="#69C9D0" d="M10.5128 13.7916C9.67919 14.1002 8.90498 14.5396 8.22192 15.0918C7.44763 15.7332 6.79548 16.4987 6.29458 17.354C6.10521 17.6661 5.38897 18.9168 5.30161 20.9528C5.25223 22.1068 5.61361 23.2983 5.78561 23.7944C5.89413 24.081 6.31791 25.0815 7.01191 25.9303C7.2135 26.1763 7.42963 26.4111 7.65924 26.6334C6.92357 26.1457 6.26746 25.5562 5.71236 24.8839C5.02433 24.0451 4.60001 23.0549 4.48932 22.7626V22.7527C4.31677 22.2571 3.95431 21.0651 4.00477 19.9096C4.09213 17.8736 4.80838 16.6239 4.99775 16.3108C5.4985 15.4553 6.15067 14.6898 6.92509 14.0486C7.608 13.4961 8.38225 13.0567 9.21598 12.7484C9.73602 12.5416 10.2778 12.3891 10.8319 12.2934C11.6669 12.1537 12.5198 12.1415 13.3588 12.2575V13.2196C12.3808 13.2349 11.4148 13.4291 10.5128 13.7916Z"/><path fill="#69C9D0" d="M20.5438 4.04635H17.2881V20.6159C17.2881 21.1983 17.2881 21.76 17.0863 22.3211C16.7575 23.2167 16.058 24.0253 15.1258 24.3842C13.7265 24.923 12.6326 24.8632 11.3276 24.0368C11.0036 23.823 10.7187 23.5594 10.4844 23.2567C11.5962 23.8251 12.5913 23.8152 13.8241 23.341C14.7558 22.9821 15.4563 22.1734 15.784 21.2774C15.9891 20.7178 15.9864 20.1546 15.9864 19.5726V3H20.4819C20.4819 3 20.4315 3.41188 20.5438 4.04635ZM26.7002 8.99104V9.9131C26.1725 9.79263 25.6609 9.61447 25.1755 9.38213C24.2352 8.93228 23.5026 8.19952 23.3594 8.0513C23.5256 8.1559 23.6981 8.25106 23.8759 8.33629C25.0192 8.88339 26.1451 9.04669 26.7002 8.99104Z"/></svg>`,
    instagram: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z"/></svg>`,
    discord: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037 19.736 19.736 0 0 0-4.885 1.515.069.069 0 0 0-.032.027C.533 9.048-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.086 2.157 2.419 0 1.334-.947 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.086 2.157 2.419 0 1.334-.946 2.419-2.157 2.419z"/></svg>`,
    twitch: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>`,
    kick: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 4.5V2.25H14.25V0H6V24H14.25V21.75H16.5V19.5H18.75V17.25H21V11.25H18.75V9H16.5V6.75H14.25V17.25H12V6.75H14.25V4.5H16.5Z"/></svg>`,
  }

  return `<!DOCTYPE html>
<html style="background: transparent !important; background-color: transparent !important;">
  <head>
    <meta charset="UTF-8">
    <title>Socials Overlay</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap" rel="stylesheet">
    <style>
      :root {
        --accent: ${cfg.accentColor || '#38bdf8'};
        --width: ${cfg.width || 280}px;
        --bg: ${bgRgba || 'rgba(10,10,10,0.8)'};
        --blur: ${blur}px;
        --radius: ${borderRadius}px;
        --font-main: '${fontFamily}', 'Outfit', sans-serif;
      }
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      html, body {
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
        background: transparent !important;
        background-color: transparent !important;
        overflow: hidden;
      }

      body {
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--font-main);
        color: #FFFFFF;
      }

      .card {
        width: fit-content;
        height: fit-content;
        position: relative;
        padding: 2vh 4vh;
        display: flex;
        align-items: center;
        gap: 2vh;
        z-index: 1;
      }
      ${getAnimationCss({ style: (cfg as any).animationStyle || 'slide', duration: (cfg as any).animationDuration || 800 }, '.card')}

      .card-bg {
        position: absolute;
        inset: 0;
        background: var(--bg) !important;
        backdrop-filter: blur(var(--blur)) saturate(250%);
        -webkit-backdrop-filter: blur(var(--blur)) saturate(250%);
        border: 1px solid rgba(255,255,255,${0.05 + (glassIntensity * 0.15)});
        box-shadow:
            0 20px 50px rgba(0,0,0,0.5),
            inset 0 0 20px rgba(255,255,255,0.05);
        border-radius: var(--radius);
        z-index: -1;
      }

      .card-bg::after {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(255,255,255,0.05) 100%);
        pointer-events: none;
      }

      ${cfg.style === 'chroma' ? `
      .card-bg { background: rgba(10, 10, 10, 0.8); border: none; }
      .card-bg::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 16px 16px 0 0;
        padding: 2px;
        background: linear-gradient(90deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000);
        background-size: 200% auto;
        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        animation: chroma-spin 4s linear infinite;
      }
      @keyframes chroma-spin {
        0% { background-position: 0% 50%; }
        100% { background-position: 200% 50%; }
      }
      ` : ''}

      .progress-container {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: rgba(255,255,255,0.05);
        z-index: 3;
      }
      .progress-bar {
        height: 100%;
        width: 0%;
        background: #FFFFFF !important;
        box-shadow: 0 0 10px rgba(255,255,255,0.5) !important;
      }

      ${cfg.style === 'cyber' ? `
      .card-bg { background: rgba(0,0,0,0.85); border: none; box-shadow: 0 15px 35px rgba(0,0,0,0.6); }
      .progress-bar {
        background: linear-gradient(90deg, #D035F1, #19C8FF, #D035F1, #19C8FF) !important;
        background-size: 200% 100% !important;
        box-shadow: 0 0 10px rgba(208, 53, 241, 0.6) !important;
        animation: shimmer-progress 2s linear infinite !important;
      }
      @keyframes shimmer-progress {
        0% { background-position: 0% 50%; }
        100% { background-position: 200% 50%; }
      }
      ` : ''}

      .content-mask {
        display: flex;
        width: 100%;
        overflow: hidden;
        position: relative;
        z-index: 2;
        padding: 2px 0;
      }

      .icon-box {
        width: 6vh;
        height: 6vh;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .icon-box svg {
        width: 100%;
        height: 100%;
        filter: drop-shadow(0 0.5vh 1vh rgba(0,0,0,0.3));
      }

      .info {
        display: flex;
        flex-direction: column;
        justify-content: center;
        overflow: hidden;
      }

      .platform-name {
        font-size: 2.8vh;
        font-weight: 900;
        letter-spacing: 0.25em;
        text-transform: uppercase;
        color: var(--accent);
        margin-bottom: 0.8vh;
        opacity: 0.9;
      }
      .username {
        font-size: 6.5vh;
        font-weight: 800;
        letter-spacing: -0.02em;
        white-space: nowrap;
        color: #FFFFFF;
        filter: drop-shadow(0 2px 10px rgba(0,0,0,0.5));
      }

      .anim-wrapper {
        display: flex;
        align-items: center;
        gap: 20px;
        width: 100%;
        transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.6s ease;
        position: relative;
        z-index: 2;
      }

      .no-transition { transition: none !important; }

      .anim-out-roll { transform: translateY(-40px); opacity: 0; }
      .anim-out-fade { opacity: 0; }
      .anim-out-slide { transform: translateX(-40px); opacity: 0; }

      .anim-in-roll { transform: translateY(40px); opacity: 0; }
      .anim-in-fade { opacity: 0; }
      .anim-in-slide { transform: translateX(40px); opacity: 0; }

      .anim-active { transform: translate(0, 0); opacity: 1; }

    </style>
  </head>
  <body>
    <div class="card" id="card">
      <div class="card-bg"></div>
      <div class="content-mask">
        <div id="content" class="anim-wrapper anim-in-${cfg.animation || 'roll'}">
          <div class="icon-box" id="icon"></div>
          <div class="info">
            <div class="platform-name" id="platform">Loading</div>
            <div class="username" id="username">Preparing Socials</div>
          </div>
        </div>
      </div>
      <div class="progress-container">
        <div class="progress-bar" id="progress"></div>
      </div>
    </div>

    <script>
      const ACCOUNTS = ${JSON.stringify(cfg.accounts?.length > 0 ? cfg.accounts : [{ id: 'p1', platform: 'twitter', username: '@Username' }])};
      const INTERVAL_MS = ${(cfg.interval || 8) * 1000};
      const ANIMATION_TYPE = '${cfg.animation || 'roll'}';

      const elContent = document.getElementById('content');
      const elIcon = document.getElementById('icon');
      const elPlatform = document.getElementById('platform');
      const elUsername = document.getElementById('username');
      const elProgress = document.getElementById('progress');

      const ICONS = ${JSON.stringify(platformIcons)};
      const PLATFORM_COLORS = {
        twitter: '#1DA1F2',
        youtube: '#FF0000',
        tiktok: '#FFFFFF',
        instagram: '#E1306C',
        discord: '#5865F2',
        twitch: '#9146FF',
        kick: '#53FC18',
        custom: 'var(--accent)'
      };

      let currentIndex = 0;
      let progressAnimation;

      function renderAccount(index) {
        const acc = ACCOUNTS[index];
        if (!acc) return;

        const BRAND_NAMES = {
          twitter: 'Twitter',
          youtube: 'YouTube',
          tiktok: 'TikTok',
          instagram: 'Instagram',
          discord: 'Discord',
          twitch: 'Twitch',
          kick: 'Kick',
          custom: 'Follow Me'
        };

        elIcon.innerHTML = ICONS[acc.platform] || ICONS['custom'] || '';
        elIcon.style.color = PLATFORM_COLORS[acc.platform] || PLATFORM_COLORS['custom'];
        elPlatform.textContent = BRAND_NAMES[acc.platform] || (acc.platform.charAt(0).toUpperCase() + acc.platform.slice(1));
        elPlatform.style.color = PLATFORM_COLORS[acc.platform] || PLATFORM_COLORS['custom'];
        elUsername.textContent = acc.username;
      }

      async function updateWidget() {
        if (ACCOUNTS.length <= 1) return;
        const nextIndex = (currentIndex + 1) % ACCOUNTS.length;

        // Smooth exit
        const exitKeyframes = {
          roll: [{ transform: 'translate3d(0, 0, 0)', opacity: 1 }, { transform: 'translate3d(0, -20px, 0)', opacity: 0 }],
          fade: [{ opacity: 1 }, { opacity: 0 }],
          slide: [{ transform: 'translate3d(0, 0, 0)', opacity: 1 }, { transform: 'translate3d(-20px, 0, 0)', opacity: 0 }]
        }[ANIMATION_TYPE] || exitKeyframes.roll;

        const exitAnim = elContent.animate(exitKeyframes, {
          duration: 400,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          fill: 'forwards'
        });

        if (progressAnimation) progressAnimation.cancel();

        await exitAnim.finished;

        renderAccount(nextIndex);
        currentIndex = nextIndex;

        // Smooth enter
        const enterKeyframes = {
          roll: [{ transform: 'translate3d(0, 20px, 0)', opacity: 0 }, { transform: 'translate3d(0, 0, 0)', opacity: 1 }],
          fade: [{ opacity: 0 }, { opacity: 1 }],
          slide: [{ transform: 'translate3d(20px, 0, 0)', opacity: 0 }, { transform: 'translate3d(0, 0, 0)', opacity: 1 }]
        }[ANIMATION_TYPE] || enterKeyframes.roll;

        elContent.animate(enterKeyframes, {
          duration: 500,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          fill: 'forwards'
        });

        progressAnimation = elProgress.animate([
          { width: '0%', opacity: 0.5 },
          { width: '100%', opacity: 1 }
        ], {
          duration: INTERVAL_MS,
          easing: 'linear',
          fill: 'forwards'
        });
      }

      // Initial state
      renderAccount(0);
      elContent.style.opacity = '1';

      if (ACCOUNTS.length > 1) {
        progressAnimation = elProgress.animate([
          { width: '0%', opacity: 0.5 },
          { width: '100%', opacity: 1 }
        ], {
          duration: INTERVAL_MS,
          easing: 'linear',
          fill: 'forwards'
        });

        // Robust loop that waits for animations to complete correctly
        const loop = async () => {
          while (true) {
            await new Promise(r => setTimeout(r, INTERVAL_MS));
            await updateWidget();
          }
        };
        loop().catch(console.error);
      }

      if (!${isPreview}) {
        function connectSSE() {
          var src = new EventSource('/overlay/events?channel=socials');
          src.onmessage = function(e) {
            var msg = JSON.parse(e.data);
            if (msg.type === 'reload') window.location.reload();
          };
          src.onerror = function() {
            src.close();
            setTimeout(connectSSE, 2000);
          };
        }
        connectSSE();
      }
    </script>
  </body>
</html>`;
}
