import { DEFAULT_CAMERA_FRAME_CONFIG, type CameraFrameConfig } from '../../../shared/widgets'

const SHAPES = ['rectangle', 'square', 'rounded', 'circle', 'ellipse', 'pill', 'hexagon', 'diamond'] as const
const FIXED_RATIO_SHAPES = new Set<CameraFrameConfig['shape']>(['square', 'circle', 'hexagon', 'diamond'])

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

function fontFamilyValue(value: unknown, fallback: string): string {
  const candidate = String(value || '').trim()
  return /^[a-z0-9 _-]{1,64}$/i.test(candidate) ? candidate : fallback
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function rgba(value: string, opacity: number): string {
  const raw = value.slice(1)
  const expanded = raw.length === 3 || raw.length === 4
    ? raw.split('').map(char => char + char).join('')
    : raw
  const red = parseInt(expanded.slice(0, 2), 16)
  const green = parseInt(expanded.slice(2, 4), 16)
  const blue = parseInt(expanded.slice(4, 6), 16)
  const intrinsicAlpha = expanded.length === 8 ? parseInt(expanded.slice(6, 8), 16) / 255 : 1
  return `rgba(${red}, ${green}, ${blue}, ${Math.min(1, Math.max(0, opacity * intrinsicAlpha))})`
}

function shapeElement(
  shape: CameraFrameConfig['shape'],
  pad: number,
  cornerRadius: number,
  attributes: string
): string {
  const size = 1000 - pad * 2
  const center = 500
  const radius = 500 - pad
  const roundedRadius = Math.min(size / 2, Math.max(0, cornerRadius * 2.5))

  switch (shape) {
    case 'circle':
      return `<circle cx="${center}" cy="${center}" r="${radius}" ${attributes} />`
    case 'ellipse':
      return `<ellipse cx="${center}" cy="${center}" rx="${radius}" ry="${radius}" ${attributes} />`
    case 'pill':
      return `<rect x="${pad}" y="${pad}" width="${size}" height="${size}" rx="${size / 2}" ${attributes} />`
    case 'hexagon':
      return `<polygon points="500,${pad} ${1000 - pad},250 ${1000 - pad},750 500,${1000 - pad} ${pad},750 ${pad},250" ${attributes} />`
    case 'diamond':
      return `<polygon points="500,${pad} ${1000 - pad},500 500,${1000 - pad} ${pad},500" ${attributes} />`
    case 'rounded':
      return `<rect x="${pad}" y="${pad}" width="${size}" height="${size}" rx="${roundedRadius}" ${attributes} />`
    case 'rectangle':
    case 'square':
    default:
      return `<rect x="${pad}" y="${pad}" width="${size}" height="${size}" ${attributes} />`
  }
}

function decorationMarkup(style: CameraFrameConfig['decorationStyle'], size: number, pad: number): string {
  if (style === 'none') return ''
  const end = 1000 - pad
  const reach = Math.min(220, Math.max(24, size * 2.5))

  if (style === 'corners') {
    return `<path class="frame-decoration" d="M ${pad + reach} ${pad} H ${pad} V ${pad + reach} M ${end - reach} ${pad} H ${end} V ${pad + reach} M ${end} ${end - reach} V ${end} H ${end - reach} M ${pad + reach} ${end} H ${pad} V ${end - reach}" />`
  }

  if (style === 'ticks') {
    return `<path class="frame-decoration" d="M 500 ${pad} V ${pad + reach} M ${end} 500 H ${end - reach} M 500 ${end} V ${end - reach} M ${pad} 500 H ${pad + reach}" />`
  }

  const nodeRadius = Math.max(10, Math.min(42, size * 0.45))
  return `<g class="frame-nodes"><circle cx="500" cy="${pad}" r="${nodeRadius}" /><circle cx="${end}" cy="500" r="${nodeRadius}" /><circle cx="500" cy="${end}" r="${nodeRadius}" /><circle cx="${pad}" cy="500" r="${nodeRadius}" /></g>`
}

export function buildCameraFrameHtml(widget?: any, isPreview = false): string {
  const raw: CameraFrameConfig = { ...DEFAULT_CAMERA_FRAME_CONFIG, ...(widget?.config || {}) }
  const shape = enumValue(raw.shape, SHAPES, DEFAULT_CAMERA_FRAME_CONFIG.shape)
  const frameStyle = enumValue(raw.frameStyle, ['solid', 'double', 'dashed', 'accent'] as const, DEFAULT_CAMERA_FRAME_CONFIG.frameStyle)
  const lineCap = enumValue(raw.lineCap, ['round', 'square'] as const, DEFAULT_CAMERA_FRAME_CONFIG.lineCap)
  const decorationStyle = enumValue(raw.decorationStyle, ['none', 'corners', 'ticks', 'nodes'] as const, DEFAULT_CAMERA_FRAME_CONFIG.decorationStyle)
  const labelPosition = enumValue(raw.labelPosition, ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'] as const, DEFAULT_CAMERA_FRAME_CONFIG.labelPosition)
  const animationStyle = enumValue(raw.animationStyle, ['none', 'march', 'orbit'] as const, DEFAULT_CAMERA_FRAME_CONFIG.animationStyle)

  const frameInset = numberValue(raw.frameInset, DEFAULT_CAMERA_FRAME_CONFIG.frameInset, 0, 120)
  const borderWidth = numberValue(raw.borderWidth, DEFAULT_CAMERA_FRAME_CONFIG.borderWidth, 1, 40)
  const secondaryBorderWidth = numberValue(raw.secondaryBorderWidth, DEFAULT_CAMERA_FRAME_CONFIG.secondaryBorderWidth, 1, 24)
  const cornerRadius = numberValue(raw.cornerRadius, DEFAULT_CAMERA_FRAME_CONFIG.cornerRadius, 0, 240)
  const doubleGap = numberValue(raw.doubleGap, DEFAULT_CAMERA_FRAME_CONFIG.doubleGap, 2, 40)
  const dashLength = numberValue(raw.dashLength, DEFAULT_CAMERA_FRAME_CONFIG.dashLength, 4, 120)
  const dashGap = numberValue(raw.dashGap, DEFAULT_CAMERA_FRAME_CONFIG.dashGap, 2, 120)
  const opacity = numberValue(raw.opacity, DEFAULT_CAMERA_FRAME_CONFIG.opacity, 0, 1)
  const glowIntensity = numberValue(raw.glowIntensity, DEFAULT_CAMERA_FRAME_CONFIG.glowIntensity, 0, 1)
  const shadowIntensity = numberValue(raw.shadowIntensity, DEFAULT_CAMERA_FRAME_CONFIG.shadowIntensity, 0, 1)
  const matteOpacity = numberValue(raw.matteOpacity, DEFAULT_CAMERA_FRAME_CONFIG.matteOpacity, 0, 1)
  const decorationSize = numberValue(raw.decorationSize, DEFAULT_CAMERA_FRAME_CONFIG.decorationSize, 12, 120)
  const labelBackgroundOpacity = numberValue(raw.labelBackgroundOpacity, DEFAULT_CAMERA_FRAME_CONFIG.labelBackgroundOpacity, 0, 1)
  const animationSpeed = numberValue(raw.animationSpeed, DEFAULT_CAMERA_FRAME_CONFIG.animationSpeed, 1, 30)

  const primaryColor = colorValue(raw.primaryColor, DEFAULT_CAMERA_FRAME_CONFIG.primaryColor)
  const secondaryColor = colorValue(raw.secondaryColor, DEFAULT_CAMERA_FRAME_CONFIG.secondaryColor)
  const matteColor = colorValue(raw.matteColor, DEFAULT_CAMERA_FRAME_CONFIG.matteColor)
  const labelTextColor = colorValue(raw.labelTextColor, DEFAULT_CAMERA_FRAME_CONFIG.labelTextColor)
  const labelBackgroundColor = colorValue(raw.labelBackgroundColor, DEFAULT_CAMERA_FRAME_CONFIG.labelBackgroundColor)
  const fontFamily = fontFamilyValue(raw.fontFamily, DEFAULT_CAMERA_FRAME_CONFIG.fontFamily)

  const pathPad = Math.max(24, Math.ceil(borderWidth * 2.5))
  const innerPad = Math.min(360, pathPad + doubleGap * 3)
  const fixedRatio = FIXED_RATIO_SHAPES.has(shape)
  const matteEnabled = raw.matteEnabled === true
  const labelEnabled = raw.labelEnabled === true && String(raw.labelText || '').trim().length > 0
  const frameAttributes = 'fill="none" pathLength="1000" vector-effect="non-scaling-stroke"'
  const cutoutShape = shapeElement(shape, pathPad, cornerRadius, 'fill="#000"')
  const primaryShape = shapeElement(shape, pathPad, cornerRadius, `class="frame-line frame-primary" ${frameAttributes}`)
  const secondaryShape = shapeElement(shape, innerPad, Math.max(0, cornerRadius - doubleGap), `class="frame-line frame-secondary" ${frameAttributes}`)
  const accentShape = shapeElement(shape, pathPad, cornerRadius, `class="frame-line frame-accent" ${frameAttributes}`)
  const decoration = decorationMarkup(decorationStyle, decorationSize, pathPad)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Camera Mask Outline</title>
  <style>
    :root {
      --primary: ${primaryColor};
      --secondary: ${secondaryColor};
      --frame-opacity: ${opacity};
      --border-width: ${borderWidth}px;
      --secondary-width: ${secondaryBorderWidth}px;
      --dash-length: ${dashLength};
      --dash-gap: ${dashGap};
      --animation-speed: ${animationSpeed}s;
      --matte: ${rgba(matteColor, matteOpacity)};
      --label-text: ${labelTextColor};
      --label-bg: ${rgba(labelBackgroundColor, labelBackgroundOpacity)};
    }

    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: transparent;
      font-family: "${fontFamily}", "Segoe UI", sans-serif;
    }

    .preview-scene {
      position: fixed;
      inset: 0;
      display: none;
      place-items: center;
      overflow: hidden;
      background: #11161f;
      color: rgba(255, 255, 255, 0.28);
    }
    body[data-preview-bg="1"] .preview-scene { display: grid; }
    .preview-grid {
      position: absolute;
      inset: 0;
      opacity: 0.16;
      background-size: 48px 48px;
      background-image: linear-gradient(#7f8da31f 1px, transparent 1px), linear-gradient(90deg, #7f8da31f 1px, transparent 1px);
    }
    .preview-person { position: relative; width: min(34vw, 260px); aspect-ratio: 0.72; }
    .preview-head {
      position: absolute;
      top: 2%;
      left: 50%;
      width: 42%;
      aspect-ratio: 1;
      transform: translateX(-50%);
      border-radius: 50%;
      background: #293342;
    }
    .preview-shoulders {
      position: absolute;
      left: 50%;
      bottom: -8%;
      width: 100%;
      height: 62%;
      transform: translateX(-50%);
      border-radius: 50% 50% 18% 18%;
      background: #293342;
    }
    .preview-caption {
      position: absolute;
      right: 18px;
      bottom: 14px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.18em;
    }

    .frame-stage {
      position: fixed;
      inset: ${frameInset}px;
      display: grid;
      place-items: center;
      z-index: 2;
      pointer-events: none;
    }
    .frame-shell {
      position: relative;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      isolation: isolate;
    }
    body[data-fixed-ratio="1"] .frame-shell {
      width: min(100%, calc(100vh - ${frameInset * 2}px));
      height: min(100%, calc(100vw - ${frameInset * 2}px));
      aspect-ratio: 1;
    }
    body[data-matte="1"] .frame-shell { box-shadow: 0 0 0 200vmax var(--matte); }

    /* Keep the SVG out of grid sizing. Its intrinsic square ratio otherwise
       makes flexible shapes taller than short/wide browser-source viewports,
       which clips the bottom and leaves only the top half of the outline. */
    .frame-svg {
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .frame-matte { display: none; }
    body[data-matte="1"] .frame-matte { display: block; }
    .frame-line {
      opacity: var(--frame-opacity);
      stroke-linejoin: round;
      stroke-linecap: ${lineCap};
      filter: url(#frame-effects);
    }
    .frame-primary { stroke: var(--primary); stroke-width: var(--border-width); }
    .frame-secondary {
      display: none;
      stroke: var(--secondary);
      stroke-width: var(--secondary-width);
    }
    .frame-accent {
      display: none;
      stroke: var(--secondary);
      stroke-width: var(--secondary-width);
      stroke-dasharray: 150 850;
    }
    body[data-frame-style="double"] .frame-secondary { display: block; }
    body[data-frame-style="dashed"] .frame-primary { stroke-dasharray: var(--dash-length) var(--dash-gap); }
    body[data-frame-style="accent"] .frame-accent { display: block; }
    body[data-animation="march"] .frame-primary {
      stroke-dasharray: var(--dash-length) var(--dash-gap);
      animation: dash-march var(--animation-speed) linear infinite;
    }
    body[data-animation="orbit"] .frame-accent {
      display: block;
      animation: accent-orbit var(--animation-speed) linear infinite;
    }

    .frame-decoration {
      fill: none;
      stroke: var(--secondary);
      stroke-width: var(--secondary-width);
      stroke-linecap: ${lineCap};
      stroke-linejoin: round;
      opacity: var(--frame-opacity);
      vector-effect: non-scaling-stroke;
      filter: url(#frame-effects);
    }
    .frame-nodes circle {
      fill: var(--secondary);
      opacity: var(--frame-opacity);
      filter: url(#frame-effects);
    }

    .frame-label {
      position: absolute;
      z-index: 4;
      display: flex;
      align-items: center;
      min-height: 28px;
      max-width: 72%;
      padding: 7px 12px 6px;
      border: 1px solid ${rgba(secondaryColor, 0.55)};
      border-radius: 999px;
      background: var(--label-bg);
      color: var(--label-text);
      box-shadow: 0 8px 24px ${rgba('#000000', shadowIntensity * 0.5)};
      font-size: clamp(10px, 1.7vmin, 16px);
      font-weight: 800;
      letter-spacing: 0.16em;
      line-height: 1;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .frame-label::before {
      content: '';
      width: 6px;
      height: 6px;
      margin-right: 8px;
      border-radius: 50%;
      background: var(--secondary);
      box-shadow: 0 0 10px ${rgba(secondaryColor, 0.85)};
    }
    .frame-label[data-position="top-left"] { top: 0; left: 5%; transform: translateY(-50%); }
    .frame-label[data-position="top-center"] { top: 0; left: 50%; transform: translate(-50%, -50%); }
    .frame-label[data-position="top-right"] { top: 0; right: 5%; transform: translateY(-50%); }
    .frame-label[data-position="bottom-left"] { bottom: 0; left: 5%; transform: translateY(50%); }
    .frame-label[data-position="bottom-center"] { bottom: 0; left: 50%; transform: translate(-50%, 50%); }
    .frame-label[data-position="bottom-right"] { right: 5%; bottom: 0; transform: translateY(50%); }

    @keyframes dash-march { to { stroke-dashoffset: -1000; } }
    @keyframes accent-orbit { to { stroke-dashoffset: -1000; } }
    @media (prefers-reduced-motion: reduce) { .frame-line { animation: none !important; } }
  </style>
</head>
<body
  data-frame-style="${frameStyle}"
  data-animation="${animationStyle}"
  data-fixed-ratio="${fixedRatio ? '1' : '0'}"
  data-matte="${matteEnabled ? '1' : '0'}"
  data-preview-bg="${isPreview && raw.showPreviewBackground !== false ? '1' : '0'}"
>
  <div class="preview-scene" aria-hidden="true">
    <div class="preview-grid"></div>
    <div class="preview-person"><span class="preview-head"></span><span class="preview-shoulders"></span></div>
    <span class="preview-caption">CAMERA PREVIEW</span>
  </div>
  <main class="frame-stage" aria-label="Camera mask outline overlay">
    <div class="frame-shell">
      <svg class="frame-svg" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <mask id="camera-cutout">
            <rect width="1000" height="1000" fill="#fff" />
            ${cutoutShape}
          </mask>
          <filter id="frame-effects" x="-80%" y="-80%" width="260%" height="260%">
            <feDropShadow dx="0" dy="0" stdDeviation="${1 + glowIntensity * 12}" flood-color="${primaryColor}" flood-opacity="${glowIntensity}" />
            <feDropShadow dx="0" dy="${1 + shadowIntensity * 8}" stdDeviation="${1 + shadowIntensity * 8}" flood-color="#000000" flood-opacity="${shadowIntensity * 0.72}" />
          </filter>
        </defs>
        <rect class="frame-matte" width="1000" height="1000" fill="${rgba(matteColor, matteOpacity)}" mask="url(#camera-cutout)" />
        ${primaryShape}
        ${secondaryShape}
        ${accentShape}
        ${decoration}
      </svg>
      ${labelEnabled ? `<div class="frame-label" data-position="${labelPosition}">${escapeHtml(raw.labelText)}</div>` : ''}
    </div>
  </main>
  <script>
    (function () {
      if (typeof EventSource === 'function' && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
        try {
          var source = new EventSource(new URL('/overlay/events?channel=camera-frame', window.location.href).href);
          source.onmessage = function (event) {
            try {
              var message = JSON.parse(event.data);
              if (message && message.type === 'reload') window.location.reload();
            } catch (err) {
              console.warn('[camera-frame] ignored malformed event', err);
            }
          };
        } catch (err) {
          console.warn('[camera-frame] live reload unavailable', err);
        }
      }
    })();
  </script>
</body>
</html>`
}
