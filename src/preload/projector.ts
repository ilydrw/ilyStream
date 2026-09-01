import { contextBridge, ipcRenderer } from 'electron'

type ProjectorEventChannel =
  | 'overlay:status-changed'
  | 'browser-source:frame'

const allowedEvents = new Set<ProjectorEventChannel>([
  'overlay:status-changed',
  'browser-source:frame'
])

ipcRenderer.on('studio:projector:mirror-source', (event, payload) => {
  const port = event.ports[0]
  if (port) (globalThis as any).postMessage({ __ilyProjectorChannel: 'mirror-source', payload }, '*', [port])
})

ipcRenderer.on('studio:projector:mirror-sink', (event) => {
  const port = event.ports[0]
  if (port) (globalThis as any).postMessage({ __ilyProjectorChannel: 'mirror-sink' }, '*', [port])
})

const projectorApi = {
  overlay: {
    getStatus: () => ipcRenderer.invoke('overlay:get-status')
  },
  studio: {
    getDesktopSources: () => ipcRenderer.invoke('studio:get-desktop-sources'),
    prepareDisplayCapture: (request: { sourceId: string; withAudio?: boolean; audioOnly?: boolean }) =>
      ipcRenderer.invoke('studio:prepare-display-capture', request),
    requestProjectorMirror: (aspectRatio?: '16:9' | '9:16') =>
      ipcRenderer.send('studio:projector:request-mirror', { aspectRatio }),
    startBrowserSource: (config: unknown) => ipcRenderer.invoke('studio:browser-source:start', config),
    updateBrowserSource: (config: unknown) => ipcRenderer.invoke('studio:browser-source:update', config),
    stopBrowserSource: (id: string) => ipcRenderer.invoke('studio:browser-source:stop', id),
    browserSourceFrameConsumed: (id: string) => ipcRenderer.send('studio:browser-source:frame-consumed', id)
  },
  on: (channel: ProjectorEventChannel, callback: (...args: unknown[]) => void) => {
    if (!allowedEvents.has(channel)) return () => {}
    const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('api', projectorApi)
