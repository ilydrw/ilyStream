// Temporary UI-review capture (safe to delete): boots the app with an isolated
// userData profile, navigates to the Engine Preview page, waits for the native
// engine to stream frames, screenshots the window, then quits.
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

const OUT_PNG = process.env.CAPTURE_OUT || path.join(process.cwd(), 'engine-capture.png')
const LOG = process.env.CAPTURE_LOG || path.join(process.cwd(), 'engine-capture.log')
const dlog = (m) => { try { fs.appendFileSync(LOG, `[${Date.now()}] ${m}\n`) } catch {} }
try { fs.writeFileSync(LOG, '') } catch {}

// Unique per-run profile so a leftover instance (e.g. a launch-review that
// never exits) can't hold the single-instance lock and make us quit before
// creating a window.
app.setPath('userData', path.join(app.getPath('temp'), `ilystream-capture-${Date.now()}`))

process.on('uncaughtException', (e) => dlog('uncaughtException: ' + (e && e.stack || e)))
process.on('unhandledRejection', (e) => dlog('unhandledRejection: ' + (e && e.stack || e)))
app.whenReady().then(() => dlog('app ready')).catch((e) => dlog('whenReady err: ' + e))

dlog('importing main')
await import('./out/main/index.js')
dlog('main imported')

function waitForWindow(timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const poll = setInterval(() => {
      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
      if (win) { clearInterval(poll); resolve(win) }
      else if (Date.now() - started > timeoutMs) { clearInterval(poll); reject(new Error('No BrowserWindow appeared within timeout')) }
    }, 250)
  })
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  dlog('waiting for window')
  const win = await waitForWindow()
  dlog('window found')
  if (win.webContents.isLoading()) {
    await new Promise((resolve) => win.webContents.once('did-finish-load', resolve))
  }
  dlog('loaded; navigating')
  await sleep(3000)
  await win.webContents.executeJavaScript(`location.hash = '#/engine-preview'`)
  await sleep(6000)

  const info = await win.webContents.executeJavaScript(`(() => {
    const canvas = document.querySelector('canvas')
    const status = document.querySelector('.text-xs')
    let nonBlack = false
    if (canvas) { try {
      const d = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data
      for (let i=0;i<d.length;i+=4){ if (d[i]>20||d[i+1]>20||d[i+2]>20){ nonBlack=true; break } }
    } catch(e){} }
    return { hasCanvas: !!canvas, size: canvas?[canvas.width,canvas.height]:null, status: status?status.textContent:null, nonBlack }
  })()`)
  dlog('PREVIEW_INFO ' + JSON.stringify(info))

  const image = await win.webContents.capturePage()
  fs.writeFileSync(OUT_PNG, image.toPNG())
  dlog('CAPTURED ' + OUT_PNG)
} catch (err) {
  dlog('CAPTURE_FAILED ' + (err && err.message))
} finally {
  app.exit(0)
}
