import { DiscordPromoConfig, DEFAULT_DISCORD_PROMO_CONFIG } from '../../../shared/widgets'
import { getAnimationCss } from './animation-utils'

export function buildDiscordPromoHtml(widget?: any, isPreview = false): string {
  const cfg: DiscordPromoConfig = { ...DEFAULT_DISCORD_PROMO_CONFIG, ...(widget?.config || {}) }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Discord Promo</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap" rel="stylesheet">
  <style>
    body, html {
      margin: 0;
      padding: 0;
      ${cfg.forceTikTokDimensions ? 'width: 1080px; height: 1920px;' : 'width: 100vw; height: 100vh;'}
      overflow: hidden;
      background: transparent;
      font-family: 'Outfit', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .promo-pill {
      position: relative;
      ${cfg.forceTikTokDimensions ? '' : (
        cfg.aspectRatio === 'tiktok' ? 'aspect-ratio: 9/16; height: 100%; width: auto;' :
        cfg.aspectRatio === 'landscape' ? 'aspect-ratio: 16/9; width: 100%; height: auto;' : 'width: 100%; height: 100%;'
      )}
      display: flex;
      align-items: center;
      background: rgba(15, 17, 21, 0.85);
      backdrop-filter: blur(16px);
      padding: 10px 24px;
      border-radius: 100px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 12px 40px rgba(0,0,0,0.6);
      transform: scale(${cfg.scale});
      opacity: ${cfg.opacity};
      gap: 16px;
      overflow: hidden;
    }
    ${getAnimationCss({ style: cfg.animationStyle || 'slide', duration: cfg.animationDuration || 800 }, '.promo-pill')}

    /* Subtle Accent Glow */
    .promo-pill::before {
      content: '';
      position: absolute;
      bottom: 0;
      left: 20%;
      right: 20%;
      height: 2px;
      background: linear-gradient(90deg, transparent, ${cfg.primaryColor}, transparent);
      box-shadow: 0 0 15px ${cfg.primaryColor};
      opacity: 0.8;
    }

    .discord-icon {
      width: 30px;
      height: 30px;
      fill: ${cfg.iconColor};
      filter: drop-shadow(0 0 8px ${cfg.primaryColor}88);
      flex-shrink: 0;
    }

    .text-stack {
      display: flex;
      flex-direction: column;
    }

    .main-text {
      color: ${cfg.textColor};
      font-size: 17px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 1px;
      line-height: 1;
    }

    .sub-text {
      color: rgba(255, 255, 255, 0.5);
      font-size: 11px;
      font-weight: 600;
      margin-top: 3px;
      letter-spacing: 0.5px;
    }

    /* Subtle shimmer that isn't distracting */
    .shimmer {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        90deg,
        transparent 0%,
        rgba(255, 255, 255, 0.05) 50%,
        transparent 100%
      );
      background-size: 200% 100%;
      animation: sweep 5s infinite linear;
      pointer-events: none;
    }

    @keyframes sweep {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  </style>
</head>
<body>
  <div class="promo-pill">
    <div class="shimmer"></div>
    <svg class="discord-icon" viewBox="0 0 127.14 96.36">
      <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.71,32.65-1.82,56.6.48,80.21a105.73,105.73,0,0,0,32.28,16.15,77.7,77.7,0,0,0,7.37-12,67.65,67.65,0,0,1-11.78-5.56c.93-.66,1.86-1.35,2.75-2.08a74.13,74.13,0,0,0,64.12,0c.89.73,1.81,1.41,2.75,2.08a67.62,67.62,0,0,1-11.78,5.57,77.34,77.34,0,0,0,7.36,12,105.41,105.41,0,0,0,32.33-16.14C129.58,52.84,124.27,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,45.91,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,45.91,96.11,53,91.08,65.69,84.69,65.69Z"/>
    </svg>
    <div class="text-stack">
      <div class="main-text">${cfg.message}</div>
      <div class="sub-text">${cfg.subMessage}</div>
    </div>
  </div>

  <script>
    var src = new EventSource('/overlay/events?channel=discord-promo');
    src.onmessage = function(e) {
      var msg = JSON.parse(e.data);
      if (msg.type === 'reload') window.location.reload();
    };
  </script>
</body>
</html>`
}
