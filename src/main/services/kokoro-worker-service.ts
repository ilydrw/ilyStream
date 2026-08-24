import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { app, utilityProcess, type UtilityProcess } from 'electron'
import type { KokoroQuality } from '../../shared/settings/types'
import {
  normalizeKokoroSynthesisRequest,
  type KokoroSynthesisRequest,
  type KokoroSynthesisResult,
  type KokoroWorkerRequest,
  type KokoroWorkerResponse
} from '../../shared/kokoro-worker'

const DEFAULT_IDLE_TIMEOUT_MS = 90_000
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000
const SPAWN_TIMEOUT_MS = 10_000

type ForkUtilityProcess = (
  modulePath: string,
  args?: string[],
  options?: Electron.ForkOptions
) => UtilityProcess

interface PendingRequest {
  resolve: (result: KokoroSynthesisResult | undefined) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

export interface KokoroWorkerStatus {
  running: boolean
  pid?: number
  quality?: KokoroQuality
  pendingRequests: number
}

export interface KokoroWorkerServiceOptions {
  workerPath?: string
  idleTimeoutMs?: number
  requestTimeoutMs?: number
  forkProcess?: ForkUtilityProcess
}

/**
 * Hosts Kokoro in a separate Electron utility process so ONNX model memory can
 * be returned to Windows after an idle period instead of remaining in the UI
 * renderer for the lifetime of the app.
 */
export class KokoroWorkerService {
  private readonly workerPath: string
  private readonly idleTimeoutMs: number
  private readonly requestTimeoutMs: number
  private readonly forkProcess: ForkUtilityProcess
  private readonly pending = new Map<string, PendingRequest>()

  private child: UtilityProcess | null = null
  private quality: KokoroQuality | null = null
  private spawnPromise: Promise<void> | null = null
  private rejectSpawn: ((error: Error) => void) | null = null
  private spawnTimeout: ReturnType<typeof setTimeout> | null = null
  private idleTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options: KokoroWorkerServiceOptions = {}) {
    this.workerPath = options.workerPath ?? join(__dirname, 'kokoroWorker.js')
    this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    this.forkProcess = options.forkProcess
      ?? ((modulePath, args, forkOptions) =>
        utilityProcess.fork(modulePath, args, forkOptions))
  }

  preload(quality: KokoroQuality): Promise<void> {
    return this.send({ id: randomUUID(), type: 'preload', quality }).then(() => undefined)
  }

  generate(
    request: KokoroSynthesisRequest,
    quality: KokoroQuality
  ): Promise<KokoroSynthesisResult> {
    const payload = normalizeKokoroSynthesisRequest(request)
    return this.send({
      id: randomUUID(),
      type: 'generate',
      quality,
      payload
    }).then((result) => {
      if (!result) throw new Error('Kokoro worker returned no audio')
      return result
    })
  }

  getStatus(): KokoroWorkerStatus {
    return {
      running: this.child !== null,
      pid: this.child?.pid,
      quality: this.quality ?? undefined,
      pendingRequests: this.pending.size
    }
  }

  dispose(): void {
    this.stopProcess(new Error('Kokoro worker disposed'))
  }

  private async send(
    request: KokoroWorkerRequest
  ): Promise<KokoroSynthesisResult | undefined> {
    this.clearIdleTimer()
    await this.ensureProcess(request.quality)

    const child = this.child
    if (!child) throw new Error('Kokoro worker is unavailable')

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(request.id)
        reject(new Error('Kokoro worker request timed out'))
        this.stopProcess(new Error('Kokoro worker timed out'))
      }, this.requestTimeoutMs)

      this.pending.set(request.id, { resolve, reject, timeout })

      try {
        child.postMessage(request)
      } catch (error) {
        clearTimeout(timeout)
        this.pending.delete(request.id)
        reject(error instanceof Error ? error : new Error(String(error)))
        this.scheduleIdleStop()
      }
    })
  }

  private ensureProcess(quality: KokoroQuality): Promise<void> {
    if (this.child && this.quality === quality) {
      return this.spawnPromise ?? Promise.resolve()
    }

    if (this.child) {
      this.stopProcess(new Error('Kokoro quality changed'))
    }

    // Point the transformers.js model cache at userData. Its default is
    // node_modules/@huggingface/transformers/.cache — polluted in dev and
    // read-only inside the packaged asar (which also excludes the .cache dir),
    // so without this the packaged worker could never persist the model.
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === 'string') env[key] = value
    }
    env.ILY_KOKORO_CACHE_DIR = safeUserDataPath('models', 'kokoro')

    const child = this.forkProcess(this.workerPath, [], {
      serviceName: 'ilyStream Kokoro TTS',
      stdio: 'pipe',
      env
    })
    this.child = child
    this.quality = quality

    this.spawnPromise = new Promise<void>((resolve, reject) => {
      this.rejectSpawn = reject
      this.spawnTimeout = setTimeout(() => {
        reject(new Error('Kokoro worker failed to start'))
        this.stopProcess(new Error('Kokoro worker spawn timed out'))
      }, SPAWN_TIMEOUT_MS)

      child.once('spawn', () => {
        this.clearSpawnTimeout()
        this.rejectSpawn = null
        resolve()
      })
    })

    child.on('message', (message) => this.handleMessage(child, message))
    child.on('error', (type, location) => {
      this.handleProcessFailure(
        child,
        new Error(`Kokoro worker ${type}${location ? ` at ${location}` : ''}`)
      )
    })
    child.on('exit', (code) => {
      this.handleProcessFailure(child, new Error(`Kokoro worker exited with code ${code}`))
    })
    child.stdout?.on('data', (chunk) => {
      console.info(`[kokoro-worker] ${String(chunk).trimEnd()}`)
    })
    child.stderr?.on('data', (chunk) => {
      console.warn(`[kokoro-worker] ${String(chunk).trimEnd()}`)
    })

    return this.spawnPromise
  }

  private handleMessage(child: UtilityProcess, message: unknown): void {
    if (child !== this.child || !isWorkerResponse(message)) return

    const pending = this.pending.get(message.id)
    if (!pending) return

    clearTimeout(pending.timeout)
    this.pending.delete(message.id)

    if (message.ok) {
      pending.resolve(message.result)
    } else {
      pending.reject(new Error(message.error))
    }

    this.scheduleIdleStop()
  }

  private handleProcessFailure(child: UtilityProcess, error: Error): void {
    if (child !== this.child) return
    this.stopProcess(error)
  }

  private stopProcess(error: Error): void {
    this.clearIdleTimer()
    this.clearSpawnTimeout()
    this.rejectSpawn?.(error)
    this.rejectSpawn = null
    this.spawnPromise = null

    const child = this.child
    this.child = null
    this.quality = null

    for (const request of this.pending.values()) {
      clearTimeout(request.timeout)
      request.reject(error)
    }
    this.pending.clear()

    if (child) {
      try {
        child.kill()
      } catch (killError) {
        console.warn('[kokoro-worker] Failed to stop utility process:', killError)
      }
    }
  }

  private scheduleIdleStop(): void {
    if (this.pending.size > 0 || !this.child) return
    this.clearIdleTimer()
    this.idleTimer = setTimeout(() => {
      if (this.pending.size === 0) {
        this.stopProcess(new Error('Kokoro worker idle timeout'))
      }
    }, this.idleTimeoutMs)
  }

  private clearIdleTimer(): void {
    if (!this.idleTimer) return
    clearTimeout(this.idleTimer)
    this.idleTimer = null
  }

  private clearSpawnTimeout(): void {
    if (!this.spawnTimeout) return
    clearTimeout(this.spawnTimeout)
    this.spawnTimeout = null
  }
}

function safeUserDataPath(...segments: string[]): string {
  // Guard app.getPath so unit tests can construct the service without a full
  // Electron app environment (the fork is always injected in tests anyway).
  try {
    return join(app.getPath('userData'), ...segments)
  } catch {
    return join('.', ...segments)
  }
}

function isWorkerResponse(value: unknown): value is KokoroWorkerResponse {
  if (!value || typeof value !== 'object') return false
  const response = value as Record<string, unknown>
  return typeof response.id === 'string'
    && typeof response.ok === 'boolean'
    && (response.ok || typeof response.error === 'string')
}
