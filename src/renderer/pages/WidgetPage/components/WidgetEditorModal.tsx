import { useState, useEffect, useMemo } from 'react'
import { RefreshCcw } from 'lucide-react'
import { type Widget } from '../../../../shared/widgets'
import { ConfigEditor } from './ConfigEditors'

export function WidgetEditorModal({
  widget,
  overlayPort,
  onClose,
  onSave
}: {
  widget: Widget
  overlayPort: number | null
  onClose: () => void
  onSave: (widget: Widget) => Promise<void>
}) {
  const [draft, setDraft] = useState<Widget>(widget)
  const [previewOverride, setPreviewOverride] = useState<Widget | null>(null)
  const [saving, setSaving] = useState(false)
  const [previewKey, setPreviewKey] = useState(0)

  // Reset draft when the parent's widget reference changes (e.g. after save).
  useEffect(() => {
    setDraft(widget)
  }, [widget.id])

  const previewWidget = previewOverride ?? draft

  const previewUrl = useMemo(() => {
    if (!overlayPort) return null
    const base = `http://localhost:${overlayPort}/overlay/${previewWidget.id}`
    try {
      // Encode config as base64 for real-time override in the preview
      const configJson = JSON.stringify(previewWidget.config)
      const encoded = btoa(unescape(encodeURIComponent(configJson)))
      return `${base}?config=${encoded}&preview=1`
    } catch (e) {
      return base
    }
  }, [overlayPort, previewWidget.id, previewWidget.config])

  const handleDraftChange = (next: Widget) => {
    setDraft(next)
    setPreviewOverride(null)
  }

  const handlePreviewOverride = (next: Widget) => {
    setPreviewOverride(next)
    setPreviewKey((k) => k + 1)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(draft)
      setPreviewKey((k) => k + 1) // force iframe reload to pick up new HTML
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/85 backdrop-blur-md"
      />
      <div className="relative app-section-card glass !p-0 w-full max-w-5xl border-white/10 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.05] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="app-input !h-9 !text-sm !px-3 max-w-xs"
              placeholder="Widget name"
            />
            <span className="text-[10px] font-black uppercase tracking-widest text-white/30 shrink-0">
              {draft.type} widget
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPreviewKey((k) => k + 1)} className="app-button !h-9 !px-3 text-xs" title="Reload preview">
              <RefreshCcw size={13} />
            </button>
            <button onClick={onClose} className="app-button !h-9 !px-3 text-xs">
              Close
            </button>
            <button onClick={handleSave} disabled={saving} className="app-button-primary !h-9 !px-4 text-xs font-bold">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {/* Body: config left, preview right */}
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] flex-1 min-h-0">
          {/* Config */}
          <div className="border-r border-white/[0.04] overflow-y-auto custom-scrollbar p-5">
            <ConfigEditor draft={draft} onChange={handleDraftChange} onPreview={handlePreviewOverride} />
          </div>

          {/* Preview */}
          <div className="bg-[#0a0b0d] flex items-center justify-center p-8 min-h-[400px] overflow-hidden">
            {previewUrl ? (
              <div
                className="relative shadow-2xl transition-all duration-500 ease-in-out"
                style={{
                  width: (draft.config as any)?.aspectRatio === 'tiktok' ? 'auto' : '100%',
                  height: (draft.config as any)?.aspectRatio === 'tiktok' ? '100%' : 'auto',
                  aspectRatio: (draft.config as any)?.aspectRatio === 'tiktok' ? '9/16' : 
                               (draft.config as any)?.aspectRatio === 'landscape' ? '16/9' : 'auto',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  minHeight: (draft.config as any)?.aspectRatio === 'tiktok' ? 0 : 380,
                }}
              >
                <div className="absolute inset-0 rounded-xl overflow-hidden border border-white/10 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22 viewBox=%220 0 20 20%22><rect x=%220%22 y=%220%22 width=%2210%22 height=%2210%22 fill=%22%23131517%22/><rect x=%2210%22 y=%2210%22 width=%2210%22 height=%2210%22 fill=%22%23131517%22/></svg>')]">
                  <iframe
                    key={previewKey}
                    src={previewUrl}
                    title="Widget preview"
                    className="w-full h-full"
                    style={{ border: 'none', background: 'transparent' }}
                  />
                </div>
                
                {/* Resolution Badge */}
                <div className="absolute -bottom-6 left-0 right-0 flex justify-center">
                  <span className="text-[9px] font-bold text-white/20 uppercase tracking-tighter">
                    {(draft.config as any)?.aspectRatio === 'tiktok' ? '1080 × 1920 (9:16)' : 
                     (draft.config as any)?.aspectRatio === 'landscape' ? '1920 × 1080 (16:9)' : 'Auto Resolution'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-white/30 text-center">
                Overlay server is offline. Start it from Settings to preview.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
