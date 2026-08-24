import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { app, utilityProcess, type UtilityProcess } from 'electron'
import {
  normalizeSegmentationFrame,
  type SegmentationFrame,
  type SegmentationMask,
  type SegmentationWorkerRequest,
  type SegmentationWorkerResponse
} from '../../shared/segmentation-worker'

const DEFAULT_IDLE_TIMEOUT_MS = 30_000
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000
const SPAWN_TIMEOUT_MS = 15_000

type ForkUtilityProcess = (
  modulePath: string,
  args?: string[],
  options?: Electron.ForkOptions
) => UtilityProcess

interface PendingRequest {
  resolve: (result: SegmentationMask | undefined) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

export interface SegmentationWorkerStatus {
  running: boolean
  pid?: number
  pendingRequests: number
}

export interface SegmentationWorkerServiceOptions {
  workerPath?: string
  /** Directory the worker caches/downloads the ONNX model into. */
  modelCacheDir?: string
  /** Explicit model file path; overrides the cache/download resolution. */
  modelPath?: string
  idleTimeoutMs?: number
  requestTimeoutMs?: number
  forkProcess?: ForkUtilityProcess
}

/**
 * Hosts the ONNX portrait-segmentation model in a separate Electron utility
 * process so its DirectML/ONNX memory can be returned to Windows after an idle
 * period, instead of living in the renderer's GPU process for the lifetime of
 * the app the way the old MediaPipe WASM model did.
 *
 * Mirrors {@link KokoroWorkerService}: lazy spawn on first request, idle
 * shutdown, per-request timeouts, and a hard restart on any worker failure.
 */
export class SegmentationWorkerService {
  private readonly workerPath: string
  private readonly modelCacheDir: string
  private readonly modelPath: string | undefined
  private readonly idleTimeoutMs: number
  private readonly requestTimeoutMs: number
  private readonly forkProcess: ForkUtilityProcess
  private readonly pending = new Map<string, PendingRequest>()

  private child: UtilityProcess | null = null
  private spawnPromise: Promise<void> | null = null
  private rejectSpawn: ((error: Error) => void) | null = null
  private spawnTimeout: ReturnType<typeof setTimeout> | null = null
  private idleTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options: SegmentationWorkerServiceOptions = {}) {
    this.workerPath = options.workerPath ?? join(__dirname, 'segmentationWorker.js')
    this.modelCacheDir =
      options.modelCacheDir
      ?? safeUserDataPath('models', 'segmentation')
    this.modelPath = options.modelPath
    this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    this.forkProcess = options.forkProcess
      ?? ((modulePath, args, forkOptions) =>
        utilityProcess.fork(modulePath, args, forkOptions))
  }

  preload(): Promise<void> {
    return this.send({ id: randomUUID(), type: 'preload' }).then(() => undefined)
  }

  segment(frame: SegmentationFrame): Promise<SegmentationMask> {
    const payload = normalizeSegmentationFrame(frame)
    return this.send({ id: randomUUID(), type: 'segment', payload }).then((result) => {
      if (!result) throw new Error('Segmentation worker returned no mask')
      return result
    })
  }

  getStatus(): SegmentationWorkerStatus {
    return {
      running: this.child !== null,
      pid: this.child?.pid,
      pendingRequests: this.pending.size
    }
  }

  dispose(): void {
    this.stopProcess(new Error('Segmentation worker disposed'))
  }

  private async send(
    request: SegmentationWorkerRequest
  ): Promise<SegmentationMask | undefined> {
    this.clearIdleTimer()
    await this.ensureProcess()

    const child = this.child
    if (!child) throw new Error('Segmentation worker is unavailable')

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(request.id)
        reject(new Error('Segmentation worker request timed out'))
        this.stopProcess(new Error('Segmentation worker timed out'))
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

  private ensureProcess(): Promise<void> {
    if (this.child) {
      return this.spawnPromise ?? Promise.resolve()
    }

    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === 'string') env[key] = value
    }
    env.ILY_SEGMENTATION_MODEL_DIR = this.modelCacheDir
    if (this.modelPath) env.ILY_SEGMENTATION_MODEL_PATH = this.modelPath

    const child = this.forkProcess(this.workerPath, [], {
      serviceName: 'ilyStream Segmentation',
      stdio: 'pipe',
      env
    })
    this.child = child

    this.spawnPromise = new Promise<void>((resolve, reject) => {
      this.rejectSpawn = reject
      this.spawnTimeout = setTimeout(() => {
        reject(new Error('Segmentation worker failed to start'))
        this.stopProcess(new Error('Segmentation worker spawn timed out'))
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
        new Error(`Segmentation worker ${type}${location ? ` at ${location}` : ''}`)
      )
    })
    child.on('exit', (code) => {
      this.handleProcessFailure(child, new Error(`Segmentation worker exited with code ${code}`))
    })
    child.stdout?.on('data', (chunk) => {
      console.info(`[segmentation-worker] ${String(chunk).trimEnd()}`)
    })
    child.stderr?.on('data', (chunk) => {
      console.warn(`[segmentation-worker] ${String(chunk).trimEnd()}`)
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

    for (const request of this.pending.values()) {
      clearTimeout(request.timeout)
      request.reject(error)
    }
    this.pending.clear()

    if (child) {
      try {
        child.kill()
      } catch (killError) {
        console.warn('[segmentation-worker] Failed to stop utility process:', killError)
      }
    }
  }

  private scheduleIdleStop(): void {
    if (this.pending.size > 0 || !this.child) return
    this.clearIdleTimer()
    this.idleTimer = setTimeout(() => {
      if (this.pending.size === 0) {
        this.stopProcess(new Error('Segmentation worker idle timeout'))
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

function isWorkerResponse(value: unknown): value is SegmentationWorkerResponse {
  if (!value || typeof value !== 'object') return false
  const response = value as Record<string, unknown>
  return typeof response.id === 'string'
    && typeof response.ok === 'boolean'
    && (response.ok || typeof response.error === 'string')
}
