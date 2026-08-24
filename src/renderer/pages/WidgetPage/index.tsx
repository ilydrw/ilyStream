import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  IconDeviceDesktop,
  IconLayoutGrid,
  IconLayersLinked,
  IconSearch,
  IconServer,
  IconSparkles
} from '@tabler/icons-react'
import { IconPlus, IconWidgets } from '../../components/ui/icons'
import { type Widget } from '../../../shared/widgets'
import { WIDGET_TEMPLATES, type WidgetTemplate } from './constants'
import { WidgetCard } from './components/WidgetCard'
import { NewWidgetModal } from './components/NewWidgetModal'
import { WidgetEditorModal } from './components/WidgetEditorModal'
import { PageHeader } from '../../components/layout/PageHeader'
import { buildWidgetOverlayUrl, createWidgetFromTemplate } from './widget-customization'
import './widget-library.css'

interface OverlayStatusSnapshot {
  port: number | null
  running: boolean
}

export default function WidgetPage() {
  const [widgets, setWidgets] = useState<Widget[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [editingWidget, setEditingWidget] = useState<Widget | null>(null)
  const [copyingId, setCopyingId] = useState<string | null>(null)
  const [overlayPort, setOverlayPort] = useState<number | null>(null)
  const [overlayRunning, setOverlayRunning] = useState(false)
  const [query, setQuery] = useState('')

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
      applyOverlayStatus(status as OverlayStatusSnapshot)
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

  const applyOverlayStatus = (status: OverlayStatusSnapshot) => {
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
      console.error('window.api.widgets is not available')
      return
    }

    const widget = createWidgetFromTemplate(template)

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
    if (!window.api?.widgets) return
    try {
      await window.api.widgets.save(widget)
      setWidgets((prev) => prev.map((w) => (w.id === widget.id ? widget : w)))
    } catch (error) {
      console.error('Failed to save widget', error)
      throw error
    }
  }

  const deleteWidget = async (id: string) => {
    if (!window.api?.widgets) return
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
    return buildWidgetOverlayUrl(id, overlayPort)
  }

  const copyUrl = async (id: string) => {
    const url = overlayUrlFor(id)
    if (!url) return

    try {
      await copyText(url)
      setCopyingId(id)
      window.setTimeout(() => setCopyingId(null), 1500)
    } catch (error) {
      console.error('Failed to copy widget URL', error)
    }
  }

  const uniqueTypeCount = new Set(widgets.map((widget) => widget.type)).size
  const featuredTemplates = WIDGET_TEMPLATES.slice(0, 4)
  const visibleWidgets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return widgets

    return widgets.filter((widget) => {
      const template = WIDGET_TEMPLATES.find((entry) => entry.type === widget.type)
      return `${widget.name} ${template?.label ?? widget.type}`.toLowerCase().includes(normalizedQuery)
    })
  }, [query, widgets])
  const overlayEndpoint = overlayRunning && overlayPort ? `127.0.0.1:${overlayPort}` : null
  const commandTone = overlayEndpoint ? 'is-ready' : 'is-warning'
  const commandTitle = overlayEndpoint
    ? widgets.length > 0
      ? `${widgets.length} browser source${widgets.length === 1 ? '' : 's'} ready to use`
      : 'Your overlay workspace is ready'
    : overlayRunning
      ? 'The overlay server is starting'
      : 'Your widgets are safe, but previews are offline'
  const commandDetail = overlayRunning
    ? widgets.length > 0
      ? overlayEndpoint
        ? `Saved URLs are available on ${overlayEndpoint}. Configure a widget here, then add its URL to OBS or Broadcast Studio.`
        : 'The overlay server is starting. Saved URLs and previews will appear as soon as its endpoint is ready.'
      : 'The overlay server is running. Start from a template and ilyStream will open the editor immediately.'
    : 'Saved widget configuration is unchanged. Browser-source URLs and previews will return when the overlay server is running again.'

  return (
    <div className="app-page widgets-page">
      <PageHeader
        kicker="Overlay compositor"
        title="Overlays & Widgets"
        icon={IconWidgets}
        description="Create browser-source graphics that stay wired to live events, chat, Spotify, stats, and the overlay server."
        actions={
          <>
            <OverlayStatusPill running={overlayRunning} port={overlayPort} />
            <button onClick={() => setShowNewModal(true)} className="app-button-primary">
              <IconPlus size={15} />
              New widget
            </button>
          </>
        }
      />

      <section className={`widget-library-command app-section-card glass ${commandTone}`}>
        <div className="widget-library-command-main">
          <div className="widget-library-command-copy">
            <div>
              <div className="widget-library-eyebrow">
                <span aria-hidden="true" />
                Browser-source workspace
              </div>
              <div className="widget-library-command-icon" aria-hidden="true">
                {overlayRunning ? <IconLayersLinked size={23} /> : <IconServer size={23} />}
              </div>
              <h2>{commandTitle}</h2>
              <p>{commandDetail}</p>
            </div>

            <div className="widget-library-command-actions">
              <button type="button" className="app-button-primary" onClick={() => setShowNewModal(true)}>
                <IconPlus size={14} />
                Create widget
              </button>
              <Link to="/broadcast" className="app-button">
                Broadcast Studio
              </Link>
            </div>

            <div className="widget-library-command-facts">
              <div>
                <span>Saved</span>
                <strong>{widgets.length} widgets</strong>
              </div>
              <div>
                <span>Endpoint</span>
                <strong>{overlayEndpoint ? `Port ${overlayPort}` : 'Unavailable'}</strong>
              </div>
              <div>
                <span>Templates</span>
                <strong>{WIDGET_TEMPLATES.length} available</strong>
              </div>
            </div>
          </div>

          <div className="widget-template-launcher">
            <div className="widget-template-launcher-head">
              <div>
                <span>Quick start</span>
                <strong>Start with a proven layout</strong>
              </div>
              <button type="button" className="app-button" onClick={() => setShowNewModal(true)}>
                All templates
              </button>
            </div>
            <div className="widget-template-launcher-grid">
              {featuredTemplates.map((template) => {
                const TemplateIcon = template.icon
                return (
                  <button
                    key={template.type}
                    type="button"
                    className="widget-template-launcher-item"
                    onClick={() => void createWidget(template)}
                  >
                    <span>
                      <TemplateIcon size={17} />
                    </span>
                    <span>
                      <strong>{template.label}</strong>
                      <small>{template.description}</small>
                    </span>
                    <IconPlus size={14} />
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="widget-library-signal-strip" aria-label="Widget library summary">
          <LibrarySignal
            icon={<IconLayersLinked size={16} />}
            label="Saved widgets"
            value={widgets.length.toLocaleString()}
            detail="Configuration preserved"
            tone={widgets.length > 0 ? 'ready' : 'idle'}
          />
          <LibrarySignal
            icon={<IconLayoutGrid size={16} />}
            label="Widget types"
            value={uniqueTypeCount.toLocaleString()}
            detail="In your library"
            tone={uniqueTypeCount > 0 ? 'ready' : 'idle'}
          />
          <LibrarySignal
            icon={<IconSparkles size={16} />}
            label="Templates"
            value={WIDGET_TEMPLATES.length.toLocaleString()}
            detail="Ready to customize"
            tone="ready"
          />
          <LibrarySignal
            icon={<IconServer size={16} />}
            label="Source runtime"
            value={overlayRunning ? 'Online' : 'Offline'}
            detail={overlayEndpoint ?? 'Saved state is safe'}
            tone={overlayEndpoint ? 'ready' : 'warning'}
          />
        </div>
      </section>

      {loading ? (
        <div className="widget-library-loading">
          <div />
          <span>Loading widget library</span>
        </div>
      ) : widgets.length === 0 ? (
        <EmptyState onCreate={() => setShowNewModal(true)} />
      ) : (
        <section className="widget-library-section">
          <div className="widget-library-head">
            <div>
              <span>Your collection</span>
              <h2>Widget library</h2>
              <p>Configure, copy, and preview saved browser sources without changing their URLs.</p>
            </div>
            <label className="widget-library-search">
              <IconSearch size={15} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search widgets"
                aria-label="Search widgets"
              />
              <span>{visibleWidgets.length}/{widgets.length}</span>
            </label>
          </div>

          {visibleWidgets.length === 0 ? (
            <div className="widget-library-no-results">
              <IconSearch size={24} />
              <strong>No matching widgets</strong>
              <p>Try a widget name or template type.</p>
              <button type="button" className="app-button" onClick={() => setQuery('')}>
                Clear search
              </button>
            </div>
          ) : (
            <div className="widget-card-grid">
              {visibleWidgets.map((widget) => (
                <WidgetCard
                  key={widget.id}
                  widget={widget}
                  url={overlayUrlFor(widget.id)}
                  // Previews render inside the app, where CSP only allows framing
                  // loopback origins — never the LAN host we advertise for OBS /
                  // external devices. The local server answers on both.
                  previewUrl={buildWidgetOverlayUrl(widget.id, overlayPort)}
                  copyState={copyingId === widget.id}
                  onCopyUrl={() => void copyUrl(widget.id)}
                  onConfigure={() => setEditingWidget(widget)}
                  onDelete={() => void deleteWidget(widget.id)}
                />
              ))}
            </div>
          )}
        </section>
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
          }}
        />
      )}
    </div>
  )
}

function LibrarySignal({
  icon,
  label,
  value,
  detail,
  tone
}: {
  icon: React.ReactNode
  label: string
  value: string
  detail: string
  tone: 'ready' | 'warning' | 'idle'
}) {
  return (
    <div className={`widget-library-signal is-${tone}`}>
      <span className="widget-library-signal-icon">{icon}</span>
      <span className="widget-library-signal-copy">
        <em>{label}</em>
        <strong>{value}</strong>
        <small>{detail}</small>
      </span>
    </div>
  )
}

async function copyText(value: string): Promise<void> {
  if (window.api?.system?.copyToClipboard) {
    await window.api.system.copyToClipboard(value)
    return
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('Clipboard copy was rejected')
}

function OverlayStatusPill({ running, port }: { running: boolean; port: number | null }) {
  const ready = running && Boolean(port)
  return (
    <div className={`widget-overlay-status ${ready ? 'is-ready' : 'is-offline'}`}>
      <span />
      {ready ? `127.0.0.1:${port}` : running ? 'Overlay server starting' : 'Overlay server offline'}
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
        <h3>No widgets yet</h3>
        <p>Create a widget and use the browser-source URL shown on its card.</p>
      </div>
      <button onClick={onCreate} className="app-button-primary !h-11 !px-6">
        <IconPlus size={15} className="mr-2" />
        Create widget
      </button>
    </div>
  )
}
