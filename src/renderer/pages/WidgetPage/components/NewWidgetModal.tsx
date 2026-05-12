import { IconPlus } from '@tabler/icons-react'
import { type WidgetTemplate } from '../constants'
import { Modal } from '../../../components/ui/Modal'

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
    <Modal 
      open={true} 
      onClose={onClose} 
      title="New Widget" 
      className="max-w-xl"
    >
      <div className="p-8 space-y-4">
        <p className="text-xs font-black uppercase tracking-widest text-white/20 mb-4">Pick a template to start with</p>
        
        <div className="grid gap-3">
          {templates.map((template) => {
            const Icon = template.icon
            return (
              <button
                key={template.type}
                onClick={() => onSelect(template)}
                className="flex items-center gap-4 p-5 rounded-2xl bg-white/[0.03] border border-white/5 text-left hover:border-accent/30 hover:bg-white/[0.06] transition-all group cursor-pointer"
              >
                <div className="w-12 h-12 rounded-xl bg-white/[0.05] border border-white/5 text-white/40 group-hover:bg-accent/10 group-hover:text-accent flex items-center justify-center shrink-0 transition-all">
                  <Icon size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-white group-hover:text-accent transition-colors">{template.label}</h4>
                  <p className="text-2xs text-white/30 mt-1 line-clamp-1">{template.description}</p>
                </div>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/[0.03] border border-white/5 group-hover:border-accent/20 group-hover:bg-accent/10 transition-all">
                  <IconPlus size={16} className="text-white/20 group-hover:text-accent" />
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}
