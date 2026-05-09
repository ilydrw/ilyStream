import { Trash2, Check, Copy, ExternalLink, Layout, Settings2 } from 'lucide-react'
import { type Widget } from '../../../../shared/widgets'
import { WIDGET_TEMPLATES } from '../constants'

export function WidgetCard({
  widget,
  url,
  copyState,
  onCopyUrl,
  onConfigure,
  onDelete
}: {
  widget: Widget
  url: string | null
  copyState: boolean
  onCopyUrl: () => void
  onConfigure: () => void
  onDelete: () => void
}) {
  const template = WIDGET_TEMPLATES.find((t) => t.type === widget.type)
  const Icon = template?.icon ?? Layout

  return (
    <section className="app-section-card glass overflow-hidden flex flex-col">
      <div className="p-5 border-b border-white/[0.05] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-accent shrink-0">
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white truncate">{widget.name}</h3>
            <p className="text-[10px] uppercase tracking-widest text-white/30 mt-0.5">
              {template?.label ?? widget.type}
            </p>
          </div>
        </div>
        <button
          onClick={onDelete}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-white/30 hover:text-danger hover:bg-danger/10 transition-all"
          title="Delete widget"
        >
          <Trash2 size={15} />
        </button>
      </div>

      <div className="p-5 flex flex-col gap-6">


        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Browser source URL</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-black/40 border border-white/5 font-mono text-[11px] text-white/60 min-w-0">
            <span className="truncate flex-1" title={url ?? ''}>
              {url ?? 'Overlay server not running'}
            </span>
            <button
              onClick={onCopyUrl}
              disabled={!url}
              className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30"
              title="Copy URL"
            >
              {copyState ? <Check size={13} className="text-success" /> : <Copy size={13} />}
            </button>
          </div>

          {/* Small Inline Preview */}
          <div className="mt-2 relative w-full aspect-[21/9] rounded-xl overflow-hidden border border-white/5 bg-black/60 group/preview transition-all">
            {url ? (
              <div className="absolute inset-0 pointer-events-none opacity-80 group-hover/preview:opacity-100 transition-opacity">
                <iframe
                  src={`${url}?preview=1`}
                  title={`${widget.name} preview`}
                  className="absolute top-0 left-0 w-[400%] h-[400%] border-none"
                  style={{ 
                    transform: 'scale(0.25)', 
                    transformOrigin: '0 0',
                    background: 'transparent'
                  }}
                />
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-[8px] font-black text-white/10 uppercase tracking-widest gap-2">
                <span>Preview Offline</span>
              </div>
            )}
            <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 border border-white/10 text-[7px] font-black text-accent uppercase tracking-widest">
               <div className="w-1 h-1 rounded-full bg-accent animate-pulse" />
               Live
            </div>
            {/* Click to configure overlay */}
            <div className="absolute inset-0 z-10 cursor-pointer" onClick={onConfigure} />
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={onConfigure} className="flex-1 app-button !h-10 text-xs font-bold">
            <Settings2 size={14} className="mr-2 opacity-60" />
            Configure
          </button>
          <button
            onClick={() => url && window.open(url, '_blank')}
            disabled={!url}
            className="app-button !w-10 !h-10 flex items-center justify-center disabled:opacity-30"
            title="Open in browser"
          >
            <ExternalLink size={14} />
          </button>
        </div>
      </div>
    </section>
  )
}

