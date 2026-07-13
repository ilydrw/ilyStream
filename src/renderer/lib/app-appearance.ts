import type { AppSettings, AppTheme } from '../../shared/app-settings'

type AppearanceSettings = AppSettings['ui']

interface ThemePalette {
  background: string
  card: string
  border: string
  muted: string
  secondary: string
  accent: string
  primaryHsl: [number, number, number]
  secondaryHsl: [number, number, number]
  iconGradient: [string, string, string]
  /** Explicit brand-gradient end color; defaults to a lightened accent. */
  gradientEnd?: string
}

const THEME_PALETTES: Record<Exclude<AppTheme, 'custom'>, ThemePalette> = {
  // 'dark' is the default theme — Cyber Neon: cyan and magenta on near-black.
  dark: {
    background: '#03050a',
    card: '#090b14',
    border: '#1c2947',
    muted: '#8b9ac6',
    secondary: '#0d1224',
    accent: '#19c8ff',
    primaryHsl: [194, 100, 55],
    secondaryHsl: [289, 88, 58],
    iconGradient: ['#D035F1', '#7A8CFF', '#19C8FF'],
    gradientEnd: '#d035f1'
  },
  midnight: {
    background: '#030305',
    card: '#08080a',
    border: '#121215',
    muted: '#52525b',
    secondary: '#0a0a0d',
    accent: '#6366f1',
    primaryHsl: [239, 84, 67],
    secondaryHsl: [261, 84, 57],
    iconGradient: ['#EC4899', '#6366F1', '#06B6D4']
  },
  aurora: {
    background: '#050a0a',
    card: '#0a1414',
    border: '#122525',
    muted: '#4d7c7c',
    secondary: '#071212',
    accent: '#2dd4bf',
    primaryHsl: [174, 65, 50],
    secondaryHsl: [142, 70, 45],
    iconGradient: ['#10B981', '#2DD4BF', '#22D3EE']
  },
  ember: {
    background: '#0a0505',
    card: '#140a0a',
    border: '#251212',
    muted: '#7c4d4d',
    secondary: '#120707',
    accent: '#f43f5e',
    primaryHsl: [25, 95, 61],
    secondaryHsl: [351, 89, 60],
    iconGradient: ['#F97316', '#F43F5E', '#EC4899']
  },
  light: {
    background: '#f4f4f5',
    card: '#ffffff',
    border: '#e4e4e7',
    muted: '#71717a',
    secondary: '#fafafa',
    accent: '#0ea5e9',
    primaryHsl: [199, 89, 48],
    secondaryHsl: [0, 0, 98],
    iconGradient: ['#A855F7', '#3B82F6', '#0EA5E9']
  },
  gob: {
    background: '#050505',
    card: '#0c0e08',
    border: '#8fd400',
    muted: '#8a9660',
    secondary: '#101208',
    accent: '#b6ff00',
    primaryHsl: [77, 100, 50],
    secondaryHsl: [72, 38, 5],
    iconGradient: ['#B6FF00', '#F7FFE8', '#8FD400'],
    gradientEnd: '#050505'
  },
  synthwave: {
    background: '#0c0514',
    card: '#150a22',
    border: '#2c1650',
    muted: '#8d7ba8',
    secondary: '#1a0d2e',
    accent: '#f472b6',
    primaryHsl: [329, 86, 70],
    secondaryHsl: [262, 83, 58],
    iconGradient: ['#F472B6', '#A855F7', '#7C3AED'],
    gradientEnd: '#7c3aed'
  },
  graphite: {
    background: '#0b0b0c',
    card: '#131315',
    border: '#26262a',
    muted: '#7c7c84',
    secondary: '#18181b',
    accent: '#e4e4e7',
    primaryHsl: [240, 6, 90],
    secondaryHsl: [240, 5, 10],
    iconGradient: ['#FAFAFA', '#A1A1AA', '#52525B']
  }
}

/**
 * Derive a full palette from the two colors the user picks for the custom
 * theme: a base background and a secondary. Cards, borders, and muted text
 * are progressively lightened steps of the background so any base tone works.
 */
function buildCustomPalette(settings: AppearanceSettings): ThemePalette {
  const background = /^#[0-9a-f]{6}$/i.test(settings.customBackground) ? settings.customBackground : '#0b0d12'
  const secondary = /^#[0-9a-f]{6}$/i.test(settings.customSecondary) ? settings.customSecondary : '#d035f1'
  const accent = /^#[0-9a-f]{6}$/i.test(settings.accentColor) ? settings.accentColor : '#19c8ff'

  return {
    background,
    card: lightenHex(background, 0.45),
    border: lightenHex(background, 1.4),
    muted: mixHex(background, '#9aa0a6', 0.75),
    secondary: lightenHex(background, 0.25),
    accent,
    primaryHsl: hexToHsl(accent),
    secondaryHsl: hexToHsl(secondary),
    iconGradient: [secondary, mixHex(secondary, accent, 0.5), accent]
  }
}

export function applyAppAppearance(settings: AppearanceSettings): void {
  const root = document.documentElement
  const palette = settings.theme === 'custom'
    ? buildCustomPalette(settings)
    : THEME_PALETTES[settings.theme] ?? THEME_PALETTES.dark
  const accent = /^#[0-9a-f]{6}$/i.test(settings.accentColor) ? settings.accentColor : palette.accent
  const accentRgb = hexToRgb(accent)

  // Global interface zoom. Chromium's non-standard `zoom` scales layout,
  // which works with the px-based styles used throughout the app (rem
  // scaling would miss them).
  const uiScale = Number.isFinite(settings.uiScale) ? Math.min(1.3, Math.max(0.8, settings.uiScale)) : 1
  ;(root.style as CSSStyleDeclaration & { zoom: string }).zoom = uiScale === 1 ? '' : String(uiScale)

  const gradientEnd = palette.gradientEnd ?? lightenHex(accent, 0.15)
  const gradient = `linear-gradient(135deg, ${accent}, ${gradientEnd})`

  root.dataset.theme = settings.theme
  root.dataset.density = settings.density
  root.dataset.reducedMotion = String(settings.reducedMotion)

  // Core colors
  root.style.setProperty('--color-background', palette.background)
  root.style.setProperty('--bg', palette.background)
  root.style.setProperty('--color-card', palette.card)
  root.style.setProperty('--color-border', palette.border)
  root.style.setProperty('--color-muted', palette.muted)
  root.style.setProperty('--color-secondary', palette.secondary)
  root.style.setProperty('--color-accent', accent)
  root.style.setProperty('--color-accent-hover', lightenHex(accent, 0.28))
  root.style.setProperty('--color-accent-rgb', accentRgb)
  root.style.setProperty('--accent-rgb', accentRgb)
  
  // Gradients
  root.style.setProperty('--brand-gradient', gradient)
  root.style.setProperty('--bg-brand-gradient', gradient)
  root.style.setProperty('--grad-brand', gradient)
  root.style.setProperty('--grad-brand-web', gradient)

  // Icon gradient stops (3-stop, themed)
  root.style.setProperty('--icon-gradient-from', palette.iconGradient[0])
  root.style.setProperty('--icon-gradient-via', palette.iconGradient[1])
  root.style.setProperty('--icon-gradient-to', palette.iconGradient[2])

  // HSL Tokens for legacy compatibility and depth
  const [ph, ps, pl] = palette.primaryHsl
  const [sh, ss, sl] = palette.secondaryHsl
  root.style.setProperty('--color-primary-h', String(ph))
  root.style.setProperty('--color-primary-s', `${ps}%`)
  root.style.setProperty('--color-primary-l', `${pl}%`)
  root.style.setProperty('--color-secondary-h', String(sh))
  root.style.setProperty('--color-secondary-s', `${ss}%`)
  root.style.setProperty('--color-secondary-l', `${sl}%`)
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r}, ${g}, ${b}`
}

function lightenHex(hex: string, amount: number): string {
  // Additive floor keeps near-black backgrounds from staying pinned at black
  // when multiplied (0 * anything = 0).
  const floor = Math.round(18 * amount)
  const r = Math.min(255, Math.floor(parseInt(hex.slice(1, 3), 16) * (1 + amount)) + floor)
  const g = Math.min(255, Math.floor(parseInt(hex.slice(3, 5), 16) * (1 + amount)) + floor)
  const b = Math.min(255, Math.floor(parseInt(hex.slice(5, 7), 16) * (1 + amount)) + floor)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function mixHex(a: string, b: string, weightB: number): string {
  const mix = (i: number) => {
    const va = parseInt(a.slice(i, i + 2), 16)
    const vb = parseInt(b.slice(i, i + 2), 16)
    return Math.round(va * (1 - weightB) + vb * weightB)
  }
  return `#${[1, 3, 5].map(i => mix(i).toString(16).padStart(2, '0')).join('')}`
}

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, Math.round(l * 100)]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}
