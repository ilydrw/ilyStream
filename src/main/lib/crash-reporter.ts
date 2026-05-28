import { app, dialog } from 'electron'
import { join, dirname } from 'path'
import { mkdirSync, appendFileSync } from 'fs'

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
    appendFileSync(
      crashLogPath,
      `[${new Date().toISOString()}] ${label}\n${formatError(error)}\n\n`,
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
    dialog.showErrorBox('ilyStream startup error', `${label}\n\n${formatError(error)}`)
  } catch {
    /* best effort */
  }
}

export function buildStartupErrorHtml(error: unknown): string {
  const crashLogPath = getCrashLogPath()
  const details = escapeHtml(formatError(error))
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
