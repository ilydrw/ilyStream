import type { AppSettings, AppTheme } from '../../shared/app-settings'

type AppearanceSettings = AppSettings['ui']

const THEME_PALETTES: Record<AppTheme, {
  background: string
  card: string
  border: string
  muted: string
  secondary: string
  accent: string
  primaryHsl: [number, number, number]
  secondaryHsl: [number, number, number]
}> = {
  dark: {
    background: '#0a0a0c',
    card: '#121216',
    border: '#1e1e24',
    muted: '#71717a',
    secondary: '#18181b',
    accent: '#19c8ff',
    primaryHsl: [194, 100, 55],
    secondaryHsl: [289, 88, 58]
  },
  midnight: {
    background: '#030305',
    card: '#08080a',
    border: '#121215',
    muted: '#52525b',
    secondary: '#0a0a0d',
    accent: '#6366f1',
    primaryHsl: [239, 84, 67],
    secondaryHsl: [261, 84, 57]
  },
  aurora: {
    background: '#050a0a',
    card: '#0a1414',
    border: '#122525',
    muted: '#4d7c7c',
    secondary: '#071212',
    accent: '#2dd4bf',
    primaryHsl: [174, 65, 50],
    secondaryHsl: [142, 70, 45]
  },
  ember: {
    background: '#0a0505',
    card: '#140a0a',
    border: '#251212',
    muted: '#7c4d4d',
    secondary: '#120707',
    accent: '#f43f5e',
    primaryHsl: [25, 95, 61],
    secondaryHsl: [351, 89, 60]
  },
  light: {
    background: '#f4f4f5',
    card: '#ffffff',
    border: '#e4e4e7',
    muted: '#71717a',
    secondary: '#fafafa',
    accent: '#0ea5e9',
    primaryHsl: [199, 89, 48],
    secondaryHsl: [0, 0, 98]
  },
  joker: {
    background: '#0a050c',
    card: '#120a16',
    border: '#1ddd33',
    muted: '#71717a',
    secondary: '#ab5dce',
    accent: '#1ddd33',
    primaryHsl: [127, 74, 52],
    secondaryHsl: [281, 55, 59]
  }
}

export function applyAppAppearance(settings: AppearanceSettings): void {
  const root = document.documentElement
  const palette = THEME_PALETTES[settings.theme] ?? THEME_PALETTES.dark
  const accent = /^#[0-9a-f]{6}$/i.test(settings.accentColor) ? settings.accentColor : palette.accent
  const accentRgb = hexToRgb(accent)
  
  const gradientEnd = settings.theme === 'joker' ? palette.secondary : lightenHex(accent, 0.15)
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
  const r = Math.min(255, Math.floor(parseInt(hex.slice(1, 3), 16) * (1 + amount)))
  const g = Math.min(255, Math.floor(parseInt(hex.slice(3, 5), 16) * (1 + amount)))
  const b = Math.min(255, Math.floor(parseInt(hex.slice(5, 7), 16) * (1 + amount)))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}
