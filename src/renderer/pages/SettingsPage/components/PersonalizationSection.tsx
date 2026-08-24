import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  IconSettings,
  IconPalette,
  IconSparkles,
  IconTrash,
  IconPlus,
  IconCopy,
  IconDeviceFloppy,
  IconCheck,
  IconChevronRight,
  IconRefresh,
  IconClipboard,
  IconClipboardCheck
} from '@tabler/icons-react'
import { Toggle } from '../../../components/ui/Inputs'
import {
  APP_THEME_DEFINITIONS,
  CUSTOM_PALETTE_TOKENS,
  deriveCustomPalette,
  type AppSettings,
  type AppTheme,
  type AppThemePalette,
  type CustomColorScheme,
  type CustomPaletteOverrides,
  type CustomPaletteToken,
  type InterfaceDensity,
  type SavedCustomTheme
} from '../../../../shared/app-settings'
import { SettingRow, TextInput } from './SettingsShared'

interface PersonalizationSectionProps {
  settings: AppSettings
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  onUpdateMany: (updates: Partial<AppSettings>) => void
}

const BUILTIN_THEME_OPTIONS = APP_THEME_DEFINITIONS.map((theme) => ({
  value: theme.id as AppTheme,
  label: theme.label,
  hint: theme.description,
  palette: theme.palette
}))

const ACCENT_OPTIONS = ['#19c8ff', '#a78bfa', '#2dd4bf', '#22c55e', '#b6ff00', '#fb923c', '#f43f5e']
const UI_SCALE_OPTIONS = [
  { value: 0.85, label: '85%' },
  { value: 0.95, label: '95%' },
  { value: 1, label: '100%' },
  { value: 1.1, label: '110%' },
  { value: 1.2, label: '120%' }
]
const COLOR_SCHEME_OPTIONS: Array<{ value: CustomColorScheme; label: string }> = [
  { value: 'auto', label: 'auto' },
  { value: 'dark', label: 'dark' },
  { value: 'light', label: 'light' }
]

const TOKEN_LABELS: Record<CustomPaletteToken, string> = {
  canvas: 'Canvas',
  canvasDeep: 'Canvas (deep)',
  chrome: 'Title bar',
  sidebar: 'Sidebar',
  surface: 'Surface',
  surfaceRaised: 'Surface (raised)',
  surfaceHover: 'Surface (hover)',
  border: 'Border',
  borderStrong: 'Border (strong)',
  text: 'Text',
  textMuted: 'Text (muted)',
  textSubtle: 'Text (subtle)'
}

const DEFAULT_CUSTOM_BACKGROUND = '#0b0d12'
const DEFAULT_CUSTOM_SECONDARY = '#d035f1'
const DEFAULT_CUSTOM_ACCENT = '#19c8ff'
const HEX_RE = /^#[0-9a-f]{6}$/i

/** The colors that fully describe a custom theme, minus its id/name. */
interface CustomConfig {
  background: string
  secondary: string
  accent: string
  colorScheme: CustomColorScheme
  overrides: CustomPaletteOverrides
}

/** Derive the small workbench preview swatch shape from a config. */
function previewFromConfig(config: CustomConfig) {
  const palette = deriveCustomPalette(config.background, config.secondary, config.accent, config.colorScheme)
  const merged = { ...palette, ...pickValidOverrides(config.overrides) }
  return {
    canvas: merged.canvas,
    chrome: merged.chrome,
    sidebar: merged.sidebar,
    surface: merged.surface,
    border: merged.border,
    accent: config.accent,
    secondary: merged.secondary
  }
}

function pickValidOverrides(overrides: CustomPaletteOverrides): CustomPaletteOverrides {
  const next: CustomPaletteOverrides = {}
  for (const token of CUSTOM_PALETTE_TOKENS) {
    const value = overrides[token]
    if (typeof value === 'string' && HEX_RE.test(value)) next[token] = value
  }
  return next
}

function overridesEqual(a: CustomPaletteOverrides, b: CustomPaletteOverrides): boolean {
  const ak = Object.keys(pickValidOverrides(a)).sort()
  const bk = Object.keys(pickValidOverrides(b)).sort()
  if (ak.length !== bk.length) return false
  return ak.every(
    (key, index) => bk[index] === key && String(a[key as CustomPaletteToken]).toLowerCase() === String(b[key as CustomPaletteToken]).toLowerCase()
  )
}

function configEqual(a: CustomConfig, b: CustomConfig): boolean {
  return (
    a.background.toLowerCase() === b.background.toLowerCase() &&
    a.secondary.toLowerCase() === b.secondary.toLowerCase() &&
    a.accent.toLowerCase() === b.accent.toLowerCase() &&
    a.colorScheme === b.colorScheme &&
    overridesEqual(a.overrides, b.overrides)
  )
}

function newThemeId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `custom-theme-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** Pin every token of a built-in palette so a fork reproduces it exactly. */
function overridesFromPalette(palette: AppThemePalette): CustomPaletteOverrides {
  const overrides: CustomPaletteOverrides = {}
  for (const token of CUSTOM_PALETTE_TOKENS) overrides[token] = palette[token]
  return overrides
}

export function PersonalizationSection({ settings, onUpdate, onUpdateMany }: PersonalizationSectionProps) {
  const savedThemes = settings.ui.customThemes ?? []
  const activeCustomThemeId = settings.ui.activeCustomThemeId ?? ''
  const activeTheme = savedThemes.find((theme) => theme.id === activeCustomThemeId) ?? null

  const currentConfig: CustomConfig = {
    background: settings.ui.customBackground || DEFAULT_CUSTOM_BACKGROUND,
    secondary: settings.ui.customSecondary || DEFAULT_CUSTOM_SECONDARY,
    accent: settings.ui.accentColor || settings.accentColor || DEFAULT_CUSTOM_ACCENT,
    colorScheme: settings.ui.customColorScheme ?? 'auto',
    overrides: settings.ui.customPalette ?? {}
  }

  const derivedPalette = useMemo(
    () => deriveCustomPalette(currentConfig.background, currentConfig.secondary, currentConfig.accent, currentConfig.colorScheme),
    [currentConfig.background, currentConfig.secondary, currentConfig.accent, currentConfig.colorScheme]
  )

  const [nameDraft, setNameDraft] = useState(activeTheme?.name ?? '')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const statusTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    setNameDraft(activeTheme?.name ?? '')
  }, [activeCustomThemeId, activeTheme?.name])

  useEffect(() => () => window.clearTimeout(statusTimer.current), [])

  const flash = (message: string) => {
    setStatusMessage(message)
    window.clearTimeout(statusTimer.current)
    statusTimer.current = window.setTimeout(() => setStatusMessage(''), 2600)
  }

  const isModified = Boolean(
    activeTheme && (!configEqual(activeTheme, currentConfig) || activeTheme.name !== nameDraft.trim())
  )
  const overrideCount = Object.keys(pickValidOverrides(currentConfig.overrides)).length

  const setBuiltinTheme = (option: (typeof BUILTIN_THEME_OPTIONS)[number]) => {
    onUpdateMany({ theme: option.value, accentColor: option.palette.accent })
  }

  const applyConfig = (config: CustomConfig, activeId: string) => {
    onUpdateMany({
      theme: 'custom',
      customThemeBackground: config.background,
      customThemeSecondary: config.secondary,
      accentColor: config.accent,
      customColorScheme: config.colorScheme,
      customPalette: config.overrides,
      activeCustomThemeId: activeId
    })
  }

  const applySavedTheme = (theme: SavedCustomTheme) => {
    applyConfig(
      {
        background: theme.background,
        secondary: theme.secondary,
        accent: theme.accent,
        colorScheme: theme.colorScheme,
        overrides: theme.overrides
      },
      theme.id
    )
  }

  // A brand-new palette starts fully derived (no pinned tokens, auto scheme).
  const startNewCustom = () => {
    onUpdateMany({ theme: 'custom', customColorScheme: 'auto', customPalette: {}, activeCustomThemeId: '' })
    setAdvancedOpen(false)
  }

  const persistNewTheme = (name: string, config: CustomConfig): SavedCustomTheme => {
    const theme: SavedCustomTheme = { id: newThemeId(), name, ...config }
    onUpdateMany({
      theme: 'custom',
      customThemes: [...savedThemes, theme],
      customThemeBackground: config.background,
      customThemeSecondary: config.secondary,
      accentColor: config.accent,
      customColorScheme: config.colorScheme,
      customPalette: config.overrides,
      activeCustomThemeId: theme.id
    })
    return theme
  }

  const saveAsNewTheme = () => {
    const name = nameDraft.trim() || `Custom ${savedThemes.length + 1}`
    persistNewTheme(name, currentConfig)
    flash('Saved new theme')
  }

  const updateActiveTheme = () => {
    if (!activeTheme) return
    const name = nameDraft.trim() || activeTheme.name
    const next = savedThemes.map((theme) => (theme.id === activeTheme.id ? { ...theme, name, ...currentConfig } : theme))
    onUpdateMany({ customThemes: next })
    flash('Theme updated')
  }

  const deleteTheme = (id: string) => {
    const next = savedThemes.filter((theme) => theme.id !== id)
    onUpdateMany({
      customThemes: next,
      activeCustomThemeId: activeCustomThemeId === id ? '' : activeCustomThemeId
    })
  }

  const forkBuiltin = (option: (typeof BUILTIN_THEME_OPTIONS)[number]) => {
    persistNewTheme(`${option.label} copy`, {
      background: option.palette.canvas,
      secondary: option.palette.secondary,
      accent: option.palette.accent,
      colorScheme: option.palette.colorScheme,
      overrides: overridesFromPalette(option.palette)
    })
    flash(`Forked ${option.label}`)
  }

  const forkSaved = (theme: SavedCustomTheme) => {
    persistNewTheme(`${theme.name} copy`, {
      background: theme.background,
      secondary: theme.secondary,
      accent: theme.accent,
      colorScheme: theme.colorScheme,
      overrides: theme.overrides
    })
    flash('Duplicated theme')
  }

  const setColorScheme = (scheme: CustomColorScheme) => onUpdate('customColorScheme', scheme)

  const setOverride = (token: CustomPaletteToken, value: string) => {
    onUpdate('customPalette', { ...pickValidOverrides(currentConfig.overrides), [token]: value })
  }

  const clearOverride = (token: CustomPaletteToken) => {
    const next = pickValidOverrides(currentConfig.overrides)
    delete next[token]
    onUpdate('customPalette', next)
  }

  const resetAllOverrides = () => onUpdate('customPalette', {})

  const exportCurrent = async () => {
    const payload = {
      ilyStreamTheme: 1,
      name: nameDraft.trim() || activeTheme?.name || 'Custom theme',
      ...currentConfig
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      flash('Theme copied to clipboard')
    } catch {
      flash('Could not access the clipboard')
    }
  }

  const importFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      const parsed = JSON.parse(text) as Partial<SavedCustomTheme> & { name?: string }
      const background = typeof parsed.background === 'string' && HEX_RE.test(parsed.background) ? parsed.background : ''
      const accent = typeof parsed.accent === 'string' && HEX_RE.test(parsed.accent) ? parsed.accent : ''
      if (!background && !accent) {
        flash('Clipboard has no valid theme')
        return
      }
      const config: CustomConfig = {
        background: background || DEFAULT_CUSTOM_BACKGROUND,
        secondary: typeof parsed.secondary === 'string' && HEX_RE.test(parsed.secondary) ? parsed.secondary : DEFAULT_CUSTOM_SECONDARY,
        accent: accent || DEFAULT_CUSTOM_ACCENT,
        colorScheme: parsed.colorScheme === 'dark' || parsed.colorScheme === 'light' ? parsed.colorScheme : 'auto',
        overrides: pickValidOverrides((parsed.overrides as CustomPaletteOverrides) ?? {})
      }
      const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim().slice(0, 60) : `Imported ${savedThemes.length + 1}`
      persistNewTheme(name, config)
      flash(`Imported "${name}"`)
    } catch {
      flash('Clipboard did not contain a theme')
    }
  }

  const isNewCustomActive = settings.theme === 'custom' && !activeCustomThemeId

  return (
    <section className="app-section-card glass settings-personalization">
      <div className="app-section-head">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center text-accent">
            <IconPalette size={32} />
          </div>
          <div>
            <h2>Personalization</h2>
            <p>Theme, accent, density, and motion.</p>
          </div>
        </div>
        <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-[9px] font-semibold tracking-tight text-accent">
          Live Preview
        </span>
      </div>

      <div className="app-section-content settings-personalization-content">
        <div className="settings-section-body">
          <div className="settings-theme-grid">
            {BUILTIN_THEME_OPTIONS.map((option) => {
              const active = settings.theme === option.value
              const previewPalette = option.palette ?? customPreviewPalette
              return (
                <div key={option.value} className="group relative">
                  <button
                    onClick={() => setBuiltinTheme(option)}
                    aria-pressed={active}
                    className={`settings-theme-card w-full ${active ? 'is-active' : ''}`}
                  >
                    <ThemeWorkbenchPreview palette={option.palette} />
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-foreground">{option.label}</h3>
                        <p className="mt-1 text-xs leading-relaxed text-muted">{option.hint}</p>
                      </div>
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${active ? 'bg-accent' : 'bg-border'}`} />
                    </div>
                  </button>
                  <CardActions>
                    <CardActionButton title={`Duplicate ${option.label} as a custom theme`} onClick={() => forkBuiltin(option)}>
                      <IconCopy size={14} />
                    </CardActionButton>
                  </CardActions>
                </div>
              )
            })}

            {savedThemes.map((theme) => {
              const active = settings.theme === 'custom' && activeCustomThemeId === theme.id
              const overrides = Object.keys(pickValidOverrides(theme.overrides)).length
              return (
                <div key={theme.id} className="group relative">
                  <button
                    onClick={() => applySavedTheme(theme)}
                    aria-pressed={active}
                    className={`settings-theme-card w-full ${active ? 'is-active' : ''}`}
                  >
                    <ThemeWorkbenchPreview
                      palette={previewFromConfig({
                        background: theme.background,
                        secondary: theme.secondary,
                        accent: theme.accent,
                        colorScheme: theme.colorScheme,
                        overrides: theme.overrides
                      })}
                    />
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-foreground">{theme.name}</h3>
                        <p className="mt-1 text-xs leading-relaxed text-muted">
                          {theme.colorScheme === 'auto' ? 'Custom' : `Custom · ${theme.colorScheme}`}
                          {overrides ? ` · ${overrides} tuned` : ''}
                        </p>
                      </div>
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${active ? 'bg-accent' : 'bg-border'}`} />
                    </div>
                  </button>
                  <CardActions>
                    <CardActionButton title={`Duplicate ${theme.name}`} onClick={() => forkSaved(theme)}>
                      <IconCopy size={14} />
                    </CardActionButton>
                    <CardActionButton title={`Delete ${theme.name}`} danger onClick={() => deleteTheme(theme.id)}>
                      <IconTrash size={14} />
                    </CardActionButton>
                  </CardActions>
                </div>
              )
            })}

            <button
              onClick={startNewCustom}
              aria-pressed={isNewCustomActive}
              className={`settings-theme-card group ${isNewCustomActive ? 'is-active' : ''}`}
            >
              <ThemeWorkbenchPreview palette={previewFromConfig(currentConfig)} />
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <IconPlus size={14} /> Custom
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted">Build your own segmented workbench palette.</p>
                </div>
                <span className={`h-2.5 w-2.5 rounded-full ${isNewCustomActive ? 'bg-accent' : 'bg-border'}`} />
              </div>
            </button>
          </div>

          {settings.theme === 'custom' && (
            <>
              <SettingRow label="Base Background" hint="The darkest surface color — cards, borders, and hover states are derived from it.">
                <input
                  type="color"
                  value={settings.ui.customBackground || DEFAULT_CUSTOM_BACKGROUND}
                  onChange={(event) => onUpdate('customThemeBackground', event.target.value)}
                  className="settings-custom-color-input"
                  title="Custom background color"
                />
              </SettingRow>
              <SettingRow label="Secondary Color" hint="Used in gradients and icon accents alongside your accent color.">
                <input
                  type="color"
                  value={settings.ui.customSecondary || DEFAULT_CUSTOM_SECONDARY}
                  onChange={(event) => onUpdate('customThemeSecondary', event.target.value)}
                  className="settings-custom-color-input"
                  title="Custom secondary color"
                />
              </SettingRow>
              <SettingRow label="Color Scheme" hint="Force light or dark text and surface treatment, or let it follow the background.">
                <div className="settings-choice-group is-density">
                  {COLOR_SCHEME_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setColorScheme(option.value)}
                      className={currentConfig.colorScheme === option.value ? 'is-active' : ''}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </SettingRow>

              <div className="settings-advanced-theme">
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((open) => !open)}
                  className="settings-advanced-toggle"
                  aria-expanded={advancedOpen}
                >
                  <IconChevronRight size={16} className={`transition-transform ${advancedOpen ? 'rotate-90' : ''}`} />
                  <span className="font-semibold">Advanced surface &amp; text colors</span>
                  {overrideCount > 0 && (
                    <span className="rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-[9px] font-semibold tracking-tight text-accent">
                      {overrideCount} tuned
                    </span>
                  )}
                  {overrideCount > 0 && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        resetAllOverrides()
                      }}
                      className="ml-auto text-[10px] font-semibold text-muted transition-colors hover:text-danger"
                    >
                      Reset all
                    </button>
                  )}
                </button>

                {advancedOpen && (
                  <div className="settings-advanced-grid">
                    {CUSTOM_PALETTE_TOKENS.map((token) => {
                      const overridden = HEX_RE.test(String(currentConfig.overrides[token] ?? ''))
                      const value = overridden ? (currentConfig.overrides[token] as string) : derivedPalette[token]
                      return (
                        <div key={token} className={`settings-advanced-token ${overridden ? 'is-overridden' : ''}`}>
                          <span className="min-w-0 truncate text-xs font-medium text-muted">{TOKEN_LABELS[token]}</span>
                          <div className="flex items-center gap-1.5">
                            {overridden && (
                              <button
                                type="button"
                                onClick={() => clearOverride(token)}
                                title="Reset to derived color"
                                className="flex h-6 w-6 items-center justify-center rounded text-muted transition-colors hover:text-foreground"
                              >
                                <IconRefresh size={13} />
                              </button>
                            )}
                            <input
                              type="color"
                              value={value}
                              onChange={(event) => setOverride(token, event.target.value)}
                              className="settings-token-color-input"
                              title={overridden ? `${TOKEN_LABELS[token]} (custom)` : `${TOKEN_LABELS[token]} (derived)`}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <SettingRow
                label={activeTheme ? 'Theme Name' : 'Save Theme'}
                hint={
                  activeTheme
                    ? isModified
                      ? 'Update the saved theme with your current colors, or fork it into a new one.'
                      : 'This palette is saved. Edit the colors above to update it.'
                    : 'Name this palette and save it so you can switch back to it anytime.'
                }
              >
                <div className="settings-custom-theme-actions">
                  <TextInput
                    value={nameDraft}
                    onChange={setNameDraft}
                    placeholder={activeTheme ? activeTheme.name : `Custom ${savedThemes.length + 1}`}
                    className="!w-40"
                  />
                  {activeTheme ? (
                    <>
                      <button
                        type="button"
                        onClick={updateActiveTheme}
                        disabled={!isModified}
                        className="app-button-primary !h-10 !px-4"
                      >
                        {isModified ? <IconDeviceFloppy size={16} className="mr-1.5" /> : <IconCheck size={16} className="mr-1.5" />}
                        {isModified ? 'Update' : 'Saved'}
                      </button>
                      <button type="button" onClick={saveAsNewTheme} className="app-button !h-10 !px-4">
                        Save as new
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={saveAsNewTheme} className="app-button-primary !h-10 !px-4">
                      <IconDeviceFloppy size={16} className="mr-1.5" />
                      Save theme
                    </button>
                  )}
                </div>
              </SettingRow>

              <SettingRow label="Share Theme" hint="Copy this palette to the clipboard as JSON, or import one someone sent you.">
                <div className="settings-custom-theme-actions">
                  {statusMessage && <span className="mr-1 text-[10px] font-semibold tracking-tight text-accent">{statusMessage}</span>}
                  <button type="button" onClick={exportCurrent} className="app-button !h-10 !px-4">
                    <IconClipboardCheck size={16} className="mr-1.5" />
                    Export
                  </button>
                  <button type="button" onClick={importFromClipboard} className="app-button !h-10 !px-4">
                    <IconClipboard size={16} className="mr-1.5" />
                    Import
                  </button>
                </div>
              </SettingRow>
            </>
          )}

          <SettingRow label="Accent Color" hint="Choose the color used for active states, meters, glows, and primary actions.">
            <div className="settings-accent-options">
              {ACCENT_OPTIONS.map((color) => (
                <button
                  key={color}
                  onClick={() => onUpdate('accentColor', color)}
                  className={`settings-color-swatch ${(settings.accentColor || '').toLowerCase() === color.toLowerCase() ? 'is-active' : ''}`}
                  style={{ background: color }}
                  title={color}
                />
              ))}
              <input
                type="color"
                value={settings.ui.accentColor || settings.accentColor || '#000000'}
                onChange={(event) => onUpdate('accentColor', event.target.value)}
                className="settings-color-swatch is-picker"
                title="Custom accent color"
              />
            </div>
          </SettingRow>

          <SettingRow label="Interface Scale" hint="Zoom the entire app — useful on high-DPI or small laptop screens.">
            <div className="settings-choice-group is-scale">
              {UI_SCALE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => onUpdate('uiScale', option.value)}
                  className={Math.abs((settings.ui.uiScale || 1) - option.value) < 0.01 ? 'is-active' : ''}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </SettingRow>

          <SettingRow label="Interface Density" hint="Compact mode tightens cards and settings rows for smaller displays.">
            <div className="settings-choice-group is-density">
              {(['comfortable', 'compact'] as InterfaceDensity[]).map((density) => (
                <button
                  key={density}
                  onClick={() => onUpdate('interfaceDensity', density)}
                  className={settings.interfaceDensity === density ? 'is-active' : ''}
                >
                  {density}
                </button>
              ))}
            </div>
          </SettingRow>

          <SettingRow label="Reduced Motion" hint="Minimize animated transitions when you need the UI to stay quiet and predictable.">
            <Toggle value={settings.reducedMotion} onChange={(value) => onUpdate('reducedMotion', value)} />
          </SettingRow>

          <div className="settings-personalization-summary">
            <div className="settings-personalization-summary-card">
              <IconSettings size={18} className="text-accent" />
              <div>
                <p className="text-[10px] font-semibold tracking-tight text-muted">Density</p>
                <p className="text-sm font-semibold capitalize text-foreground">{settings.interfaceDensity}</p>
              </div>
            </div>
            <div className="settings-personalization-summary-card">
              <IconSparkles size={18} className="text-accent" />
              <div>
                <p className="text-[10px] font-semibold tracking-tight text-muted">Motion</p>
                <p className="text-sm font-semibold text-foreground">{settings.reducedMotion ? 'Reduced' : 'Fluid'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function CardActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      {children}
    </div>
  )
}

function CardActionButton({
  title,
  onClick,
  danger,
  children
}: {
  title: string
  onClick: () => void
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-black/50 text-muted backdrop-blur transition-colors hover:text-foreground ${
        danger ? 'hover:border-danger/40 hover:text-danger' : 'hover:border-accent/40'
      }`}
    >
      {children}
    </button>
  )
}

function ThemeWorkbenchPreview({
  palette
}: {
  palette: Pick<AppThemePalette, 'canvas' | 'chrome' | 'sidebar' | 'surface' | 'border' | 'accent' | 'secondary'>
}) {
  return (
    <div
      className="settings-theme-preview"
      style={{ background: palette.canvas, borderColor: palette.border }}
      aria-hidden="true"
    >
      <div className="h-2.5 border-b" style={{ background: palette.chrome, borderColor: palette.border }} />
      <div className="flex h-[calc(100%_-_10px)]">
        <div className="w-11 border-r" style={{ background: palette.sidebar, borderColor: palette.border }} />
        <div className="flex flex-1 items-center gap-2 p-2" style={{ background: palette.canvas }}>
          <div className="h-full flex-1 rounded border" style={{ background: palette.surface, borderColor: palette.border }} />
          <div
            className="h-6 w-16 rounded"
            style={{ background: `linear-gradient(135deg, ${palette.accent}, ${palette.secondary})` }}
          />
        </div>
      </div>
    </div>
  )
}
