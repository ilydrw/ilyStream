import { IconPalette } from '@tabler/icons-react'

import { applyWidgetThemeConfig, WIDGET_THEMES } from '../../../../../shared/widget-themes'
import { type Widget } from '../../../../../shared/widgets'
import { Section } from './Shared'

export function WidgetThemeSection({
  draft,
  onChange
}: {
  draft: Widget
  onChange: (next: Widget) => void
}) {
  const activeThemeId = (draft.config as { themeId?: string } | null | undefined)?.themeId

  return (
    <Section
      label="Theme"
      description="One-tap presets — applying a theme overwrites this widget's colors, then everything below stays adjustable."
    >
      <div className="grid min-w-0 gap-2">
        {WIDGET_THEMES.map((theme) => {
          const selected = activeThemeId === theme.id
          return (
            <button
              key={theme.id}
              onClick={() => onChange({ ...draft, config: applyWidgetThemeConfig(draft.config, theme.id) })}
              className={`group min-w-0 w-full rounded-lg border p-3 text-left transition-all cursor-pointer ${
                selected
                  ? 'border-accent/60 bg-accent/10 text-white'
                  : 'border-white/10 bg-white/[0.03] text-white/70 hover:border-accent/30 hover:bg-white/[0.05]'
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-black ${selected ? 'text-accent' : 'text-white/40'}`}>
                  <IconPalette size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-semibold">{theme.name}</div>
                  <div className="mt-0.5 truncate text-[11px] text-white/35">{theme.description}</div>
                </div>
                <div
                  className="h-5 w-16 shrink-0 rounded-full border border-white/15 shadow-inner"
                  style={{ background: `linear-gradient(90deg, ${theme.previewColors.join(', ')})` }}
                  title={`${theme.name} color palette`}
                />
              </div>
            </button>
          )
        })}
      </div>
    </Section>
  )
}
