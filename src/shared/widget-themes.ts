export type WidgetThemeId = 'classic' | 'chroma' | 'cyber' | 'solid' | 'gob-the-stopper'
export type WidgetThemeStyle = 'classic' | 'chroma' | 'cyber'
export type WidgetThemeBorderType = 'solid' | 'chroma' | 'cyber'

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
  style: WidgetThemeStyle
  borderType: WidgetThemeBorderType
}

export const WIDGET_THEMES: WidgetTheme[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Clean glass panels with warm ilyStream accent colors.',
    style: 'classic',
    borderType: 'solid',
    colors: {
      primary: '#FF7A45',
      secondary: '#38BDF8',
      accent: '#D035F1',
      background: '#0B0D10',
      surface: '#111318',
      text: '#FFFFFF',
      muted: '#94A3B8',
      border: '#FF7A45'
    }
  },
  {
    id: 'chroma',
    name: 'Chroma',
    description: 'Rainbow motion gradients for high-energy overlays.',
    style: 'chroma',
    borderType: 'chroma',
    colors: {
      primary: '#00F2FF',
      secondary: '#FF00FF',
      accent: '#00FF66',
      background: '#050505',
      surface: '#101018',
      text: '#FFFFFF',
      muted: '#A8B3CF',
      border: '#00F2FF'
    }
  },
  {
    id: 'cyber',
    name: 'Cyber',
    description: 'Neon cyan and magenta with darker sci-fi contrast.',
    style: 'cyber',
    borderType: 'cyber',
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
    id: 'solid',
    name: 'Solid',
    description: 'Single-color borders and restrained high-contrast panels.',
    style: 'classic',
    borderType: 'solid',
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
    description: 'Lime green and black Palestinian-inspired widget palette.',
    style: 'classic',
    borderType: 'solid',
    colors: {
      primary: '#B6FF00',
      secondary: '#050505',
      accent: '#CE1126',
      background: '#020402',
      surface: '#071107',
      text: '#F7FFE8',
      muted: '#A6B879',
      border: '#B6FF00'
    }
  }
]

const WIDGET_STYLE_VALUES = new Set<WidgetThemeStyle>(['classic', 'chroma', 'cyber'])
const BORDER_TYPE_VALUES = new Set<WidgetThemeBorderType>(['solid', 'chroma', 'cyber'])

const COLOR_KEY_MAP: Record<string, keyof WidgetThemeColors> = {
  accentColor: 'primary',
  primaryColor: 'primary',
  secondaryColor: 'secondary',
  backgroundColor: 'background',
  borderColor: 'border',
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

export function getWidgetTheme(themeId: WidgetThemeId): WidgetTheme {
  return WIDGET_THEMES.find((theme) => theme.id === themeId) ?? WIDGET_THEMES[0]
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
