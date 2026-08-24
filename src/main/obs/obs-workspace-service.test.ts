import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OBSWorkspaceService } from './obs-workspace-service'

const runningServices: OBSWorkspaceService[] = []

afterEach(async () => {
  await Promise.all(runningServices.splice(0).map((service) => service.stop()))
})

describe('OBSWorkspaceService', () => {
  it('requires a one-time pair URL and serves a clean authenticated dock session', async () => {
    const { service } = makeService()
    runningServices.push(service)
    const access = await service.start()

    expect(access.running).toBe(true)
    expect(access.port).toBeTypeOf('number')
    expect(access.pairUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/obs\?pair=/)

    const unauthorized = await fetch(`${access.controlUrl!.replace('/obs', '')}/api/snapshot`)
    expect(unauthorized.status).toBe(401)

    const paired = await fetch(access.pairUrl!, { redirect: 'manual' })
    expect(paired.status).toBe(303)
    expect(paired.headers.get('location')).toBe('/obs')
    const cookie = paired.headers.get('set-cookie')!.split(';')[0]

    const dock = await fetch(access.controlUrl!, { headers: { Cookie: cookie } })
    const html = await dock.text()
    expect(dock.status).toBe(200)
    expect(html).toContain('ilyStream Control')
    expect(html).toContain('Standard OBS browser sources')
    expect(html).not.toContain(access.pairUrl!.split('pair=')[1])
    expect(html).toContain('.quick-grid { grid-template-columns: 1fr; }')
    expect(html).toContain('platformSelectionTouched')
    expect(html).not.toContain('if (enabled && !state.selectedPlatforms.has(platform.id))')
    expect(dock.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(dock.headers.get('content-security-policy')).toMatch(/script-src 'nonce-[A-Za-z0-9_-]+'/)
  })

  it('enforces origin and CSRF checks before a privileged dock action', async () => {
    const { service, ttsPause } = makeService()
    runningServices.push(service)
    const access = await service.start()
    const pairResponse = await fetch(access.pairUrl!, { redirect: 'manual' })
    const cookie = pairResponse.headers.get('set-cookie')!.split(';')[0]
    const dockResponse = await fetch(access.controlUrl!, { headers: { Cookie: cookie } })
    const html = await dockResponse.text()
    const csrf = html.match(/const CSRF_TOKEN = "([A-Za-z0-9_-]+)";/)?.[1]
    expect(csrf).toBeTruthy()

    const endpoint = `${access.controlUrl!.replace('/obs', '')}/api/action`
    const rejected = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        Origin: 'http://attacker.invalid',
        'X-ilyStream-CSRF': csrf!
      },
      body: JSON.stringify({ type: 'tts.pause' })
    })
    expect(rejected.status).toBe(403)
    expect(ttsPause).not.toHaveBeenCalled()

    const accepted = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        Origin: access.controlUrl!.replace('/obs', ''),
        'X-ilyStream-CSRF': csrf!
      },
      body: JSON.stringify({ type: 'tts.pause' })
    })
    const result = await accepted.json()
    expect(accepted.status).toBe(200)
    expect(result).toMatchObject({ ok: true, action: 'tts.pause', message: 'TTS paused.' })
    expect(ttsPause).toHaveBeenCalledOnce()
  })

  it('invalidates existing dock cookies when pairing is rotated', async () => {
    const { service } = makeService()
    runningServices.push(service)
    const access = await service.start()
    const pairResponse = await fetch(access.pairUrl!, { redirect: 'manual' })
    const cookie = pairResponse.headers.get('set-cookie')!.split(';')[0]

    const rotated = service.rotatePairing()
    expect(rotated.pairUrl).not.toBe(access.pairUrl)

    const staleSession = await fetch(`${access.controlUrl!.replace('/obs', '')}/api/snapshot`, {
      headers: { Cookie: cookie }
    })
    expect(staleSession.status).toBe(401)
  })

  it('serializes duplicate lifecycle calls and ignores dependency events after stop', async () => {
    const { service, obsService } = makeService()
    runningServices.push(service)

    const [first, second] = await Promise.all([service.start(), service.start()])
    expect(first).toMatchObject({ running: true, port: second.port })
    expect(second.running).toBe(true)

    await Promise.all([service.stop(), service.stop()])
    expect(service.getAccess()).toMatchObject({ running: false, port: null })

    obsService.emit('status')
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(obsService.getManagedBrowserSources).not.toHaveBeenCalled()
  })
})

function makeService() {
  const settings = new Map<string, unknown>()
  const db = {
    getSetting: vi.fn((key: string) => settings.get(key)),
    setSetting: vi.fn((key: string, value: unknown) => settings.set(key, value)),
    getAllWidgets: vi.fn(() => [{ id: 'chat-main', name: 'Unified Chat', type: 'chat-unified', config: {} }])
  }

  const obsService = Object.assign(new EventEmitter(), {
    getStatus: vi.fn(() => ({
      enabled: true,
      connecting: false,
      connected: true,
      host: '127.0.0.1',
      port: 4455,
      currentSceneName: 'Live',
      lastError: null,
      obsWebSocketVersion: '5.7.4',
      obsVersion: '32.2.2',
      virtualCameraActive: false,
      recordingActive: false,
      streamActive: false,
      scenes: ['Live'],
      updatedAt: new Date().toISOString()
    })),
    getManagedBrowserSources: vi.fn(async () => ({ sources: [], warnings: [] }))
  })

  const platformManager = Object.assign(new EventEmitter(), {
    getAllStatuses: vi.fn(() => ({ tiktok: 'connected' })),
    getAllErrors: vi.fn(() => ({ tiktok: null })),
    getChatCapabilities: vi.fn(() => ({ tiktok: { platform: 'tiktok', canSend: true } })),
    getViewerCounts: vi.fn(() => ({ tiktok: 12 }))
  })

  const ttsPause = vi.fn()
  const service = new OBSWorkspaceService({
    db: db as any,
    obsService: obsService as any,
    overlayServer: {
      getStatus: () => ({ running: true, port: 8899, requestedPort: 8899, lastError: null, startedAt: null })
    } as any,
    platformManager: platformManager as any,
    soundboardService: { getAllSounds: () => [] } as any,
    ttsEngine: {
      getRuntimeState: () => ({ enabled: true, paused: false, playing: false, queueLength: 0 }),
      pause: ttsPause
    } as any
  }, {
    appVersion: '0.0.27-test',
    defaultPort: 0,
    nativeBridge: false
  })

  return { service, ttsPause, obsService }
}
