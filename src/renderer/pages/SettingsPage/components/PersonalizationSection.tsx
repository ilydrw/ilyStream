import {IconSettings, IconPalette, IconSparkles} from '@tabler/icons-react'
import { Toggle } from '../../../components/ui/Inputs'
import type { AppSettings, AppTheme, InterfaceDensity } from '../../../../shared/app-settings'
import { SettingRow } from './SettingsShared'

interface PersonalizationSectionProps {
  settings: AppSettings
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  onUpdateMany: (updates: Partial<AppSettings>) => void
}

const THEME_OPTIONS: Array<{
  value: AppTheme
  label: string
  hint: string
  accent: string
  secondary: string
}> = [
  { value: 'dark', label: 'Cyber Neon', hint: 'Neon cyan and magenta — the default.', accent: '#19c8ff', secondary: '#d035f1' },
  { value: 'midnight', label: 'Midnight', hint: 'Cool blue focus mode.', accent: '#60a5fa', secondary: '#7c3aed' },
  { value: 'aurora', label: 'Aurora', hint: 'Teal and green live energy.', accent: '#2dd4bf', secondary: '#22c55e' },
  { value: 'ember', label: 'Ember', hint: 'Warm alert-ready contrast.', accent: '#fb923c', secondary: '#f43f5e' },
  { value: 'synthwave', label: 'Synthwave', hint: 'Retro pink and violet afterglow.', accent: '#f472b6', secondary: '#7c3aed' },
  { value: 'gob', label: 'Gob the Stopper', hint: 'High-voltage lime green on jet black.', accent: '#b6ff00', secondary: '#050505' },
  { value: 'graphite', label: 'Graphite', hint: 'Monochrome and distraction-free.', accent: '#e4e4e7', secondary: '#3f3f46' },
  { value: 'light', label: 'Daylight', hint: 'Bright control surface for lit rooms.', accent: '#0ea5e9', secondary: '#a855f7' },
  { value: 'custom', label: 'Custom', hint: 'Build your own palette from scratch.', accent: '#19c8ff', secondary: '#d035f1' }
]

const ACCENT_OPTIONS = ['#19c8ff', '#a78bfa', '#2dd4bf', '#22c55e', '#b6ff00', '#fb923c', '#f43f5e']
const UI_SCALE_OPTIONS = [
  { value: 0.85, label: '85%' },
  { value: 0.95, label: '95%' },
  { value: 1, label: '100%' },
  { value: 1.1, label: '110%' },
  { value: 1.2, label: '120%' }
]

export function PersonalizationSection({ settings, onUpdate, onUpdateMany }: PersonalizationSectionProps) {
  const setTheme = (option: (typeof THEME_OPTIONS)[number]) => {
    if (option.value === 'custom') {
      // Keep whatever accent the user already has — custom means "your colors".
      onUpdate('theme', 'custom')
      return
    }
    onUpdateMany({
      theme: option.value,
      accentColor: option.accent
    })
  }

  const customPreview = `linear-gradient(135deg, ${settings.ui.customBackground || '#0b0d12'}, ${settings.ui.customSecondary || '#d035f1'})`

  return (
    <section className="app-section-card glass">
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

      <div className="app-section-content !p-0">
        <div className="p-8">
          <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {THEME_OPTIONS.map((option) => {
              const active = settings.theme === option.value
              return (
                <button
                  key={option.value}
                  onClick={() => setTheme(option)}
                  aria-pressed={active}
                  className={`group rounded-xl border p-4 text-left transition-all ${ active ? 'border-accent/50 bg-accent/10 shadow-[0_0_30px_rgba(var(--accent-rgb),0.12)]' : 'border-white/5 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]' }`}
                >
                  <div
                    className="mb-4 h-16 rounded-lg border border-white/10"
                    style={{ background: option.value === 'custom' ? customPreview : `linear-gradient(135deg, ${option.accent}, ${option.secondary})` }}
                  />
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-white">{option.label}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-white/30">{option.hint}</p>
                    </div>
                    <span className={`h-2.5 w-2.5 rounded-full ${active ? 'bg-accent' : 'bg-white/10'}`} />
                  </div>
                </button>
              )
            })}
          </div>

          {settings.theme === 'custom' && (
            <>
              <SettingRow label="Base Background" hint="The darkest surface color — cards, borders, and hover states are derived from it.">
                <input
                  type="color"
                  value={settings.ui.customBackground || '#0b0d12'}
                  onChange={(event) => onUpdate('customThemeBackground', event.target.value)}
                  className="h-9 w-20 cursor-pointer rounded-lg border border-white/10 bg-transparent p-0"
                  title="Custom background color"
                />
              </SettingRow>
              <SettingRow label="Secondary Color" hint="Used in gradients and icon accents alongside your accent color.">
                <input
                  type="color"
                  value={settings.ui.customSecondary || '#d035f1'}
                  onChange={(event) => onUpdate('customThemeSecondary', event.target.value)}
                  className="h-9 w-20 cursor-pointer rounded-lg border border-white/10 bg-transparent p-0"
                  title="Custom secondary color"
                />
              </SettingRow>
            </>
          )}

          <SettingRow label="Accent Color" hint="Choose the color used for active states, meters, glows, and primary actions.">
            <div className="flex flex-wrap justify-end gap-2">
              {ACCENT_OPTIONS.map((color) => (
                <button
                  key={color}
                  onClick={() => onUpdate('accentColor', color)}
                  className={`h-9 w-9 rounded-lg border transition-all ${ (settings.accentColor || '').toLowerCase() === color.toLowerCase() ? 'border-white scale-105' : 'border-white/10 hover:border-white/30' }`}
                  style={{ background: color }}
                  title={color}
                />
              ))}
              <input
                type="color"
                value={settings.ui.accentColor || settings.accentColor || '#000000'}
                onChange={(event) => onUpdate('accentColor', event.target.value)}
                className="h-9 w-9 cursor-pointer rounded-lg border border-white/10 bg-transparent p-0"
                title="Custom accent color"
              />
            </div>
          </SettingRow>

          <SettingRow label="Interface Scale" hint="Zoom the entire app — useful on high-DPI or small laptop screens.">
            <div className="grid grid-cols-5 overflow-hidden rounded-xl border border-white/10 bg-black/30">
              {UI_SCALE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => onUpdate('uiScale', option.value)}
                  className={`h-10 px-3 text-xs font-semibold tracking-tight transition-all ${ Math.abs((settings.ui.uiScale || 1) - option.value) < 0.01 ? 'bg-white text-black' : 'text-white/35 hover:bg-white/5 hover:text-white/60' }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </SettingRow>

          <SettingRow label="Interface Density" hint="Compact mode tightens cards and settings rows for smaller displays.">
            <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-white/10 bg-black/30">
              {(['comfortable', 'compact'] as InterfaceDensity[]).map((density) => (
                <button
                  key={density}
                  onClick={() => onUpdate('interfaceDensity', density)}
                  className={`h-10 px-4 text-xs font-semibold tracking-tight transition-all ${ settings.interfaceDensity === density ? 'bg-white text-black' : 'text-white/35 hover:bg-white/5 hover:text-white/60' }`}
                >
                  {density}
                </button>
              ))}
            </div>
          </SettingRow>

          <SettingRow label="Reduced Motion" hint="Minimize animated transitions when you need the UI to stay quiet and predictable.">
            <Toggle value={settings.reducedMotion} onChange={(value) => onUpdate('reducedMotion', value)} />
          </SettingRow>

          <div className="mt-8 grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
              <IconSettings size={18} className="text-accent" />
              <div>
                <p className="text-[10px] font-semibold tracking-tight text-white/25">Density</p>
                <p className="text-sm font-semibold capitalize text-white">{settings.interfaceDensity}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
              <IconSparkles size={18} className="text-accent" />
              <div>
                <p className="text-[10px] font-semibold tracking-tight text-white/25">Motion</p>
                <p className="text-sm font-semibold text-white">{settings.reducedMotion ? 'Reduced' : 'Fluid'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

