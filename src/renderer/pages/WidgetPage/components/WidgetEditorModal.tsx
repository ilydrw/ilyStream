import { useState, useEffect, useMemo, useRef } from 'react'
import { IconRefresh } from '@tabler/icons-react'
import { type Widget } from '../../../../shared/widgets'
import { ConfigEditor } from './ConfigEditors'
import { WidgetThemeSection } from './ConfigEditors/WidgetThemeSection'
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
  const previewWidget = previewOverride ?? draft
  const previewConfig = previewWidget.config as Record<string, unknown>
  const isVerticalPreview = previewConfig.aspectRatio === 'tiktok'
  const previewAspectRatio =
    isVerticalPreview ? '9 / 16' :
    previewConfig.aspectRatio === 'landscape' ? '16 / 9' :
    '16 / 9'
  const previewResolution =
    isVerticalPreview ? '1080 x 1920' :
    previewConfig.aspectRatio === 'landscape' ? '1920 x 1080' :
    'Responsive canvas'

  useEffect(() => {
    setDraft(widget)
    setPreviewOverride(null)
  }, [widget.id])

  // Debounce the config update for the iframe URL to avoid flicker while dragging sliders
  const [debouncedConfig, setDebouncedConfig] = useState(previewWidget.config)
  const debounceTimer = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      setDebouncedConfig(previewWidget.config)
    }, 400) // 400ms delay for a snappy but stable feel
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [previewWidget.config])

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
          <span className="text-2xs font-black uppercase tracking-normal text-white/20">
            {draft.type}
          </span>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] h-full">
        {/* Config */}
        <div className="border-r border-white/5 overflow-y-auto custom-scrollbar p-8 bg-black/20">
          <div className="mb-8">
            <WidgetThemeSection draft={draft} onChange={handleDraftChange} />
          </div>
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

          <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
            {previewUrl ? (
              <div
                className={`relative shadow-2xl transition-all duration-500 ease-in-out ${isVerticalPreview ? '' : 'w-full max-w-[920px]'}`}
                style={isVerticalPreview
                  ? { height: 'calc(100% - 56px)', maxWidth: '100%', aspectRatio: previewAspectRatio }
                  : { aspectRatio: previewAspectRatio, maxHeight: 'calc(100% - 56px)' }
                }
              >
                <div
                  className="absolute inset-0 rounded-2xl overflow-hidden border border-white/10 shadow-glow"
                  style={{
                    backgroundColor: '#07080b',
                    backgroundImage:
                      'linear-gradient(45deg, rgba(255,255,255,0.045) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.045) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.045) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.045) 75%)',
                    backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0',
                    backgroundSize: '20px 20px'
                  }}
                >
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
                  <span className="text-[10px] font-black uppercase tracking-normal text-white/10">
                    {previewResolution}
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
              className="px-8 py-2.5 rounded-xl bg-brand-gradient text-white text-xs font-black uppercase tracking-normal hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-lg shadow-accent/20"
            >
              {saving ? 'Saving...' : 'Apply Changes'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
