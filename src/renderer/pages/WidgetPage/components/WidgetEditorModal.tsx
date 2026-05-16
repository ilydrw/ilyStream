import { useState, useEffect, useMemo, useRef } from 'react'
import { IconRefresh } from '@tabler/icons-react'
import { type Widget } from '../../../../shared/widgets'
import { ConfigEditor } from './ConfigEditors'
import { Modal } from '../../../components/ui/Modal'

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

  useEffect(() => {
    setDraft(widget)
  }, [widget.id])

  // Debounce the config update for the iframe URL to avoid flicker while dragging sliders
  const [debouncedConfig, setDebouncedConfig] = useState(draft.config)
  const debounceTimer = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      setDebouncedConfig(draft.config)
    }, 400) // 400ms delay for a snappy but stable feel
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [draft.config])

  const previewWidget = previewOverride ?? draft

  const previewUrl = useMemo(() => {
    if (!overlayPort) return null
    const base = `http://127.0.0.1:${overlayPort}/overlay/${previewWidget.id}`
    try {
      // Use debouncedConfig for the URL to avoid flickering iframe reloads
      const configJson = JSON.stringify(debouncedConfig)
      const encoded = btoa(unescape(encodeURIComponent(configJson)))
      return `${base}?config=${encoded}&preview=1`
    } catch (e) {
      return base
    }
  }, [overlayPort, previewWidget.id, debouncedConfig])

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
      setPreviewKey((k) => k + 1)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      className="max-w-6xl h-[90vh]"
      headerActions={
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-1.5 text-sm font-bold text-white focus:border-accent/50 focus:outline-none w-64 transition-all"
            placeholder="Widget name"
          />
          <span className="text-2xs font-black uppercase tracking-[0.2em] text-white/20">
            {draft.type}
          </span>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] h-full">
        {/* Config */}
        <div className="border-r border-white/5 overflow-y-auto custom-scrollbar p-8 bg-black/20">
          <ConfigEditor draft={draft} onChange={handleDraftChange} onPreview={handlePreviewOverride} />
        </div>

        {/* Preview */}
        <div className="bg-[#050505] flex flex-col min-h-0 relative">
          <div className="absolute top-4 right-4 z-context flex items-center gap-2">
            <button
              onClick={() => setPreviewKey((k) => k + 1)}
              className="p-2 rounded-lg bg-white/5 border border-white/10 hover:border-accent/30 text-white/40 hover:text-white transition-all cursor-pointer"
              title="Reload preview"
            >
              <IconRefresh size={16} />
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center p-12 overflow-hidden">
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
                <div className="absolute inset-0 rounded-2xl overflow-hidden border border-white/10 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22 viewBox=%220 0 20 20%22><rect x=%220%22 y=%220%22 width=%2210%22 height=%2210%22 fill=%22%23131517%22/><rect x=%2210%22 y=%2210%22 width=%2210%22 height=%2210%22 fill=%22%23131517%22/></svg>')] shadow-glow">
                  <iframe
                    key={previewKey}
                    src={previewUrl}
                    title="Widget preview"
                    className="w-full h-full"
                    style={{ border: 'none', background: 'transparent' }}
                  />
                </div>

                {/* Resolution Badge */}
                <div className="absolute -bottom-8 left-0 right-0 flex justify-center">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/10">
                    {(draft.config as any)?.aspectRatio === 'tiktok' ? '1080 × 1920 (9:16)' :
                     (draft.config as any)?.aspectRatio === 'landscape' ? '1920 × 1080 (16:9)' : 'Auto Resolution'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="w-16 h-16 rounded-3xl bg-white/[0.03] border border-white/5 flex items-center justify-center text-white/10 mb-2">
                  <IconRefresh size={32} />
                </div>
                <div className="text-sm font-bold text-white/30">Overlay Server Offline</div>
                <div className="text-xs text-white/10 max-w-[200px]">Start the server from Settings to enable live preview.</div>
              </div>
            )}
          </div>

          <div className="p-6 border-t border-white/5 flex items-center justify-end gap-3 bg-black/40 backdrop-blur-md">
            <button onClick={onClose} className="px-6 py-2.5 rounded-xl text-xs font-bold text-white/40 hover:text-white hover:bg-white/5 transition-all cursor-pointer">
              Discard
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-8 py-2.5 rounded-xl bg-brand-gradient text-white text-xs font-black uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-lg shadow-accent/20"
            >
              {saving ? 'Saving...' : 'Apply Changes'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
