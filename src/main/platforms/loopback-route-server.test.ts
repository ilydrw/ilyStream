import { createServer } from 'http'
import { describe, expect, it } from 'vitest'
import { registerLoopbackRoute } from './loopback-route-server'

describe('loopback route server', () => {
  it('shares one fixed port between independent route owners', async () => {
    const port = await findAvailablePort()
    const first = await registerLoopbackRoute({
      port,
      paths: ['/kick/webhook'],
      handle: (_request, response) => {
        response.end('kick')
      }
    })
    const second = await registerLoopbackRoute({
      port,
      paths: ['/callback', '/callback/'],
      handle: (_request, response) => {
        response.end('tiktok')
      }
    })

    try {
      await expect(fetch(`http://127.0.0.1:${port}/kick/webhook`).then((response) => response.text()))
        .resolves.toBe('kick')
      await expect(fetch(`http://127.0.0.1:${port}/callback/`).then((response) => response.text()))
        .resolves.toBe('tiktok')
      await expect(fetch(`http://127.0.0.1:${port}/missing`).then((response) => response.status))
        .resolves.toBe(404)
    } finally {
      await second.close()
      await first.close()
    }
  })
})

async function findAvailablePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = address && typeof address === 'object' ? address.port : 0
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return port
}
