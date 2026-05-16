import { useEffect, useState } from 'react'
import {IconDeviceDesktop, IconExternalLink, IconLayersLinked, IconPlus, IconStack2} from '@tabler/icons-react'
import { type Widget } from '../../../shared/widgets'
import { WIDGET_TEMPLATES, type WidgetTemplate } from './constants'
import { WidgetCard } from './components/WidgetCard'
import { NewWidgetModal } from './components/NewWidgetModal'
import { WidgetEditorModal } from './components/WidgetEditorModal'
import { PageHeader } from '../../components/layout/PageHeader'

export default function WidgetPage() {
  const [widgets, setWidgets] = useState<Widget[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [editingWidget, setEditingWidget] = useState<Widget | null>(null)
  const [copyingId, setCopyingId] = useState<string | null>(null)
  const [overlayPort, setOverlayPort] = useState<number | null>(null)
  const [overlayRunning, setOverlayRunning] = useState(false)

  useEffect(() => {
    if (!window.api?.widgets) {
      setLoading(false)
      return
    }

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
    return `http://127.0.0.1:${overlayPort}/overlay/${id}`
  }

  const copyUrl = (id: string) => {
    const url = overlayUrlFor(id)
    if (!url) return
    navigator.clipboard.writeText(url).catch(() => {})
    setCopyingId(id)
    window.setTimeout(() => setCopyingId(null), 1500)
  }

  return (
    <div className="app-page widgets-page">
      <PageHeader
        kicker="Overlay compositor"
        title="Widgets & Overlays"
        icon={IconStack2}
        description="Create browser-source graphics that stay wired to live events, chat, Spotify, stats, and the overlay server."
        actions={
          <>
          <OverlayStatusPill running={overlayRunning} port={overlayPort} />
          <button onClick={() => setShowNewModal(true)} className="app-button-primary !h-12 !px-6 text-xs font-bold">
            <IconPlus size={16} className="mr-2" />
            New Widget
          </button>
          </>
        }
      />

      <section className="widget-command-strip">
        <div className="widget-command-strip__stat">
          <IconLayersLinked size={18} />
          <span>Saved widgets</span>
          <strong>{widgets.length}</strong>
        </div>
        <div className="widget-command-strip__stat">
          <IconExternalLink size={18} />
          <span>OBS route</span>
          <strong>{overlayRunning && overlayPort ? `:${overlayPort}` : 'Offline'}</strong>
        </div>
        <div className="widget-template-shelf" aria-label="Available widget templates">
          {WIDGET_TEMPLATES.slice(0, 7).map((template) => {
            const TemplateIcon = template.icon
            return (
              <button
                key={template.type}
                type="button"
                className="widget-template-chip"
                onClick={() => void createWidget(template)}
                title={`Create ${template.label}`}
              >
                <TemplateIcon size={15} />
                <span>{template.label}</span>
              </button>
            )
          })}
        </div>
      </section>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 opacity-30">
          <div className="w-10 h-10 border-2 border-white/10 border-t-accent rounded-full animate-spin" />
        </div>
      ) : widgets.length === 0 ? (
        <EmptyState onCreate={() => setShowNewModal(true)} />
      ) : (
        <div className="widget-card-grid">
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
      className={`flex items-center gap-2 h-12 px-4 rounded-lg border text-xs font-bold ${
        running ? 'border-success/30 bg-success/10 text-success' : 'border-white/10 bg-white/5 text-white/40'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${running ? 'bg-success' : 'bg-white/30'}`} />
      {running && port ? `127.0.0.1:${port}` : 'Overlay server offline'}
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="widget-empty-state">
      <div className="widget-empty-state__screen">
        <IconDeviceDesktop size={42} />
        <span />
      </div>
      <div>
        <h3>No overlay routes yet</h3>
        <p>Create the first widget and ilyStream will generate the browser-source URL for OBS.</p>
      </div>
      <button onClick={onCreate} className="app-button-primary !h-11 !px-6">
        <IconPlus size={15} className="mr-2" />
        Create widget
      </button>
    </div>
  )
}
