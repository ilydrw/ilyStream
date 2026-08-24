import { DEFAULT_BRB_SCREEN_CONFIG, type BrbScreenConfig } from '../../../shared/widgets'
import { getAnimationCss } from './animation-utils'

const CONTENT_POSITIONS = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'middle-center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right'
] as const

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback
}

function numberValue(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

function colorValue(value: unknown, fallback: string): string {
  const candidate = String(value || '').trim()
  return /^#[0-9a-f]{3,8}$/i.test(candidate) && [4, 5, 7, 9].includes(candidate.length)
    ? candidate
    : fallback
}

function rgba(value: string, opacity: number): string {
  const raw = value.slice(1)
  const expanded = raw.length === 3 || raw.length === 4
    ? raw.split('').map(char => char + char).join('')
    : raw
  const rgb = expanded.slice(0, 6)
  const intrinsicAlpha = expanded.length === 8 ? parseInt(expanded.slice(6, 8), 16) / 255 : 1
  const red = parseInt(rgb.slice(0, 2), 16)
  const green = parseInt(rgb.slice(2, 4), 16)
  const blue = parseInt(rgb.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${Math.min(1, Math.max(0, opacity * intrinsicAlpha))})`
}

function fontFamilyValue(value: unknown, fallback: string): string {
  const candidate = String(value || '').trim()
  return /^[a-z0-9 _-]{1,64}$/i.test(candidate) ? candidate : fallback
}

function mediaUrlValue(value: unknown): string {
  const candidate = String(value || '').trim()
  if (!candidate || candidate.length > 4096) return ''
  if (/^\/(?!\/)/.test(candidate)) return candidate
  if (/^(?:https?:|blob:|data:image\/)/i.test(candidate)) return candidate
  return ''
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function scriptValue(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function decorationMarkup(style: BrbScreenConfig['decorationStyle']): string {
  if (style === 'orbit') {
    return `<div class="decor decor-orbit" aria-hidden="true">
      <div class="decor-motion">
        <span class="orbit orbit-one"></span>
        <span class="orbit orbit-two"></span>
        <span class="orbit-dot"></span>
      </div>
    </div>`
  }

  if (style === 'lines') {
    return `<div class="decor decor-lines" aria-hidden="true"><div class="decor-motion">
      <span></span><span></span><span></span><span></span><span></span>
    </div></div>`
  }

  if (style === 'dots') {
    return `<div class="decor decor-dots" aria-hidden="true"><div class="decor-motion">
      ${Array.from({ length: 25 }, () => '<span></span>').join('')}
    </div></div>`
  }

  return ''
}

export function buildBrbScreenHtml(widget?: any, isPreview = false): string {
  const raw: BrbScreenConfig = { ...DEFAULT_BRB_SCREEN_CONFIG, ...(widget?.config || {}) }
  const position = enumValue(raw.contentPosition, CONTENT_POSITIONS, DEFAULT_BRB_SCREEN_CONFIG.contentPosition)
  const [verticalPosition, horizontalPosition] = position.split('-')
  const textAlign = enumValue(raw.textAlign, ['left', 'center', 'right'] as const, DEFAULT_BRB_SCREEN_CONFIG.textAlign)
  const decorationStyle = enumValue(raw.decorationStyle, ['orbit', 'lines', 'dots', 'none'] as const, DEFAULT_BRB_SCREEN_CONFIG.decorationStyle)
  const decorationMotion = enumValue(raw.decorationMotion, ['rotate', 'float', 'still'] as const, DEFAULT_BRB_SCREEN_CONFIG.decorationMotion)
  const backgroundImageFit = enumValue(raw.backgroundImageFit, ['cover', 'contain'] as const, DEFAULT_BRB_SCREEN_CONFIG.backgroundImageFit)
  const aspectRatio = enumValue(raw.aspectRatio, ['auto', 'tiktok', 'landscape'] as const, DEFAULT_BRB_SCREEN_CONFIG.aspectRatio)
  const clockFormat = enumValue(raw.clockFormat, ['12-hour', '24-hour'] as const, DEFAULT_BRB_SCREEN_CONFIG.clockFormat)
  const animationStyle = enumValue(raw.animationStyle, ['fade', 'slide', 'zoom', 'none'] as const, DEFAULT_BRB_SCREEN_CONFIG.animationStyle)

  const backgroundColor = colorValue(raw.backgroundColor, DEFAULT_BRB_SCREEN_CONFIG.backgroundColor)
  const accentColor = colorValue(raw.accentColor, DEFAULT_BRB_SCREEN_CONFIG.accentColor)
  const secondaryColor = colorValue(raw.secondaryColor, DEFAULT_BRB_SCREEN_CONFIG.secondaryColor)
  const textColor = colorValue(raw.textColor, DEFAULT_BRB_SCREEN_CONFIG.textColor)
  const mutedTextColor = colorValue(raw.mutedTextColor, DEFAULT_BRB_SCREEN_CONFIG.mutedTextColor)
  const panelColor = colorValue(raw.panelColor, DEFAULT_BRB_SCREEN_CONFIG.panelColor)
  const backgroundOpacity = numberValue(raw.backgroundOpacity, DEFAULT_BRB_SCREEN_CONFIG.backgroundOpacity, 0, 1)
  const backgroundImageOpacity = numberValue(raw.backgroundImageOpacity, DEFAULT_BRB_SCREEN_CONFIG.backgroundImageOpacity, 0, 1)
  const backgroundImageBlur = numberValue(raw.backgroundImageBlur, DEFAULT_BRB_SCREEN_CONFIG.backgroundImageBlur, 0, 40)
  const contentWidth = numberValue(raw.contentWidth, DEFAULT_BRB_SCREEN_CONFIG.contentWidth, 320, 1500)
  const scale = numberValue(raw.scale, DEFAULT_BRB_SCREEN_CONFIG.scale, 0.5, 1.5)
  const titleSize = numberValue(raw.titleSize, DEFAULT_BRB_SCREEN_CONFIG.titleSize, 42, 180)
  const decorationOpacity = numberValue(raw.decorationOpacity, DEFAULT_BRB_SCREEN_CONFIG.decorationOpacity, 0, 1)
  const decorationSpeed = numberValue(raw.decorationSpeed, DEFAULT_BRB_SCREEN_CONFIG.decorationSpeed, 4, 60)
  const panelOpacity = numberValue(raw.panelOpacity, DEFAULT_BRB_SCREEN_CONFIG.panelOpacity, 0, 1)
  const panelBlur = numberValue(raw.panelBlur, DEFAULT_BRB_SCREEN_CONFIG.panelBlur, 0, 40)
  const borderRadius = numberValue(raw.borderRadius, DEFAULT_BRB_SCREEN_CONFIG.borderRadius, 0, 60)
  const countdownMinutes = numberValue(raw.countdownMinutes, DEFAULT_BRB_SCREEN_CONFIG.countdownMinutes, 0.5, 180)
  const animationDuration = numberValue(raw.animationDuration, DEFAULT_BRB_SCREEN_CONFIG.animationDuration || 900, 200, 2000)
  const fontFamily = fontFamilyValue(raw.fontFamily, DEFAULT_BRB_SCREEN_CONFIG.fontFamily)
  const backgroundImageUrl = mediaUrlValue(raw.backgroundImageUrl)

  const justifyContent = horizontalPosition === 'left' ? 'flex-start' : horizontalPosition === 'right' ? 'flex-end' : 'center'
  const alignItems = verticalPosition === 'top' ? 'flex-start' : verticalPosition === 'bottom' ? 'flex-end' : 'center'
  const transformOrigin = `${horizontalPosition === 'left' ? 'left' : horizontalPosition === 'right' ? 'right' : 'center'} ${verticalPosition === 'top' ? 'top' : verticalPosition === 'bottom' ? 'bottom' : 'center'}`
  const decorAnchor = horizontalPosition === 'left'
    ? 'right: 8%; top: 50%; transform: translateY(-50%);'
    : horizontalPosition === 'right'
      ? 'left: 8%; top: 50%; transform: translateY(-50%);'
      : 'left: 50%; top: 50%; transform: translate(-50%, -50%);'
  const motionAnimation = decorationMotion === 'rotate'
    ? `decor-rotate ${decorationSpeed}s linear infinite`
    : decorationMotion === 'float'
      ? `decor-float ${decorationSpeed}s ease-in-out infinite alternate`
      : 'none'

  const showEyebrow = raw.showEyebrow !== false && String(raw.eyebrow || '').trim().length > 0
  const showMessage = raw.showMessage !== false && String(raw.message || '').trim().length > 0
  const showFooter = raw.showFooter !== false && String(raw.footerText || '').trim().length > 0
  const showClock = raw.showLocalTime === true
  const showCountdown = raw.countdownEnabled === true
  const showMeta = showClock || showCountdown

  return `<!DOCTYPE html>
<html lang="en" data-force-tiktok="${raw.forceTikTokDimensions ? '1' : '0'}" data-aspect="${aspectRatio}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Be Right Back</title>
  <style>
    :root {
      --accent: ${accentColor};
      --secondary: ${secondaryColor};
      --text: ${textColor};
      --muted: ${mutedTextColor};
      --title-size: ${titleSize}px;
      --content-width: ${contentWidth}px;
      --scale: ${scale};
      --decor-opacity: ${decorationOpacity};
      --panel-radius: ${borderRadius}px;
      --media-blur: ${backgroundImageBlur}px;
    }

    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: transparent;
    }
    html[data-force-tiktok="0"], html[data-force-tiktok="0"] body { width: 100vw; height: 100vh; }
    html[data-force-tiktok="1"], html[data-force-tiktok="1"] body { width: 1080px; height: 1920px; }

    body {
      color: var(--text);
      font-family: "${fontFamily}", "Segoe UI", Arial, sans-serif;
      text-rendering: geometricPrecision;
    }

    .stage {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: ${justifyContent};
      align-items: ${alignItems};
      padding: clamp(48px, 7vw, 144px);
      isolation: isolate;
      overflow: hidden;
      background: ${rgba(backgroundColor, backgroundOpacity)};
    }

    html[data-force-tiktok="0"][data-aspect="tiktok"] .stage {
      width: min(100%, calc(100vh * 9 / 16));
      margin-inline: auto;
    }
    html[data-force-tiktok="0"][data-aspect="landscape"] .stage {
      height: min(100%, calc(100vw * 9 / 16));
      margin-block: auto;
    }

    .background-media {
      position: absolute;
      inset: calc(var(--media-blur) * -2 - 2px);
      z-index: -3;
      opacity: ${backgroundImageUrl ? backgroundImageOpacity : 0};
      background-position: center;
      background-repeat: no-repeat;
      background-size: ${backgroundImageFit};
      filter: blur(var(--media-blur));
      transform: scale(1.02);
    }

    .edge-rule {
      position: absolute;
      z-index: -1;
      background: var(--accent);
      opacity: 0.75;
    }
    .edge-rule.top { top: 0; left: 7%; width: 18%; height: 3px; }
    .edge-rule.side { top: 8%; right: 0; width: 3px; height: 15%; background: var(--secondary); }

    .content-shell {
      position: relative;
      z-index: 2;
      width: min(var(--content-width), calc(100vw - clamp(96px, 14vw, 288px)));
      text-align: ${textAlign};
    }
    .content {
      transform: scale(var(--scale));
      transform-origin: ${transformOrigin};
      ${raw.panelEnabled ? `
      padding: clamp(28px, 3.2vw, 58px);
      border-radius: var(--panel-radius);
      background: ${rgba(panelColor, panelOpacity)};
      backdrop-filter: blur(${panelBlur}px);
      -webkit-backdrop-filter: blur(${panelBlur}px);
      ${raw.showPanelBorder ? `border: 1px solid ${rgba(textColor, 0.14)};` : ''}
      box-shadow: 0 28px 90px rgba(0, 0, 0, 0.24);
      ` : ''}
    }
    ${getAnimationCss({ style: animationStyle, duration: animationDuration }, '.content-shell')}

    .eyebrow {
      display: flex;
      align-items: center;
      justify-content: ${textAlign === 'left' ? 'flex-start' : textAlign === 'right' ? 'flex-end' : 'center'};
      gap: 14px;
      margin-bottom: clamp(18px, 2vw, 32px);
      color: var(--accent);
      font-size: clamp(13px, 1.1vw, 19px);
      font-weight: 750;
      letter-spacing: 0.22em;
      line-height: 1;
    }
    .eyebrow-mark { width: 42px; height: 2px; flex: 0 0 auto; background: currentColor; }

    h1 {
      margin: 0;
      max-width: 100%;
      color: var(--text);
      font-size: clamp(42px, var(--title-size), 180px);
      font-weight: 850;
      letter-spacing: -0.055em;
      line-height: 0.9;
      text-transform: uppercase;
      overflow-wrap: anywhere;
    }

    .message {
      max-width: 740px;
      margin: clamp(22px, 2.4vw, 38px) ${textAlign === 'center' ? 'auto' : textAlign === 'right' ? '0 0 0 auto' : '0'} 0;
      color: var(--muted);
      font-size: clamp(18px, 1.45vw, 27px);
      font-weight: 450;
      line-height: 1.55;
      letter-spacing: -0.012em;
    }

    .meta {
      display: flex;
      justify-content: ${textAlign === 'left' ? 'flex-start' : textAlign === 'right' ? 'flex-end' : 'center'};
      align-items: flex-end;
      flex-wrap: wrap;
      gap: 22px 44px;
      margin-top: clamp(30px, 3.2vw, 52px);
    }
    .meta-item { min-width: 130px; }
    .meta-label {
      display: block;
      margin-bottom: 7px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.18em;
      line-height: 1;
    }
    .meta-value {
      display: block;
      color: var(--text);
      font-size: clamp(24px, 2vw, 38px);
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      letter-spacing: -0.035em;
      line-height: 1;
    }
    .countdown.complete .meta-value { color: var(--accent); font-size: clamp(18px, 1.4vw, 26px); letter-spacing: 0.06em; }

    .progress {
      position: relative;
      width: min(360px, 100%);
      height: 3px;
      margin-top: 15px;
      overflow: hidden;
      background: ${rgba(mutedTextColor, 0.22)};
    }
    .progress-fill {
      position: absolute;
      inset: 0;
      background: var(--accent);
      transform: scaleX(1);
      transform-origin: left center;
      transition: transform 0.35s linear;
    }

    .footer {
      margin-top: clamp(28px, 4vw, 64px);
      color: var(--muted);
      font-size: clamp(12px, 0.9vw, 16px);
      font-weight: 650;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }

    .decor {
      position: absolute;
      ${decorAnchor}
      z-index: -1;
      opacity: var(--decor-opacity);
      pointer-events: none;
    }
    .decor-motion { position: relative; width: 100%; height: 100%; animation: ${motionAnimation}; }

    .decor-orbit { width: clamp(260px, 32vw, 560px); aspect-ratio: 1; }
    .orbit { position: absolute; border-radius: 50%; }
    .orbit-one { inset: 5%; border: clamp(2px, 0.22vw, 4px) solid var(--accent); }
    .orbit-two { inset: 24%; border: 1px solid var(--secondary); opacity: 0.72; }
    .orbit-dot {
      position: absolute;
      top: 3%;
      left: 48%;
      width: clamp(10px, 1vw, 18px);
      aspect-ratio: 1;
      border-radius: 50%;
      background: var(--secondary);
      box-shadow: 0 0 26px ${rgba(secondaryColor, 0.72)};
    }

    .decor-lines { width: clamp(280px, 30vw, 540px); height: clamp(240px, 38vh, 520px); }
    .decor-lines span { position: absolute; right: 0; height: 2px; background: var(--accent); }
    .decor-lines span:nth-child(1) { top: 10%; width: 92%; }
    .decor-lines span:nth-child(2) { top: 30%; width: 60%; background: var(--secondary); }
    .decor-lines span:nth-child(3) { top: 50%; width: 78%; }
    .decor-lines span:nth-child(4) { top: 70%; width: 42%; background: var(--secondary); }
    .decor-lines span:nth-child(5) { top: 90%; width: 68%; }

    .decor-dots { width: clamp(190px, 20vw, 340px); aspect-ratio: 1; }
    .decor-dots .decor-motion { display: grid; grid-template-columns: repeat(5, 1fr); gap: clamp(16px, 2vw, 34px); }
    .decor-dots span { width: clamp(4px, 0.55vw, 9px); aspect-ratio: 1; border-radius: 50%; background: var(--accent); }
    .decor-dots span:nth-child(3n) { background: var(--secondary); opacity: 0.65; }
    .decor-dots span:nth-child(4n) { opacity: 0.3; }

    @keyframes decor-rotate { to { transform: rotate(360deg); } }
    @keyframes decor-float { from { transform: translate3d(-14px, -18px, 0); } to { transform: translate3d(18px, 16px, 0); } }

    @media (max-aspect-ratio: 3/4) {
      .stage { padding: clamp(52px, 8vw, 96px); }
      .content-shell { width: min(var(--content-width), calc(100vw - clamp(104px, 16vw, 192px))); }
      .decor { opacity: calc(var(--decor-opacity) * 0.58); }
      .decor-orbit { width: min(64vw, 560px); }
      .message { font-size: clamp(19px, 2.5vw, 27px); }
      .meta { gap: 26px; }
    }

    @media (prefers-reduced-motion: reduce) {
      .decor-motion, .content-shell { animation: none !important; }
      .progress-fill { transition: none; }
    }
  </style>
</head>
<body data-preview="${isPreview ? '1' : '0'}">
  <main class="stage">
    <div class="background-media" aria-hidden="true"></div>
    <span class="edge-rule top" aria-hidden="true"></span>
    <span class="edge-rule side" aria-hidden="true"></span>
    ${decorationMarkup(decorationStyle)}
    <div class="content-shell">
      <section class="content" aria-label="Be right back message">
        ${showEyebrow ? `<div class="eyebrow"><span class="eyebrow-mark"></span><span>${escapeHtml(raw.eyebrow)}</span></div>` : ''}
        <h1>${escapeHtml(raw.title || DEFAULT_BRB_SCREEN_CONFIG.title)}</h1>
        ${showMessage ? `<p class="message">${escapeHtml(raw.message)}</p>` : ''}
        ${showMeta ? `<div class="meta">
          ${showClock ? `<div class="meta-item clock"><span class="meta-label">LOCAL TIME</span><strong class="meta-value" id="local-time">--:--</strong></div>` : ''}
          ${showCountdown ? `<div class="meta-item countdown" id="countdown-wrap"><span class="meta-label">${escapeHtml(raw.countdownLabel || DEFAULT_BRB_SCREEN_CONFIG.countdownLabel)}</span><strong class="meta-value" id="countdown-value">--:--</strong>${raw.showCountdownProgress !== false ? '<div class="progress"><span class="progress-fill" id="countdown-progress"></span></div>' : ''}</div>` : ''}
        </div>` : ''}
        ${showFooter ? `<div class="footer">${escapeHtml(raw.footerText)}</div>` : ''}
      </section>
    </div>
  </main>
  <script>
    (function () {
      var mediaUrl = ${scriptValue(backgroundImageUrl)};
      var media = document.querySelector('.background-media');
      if (media && mediaUrl) media.style.backgroundImage = 'url(' + JSON.stringify(mediaUrl) + ')';

      var clock = document.getElementById('local-time');
      function updateClock() {
        if (!clock) return;
        try {
          clock.textContent = new Date().toLocaleTimeString([], {
            hour: 'numeric', minute: '2-digit', hour12: ${clockFormat === '12-hour' ? 'true' : 'false'}
          });
        } catch (err) {
          clock.textContent = new Date().toTimeString().slice(0, 5);
        }
      }
      updateClock();
      if (clock) window.setInterval(updateClock, 1000);

      var countdown = document.getElementById('countdown-value');
      var countdownWrap = document.getElementById('countdown-wrap');
      var progress = document.getElementById('countdown-progress');
      var totalSeconds = ${Math.round(countdownMinutes * 60)};
      var countdownEndsAt = Date.now() + totalSeconds * 1000;
      var completeText = ${scriptValue(String(raw.countdownCompleteText || DEFAULT_BRB_SCREEN_CONFIG.countdownCompleteText))};

      function formatDuration(seconds) {
        var hours = Math.floor(seconds / 3600);
        var minutes = Math.floor((seconds % 3600) / 60);
        var secs = seconds % 60;
        if (hours > 0) return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
        return String(minutes).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
      }

      function updateCountdown() {
        if (!countdown) return;
        var remaining = Math.max(0, Math.ceil((countdownEndsAt - Date.now()) / 1000));
        if (remaining <= 0) {
          countdown.textContent = completeText;
          if (countdownWrap) countdownWrap.classList.add('complete');
        } else {
          countdown.textContent = formatDuration(remaining);
        }
        if (progress) progress.style.transform = 'scaleX(' + (remaining / totalSeconds) + ')';
      }
      updateCountdown();
      if (countdown) window.setInterval(updateCountdown, 250);

      if (typeof EventSource === 'function' && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
        try {
          var source = new EventSource(new URL('/overlay/events?channel=brb-screen', window.location.href).href);
          source.onmessage = function (event) {
            try {
              var message = JSON.parse(event.data);
              if (message && message.type === 'reload') window.location.reload();
            } catch (err) {
              console.warn('[brb-screen] ignored malformed event', err);
            }
          };
        } catch (err) {
          console.warn('[brb-screen] live reload unavailable', err);
        }
      }
    })();
  </script>
</body>
</html>`
}
