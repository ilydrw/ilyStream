import { useEffect, useState } from 'react'
import { Monitor, Plus } from 'lucide-react'
import { type Widget } from '../../../shared/widgets'
import { WIDGET_TEMPLATES, type WidgetTemplate } from './constants'
import { WidgetCard } from './components/WidgetCard'
import { NewWidgetModal } from './components/NewWidgetModal'
import { WidgetEditorModal } from './components/WidgetEditorModal'

export default function WidgetPage() {
  const [widgets, setWidgets] = useState<Widget[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [editingWidget, setEditingWidget] = useState<Widget | null>(null)
  const [copyingId, setCopyingId] = useState<string | null>(null)
  const [overlayPort, setOverlayPort] = useState<number | null>(null)
  const [overlayRunning, setOverlayRunning] = useState(false)

  useEffect(() => {
    if (!window.api?.widgets) return

    void loadWidgets()
    void loadOverlayStatus()

    const unsub = window.api.on('settings:changed', () => {
      void loadOverlayStatus()
    })
    const unsubOverlay = window.api.on('overlay:status-changed', (status: unknown) => {
      applyOverlayStatus(status as { port: number | null; running: boolean })
    })
    const statusTimer = window.setInterval(loadOverlayStatus, 3000)
    return () => {
      unsub()
      unsubOverlay()
      window.clearInterval(statusTimer)
    }
  }, [])

  const loadOverlayStatus = async () => {
    try {
      const status = (await window.api.overlay.getStatus()) as {
        port: number | null
        running: boolean
      }
      applyOverlayStatus(status)
    } catch (error) {
      console.error('Failed to load overlay status', error)
    }
  }

  const applyOverlayStatus = (status: { port: number | null; running: boolean }) => {
    setOverlayPort(status.port ?? null)
    setOverlayRunning(Boolean(status.running))
  }

  const loadWidgets = async () => {
    try {
      const data = (await window.api.widgets.getAll()) as Widget[]
      setWidgets(data)
    } catch (error) {
      console.error('Failed to load widgets', error)
    } finally {
      setLoading(false)
    }
  }

  const createWidget = async (template: WidgetTemplate) => {
    if (!window.api?.widgets) {
      console.error('window.api.widgets is not available');
      return;
    }

    const widget: Widget = {
      id: crypto.randomUUID(),
      name: `${template.label}`,
      type: template.type,
      config: template.defaultConfig
    }

    try {
      await window.api.widgets.save(widget)
      setShowNewModal(false)
      await loadWidgets()
      // Open the editor immediately so the user sees what they just created.
      setEditingWidget(widget)
    } catch (error) {
      console.error('Failed to create widget', error)
    }
  }

  const saveWidget = async (widget: Widget) => {
    if (!window.api?.widgets) return;
    try {
      await window.api.widgets.save(widget)
      setWidgets((prev) => prev.map((w) => (w.id === widget.id ? widget : w)))
    } catch (error) {
      console.error('Failed to save widget', error)
    }
  }

  const deleteWidget = async (id: string) => {
    if (!window.api?.widgets) return;
    if (!confirm('Delete this widget? OBS browser sources pointing at this URL will go blank.')) {
      return
    }
    try {
      await window.api.widgets.delete(id)
      await loadWidgets()
    } catch (error) {
      console.error('Failed to delete widget', error)
    }
  }

  const overlayUrlFor = (id: string) => {
    if (!overlayPort) return null
    return `http://localhost:${overlayPort}/overlay/${id}`
  }

  const copyUrl = (id: string) => {
    const url = overlayUrlFor(id)
    if (!url) return
    navigator.clipboard.writeText(url).catch(() => {})
    setCopyingId(id)
    window.setTimeout(() => setCopyingId(null), 1500)
  }

  return (
    <div className="app-page">
      <header className="app-page-header">
        <div>
          <div className="app-header-eyebrow">
            <Monitor size={14} className="text-accent" />
            <span>Browser Sources</span>
          </div>
          <h1>Widgets &amp; Overlays</h1>
          <p className="app-page-intro">
            Configure on-stream graphics. Each widget produces a URL you can drop into OBS / Streamlabs as
            a browser source. Edit a widget and the live preview here matches exactly what your viewers see.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <OverlayStatusPill running={overlayRunning} port={overlayPort} />
          <button onClick={() => setShowNewModal(true)} className="app-button-primary !h-12 !px-6 text-xs font-bold">
            <Plus size={16} className="mr-2" />
            New Widget
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 opacity-30">
          <div className="w-10 h-10 border-2 border-white/10 border-t-accent rounded-full animate-spin" />
        </div>
      ) : widgets.length === 0 ? (
        <EmptyState onCreate={() => setShowNewModal(true)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {widgets.map((widget) => (
            <WidgetCard
              key={widget.id}
              widget={widget}
              url={overlayUrlFor(widget.id)}
              copyState={copyingId === widget.id}
              onCopyUrl={() => copyUrl(widget.id)}
              onConfigure={() => setEditingWidget(widget)}
              onDelete={() => void deleteWidget(widget.id)}
            />
          ))}
        </div>
      )}

      {showNewModal && (
        <NewWidgetModal
          templates={WIDGET_TEMPLATES}
          onClose={() => setShowNewModal(false)}
          onSelect={createWidget}
        />
      )}

      {editingWidget && (
        <WidgetEditorModal
          widget={editingWidget}
          overlayPort={overlayPort}
          onClose={() => setEditingWidget(null)}
          onSave={async (updated) => {
            await saveWidget(updated)
            setEditingWidget(updated) // keep modal open with refreshed state
          }}
        />
      )}
    </div>
  )
}

function OverlayStatusPill({ running, port }: { running: boolean; port: number | null }) {
  return (
    <div
      className={`flex items-center gap-2 h-12 px-4 rounded-xl border text-xs font-bold ${
        running ? 'border-success/30 bg-success/10 text-success' : 'border-white/10 bg-white/5 text-white/40'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${running ? 'bg-success' : 'bg-white/30'}`} />
      {running && port ? `localhost:${port}` : 'Overlay server offline'}
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 rounded-2xl border border-dashed border-white/10 bg-white/[0.01]">
      <Monitor size={40} className="text-white/10 mb-4" />
      <h3 className="text-lg font-bold text-white/60">No widgets yet</h3>
      <p className="text-sm text-white/30 mt-1 mb-6 text-center max-w-sm">
        Create a widget to generate a browser-source URL for OBS.
      </p>
      <button onClick={onCreate} className="app-button-primary !h-11 !px-6">
        <Plus size={15} className="mr-2" />
        Create your first widget
      </button>
    </div>
  )
}
