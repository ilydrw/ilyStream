import type { AppSettings, AppTheme } from '../../shared/app-settings'

type AppearanceSettings = Pick<AppSettings, 'theme' | 'accentColor' | 'interfaceDensity' | 'reducedMotion'>

const THEME_PALETTES: Record<AppTheme, {
  background: string
  card: string
  border: string
  muted: string
  secondary: string
}> = {
  dark: {
    background: '#0f1115',
    card: 'rgba(255, 255, 255, 0.04)',
    border: 'rgba(255, 255, 255, 0.08)',
    muted: 'rgba(255, 255, 255, 0.4)',
    secondary: '#d035f1'
  },
  midnight: {
    background: '#080d18',
    card: 'rgba(113, 148, 255, 0.06)',
    border: 'rgba(147, 197, 253, 0.1)',
    muted: 'rgba(214, 226, 255, 0.42)',
    secondary: '#7c3aed'
  },
  aurora: {
    background: '#07130f',
    card: 'rgba(94, 234, 212, 0.055)',
    border: 'rgba(74, 222, 128, 0.1)',
    muted: 'rgba(220, 252, 231, 0.4)',
    secondary: '#22c55e'
  },
  ember: {
    background: '#150d0a',
    card: 'rgba(251, 146, 60, 0.06)',
    border: 'rgba(251, 191, 36, 0.11)',
    muted: 'rgba(255, 237, 213, 0.38)',
    secondary: '#f43f5e'
  },
  light: {
    background: '#111318',
    card: 'rgba(255, 255, 255, 0.055)',
    border: 'rgba(255, 255, 255, 0.11)',
    muted: 'rgba(255, 255, 255, 0.46)',
    secondary: '#94a3b8'
  }
}

function hexToRgb(hex: string): string {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : '19c8ff'
  const red = parseInt(normalized.slice(0, 2), 16)
  const green = parseInt(normalized.slice(2, 4), 16)
  const blue = parseInt(normalized.slice(4, 6), 16)
  return `${red}, ${green}, ${blue}`
}

function lightenHex(hex: string, amount: number): string {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : '19c8ff'
  const parts = [0, 2, 4].map((offset) => {
    const channel = parseInt(normalized.slice(offset, offset + 2), 16)
    return Math.min(255, Math.round(channel + (255 - channel) * amount))
      .toString(16)
      .padStart(2, '0')
  })
  return `#${parts.join('')}`
}

export function applyAppAppearance(settings: AppearanceSettings): void {
  if (typeof document === 'undefined') return

  const palette = THEME_PALETTES[settings.theme] ?? THEME_PALETTES.dark
  const accent = /^#[0-9a-f]{6}$/i.test(settings.accentColor) ? settings.accentColor : '#19c8ff'
  const accentRgb = hexToRgb(accent)
  const gradient = `linear-gradient(135deg, ${accent}, ${palette.secondary})`
  const root = document.documentElement

  root.dataset.theme = settings.theme
  root.dataset.density = settings.interfaceDensity
  root.dataset.reducedMotion = String(settings.reducedMotion)
  root.style.setProperty('--color-background', palette.background)
  root.style.setProperty('--color-card', palette.card)
  root.style.setProperty('--color-border', palette.border)
  root.style.setProperty('--color-muted', palette.muted)
  root.style.setProperty('--color-accent', accent)
  root.style.setProperty('--color-accent-hover', lightenHex(accent, 0.28))
  root.style.setProperty('--color-accent-rgb', accentRgb)
  root.style.setProperty('--accent-rgb', accentRgb)
  root.style.setProperty('--brand-gradient', gradient)
  root.style.setProperty('--bg-brand-gradient', gradient)
}
