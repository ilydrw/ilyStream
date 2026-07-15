import type { AppTheme } from './settings/types'

export interface AppThemePalette {
  colorScheme: 'dark' | 'light'
  canvas: string
  canvasDeep: string
  chrome: string
  sidebar: string
  surface: string
  surfaceRaised: string
  surfaceHover: string
  border: string
  borderStrong: string
  text: string
  textMuted: string
  textSubtle: string
  accent: string
  secondary: string
}

export interface AppThemeDefinition {
  id: Exclude<AppTheme, 'custom'>
  label: string
  description: string
  palette: AppThemePalette
}

/**
 * Theme metadata and workbench colors live together so the settings preview,
 * summary cards, and runtime CSS variables always describe the same theme.
 */
export const APP_THEME_DEFINITIONS: readonly AppThemeDefinition[] = [
  {
    id: 'dark',
    label: 'Cyber Neon',
    description: 'Neon cyan and magenta on a deep blue-black workbench.',
    palette: {
      colorScheme: 'dark',
      canvas: '#05070d',
      canvasDeep: '#020308',
      chrome: '#080b13',
      sidebar: '#090d17',
      surface: '#0d1321',
      surfaceRaised: '#121a2b',
      surfaceHover: '#19243a',
      border: '#253557',
      borderStrong: '#365179',
      text: '#f5f8ff',
      textMuted: '#9aabd0',
      textSubtle: '#65769d',
      accent: '#19c8ff',
      secondary: '#d035f1'
    }
  },
  {
    id: 'midnight',
    label: 'Midnight',
    description: 'Cool blue focus mode with indigo workbench depth.',
    palette: {
      colorScheme: 'dark',
      canvas: '#070813',
      canvasDeep: '#03040a',
      chrome: '#090b18',
      sidebar: '#0b0d1b',
      surface: '#11152a',
      surfaceRaised: '#171d37',
      surfaceHover: '#202847',
      border: '#2a345a',
      borderStrong: '#3d4c78',
      text: '#f3f5ff',
      textMuted: '#a3abd1',
      textSubtle: '#6f789e',
      accent: '#60a5fa',
      secondary: '#7c3aed'
    }
  },
  {
    id: 'aurora',
    label: 'Aurora',
    description: 'Teal and green live energy across cool forest surfaces.',
    palette: {
      colorScheme: 'dark',
      canvas: '#04100f',
      canvasDeep: '#020807',
      chrome: '#071513',
      sidebar: '#081814',
      surface: '#0d211d',
      surfaceRaised: '#123029',
      surfaceHover: '#194139',
      border: '#24564c',
      borderStrong: '#357368',
      text: '#effffb',
      textMuted: '#9bc9bf',
      textSubtle: '#65958b',
      accent: '#2dd4bf',
      secondary: '#22c55e'
    }
  },
  {
    id: 'ember',
    label: 'Ember',
    description: 'Warm orange and rose contrast on charcoal-red surfaces.',
    palette: {
      colorScheme: 'dark',
      canvas: '#110706',
      canvasDeep: '#080302',
      chrome: '#160a08',
      sidebar: '#180b09',
      surface: '#23100e',
      surfaceRaised: '#321713',
      surfaceHover: '#45201a',
      border: '#613128',
      borderStrong: '#82453a',
      text: '#fff6f1',
      textMuted: '#d4aaa0',
      textSubtle: '#9d7168',
      accent: '#fb923c',
      secondary: '#f43f5e'
    }
  },
  {
    id: 'synthwave',
    label: 'Synthwave',
    description: 'Retro pink and violet afterglow with purple depth.',
    palette: {
      colorScheme: 'dark',
      canvas: '#0d0517',
      canvasDeep: '#050209',
      chrome: '#120720',
      sidebar: '#150923',
      surface: '#1c0d30',
      surfaceRaised: '#281443',
      surfaceHover: '#381b5b',
      border: '#512a78',
      borderStrong: '#70409d',
      text: '#fff4ff',
      textMuted: '#cfadd9',
      textSubtle: '#9876aa',
      accent: '#f472b6',
      secondary: '#7c3aed'
    }
  },
  {
    id: 'gob',
    label: 'Gob the Stopper',
    description: 'High-voltage lime controls on a near-black workbench.',
    palette: {
      colorScheme: 'dark',
      canvas: '#030501',
      canvasDeep: '#010200',
      chrome: '#060901',
      sidebar: '#070b02',
      surface: '#0b1104',
      surfaceRaised: '#111b06',
      surfaceHover: '#1a2909',
      border: '#344d10',
      borderStrong: '#5a7c1c',
      text: '#f7ffe8',
      textMuted: '#b6c98c',
      textSubtle: '#7e9160',
      accent: '#b6ff00',
      secondary: '#8fd400'
    }
  },
  {
    id: 'graphite',
    label: 'Graphite',
    description: 'Monochrome surfaces with quiet, distraction-free contrast.',
    palette: {
      colorScheme: 'dark',
      canvas: '#0b0b0c',
      canvasDeep: '#050506',
      chrome: '#101012',
      sidebar: '#111113',
      surface: '#17171a',
      surfaceRaised: '#202024',
      surfaceHover: '#2b2b30',
      border: '#3b3b42',
      borderStrong: '#55555e',
      text: '#f4f4f5',
      textMuted: '#b0b0b7',
      textSubtle: '#7c7c84',
      accent: '#e4e4e7',
      secondary: '#71717a'
    }
  },
  {
    id: 'light',
    label: 'Daylight',
    description: 'Bright control surfaces with crisp blue-violet actions.',
    palette: {
      colorScheme: 'light',
      canvas: '#eef2f7',
      canvasDeep: '#dde4ed',
      chrome: '#f8fafc',
      sidebar: '#f4f7fb',
      surface: '#ffffff',
      surfaceRaised: '#f7f9fc',
      surfaceHover: '#e8eef6',
      border: '#cbd5e1',
      borderStrong: '#94a3b8',
      text: '#172033',
      textMuted: '#526078',
      textSubtle: '#748197',
      accent: '#0ea5e9',
      secondary: '#8b5cf6'
    }
  }
]

const THEME_BY_ID = new Map(APP_THEME_DEFINITIONS.map((theme) => [theme.id, theme]))

export function getAppThemeDefinition(theme: AppTheme): AppThemeDefinition | undefined {
  if (theme === 'custom') return undefined
  return THEME_BY_ID.get(theme)
}

export function getAppThemeLabel(theme: AppTheme): string {
  return theme === 'custom' ? 'Custom' : getAppThemeDefinition(theme)?.label ?? 'Cyber Neon'
}
