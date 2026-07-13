import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'

export interface LoopbackRouteRegistration {
  port: number
  close: () => Promise<void>
}

interface LoopbackRoute {
  paths: Set<string>
  handle: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
  onError?: (error: Error) => void
}

interface LoopbackServerEntry {
  key: number | symbol
  server: Server
  routes: Map<symbol, LoopbackRoute>
  listenPromise: Promise<number>
  closingPromise: Promise<void> | null
}

const servers = new Map<number | symbol, LoopbackServerEntry>()

export async function registerLoopbackRoute(options: {
  port: number
  paths: readonly string[]
  handle: LoopbackRoute['handle']
  onError?: LoopbackRoute['onError']
}): Promise<LoopbackRouteRegistration> {
  const key = options.port === 0 ? Symbol('loopback-server') : options.port
  const existing = servers.get(key)
  if (existing?.closingPromise) {
    await existing.closingPromise
    return registerLoopbackRoute(options)
  }

  const entry = existing || createLoopbackServer(key, options.port)
  const routeId = Symbol('loopback-route')
  entry.routes.set(routeId, {
    paths: new Set(options.paths.map(normalizePath)),
    handle: options.handle,
    onError: options.onError
  })

  try {
    const port = await entry.listenPromise
    let closed = false
    return {
      port,
      close: async () => {
        if (closed) return
        closed = true
        entry.routes.delete(routeId)
        if (entry.routes.size === 0) await closeLoopbackServer(entry)
      }
    }
  } catch (error) {
    entry.routes.delete(routeId)
    if (servers.get(key) === entry) servers.delete(key)
    throw error
  }
}

function createLoopbackServer(key: number | symbol, port: number): LoopbackServerEntry {
  const routes = new Map<symbol, LoopbackRoute>()
  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`)
    const route = [...routes.values()].find((candidate) => candidate.paths.has(normalizePath(url.pathname)))
    if (!route) {
      response.writeHead(404).end('Not found')
      return
    }

    void Promise.resolve(route.handle(request, response)).catch((error) => {
      const normalizedError = error instanceof Error ? error : new Error(String(error))
      route.onError?.(normalizedError)
      if (!response.headersSent) response.writeHead(500)
      if (!response.writableEnded) response.end('Loopback route error')
    })
  })

  const entry: LoopbackServerEntry = {
    key,
    server,
    routes,
    listenPromise: new Promise<number>((resolve, reject) => {
      const onError = (error: Error) => reject(error)
      server.once('error', onError)
      server.listen(port, '127.0.0.1', () => {
        server.off('error', onError)
        const address = server.address()
        resolve(address && typeof address === 'object' ? address.port : port)
      })
    }),
    closingPromise: null
  }

  server.on('error', (error) => {
    for (const route of routes.values()) route.onError?.(error)
  })
  servers.set(key, entry)
  return entry
}

function closeLoopbackServer(entry: LoopbackServerEntry): Promise<void> {
  if (entry.closingPromise) return entry.closingPromise
  entry.closingPromise = new Promise<void>((resolve) => {
    entry.server.close(() => {
      if (servers.get(entry.key) === entry) servers.delete(entry.key)
      resolve()
    })
  })
  return entry.closingPromise
}

function normalizePath(path: string): string {
  const normalized = `/${String(path || '').replace(/^\/+|\/+$/g, '')}`
  return normalized === '/' ? normalized : normalized.replace(/\/+$/, '')
}
