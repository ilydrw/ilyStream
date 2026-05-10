import {IconX, IconPlus} from '@tabler/icons-react'
import { type WidgetTemplate } from '../constants'

export function NewWidgetModal({
  templates,
  onClose,
  onSelect
}: {
  templates: WidgetTemplate[]
  onClose: () => void
  onSelect: (template: WidgetTemplate) => void
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
      />
      <div className="relative app-section-card glass !p-0 w-full max-w-xl border-white/10 overflow-hidden">
        <div className="px-6 py-5 border-b border-white/[0.05] flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white">New Widget</h2>
            <p className="text-xs text-white/40 mt-0.5">Pick a template to start with.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5 text-white/40">
            <IconX size={16} />
          </button>
        </div>

        <div className="p-5 grid gap-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {templates.map((template) => {
            const Icon = template.icon
            return (
              <button
                key={template.type}
                onClick={() => onSelect(template)}
                className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5 text-left hover:border-accent/30 hover:bg-accent/5 transition-all group"
              >
                <div className="w-11 h-11 rounded-xl bg-white/[0.04] border border-white/5 text-white/60 group-hover:bg-accent/10 group-hover:text-accent flex items-center justify-center shrink-0">
                  <Icon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-white">{template.label}</h4>
                  <p className="text-xs text-white/40 mt-0.5">{template.description}</p>
                </div>
                <IconPlus size={16} className="text-white/20 group-hover:text-accent" />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
