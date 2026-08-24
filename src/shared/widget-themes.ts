export type WidgetThemeId =
  | 'cyber'
  | 'chroma'
  | 'midnight'
  | 'aurora'
  | 'ember'
  | 'synthwave'
  | 'solid'
  | 'gob-the-stopper'
export type WidgetThemeStyle = 'classic' | 'chroma' | 'cyber' | 'gob-the-stopper'
export type WidgetThemeBorderType = 'solid' | 'chroma' | 'cyber' | 'gob-the-stopper'

export interface WidgetThemeColors {
  primary: string
  secondary: string
  accent: string
  background: string
  surface: string
  text: string
  muted: string
  border: string
}

export interface WidgetTheme {
  id: WidgetThemeId
  name: string
  description: string
  colors: WidgetThemeColors
  previewColors: readonly string[]
  style: WidgetThemeStyle
  borderType: WidgetThemeBorderType
}

export const DEFAULT_WIDGET_THEME_ID: WidgetThemeId = 'cyber'

export const WIDGET_THEMES: WidgetTheme[] = [
  {
    id: 'cyber',
    name: 'Cyber Neon',
    description: 'Neon cyan and magenta with darker sci-fi contrast.',
    style: 'cyber',
    borderType: 'cyber',
    previewColors: ['#19C8FF', '#D035F1', '#00FFFF', '#090B14'],
    colors: {
      primary: '#19C8FF',
      secondary: '#D035F1',
      accent: '#00FFFF',
      background: '#03050A',
      surface: '#090B14',
      text: '#F8FAFC',
      muted: '#8B9AC6',
      border: '#D035F1'
    }
  },
  {
    id: 'chroma',
    name: 'Chroma',
    description: 'Rainbow motion gradients for high-energy overlays.',
    style: 'chroma',
    borderType: 'chroma',
    previewColors: ['#FF3B30', '#FFD60A', '#34D399', '#00E5FF', '#3B82F6', '#D946EF', '#FF3B30'],
    colors: {
      primary: '#FF3B30',
      secondary: '#00E5FF',
      accent: '#FFD60A',
      background: '#07040F',
      surface: '#140B20',
      text: '#FFFFFF',
      muted: '#A78BFA',
      border: '#D946EF'
    }
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Cool blue and indigo for a restrained late-night look.',
    style: 'classic',
    borderType: 'solid',
    previewColors: ['#60A5FA', '#7C3AED', '#818CF8', '#070813'],
    colors: {
      primary: '#60A5FA',
      secondary: '#7C3AED',
      accent: '#818CF8',
      background: '#070813',
      surface: '#11152A',
      text: '#F3F5FF',
      muted: '#A3ABD1',
      border: '#3D4C78'
    }
  },
  {
    id: 'aurora',
    name: 'Aurora',
    description: 'Teal and green energy over deep forest surfaces.',
    style: 'classic',
    borderType: 'solid',
    previewColors: ['#2DD4BF', '#22C55E', '#A3E635', '#04100F'],
    colors: {
      primary: '#2DD4BF',
      secondary: '#22C55E',
      accent: '#A3E635',
      background: '#04100F',
      surface: '#0D211D',
      text: '#EFFFFB',
      muted: '#9BC9BF',
      border: '#357368'
    }
  },
  {
    id: 'ember',
    name: 'Ember',
    description: 'Warm orange, gold, and rose on charcoal-red panels.',
    style: 'classic',
    borderType: 'solid',
    previewColors: ['#FB923C', '#FACC15', '#F43F5E', '#110706'],
    colors: {
      primary: '#FB923C',
      secondary: '#F43F5E',
      accent: '#FACC15',
      background: '#110706',
      surface: '#23100E',
      text: '#FFF6F1',
      muted: '#D4AAA0',
      border: '#82453A'
    }
  },
  {
    id: 'synthwave',
    name: 'Synthwave',
    description: 'Retro pink, violet, and electric blue afterglow.',
    style: 'classic',
    borderType: 'solid',
    previewColors: ['#F472B6', '#7C3AED', '#22D3EE', '#0D0517'],
    colors: {
      primary: '#F472B6',
      secondary: '#7C3AED',
      accent: '#22D3EE',
      background: '#0D0517',
      surface: '#1C0D30',
      text: '#FFF4FF',
      muted: '#CFADD9',
      border: '#70409D'
    }
  },
  {
    id: 'solid',
    name: 'Solid',
    description: 'Single-color borders and restrained high-contrast panels.',
    style: 'classic',
    borderType: 'solid',
    previewColors: ['#FFFFFF', '#CBD5E1', '#38BDF8', '#080A0F'],
    colors: {
      primary: '#FFFFFF',
      secondary: '#FFFFFF',
      accent: '#38BDF8',
      background: '#080A0F',
      surface: '#111827',
      text: '#FFFFFF',
      muted: '#CBD5E1',
      border: '#FFFFFF'
    }
  },
  {
    id: 'gob-the-stopper',
    name: 'Gob the Stopper',
    description: 'High-voltage lime green on jet black.',
    style: 'gob-the-stopper',
    borderType: 'gob-the-stopper',
    previewColors: ['#B6FF00', '#F7FFE8', '#8FD400', '#020402'],
    colors: {
      primary: '#B6FF00',
      secondary: '#050505',
      accent: '#8FD400',
      background: '#020402',
      surface: '#071107',
      text: '#F7FFE8',
      muted: '#A6B879',
      border: '#B6FF00'
    }
  }
]

const WIDGET_STYLE_VALUES = new Set<WidgetThemeStyle>(['classic', 'chroma', 'cyber', 'gob-the-stopper'])
const BORDER_TYPE_VALUES = new Set<WidgetThemeBorderType>(['solid', 'chroma', 'cyber', 'gob-the-stopper'])

const COLOR_KEY_MAP: Record<string, keyof WidgetThemeColors> = {
  accentColor: 'primary',
  primaryColor: 'primary',
  secondaryColor: 'secondary',
  backgroundColor: 'background',
  labelBackgroundColor: 'surface',
  labelTextColor: 'text',
  matteColor: 'background',
  mutedTextColor: 'muted',
  outlineColor: 'border',
  panelColor: 'surface',
  borderColor: 'border',
  crownColor: 'accent',
  shadowColor: 'background',
  speakingColor: 'accent',
  color1: 'primary',
  color2: 'secondary',
  color: 'primary',
  iconColor: 'primary',
  textColor: 'text'
}

const COMMON_THEME_COLORS = {
  accentColor: 'primary',
  primaryColor: 'primary',
  secondaryColor: 'secondary',
  backgroundColor: 'background',
  borderColor: 'border',
  color1: 'primary',
  color2: 'secondary',
  textColor: 'text',
  iconColor: 'primary'
} satisfies Record<string, keyof WidgetThemeColors>

function applyThemeToValue(value: unknown, theme: WidgetTheme): unknown {
  if (Array.isArray(value)) return value.map((item) => applyThemeToValue(item, theme))
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => {
      if (key === 'style' && typeof child === 'string' && WIDGET_STYLE_VALUES.has(child as WidgetThemeStyle)) {
        return [key, theme.style]
      }
      if (key === 'borderType' && typeof child === 'string' && BORDER_TYPE_VALUES.has(child as WidgetThemeBorderType)) {
        return [key, theme.borderType]
      }
      if (key === 'showBorder' && typeof child === 'boolean' && theme.borderType) {
        return [key, true]
      }

      const colorKey = COLOR_KEY_MAP[key]
      return [key, colorKey ? theme.colors[colorKey] : applyThemeToValue(child, theme)]
    })
  )
}

export function getWidgetTheme(themeId: string): WidgetTheme {
  return WIDGET_THEMES.find((theme) => theme.id === themeId)
    ?? WIDGET_THEMES.find((theme) => theme.id === DEFAULT_WIDGET_THEME_ID)!
}

/**
 * Theme presets are useful only when a widget already exposes a color or
 * theme-style field that the preset system understands. This keeps the editor
 * from offering a control that would only add unused config properties.
 */
export function widgetConfigSupportsThemes(config: unknown): boolean {
  if (Array.isArray(config)) return config.some(widgetConfigSupportsThemes)
  if (!config || typeof config !== 'object') return false

  return Object.entries(config as Record<string, unknown>).some(([key, value]) => {
    if (key in COLOR_KEY_MAP) return true
    if (key === 'style' && typeof value === 'string' && WIDGET_STYLE_VALUES.has(value as WidgetThemeStyle)) {
      return true
    }
    if (key === 'borderType' && typeof value === 'string' && BORDER_TYPE_VALUES.has(value as WidgetThemeBorderType)) {
      return true
    }
    return widgetConfigSupportsThemes(value)
  })
}

export function applyWidgetThemeConfig(config: unknown, themeId: WidgetThemeId): Record<string, unknown> {
  const theme = getWidgetTheme(themeId)
  const base = config && typeof config === 'object' ? config : {}
  const themed = applyThemeToValue(base, theme) as Record<string, unknown>

  return {
    ...themed,
    themeId,
    widgetThemeName: theme.name,
    ...Object.fromEntries(
      Object.entries(COMMON_THEME_COLORS).map(([key, colorKey]) => [key, theme.colors[colorKey]])
    )
  }
}
