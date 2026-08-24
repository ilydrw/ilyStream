import {
  CUSTOM_PALETTE_TOKENS,
  type AppTheme,
  type CustomColorScheme,
  type CustomPaletteOverrides,
  type UISettings
} from './settings/types'

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
    description: 'Flat cyan with a violet undertone on a deep blue-black workbench.',
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
      secondary: '#a783ff'
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
    id: 'solarized-dark',
    label: 'Solarized Dark',
    description: 'Classic low-contrast teal with Solarized blue and amber accents.',
    palette: {
      colorScheme: 'dark',
      canvas: '#002b36',
      canvasDeep: '#001f27',
      chrome: '#00252e',
      sidebar: '#073642',
      surface: '#0a3b46',
      surfaceRaised: '#104651',
      surfaceHover: '#18535e',
      border: '#2b5962',
      borderStrong: '#586e75',
      text: '#93a1a1',
      textMuted: '#839496',
      textSubtle: '#586e75',
      accent: '#268bd2',
      secondary: '#b58900'
    }
  },
  {
    id: 'solarized-light',
    label: 'Solarized Light',
    description: 'Warm paper surfaces with balanced blue and amber actions.',
    palette: {
      colorScheme: 'light',
      canvas: '#fdf6e3',
      canvasDeep: '#eee8d5',
      chrome: '#fffaf0',
      sidebar: '#eee8d5',
      surface: '#fffdf5',
      surfaceRaised: '#ffffff',
      surfaceHover: '#e7e0cc',
      border: '#d0c8b5',
      borderStrong: '#93a1a1',
      text: '#586e75',
      textMuted: '#657b83',
      textSubtle: '#839496',
      accent: '#268bd2',
      secondary: '#b58900'
    }
  },
  {
    id: 'catppuccin-mocha',
    label: 'Catppuccin Mocha',
    description: 'Pastel blue and mauve over Catppuccin’s deep lavender surfaces.',
    palette: {
      colorScheme: 'dark',
      canvas: '#1e1e2e',
      canvasDeep: '#11111b',
      chrome: '#181825',
      sidebar: '#181825',
      surface: '#313244',
      surfaceRaised: '#45475a',
      surfaceHover: '#585b70',
      border: '#45475a',
      borderStrong: '#585b70',
      text: '#cdd6f4',
      textMuted: '#bac2de',
      textSubtle: '#a6adc8',
      accent: '#89b4fa',
      secondary: '#cba6f7'
    }
  },
  {
    id: 'catppuccin-latte',
    label: 'Catppuccin Latte',
    description: 'Soft daylight lavender with Catppuccin blue and mauve accents.',
    palette: {
      colorScheme: 'light',
      canvas: '#eff1f5',
      canvasDeep: '#dce0e8',
      chrome: '#e6e9ef',
      sidebar: '#e6e9ef',
      surface: '#f8f9fb',
      surfaceRaised: '#ccd0da',
      surfaceHover: '#bcc0cc',
      border: '#bcc0cc',
      borderStrong: '#9ca0b0',
      text: '#4c4f69',
      textMuted: '#5c5f77',
      textSubtle: '#6c6f85',
      accent: '#1e66f5',
      secondary: '#8839ef'
    }
  },
  {
    id: 'dracula',
    label: 'Dracula',
    description: 'Deep violet charcoal with bright cyan and purple actions.',
    palette: {
      colorScheme: 'dark',
      canvas: '#282a36',
      canvasDeep: '#191a21',
      chrome: '#21222c',
      sidebar: '#21222c',
      surface: '#343746',
      surfaceRaised: '#44475a',
      surfaceHover: '#525568',
      border: '#44475a',
      borderStrong: '#6272a4',
      text: '#f8f8f2',
      textMuted: '#c8c8c2',
      textSubtle: '#6272a4',
      accent: '#8be9fd',
      secondary: '#bd93f9'
    }
  },
  {
    id: 'nord',
    label: 'Nord',
    description: 'Arctic blue-gray surfaces with calm frost-colored actions.',
    palette: {
      colorScheme: 'dark',
      canvas: '#2e3440',
      canvasDeep: '#242933',
      chrome: '#272c36',
      sidebar: '#3b4252',
      surface: '#353c4a',
      surfaceRaised: '#434c5e',
      surfaceHover: '#4c566a',
      border: '#4c566a',
      borderStrong: '#5e81ac',
      text: '#eceff4',
      textMuted: '#d8dee9',
      textSubtle: '#8b94a5',
      accent: '#88c0d0',
      secondary: '#81a1c1'
    }
  },
  {
    id: 'tokyo-night',
    label: 'Tokyo Night',
    description: 'Inky navy surfaces with luminous blue and violet accents.',
    palette: {
      colorScheme: 'dark',
      canvas: '#1a1b26',
      canvasDeep: '#16161e',
      chrome: '#16161e',
      sidebar: '#1f2335',
      surface: '#24283b',
      surfaceRaised: '#2f3549',
      surfaceHover: '#414868',
      border: '#3b4261',
      borderStrong: '#565f89',
      text: '#c0caf5',
      textMuted: '#a9b1d6',
      textSubtle: '#565f89',
      accent: '#7aa2f7',
      secondary: '#bb9af7'
    }
  },
  {
    id: 'gruvbox-dark',
    label: 'Gruvbox Dark',
    description: 'Warm retro earth tones with golden and aqua actions.',
    palette: {
      colorScheme: 'dark',
      canvas: '#282828',
      canvasDeep: '#1d2021',
      chrome: '#1d2021',
      sidebar: '#32302f',
      surface: '#3c3836',
      surfaceRaised: '#504945',
      surfaceHover: '#665c54',
      border: '#504945',
      borderStrong: '#7c6f64',
      text: '#ebdbb2',
      textMuted: '#d5c4a1',
      textSubtle: '#928374',
      accent: '#fabd2f',
      secondary: '#8ec07c'
    }
  },
  {
    id: 'one-dark',
    label: 'One Dark',
    description: 'Familiar editor charcoal with crisp blue and purple accents.',
    palette: {
      colorScheme: 'dark',
      canvas: '#282c34',
      canvasDeep: '#21252b',
      chrome: '#21252b',
      sidebar: '#252931',
      surface: '#2f343f',
      surfaceRaised: '#3a404c',
      surfaceHover: '#4b5263',
      border: '#3e4451',
      borderStrong: '#5c6370',
      text: '#abb2bf',
      textMuted: '#9da5b4',
      textSubtle: '#5c6370',
      accent: '#61afef',
      secondary: '#c678dd'
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

// Compile-time guarantee that every overridable token is a real palette key.
// If AppThemePalette and CUSTOM_PALETTE_TOKENS drift apart, this stops building.
const _tokenKeyCheck: readonly (keyof AppThemePalette)[] = CUSTOM_PALETTE_TOKENS
void _tokenKeyCheck

/**
 * Resolve the exact runtime palette for the current UI settings. This is
 * shared by the renderer and LAN companions so both surfaces render the same
 * saved theme, including custom colors, per-token overrides, and accent.
 */
export function resolveAppThemePalette(settings: UISettings): AppThemePalette {
  if (settings.theme === 'custom') {
    const derived = deriveCustomPalette(
      settings.customBackground,
      settings.customSecondary,
      settings.accentColor,
      settings.customColorScheme
    )
    const withOverrides = applyPaletteOverrides(derived, settings.customPalette)
    return {
      ...withOverrides,
      accent: isHexColor(settings.accentColor) ? settings.accentColor : withOverrides.accent
    }
  }

  const base = getAppThemeDefinition(settings.theme)?.palette ?? getAppThemeDefinition('dark')!.palette
  return {
    ...base,
    accent: isHexColor(settings.accentColor) ? settings.accentColor : base.accent
  }
}

/**
 * Build a full palette from three base colors. The color scheme can be forced
 * light or dark, or inferred from the background when set to 'auto'. This is
 * exported so the settings editor can show the derived value of each token as
 * the starting point before the user overrides it.
 */
export function deriveCustomPalette(
  background: string,
  secondaryColor: string,
  accentColor: string,
  scheme: CustomColorScheme = 'auto'
): AppThemePalette {
  const canvas = isHexColor(background) ? background : '#0b0d12'
  const secondary = isHexColor(secondaryColor) ? secondaryColor : '#d035f1'
  const accent = isHexColor(accentColor) ? accentColor : '#19c8ff'
  const colorScheme: 'dark' | 'light' =
    scheme === 'auto' ? (relativeLuminance(canvas) > 0.48 ? 'light' : 'dark') : scheme
  const text = colorScheme === 'light' ? '#172033' : '#f5f8ff'

  return {
    colorScheme,
    canvas,
    canvasDeep: mixHex(canvas, '#000000', colorScheme === 'light' ? 0.09 : 0.32),
    chrome: mixHex(canvas, text, colorScheme === 'light' ? 0.025 : 0.045),
    sidebar: mixHex(canvas, text, colorScheme === 'light' ? 0.035 : 0.055),
    surface: mixHex(canvas, text, colorScheme === 'light' ? 0.06 : 0.08),
    surfaceRaised: mixHex(canvas, text, colorScheme === 'light' ? 0.1 : 0.13),
    surfaceHover: mixHex(canvas, text, colorScheme === 'light' ? 0.15 : 0.19),
    border: mixHex(canvas, text, colorScheme === 'light' ? 0.2 : 0.24),
    borderStrong: mixHex(canvas, text, colorScheme === 'light' ? 0.32 : 0.36),
    text,
    textMuted: mixHex(canvas, text, 0.66),
    textSubtle: mixHex(canvas, text, 0.46),
    accent,
    secondary
  }
}

/** Layer valid hex overrides on top of a derived palette; ignores junk values. */
export function applyPaletteOverrides(
  palette: AppThemePalette,
  overrides: CustomPaletteOverrides | undefined
): AppThemePalette {
  if (!overrides) return palette
  const next = { ...palette }
  for (const token of CUSTOM_PALETTE_TOKENS) {
    const value = overrides[token]
    if (typeof value === 'string' && isHexColor(value)) {
      next[token] = value
    }
  }
  return next
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value)
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
