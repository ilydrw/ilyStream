import { BorderConfig, DEFAULT_BORDER_CONFIG } from '../../../shared/widgets'
import { getAnimationCss } from './animation-utils'

function resolveBorderVisuals(cfg: BorderConfig): { background: string; glow: string } {
  if (cfg.style === 'chroma') {
    return {
      background: `conic-gradient(
        from var(--angle),
        #ff3b30,
        #ffd60a 16%,
        #34d399 33%,
        #00e5ff 50%,
        #3b82f6 67%,
        #d946ef 84%,
        #ff3b30 100%
      )`,
      glow: `drop-shadow(0 0 calc(5px * var(--glow)) #ffd60a)
              drop-shadow(0 0 calc(2px * var(--glow)) #00e5ff)`
    }
  }

  if (cfg.style === 'cyber') {
    return {
      background: `conic-gradient(
        from var(--angle),
        #19c8ff,
        #d035f1 25%,
        #00ffff 50%,
        #d035f1 75%,
        #19c8ff 100%
      )`,
      glow: `drop-shadow(0 0 calc(5px * var(--glow)) #19c8ff)
              drop-shadow(0 0 calc(2px * var(--glow)) #d035f1)`
    }
  }

  if (cfg.style === 'gob-the-stopper') {
    return {
      background: `conic-gradient(
        from var(--angle),
        #b6ff00,
        #f7ffe8 22%,
        #050505 42%,
        #ce1126 62%,
        #050505 82%,
        #b6ff00 100%
      )`,
      glow: `drop-shadow(0 0 calc(6px * var(--glow)) #b6ff00)
              drop-shadow(0 0 calc(2px * var(--glow)) #ce1126)`
    }
  }

  return {
    background: `conic-gradient(
        from var(--angle),
        var(--color1),
        var(--color2) 25%,
        var(--color1) 50%,
        var(--color2) 75%,
        var(--color1) 100%
      )`,
    glow: `drop-shadow(0 0 calc(5px * var(--glow)) var(--color1))
              drop-shadow(0 0 calc(2px * var(--glow)) var(--color2))`
  }
}

export function buildScreenBorderHtml(widget?: any, isPreview = false): string {
  const cfg: BorderConfig = { ...DEFAULT_BORDER_CONFIG, ...(widget?.config || {}) }
  const borderVisuals = resolveBorderVisuals(cfg)

  return `<!DOCTYPE html>
<html>
<head>
  <style>
    @property --angle {
      syntax: '<angle>';
      initial-value: 0deg;
      inherits: false;
    }

    :root {
      --thickness: ${cfg.thickness}px;
      --radius: ${cfg.borderRadius}px;
      --color1: ${cfg.color1};
      --color2: ${cfg.color2};
      --speed: ${cfg.speed}s;
      --glow: ${cfg.glowIntensity};
      --opacity: ${cfg.opacity};
    }

    body, html {
      margin: 0;
      padding: 0;
      ${cfg.forceTikTokDimensions ? 'width: 1080px; height: 1920px;' : 'width: 100vw; height: 100vh;'}
      overflow: hidden;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: sans-serif;
    }

    .border-container {
      position: relative;
      width: 100%;
      height: 100%;
      ${cfg.forceTikTokDimensions ? '' : (
        cfg.aspectRatio === 'tiktok' ? 'aspect-ratio: 9/16; height: 100%; width: auto;' :
        cfg.aspectRatio === 'landscape' ? 'aspect-ratio: 16/9; width: 100%; height: auto;' : ''
      )}
      pointer-events: none;
      opacity: var(--opacity);
    }
    ${getAnimationCss({ style: cfg.animationStyle || 'fade', duration: cfg.animationDuration || 1000 }, '.border-container')}

    /* The shimmering border */
    .border-inner {
      position: absolute;
      inset: 0;
      border-radius: var(--radius);
      padding: var(--thickness);

      background: ${borderVisuals.background};

      /* Masking */
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor;
      mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      mask-composite: exclude;

      animation: rotate-gradient var(--speed) linear infinite;

      /* Extreme GPU Optimization */
      will-change: --angle;
      transform: translateZ(0);
      backface-visibility: hidden;

      /* Smooth Glow */
      filter: ${borderVisuals.glow};
    }

    @keyframes rotate-gradient {
      to { --angle: 360deg; }
    }

    /* Dark background for preview only */
    .preview-bg {
      position: fixed;
      inset: 0;
      background: #0f1115;
      z-index: -1;
      display: ${isPreview && cfg.showPreviewBackground ? 'block' : 'none'};
    }
  </style>
</head>
<body>
  <div class="preview-bg"></div>
  <div class="border-container">
    <div class="border-inner"></div>
  </div>
  <script>
    const source = new EventSource('/overlay/events?channel=screen-border');
    source.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'reload') window.location.reload();
    };
  </script>
</body>
</html>`;
}
