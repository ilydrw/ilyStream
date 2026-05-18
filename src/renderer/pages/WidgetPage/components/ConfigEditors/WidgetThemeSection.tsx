import { IconPalette } from '@tabler/icons-react'

import { applyWidgetThemeConfig, WIDGET_THEMES, type WidgetThemeId } from '../../../../../shared/widget-themes'
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
    <Section label="Theme">
      <div className="grid gap-2">
        {WIDGET_THEMES.map((theme) => {
          const selected = activeThemeId === theme.id
          return (
            <button
              key={theme.id}
              onClick={() => onChange({ ...draft, config: applyWidgetThemeConfig(draft.config, theme.id as WidgetThemeId) })}
              className={`group rounded-xl border p-3 text-left transition-all ${
                selected
                  ? 'border-lime-300/70 bg-lime-300/10 text-white shadow-[0_0_24px_rgba(182,255,0,0.12)]'
                  : 'border-white/10 bg-white/[0.03] text-white/70 hover:border-lime-300/40 hover:bg-lime-300/5'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black text-lime-300">
                  <IconPalette size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-black uppercase tracking-widest">{theme.name}</div>
                  <div className="mt-1 truncate text-[10px] font-semibold text-white/35">{theme.description}</div>
                </div>
                <div className="flex shrink-0 overflow-hidden rounded-full border border-white/10">
                  <span className="h-5 w-5" style={{ background: theme.colors.primary }} />
                  <span className="h-5 w-5" style={{ background: theme.colors.secondary }} />
                  <span className="h-5 w-5" style={{ background: theme.colors.text }} />
                  <span className="h-5 w-5" style={{ background: theme.colors.accent }} />
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </Section>
  )
}
