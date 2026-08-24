import { BorderConfig, DEFAULT_BORDER_CONFIG } from '../../../shared/widgets'
import { getAnimationCss } from './animation-utils'

export function buildScreenBorderHtml(widget?: any, isPreview = false): string {
  const cfg: BorderConfig = { ...DEFAULT_BORDER_CONFIG, ...(widget?.config || {}) }

  // All border-style variants are emitted into the stylesheet up-front. The
  // active variant is picked by a `data-style` attribute on <body>, which the
  // live-config hook can flip instantly without rebuilding the document.
  const borderStyleCss = `
    body[data-style="chroma"] .border-inner::before {
      background: conic-gradient(
        from 0deg,
        #ff3b30,
        #ffd60a 16%,
        #34d399 33%,
        #00e5ff 50%,
        #3b82f6 67%,
        #d946ef 84%,
        #ff3b30 100%
      );
    }
    body[data-style="chroma"] .border-inner {
      filter: drop-shadow(0 0 calc(5px * var(--glow)) #ffd60a)
              drop-shadow(0 0 calc(2px * var(--glow)) #00e5ff);
    }
    body[data-style="cyber"] .border-inner::before {
      background: conic-gradient(
        from 0deg,
        #19c8ff,
        #d035f1 25%,
        #00ffff 50%,
        #d035f1 75%,
        #19c8ff 100%
      );
    }
    body[data-style="cyber"] .border-inner {
      filter: drop-shadow(0 0 calc(5px * var(--glow)) #19c8ff)
              drop-shadow(0 0 calc(2px * var(--glow)) #d035f1);
    }
    body[data-style="gob-the-stopper"] .border-inner::before {
      background: conic-gradient(
        from 0deg,
        #b6ff00,
        #f7ffe8 22%,
        #050505 42%,
        #8fd400 62%,
        #050505 82%,
        #b6ff00 100%
      );
    }
    body[data-style="gob-the-stopper"] .border-inner {
      filter: drop-shadow(0 0 calc(6px * var(--glow)) #b6ff00)
              drop-shadow(0 0 calc(2px * var(--glow)) #8fd400);
    }
    /* Custom style + any unknown style falls back to a two-color gradient
       driven by --color1 / --color2 so users can pick their own palette. */
    body[data-style="custom"] .border-inner::before,
    body:not([data-style="chroma"]):not([data-style="cyber"]):not([data-style="gob-the-stopper"]) .border-inner::before {
      background: conic-gradient(
        from 0deg,
        var(--color1),
        var(--color2) 25%,
        var(--color1) 50%,
        var(--color2) 75%,
        var(--color1) 100%
      );
    }
    body[data-style="custom"] .border-inner,
    body:not([data-style="chroma"]):not([data-style="cyber"]):not([data-style="gob-the-stopper"]) .border-inner {
      filter: drop-shadow(0 0 calc(5px * var(--glow)) var(--color1))
              drop-shadow(0 0 calc(2px * var(--glow)) var(--color2));
    }
  `

  // Shared live-config contract. Browser sources and the editor both use this
  // path; fields baked into one-shot animation CSS return false so the shared
  // runtime performs one targeted document refresh.
  const initialLiveConfig = JSON.stringify(cfg).replace(/</g, '\\u003c')
  const liveConfigScript = `
  <script>
    // Updates CSS variables and data attributes in-place so the editor
    // previewer can apply config tweaks without restarting the conic-gradient
    // animation. animationStyle / animationDuration are NOT live — they only
    // affect the one-shot reveal animation — so a change there cleanly falls
    // back to HTML mode (which restarts the iframe and plays the new reveal).
    var SB_LIVE_FIELDS = {
      thickness: 1, borderRadius: 1, color1: 1, color2: 1, speed: 1,
      glowIntensity: 1, opacity: 1, style: 1, forceTikTokDimensions: 1,
      aspectRatio: 1, showPreviewBackground: 1
    };
    window.__ilystreamLastConfig = ${initialLiveConfig};
    window.__ilystreamApplyConfig = function(cfg) {
      if (!cfg) return true;
      var root = document.documentElement;
      var body = document.body;
      var prev = window.__ilystreamLastConfig || null;
      if (prev) {
        for (var k in cfg) {
          if (!cfg.hasOwnProperty(k)) continue;
          if (SB_LIVE_FIELDS[k]) continue;
          if (prev[k] !== cfg[k]) {
            return false;
          }
        }
      }
      if (cfg.thickness != null) root.style.setProperty('--thickness', cfg.thickness + 'px');
      if (cfg.borderRadius != null) root.style.setProperty('--radius', cfg.borderRadius + 'px');
      if (cfg.color1) root.style.setProperty('--color1', cfg.color1);
      if (cfg.color2) root.style.setProperty('--color2', cfg.color2);
      if (cfg.speed != null) root.style.setProperty('--speed', cfg.speed + 's');
      if (cfg.glowIntensity != null) root.style.setProperty('--glow', String(cfg.glowIntensity));
      if (cfg.opacity != null) root.style.setProperty('--opacity', String(cfg.opacity));
      if (cfg.style) body.setAttribute('data-style', cfg.style);
      if (cfg.forceTikTokDimensions != null) {
        root.setAttribute('data-force-tiktok', cfg.forceTikTokDimensions ? '1' : '0');
      }
      if (cfg.aspectRatio != null) root.setAttribute('data-aspect', cfg.aspectRatio);
      if (cfg.showPreviewBackground != null) {
        body.setAttribute('data-preview-bg', cfg.showPreviewBackground ? '1' : '0');
      }
      window.__ilystreamLastConfig = cfg;
      return true;
    };
  </script>`

  return `<!DOCTYPE html>
<html data-force-tiktok="${cfg.forceTikTokDimensions ? '1' : '0'}" data-aspect="${cfg.aspectRatio || 'auto'}">
<head>
  <style>
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
      overflow: hidden;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: sans-serif;
    }
    html[data-force-tiktok="0"], html[data-force-tiktok="0"] body { width: 100vw; height: 100vh; }
    html[data-force-tiktok="1"], html[data-force-tiktok="1"] body { width: 1080px; height: 1920px; }

    .border-container {
      position: relative;
      width: 100%;
      height: 100%;
      pointer-events: none;
      opacity: var(--opacity);
    }
    html[data-force-tiktok="0"][data-aspect="tiktok"] .border-container {
      aspect-ratio: 9/16; height: 100%; width: auto;
    }
    html[data-force-tiktok="0"][data-aspect="landscape"] .border-container {
      aspect-ratio: 16/9; width: 100%; height: auto;
    }
    ${getAnimationCss({ style: cfg.animationStyle || 'fade', duration: cfg.animationDuration || 1000 }, '.border-container')}

    .border-inner {
      position: absolute;
      inset: 0;
      display: none;
      z-index: 2;
      border-radius: var(--radius);
      padding: var(--thickness);
      
      /* Webkit-specific properties */
      -webkit-mask-image: linear-gradient(#fff 0 0), linear-gradient(#fff 0 0);
      -webkit-mask-clip: content-box, border-box;
      -webkit-mask-composite: destination-out;
      
      /* Standard properties */
      mask-image: linear-gradient(#fff 0 0), linear-gradient(#fff 0 0);
      mask-clip: content-box, border-box;
      mask-composite: exclude;

      overflow: hidden;
      transform: translateZ(0);
      backface-visibility: hidden;
    }

    .border-inner::before {
      content: '';
      position: absolute;
      inset: -60%;
      animation: rotate-gradient var(--speed) linear infinite;
      will-change: transform;
      transform: translateZ(0) rotate(0deg);
      transform-origin: center;
      backface-visibility: hidden;
    }

    .border-fallback {
      position: absolute;
      inset: 0;
      z-index: 1;
      border-radius: var(--radius);
      overflow: hidden;
      filter: drop-shadow(0 0 calc(5px * var(--glow)) var(--color1))
              drop-shadow(0 0 calc(2px * var(--glow)) var(--color2));
    }

    .border-edge {
      position: absolute;
      background-size: 200% 200%;
      animation: edge-flow var(--speed) linear infinite;
      will-change: background-position;
    }
    .border-edge.top,
    .border-edge.bottom {
      left: 0;
      right: 0;
      height: var(--thickness);
      background-image: linear-gradient(90deg, var(--color1), var(--color2), var(--color1));
    }
    .border-edge.left,
    .border-edge.right {
      top: 0;
      bottom: 0;
      width: var(--thickness);
      background-image: linear-gradient(180deg, var(--color1), var(--color2), var(--color1));
    }
    .border-edge.top { top: 0; }
    .border-edge.right { right: 0; animation-delay: calc(var(--speed) * -0.25); }
    .border-edge.bottom { bottom: 0; animation-delay: calc(var(--speed) * -0.5); }
    .border-edge.left { left: 0; animation-delay: calc(var(--speed) * -0.75); }

    ${borderStyleCss}

    @supports (-webkit-mask-composite: xor) or (mask-composite: exclude) {
      .border-inner {
        display: block;
      }
      .border-fallback {
        display: none;
      }
    }

    @keyframes rotate-gradient {
      to { transform: translateZ(0) rotate(360deg); }
    }

    @keyframes edge-flow {
      from { background-position: 0% 50%; }
      to { background-position: 200% 50%; }
    }

    .preview-bg {
      position: fixed;
      inset: 0;
      background: #0f1115;
      z-index: -1;
      display: none;
    }
    body[data-preview-bg="1"] .preview-bg { display: block; }
  </style>
</head>
<body data-style="${cfg.style}" data-preview-bg="${isPreview && cfg.showPreviewBackground ? '1' : '0'}">
  <div class="preview-bg"></div>
  <div class="border-container">
    <div class="border-fallback" aria-hidden="true">
      <div class="border-edge top"></div>
      <div class="border-edge right"></div>
      <div class="border-edge bottom"></div>
      <div class="border-edge left"></div>
    </div>
    <div class="border-inner"></div>
  </div>
  ${liveConfigScript}
  <script>
    if (typeof EventSource === 'function') {
      try {
        const source = new EventSource(new URL('/overlay/events?channel=screen-border', window.location.href).href);
        source.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === 'reload') window.location.reload();
          } catch (err) {
            console.warn('[screen-border] ignored malformed event', err);
          }
        };
      } catch (err) {
        console.warn('[screen-border] live reload unavailable', err);
      }
    }
  </script>
</body>
</html>`;
}
