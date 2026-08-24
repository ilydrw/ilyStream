import { app, dialog } from 'electron'
import { join, dirname } from 'path'
import { mkdirSync, appendFileSync, statSync, renameSync, rmSync } from 'fs'
import { redactString } from './logger'

// Cap the crash log so a hot-path throw can't grow it without bound — a real
// incident left a 1.5GB main-crash.log (one TikTok rejection repeated for hours),
// blocking the main thread on every synchronous append. At the cap we rotate to a
// single .old sibling, and identical consecutive errors are coalesced into one
// line plus a periodic "(repeated N times)" summary instead of thousands.
const CRASH_LOG_MAX_BYTES = 10 * 1024 * 1024
const CRASH_LOG_DEDUP_WINDOW_MS = 60_000

let lastCrashSignature: string | null = null
let suppressedRepeatCount = 0
let lastCrashWriteAt = 0

function rotateCrashLogIfOversized(crashLogPath: string): void {
  try {
    if (statSync(crashLogPath).size < CRASH_LOG_MAX_BYTES) return
  } catch {
    return // no file yet, or unreadable — nothing to rotate
  }
  const rotated = `${crashLogPath}.old`
  // renameSync onto an existing file throws on Windows, so clear the prior .old
  // first. Both steps are best-effort; a failure just means we append past the cap.
  try { rmSync(rotated, { force: true }) } catch { /* ignore */ }
  try { renameSync(crashLogPath, rotated) } catch { /* ignore */ }
}

export function formatError(error: unknown): string {
  if (error instanceof Error) return error.stack || `${error.name}: ${error.message}`
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function getCrashLogPath(): string | null {
  try {
    return join(app.getPath('userData'), 'logs', 'main-crash.log')
  } catch {
    return null
  }
}

export function writeCrashLog(label: string, error: unknown): void {
  const crashLogPath = getCrashLogPath()
  if (!crashLogPath) return
  try {
    mkdirSync(dirname(crashLogPath), { recursive: true })
    // Redact the formatted error before writing. formatError() may include
    // `error.stack` from a throw near a token (e.g. fetch in the orchestrator
    // hot path) and the crash log is not routed through the console.* pipeline
    // where the redactor normally runs.
    const body = redactString(formatError(error))
    const signature = `${label}\n${body}`
    const now = Date.now()

    // Coalesce identical consecutive errors: while the same error keeps arriving
    // inside the window, just count it. When a different error arrives (or the
    // window elapses), flush a one-line summary of what was suppressed first.
    if (signature === lastCrashSignature && now - lastCrashWriteAt < CRASH_LOG_DEDUP_WINDOW_MS) {
      suppressedRepeatCount += 1
      return
    }
    const suppressedNote =
      suppressedRepeatCount > 0
        ? `[${new Date(now).toISOString()}] (previous message repeated ${suppressedRepeatCount} more time${suppressedRepeatCount === 1 ? '' : 's'})\n\n`
        : ''
    lastCrashSignature = signature
    suppressedRepeatCount = 0
    lastCrashWriteAt = now

    rotateCrashLogIfOversized(crashLogPath)
    appendFileSync(
      crashLogPath,
      `${suppressedNote}[${new Date(now).toISOString()}] ${label}\n${body}\n\n`,
      'utf8'
    )
  } catch {
    /* best effort */
  }
}

export function reportFatalError(label: string, error: unknown, mainWindow: Electron.BrowserWindow | null, startupError: unknown): void {
  console.error(`[main] ${label}:`, error)
  writeCrashLog(label, error)
  if (mainWindow && !mainWindow.isDestroyed() && !startupError) return
  try {
    // Redact before surfacing to the user — the dialog box is shown verbatim
    // and a token in a stack trace would land on screen.
    dialog.showErrorBox('ilyStream startup error', `${label}\n\n${redactString(formatError(error))}`)
  } catch {
    /* best effort */
  }
}

export function buildStartupErrorHtml(error: unknown): string {
  const crashLogPath = getCrashLogPath()
  const details = escapeHtml(redactString(formatError(error)))
  const logLine = crashLogPath
    ? `<p>Crash log: <code>${escapeHtml(crashLogPath)}</code></p>`
    : ''

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>ilyStream startup error</title>
  <style>
    html, body { margin: 0; height: 100%; background: #0f1115; color: #f6f7fb; font-family: Inter, Segoe UI, sans-serif; }
    body { display: grid; place-items: center; padding: 32px; box-sizing: border-box; }
    main { width: min(760px, 100%); border: 1px solid rgba(255,255,255,.12); background: #151821; border-radius: 12px; padding: 28px; box-shadow: 0 24px 80px rgba(0,0,0,.35); }
    h1 { margin: 0 0 8px; font-size: 24px; }
    p { color: rgba(246,247,251,.72); line-height: 1.5; }
    pre { white-space: pre-wrap; word-break: break-word; background: rgba(0,0,0,.28); border: 1px solid rgba(255,255,255,.08); border-radius: 8px; padding: 16px; color: #ffb4b4; max-height: 320px; overflow: auto; }
    code { color: #7dd3fc; }
  </style>
</head>
<body>
  <main>
    <h1>ilyStream could not finish starting.</h1>
    <p>The main window opened, but a startup service failed before the app could attach its controls.</p>
    ${logLine}
    <pre>${details}</pre>
  </main>
</body>
</html>`
}
