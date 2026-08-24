import { EventEmitter } from 'node:events'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { chmod, mkdir, open, rename, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server, type Socket } from 'node:net'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  OBS_WORKSPACE_PROTOCOL_VERSION,
  type OBSNativeBridgeStatus,
  type OBSWorkspaceSnapshot
} from '../../shared/obs-workspace'

export const OBS_NATIVE_BRIDGE_NAME = 'ilystream.obs.bridge.v1'
export const OBS_NATIVE_BRIDGE_CREDENTIAL_FILE = 'obs-bridge-v1.json'
export const OBS_NATIVE_BRIDGE_PATH = process.platform === 'win32'
  ? `\\\\.\\pipe\\${OBS_NATIVE_BRIDGE_NAME}`
  : join(tmpdir(), `${OBS_NATIVE_BRIDGE_NAME}.sock`)

const MAX_FRAME_BYTES = 64 * 1024
const MAX_CREDENTIAL_BYTES = 4 * 1024
const MAX_CLIENTS = 4
const HANDSHAKE_TIMEOUT_MS = 5_000
const TOKEN_PATTERN = /^[a-f0-9]{64}$/
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const UINT64_PATTERN = /^(?:0|[1-9][0-9]{0,19})$/
const DUPLICATED_HANDLE_PATTERN = /^[0-9a-f]{16}$/
const REASON_PATTERN = /^[a-z][a-z0-9.-]{0,63}$/
const AUDIO_RING_PATTERN = /^Local\\ilyStream\.Program\.Audio\.[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const CAPABILITY_PATTERN = /^[a-z][a-z0-9.-]{0,63}$/
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const MAX_UINT64 = '18446744073709551615'
const MAX_VIDEO_DIMENSION = 16_384
const MAX_AUDIO_CAPACITY_FRAMES = 480_000
const MAX_AUDIO_BLOCK_FRAMES = 4_096
const MAX_OUTSTANDING_PROGRAM_TRANSPORTS = 4

export const OBS_PROGRAM_TRANSPORT_VERSION = 1 as const
export const OBS_PROGRAM_TRANSPORT_CAPABILITY = 'program.transport.v1' as const
export const OBS_NATIVE_BRIDGE_CAPABILITIES = Object.freeze([
  OBS_PROGRAM_TRANSPORT_CAPABILITY
] as const)

export interface OBSProgramVideoTransportDescriptor {
  adapterLuidHigh: number
  adapterLuidLow: number
  width: number
  height: number
  format: 'rgba8'
  colorSpace: 'srgb'
  slotCount: 2
  duplicatedHandles: [string, string]
  controlHandle: string
  keyedMutex: true
  producerAcquireKey: '0'
  consumerAcquireKey: '1'
}

export interface OBSProgramAudioTransportDescriptor {
  sampleRate: 48_000
  channels: 2
  format: 'f32-interleaved'
  ringName: string
  capacityFrames: number
  blockFrames: number
  timestampTimebase: 'ns'
}

export interface OBSProgramTransportDescriptor {
  transportVersion: typeof OBS_PROGRAM_TRANSPORT_VERSION
  transportId: string
  generation: string
  producerPid: number
  video: OBSProgramVideoTransportDescriptor
  audio: OBSProgramAudioTransportDescriptor
}

export interface OBSProgramTransportLease {
  transportId: string
  generation: string
}

export interface OBSProgramSubscribeRequest {
  subscriptionId: string
  clientPid: number
  transportVersion: typeof OBS_PROGRAM_TRANSPORT_VERSION
}

interface OBSProgramSubscribeFrame {
  subscriptionId: string
  transportVersion: typeof OBS_PROGRAM_TRANSPORT_VERSION
}

export interface OBSProgramTransportRelease {
  subscriptionId: string
  transportVersion: typeof OBS_PROGRAM_TRANSPORT_VERSION
  transportId: string | null
  generation: string
  reason: string
}

export interface OBSProgramTransportStats extends OBSProgramTransportLease {
  subscriptionId: string
  transportVersion: typeof OBS_PROGRAM_TRANSPORT_VERSION
  videoFramesPresented: string
  videoFramesDropped: string
  audioFramesRead: string
  audioUnderruns: string
  lastVideoTimestampNs: string | null
  lastAudioTimestampNs: string | null
}

interface BridgeClient {
  socket: Socket
  buffer: string
  authenticated: boolean
  clientVersion: string | null
  obsVersion: string | null
  clientPid: number | null
  capabilities: string[]
  negotiatedCapabilities: string[]
  programSubscription: OBSProgramSubscribeFrame | null
  programTransportLeases: Map<string, OBSProgramTransportLease>
  latestProgramGeneration: string | null
  handshakeTimer: ReturnType<typeof setTimeout> | null
}

export interface NativeBridgeOptions {
  appVersion: string
  getSnapshot: () => Promise<OBSWorkspaceSnapshot>
  onFocus?: () => Promise<void> | void
  onOpenControlCenter?: () => Promise<void> | void
  bridgePath?: string
  credentialPath: string
}

type NativeBridgeCommand = 'focus' | 'openControlCenter'

export class OBSNativeBridgeServer extends EventEmitter {
  private server: Server | null = null
  private clients = new Set<BridgeClient>()
  private options: NativeBridgeOptions
  private readonly bridgePath: string
  private readonly credentialPath: string
  private credentialToken: Buffer | null = null
  private lifecycleQueue: Promise<void> = Promise.resolve()
  private status: OBSNativeBridgeStatus = {
    running: false,
    connected: false,
    clientVersion: null,
    obsVersion: null,
    capabilities: [],
    programConsumers: 0,
    lastSeenAt: null,
    lastError: null
  }

  constructor(options: NativeBridgeOptions) {
    super()
    this.options = options
    this.bridgePath = options.bridgePath || OBS_NATIVE_BRIDGE_PATH
    this.credentialPath = options.credentialPath
  }

  setCommandHandlers(handlers: Pick<NativeBridgeOptions, 'onFocus' | 'onOpenControlCenter'>): void {
    this.options.onFocus = handlers.onFocus
    this.options.onOpenControlCenter = handlers.onOpenControlCenter
  }

  getStatus(): OBSNativeBridgeStatus {
    return {
      ...this.status,
      capabilities: [...this.status.capabilities]
    }
  }

  start(): Promise<OBSNativeBridgeStatus> {
    return this.runLifecycle(() => this.startInternal())
  }

  stop(): Promise<void> {
    return this.runLifecycle(() => this.stopInternal())
  }

  private async startInternal(): Promise<OBSNativeBridgeStatus> {
    if (this.server?.listening) return this.getStatus()

    try {
      this.clearCredentialToken()
      this.credentialToken = await loadOrCreateCredentialToken(this.credentialPath)
    } catch (error) {
      this.status.running = false
      this.status.lastError = `Native bridge credential could not be prepared: ${errorMessage(error)}`
      this.emitStatus()
      return this.getStatus()
    }

    const server = createServer((socket) => this.handleConnection(socket))
    this.server = server

    server.on('error', (error) => {
      this.status.running = false
      this.status.lastError = error.message
      this.emitStatus()
    })

    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
          server.off('listening', onListening)
          reject(error)
        }
        const onListening = () => {
          server.off('error', onError)
          resolve()
        }
        server.once('error', onError)
        server.once('listening', onListening)
        server.listen(this.bridgePath)
      })
      this.status.running = true
      this.status.lastError = null
      this.emitStatus()
    } catch (error) {
      this.server = null
      this.clearCredentialToken()
      this.status.running = false
      this.status.lastError = errorMessage(error)
      try { server.close() } catch {}
      this.emitStatus()
    }

    return this.getStatus()
  }

  private async stopInternal(): Promise<void> {
    const server = this.server
    this.server = null
    for (const client of this.clients) {
      this.clearHandshakeTimer(client)
      client.socket.destroy()
    }
    this.clients.clear()

    if (server) {
      await new Promise<void>((resolve) => {
        try {
          server.close(() => resolve())
        } catch {
          resolve()
        }
      })
    }

    const hadProgramConsumers = this.status.programConsumers > 0
    this.status = {
      running: false,
      connected: false,
      clientVersion: null,
      obsVersion: null,
      capabilities: [],
      programConsumers: 0,
      lastSeenAt: this.status.lastSeenAt,
      lastError: null
    }
    if (hadProgramConsumers) this.emit('programConsumersChanged', 0)
    this.clearCredentialToken()
    this.emitStatus()
  }

  broadcastSnapshot(snapshot: OBSWorkspaceSnapshot): void {
    for (const client of this.clients) {
      if (client.authenticated) {
        this.send(client.socket, {
          protocol: OBS_WORKSPACE_PROTOCOL_VERSION,
          type: 'ilystream.snapshot',
          payload: snapshot
        })
      }
    }
  }

  sendProgramTransportAvailable(subscriptionId: string, descriptor: unknown): boolean {
    const client = this.findProgramSubscriber(subscriptionId)
    const normalizedDescriptor = parseProgramTransportDescriptor(descriptor)
    if (!client || !normalizedDescriptor) return false
    if (client.latestProgramGeneration !== null &&
      compareUint64Strings(normalizedDescriptor.generation, client.latestProgramGeneration) <= 0) return false
    if (client.programTransportLeases.size >= MAX_OUTSTANDING_PROGRAM_TRANSPORTS) return false

    const sent = this.send(client.socket, {
      protocol: OBS_WORKSPACE_PROTOCOL_VERSION,
      type: 'program.transport.available',
      transportVersion: OBS_PROGRAM_TRANSPORT_VERSION,
      subscriptionId,
      descriptor: normalizedDescriptor,
      sentAt: new Date().toISOString()
    })
    if (sent) {
      const lease = {
        transportId: normalizedDescriptor.transportId,
        generation: normalizedDescriptor.generation
      }
      client.programTransportLeases.set(programTransportLeaseKey(lease), lease)
      client.latestProgramGeneration = normalizedDescriptor.generation
    }
    return sent
  }

  sendProgramTransportRetiring(
    subscriptionId: string,
    lease: OBSProgramTransportLease,
    reason: string
  ): boolean {
    const client = this.findProgramSubscriber(subscriptionId)
    if (!client || !isProgramTransportLease(lease) || !REASON_PATTERN.test(reason)) return false
    if (!client.programTransportLeases.has(programTransportLeaseKey(lease))) return false

    return this.send(client.socket, {
      protocol: OBS_WORKSPACE_PROTOCOL_VERSION,
      type: 'program.transport.retiring',
      transportVersion: OBS_PROGRAM_TRANSPORT_VERSION,
      subscriptionId,
      transportId: lease.transportId,
      generation: lease.generation,
      reason,
      sentAt: new Date().toISOString()
    })
  }

  private handleConnection(socket: Socket): void {
    if (this.clients.size >= MAX_CLIENTS) {
      socket.end()
      return
    }

    socket.setEncoding('utf8')
    socket.setNoDelay(true)
    const client: BridgeClient = {
      socket,
      buffer: '',
      authenticated: false,
      clientVersion: null,
      obsVersion: null,
      clientPid: null,
      capabilities: [],
      negotiatedCapabilities: [],
      programSubscription: null,
      programTransportLeases: new Map(),
      latestProgramGeneration: null,
      handshakeTimer: null
    }
    client.handshakeTimer = setTimeout(() => client.socket.destroy(), HANDSHAKE_TIMEOUT_MS)
    client.handshakeTimer.unref?.()
    this.clients.add(client)

    socket.on('data', (chunk: string) => this.handleData(client, chunk))
    socket.on('error', (error) => {
      this.status.lastError = error.message
      this.emitStatus()
    })
    socket.on('close', () => {
      this.clearHandshakeTimer(client)
      const subscriptionId = client.programSubscription?.subscriptionId
      const leases = [...client.programTransportLeases.values()]
      const lease = leases.at(-1)
      client.programSubscription = null
      client.programTransportLeases.clear()
      client.latestProgramGeneration = null
      this.clients.delete(client)
      this.updateProgramConsumers()
      if (subscriptionId) {
        this.emit('programTransportRelease', {
          subscriptionId,
          transportVersion: OBS_PROGRAM_TRANSPORT_VERSION,
          transportId: lease?.transportId ?? null,
          generation: lease?.generation ?? '0',
          reason: 'bridge-disconnected'
        } satisfies OBSProgramTransportRelease)
      }
      this.updateConnectedStatus()
    })
  }

  private handleData(client: BridgeClient, chunk: string): void {
    client.buffer += chunk
    if (Buffer.byteLength(client.buffer, 'utf8') > MAX_FRAME_BYTES) {
      this.status.lastError = 'Native bridge frame exceeded the size limit.'
      this.emitStatus()
      client.socket.destroy()
      return
    }

    let newline = client.buffer.indexOf('\n')
    while (newline >= 0) {
      const frame = client.buffer.slice(0, newline).trim()
      client.buffer = client.buffer.slice(newline + 1)
      if (frame) this.handleFrame(client, frame)
      newline = client.buffer.indexOf('\n')
    }
  }

  private handleFrame(client: BridgeClient, frame: string): void {
    let message: Record<string, unknown>
    try {
      const parsed = JSON.parse(frame)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
      message = parsed as Record<string, unknown>
    } catch {
      this.status.lastError = 'Native bridge received malformed JSON.'
      this.emitStatus()
      return
    }

    if (!client.authenticated) {
      const authenticated = this.matchesCredential(message.authToken)
      if (message.type !== 'hello' || !authenticated) {
        this.status.lastError = 'Native bridge authentication failed.'
        this.emitStatus()
        client.socket.end()
        return
      }

      if (message.protocol !== OBS_WORKSPACE_PROTOCOL_VERSION) {
        this.send(client.socket, {
          protocol: OBS_WORKSPACE_PROTOCOL_VERSION,
          type: 'hello.ack',
          compatible: false,
          error: `Unsupported protocol ${String(message.protocol)}`
        })
        client.socket.end()
        return
      }

      this.acceptHello(client, message)
      return
    }

    if (message.protocol !== OBS_WORKSPACE_PROTOCOL_VERSION) {
      client.socket.end()
      return
    }

    this.status.lastSeenAt = new Date().toISOString()
    this.status.lastError = null

    switch (message.type) {
      case 'ping':
        this.send(client.socket, {
          protocol: OBS_WORKSPACE_PROTOCOL_VERSION,
          type: 'pong',
          at: this.status.lastSeenAt
        })
        break
      case 'obs.frontendEvent':
        this.emit('frontendEvent', message)
        break
      case 'obs.snapshot':
        this.emit('obsSnapshot', message.payload)
        break
      case 'command.request':
        void this.handleCommand(client, message)
        break
      case 'program.subscribe':
        this.handleProgramSubscribe(client, message)
        break
      case 'program.transport.release':
        this.handleProgramTransportRelease(client, message)
        break
      case 'program.transport.stats':
        this.handleProgramTransportStats(client, message)
        break
      default:
        break
    }

    this.emitStatus()
  }

  private acceptHello(client: BridgeClient, message: Record<string, unknown>): void {
    client.authenticated = true
    this.clearHandshakeTimer(client)
    client.clientVersion = stringOrNull(message.clientVersion)
    client.obsVersion = stringOrNull(message.obsVersion)
    client.clientPid = positiveUint32OrNull(message.clientPid)
    client.capabilities = sanitizeCapabilities(message.capabilities)
    client.negotiatedCapabilities = OBS_NATIVE_BRIDGE_CAPABILITIES.filter((capability) =>
      client.capabilities.includes(capability) && client.clientPid !== null
    )

    this.status.lastSeenAt = new Date().toISOString()
    this.status.lastError = null
    this.updateConnectedStatus()
    this.send(client.socket, {
      protocol: OBS_WORKSPACE_PROTOCOL_VERSION,
      type: 'hello.ack',
      compatible: true,
      server: 'ilyStream',
      serverVersion: this.options.appVersion,
      capabilities: [...OBS_NATIVE_BRIDGE_CAPABILITIES],
      negotiatedCapabilities: [...client.negotiatedCapabilities],
      payload: {
        appVersion: this.options.appVersion,
        protocol: OBS_WORKSPACE_PROTOCOL_VERSION,
        capabilities: [...OBS_NATIVE_BRIDGE_CAPABILITIES],
        negotiatedCapabilities: [...client.negotiatedCapabilities]
      }
    })
    void this.options.getSnapshot()
      .then((snapshot) => this.send(client.socket, {
        protocol: OBS_WORKSPACE_PROTOCOL_VERSION,
        type: 'ilystream.snapshot',
        payload: snapshot
      }))
      .catch((error) => {
        this.status.lastError = errorMessage(error)
        this.emitStatus()
      })
  }

  private async handleCommand(client: BridgeClient, message: Record<string, unknown>): Promise<void> {
    const rawRequestId = typeof message.requestId === 'string' ? message.requestId : message.id
    const id = typeof rawRequestId === 'string' ? rawRequestId.slice(0, 128) : ''
    const command = message.action ?? message.command
    if (!id || (command !== 'focus' && command !== 'openControlCenter')) {
      this.sendCommandResult(client.socket, id, false, 'Unsupported command.')
      return
    }

    try {
      if (command === 'focus') await this.options.onFocus?.()
      if (command === 'openControlCenter') await this.options.onOpenControlCenter?.()
      this.sendCommandResult(client.socket, id, true, 'Command completed.')
      this.emit('command', command satisfies NativeBridgeCommand)
    } catch (error) {
      this.sendCommandResult(client.socket, id, false, errorMessage(error))
    }
  }

  private handleProgramSubscribe(client: BridgeClient, message: Record<string, unknown>): void {
    if (!this.hasProgramTransportCapability(client) || client.clientPid === null) return
    const subscription = parseProgramSubscribe(message)
    if (!subscription || this.subscriptionOwnedByAnotherClient(client, subscription.subscriptionId)) {
      this.rejectProgramMessage()
      return
    }

    if (client.programSubscription) {
      if (sameProgramSubscription(client.programSubscription, subscription)) return
      this.rejectProgramMessage()
      return
    }

    client.programSubscription = subscription
    client.programTransportLeases.clear()
    client.latestProgramGeneration = null
    this.updateProgramConsumers()
    this.emit('programSubscribe', {
      ...subscription,
      clientPid: client.clientPid
    } satisfies OBSProgramSubscribeRequest)
  }

  private handleProgramTransportRelease(client: BridgeClient, message: Record<string, unknown>): void {
    if (!this.hasProgramTransportCapability(client)) return
    const release = parseProgramTransportRelease(message)
    if (!release || release.subscriptionId !== client.programSubscription?.subscriptionId ||
      !releaseMatchesProgramTransportLeases(release, client.programTransportLeases)) {
      this.rejectProgramMessage()
      return
    }
    if (release.transportId !== null) {
      client.programTransportLeases.delete(programTransportLeaseKey(release as OBSProgramTransportLease))
    }
    if (isFinalProgramRelease(release.reason)) {
      client.programSubscription = null
      client.programTransportLeases.clear()
      client.latestProgramGeneration = null
      this.updateProgramConsumers()
    }
    this.emit('programTransportRelease', release)
  }

  private handleProgramTransportStats(client: BridgeClient, message: Record<string, unknown>): void {
    if (!this.hasProgramTransportCapability(client)) return
    const stats = parseProgramTransportStats(message)
    if (!stats || stats.subscriptionId !== client.programSubscription?.subscriptionId) {
      this.rejectProgramMessage()
      return
    }
    if (!client.programTransportLeases.has(programTransportLeaseKey(stats))) {
      this.rejectProgramMessage()
      return
    }
    this.emit('programTransportStats', stats)
  }

  private sendCommandResult(socket: Socket, id: string, ok: boolean, message: string): void {
    this.send(socket, {
      protocol: OBS_WORKSPACE_PROTOCOL_VERSION,
      type: 'command.result',
      id,
      requestId: id,
      ok,
      message
    })
  }

  private send(socket: Socket, message: Record<string, unknown>): boolean {
    if (!socket.writable) return false
    try {
      socket.write(`${JSON.stringify(message)}\n`)
      return true
    } catch {
      return false
    }
  }

  private findProgramSubscriber(subscriptionId: string): BridgeClient | null {
    if (!UUID_PATTERN.test(subscriptionId)) return null
    return [...this.clients].find((client) =>
      client.authenticated &&
      client.programSubscription?.subscriptionId === subscriptionId &&
      this.hasProgramTransportCapability(client)
    ) ?? null
  }

  private hasProgramTransportCapability(client: BridgeClient): boolean {
    return client.negotiatedCapabilities.includes(OBS_PROGRAM_TRANSPORT_CAPABILITY)
  }

  private subscriptionOwnedByAnotherClient(client: BridgeClient, subscriptionId: string): boolean {
    return [...this.clients].some((candidate) =>
      candidate !== client && candidate.programSubscription?.subscriptionId === subscriptionId
    )
  }

  private rejectProgramMessage(): void {
    this.status.lastError = 'Native bridge rejected an invalid Program transport message.'
  }

  private updateProgramConsumers(): void {
    const programConsumers = [...this.clients].filter((client) => client.programSubscription !== null).length
    if (programConsumers === this.status.programConsumers) return
    this.status.programConsumers = programConsumers
    this.emit('programConsumersChanged', programConsumers)
    this.emitStatus()
  }

  private updateConnectedStatus(): void {
    const clients = [...this.clients].filter((client) => client.authenticated)
    const latest = clients.at(-1)
    this.status.connected = clients.length > 0
    this.status.clientVersion = latest?.clientVersion ?? null
    this.status.obsVersion = latest?.obsVersion ?? null
    this.status.capabilities = latest ? [...latest.capabilities] : []
    this.emitStatus()
  }

  private emitStatus(): void {
    this.emit('status', this.getStatus())
  }

  private matchesCredential(value: unknown): boolean {
    const candidate = Buffer.alloc(32)
    const valid = typeof value === 'string' && TOKEN_PATTERN.test(value)
    if (valid) Buffer.from(value, 'hex').copy(candidate)

    const expected = this.credentialToken ?? Buffer.alloc(32)
    const matches = timingSafeEqual(candidate, expected)
    candidate.fill(0)
    return valid && this.credentialToken !== null && matches
  }

  private clearHandshakeTimer(client: BridgeClient): void {
    if (!client.handshakeTimer) return
    clearTimeout(client.handshakeTimer)
    client.handshakeTimer = null
  }

  private clearCredentialToken(): void {
    this.credentialToken?.fill(0)
    this.credentialToken = null
  }

  private runLifecycle<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.lifecycleQueue.then(operation, operation)
    this.lifecycleQueue = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }
}

type CredentialReadResult =
  | { kind: 'valid'; token: Buffer }
  | { kind: 'missing' | 'invalid' }

async function loadOrCreateCredentialToken(path: string): Promise<Buffer> {
  const existing = await readCredentialToken(path)
  if (existing.kind === 'valid') return existing.token

  const generated = randomBytes(32)
  try {
    await writeCredentialFile(path, generated)
  } finally {
    generated.fill(0)
  }

  const persisted = await readCredentialToken(path)
  if (persisted.kind !== 'valid') {
    throw new Error('The persisted credential could not be verified.')
  }
  return persisted.token
}

async function readCredentialToken(path: string): Promise<CredentialReadResult> {
  let handle
  try {
    handle = await open(path, 'r')
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return { kind: 'missing' }
    throw error
  }

  try {
    const stats = await handle.stat()
    if (!stats.isFile() || stats.size < 1 || stats.size > MAX_CREDENTIAL_BYTES) {
      return { kind: 'invalid' }
    }

    const bytes = Buffer.alloc(Number(stats.size))
    let offset = 0
    while (offset < bytes.length) {
      const result = await handle.read(bytes, offset, bytes.length - offset, offset)
      if (!result.bytesRead) break
      offset += result.bytesRead
    }
    if (offset !== bytes.length) return { kind: 'invalid' }

    let parsed: unknown
    try {
      parsed = JSON.parse(bytes.toString('utf8'))
    } catch {
      return { kind: 'invalid' }
    } finally {
      bytes.fill(0)
    }

    if (!isCredentialFile(parsed)) return { kind: 'invalid' }
    return { kind: 'valid', token: Buffer.from(parsed.token, 'hex') }
  } finally {
    await handle.close()
  }
}

async function writeCredentialFile(path: string, token: Buffer): Promise<void> {
  const directory = dirname(path)
  await mkdir(directory, { recursive: true })
  const temporaryPath = join(directory, `.${OBS_NATIVE_BRIDGE_CREDENTIAL_FILE}.${process.pid}.${randomUUID()}.tmp`)
  const body = JSON.stringify({
    protocol: OBS_WORKSPACE_PROTOCOL_VERSION,
    token: token.toString('hex')
  })
  if (Buffer.byteLength(body, 'utf8') > MAX_CREDENTIAL_BYTES) {
    throw new Error('The bridge credential exceeded its size limit.')
  }

  try {
    await writeFile(temporaryPath, body, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    await chmod(temporaryPath, 0o600)
    try {
      await rename(temporaryPath, path)
    } catch (error) {
      if (!hasAnyErrorCode(error, ['EEXIST', 'EPERM'])) throw error
      await rm(path, { force: true })
      await rename(temporaryPath, path)
    }
    await chmod(path, 0o600)
  } finally {
    await rm(temporaryPath, { force: true })
  }
}

function isCredentialFile(value: unknown): value is { protocol: number; token: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return keys.length === 2
    && keys[0] === 'protocol'
    && keys[1] === 'token'
    && record.protocol === OBS_WORKSPACE_PROTOCOL_VERSION
    && typeof record.token === 'string'
    && TOKEN_PATTERN.test(record.token)
}

export function isProgramTransportDescriptor(value: unknown): value is OBSProgramTransportDescriptor {
  return parseProgramTransportDescriptor(value) !== null
}

function parseProgramTransportDescriptor(value: unknown): OBSProgramTransportDescriptor | null {
  const descriptor = recordOrNull(value)
  if (!descriptor || !hasExactKeys(descriptor,
    ['transportVersion', 'transportId', 'generation', 'producerPid', 'video', 'audio'])) return null
  if (descriptor.transportVersion !== OBS_PROGRAM_TRANSPORT_VERSION) return null
  if (!isCanonicalUuid(descriptor.transportId)) return null
  if (!isCanonicalUint64(descriptor.generation, false)) return null
  const producerPid = positiveUint32OrNull(descriptor.producerPid)
  if (producerPid === null) return null

  const video = parseProgramVideoDescriptor(descriptor.video)
  const audio = parseProgramAudioDescriptor(descriptor.audio)
  if (!video || !audio) return null

  return {
    transportVersion: OBS_PROGRAM_TRANSPORT_VERSION,
    transportId: descriptor.transportId,
    generation: descriptor.generation,
    producerPid,
    video,
    audio
  }
}

function parseProgramVideoDescriptor(value: unknown): OBSProgramVideoTransportDescriptor | null {
  const video = recordOrNull(value)
  if (!video || !hasExactKeys(video, [
    'adapterLuidHigh',
    'adapterLuidLow',
    'width',
    'height',
    'format',
    'colorSpace',
    'slotCount',
    'duplicatedHandles',
    'controlHandle',
    'keyedMutex',
    'producerAcquireKey',
    'consumerAcquireKey'
  ])) return null

  if (!isIntegerInRange(video.adapterLuidHigh, -0x8000_0000, 0x7fff_ffff)) return null
  if (!isIntegerInRange(video.adapterLuidLow, 0, 0xffff_ffff)) return null
  if (video.adapterLuidHigh === 0 && video.adapterLuidLow === 0) return null
  if (!isIntegerInRange(video.width, 1, MAX_VIDEO_DIMENSION)) return null
  if (!isIntegerInRange(video.height, 1, MAX_VIDEO_DIMENSION)) return null
  if (video.format !== 'rgba8' || video.colorSpace !== 'srgb' || video.slotCount !== 2) return null
  if (video.keyedMutex !== true || video.producerAcquireKey !== '0' || video.consumerAcquireKey !== '1') return null
  if (!Array.isArray(video.duplicatedHandles) || video.duplicatedHandles.length !== 2) return null
  const [firstHandle, secondHandle] = video.duplicatedHandles
  if (!isDuplicatedHandle(firstHandle) || !isDuplicatedHandle(secondHandle) || firstHandle === secondHandle) return null
  if (!isDuplicatedHandle(video.controlHandle) || video.controlHandle === firstHandle ||
    video.controlHandle === secondHandle) return null

  return {
    adapterLuidHigh: video.adapterLuidHigh,
    adapterLuidLow: video.adapterLuidLow,
    width: video.width,
    height: video.height,
    format: 'rgba8',
    colorSpace: 'srgb',
    slotCount: 2,
    duplicatedHandles: [firstHandle, secondHandle],
    controlHandle: video.controlHandle,
    keyedMutex: true,
    producerAcquireKey: '0',
    consumerAcquireKey: '1'
  }
}

function parseProgramAudioDescriptor(value: unknown): OBSProgramAudioTransportDescriptor | null {
  const audio = recordOrNull(value)
  if (!audio || !hasExactKeys(audio, [
    'sampleRate',
    'channels',
    'format',
    'ringName',
    'capacityFrames',
    'blockFrames',
    'timestampTimebase'
  ])) return null
  if (audio.sampleRate !== 48_000 || audio.channels !== 2 || audio.format !== 'f32-interleaved') return null
  if (typeof audio.ringName !== 'string' || !AUDIO_RING_PATTERN.test(audio.ringName)) return null
  if (!isIntegerInRange(audio.blockFrames, 1, MAX_AUDIO_BLOCK_FRAMES)) return null
  if (!isIntegerInRange(audio.capacityFrames, audio.blockFrames, MAX_AUDIO_CAPACITY_FRAMES)) return null
  if (audio.capacityFrames % audio.blockFrames !== 0 || audio.timestampTimebase !== 'ns') return null

  return {
    sampleRate: 48_000,
    channels: 2,
    format: 'f32-interleaved',
    ringName: audio.ringName,
    capacityFrames: audio.capacityFrames,
    blockFrames: audio.blockFrames,
    timestampTimebase: 'ns'
  }
}

function parseProgramSubscribe(message: Record<string, unknown>): OBSProgramSubscribeFrame | null {
  if (!hasExactKeys(message,
    ['protocol', 'type', 'transportVersion', 'subscriptionId'],
    ['sentAt'])) return null
  if (message.type !== 'program.subscribe' || message.transportVersion !== OBS_PROGRAM_TRANSPORT_VERSION) return null
  if (!isCanonicalUuid(message.subscriptionId) || !isOptionalSentAt(message.sentAt)) return null
  return {
    subscriptionId: message.subscriptionId,
    transportVersion: OBS_PROGRAM_TRANSPORT_VERSION
  }
}

function parseProgramTransportRelease(message: Record<string, unknown>): OBSProgramTransportRelease | null {
  if (!hasExactKeys(message,
    ['protocol', 'type', 'transportVersion', 'subscriptionId', 'transportId', 'generation', 'reason'],
    ['sentAt'])) return null
  if (message.type !== 'program.transport.release' || message.transportVersion !== OBS_PROGRAM_TRANSPORT_VERSION) return null
  if (!isCanonicalUuid(message.subscriptionId)) return null
  const releasesSubscriptionOnly = message.transportId === null && message.generation === '0'
  const releasesTransport = isCanonicalUuid(message.transportId) && isCanonicalUint64(message.generation, false)
  if (!releasesSubscriptionOnly && !releasesTransport) return null
  const transportId = releasesSubscriptionOnly ? null : message.transportId as string
  const generation = releasesSubscriptionOnly ? '0' : message.generation as string
  if (typeof message.reason !== 'string' || !REASON_PATTERN.test(message.reason)) return null
  if (!isOptionalSentAt(message.sentAt)) return null
  return {
    subscriptionId: message.subscriptionId,
    transportVersion: OBS_PROGRAM_TRANSPORT_VERSION,
    transportId,
    generation,
    reason: message.reason
  }
}

function parseProgramTransportStats(message: Record<string, unknown>): OBSProgramTransportStats | null {
  if (!hasExactKeys(message, [
    'protocol',
    'type',
    'transportVersion',
    'subscriptionId',
    'transportId',
    'generation',
    'videoFramesPresented',
    'videoFramesDropped',
    'audioFramesRead',
    'audioUnderruns',
    'lastVideoTimestampNs',
    'lastAudioTimestampNs'
  ], ['sentAt'])) return null
  if (message.type !== 'program.transport.stats' || message.transportVersion !== OBS_PROGRAM_TRANSPORT_VERSION) return null
  if (!isCanonicalUuid(message.subscriptionId) || !isCanonicalUuid(message.transportId)) return null
  if (!isCanonicalUint64(message.generation, false)) return null
  if (!isCanonicalUint64(message.videoFramesPresented, true)) return null
  if (!isCanonicalUint64(message.videoFramesDropped, true)) return null
  if (!isCanonicalUint64(message.audioFramesRead, true)) return null
  if (!isCanonicalUint64(message.audioUnderruns, true)) return null
  if (!isNullableUint64(message.lastVideoTimestampNs) || !isNullableUint64(message.lastAudioTimestampNs)) return null
  if (!isOptionalSentAt(message.sentAt)) return null

  return {
    subscriptionId: message.subscriptionId,
    transportVersion: OBS_PROGRAM_TRANSPORT_VERSION,
    transportId: message.transportId,
    generation: message.generation,
    videoFramesPresented: message.videoFramesPresented,
    videoFramesDropped: message.videoFramesDropped,
    audioFramesRead: message.audioFramesRead,
    audioUnderruns: message.audioUnderruns,
    lastVideoTimestampNs: message.lastVideoTimestampNs,
    lastAudioTimestampNs: message.lastAudioTimestampNs
  }
}

function isProgramTransportLease(value: unknown): value is OBSProgramTransportLease {
  const lease = recordOrNull(value)
  return Boolean(lease
    && isCanonicalUuid(lease.transportId)
    && isCanonicalUint64(lease.generation, false))
}

function releaseMatchesProgramTransportLeases(
  release: OBSProgramTransportRelease,
  leases: Map<string, OBSProgramTransportLease>
): boolean {
  if (release.transportId === null) return leases.size === 0 && release.generation === '0'
  return leases.has(programTransportLeaseKey({
    transportId: release.transportId,
    generation: release.generation
  }))
}

function programTransportLeaseKey(lease: OBSProgramTransportLease): string {
  return `${lease.transportId}:${lease.generation}`
}

function isFinalProgramRelease(reason: string): boolean {
  return reason === 'consumer-stopped' || reason === 'bridge-stopping'
}

function compareUint64Strings(left: string, right: string): number {
  if (left.length !== right.length) return left.length < right.length ? -1 : 1
  return left === right ? 0 : left < right ? -1 : 1
}

function sameProgramSubscription(left: OBSProgramSubscribeFrame, right: OBSProgramSubscribeFrame): boolean {
  return left.subscriptionId === right.subscriptionId && left.transportVersion === right.transportVersion
}

function sanitizeCapabilities(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const capabilities: string[] = []
  for (const candidate of value) {
    if (typeof candidate !== 'string') continue
    const normalized = candidate.trim()
    if (!CAPABILITY_PATTERN.test(normalized) || capabilities.includes(normalized)) continue
    capabilities.push(normalized)
    if (capabilities.length === 32) break
  }
  return capabilities
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function hasExactKeys(record: Record<string, unknown>, required: string[], optional: string[] = []): boolean {
  const keys = Object.keys(record)
  const allowed = new Set([...required, ...optional])
  return required.every((key) => Object.hasOwn(record, key))
    && keys.every((key) => allowed.has(key))
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum
}

function positiveUint32OrNull(value: unknown): number | null {
  return isIntegerInRange(value, 1, 0xffff_ffff) ? value : null
}

function isCanonicalUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function isCanonicalUint64(value: unknown, allowZero: boolean): value is string {
  if (typeof value !== 'string' || !UINT64_PATTERN.test(value)) return false
  if (!allowZero && value === '0') return false
  return value.length < MAX_UINT64.length || (value.length === MAX_UINT64.length && value <= MAX_UINT64)
}

function isDuplicatedHandle(value: unknown): value is string {
  return typeof value === 'string' && DUPLICATED_HANDLE_PATTERN.test(value) && value !== '0000000000000000'
}

function isNullableUint64(value: unknown): value is string | null {
  return value === null || isCanonicalUint64(value, true)
}

function isOptionalSentAt(value: unknown): boolean {
  return value === undefined || (typeof value === 'string' && ISO_TIMESTAMP_PATTERN.test(value))
}

function hasErrorCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === code)
}

function hasAnyErrorCode(error: unknown, codes: string[]): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && codes.includes(String(error.code)))
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 128) : null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
