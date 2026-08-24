export type SoundPlaybackRunner<T> = (item: T, signal: AbortSignal) => Promise<void>

/**
 * Runs queued sound requests one at a time while allowing explicitly immediate
 * requests to bypass the FIFO. The runner must settle only after the current
 * clip ends (or its abort signal is handled).
 */
export class SoundPlaybackQueue<T> {
  private pending: T[] = []
  private activeController: AbortController | null = null
  private immediateControllers = new Set<AbortController>()
  private processing = false
  private disposed = false

  constructor(
    private readonly runner: SoundPlaybackRunner<T>,
    private readonly onError?: (error: unknown, item: T) => void
  ) {}

  enqueue(item: T): void {
    if (this.disposed) return
    this.pending.push(item)
    void this.drain()
  }

  playImmediately(item: T): void {
    if (this.disposed) return

    const controller = new AbortController()
    this.immediateControllers.add(controller)
    void this.run(item, controller).finally(() => {
      this.immediateControllers.delete(controller)
    })
  }

  clear(): void {
    this.pending.length = 0
    this.activeController?.abort()
    for (const controller of this.immediateControllers) controller.abort()
    this.immediateControllers.clear()
  }

  dispose(): void {
    this.disposed = true
    this.clear()
  }

  private async drain(): Promise<void> {
    if (this.processing || this.disposed) return
    this.processing = true

    try {
      while (!this.disposed && this.pending.length > 0) {
        const item = this.pending.shift()!
        const controller = new AbortController()
        this.activeController = controller

        try {
          await this.run(item, controller)
        } finally {
          if (this.activeController === controller) this.activeController = null
        }
      }
    } finally {
      this.processing = false
    }
  }

  private async run(item: T, controller: AbortController): Promise<void> {
    try {
      await this.runner(item, controller.signal)
    } catch (error) {
      if (!controller.signal.aborted) this.onError?.(error, item)
    }
  }
}
