import { randomBytes } from 'crypto'
import { existsSync } from 'fs'
import { createConnection, type Socket } from 'net'
import { join } from 'path'
import { spawn, type ChildProcess } from 'child_process'
import { app } from 'electron'
import type { CaptureOptions, SharedCaptureTransport } from '../audio/native-audio-capture'
import {
  parseNativeMixerShadowResult,
  type NativeMixerHostRequest,
  type NativeMixerShadowResult
} from '../../shared/native-mixer-shadow'

const PROTOCOL_VERSION = 4
const MAX_MESSAGE_BYTES = 64 * 1024
const START_TIMEOUT_MS = 5_000

interface RpcResponse {
  id: number | null
  ok: boolean
  result?: unknown
  error?: string
}

interface PendingRequest {
  resolve(value: unknown): void
  reject(error: Error): void
  timer?: ReturnType<typeof setTimeout>
}

/** Newline-delimited request correlation shared by the host lifecycle and tests. */
export class JsonLineRpcClient {
  private nextId = 1
  private pending = new Map<number, PendingRequest>()
  private buffered = ''
  private closed = false

  constructor(private socket: Pick<Socket, 'on' | 'write' | 'destroy'>) {
    socket.on('data', (chunk: Buffer | string) => this.onData(chunk))
    socket.on('close', () => this.close(new Error('Native core host connection closed')))
    socket.on('error', (error: Error) => this.close(error))
  }

  request(method: string, params: unknown = {}, metadata: Record<string, unknown> = {}, timeoutMs?: number): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('Native core host connection is closed'))
    const id = this.nextId++
    const payload = JSON.stringify({ id, method, params, ...metadata })
    if (Buffer.byteLength(payload) > MAX_MESSAGE_BYTES) {
      return Promise.reject(new Error('Native core host request is too large'))
    }
    return new Promise((resolve, reject) => {
      const pending: PendingRequest = { resolve, reject }
      if (timeoutMs !== undefined) {
        pending.timer = setTimeout(() => {
          this.pending.delete(id)
          reject(new Error('Native core host request timed out'))
        }, timeoutMs)
      }
      this.pending.set(id, pending)
      this.socket.write(`${payload}\n`, (error?: Error | null) => {
        if (!error) return
        clearTimeout(pending.timer)
        this.pending.delete(id)
        reject(error)
      })
    })
  }

  destroy(): void {
    this.socket.destroy()
    this.close(new Error('Native core host connection stopped'))
  }

  private onData(chunk: Buffer | string): void {
    this.buffered += chunk.toString()
    let newline = this.buffered.indexOf('\n')
    while (newline >= 0) {
      const line = this.buffered.slice(0, newline).replace(/\r$/, '')
      this.buffered = this.buffered.slice(newline + 1)
      if (Buffer.byteLength(line) > MAX_MESSAGE_BYTES) {
        this.destroy()
        return
      }
      if (line) this.onLine(line)
      newline = this.buffered.indexOf('\n')
    }
    if (Buffer.byteLength(this.buffered) > MAX_MESSAGE_BYTES) this.destroy()
  }

  private onLine(line: string): void {
    let response: RpcResponse
    try {
      response = JSON.parse(line) as RpcResponse
    } catch {
      this.destroy()
      return
    }
    if (!Number.isSafeInteger(response.id)) return
    const pending = this.pending.get(response.id!)
    if (!pending) return
    this.pending.delete(response.id!)
    clearTimeout(pending.timer)
    if (response.ok) pending.resolve(response.result)
    else pending.reject(new Error(response.error || 'Native core host request failed'))
  }

  private close(error: Error): void {
    if (this.closed) return
    this.closed = true
    for (const request of this.pending.values()) {
      clearTimeout(request.timer)
      request.reject(error)
    }
    this.pending.clear()
  }
}

export interface NativeCoreHostHealth {
  pid: number
  engineInitialized: boolean
}

export interface NativeMixerTransportSourceDescriptor {
  id: string
  ringName: string
  generation: string
  gain: number
  pan: number
  mono: boolean
}

export interface NativeMasterDspConfig {
  headroom?: number
  thresholdDb?: number
  kneeDb?: number
  ratio?: number
  attackSeconds?: number
  releaseSeconds?: number
  sampleRate?: 48_000
}

export interface NativeMixerProgramTransport {
  transport: 'shared-memory-v1'
  format: 'f32-interleaved'
  ringName: string
  generation: bigint
  sampleRate: 48_000
  channels: 2
  capacityFrames: number
  blockFrames: number
  sourceCount: number
}

export interface NativeMixerTransportStatus {
  running: boolean
  blocksMixed: number
  framesMixed: number
  sourceUnderruns: number
  sourceFramesSkipped: number
}

export class NativeCoreHostClient {
  private constructor(
    private process: ChildProcess,
    private rpc: JsonLineRpcClient,
    readonly executablePath: string
  ) {}

  static async start(executablePath = resolveNativeCoreHostPath()): Promise<NativeCoreHostClient> {
    if (process.platform !== 'win32') throw new Error('Native core host is currently Windows-only')
    if (!existsSync(executablePath)) throw new Error(`Native core host was not found: ${executablePath}`)

    const suffix = `ilyStream.Core.${process.pid}.${randomBytes(12).toString('hex')}`
    const capability = randomBytes(32).toString('base64url')
    const child = spawn(executablePath, [], {
      env: {
        ...process.env,
        ILYSTREAM_CORE_PIPE: suffix,
        ILYSTREAM_CORE_CAPABILITY: capability
      },
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true
    })
    child.stderr?.on('data', (chunk) => {
      const message = chunk.toString().trim()
      if (message) console.warn(`[native-core] ${message}`)
    })

    try {
      const socket = await connectToPipe(`\\\\.\\pipe\\${suffix}`, child)
      const rpc = new JsonLineRpcClient(socket)
      await rpc.request('hello', {}, { protocol: PROTOCOL_VERSION, capability })
      return new NativeCoreHostClient(child, rpc, executablePath)
    } catch (error) {
      child.kill()
      throw error
    }
  }

  health(): Promise<NativeCoreHostHealth> {
    return this.rpc.request('health', {}, {}, 2_000) as Promise<NativeCoreHostHealth>
  }

  initializeEngine(): Promise<{ initialized: boolean }> {
    return this.rpc.request('engine.initialize') as Promise<{ initialized: boolean }>
  }

  listAudioDevices(): Promise<Array<{ id: string; name: string; isDefault: boolean }>> {
    return this.rpc.request('audio.listDevices') as Promise<Array<{ id: string; name: string; isDefault: boolean }>>
  }

  audioStatus(): Promise<Record<string, unknown>> {
    return this.rpc.request('audio.status') as Promise<Record<string, unknown>>
  }

  async startAudioCapture(options: CaptureOptions): Promise<SharedCaptureTransport> {
    return parseSharedCaptureTransport(await this.rpc.request('audio.startCapture', options))
  }

  stopAudioCapture(): Promise<{ framesCaptured: number; framesDropped: number }> {
    return this.rpc.request('audio.stopCapture') as Promise<{
      framesCaptured: number
      framesDropped: number
    }>
  }

  async evaluateMixer(request: NativeMixerHostRequest): Promise<NativeMixerShadowResult> {
    const result = parseNativeMixerShadowResult(await this.rpc.request('mixer.evaluate', request))
    if (!result) throw new Error('Native core host returned an invalid mixer result')
    return result
  }

  async startMixerTransport(
    sources: NativeMixerTransportSourceDescriptor[],
    masterDsp?: NativeMasterDspConfig
  ): Promise<NativeMixerProgramTransport> {
    return parseNativeMixerProgramTransport(await this.rpc.request('mixer.startTransport', {
      sources,
      ...(masterDsp ? { masterDsp } : {})
    }))
  }

  async mixerTransportStatus(): Promise<NativeMixerTransportStatus> {
    return parseNativeMixerTransportStatus(await this.rpc.request('mixer.transportStatus', {}, {}, 2_000))
  }

  stopMixerTransport(): Promise<NativeMixerTransportStatus> {
    return this.rpc.request('mixer.stopTransport') as Promise<NativeMixerTransportStatus>
  }

  async stop(): Promise<void> {
    try {
      await this.rpc.request('shutdown')
    } catch {}
    this.rpc.destroy()
    await waitForExit(this.process, 2_000)
    if (this.process.exitCode === null) this.process.kill()
  }
}

export function parseNativeMixerTransportStatus(value: unknown): NativeMixerTransportStatus {
  if (!value || typeof value !== 'object') throw new Error('Invalid native mixer transport status')
  const status = value as Record<string, unknown>
  const counters = ['blocksMixed', 'framesMixed', 'sourceUnderruns', 'sourceFramesSkipped'] as const
  if (typeof status.running !== 'boolean' || counters.some(key =>
    !Number.isSafeInteger(status[key]) || (status[key] as number) < 0
  )) throw new Error('Invalid native mixer transport status')
  return {
    running: status.running,
    blocksMixed: status.blocksMixed as number,
    framesMixed: status.framesMixed as number,
    sourceUnderruns: status.sourceUnderruns as number,
    sourceFramesSkipped: status.sourceFramesSkipped as number
  }
}

export function parseSharedCaptureTransport(value: unknown): SharedCaptureTransport {
  if (!value || typeof value !== 'object') throw new Error('Native core host returned an invalid audio transport')
  const result = value as Record<string, unknown>
  const generationText = result.generation
  const numericFields = ['sampleRate', 'channels', 'chunkFrames', 'capacityFrames', 'blockFrames'] as const
  if (
    result.transport !== 'shared-memory-v1' ||
    result.format !== 'f32-interleaved' ||
    typeof result.ringName !== 'string' ||
    !/^Local\\ilyStream\.Capture\.Audio\.[A-Fa-f0-9]{32}$/.test(result.ringName) ||
    typeof generationText !== 'string' ||
    !/^[1-9][0-9]{0,19}$/.test(generationText) ||
    typeof result.exclusive !== 'boolean' ||
    numericFields.some((field) => !Number.isSafeInteger(result[field]))
  ) {
    throw new Error('Native core host returned an invalid audio transport')
  }
  const generation = BigInt(generationText)
  const sampleRate = result.sampleRate as number
  const channels = result.channels as number
  const chunkFrames = result.chunkFrames as number
  const capacityFrames = result.capacityFrames as number
  const blockFrames = result.blockFrames as number
  if (
    generation > 0xffff_ffff_ffff_ffffn || sampleRate < 8000 || sampleRate > 384000 ||
    channels < 1 || channels > 8 || chunkFrames < 1 || chunkFrames > blockFrames ||
    blockFrames < 1 || blockFrames > 4096 || capacityFrames < blockFrames ||
    capacityFrames > 480000 || capacityFrames % blockFrames !== 0
  ) {
    throw new Error('Native core host returned an invalid audio transport')
  }
  return {
    transport: 'shared-memory-v1',
    format: 'f32-interleaved',
    ringName: result.ringName,
    generation,
    sampleRate,
    channels,
    chunkFrames,
    capacityFrames,
    blockFrames,
    exclusive: result.exclusive
  }
}

export function parseNativeMixerProgramTransport(value: unknown): NativeMixerProgramTransport {
  if (!value || typeof value !== 'object') throw new Error('Native core host returned an invalid mixer transport')
  const result = value as Record<string, unknown>
  if (
    result.transport !== 'shared-memory-v1' || result.format !== 'f32-interleaved' ||
    typeof result.ringName !== 'string' ||
    !/^Local\\ilyStream\.Program\.Audio\.NativeMixer\.[A-Fa-f0-9]{32}$/.test(result.ringName) ||
    typeof result.generation !== 'string' || !/^[1-9][0-9]{0,19}$/.test(result.generation) ||
    result.sampleRate !== 48_000 || result.channels !== 2 ||
    !Number.isSafeInteger(result.capacityFrames) || !Number.isSafeInteger(result.blockFrames) ||
    !Number.isSafeInteger(result.sourceCount)
  ) throw new Error('Native core host returned an invalid mixer transport')
  const generation = BigInt(result.generation)
  if (
    generation > 0xffff_ffff_ffff_ffffn || result.blockFrames !== 1024 ||
    result.capacityFrames !== 96256 || (result.sourceCount as number) < 1 ||
    (result.sourceCount as number) > 64
  ) throw new Error('Native core host returned an invalid mixer transport')
  return {
    transport: 'shared-memory-v1',
    format: 'f32-interleaved',
    ringName: result.ringName,
    generation,
    sampleRate: 48_000,
    channels: 2,
    capacityFrames: result.capacityFrames as number,
    blockFrames: 1024,
    sourceCount: result.sourceCount as number
  }
}

export function resolveNativeCoreHostPath(): string {
  const override = process.env.ILYSTREAM_CORE_HOST_PATH
  const appPath = app.getAppPath()
  const candidates = [
    ...(override ? [override] : []),
    join(process.resourcesPath ?? '', 'native-engine', 'ilystream_core_host.exe'),
    join(appPath, 'native', 'engine', 'build', 'Release', 'ilystream_core_host.exe'),
    join(process.cwd(), 'native', 'engine', 'build', 'Release', 'ilystream_core_host.exe')
  ]
  return candidates.find((candidate) => existsSync(candidate)) || candidates[0]
}

async function connectToPipe(pipePath: string, child: ChildProcess): Promise<Socket> {
  const deadline = Date.now() + START_TIMEOUT_MS
  let lastError: Error = new Error('Native core host did not create its control pipe')
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Native core host exited with code ${child.exitCode}`)
    try {
      return await new Promise<Socket>((resolve, reject) => {
        const socket = createConnection(pipePath)
        socket.once('connect', () => resolve(socket))
        socket.once('error', reject)
      })
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
  throw lastError
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}
