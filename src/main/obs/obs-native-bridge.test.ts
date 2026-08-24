import { connect, type Socket } from 'node:net'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  OBS_NATIVE_BRIDGE_CREDENTIAL_FILE,
  OBS_PROGRAM_TRANSPORT_CAPABILITY,
  OBS_PROGRAM_TRANSPORT_VERSION,
  type OBSProgramTransportDescriptor,
  OBSNativeBridgeServer
} from './obs-native-bridge'

const servers: OBSNativeBridgeServer[] = []
const sockets: Socket[] = []
const temporaryDirectories: string[] = []

afterEach(async () => {
  sockets.splice(0).forEach((socket) => socket.destroy())
  await Promise.all(servers.splice(0).map((server) => server.stop()))
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('OBSNativeBridgeServer', () => {
  it('negotiates protocol v1 and handles the plugin command contract', async () => {
    const openControlCenter = vi.fn()
    const bridgePath = testBridgePath()
    const credentialPath = await testCredentialPath()
    const server = new OBSNativeBridgeServer({
      appVersion: '0.0.27-test',
      bridgePath,
      credentialPath,
      getSnapshot: async () => ({ protocol: 1, generatedAt: 'now' }) as any,
      onOpenControlCenter: openControlCenter
    })
    servers.push(server)
    expect((await server.start()).running).toBe(true)
    const credential = await readCredential(credentialPath)

    const socket = await openSocket(bridgePath)
    sockets.push(socket)
    const reader = new FrameReader(socket)
    socket.write(JSON.stringify({
      protocol: 1,
      type: 'hello',
      authToken: credential.token,
      client: 'ilyStream OBS Plugin',
      clientVersion: '1.0.0',
      obsVersion: '32.2.2',
      capabilities: ['dock', 'frontend-events']
    }) + '\n')

    const ack = await reader.waitFor('hello.ack')
    expect(ack).toMatchObject({
      protocol: 1,
      compatible: true,
      serverVersion: '0.0.27-test',
      payload: { appVersion: '0.0.27-test', protocol: 1 }
    })
    expect(await reader.waitFor('ilystream.snapshot')).toMatchObject({ payload: { protocol: 1 } })
    expect(server.getStatus()).toMatchObject({
      connected: true,
      clientVersion: '1.0.0',
      obsVersion: '32.2.2'
    })

    socket.write(JSON.stringify({
      protocol: 1,
      type: 'command.request',
      requestId: 'request-1',
      action: 'openControlCenter'
    }) + '\n')
    expect(await reader.waitFor('command.result')).toMatchObject({
      requestId: 'request-1',
      id: 'request-1',
      ok: true
    })
    expect(openControlCenter).toHaveBeenCalledOnce()
  })

  it('rejects incompatible clients without accepting later commands', async () => {
    const focus = vi.fn()
    const bridgePath = testBridgePath()
    const credentialPath = await testCredentialPath()
    const server = new OBSNativeBridgeServer({
      appVersion: '0.0.27-test',
      bridgePath,
      credentialPath,
      getSnapshot: async () => ({}) as any,
      onFocus: focus
    })
    servers.push(server)
    await server.start()
    const credential = await readCredential(credentialPath)
    const socket = await openSocket(bridgePath)
    sockets.push(socket)
    const reader = new FrameReader(socket)
    const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()))

    socket.write(JSON.stringify({ protocol: 999, type: 'hello', authToken: credential.token }) + '\n')
    expect(await reader.waitFor('hello.ack')).toMatchObject({ compatible: false })
    await closed
    expect(focus).not.toHaveBeenCalled()
    expect(server.getStatus().connected).toBe(false)
  })

  it('rejects unauthenticated clients before acknowledgements, snapshots, or commands', async () => {
    const focus = vi.fn()
    const getSnapshot = vi.fn(async () => ({ protocol: 1 }) as any)
    const bridgePath = testBridgePath()
    const credentialPath = await testCredentialPath()
    const server = new OBSNativeBridgeServer({
      appVersion: '0.0.27-test',
      bridgePath,
      credentialPath,
      getSnapshot,
      onFocus: focus
    })
    servers.push(server)
    await server.start()
    const credential = await readCredential(credentialPath)

    const socket = await openSocket(bridgePath)
    sockets.push(socket)
    let response = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => { response += chunk })
    const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()))
    socket.write(JSON.stringify({
      protocol: 1,
      type: 'hello',
      authToken: credential.token.replace(/^./, credential.token[0] === 'a' ? 'b' : 'a')
    }) + '\n')
    await closed

    expect(response).toBe('')
    expect(getSnapshot).not.toHaveBeenCalled()
    expect(focus).not.toHaveBeenCalled()
    expect(server.getStatus()).toMatchObject({ connected: false, lastError: 'Native bridge authentication failed.' })
    expect(JSON.stringify(server.getStatus())).not.toContain(credential.token)
  })

  it('persists the credential across restarts and adopts an explicit rotation only after restart', async () => {
    const bridgePath = testBridgePath()
    const credentialPath = await testCredentialPath()
    const server = new OBSNativeBridgeServer({
      appVersion: '0.0.27-test',
      bridgePath,
      credentialPath,
      getSnapshot: async () => ({ protocol: 1 }) as any
    })
    servers.push(server)

    await server.start()
    const first = await readCredential(credentialPath)
    expect(first).toMatchObject({ protocol: 1 })
    expect(first.token).toMatch(/^[a-f0-9]{64}$/)
    await server.stop()
    expect(await readCredential(credentialPath)).toEqual(first)

    await server.start()
    expect(await readCredential(credentialPath)).toEqual(first)
    await server.stop()

    const rotated = { protocol: 1, token: first.token === 'b'.repeat(64) ? 'c'.repeat(64) : 'b'.repeat(64) }
    await writeFile(credentialPath, JSON.stringify(rotated), { encoding: 'utf8', mode: 0o600 })
    await server.start()
    expect(await readCredential(credentialPath)).toEqual(rotated)

    const staleSocket = await openSocket(bridgePath)
    sockets.push(staleSocket)
    const staleClosed = new Promise<void>((resolve) => staleSocket.once('close', () => resolve()))
    staleSocket.write(JSON.stringify({ protocol: 1, type: 'hello', authToken: first.token }) + '\n')
    await staleClosed

    const currentSocket = await openSocket(bridgePath)
    sockets.push(currentSocket)
    const reader = new FrameReader(currentSocket)
    currentSocket.write(JSON.stringify({ protocol: 1, type: 'hello', authToken: rotated.token }) + '\n')
    expect(await reader.waitFor('hello.ack')).toMatchObject({ compatible: true })
  })

  it('replaces malformed credentials without leaving temporary secrets and serializes lifecycle calls', async () => {
    const bridgePath = testBridgePath()
    const credentialPath = await testCredentialPath()
    await writeFile(credentialPath, JSON.stringify({
      protocol: 1,
      token: 'A'.repeat(64),
      unexpected: true
    }))
    const server = new OBSNativeBridgeServer({
      appVersion: '0.0.27-test',
      bridgePath,
      credentialPath,
      getSnapshot: async () => ({ protocol: 1 }) as any
    })
    servers.push(server)

    const [firstStart, secondStart] = await Promise.all([server.start(), server.start()])
    expect(firstStart.running).toBe(true)
    expect(secondStart.running).toBe(true)
    const credential = await readCredential(credentialPath)
    expect(credential.token).toMatch(/^[a-f0-9]{64}$/)
    expect(credential).not.toHaveProperty('unexpected')
    expect((await readdir(join(credentialPath, '..'))).filter((name) => name.endsWith('.tmp'))).toEqual([])

    await Promise.all([server.stop(), server.stop()])
    expect(server.getStatus()).toMatchObject({ running: false, connected: false, lastError: null })
    expect(await readCredential(credentialPath)).toEqual(credential)
  })

  it('negotiates Program transport v1 and enforces generation-scoped subscribe, stats, retiring, and release messages', async () => {
    const bridgePath = testBridgePath()
    const credentialPath = await testCredentialPath()
    const server = new OBSNativeBridgeServer({
      appVersion: '0.0.27-test',
      bridgePath,
      credentialPath,
      getSnapshot: async () => ({ protocol: 1 }) as any
    })
    servers.push(server)
    await server.start()
    const programConsumersChanged = vi.fn()
    server.on('programConsumersChanged', programConsumersChanged)
    const credential = await readCredential(credentialPath)
    const socket = await openSocket(bridgePath)
    sockets.push(socket)
    const reader = new FrameReader(socket)
    socket.write(JSON.stringify({
      protocol: 1,
      type: 'hello',
      authToken: credential.token,
      client: 'ilyStream OBS Plugin',
      clientVersion: '1.0.0',
      obsVersion: '32.2.2',
      clientPid: 4_242,
      capabilities: [OBS_PROGRAM_TRANSPORT_CAPABILITY]
    }) + '\n')

    const ack = await reader.waitFor('hello.ack')
    expect(ack).toMatchObject({
      capabilities: [OBS_PROGRAM_TRANSPORT_CAPABILITY],
      negotiatedCapabilities: [OBS_PROGRAM_TRANSPORT_CAPABILITY],
      payload: {
        capabilities: [OBS_PROGRAM_TRANSPORT_CAPABILITY],
        negotiatedCapabilities: [OBS_PROGRAM_TRANSPORT_CAPABILITY]
      }
    })
    expect(ack).not.toHaveProperty('clientPid')

    const subscriptionId = randomUUID()
    const subscribe = waitForServerEvent(server, 'programSubscribe')
    socket.write(JSON.stringify({
      protocol: 1,
      type: 'program.subscribe',
      transportVersion: OBS_PROGRAM_TRANSPORT_VERSION,
      subscriptionId,
      sentAt: new Date().toISOString()
    }) + '\n')
    await expect(subscribe).resolves.toEqual({
      subscriptionId,
      clientPid: 4_242,
      transportVersion: OBS_PROGRAM_TRANSPORT_VERSION
    })
    expect(server.getStatus().programConsumers).toBe(1)

    const descriptor = validProgramDescriptor()
    expect(server.sendProgramTransportAvailable(subscriptionId, descriptor)).toBe(true)
    expect(await reader.waitFor('program.transport.available')).toEqual({
      protocol: 1,
      type: 'program.transport.available',
      transportVersion: 1,
      subscriptionId,
      descriptor,
      sentAt: expect.any(String)
    })
    expect(server.sendProgramTransportAvailable(subscriptionId, descriptor)).toBe(false)
    expect(server.sendProgramTransportRetiring(subscriptionId, {
      transportId: descriptor.transportId,
      generation: '6'
    }, 'producer-stopped')).toBe(false)

    const stats = waitForServerEvent(server, 'programTransportStats')
    socket.write(JSON.stringify({
      protocol: 1,
      type: 'program.transport.stats',
      transportVersion: 1,
      subscriptionId,
      transportId: descriptor.transportId,
      generation: descriptor.generation,
      videoFramesPresented: '120',
      videoFramesDropped: '2',
      audioFramesRead: '96000',
      audioUnderruns: '1',
      lastVideoTimestampNs: '2000000000',
      lastAudioTimestampNs: null,
      sentAt: new Date().toISOString()
    }) + '\n')
    await expect(stats).resolves.toMatchObject({
      subscriptionId,
      transportId: descriptor.transportId,
      generation: descriptor.generation,
      videoFramesPresented: '120',
      audioFramesRead: '96000'
    })

    const replacement = { ...validProgramDescriptor(), generation: '8' }
    expect(server.sendProgramTransportAvailable(subscriptionId, replacement)).toBe(true)
    expect(await reader.waitFor('program.transport.available')).toMatchObject({
      descriptor: {
        transportId: replacement.transportId,
        generation: '8'
      }
    })

    expect(server.sendProgramTransportRetiring(subscriptionId, descriptor, 'replaced')).toBe(true)
    expect(await reader.waitFor('program.transport.retiring')).toMatchObject({
      subscriptionId,
      transportId: descriptor.transportId,
      generation: descriptor.generation,
      reason: 'replaced'
    })

    const replacedRelease = waitForServerEvent(server, 'programTransportRelease')
    socket.write(JSON.stringify({
      protocol: 1,
      type: 'program.transport.release',
      transportVersion: 1,
      subscriptionId,
      transportId: descriptor.transportId,
      generation: descriptor.generation,
      reason: 'replaced',
      sentAt: new Date().toISOString()
    }) + '\n')
    await expect(replacedRelease).resolves.toMatchObject({
      subscriptionId,
      transportId: descriptor.transportId,
      generation: descriptor.generation,
      reason: 'replaced'
    })
    expect(server.getStatus().programConsumers).toBe(1)

    expect(server.sendProgramTransportRetiring(subscriptionId, replacement, 'producer-stopped')).toBe(true)
    await reader.waitFor('program.transport.retiring')
    const release = waitForServerEvent(server, 'programTransportRelease')
    socket.write(JSON.stringify({
      protocol: 1,
      type: 'program.transport.release',
      transportVersion: 1,
      subscriptionId,
      transportId: replacement.transportId,
      generation: replacement.generation,
      reason: 'consumer-stopped',
      sentAt: new Date().toISOString()
    }) + '\n')
    await release
    expect(server.getStatus().programConsumers).toBe(0)
    expect(programConsumersChanged.mock.calls.map(([count]) => count)).toEqual([1, 0])

    const secondSubscriptionId = randomUUID()
    const secondSubscribe = waitForServerEvent(server, 'programSubscribe')
    socket.write(JSON.stringify({
      protocol: 1,
      type: 'program.subscribe',
      transportVersion: 1,
      subscriptionId: secondSubscriptionId
    }) + '\n')
    await secondSubscribe
    const subscriptionOnlyRelease = waitForServerEvent(server, 'programTransportRelease')
    socket.write(JSON.stringify({
      protocol: 1,
      type: 'program.transport.release',
      transportVersion: 1,
      subscriptionId: secondSubscriptionId,
      transportId: null,
      generation: '0',
      reason: 'consumer-stopped'
    }) + '\n')
    await expect(subscriptionOnlyRelease).resolves.toMatchObject({
      subscriptionId: secondSubscriptionId,
      transportId: null,
      generation: '0'
    })
    expect(server.getStatus().programConsumers).toBe(0)
  })

  it('fails Program transport closed without a negotiated PID and rejects malformed descriptors without exposing handles', async () => {
    const bridgePath = testBridgePath()
    const credentialPath = await testCredentialPath()
    const server = new OBSNativeBridgeServer({
      appVersion: '0.0.27-test',
      bridgePath,
      credentialPath,
      getSnapshot: async () => ({ protocol: 1 }) as any
    })
    servers.push(server)
    await server.start()
    const credential = await readCredential(credentialPath)
    const socket = await openSocket(bridgePath)
    sockets.push(socket)
    const reader = new FrameReader(socket)
    const programSubscribe = vi.fn()
    server.on('programSubscribe', programSubscribe)
    socket.write(JSON.stringify({
      protocol: 1,
      type: 'hello',
      authToken: credential.token,
      capabilities: [OBS_PROGRAM_TRANSPORT_CAPABILITY]
    }) + '\n')
    expect(await reader.waitFor('hello.ack')).toMatchObject({ negotiatedCapabilities: [] })

    const subscriptionId = randomUUID()
    socket.write(JSON.stringify({
      protocol: 1,
      type: 'program.subscribe',
      transportVersion: 1,
      subscriptionId
    }) + '\n')
    await waitForSocketTurn()
    expect(programSubscribe).not.toHaveBeenCalled()
    expect(server.getStatus().programConsumers).toBe(0)
    expect(server.sendProgramTransportAvailable(subscriptionId, validProgramDescriptor())).toBe(false)

    const valid = validProgramDescriptor()
    expect(server.sendProgramTransportAvailable(subscriptionId, {
      ...valid,
      video: {
        ...valid.video,
        duplicatedHandles: ['DEADBEEFDEADBEEF', '0000000000000002']
      }
    })).toBe(false)
    expect(server.sendProgramTransportAvailable(subscriptionId, {
      ...valid,
      generation: '18446744073709551616'
    })).toBe(false)
    expect(JSON.stringify(server.getStatus())).not.toContain('DEADBEEFDEADBEEF')
    expect(JSON.stringify(server.getStatus())).not.toContain(credential.token)
  })
})

class FrameReader {
  private buffer = ''
  private frames: Array<Record<string, any>> = []
  private waiters: Array<{
    type: string
    resolve: (frame: Record<string, any>) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }> = []

  constructor(socket: Socket) {
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => this.receive(chunk))
  }

  waitFor(type: string): Promise<Record<string, any>> {
    const existing = this.frames.findIndex((frame) => frame.type === type)
    if (existing >= 0) return Promise.resolve(this.frames.splice(existing, 1)[0])
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 2_000)
      this.waiters.push({ type, resolve, reject, timer })
    })
  }

  private receive(chunk: string): void {
    this.buffer += chunk
    let newline = this.buffer.indexOf('\n')
    while (newline >= 0) {
      const raw = this.buffer.slice(0, newline).trim()
      this.buffer = this.buffer.slice(newline + 1)
      if (raw) this.deliver(JSON.parse(raw))
      newline = this.buffer.indexOf('\n')
    }
  }

  private deliver(frame: Record<string, any>): void {
    const waiterIndex = this.waiters.findIndex((waiter) => waiter.type === frame.type)
    if (waiterIndex < 0) {
      this.frames.push(frame)
      return
    }
    const waiter = this.waiters.splice(waiterIndex, 1)[0]
    clearTimeout(waiter.timer)
    waiter.resolve(frame)
  }
}

function openSocket(path: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(path)
    socket.once('connect', () => resolve(socket))
    socket.once('error', reject)
  })
}

function testBridgePath(): string {
  const name = `ilystream-obs-bridge-test-${randomUUID()}`
  return process.platform === 'win32' ? `\\\\.\\pipe\\${name}` : join(tmpdir(), `${name}.sock`)
}

async function testCredentialPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'ilystream-obs-credential-test-'))
  temporaryDirectories.push(directory)
  return join(directory, OBS_NATIVE_BRIDGE_CREDENTIAL_FILE)
}

async function readCredential(path: string): Promise<{ protocol: number; token: string }> {
  return JSON.parse(await readFile(path, 'utf8'))
}

function validProgramDescriptor(): OBSProgramTransportDescriptor {
  return {
    transportVersion: 1,
    transportId: randomUUID(),
    generation: '7',
    producerPid: 7_777,
    video: {
      adapterLuidHigh: -1,
      adapterLuidLow: 4_294_967_294,
      width: 1_920,
      height: 1_080,
      format: 'rgba8',
      colorSpace: 'srgb',
      slotCount: 2,
      duplicatedHandles: ['00000000000000a1', '00000000000000a2'],
      controlHandle: '00000000000000a3',
      keyedMutex: true,
      producerAcquireKey: '0',
      consumerAcquireKey: '1'
    },
    audio: {
      sampleRate: 48_000,
      channels: 2,
      format: 'f32-interleaved',
      ringName: `Local\\ilyStream.Program.Audio.${randomUUID()}`,
      capacityFrames: 96_000,
      blockFrames: 480,
      timestampTimebase: 'ns'
    }
  }
}

function waitForServerEvent(server: OBSNativeBridgeServer, event: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 2_000)
    server.once(event, (payload) => {
      clearTimeout(timer)
      resolve(payload as Record<string, unknown>)
    })
  })
}

function waitForSocketTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 25))
}
