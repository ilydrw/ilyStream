import { DEFAULT_TEXT_WIDGET_CONFIG, type TextWidgetConfig, type Widget } from '../../../shared/widgets'
import { getAnimationCss } from './animation-utils'

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

function safeHexColor(value: unknown, fallback: string): string {
  const candidate = String(value || '').trim()
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : fallback
}

function hexToRgb(hex: string): string {
  return `${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}`
}

function safeFontFamily(value: unknown): string {
  const candidate = String(value || '').replace(/[^a-z0-9 _-]/gi, '').trim()
  return candidate || DEFAULT_TEXT_WIDGET_CONFIG.fontFamily
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback
}

export function buildTextWidgetHtml(widget?: Pick<Widget, 'config'>, _isPreview = false): string {
  const raw = { ...DEFAULT_TEXT_WIDGET_CONFIG, ...(widget?.config as Partial<TextWidgetConfig> || {}) }
  const textAlign = oneOf(raw.textAlign, ['left', 'center', 'right'] as const, DEFAULT_TEXT_WIDGET_CONFIG.textAlign)
  const verticalAlign = oneOf(raw.verticalAlign, ['top', 'middle', 'bottom'] as const, DEFAULT_TEXT_WIDGET_CONFIG.verticalAlign)
  const fontStyle = oneOf(raw.fontStyle, ['normal', 'italic'] as const, DEFAULT_TEXT_WIDGET_CONFIG.fontStyle)
  const textTransform = oneOf(raw.textTransform, ['none', 'uppercase', 'lowercase'] as const, DEFAULT_TEXT_WIDGET_CONFIG.textTransform)
  const animationStyle = oneOf(raw.animationStyle, ['fade', 'slide', 'zoom', 'none'] as const, DEFAULT_TEXT_WIDGET_CONFIG.animationStyle)
  const animationDuration = Math.round(clamp(raw.animationDuration, 100, 5_000, DEFAULT_TEXT_WIDGET_CONFIG.animationDuration))
  const fontSize = Math.round(clamp(raw.fontSize, 8, 300, DEFAULT_TEXT_WIDGET_CONFIG.fontSize))
  const fontWeight = Math.round(clamp(raw.fontWeight, 100, 900, DEFAULT_TEXT_WIDGET_CONFIG.fontWeight) / 100) * 100
  const letterSpacing = clamp(raw.letterSpacing, -10, 40, DEFAULT_TEXT_WIDGET_CONFIG.letterSpacing)
  const lineHeight = clamp(raw.lineHeight, 0.7, 2.5, DEFAULT_TEXT_WIDGET_CONFIG.lineHeight)
  const outlineWidth = clamp(raw.outlineWidth, 0, 12, DEFAULT_TEXT_WIDGET_CONFIG.outlineWidth)
  const shadowOpacity = clamp(raw.shadowOpacity, 0, 1, DEFAULT_TEXT_WIDGET_CONFIG.shadowOpacity)
  const shadowBlur = clamp(raw.shadowBlur, 0, 80, DEFAULT_TEXT_WIDGET_CONFIG.shadowBlur)
  const shadowOffsetX = clamp(raw.shadowOffsetX, -40, 40, DEFAULT_TEXT_WIDGET_CONFIG.shadowOffsetX)
  const shadowOffsetY = clamp(raw.shadowOffsetY, -40, 40, DEFAULT_TEXT_WIDGET_CONFIG.shadowOffsetY)
  const backgroundOpacity = raw.backgroundEnabled
    ? clamp(raw.backgroundOpacity, 0, 1, DEFAULT_TEXT_WIDGET_CONFIG.backgroundOpacity)
    : 0
  const paddingHorizontal = clamp(raw.paddingHorizontal, 0, 120, DEFAULT_TEXT_WIDGET_CONFIG.paddingHorizontal)
  const paddingVertical = clamp(raw.paddingVertical, 0, 120, DEFAULT_TEXT_WIDGET_CONFIG.paddingVertical)
  const borderRadius = clamp(raw.borderRadius, 0, 100, DEFAULT_TEXT_WIDGET_CONFIG.borderRadius)
  const canvasWidth = Math.round(clamp(raw.canvasWidth, 240, 1_920, DEFAULT_TEXT_WIDGET_CONFIG.canvasWidth))
  const canvasHeight = Math.round(clamp(raw.canvasHeight, 80, 1_080, DEFAULT_TEXT_WIDGET_CONFIG.canvasHeight))
  const textColor = safeHexColor(raw.textColor, DEFAULT_TEXT_WIDGET_CONFIG.textColor)
  const outlineColor = safeHexColor(raw.outlineColor, DEFAULT_TEXT_WIDGET_CONFIG.outlineColor)
  const shadowColor = safeHexColor(raw.shadowColor, DEFAULT_TEXT_WIDGET_CONFIG.shadowColor)
  const backgroundColor = safeHexColor(raw.backgroundColor, DEFAULT_TEXT_WIDGET_CONFIG.backgroundColor)
  const justifyContent = textAlign === 'left' ? 'flex-start' : textAlign === 'right' ? 'flex-end' : 'center'
  const alignItems = verticalAlign === 'top' ? 'flex-start' : verticalAlign === 'bottom' ? 'flex-end' : 'center'
  const configJson = JSON.stringify(raw).replace(/</g, '\\u003c')

  return `<!doctype html>
<html lang="en" data-canvas-width="${canvasWidth}" data-canvas-height="${canvasHeight}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ilyStream Text</title>
    <style>
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; background: transparent !important; overflow: hidden; }
      body {
        display: flex;
        justify-content: ${justifyContent};
        align-items: ${alignItems};
        padding: 12px;
      }
      .text-box {
        display: inline-block;
        max-width: 100%;
        padding: ${paddingVertical}px ${paddingHorizontal}px;
        border-radius: ${borderRadius}px;
        background: rgba(${hexToRgb(backgroundColor)}, ${backgroundOpacity});
        color: ${textColor};
        font-family: "${safeFontFamily(raw.fontFamily)}", system-ui, sans-serif;
        font-size: ${fontSize}px;
        font-weight: ${fontWeight};
        font-style: ${fontStyle};
        line-height: ${lineHeight};
        letter-spacing: ${letterSpacing}px;
        text-align: ${textAlign};
        text-transform: ${textTransform};
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        -webkit-text-stroke: ${outlineWidth}px ${outlineColor};
        paint-order: stroke fill;
        text-shadow: ${shadowOffsetX}px ${shadowOffsetY}px ${shadowBlur}px rgba(${hexToRgb(shadowColor)}, ${shadowOpacity});
      }
      ${getAnimationCss({ style: animationStyle, duration: animationDuration }, '.text-box')}
    </style>
  </head>
  <body>
    <div class="text-box">${escapeHtml(raw.text)}</div>
    <script>
      (function(){
        var TW_LIVE_FIELDS = {
          text: 1, fontFamily: 1, fontSize: 1, fontWeight: 1, fontStyle: 1,
          textAlign: 1, verticalAlign: 1, textTransform: 1, letterSpacing: 1,
          lineHeight: 1, textColor: 1, outlineColor: 1, outlineWidth: 1,
          shadowColor: 1, shadowOpacity: 1, shadowBlur: 1, shadowOffsetX: 1,
          shadowOffsetY: 1, backgroundEnabled: 1, backgroundColor: 1,
          backgroundOpacity: 1, paddingHorizontal: 1, paddingVertical: 1,
          borderRadius: 1, canvasWidth: 1, canvasHeight: 1
        };
        function clampNumber(value, min, max, fallback) {
          var parsed = Number(value);
          return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
        }
        function safeColor(value, fallback) {
          var candidate = String(value || '').trim();
          return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : fallback;
        }
        function rgb(hex) {
          return parseInt(hex.slice(1, 3), 16) + ', ' +
            parseInt(hex.slice(3, 5), 16) + ', ' +
            parseInt(hex.slice(5, 7), 16);
        }
        function safeFont(value) {
          var candidate = String(value || '').replace(/[^a-z0-9 _-]/gi, '').trim();
          return candidate || ${JSON.stringify(DEFAULT_TEXT_WIDGET_CONFIG.fontFamily)};
        }
        function oneOf(value, allowed, fallback) {
          return allowed.indexOf(value) >= 0 ? value : fallback;
        }
        window.__ilystreamLastConfig = ${configJson};
        window.__ilystreamApplyConfig = function(next) {
          if (!next) return true;
          var previous = window.__ilystreamLastConfig || null;
          if (previous) {
            for (var key in next) {
              if (!Object.prototype.hasOwnProperty.call(next, key)) continue;
              if (TW_LIVE_FIELDS[key]) continue;
              if (previous[key] !== next[key]) return false;
            }
          }
          var box = document.querySelector('.text-box');
          if (!box) return false;
          var align = oneOf(next.textAlign, ['left', 'center', 'right'], 'center');
          var vertical = oneOf(next.verticalAlign, ['top', 'middle', 'bottom'], 'middle');
          var textColor = safeColor(next.textColor, '#FFFFFF');
          var outlineColor = safeColor(next.outlineColor, '#000000');
          var shadowColor = safeColor(next.shadowColor, '#000000');
          var backgroundColor = safeColor(next.backgroundColor, '#000000');
          var shadowOpacity = clampNumber(next.shadowOpacity, 0, 1, 0.55);
          var backgroundOpacity = next.backgroundEnabled
            ? clampNumber(next.backgroundOpacity, 0, 1, 0.55)
            : 0;
          document.body.style.justifyContent = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
          document.body.style.alignItems = vertical === 'top' ? 'flex-start' : vertical === 'bottom' ? 'flex-end' : 'center';
          document.documentElement.setAttribute('data-canvas-width', String(Math.round(clampNumber(next.canvasWidth, 240, 1920, 800))));
          document.documentElement.setAttribute('data-canvas-height', String(Math.round(clampNumber(next.canvasHeight, 80, 1080, 240))));
          box.textContent = String(next.text == null ? '' : next.text);
          box.style.padding = clampNumber(next.paddingVertical, 0, 120, 16) + 'px ' + clampNumber(next.paddingHorizontal, 0, 120, 28) + 'px';
          box.style.borderRadius = clampNumber(next.borderRadius, 0, 100, 16) + 'px';
          box.style.background = 'rgba(' + rgb(backgroundColor) + ', ' + backgroundOpacity + ')';
          box.style.color = textColor;
          box.style.fontFamily = '"' + safeFont(next.fontFamily) + '", system-ui, sans-serif';
          box.style.fontSize = Math.round(clampNumber(next.fontSize, 8, 300, 72)) + 'px';
          box.style.fontWeight = String(Math.round(clampNumber(next.fontWeight, 100, 900, 700) / 100) * 100);
          box.style.fontStyle = oneOf(next.fontStyle, ['normal', 'italic'], 'normal');
          box.style.lineHeight = String(clampNumber(next.lineHeight, 0.7, 2.5, 1.1));
          box.style.letterSpacing = clampNumber(next.letterSpacing, -10, 40, 0) + 'px';
          box.style.textAlign = align;
          box.style.textTransform = oneOf(next.textTransform, ['none', 'uppercase', 'lowercase'], 'none');
          box.style.webkitTextStroke = clampNumber(next.outlineWidth, 0, 12, 0) + 'px ' + outlineColor;
          box.style.textShadow = clampNumber(next.shadowOffsetX, -40, 40, 0) + 'px ' +
            clampNumber(next.shadowOffsetY, -40, 40, 4) + 'px ' +
            clampNumber(next.shadowBlur, 0, 80, 12) + 'px rgba(' + rgb(shadowColor) + ', ' + shadowOpacity + ')';
          window.__ilystreamLastConfig = next;
          return true;
        };
      })();
    </script>
  </body>
</html>`
}
