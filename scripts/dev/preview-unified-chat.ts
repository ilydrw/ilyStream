import { createServer, type ServerResponse } from 'node:http'
import { DEFAULT_CHAT_UNIFIED_CONFIG } from '../../src/shared/widgets'
import { buildChatWidgetHtml } from '../../src/main/overlay/templates/chat-widget'

const host = '127.0.0.1'
const port = Number(process.env.ILYSTREAM_CHAT_PREVIEW_PORT || 18990)

function sendJson(response: ServerResponse, value: unknown): void {
  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8'
  })
  response.end(JSON.stringify(value))
}

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${host}:${port}`)

  if (url.pathname === '/overlay/chat/state') {
    sendJson(response, [])
    return
  }

  if (url.pathname === '/overlay/events') {
    response.writeHead(200, {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream; charset=utf-8'
    })
    response.write(': unified-chat visual preview\n\n')
    return
  }

  if (url.pathname === '/' || url.pathname === '/empty') {
    const html = buildChatWidgetHtml({
      config: {
        ...DEFAULT_CHAT_UNIFIED_CONFIG,
        dockMode: true
      }
    }, url.pathname === '/')
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8'
    })
    response.end(html)
    return
  }

  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  response.end('Not found')
})

server.listen(port, host, () => {
  console.log(`Unified Chat dock preview: http://${host}:${port}/`)
  console.log(`Unified Chat empty state: http://${host}:${port}/empty`)
})

