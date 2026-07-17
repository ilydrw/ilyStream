import type { AppSettings } from '../../shared/app-settings'
import { resolveAppThemePalette } from '../../shared/app-themes'

type AppearanceSettings = AppSettings['ui']

export function normalizeInterfaceScale(value: number): number {
  return Number.isFinite(value) ? Math.min(1.3, Math.max(0.8, value)) : 1
}

export function shouldApplyInterfaceScale(location: Pick<Location, 'pathname' | 'search'>): boolean {
  const searchParams = new URLSearchParams(location.search)
  return !location.pathname.startsWith('/overlay/') && !searchParams.has('projectorSceneId')
}

/**
 * Turn the selected workbench palette into the semantic variables consumed by
 * both the current design system and older renderer screens. Keeping this
 * compatibility map here lets a theme control the whole shell instead of only
 * replacing the accent swatch.
 */
export function applyAppAppearance(settings: AppearanceSettings): void {
  const root = document.documentElement
  const palette = resolveAppThemePalette(settings)
  const accent = palette.accent
  const secondary = palette.secondary
  const accentRgb = hexToRgb(accent)
  const secondaryRgb = hexToRgb(secondary)
  const textRgb = hexToRgb(palette.text)

  // Electron page zoom recalculates the CSS viewport as it scales. Root-level
  // CSS zoom does not, which caused 110/120% layouts to overflow the window and
  // left unused borders at lower scales. Presentation surfaces stay pixel-true.
  const uiScale = normalizeInterfaceScale(settings.uiScale)
  const rendererScale = shouldApplyInterfaceScale(window.location) ? uiScale : 1
  root.style.removeProperty('zoom')
  root.dataset.interfaceScale = String(uiScale)
  window.api?.window?.setZoomFactor?.(rendererScale)

  const gradient = `linear-gradient(135deg, ${accent}, ${secondary})`
  const softGradient = `linear-gradient(135deg, ${withAlpha(accent, 0.16)}, ${withAlpha(secondary, 0.11)})`
  const selection = `linear-gradient(90deg, ${withAlpha(accent, 0.15)}, ${withAlpha(secondary, 0.09)}), ${palette.surfaceRaised}`

  root.dataset.theme = settings.theme
  root.dataset.density = settings.density
  root.dataset.reducedMotion = String(settings.reducedMotion)
  root.style.colorScheme = palette.colorScheme

  const variables: Record<string, string> = {
    // Canonical segmented workbench tokens.
    '--theme-canvas': palette.canvas,
    '--theme-canvas-deep': palette.canvasDeep,
    '--theme-chrome': palette.chrome,
    '--theme-sidebar': palette.sidebar,
    '--theme-surface': palette.surface,
    '--theme-surface-raised': palette.surfaceRaised,
    '--theme-surface-hover': palette.surfaceHover,
    '--theme-border': palette.border,
    '--theme-border-strong': palette.borderStrong,
    '--theme-text': palette.text,
    '--theme-text-muted': palette.textMuted,
    '--theme-text-subtle': palette.textSubtle,
    '--theme-accent': accent,
    '--theme-accent-rgb': accentRgb,
    '--theme-secondary': secondary,
    '--theme-secondary-rgb': secondaryRgb,
    '--theme-on-accent': contrastText(accent),
    '--theme-selection': selection,
    '--theme-accent-soft': withAlpha(accent, 0.13),
    '--theme-secondary-soft': withAlpha(secondary, 0.09),
    '--theme-scrollbar': withAlpha(palette.text, palette.colorScheme === 'light' ? 0.22 : 0.17),
    '--theme-scrollbar-hover': withAlpha(palette.text, palette.colorScheme === 'light' ? 0.34 : 0.29),

    // Core renderer colors.
    '--color-background': palette.canvas,
    '--color-bg': palette.canvas,
    '--bg': palette.canvas,
    '--bg-base': palette.canvas,
    '--bg-deep': palette.canvasDeep,
    '--bg-1': palette.sidebar,
    '--bg-2': palette.surface,
    '--bg-3': palette.surfaceHover,
    '--bg-raised': palette.surface,
    '--bg-titlebar': palette.chrome,
    '--color-card': palette.surface,
    '--color-border': palette.border,
    '--color-foreground': palette.text,
    '--color-muted': palette.textMuted,
    '--color-secondary': secondary,
    '--color-text-primary': palette.text,
    '--color-text-secondary': palette.textMuted,

    // Materials and glass surfaces.
    '--mat-thin': withAlpha(palette.text, 0.035),
    '--mat-regular': withAlpha(palette.text, 0.06),
    '--mat-thick': withAlpha(palette.text, 0.09),
    '--mat-chrome': palette.chrome,
    '--bg-soft': withAlpha(palette.text, 0.035),
    '--bg-elev': withAlpha(palette.text, 0.06),
    '--bg-glass': withAlpha(palette.surface, 0.88),
    '--bg-glass-2': withAlpha(palette.surfaceRaised, 0.92),
    '--glass-bg': withAlpha(palette.surface, 0.82),
    '--glass-border': withAlpha(palette.borderStrong, 0.48),
    '--color-bg-glass': withAlpha(palette.surface, 0.82),

    // Text depth and dividers used by the pro-console refresh.
    '--fg': palette.text,
    '--fg-1': palette.text,
    '--fg-2': withAlpha(palette.text, 0.82),
    '--fg-3': palette.textMuted,
    '--fg-4': palette.textSubtle,
    '--fg-5': withAlpha(palette.text, 0.36),
    '--fg-6': withAlpha(palette.text, 0.18),
    '--fg-7': withAlpha(palette.text, 0.1),
    '--line': palette.border,
    '--line-strong': palette.borderStrong,
    '--line-soft': withAlpha(palette.borderStrong, 0.48),
    '--line-hairline': withAlpha(palette.borderStrong, 0.28),
    '--hairline': palette.border,
    '--hairline-strong': palette.borderStrong,
    '--hairline-soft': withAlpha(palette.borderStrong, 0.48),

    // Accent and brand aliases.
    '--color-accent': accent,
    '--color-accent-hover': mixHex(accent, palette.text, 0.2),
    '--color-accent-rgb': accentRgb,
    '--accent': accent,
    '--accent-rgb': accentRgb,
    '--color-brand-cyan': accent,
    '--color-brand-cyan-rgb': accentRgb,
    '--color-brand-magenta': secondary,
    '--color-brand-magenta-rgb': secondaryRgb,
    '--magenta': secondary,
    '--magenta-rgb': secondaryRgb,

    // Gradients and themed elevation.
    '--brand-gradient': gradient,
    '--bg-brand-gradient': gradient,
    '--grad-brand': gradient,
    '--grad-brand-web': gradient,
    '--grad-brand-soft': softGradient,
    '--shadow-accent': `0 0 0 1px ${withAlpha(accent, 0.28)}, 0 10px 26px ${withAlpha(accent, 0.14)}`,
    '--shadow-card': `0 1px 2px ${withAlpha('#000000', palette.colorScheme === 'light' ? 0.1 : 0.3)}, 0 12px 30px ${withAlpha('#000000', palette.colorScheme === 'light' ? 0.08 : 0.22)}`,
    '--shadow-pro-panel': `0 1px 2px ${withAlpha('#000000', palette.colorScheme === 'light' ? 0.1 : 0.3)}, 0 12px 30px ${withAlpha('#000000', palette.colorScheme === 'light' ? 0.08 : 0.22)}, inset 0 1px 0 ${withAlpha(palette.text, 0.06)}`,
    '--shadow-pro-float': `0 18px 58px ${withAlpha('#000000', palette.colorScheme === 'light' ? 0.18 : 0.4)}, inset 0 1px 0 ${withAlpha(palette.text, 0.06)}`,
    '--inset-top': `inset 0 1px 0 ${withAlpha(palette.text, 0.06)}`,
    '--inset-emboss': `inset 0 1px 0 ${withAlpha(palette.text, 0.06)}, inset 0 -1px 0 ${withAlpha('#000000', 0.22)}`,

    // The final compatibility stylesheet still uses these historical names.
    '--google-gray-bg': palette.canvas,
    '--google-gray-shell': palette.sidebar,
    '--google-gray-surface': palette.surface,
    '--google-gray-surface-2': palette.surfaceRaised,
    '--google-gray-surface-3': palette.surfaceHover,
    '--google-gray-line': palette.border,
    '--google-gray-line-soft': withAlpha(palette.borderStrong, 0.48),
    '--google-gray-text': palette.text,
    '--google-gray-muted': palette.textMuted,
    '--google-gray-subtle': palette.textSubtle,

    // Three-stop icon treatment remains theme-specific.
    '--icon-gradient-from': secondary,
    '--icon-gradient-via': mixHex(secondary, accent, 0.5),
    '--icon-gradient-to': accent
  }

  for (const [name, value] of Object.entries(variables)) {
    root.style.setProperty(name, value)
  }

  const [ph, ps, pl] = hexToHsl(accent)
  const [sh, ss, sl] = hexToHsl(secondary)
  root.style.setProperty('--color-primary-h', String(ph))
  root.style.setProperty('--color-primary-s', `${ps}%`)
  root.style.setProperty('--color-primary-l', `${pl}%`)
  root.style.setProperty('--color-secondary-h', String(sh))
  root.style.setProperty('--color-secondary-s', `${ss}%`)
  root.style.setProperty('--color-secondary-l', `${sl}%`)
  root.style.setProperty('--theme-text-rgb', textRgb)
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r}, ${g}, ${b}`
}

function withAlpha(hex: string, alpha: number): string {
  return `rgba(${hexToRgb(hex)}, ${alpha})`
}

function mixHex(a: string, b: string, weightB: number): string {
  const mix = (index: number) => {
    const valueA = parseInt(a.slice(index, index + 2), 16)
    const valueB = parseInt(b.slice(index, index + 2), 16)
    return Math.round(valueA * (1 - weightB) + valueB * weightB)
  }
  return `#${[1, 3, 5].map((index) => mix(index).toString(16).padStart(2, '0')).join('')}`
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrastText(background: string): string {
  return relativeLuminance(background) > 0.5 ? '#111827' : '#ffffff'
}

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2
  if (max === min) return [0, 0, Math.round(lightness * 100)]
  const delta = max - min
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  let hue = 0
  if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6
  else if (max === g) hue = ((b - r) / delta + 2) / 6
  else hue = ((r - g) / delta + 4) / 6
  return [Math.round(hue * 360), Math.round(saturation * 100), Math.round(lightness * 100)]
}
