import { EventEmitter } from 'events'

export interface PumperStats {
  fps: number
  droppedVideoChunks: number
  droppedAudioChunks: number
}

export class MediaPumper extends EventEmitter {
  private videoPumpTimer: ReturnType<typeof setInterval> | null = null
  private silentClockInterval: ReturnType<typeof setInterval> | null = null
  private watchdogInterval: ReturnType<typeof setInterval> | null = null
  
  private latestVideoFrame: Uint8Array | null = null
  private videoPumpBusy = false
  private framesSinceLastReport = 0
  private totalSamples = 0
  private lastClockReportedAt = 0

  constructor() {
    super()
  }

  startVideoPump(fps: number, onPump: (frame: Uint8Array) => void): void {
    const interval = 1000 / Math.max(1, Math.min(60, Math.round(fps || 30)))
    this.stopVideoPump()
    this.videoPumpTimer = setInterval(() => {
      if (this.videoPumpBusy) return
      const frame = this.latestVideoFrame
      if (!frame) return
      
      this.latestVideoFrame = null
      this.videoPumpBusy = true
      try {
        onPump(frame)
      } finally {
        this.videoPumpBusy = false
      }
    }, interval)
  }

  stopVideoPump(): void {
    if (this.videoPumpTimer) {
      clearInterval(this.videoPumpTimer)
      this.videoPumpTimer = null
    }
  }

  setLatestFrame(data: Uint8Array): void {
    this.latestVideoFrame = data
    this.framesSinceLastReport++
  }

  startSilentClock(onClock: (samples: number) => void): void {
    this.stopSilentClock()
    const startedAt = performance.now()
    this.silentClockInterval = setInterval(() => {
      this.totalSamples = Math.floor((performance.now() - startedAt) * 48)
      if (Date.now() - this.lastClockReportedAt > 30) {
        this.lastClockReportedAt = Date.now()
        onClock(this.totalSamples)
      }
    }, 1000 / 60)
  }

  stopSilentClock(): void {
    if (this.silentClockInterval) {
      clearInterval(this.silentClockInterval)
      this.silentClockInterval = null
    }
  }

  startWatchdog(name: string, getStats: () => string): void {
    this.stopWatchdog()
    this.watchdogInterval = setInterval(() => {
      const fps = this.framesSinceLastReport / 5
      const extra = getStats()
      console.log(`[Streaming] ${name} health — ${fps.toFixed(1)} fps received${extra ? ` — ${extra}` : ''}`)
      this.framesSinceLastReport = 0
    }, 5000)
  }

  stopWatchdog(): void {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval)
      this.watchdogInterval = null
    }
  }

  resetSamples() {
    this.totalSamples = 0
  }

  getSamples() {
    return this.totalSamples
  }

  incrementSamples(count: number) {
    this.totalSamples += count
    const now = Date.now()
    if (now - this.lastClockReportedAt > 20) {
      this.lastClockReportedAt = now
      this.emit('clock', this.totalSamples)
    }
  }
}
