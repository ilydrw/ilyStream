// Temporary UI-review capture (safe to delete): boots the app with an isolated
// userData profile, navigates to the Voice FX page, captures a screenshot of
// the window, then quits.
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

const OUT_PNG = process.env.CAPTURE_OUT || path.join(process.cwd(), 'voicefx-capture.png')

app.setPath('userData', path.join(app.getPath('temp'), 'ilystream-ui-review-profile'))
await import('./out/main/index.js')

function waitForWindow(timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const poll = setInterval(() => {
      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
      if (win) {
        clearInterval(poll)
        resolve(win)
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(poll)
        reject(new Error('No BrowserWindow appeared within timeout'))
      }
    }, 250)
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  const win = await waitForWindow()
  if (win.webContents.isLoading()) {
    await new Promise((resolve) => win.webContents.once('did-finish-load', resolve))
  }
  await sleep(3000) // let the shell render
  await win.webContents.executeJavaScript(`location.hash = '#/voice-effects'`)
  await sleep(4000) // lazy chunk + page render
  const sliderInfo = await win.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('.voice-fx-slider input[type="range"]')
    if (!input) return { found: false }
    const style = getComputedStyle(input)
    return {
      found: true,
      className: input.className,
      appearance: style.webkitAppearance || style.appearance,
      height: style.height,
      background: style.background.slice(0, 80)
    }
  })()`)
  console.log('SLIDER_INFO ' + JSON.stringify(sliderInfo))
  const image = await win.webContents.capturePage()
  fs.writeFileSync(OUT_PNG, image.toPNG())
  console.log('CAPTURED ' + OUT_PNG)
} catch (err) {
  console.error('CAPTURE_FAILED ' + (err && err.message))
} finally {
  app.exit(0)
}
