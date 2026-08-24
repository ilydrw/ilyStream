import { app, webContents } from 'electron'
import { appendFile, rename, stat } from 'fs/promises'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'

/**
 * Periodic per-process memory snapshots, appended as JSONL to
 * `<userData>/logs/memory-telemetry.jsonl`.
 *
 * Task Manager only shows one aggregate number for the app, but ilyStream is
 * a dozen processes (main, GPU, the studio renderer, one offscreen window per
 * widget capture, utilities). When memory climbs over a multi-hour stream,
 * the fix differs completely depending on WHICH process grew — so we label
 * every pid with the webContents it hosts and snapshot on an interval.
 *
 * Main's own `process.memoryUsage()` is included separately because its
 * external/arrayBuffers split is what distinguishes a V8-heap leak from
 * Buffer churn (SSE socket buffers, browser-source bitmaps).
 */

const SAMPLE_INTERVAL_MS = 5 * 60 * 1000
/** First sample lands quickly so every session records its baseline. */
const FIRST_SAMPLE_DELAY_MS = 30 * 1000
/** Rotate once the log passes ~10MB (≈2 weeks of 5-minute samples). */
const MAX_LOG_BYTES = 10 * 1024 * 1024

interface ProcessSample {
  pid: number
  type: string
  /** Electron service label, including named utility processes. */
  name?: string
  serviceName?: string
  /** MB, rounded. getAppMetrics reports KB. */
  workingSetMB: number
  peakWorkingSetMB: number
  privateMB?: number
  cpuPercent: number
  /** What this process hosts (URLs of its webContents), when resolvable. */
  hosts?: string[]
}

let sampleTimer: ReturnType<typeof setInterval> | null = null
let firstSampleTimer: ReturnType<typeof setTimeout> | null = null
let sessionStartedAt: string | null = null

export function startMemoryTelemetry(): void {
  if (sampleTimer || firstSampleTimer) return
  sessionStartedAt = new Date().toISOString()

  firstSampleTimer = setTimeout(() => {
    firstSampleTimer = null
    void captureSample()
    sampleTimer = setInterval(() => void captureSample(), SAMPLE_INTERVAL_MS)
  }, FIRST_SAMPLE_DELAY_MS)
}

export function stopMemoryTelemetry(): void {
  if (firstSampleTimer) {
    clearTimeout(firstSampleTimer)
    firstSampleTimer = null
  }
  if (sampleTimer) {
    clearInterval(sampleTimer)
    sampleTimer = null
  }
}

async function captureSample(): Promise<void> {
  try {
    const hostsByPid = mapWebContentsByPid()
    const processes: ProcessSample[] = app.getAppMetrics().map((metric) => {
      const hosts = hostsByPid.get(metric.pid)
      return {
        pid: metric.pid,
        type: metric.type,
        ...(metric.name ? { name: metric.name } : {}),
        ...(metric.serviceName ? { serviceName: metric.serviceName } : {}),
        workingSetMB: Math.round(metric.memory.workingSetSize / 1024),
        peakWorkingSetMB: Math.round(metric.memory.peakWorkingSetSize / 1024),
        ...(typeof metric.memory.privateBytes === 'number'
          ? { privateMB: Math.round(metric.memory.privateBytes / 1024) }
          : {}),
        cpuPercent: Math.round(metric.cpu.percentCPUUsage * 10) / 10,
        ...(hosts && hosts.length > 0 ? { hosts } : {})
      }
    })

    const mainUsage = process.memoryUsage()
    const sample = {
      v: 1,
      at: new Date().toISOString(),
      sessionStartedAt,
      totalWorkingSetMB: processes.reduce((sum, proc) => sum + proc.workingSetMB, 0),
      main: {
        rssMB: toMB(mainUsage.rss),
        heapUsedMB: toMB(mainUsage.heapUsed),
        heapTotalMB: toMB(mainUsage.heapTotal),
        externalMB: toMB(mainUsage.external),
        arrayBuffersMB: toMB(mainUsage.arrayBuffers)
      },
      processes
    }

    logSummary(sample.totalWorkingSetMB, processes)
    await appendSample(JSON.stringify(sample) + '\n')
  } catch (err) {
    console.warn('[memory] Telemetry sample failed:', err instanceof Error ? err.message : String(err))
  }
}

/**
 * Labels renderer pids with the page(s) they host so a growing process in the
 * log reads as "widget capture: /widget/likes-tracker" instead of a bare pid.
 */
function mapWebContentsByPid(): Map<number, string[]> {
  const hostsByPid = new Map<number, string[]>()
  for (const contents of webContents.getAllWebContents()) {
    try {
      if (contents.isDestroyed()) continue
      const pid = contents.getOSProcessId()
      const url = describeUrl(contents.getURL())
      if (!url) continue
      const hosts = hostsByPid.get(pid) || []
      if (!hosts.includes(url)) hosts.push(url)
      hostsByPid.set(pid, hosts)
    } catch {
      // Contents mid-teardown — skip the label, keep the sample.
    }
  }
  return hostsByPid
}

/** Query strings can carry tokens and only add noise — log origin + path. */
function describeUrl(raw: string): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    return `${url.protocol}//${url.host}${url.pathname}`
  } catch {
    return raw.slice(0, 120)
  }
}

function logSummary(totalMB: number, processes: ProcessSample[]): void {
  const top = [...processes]
    .sort((a, b) => b.workingSetMB - a.workingSetMB)
    .slice(0, 3)
    .map((proc) => {
      const host = proc.hosts?.[0] ? ` ${proc.hosts[0]}` : ''
      return `${proc.type}${host} ${proc.workingSetMB}MB`
    })
    .join(', ')
  console.log(`[memory] ${(totalMB / 1024).toFixed(2)}GB across ${processes.length} processes — top: ${top}`)
}

async function appendSample(line: string): Promise<void> {
  const dir = join(app.getPath('userData'), 'logs')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const file = join(dir, 'memory-telemetry.jsonl')

  try {
    const info = await stat(file)
    if (info.size > MAX_LOG_BYTES) {
      await rename(file, join(dir, 'memory-telemetry.jsonl.1'))
    }
  } catch {
    // File doesn't exist yet — nothing to rotate.
  }

  await appendFile(file, line, 'utf8')
}

function toMB(bytes: number): number {
  return Math.round(bytes / (1024 * 1024))
}
